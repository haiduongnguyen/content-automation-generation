import { resolveTextProvider } from "./providers/registry";
import { extractOutputText, type ResponsesPayload } from "./providers/text/openAiTextProvider";
import { validateGeneratedContentObject } from "./validation/generatedContent";

export type GeneratedContent = {
  title: string;
  body: string;
  cta: string;
  hashtags: string[];
};

export type GeneratedContentResult = {
  content: GeneratedContent;
  providerUsed: string;
  fallbackUsed: boolean;
  providerMetadata?: Record<string, unknown>;
};

export type TextPromptProfile = {
  id: "contrarian_insight" | "story_analogy" | "practical_playbook";
  name: string;
  angleInstruction: string;
  structureInstruction: string;
  avoidInstruction: string;
};

export const TEXT_PROMPT_PROFILES: TextPromptProfile[] = [
  {
    id: "contrarian_insight",
    name: "Phá hiểu lầm",
    angleInstruction:
      "Góc viết: bắt đầu bằng một hiểu lầm phổ biến hoặc một nghịch lý về chủ đề, sau đó lật lại để người đọc thấy bản chất sâu hơn.",
    structureInstruction:
      "Nhịp bài: hook có tension -> nêu hiểu lầm -> giải thích vì sao hiểu lầm đó hấp dẫn nhưng sai/thiếu -> ví dụ cụ thể -> liên hệ AI -> một câu insight đáng lưu.",
    avoidInstruction:
      "Tránh viết kiểu trung tính an toàn. Bài phải có chính kiến rõ, nhưng không cực đoan và không gây tranh cãi rẻ tiền.",
  },
  {
    id: "story_analogy",
    name: "Câu chuyện và ẩn dụ",
    angleInstruction:
      "Góc viết: dùng một câu chuyện nhỏ hoặc ẩn dụ đời thường thật cụ thể để kéo người đọc vào trước khi nói tới toán/AI.",
    structureInstruction:
      "Nhịp bài: cảnh đời thường -> chuyển sang ý toán/AI -> bóc tách từng lớp trực giác -> công thức nếu cần -> ứng dụng thực tế -> kết thúc bằng một hình ảnh dễ nhớ.",
    avoidInstruction:
      "Tránh ví dụ quá cũ như 'con mèo/cái bàn' nếu không thật cần. Ưu tiên bối cảnh Việt Nam: lớp học, quán cà phê, Shopee, TikTok, ngân hàng, giao thông, tuyển dụng.",
  },
  {
    id: "practical_playbook",
    name: "Ứng dụng thực chiến",
    angleInstruction:
      "Góc viết: đặt người đọc vào một bài toán thực tế rồi cho thấy ý tưởng toán/AI giúp ra quyết định tốt hơn như thế nào.",
    structureInstruction:
      "Nhịp bài: vấn đề thực tế -> nếu làm thủ công sẽ vướng gì -> ý tưởng toán đứng sau -> AI dùng nó ra sao -> ví dụ mini -> người đọc có thể áp dụng tư duy này ở đâu.",
    avoidInstruction:
      "Tránh chỉ kể khái niệm. Bài phải trả lời rõ 'nếu hiểu điều này thì tôi nhìn công việc/học tập/dữ liệu khác đi như thế nào?'.",
  },
];

function hashText(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function selectTextPromptProfile(seed: string): TextPromptProfile {
  return TEXT_PROMPT_PROFILES[hashText(seed) % TEXT_PROMPT_PROFILES.length] ?? TEXT_PROMPT_PROFILES[0]!;
}

export function buildPostTextOperationKey(jobId: number | string, topicName: string): string {
  return `post_text:job:${jobId}:${topicName}`;
}

export function buildTextGenerationPrompts(topicName: string): {
  systemPrompt: string;
  userPrompt: string;
};
export function buildTextGenerationPrompts(topicName: string, seed: string): {
  systemPrompt: string;
  userPrompt: string;
  profile: TextPromptProfile;
};
export function buildTextGenerationPrompts(topicName: string, seed?: string): {
  systemPrompt: string;
  userPrompt: string;
  profile: TextPromptProfile;
} {
  const profile = selectTextPromptProfile(seed || topicName);
  const systemPrompt = [
    "Bạn là người viết content giáo dục Toán, AI, Machine Learning và Data Science bằng tiếng Việt có dấu cho Facebook.",
    "Vai trò của bạn không phải là giảng bài, mà là biến một ý tưởng khô thành một bài viết khiến người đọc nghĩ: 'À, hóa ra cái này liên quan đến đời mình thật.'",
    "Đối tượng đọc: học sinh THPT, sinh viên kỹ thuật/công nghệ, người mới học AI/Data, người từng sợ toán nhưng tò mò AI hoạt động thế nào.",
    "Giọng viết: tự nhiên, sắc, có quan điểm, có chiều sâu, như một người hiểu sâu đang kể lại bằng ngôn ngữ đời thường.",
    "Không viết văn mẫu, không dùng giọng lecture notes, không sáo rỗng, không dùng câu kiểu 'trong thời đại 4.0'.",
    "Được phép dí dỏm nhẹ, nhưng không lố; được phép dùng câu ngắn để tạo nhịp; ưu tiên cảm giác người thật viết.",
    `PROMPT_PROFILE_ID: ${profile.id}.`,
    `PROMPT_PROFILE_NAME: ${profile.name}.`,
    profile.angleInstruction,
    profile.structureInstruction,
    profile.avoidInstruction,
    "Mỗi bài bắt buộc có: 1) hook có tension hoặc nghịch lý; 2) một hiểu lầm hoặc câu hỏi đáng nghĩ; 3) một ví dụ đời thường cụ thể; 4) giải thích trực quan trước, công thức sau nếu cần; 5) liên hệ rõ với AI/ML/Data; 6) một insight sâu hơn ở cuối; 7) CTA hỏi ý kiến thật.",
    "Mỗi bài chỉ tập trung một ý chính. Không cố dạy hết. Không liệt kê khô. Không nhồi thuật ngữ.",
    "Phải có ít nhất một câu đáng lưu lại: ngắn, sâu, dễ nhớ, không khẩu hiệu rỗng.",
    "Nếu có toán/công thức, chỉ dùng plain text. Ví dụ: f'(x) = 2x; sigmoid(x) = 1 / (1 + e^(-x)); w = w - lr * grad.",
    "Không dùng LaTeX, không markdown table, không bullet list dài. Paragraph ngắn, dễ đọc trên mobile.",
    "Độ dài mong muốn: 450-750 từ. Cắt bỏ đoạn nào chỉ đúng nhưng không làm bài hay hơn.",
    "IMPORTANT OUTPUT FORMAT:",
    "Return STRICT JSON only with keys: title, body, cta, hashtags.",
    "body phải là văn bản thuần để đăng Facebook, tiếng Việt có dấu đầy đủ.",
    "hashtags must be a JSON array of 3 to 7 short tags.",
    "No extra text outside JSON.",
  ].join(" ");

  const userPrompt = [
    `Topic: ${topicName}`,
    "Language: Vietnamese with full diacritics",
    "Platform: Facebook",
    "Depth: beginner-friendly but useful for engineering/AI intuition",
    "Hãy chọn góc tiếp cận sắc nhất cho topic này theo prompt profile đã được chỉ định.",
    "Ưu tiên bài viết khiến người đọc thấy một ý quen thuộc theo cách mới, không chỉ hiểu định nghĩa.",
  ].join("\n");

  return { systemPrompt, userPrompt, profile };
}

export function parseGeneratedContent(raw: string): GeneratedContent {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("Model output is not valid JSON.");
  }

  return validateGeneratedContentObject(parsed as Record<string, unknown>);
}

export async function generatePostContent(topicName: string, operationKey?: string): Promise<GeneratedContentResult> {
  const { systemPrompt, userPrompt, profile } = buildTextGenerationPrompts(topicName, operationKey ?? topicName);

  const provider = resolveTextProvider({
    isValidJsonText: (raw) => {
      try {
        parseGeneratedContent(raw);
        return true;
      } catch {
        return false;
      }
    },
  });
  const result = await provider.generate({
    topicName,
    systemPrompt,
    userPrompt,
    responseFormat: "json",
    operationKey,
    operationType: operationKey ? "post_text" : undefined,
    validateOutput: (raw) => {
      try {
        parseGeneratedContent(raw);
        return true;
      } catch {
        return false;
      }
    },
  });

  const generated: GeneratedContentResult = {
    content: parseGeneratedContent(result.output),
    providerUsed: result.provider,
    fallbackUsed: Boolean(result.metadata?.fallbackUsed),
    providerMetadata: { ...(result.metadata ?? {}), promptProfile: profile },
  };
  return generated;
}

export { extractOutputText };
export type { ResponsesPayload };

import { loadConfig } from "../../config/env";
import { createGeminiTextProvider } from "../providers/text/geminiTextProvider";
import type { ReelScriptInput, ReelScriptResult, ReelScriptScene } from "./reelScriptGenerator";

const EXPECTED_SCENES: Array<{ id: ReelScriptScene["id"]; targetSeconds: number }> = [
  { id: "hook", targetSeconds: 4 },
  { id: "insight", targetSeconds: 7 },
  { id: "cta", targetSeconds: 4 },
];

function cleanJson(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

export function countVietnameseWords(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

export function validateCaption(caption: string): string {
  const normalized = caption.trim().replace(/\r/g, "");
  const lines = normalized.split("\n");
  if (!normalized || lines.length > 2 || lines.some((line) => line.length > 26)) {
    throw new Error("Reel caption must contain 1-2 lines with at most 26 characters per line.");
  }
  return normalized;
}

export function hasVietnameseDiacritics(value: string): boolean {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/iu.test(value);
}

export function parseReelScript(raw: string, options: { shortened?: boolean } = {}): ReelScriptResult {
  const parsed = JSON.parse(cleanJson(raw)) as {
    title?: unknown;
    scenes?: Array<Record<string, unknown>>;
  };
  const title = String(parsed.title ?? "").trim();
  if (!title || !Array.isArray(parsed.scenes) || parsed.scenes.length !== EXPECTED_SCENES.length) {
    throw new Error("Reel script must contain a title and exactly three scenes.");
  }

  const scenes = EXPECTED_SCENES.map((expected, index): ReelScriptScene => {
    const source = parsed.scenes?.[index];
    if (!source || source.id !== expected.id || Number(source.target_seconds) !== expected.targetSeconds) {
      throw new Error(`Invalid Reel scene at index ${index}.`);
    }
    const narration = String(source.narration ?? "").trim();
    if (!narration) {
      throw new Error(`Reel scene ${expected.id} is missing narration.`);
    }
    return {
      id: expected.id,
      targetSeconds: expected.targetSeconds,
      narration,
      caption: validateCaption(String(source.caption ?? "")),
    };
  });

  const narration = scenes.map((scene) => scene.narration).join(" ");
  if (!hasVietnameseDiacritics(narration)) {
    throw new Error("Reel narration must use Vietnamese with accents for natural Vietnamese TTS.");
  }
  const wordCount = countVietnameseWords(narration);
  // Vietnamese word counting is not reliable enough to be the final timing gate.
  // Keep broad sanity bounds here; ffprobe-measured TTS duration decides whether
  // the script fits, and triggers the one allowed shortening pass when needed.
  const minWords = options.shortened ? 14 : 22;
  const maxWords = options.shortened ? 46 : 70;
  if (wordCount < minWords || wordCount > maxWords) {
    throw new Error(`Reel narration must contain ${minWords}-${maxWords} words; received ${wordCount}.`);
  }

  return {
    title,
    hook: scenes[0]!.narration,
    narration,
    callToAction: scenes[2]!.narration,
    scenes,
  };
}

function prompts(input: ReelScriptInput, shortened: boolean): { systemPrompt: string; userPrompt: string } {
  const wordRule = shortened
    ? "Tổng narration BẮT BUỘC 24-34 từ tiếng Việt, rút gọn mạnh để đọc trong dưới 14.5 giây."
    : "Tổng narration BẮT BUỘC 34-44 từ tiếng Việt để đọc trong dưới 14.5 giây.";
  return {
    systemPrompt: [
      "Bạn viết kịch bản Facebook Reel 15 giây bằng tiếng Việt có dấu từ một bài post giáo dục.",
      "BẮT BUỘC dùng tiếng Việt có dấu đầy đủ trong title, narration và caption để Google TTS đọc chuẩn giọng Việt.",
      "Mục tiêu: tạo hook, tóm tắt một insight chính và dẫn người xem sang bài viết đầy đủ.",
      "Trả STRICT JSON, không markdown, không text ngoài JSON.",
      "Shape: {\"title\":\"...\",\"scenes\":[{\"id\":\"hook\",\"target_seconds\":4,\"narration\":\"...\",\"caption\":\"...\"},{\"id\":\"insight\",\"target_seconds\":7,\"narration\":\"...\",\"caption\":\"...\"},{\"id\":\"cta\",\"target_seconds\":4,\"narration\":\"...\",\"caption\":\"...\"}]}",
      wordRule,
      "Caption viết HOA CÓ DẤU, tối đa 2 dòng; mỗi dòng tối đa 26 ký tự. Dùng ký tự xuống dòng \\n nếu cần.",
      "Không LaTeX, không markdown, không nhồi nhiều kiến thức.",
      "Hook là câu hỏi gây tò mò; insight là một ý dễ hiểu; CTA mời xem bài viết đầy đủ.",
    ].join(" "),
    userPrompt: [
      `Topic: ${input.topic}`,
      `Tiêu đề post: ${input.postTitle}`,
      `Nội dung post:\n${input.postBody}`,
      `Thời lượng mục tiêu: ${input.targetDurationSeconds} giây`,
    ].join("\n\n"),
  };
}

export async function generateReelScript(input: ReelScriptInput, shortened = false): Promise<ReelScriptResult> {
  const cfg = loadConfig();
  const model = process.env.REEL_SCRIPT_GEMINI_MODEL?.trim() || cfg.geminiModel;
  const provider = createGeminiTextProvider(cfg, model);
  const prompt = prompts(input, shortened);
  const first = await provider.generate({
    topicName: `reel_script:${input.topic}`,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    responseFormat: "json",
  });

  try {
    return parseReelScript(first.output, { shortened });
  } catch (err) {
    const validationError = err instanceof Error ? err.message : "Unknown Reel script validation error.";
    const repaired = await provider.generate({
      topicName: `reel_script_repair:${input.topic}`,
      systemPrompt: [
        prompt.systemPrompt,
        "Sửa JSON bên dưới để đạt đúng tất cả ràng buộc. Đặc biệt: narration và caption phải là tiếng Việt có dấu. Chỉ trả JSON đã sửa.",
      ].join(" "),
      userPrompt: [
        prompt.userPrompt,
        `Lỗi validation: ${validationError}`,
        `JSON cần sửa:\n${first.output}`,
      ].join("\n\n"),
      responseFormat: "json",
    });
    try {
      return parseReelScript(repaired.output, { shortened });
    } catch (repairErr) {
      const repairMessage = repairErr instanceof Error ? repairErr.message : "Unknown repair validation error.";
      throw new Error(`Gemini Reel script remained invalid after one repair: ${repairMessage}`);
    }
  }
}

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

export function buildTextGenerationPrompts(topicName: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = [
    "Ban la nguoi viet content giao duc ve Toan, AI, Machine Learning va Data Science danh cho Facebook.",
    "Doi tuong doc: hoc sinh THPT; sinh vien ky thuat/cong nghe; nguoi moi bat dau hoc AI/Data; nguoi tung so toan hoac thay toan qua kho.",
    "Muc tieu chinh: giup nguoi doc cam thay 'A hoa ra toan dung nhu the nay trong AI', khong phai hoc thuoc cong thuc.",
    "Ngon ngu: viet hoan toan bang tieng Viet; van phong gan gui, de hieu, tu nhien; giong nguoi di truoc dang giai thich cho nguoi moi.",
    "Rat quan trong: day la bai dang FACEBOOK, khong phai blog hay paper hoc thuat.",
    "Tuyet doi khong dung LaTeX, khong dung markdown table, khong viet cong thuc qua phuc tap.",
    "Cong thuc phai dang plain text de doc tren Facebook. Vi du duoc phep: f'(x) = 2x; sigmoid(x) = 1 / (1 + e^(-x)); w = w - lr * grad.",
    "Neu cong thuc phuc tap: giai thich bang loi, don gian hoa ky hieu, uu tien truc quan hon do chinh xac tuyet doi.",
    "Phong cach viet: doan ngan, de doc tren mobile, nhieu xuong dong, tranh block text dai, uu tien intuition truoc cong thuc sau.",
    "Luon tra loi cau hoi: 'Cai nay dung de lam gi trong AI?'.",
    "Flow noi dung bat buoc: 1) Hook gay to mo; 2) Giai thich truc quan; 3) Vi du don gian; 4) Lien he AI/ML thuc te; 5) Mot insight thu vi; 6) CTA hoi nguoi doc.",
    "Quy tac: moi bai chi tap trung 1 y chinh; khong nhoi qua nhieu kien thuc; khong day het; uu tien hieu ban chat.",
    "Khong nen: viet nhu lecture notes, qua dai, dump cong thuc, lam dung thuat ngu kho, giai thich lan man.",
    "Do dai mong muon: khoang 500-900 tu, toi da khoang 8500 ky tu, paragraph toi da 2-3 dong, toi uu retention Facebook.",
    "Muc tieu cuoi: nguoi doc de hieu hon, bot so toan, thay toan lien quan toi AI, muon luu bai hoac doc tiep.",
    "IMPORTANT OUTPUT FORMAT:",
    "Return STRICT JSON only with keys: title, body, cta, hashtags.",
    "body phai la van ban thuan de dang len Facebook (khong markdown table, khong LaTeX).",
    "hashtags must be a JSON array of 3 to 7 short tags.",
    "No extra text outside JSON.",
  ].join(" ");

  const userPrompt = [
    `Topic: ${topicName}`,
    "Language: Vietnamese",
    "Platform: Facebook",
    "Depth: beginner-friendly but useful for engineering/AI intuition",
  ].join("\n");

  return { systemPrompt, userPrompt };
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
  const { systemPrompt, userPrompt } = buildTextGenerationPrompts(topicName);

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
  };
  if (result.metadata) {
    generated.providerMetadata = result.metadata;
  }
  return generated;
}

export { extractOutputText };
export type { ResponsesPayload };

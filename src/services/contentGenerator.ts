import { loadConfig } from "../config/env";

export type GeneratedContent = {
  title: string;
  body: string;
  cta: string;
  hashtags: string[];
};

export type GeneratedContentResult = {
  content: GeneratedContent;
  providerUsed: "gemini" | "openai";
  fallbackUsed: boolean;
};

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type GeminiPayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

export function parseGeneratedContent(raw: string): GeneratedContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI output is not valid JSON.");
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.trim() === "") {
    throw new Error("OpenAI output missing valid title.");
  }
  if (typeof obj.body !== "string" || obj.body.trim() === "") {
    throw new Error("OpenAI output missing valid body.");
  }
  if (typeof obj.cta !== "string" || obj.cta.trim() === "") {
    throw new Error("OpenAI output missing valid cta.");
  }
  if (!Array.isArray(obj.hashtags) || obj.hashtags.length === 0) {
    throw new Error("OpenAI output missing valid hashtags array.");
  }

  const hashtags = obj.hashtags.map((h) => String(h).trim()).filter((h) => h.length > 0);
  if (hashtags.length === 0) {
    throw new Error("OpenAI output hashtags cannot be empty.");
  }

  return {
    title: obj.title.trim(),
    body: obj.body.trim(),
    cta: obj.cta.trim(),
    hashtags,
  };
}

function extractGeminiText(payload: GeminiPayload): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (typeof part.text === "string" && part.text.trim() !== "") {
      return part.text.trim();
    }
  }
  return "";
}

export function extractOutputText(payload: ResponsesPayload): string {
  if (payload.output_text && payload.output_text.trim() !== "") {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim() !== "") {
        parts.push(content.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

export async function generatePostContent(topicName: string): Promise<GeneratedContentResult> {
  const cfg = loadConfig();

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
    "Do dai mong muon: khoang 700-1200 tu, paragraph toi da 2-3 dong, toi uu retention Facebook.",
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

  if (cfg.geminiApiKey) {
    const geminiResp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": cfg.geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
        }),
      }
    );

    if (geminiResp.ok) {
      const geminiPayload = (await geminiResp.json()) as GeminiPayload;
      const geminiText = extractGeminiText(geminiPayload);
      if (geminiText !== "") {
        try {
          return {
            content: parseGeneratedContent(geminiText),
            providerUsed: "gemini",
            fallbackUsed: false,
          };
        } catch {
          // fallback to OpenAI below
        }
      }
    }
    // if Gemini fails or invalid output, fallback to OpenAI below
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: cfg.openAiModel,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      text: { format: { type: "text" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI request failed: HTTP ${response.status} ${errText}`);
  }

  const payload = (await response.json()) as ResponsesPayload;
  const outputText = extractOutputText(payload);
  if (outputText === "") {
    throw new Error("OpenAI response missing output text.");
  }

  return {
    content: parseGeneratedContent(outputText),
    providerUsed: "openai",
    fallbackUsed: Boolean(cfg.geminiApiKey),
  };
}

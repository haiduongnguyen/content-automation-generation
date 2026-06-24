import { loadConfig } from "../config/env";
import { resolveImageProvider } from "./providers/registry";

export type PostImageRole = "practical_example" | "formula_ai_application";

export type GeneratedImage = {
  role: PostImageRole;
  prompt: string;
  mimeType: string;
  b64Data: string;
};

export type ImageFailureMode = "fail_job" | "continue_text_only";

export function shouldContinueAfterImageFailure(mode: ImageFailureMode): boolean {
  return mode === "continue_text_only";
}

function hashDateSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function pickDailyImageRole(seedDate: string): PostImageRole {
  const roles: PostImageRole[] = ["practical_example", "formula_ai_application"];
  const idx = hashDateSeed(seedDate) % roles.length;
  return roles[idx] ?? "practical_example";
}

export function buildImagePrompt(params: {
  role: PostImageRole;
  topicName: string;
  postContent: string;
}): string {
  const base = [
    "Ban la visual content designer cho bai dang Facebook giao duc Toan/AI.",
    "Nhiem vu: tao 1 anh minh hoa bam sat noi dung bai viet ben duoi.",
    `Chu de: ${params.topicName}.`,
    `Loai anh: ${params.role}.`,
    "Toan bo bai viet Facebook:",
    params.postContent,
    "Muc tieu: anh phai bam sat y chinh, vi du, insight trong bai viet. Khong minh hoa chung chung.",
    "Phong cach bat buoc: nen be nhat (light beige), chu den, do tuong phan cao, minh hoa ro rang, bo cuc sach, toi uu mobile Facebook.",
    "Luat chu tren anh: chi dung chu ngan (toi da 8-12 tu moi cum), khong nhat doan van dai, khong LaTeX.",
    "Neu co cong thuc, chi plain text don gian (vd: y = wx + b, w = w - lr * grad).",
  ];

  if (params.role === "practical_example") {
    return [
      ...base,
      "Yeu cau rieng practical_example: uu tien canh thuc tien dung voi vi du trong bai viet.",
      "Bat buoc uu tien dung doan goi y truc quan/intuition neu bai viet co (vi du neuron nhu cong tac/van thong minh).",
      "Canh nen tap trung vao doi tuong mo ta va co che hoat dong, khong can nguoi neu khong can thiet.",
      "The hien ro 'toan dung de lam gi' trong tinh huong do.",
      "Output: anh vuong 1024x1024, ro net, chuyen nghiep.",
    ].join("\n");
  }

  return [
    ...base,
    "Yeu cau rieng formula_ai_application: tap trung vao cong thuc cot loi xuat hien trong bai viet.",
    "Khong dua nguoi vao anh, khong nhan vat, khong classroom scene.",
    "Dung visual kieu so do ky thuat: node, mui ten, khoi mo hinh, decision boundary.",
    "Chen 1-2 cong thuc don gian o dang plain text de tang tinh chuyen nghiep.",
    "The hien luong: cong thuc -> tinh toan -> ung dung AI/ML.",
    "Dung so do truc quan (mui ten, khoi, nhan ngan), tranh ky hieu nang.",
    "Output: anh vuong 1024x1024, ro net, chuyen nghiep.",
  ].join("\n");
}

export async function generatePostImages(params: {
  topicName: string;
  postContent: string;
  seedDate: string;
  operationKey?: string;
}): Promise<GeneratedImage[]> {
  const cfg = loadConfig();
  if (!cfg.imageGenerationEnabled) {
    return [];
  }

  const roles: PostImageRole[] = [pickDailyImageRole(params.seedDate)];
  const images: GeneratedImage[] = [];
  const provider = resolveImageProvider({ config: cfg });

  for (const role of roles) {
    const prompt = buildImagePrompt({ role, topicName: params.topicName, postContent: params.postContent });
    const result = await provider.generate({
      topicName: params.topicName,
      postContent: params.postContent,
      prompt,
      seedDate: params.seedDate,
      role,
      operationKey: params.operationKey,
      operationType: params.operationKey ? "post_image" : undefined,
    });
    images.push(...result.output);
  }

  return images;
}

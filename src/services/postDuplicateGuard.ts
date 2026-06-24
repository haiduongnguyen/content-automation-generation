export type ExistingPostForJob = {
  id: string;
  job_id: string;
  approval_status: string;
  title: string | null;
  body: string;
  cta: string | null;
  hashtags: unknown;
  provider_used: string | null;
  fallback_used: boolean;
  image_count: number | string;
  created_at: string;
};

export function shouldSkipGenerateForExistingPost(existingPost: ExistingPostForJob | null): boolean {
  return existingPost !== null && existingPost.approval_status !== "draft";
}

export function shouldResumeGenerateForExistingPost(existingPost: ExistingPostForJob | null): boolean {
  return existingPost?.approval_status === "draft";
}

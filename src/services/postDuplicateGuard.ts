export type ExistingPostForJob = {
  id: string;
  job_id: string;
  approval_status: string;
  created_at: string;
};

export function shouldSkipGenerateForExistingPost(existingPost: ExistingPostForJob | null): boolean {
  return existingPost !== null;
}

export function hashtagsToText(hashtags: unknown): string {
  if (!Array.isArray(hashtags)) return "";
  return hashtags.map((x) => String(x)).join(" ").trim();
}

function normalizeTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "";
  return `**${t.toUpperCase()}**`;
}

export function buildMessage(post: { title?: string | null; body: string; cta: string | null; hashtags: unknown }): string {
  const parts = [normalizeTitle(post.title), post.body, post.cta ?? "", hashtagsToText(post.hashtags)].filter(
    (x) => x && x.trim() !== ""
  );
  return parts.join("\n\n");
}


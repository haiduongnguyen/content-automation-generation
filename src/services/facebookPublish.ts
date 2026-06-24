export type AttachedMediaItem = { media_fbid: string };

export function shouldPublishToFacebook(publishEnabled: boolean): boolean {
  return publishEnabled;
}

export function buildAttachedMediaPayload(mediaFbIds: string[]): Record<string, string> {
  const payload: Record<string, string> = {};
  mediaFbIds.forEach((id, index) => {
    payload[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id } as AttachedMediaItem);
  });
  return payload;
}

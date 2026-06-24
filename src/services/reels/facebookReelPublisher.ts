import fs from "node:fs/promises";

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type StartUploadPayload = GraphError & {
  video_id?: string;
  upload_url?: string;
};

function graphError(step: string, status: number, payload: GraphError): Error {
  const detail = payload.error?.message || `HTTP ${status}`;
  return new Error(`${step} failed: ${detail}`);
}

async function jsonResponse<T extends GraphError>(response: Response, step: string): Promise<T> {
  const payload = (await response.json()) as T;
  if (!response.ok || payload.error) throw graphError(step, response.status, payload);
  return payload;
}

export type FacebookReelPublishResult = {
  videoId: string;
  permalink: string | null;
  startResponse: unknown;
  uploadResponse: unknown;
  finishResponse: unknown;
  statusResponse: unknown;
};

type ReelStatusPayload = GraphError & {
  permalink_url?: string;
  status?: {
    video_status?: string;
    processing_phase?: { status?: string; errors?: unknown[] };
    publishing_phase?: { status?: string; errors?: unknown[] };
    copyright_check_status?: { status?: string };
  };
};

async function waitForPublished(params: {
  graphVersion: string;
  videoId: string;
  accessToken: string;
}): Promise<ReelStatusPayload> {
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    const statusUrl = new URL(`https://graph.facebook.com/${params.graphVersion}/${params.videoId}`);
    statusUrl.searchParams.set("fields", "status,permalink_url");
    statusUrl.searchParams.set("access_token", params.accessToken);
    const response = await fetch(statusUrl);
    const payload = await jsonResponse<ReelStatusPayload>(response, "Read Facebook Reel status");
    const processing = payload.status?.processing_phase?.status;
    const publishing = payload.status?.publishing_phase?.status;
    if (publishing === "complete") return payload;
    if (payload.status?.video_status === "error" || processing === "error" || publishing === "error") {
      throw new Error(`Facebook Reel processing failed: ${JSON.stringify(payload.status)}`);
    }
    if (attempt < 36) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Facebook Reel was accepted but did not finish publishing within 3 minutes.");
}

export async function publishFacebookReel(params: {
  graphVersion: string;
  pageId: string;
  accessToken: string;
  videoPath: string;
  description: string;
  title?: string;
}): Promise<FacebookReelPublishResult> {
  const startUrl = `https://graph.facebook.com/${params.graphVersion}/${params.pageId}/video_reels`;
  const startResponse = await fetch(startUrl, {
    method: "POST",
    body: new URLSearchParams({
      upload_phase: "start",
      access_token: params.accessToken,
    }),
  });
  const start = await jsonResponse<StartUploadPayload>(startResponse, "Start Facebook Reel upload");
  if (!start.video_id || !start.upload_url) {
    throw new Error("Start Facebook Reel upload did not return video_id and upload_url.");
  }

  const video = await fs.readFile(params.videoPath);
  const uploadResponse = await fetch(start.upload_url, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${params.accessToken}`,
      offset: "0",
      file_size: String(video.byteLength),
      "Content-Type": "application/octet-stream",
    },
    body: video,
  });
  const uploaded = await jsonResponse<GraphError & Record<string, unknown>>(uploadResponse, "Upload Facebook Reel binary");

  const finishResponse = await fetch(startUrl, {
    method: "POST",
    body: new URLSearchParams({
      upload_phase: "finish",
      video_id: start.video_id,
      video_state: "PUBLISHED",
      description: params.description,
      ...(params.title ? { title: params.title } : {}),
      access_token: params.accessToken,
    }),
  });
  const finished = await jsonResponse<GraphError & Record<string, unknown>>(finishResponse, "Finish Facebook Reel publish");

  const status = await waitForPublished({
    graphVersion: params.graphVersion,
    videoId: start.video_id,
    accessToken: params.accessToken,
  });

  return {
    videoId: start.video_id,
    permalink: status.permalink_url || null,
    startResponse: start,
    uploadResponse: uploaded,
    finishResponse: finished,
    statusResponse: status,
  };
}

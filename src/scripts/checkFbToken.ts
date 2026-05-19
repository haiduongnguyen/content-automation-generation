import { loadConfig } from "../config/env";
import { computeTokenHealth } from "../services/fbTokenHealth";

type DebugTokenPayload = {
  data?: {
    app_id?: string;
    type?: string;
    application?: string;
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    user_id?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

async function run(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.fbAppId || !cfg.fbAppSecret) {
    throw new Error("Missing FB_APP_ID or FB_APP_SECRET in .env");
  }
  if (!cfg.fbPageAccessToken) {
    throw new Error("Missing FB_PAGE_ACCESS_TOKEN in .env");
  }

  const appAccessToken = `${cfg.fbAppId}|${cfg.fbAppSecret}`;
  const url = `https://graph.facebook.com/${cfg.fbGraphVersion}/debug_token?input_token=${encodeURIComponent(
    cfg.fbPageAccessToken
  )}&access_token=${encodeURIComponent(appAccessToken)}`;

  const response = await fetch(url, { method: "GET" });
  const payload = (await response.json()) as DebugTokenPayload;
  if (!response.ok || payload.error) {
    throw new Error(
      `debug_token failed: HTTP ${response.status} ${payload.error?.message || JSON.stringify(payload)}`
    );
  }

  const isValid = payload.data?.is_valid === true;
  const expiresAt = typeof payload.data?.expires_at === "number" ? payload.data.expires_at : null;
  const health = computeTokenHealth(isValid, expiresAt);

  console.log(
    JSON.stringify(
      {
        is_valid: health.isValid,
        expires_at: health.expiresAt,
        expires_at_iso: health.expiresAtIso,
        days_left: health.daysLeft,
        seconds_left: health.secondsLeft,
        app_id: payload.data?.app_id || null,
        application: payload.data?.application || null,
        type: payload.data?.type || null,
        scopes: payload.data?.scopes || [],
      },
      null,
      2
    )
  );

  if (!health.isValid) {
    process.exitCode = 2;
    return;
  }
  if (health.daysLeft !== null && health.daysLeft < 7) {
    process.exitCode = 3;
  }
}

run().catch((err) => {
  console.error("check:fb-token failed", err);
  process.exitCode = 1;
});


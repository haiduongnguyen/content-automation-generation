import http, { type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { loadConfig } from "../config/env";
import { getPipelineJobDetails, listPipelineJobs, retryPipelineJobById } from "../services/operations/jobs";
import { getOperationalHealthSummary } from "../services/operations/health";
import { approvePost, listReviewPosts } from "../services/operations/posts";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, body: string): string {
  const cfg = loadConfig();
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #1f2933; }
    nav a { margin-right: 12px; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border-bottom: 1px solid #d9e2ec; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f0f4f8; }
    code, pre { background: #f0f4f8; padding: 2px 4px; border-radius: 4px; }
    .safe { color: ${cfg.publishEnabled ? "#b42318" : "#067647"}; font-weight: 700; }
    button { padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body>
  <nav>
    <a href="/">Jobs</a>
    <a href="/posts/review">Review Posts</a>
    <a href="/health/summary">Health Summary</a>
    <span class="safe">PUBLISH_ENABLED=${escapeHtml(String(cfg.publishEnabled))}</span>
  </nav>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

export function isAdminAuthEnabled(): boolean {
  const raw = process.env.ADMIN_AUTH_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getAdminToken(): string {
  return process.env.ADMIN_TOKEN?.trim() || "";
}

function tokenMatches(candidate: string, expected: string): boolean {
  if (!candidate || !expected) {
    return false;
  }
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (cookieHeader ?? "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      continue;
    }
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
  }
  return cookies;
}

export function isAdminRequestAuthorized(req: Pick<IncomingMessage, "headers">): boolean {
  if (!isAdminAuthEnabled()) {
    return true;
  }
  const expected = getAdminToken();
  const auth = req.headers.authorization ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice("bearer ".length).trim() : "";
  if (tokenMatches(bearer, expected)) {
    return true;
  }
  const cookies = parseCookies(Array.isArray(req.headers.cookie) ? req.headers.cookie.join(";") : req.headers.cookie);
  return tokenMatches(cookies.admin_token ?? "", expected);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { Location: location });
  res.end();
}

function loginPage(message = ""): string {
  return layout(
    "Admin Login",
    `${message ? `<p>${escapeHtml(message)}</p>` : ""}
    <form method="post" action="/login">
      <label>Admin token <input type="password" name="token" autofocus></label>
      <button type="submit">Login</button>
    </form>`
  );
}

function sendUnauthorized(res: ServerResponse): void {
  sendHtml(res, 401, loginPage("Admin token required."));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function jobsIndex(): Promise<string> {
  const jobs = await listPipelineJobs(50);
  const rows = jobs
    .map(
      (job) => `<tr>
        <td><a href="/jobs/${escapeHtml(job.id)}">${escapeHtml(job.id)}</a></td>
        <td>${escapeHtml(job.job_type)}</td>
        <td>${escapeHtml(job.run_date)}</td>
        <td>${escapeHtml(job.scheduled_slot)}</td>
        <td>${escapeHtml(job.status)}</td>
        <td>${escapeHtml(`${job.attempt_count}/${job.max_attempts}`)}</td>
        <td>${escapeHtml(job.updated_at)}</td>
      </tr>`
    )
    .join("");
  return layout(
    "Pipeline Jobs",
    `<table><thead><tr><th>ID</th><th>Type</th><th>Run Date</th><th>Slot</th><th>Status</th><th>Attempts</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

async function jobDetail(jobId: number): Promise<string> {
  const details = await getPipelineJobDetails(jobId);
  if (!details) {
    return layout("Job Not Found", `<p>Job ${escapeHtml(jobId)} not found.</p>`);
  }
  const eventRows = details.events
    .map(
      (event) => `<tr>
        <td>${escapeHtml(event.created_at)}</td>
        <td>${escapeHtml(event.event_type)}</td>
        <td>${escapeHtml(event.message)}</td>
      </tr>`
    )
    .join("");
  const postRows = details.posts
    .map(
      (post) => `<tr>
        <td>${escapeHtml(post.id)}</td>
        <td>${escapeHtml(post.title)}</td>
        <td>${escapeHtml(post.approval_status)}</td>
      </tr>`
    )
    .join("");
  const retryButton =
    details.job.status === "failed"
      ? `<form method="post" action="/jobs/${escapeHtml(jobId)}/retry"><button type="submit">Retry job</button></form>`
      : "";
  return layout(
    `Job ${jobId}`,
    `${retryButton}<pre>${escapeHtml(JSON.stringify(details.job, null, 2))}</pre>
    <h2>Events</h2>
    <table><thead><tr><th>Created</th><th>Type</th><th>Message</th></tr></thead><tbody>${eventRows}</tbody></table>
    <h2>Posts</h2>
    <table><thead><tr><th>ID</th><th>Title</th><th>Approval</th></tr></thead><tbody>${postRows}</tbody></table>`
  );
}

async function reviewPosts(): Promise<string> {
  const posts = await listReviewPosts(50);
  const rows = posts
    .map(
      (post) => `<tr>
        <td>${escapeHtml(post.id)}</td>
        <td>${escapeHtml(post.run_date)}</td>
        <td>${escapeHtml(post.scheduled_slot)}</td>
        <td>${escapeHtml(post.title)}</td>
        <td>${escapeHtml(post.provider_used)}</td>
        <td>${escapeHtml(post.image_count)}</td>
        <td><form method="post" action="/posts/${escapeHtml(post.id)}/approve"><button type="submit">Approve</button></form></td>
      </tr>`
    )
    .join("");
  return layout(
    "Review Posts",
    `<table><thead><tr><th>ID</th><th>Run Date</th><th>Slot</th><th>Title</th><th>Provider</th><th>Images</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

export function createAdminApp(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (isAdminAuthEnabled() && !getAdminToken()) {
        sendHtml(res, 500, layout("Admin Auth Misconfigured", "<p>ADMIN_AUTH_ENABLED=true but ADMIN_TOKEN is empty.</p>"));
        return;
      }
      if (isAdminAuthEnabled() && req.method === "GET" && url.pathname === "/login") {
        sendHtml(res, 200, loginPage());
        return;
      }
      if (isAdminAuthEnabled() && req.method === "POST" && url.pathname === "/login") {
        const body = new URLSearchParams(await readBody(req));
        const token = body.get("token") ?? "";
        if (!tokenMatches(token, getAdminToken())) {
          sendUnauthorized(res);
          return;
        }
        res.writeHead(303, {
          Location: "/",
          "Set-Cookie": `admin_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`,
        });
        res.end();
        return;
      }
      if (!isAdminRequestAuthorized(req)) {
        sendUnauthorized(res);
        return;
      }
      if (req.method === "GET" && url.pathname === "/") {
        sendHtml(res, 200, await jobsIndex());
        return;
      }
      if (req.method === "GET" && url.pathname === "/health/summary") {
        const summary = await getOperationalHealthSummary();
        sendHtml(res, 200, layout("Health Summary", `<pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre>`));
        return;
      }
      const jobMatch = url.pathname.match(/^\/jobs\/(\d+)$/);
      if (req.method === "GET" && jobMatch?.[1]) {
        sendHtml(res, 200, await jobDetail(Number(jobMatch[1])));
        return;
      }
      const retryMatch = url.pathname.match(/^\/jobs\/(\d+)\/retry$/);
      if (req.method === "POST" && retryMatch?.[1]) {
        await readBody(req);
        await retryPipelineJobById(Number(retryMatch[1]));
        redirect(res, `/jobs/${retryMatch[1]}`);
        return;
      }
      if (req.method === "GET" && url.pathname === "/posts/review") {
        sendHtml(res, 200, await reviewPosts());
        return;
      }
      const approveMatch = url.pathname.match(/^\/posts\/(\d+)\/approve$/);
      if (req.method === "POST" && approveMatch?.[1]) {
        await readBody(req);
        await approvePost(Number(approveMatch[1]));
        redirect(res, "/posts/review");
        return;
      }
      sendHtml(res, 404, layout("Not Found", "<p>Route not found.</p>"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown admin error";
      sendHtml(res, 500, layout("Error", `<pre>${escapeHtml(message)}</pre>`));
    }
  });
}

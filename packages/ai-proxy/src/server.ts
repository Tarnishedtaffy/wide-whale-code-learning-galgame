import crypto from "node:crypto";
import http from "node:http";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@mnk/shared";

export interface UpstreamChannel {
  id: "zhipu" | "relay";
  name: string;
  url: string;
  key: string;
  model: string;
}

export interface AiProxyOptions {
  channels: UpstreamChannel[];
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxTokensCap?: number;
  rateLimitRpm?: number;
  clientAccessToken?: string;
  allowedModels?: string[];
  allowedOrigins?: string[];
  fetchImpl?: typeof fetch;
  logger?: (line: string) => void;
}

const DEFAULT_TAURI_ORIGINS = [
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];

export function buildChannelsFromEnv(env: NodeJS.ProcessEnv = process.env): UpstreamChannel[] {
  const channels: UpstreamChannel[] = [];
  if (env.ZHIPU_KEY && env.ZHIPU_KEY.trim()) {
    channels.push({
      id: "zhipu",
      name: "智谱",
      url: (env.ZHIPU_URL || "https://open.bigmodel.cn/api/paas/v4/chat/completions").trim(),
      key: env.ZHIPU_KEY.trim(),
      model: (env.ZHIPU_MODEL || "glm-4.7-flash").trim(),
    });
  }
  if (env.RELAY_KEY && env.RELAY_KEY.trim() && env.RELAY_URL && env.RELAY_URL.trim()) {
    const base = env.RELAY_URL.trim().replace(/\/+$/, "");
    channels.push({
      id: "relay",
      name: "中转",
      url: base.endsWith("/v1/chat/completions") ? base : `${base}/v1/chat/completions`,
      key: env.RELAY_KEY.trim(),
      model: (env.RELAY_MODEL || "gemini-3.8-flash-high").trim(),
    });
  }
  return channels;
}

function timingSafeTokenMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createAiProxyServer(opts: AiProxyOptions): http.Server {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const maxBodyBytes = opts.maxBodyBytes ?? 256 * 1024;
  const maxTokensCap = opts.maxTokensCap ?? 2048;
  const rateLimitRpm = opts.rateLimitRpm ?? 24;
  const clientToken = (opts.clientAccessToken || "").trim();
  const modelAllowSet = new Set(
    (opts.allowedModels ?? []).map((m) => m.trim()).filter(Boolean)
  );
  const fetchFn = opts.fetchImpl ?? fetch;
  const log = opts.logger ?? ((msg: string) => console.log(msg));

  const ipBuckets = new Map<string, number[]>();

  function checkRateLimit(ip: string): boolean {
    if (rateLimitRpm <= 0) return true;
    const now = Date.now();
    const cutoff = now - 60_000;
    const prev = ipBuckets.get(ip) ?? [];
    const recent = prev.filter((ts) => ts > cutoff);
    if (recent.length >= rateLimitRpm) {
      ipBuckets.set(ip, recent);
      return false;
    }
    recent.push(now);
    ipBuckets.set(ip, recent);
    if (ipBuckets.size > 2048) {
      for (const [k, list] of ipBuckets.entries()) {
        if (list.every((ts) => ts <= cutoff)) ipBuckets.delete(k);
      }
    }
    return true;
  }

  const allowSet = new Set<string>([
    ...DEFAULT_TAURI_ORIGINS,
    ...(opts.allowedOrigins ?? []).map((o) => o.trim()).filter(Boolean),
  ]);

  function applyCorsHeaders(origin: string | undefined, res: http.ServerResponse): boolean {
    if (!origin) {
      return true;
    }
    if (!allowSet.has(origin)) {
      return false;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    return true;
  }

  async function invokeChannel(
    ch: UpstreamChannel,
    payload: ChatCompletionRequest
  ): Promise<
    | { ok: true; stream: false; content: string }
    | { ok: true; stream: true; body: ReadableStream<Uint8Array> }
    | { ok: false; status: number }
  > {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const wantStream = Boolean(payload.stream);
    try {
      const upstreamRes = await fetchFn(ch.url, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: wantStream ? "text/event-stream, application/json" : "application/json",
          Authorization: `Bearer ${ch.key}`,
        },
        body: JSON.stringify({
          messages: payload.messages,
          model: ch.model,
          stream: wantStream,
          max_tokens: Math.min(Math.max(Number(payload.max_tokens) || 1024, 1), maxTokensCap),
          temperature:
            typeof payload.temperature === "number"
              ? Math.min(Math.max(payload.temperature, 0), 2)
              : 0.7,
        }),
      });
      if (!upstreamRes.ok) {
        return { ok: false, status: upstreamRes.status };
      }
      const ctype = (upstreamRes.headers.get("content-type") || "").toLowerCase();
      if (wantStream && upstreamRes.body && ctype.includes("text/event-stream")) {
        clearTimeout(timer);
        return { ok: true, stream: true, body: upstreamRes.body };
      }
      const rawText = await upstreamRes.text();
      const parsed = JSON.parse(rawText) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = String(parsed?.choices?.[0]?.message?.content ?? "").trim();
      if (!content) {
        return { ok: false, status: 502 };
      }
      return { ok: true, stream: false, content };
    } catch {
      return { ok: false, status: 504 };
    } finally {
      if (!wantStream) clearTimeout(timer);
    }
  }

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!applyCorsHeaders(origin, res)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "origin not allowed" } }));
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let urlPath = "/";
    try {
      const rawUrl = req.url || "/";
      urlPath = decodeURIComponent(rawUrl.split("?")[0] || "/");
      if (urlPath.includes("\0")) throw new Error("invalid path");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "bad url" } }));
      return;
    }

    if (urlPath === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          channels: opts.channels.map((c) => c.id),
          authRequired: Boolean(clientToken),
        })
      );
      return;
    }

    if (urlPath !== "/v1/chat/completions") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST, OPTIONS", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "method not allowed" } }));
      return;
    }

    if (clientToken) {
      const authHeader = String(req.headers.authorization || "");
      const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!provided || !timingSafeTokenMatch(provided, clientToken)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "unauthorized client token" } }));
        return;
      }
    }

    const clientIp = req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rate limit exceeded, please slow down" } }));
      return;
    }

    if (!opts.channels.length) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "no upstream channels configured" } }));
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    try {
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > maxBodyBytes) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "payload too large" } }));
          return;
        }
        chunks.push(buf);
      }
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "stream error" } }));
      return;
    }

    let payload: ChatCompletionRequest;
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Array.isArray(parsed.messages) ||
        parsed.messages.length === 0 ||
        parsed.messages.length > 24 ||
        parsed.messages.some(
          (m: unknown) =>
            !m ||
            typeof m !== "object" ||
            typeof (m as { role?: unknown }).role !== "string" ||
            (typeof (m as { content?: unknown }).content !== "string" &&
              !Array.isArray((m as { content?: unknown }).content))
        )
      ) {
        throw new Error("invalid request schema");
      }
      payload = parsed as ChatCompletionRequest;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid chat request payload" } }));
      return;
    }

    if (modelAllowSet.size > 0 && payload.model && !modelAllowSet.has(payload.model.trim())) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "requested model is not allowed" } }));
      return;
    }

    log(`[ai-proxy] incoming request (${payload.messages.length} msgs, stream=${Boolean(payload.stream)})`);

    let lastStatus = 502;
    for (const ch of opts.channels) {
      const out = await invokeChannel(ch, payload);
      if (out.ok) {
        if (out.stream) {
          log(`[ai-proxy] channel=${ch.id} streaming sse`);
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          const reader = out.body.getReader();
          try {
            while (true) {
              const step = await reader.read();
              if (step.done) break;
              res.write(Buffer.from(step.value));
            }
          } catch {
            // client disconnected or upstream closed
          } finally {
            res.end();
          }
          return;
        }
        log(`[ai-proxy] channel=${ch.id} ok (${out.content.length} chars)`);
        const respBody: ChatCompletionResponse = {
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: out.content },
              finish_reason: "stop",
            },
          ],
          provider: ch.id,
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(respBody));
        return;
      }
      log(`[ai-proxy] channel=${ch.id} failed status=${out.status}`);
      lastStatus = out.status || 502;
    }

    res.writeHead(lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify({ error: { message: "all upstream channels failed" } }));
  });
}

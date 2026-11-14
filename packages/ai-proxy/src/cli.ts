#!/usr/bin/env node
import { buildChannelsFromEnv, createAiProxyServer } from "./server.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const channels = buildChannelsFromEnv(process.env);
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedModels = (process.env.ALLOWED_MODELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const clientAccessToken = (process.env.PROXY_ACCESS_TOKEN || "").trim();
const rateLimitRpm = Number(process.env.RATE_LIMIT_RPM || 24);
const maxTokensCap = Number(process.env.MAX_TOKENS_CAP || 2048);

if (!channels.length) {
  console.warn(
    "[ai-proxy] 警告：未检测到 ZHIPU_KEY 或 RELAY_KEY/RELAY_URL，/v1/chat/completions 将返回 503，前端将自动回退本地规则回答。"
  );
}

const server = createAiProxyServer({
  channels,
  allowedOrigins: extraOrigins,
  allowedModels,
  clientAccessToken,
  rateLimitRpm,
  maxTokensCap,
});

server.listen(port, host, () => {
  console.log(`[ai-proxy] listening on http://${host}:${port}`);
  console.log(`[ai-proxy] active channels: ${channels.map((c) => c.name).join(" -> ") || "none"}`);
  console.log(
    `[ai-proxy] security: clientToken=${clientAccessToken ? "enabled" : "off"}, rateLimit=${rateLimitRpm}/min`
  );
});

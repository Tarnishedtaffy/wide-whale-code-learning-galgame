#!/usr/bin/env node
/*
 * 本机演示代理：静态托管 study-loop + 把 /v1/chat/completions 转发到真实模型。
 *
 * 为什么需要它：浏览器直连上游必须带 key，而 key 一旦进入前端就等于公开。
 * 这个脚本让 key 只存在于你的终端环境变量里，页面仍然只调同源 /v1。
 *
 * 用法：
 *   export ZHIPU_KEY='你的智谱key'
 *   export RELAY_KEY='你的中转key'; export RELAY_URL='http://你的中转:3000'   # 可选，主渠道失败时备用
 *   node deploy/local-demo-proxy.mjs
 *   浏览器打开 http://127.0.0.1:8787/
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 8787);
const ROOT = fs.realpathSync(path.resolve(process.env.ROOT || path.join(process.cwd(), "study-loop")));
const TIMEOUT = 20000;

// 渠道按顺序尝试，先主后备。key 只从环境变量读取，不写入任何文件。
const channels = [];
if (process.env.ZHIPU_KEY) {
  channels.push({
    name: "智谱",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    key: process.env.ZHIPU_KEY,
    model: process.env.ZHIPU_MODEL || "glm-4.7-flash",
  });
}
if (process.env.RELAY_KEY && process.env.RELAY_URL) {
  channels.push({
    name: "中转",
    url: process.env.RELAY_URL.replace(/\/+$/, "") + "/v1/chat/completions",
    key: process.env.RELAY_KEY,
    model: process.env.RELAY_MODEL || "gemini-3.8-flash-high",
  });
}
if (!channels.length) {
  console.error("未找到密钥。请先设置 ZHIPU_KEY（和可选的 RELAY_KEY/RELAY_URL）再运行。");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".css": "text/css",
};

async function callChannel(ch, body) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(ch.url, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ch.key}`,
      },
      body: JSON.stringify({ ...body, model: ch.model }),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, detail: text.slice(0, 200) };
    const j = JSON.parse(text);
    const content = j?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, status: 502, detail: "响应无 content" };
    return { ok: true, content };
  } catch (e) {
    return { ok: false, status: 0, detail: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

http
  .createServer(async (req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath.includes("\0")) throw new Error("invalid path");
    } catch {
      res.writeHead(400).end("bad path");
      return;
    }
    if (urlPath === "/v1" || urlPath.startsWith("/v1/")) {
      if (urlPath !== "/v1/chat/completions") {
        res.writeHead(404).end("not found");
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" }).end("method not allowed");
        return;
      }
      const chunks = [];
      let body;
      try {
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > 65536) {
            res.writeHead(413).end("request too large");
            return;
          }
          chunks.push(c);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("bad body");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" }).end('{"error":"bad json"}');
        return;
      }
      console.log("[proxy] 收到前端请求");

      let lastErr = null;
      for (const ch of channels) {
        const r = await callChannel(ch, body);
        if (r.ok) {
          console.log(`[proxy] ${ch.name} 成功，${r.content.length} 字`);
          res.writeHead(200, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              object: "chat.completion",
              model: body.model || "mnk-chat",
              choices: [{ index: 0, message: { role: "assistant", content: r.content }, finish_reason: "stop" }],
            })
          );
          return;
        }
        console.log(`[proxy] ${ch.name} 失败 status=${r.status}`);
        lastErr = r;
      }
      res.writeHead(lastErr?.status || 502, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: { message: "all channels failed" } })
      );
      return;
    }

    const file = urlPath === "/" ? "/index.html" : urlPath;
    let full;
    try {
      full = fs.realpathSync(path.join(ROOT, file));
      const relative = path.relative(ROOT, full);
      if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) ||
          !fs.statSync(full).isFile()) throw new Error("outside root");
    } catch {
      res.writeHead(404).end("not found");
      return;
    }
    if (full === path.join(ROOT, "index.html")) {
      const html = fs.readFileSync(full, "utf8").replace('mode: "local",', 'mode: "proxy",');
      res.writeHead(200, { "Content-Type": MIME[".html"] }).end(html);
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    fs.createReadStream(full).on("error", () => res.destroy()).pipe(res);
  })
  .listen(PORT, process.env.HOST || "127.0.0.1", () => {
    console.log(`演示代理已启动：http://${process.env.HOST || "127.0.0.1"}:${PORT}/`);
    console.log(`静态目录：${ROOT}`);
    console.log(`渠道：${channels.map((c) => c.name).join(" → ")}`);
  });

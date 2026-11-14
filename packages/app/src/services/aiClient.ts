import { reactive } from "vue";
import { listen } from "@tauri-apps/api/event";
import {
  AI_CFG_DEFAULTS,
  AI_KEY_MASK,
  createDefaultAiConfig,
  isMaskedAiKey,
  resolveAiAudioEndpoint,
  resolveAiChatEndpoint,
  type AiAvatarItem,
  type AiChatMessage,
  type AiMode,
  type AiRuntimeConfig,
  type AiStreamEventPayload,
  type ChatMessage,
} from "@mnk/shared";
import { backendClient, blobToBase64, isTauriRuntime } from "./backendClient";
import { webFallbackGateway } from "./webFallback";

export const DEFAULT_CHAT_SYSTEM_PROMPT =
  "你是学习应用 Mnk Study Loop 里的答疑助教 Lune。用中文回答，语气温柔亲切、清晰易懂，控制在 200 字以内；主要解答 Python 入门、编程概念与学习方法问题；支持简洁的 Markdown 排版（如 **加粗重点**、`行内代码`、列表与 ```python 代码块，代码示例一般不超过 6 行）；不确定就直说。";

export const aiConfig = reactive<AiRuntimeConfig>(createDefaultAiConfig());

let reqSeq = 0;

export function hasStoredAiKey(cfg: Partial<AiRuntimeConfig> = aiConfig): boolean {
  return Boolean(cfg.apiKey && String(cfg.apiKey).trim());
}

export function hydrateAiConfig(loaded?: Partial<AiRuntimeConfig>): void {
  const base = createDefaultAiConfig();
  if (loaded) {
    Object.assign(base, loaded);
  }
  Object.assign(aiConfig, base);
}

export async function saveAiConfig(patch: Partial<AiRuntimeConfig>): Promise<AiRuntimeConfig> {
  const next: AiRuntimeConfig = { ...aiConfig, ...patch };
  // If frontend had a masked key and caller didn't explicitly pass a new apiKey, preserve mask
  if (patch.apiKey === undefined && isMaskedAiKey(aiConfig.apiKey)) {
    next.apiKey = AI_KEY_MASK;
  }
  const saved = await backendClient.saveAiConfig(next);
  Object.assign(aiConfig, saved);
  return saved;
}

export async function resetAiConfig(): Promise<AiRuntimeConfig> {
  const fresh = await backendClient.resetAiConfig();
  Object.assign(aiConfig, fresh);
  return fresh;
}

export function getAiChatEndpoint(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return resolveAiChatEndpoint(aiConfig.baseURL, origin);
}

export function getAiAudioEndpoint(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return resolveAiAudioEndpoint(aiConfig.baseURL, origin);
}

export function isAiConfigured(): boolean {
  return Boolean(getAiChatEndpoint());
}

function makeAbortError(): Error {
  try {
    return new DOMException("Aborted", "AbortError");
  } catch {
    const e = new Error("Aborted");
    e.name = "AbortError";
    return e;
  }
}

export function formatAiError(err: unknown): string {
  const msg = String((err && (err as Error).message) || err || "");
  if ((err as Error)?.name === "AbortError") return "请求超时或已取消";
  if (/Failed to fetch|NetworkError|Load failed|无法连接服务/i.test(msg)) {
    return "无法连接服务（检查网关地址、网络或服务是否启动）";
  }
  if (/401|403|Unauthorized|invalid.*key/i.test(msg)) {
    return "API Key 无效或未授权";
  }
  if (/404/.test(msg)) {
    return "接口路径不存在（404），请确认地址";
  }
  if (/429/.test(msg)) {
    return "请求过于频繁或额度不足（429）";
  }
  return msg.slice(0, 120) || "请求失败";
}

export interface RequestAiOptions {
  signal?: AbortSignal;
  onDelta?: (full: string, delta: string) => void;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  timeoutMs?: number;
  baseURLOverride?: string;
}

export async function requestAiCompletion(
  messages: AiChatMessage[],
  opts: RequestAiOptions = {}
): Promise<string> {
  if (opts.signal?.aborted) {
    throw makeAbortError();
  }

  const requestId = `req_${Date.now()}_${++reqSeq}`;
  const wantStream = opts.stream ?? aiConfig.stream;

  if (isTauriRuntime()) {
    let unlisten: (() => void) | null = null;
    if (wantStream && opts.onDelta) {
      unlisten = await listen<AiStreamEventPayload>("ai:stream", (ev) => {
        if (opts.signal?.aborted) return;
        if (ev.payload?.requestId === requestId) {
          opts.onDelta?.(ev.payload.full, ev.payload.delta);
        }
      });
    }

    try {
      const invokePromise = backendClient.aiChatRequest({
        requestId,
        messages,
        model: opts.model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        stream: wantStream,
        timeoutMs: opts.timeoutMs,
      });

      if (opts.signal) {
        const abortPromise = new Promise<never>((_, reject) => {
          if (opts.signal!.aborted) {
            reject(makeAbortError());
            return;
          }
          opts.signal!.addEventListener("abort", () => reject(makeAbortError()), {
            once: true,
          });
        });
        return await Promise.race([invokePromise, abortPromise]);
      }
      return await invokePromise;
    } finally {
      unlisten?.();
    }
  }

  // Browser / Vite dev mode direct fetch SSE
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = opts.baseURLOverride
    ? resolveAiChatEndpoint(opts.baseURLOverride, origin)
    : getAiChatEndpoint();
  if (!url) throw new Error("未配置服务地址");

  const model = (opts.model || aiConfig.model || "gemini-3.8-flash-high").trim();
  const rawMax = opts.maxTokens ?? aiConfig.maxTokens;
  const effectiveMax =
    rawMax > 0 && /high|thinking|reason|r1/i.test(model) ? Math.max(1024, rawMax) : rawMax;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? aiConfig.temperature,
    stream: wantStream,
  };
  if (effectiveMax > 0) body.max_tokens = effectiveMax;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const webKey = isMaskedAiKey(aiConfig.apiKey)
    ? webFallbackGateway.getUnmaskedSessionKey()
    : aiConfig.apiKey.trim();
  if (webKey) {
    headers.Authorization = `Bearer ${webKey}`;
  }

  const ctl = new AbortController();
  const timeoutMs = Math.max(200, opts.timeoutMs ?? aiConfig.timeout);
  const timer = globalThis.setTimeout(() => ctl.abort(), timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) ctl.abort();
    else opts.signal.addEventListener("abort", () => ctl.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(detail);
        if (j?.error?.message) msg += `: ${j.error.message}`;
        else if (j?.message) msg += `: ${j.message}`;
      } catch {
        if (detail) msg += `: ${detail.slice(0, 160)}`;
      }
      throw new Error(msg);
    }

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (wantStream && res.body && ctype.includes("text/event-stream")) {
      const reader = res.body.getReader();
      const dec = new TextDecoder("utf-8");
      let buf = "";
      let full = "";
      let done = false;
      while (!done) {
        const r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            done = true;
            break;
          }
          try {
            const j = JSON.parse(payload);
            const c0 = j?.choices?.[0];
            const d = c0?.delta?.content ?? c0?.text ?? "";
            const piece =
              typeof d === "string"
                ? d
                : Array.isArray(d)
                  ? d.map((x: { text?: string }) => x?.text || "").join("")
                  : "";
            if (piece) {
              full += piece;
              opts.onDelta?.(full, piece);
            }
          } catch {
            // ignore partial JSON
          }
        }
      }
      return full.trim();
    }

    const j = await res.json();
    const c0 = j?.choices?.[0];
    const msgContent = c0?.message?.content ?? c0?.text ?? j?.output_text ?? j?.reply ?? "";
    const text = Array.isArray(msgContent)
      ? msgContent.map((p: string | { text?: string }) => (typeof p === "string" ? p : p?.text || "")).join("")
      : String(msgContent || "");
    const trimmed = text.trim();
    if (trimmed) opts.onDelta?.(trimmed, trimmed);
    return trimmed;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function transcribeAudioBlob(
  blob: Blob,
  opts: { language?: string; model?: string } = {}
): Promise<string> {
  if (isTauriRuntime()) {
    const audioBase64 = await blobToBase64(blob);
    return backendClient.aiTranscribeAudio({
      audioBase64,
      mimeType: blob.type || "audio/webm",
      model: opts.model || aiConfig.asrModel,
      language: opts.language || aiConfig.asrLang,
    });
  }

  const url = getAiAudioEndpoint();
  if (!url) throw new Error("未配置服务地址");
  const ext = /ogg/i.test(blob.type)
    ? "ogg"
    : /mp4|m4a/i.test(blob.type)
      ? "mp4"
      : /wav/i.test(blob.type)
        ? "wav"
        : "webm";
  const fd = new FormData();
  fd.append("file", blob, `speech.${ext}`);
  fd.append("model", opts.model || aiConfig.asrModel || "whisper-1");
  const lang = (opts.language || aiConfig.asrLang || "").split("-")[0];
  if (lang) fd.append("language", lang);

  const headers: Record<string, string> = {};
  const webKey = isMaskedAiKey(aiConfig.apiKey)
    ? webFallbackGateway.getUnmaskedSessionKey()
    : aiConfig.apiKey.trim();
  if (webKey) {
    headers.Authorization = `Bearer ${webKey}`;
  }
  const res = await fetch(url, { method: "POST", headers, body: fd });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return String(j?.text || "").trim();
}

export async function fetchAstraBuffer(
  audioCtx: AudioContext,
  text: string,
  speed?: number,
  avatarId?: string
): Promise<AudioBuffer> {
  if (isTauriRuntime()) {
    const wavBytes = await backendClient.aiTtsSpeech({
      text,
      speed: speed ?? aiConfig.ttsRate,
      avatarId: avatarId ?? aiConfig.ttsAvatar,
    });
    return audioCtx.decodeAudioData(wavBytes.slice(0));
  }

  const base = aiConfig.ttsBaseURL.trim().replace(/\/+$/, "");
  if (!base) throw new Error("未配置 AstraTTS 服务地址");
  const body: Record<string, unknown> = {
    text,
    speed: speed ?? aiConfig.ttsRate ?? 1.0,
  };
  const av = (avatarId ?? aiConfig.ttsAvatar).trim();
  if (av) body.avatar_id = av;

  const res = await fetch(`${base}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
  const fmt = (res.headers.get("x-audio-format") || "wav").toLowerCase();
  const sr = parseInt(res.headers.get("x-sample-rate") || "24000", 10) || 24000;
  const buf = await res.arrayBuffer();
  if (fmt === "f32le") {
    const samples = new Float32Array(buf, 0, Math.floor(buf.byteLength / 4));
    const ab = audioCtx.createBuffer(1, Math.max(1, samples.length), sr);
    ab.getChannelData(0).set(samples);
    return ab;
  }
  return audioCtx.decodeAudioData(buf.slice(0));
}

export async function fetchAstraAvatars(): Promise<AiAvatarItem[]> {
  if (isTauriRuntime()) {
    return backendClient.aiTtsAvatars();
  }
  const base = aiConfig.ttsBaseURL.trim().replace(/\/+$/, "");
  if (!base) return [];
  try {
    const res = await fetch(`${base}/avatars`);
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j?.avatars) ? j.avatars : [];
  } catch {
    return [];
  }
}

export function localReply(rawText: string): string {
  const s = rawText.trim();
  if (!s) return "把问题打出来吧～";
  if (/你好|hi|hello|在吗/i.test(s)) return "你好呀 🌸 有什么想学的吗？";
  if (/装饰器/.test(s)) {
    return "装饰器本质是接收函数、返回新函数的高阶函数，用来不改原函数地加功能。\n\n@log\ndef f(): ...\n等价于 f = log(f)";
  }
  if (/列表.*元组|元组.*列表/.test(s)) {
    return "列表 list 可变、用方括号；元组 tuple 不可变、用圆括号。元组更省内存，能做字典键。";
  }
  if (/出.*题|练习|考我/.test(s)) {
    return "去关卡地图挑战一下？每关 8 题，答对 6 题就能解锁下一关。";
  }
  if (/报错|error/i.test(s)) {
    return "把完整的 Traceback 那几行发我，我帮你看是哪行、为什么。";
  }
  if (/循环|for|while/.test(s)) {
    return "for 适合遍历已知对象；while 适合条件驱动。注意 while 要让循环变量有机会改变，否则死循环。";
  }
  if (/函数|def/.test(s)) {
    return "用 def 定义。return 返回结果并立即结束；无 return 默认返回 None。";
  }
  if (/类|对象|class/.test(s)) {
    return "类是模板，实例是按类创建的对象。__init__ 创建时自动调用，self 指当前实例。";
  }
  if (/谢谢|感谢/.test(s)) {
    return "不客气～ 有问题随时来问 🌷";
  }
  return "先确认它属于哪类知识点（语法/数据类型/函数/类/文件），再对照最小例子跑一遍，一般就通了。";
}

export async function requestChatReply(options: {
  text: string;
  history: ChatMessage[];
  mode?: AiMode;
  proxyUrl?: string;
  timeoutMs?: number;
  onDelta?: (full: string, delta: string) => void;
}): Promise<{ reply: string; source: "ai" | "local" }> {
  const { text, history, mode = "proxy", proxyUrl, timeoutMs, onDelta } = options;

  if (mode !== "local" && (proxyUrl?.trim() || isAiConfigured())) {
    try {
      const trimmedHist = history
        .filter((m) => m && m.text && !String(m.text).startsWith("［选择了"))
        .slice(-14)
        .map<AiChatMessage>((m) => ({
          role: m.who === "me" ? "user" : "assistant",
          content: String(m.text).slice(0, 1200),
        }));

      if (
        trimmedHist.length > 0 &&
        trimmedHist[trimmedHist.length - 1].role === "user" &&
        trimmedHist[trimmedHist.length - 1].content === text
      ) {
        trimmedHist.pop();
      }

      // If user customized system prompt away from the voice-only default, honor theirs; otherwise use chat system prompt
      const sysPrompt =
        aiConfig.system && aiConfig.system !== AI_CFG_DEFAULTS.system
          ? aiConfig.system
          : DEFAULT_CHAT_SYSTEM_PROMPT;

      const messages: AiChatMessage[] = [];
      if (sysPrompt.trim()) {
        messages.push({ role: "system", content: sysPrompt.trim() });
      }
      messages.push(...trimmedHist);
      messages.push({ role: "user", content: text });

      const reply = await requestAiCompletion(messages, {
        onDelta,
        timeoutMs,
        baseURLOverride: proxyUrl?.trim() || undefined,
      });
      if (reply) {
        return { reply, source: "ai" };
      }
    } catch (err) {
      console.warn("[ai] 云端大模型调用失败，自动回退本地回答：", err);
    }
  }

  await new Promise((r) => globalThis.setTimeout(r, 450 + Math.random() * 350));
  const fallback = localReply(text);
  onDelta?.(fallback, fallback);
  return { reply: fallback, source: "local" };
}

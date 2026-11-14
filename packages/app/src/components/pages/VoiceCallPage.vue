<template>
  <section
    id="voiceCall"
    class="page"
    :class="{
      on: nav.currentPage === 'voiceCall',
      muted: vcMuted,
      live: liveMeterActive && !vcMuted,
      listening: callStage === 'listening',
      thinking: callStage === 'thinking',
      speaking: callStage === 'speaking',
      video: camOn,
      mirror: camOn && camFacing === 'user',
    }"
  >
    <video
      id="vcVideo"
      ref="videoRef"
      class="vc-video"
      autoplay
      playsinline
      webkit-playsinline
      muted
    ></video>
    <div class="vc-bg"></div>
    <div class="vc-veil"></div>

    <div class="vc-top">
      <button
        id="vcBack"
        class="vc-back vc-icon-back"
        type="button"
        aria-label="退出通话"
        title="退出通话"
        @click="closeCall"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M14.5 6.5L9 12l5.5 5.5"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <span class="vc-top-name">Observatory</span>
      <span id="vcTag" class="vc-tag">{{ camOn ? "视频通话" : "语音通话" }}</span>
      <button
        id="vcCfgBtn"
        class="vc-gear"
        type="button"
        title="通话与大模型设置"
        aria-label="通话与大模型设置"
        @click="openCfgPanel"
      >
        ⚙
      </button>
    </div>

    <div class="vc-remote">
      <div class="vc-remote-ava">
        <img :src="ASSETS.voiceCallAvatar" alt="Lune" />
      </div>
      <div class="vc-remote-txt">
        <b>Lune</b>
        <span>{{ formattedTime }}</span>
      </div>
    </div>

    <button
      id="vcFlip"
      class="vc-cam-flip"
      type="button"
      title="切换前后摄像头"
      aria-label="切换前后摄像头"
      @click="flipCamera"
    >
      ⇄
    </button>

    <div class="vc-main">
      <div class="vc-ava"><img :src="ASSETS.voiceCallAvatar" alt="Lune" /></div>
      <div class="vc-name">Lune</div>
      <div id="vcTime" class="vc-time">{{ formattedTime }}</div>

      <div id="vcStatus" class="vc-status" :class="statusKind">
        {{ statusText }}
      </div>

      <div class="vc-wave">
        <i
          v-for="(h, idx) in waveHeights"
          :key="idx"
          :style="
            liveMeterActive && !vcMuted
              ? { height: `${h}px`, opacity: String(Math.min(1, 0.38 + h / 28)) }
              : undefined
          "
        ></i>
      </div>

      <div v-show="vcSubOn" id="vcSpeaking" class="vc-speaking">
        {{ speakingLabel }}
      </div>

      <div v-show="vcSubOn" id="vcTranscript" ref="transcriptRef" class="vc-transcript">
        <div
          v-for="line in transcriptLines"
          :key="line.id"
          class="vc-line"
          :class="line.who"
          :data-cam="line.cam ? '1' : undefined"
        >
          {{ line.text }}
        </div>
      </div>

      <div v-show="vcSubOn" id="vcTip" class="vc-tip">{{ tipLabel }}</div>
    </div>

    <div id="vcTextBar" class="vc-textbar" :class="{ show: textBarVisible }">
      <input
        v-model="textDraft"
        type="text"
        placeholder="直接打字和 Lune 对话…"
        autocomplete="off"
        enterkeyhint="send"
        @keydown.enter.prevent="submitTypedText"
      />
      <button type="button" @click="submitTypedText">发送</button>
    </div>

    <div class="vc-actions">
      <button
        id="vcMute"
        class="vc-btn"
        :class="{ on: vcMuted }"
        type="button"
        @click="toggleMute"
      >
        <span class="vc-ico">
          <svg viewBox="0 0 24 24">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
            <path d="M12 18v4" />
            <path d="M8 22h8" />
          </svg>
        </span>
        <span class="vc-lb">{{ vcMuted ? "取消静音" : "静音" }}</span>
      </button>

      <button
        id="vcCam"
        class="vc-btn"
        :class="{ on: camOn, off: !camOn }"
        type="button"
        @click="toggleCamera"
      >
        <span class="vc-ico">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="M16 10l5-3v10l-5-3z" />
          </svg>
        </span>
        <span class="vc-lb">{{ camOn ? "关镜头" : "开镜头" }}</span>
      </button>

      <button id="vcEnd" class="vc-btn end" type="button" @click="closeCall">
        <span class="vc-ico">
          <svg viewBox="0 0 24 24">
            <path
              d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.15.38 2.35.58 3.6.58a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.58 3.6a1 1 0 0 1-.24 1l-2.24 2.2z"
            />
          </svg>
        </span>
        <span class="vc-lb">结束</span>
      </button>

      <button
        id="vcSub"
        class="vc-btn"
        :class="{ on: vcSubOn }"
        type="button"
        @click="vcSubOn = !vcSubOn"
      >
        <span class="vc-ico">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="M7 11h4M7 14h6M15 11h2M15 14h2" />
          </svg>
        </span>
        <span class="vc-lb">{{ vcSubOn ? "字幕" : "字幕关" }}</span>
      </button>

      <button
        id="vcLook"
        class="vc-btn"
        :class="{ on: camOn ? false : textBarManual }"
        type="button"
        @click="onLookOrKeyboard"
      >
        <span class="vc-ico">
          <svg v-if="camOn" viewBox="0 0 24 24">
            <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg v-else viewBox="0 0 24 24">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h.01M12 10h.01M17 10h.01M8 14h8" />
          </svg>
        </span>
        <span class="vc-lb">{{ camOn ? "看看" : "打字" }}</span>
      </button>
    </div>

    <!-- 通话与大模型配置面板 -->
    <div id="vcCfgPanel" class="vc-cfg" :class="{ show: cfgOpen }">
      <div class="vc-cfg-top">
        <span class="t">通话与大模型设置</span>
        <button type="button" aria-label="关闭设置" @click="cfgOpen = false">✕</button>
      </div>

      <div class="vc-cfg-body">
        <div class="cfg-h">大模型网关（OpenAI 兼容）</div>
        <div class="cfg-row">
          <label>服务地址 Base URL</label>
          <input
            v-model="draftCfg.baseURL"
            type="text"
            placeholder="http://127.0.0.1:8787 或 https://your-gateway.example.com"
          />
        </div>
        <div class="cfg-row">
          <label>
            访问令牌 / API Key
            <span v-if="hasVaultKey">（已安全加密托管 · 留空保持不变）</span>
          </label>
          <input
            v-model="newKeyInput"
            type="password"
            autocomplete="off"
            :placeholder="
              hasVaultKey
                ? '已由本地安全层托管，输入新令牌可覆盖替换'
                : '输入网关访问令牌或受限子密钥'
            "
          />
        </div>
        <div class="cfg-inline">
          <div class="cfg-row">
            <label>对话模型</label>
            <input
              v-model="draftCfg.model"
              type="text"
              placeholder="gemini-3.8-flash-high"
            />
          </div>
          <div class="cfg-row">
            <label>温度 ({{ draftCfg.temperature.toFixed(1) }})</label>
            <input
              v-model.number="draftCfg.temperature"
              type="range"
              min="0"
              max="1.5"
              step="0.1"
            />
          </div>
        </div>
        <label class="cfg-check">
          <input v-model="draftCfg.stream" type="checkbox" />
          <span>启用 SSE 流式输出（边想边说，首字更快）</span>
        </label>
        <div class="cfg-row">
          <label>助教人设 System Prompt</label>
          <textarea v-model="draftCfg.system"></textarea>
        </div>

        <div class="cfg-h">语音识别（ASR）</div>
        <div class="cfg-row">
          <label>识别方式</label>
          <select v-model="draftCfg.asr">
            <option value="auto">自动选择（优先浏览器识别 → 音频多模态 → 打字）</option>
            <option value="browser">浏览器原生 SpeechRecognition</option>
            <option value="chat">多模态音频直传（input_audio 16kHz WAV）</option>
            <option value="server">服务端 Whisper（/v1/audio/transcriptions）</option>
            <option value="text">仅打字输入</option>
          </select>
        </div>
        <div class="cfg-row">
          <label>停顿判停时长：{{ draftCfg.silenceMs }} ms</label>
          <input
            v-model.number="draftCfg.silenceMs"
            type="range"
            min="600"
            max="2600"
            step="100"
          />
        </div>

        <div class="cfg-h">语音朗读（TTS）</div>
        <label class="cfg-check">
          <input v-model="draftCfg.tts" type="checkbox" />
          <span>朗读 Lune 的回答</span>
        </label>
        <div class="cfg-row">
          <label>朗读引擎</label>
          <select v-model="draftCfg.ttsEngine">
            <option value="browser">系统内置语音（speechSynthesis）</option>
            <option value="astra">AstraTTS 语音合成服务</option>
          </select>
        </div>
        <template v-if="draftCfg.ttsEngine === 'astra'">
          <div class="cfg-row">
            <label>
              AstraTTS 地址
              <button type="button" class="cfg-mini" @click="refreshAvatars">刷新音色</button>
            </label>
            <input
              v-model="draftCfg.ttsBaseURL"
              type="text"
              placeholder="http://127.0.0.1:8000"
            />
          </div>
          <div v-if="astraAvatars.length" class="cfg-row">
            <label>选择音色</label>
            <select v-model="draftCfg.ttsAvatar">
              <option value="">默认音色</option>
              <option v-for="av in astraAvatars" :key="av.id" :value="av.id">
                {{ av.name }} ({{ av.id }})
              </option>
            </select>
          </div>
        </template>
        <div class="cfg-row">
          <label>语速 ({{ draftCfg.ttsRate.toFixed(1) }}x)</label>
          <input
            v-model.number="draftCfg.ttsRate"
            type="range"
            min="0.6"
            max="1.8"
            step="0.1"
          />
        </div>
        <label class="cfg-check">
          <input v-model="draftCfg.bargeIn" type="checkbox" />
          <span>支持开口打断 Lune 朗读</span>
        </label>
        <label class="cfg-check">
          <input v-model="draftCfg.greet" type="checkbox" />
          <span>接通后主动打招呼</span>
        </label>

        <div class="cfg-h">视频通话与多模态视觉</div>
        <label class="cfg-check">
          <input v-model="draftCfg.vision" type="checkbox" />
          <span>开镜头说话时自动附带当前画面</span>
        </label>
        <div class="cfg-inline">
          <div class="cfg-row">
            <label>视觉模型（留空同对话模型）</label>
            <input v-model="draftCfg.visionModel" type="text" placeholder="留空默认同上" />
          </div>
          <div class="cfg-row">
            <label>默认镜头</label>
            <select v-model="draftCfg.camFacing">
              <option value="user">前置镜头</option>
              <option value="environment">后置镜头</option>
            </select>
          </div>
        </div>
      </div>

      <div class="vc-cfg-foot">
        <div class="cfg-acts">
          <button type="button" :disabled="cfgTesting" @click="testCfgConnection">
            {{ cfgTesting ? "测试中…" : "测试连接" }}
          </button>
          <button type="button" @click="restoreDefaultCfg">恢复默认</button>
          <button type="button" class="primary" @click="saveAndReconnect">保存并重连</button>
        </div>
        <div class="cfg-msg" :class="{ err: cfgMsgErr }">{{ cfgMsg }}</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from "vue";
import type {
  AiAvatarItem,
  AiChatMessage,
  AiContentPart,
  AiRuntimeConfig,
  CamFacingOption,
} from "@mnk/shared";
import { AI_KEY_MASK, createDefaultAiConfig } from "@mnk/shared";
import { ASSETS } from "@/assets/manifest";
import {
  aiConfig,
  fetchAstraAvatars,
  fetchAstraBuffer,
  formatAiError,
  hasStoredAiKey,
  requestAiCompletion,
  resetAiConfig,
  saveAiConfig,
  transcribeAudioBlob,
} from "@/services/aiClient";
import { blobToBase64 } from "@/services/backendClient";
import { useNavigationStore } from "@/stores/navigation";
import { useChatStore } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";

interface TranscriptLine {
  id: number;
  who: "me" | "bot" | "sys";
  text: string;
  cam?: boolean;
}

const nav = useNavigationStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();

const videoRef = ref<HTMLVideoElement | null>(null);
const transcriptRef = ref<HTMLDivElement | null>(null);

const vcSecs = ref(0);
const vcMuted = ref(false);
const vcSubOn = ref(true);
const camOn = ref(false);
const camFacing = ref<CamFacingOption>("user");
const callStage = ref<"idle" | "listening" | "thinking" | "speaking">("idle");
const statusText = ref("准备就绪");
const statusKind = ref<"" | "ok" | "warn" | "err">("");
const interimText = ref("");
const textDraft = ref("");
const textBarManual = ref(false);
const forceTextFallback = ref(false);
const liveMeterActive = ref(false);
const waveHeights = ref<number[]>(Array.from({ length: 11 }, () => 6));
const transcriptLines = ref<TranscriptLine[]>([]);

// Config Panel state
const cfgOpen = ref(false);
const cfgTesting = ref(false);
const cfgMsg = ref("");
const cfgMsgErr = ref(false);
const astraAvatars = ref<AiAvatarItem[]>([]);
const draftCfg = reactive<AiRuntimeConfig>(createDefaultAiConfig());
const newKeyInput = ref("");
const hasVaultKey = ref(false);

let lineSeq = 0;
let vcTimer: number | null = null;
let callActive = false;
let callTurns: Array<{ role: "user" | "assistant"; text: string }> = [];
let visionUnsupported = false;

// Audio / Mic / Camera / ASR / TTS runtime handles
let micStream: MediaStream | null = null;
let camStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let meterRaf: number | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let speechRec: any = null;
let recActive = false;
let activeAbort: AbortController | null = null;
let activeTtsSource: AudioBufferSourceNode | null = null;
let pcmCaptureNode: ScriptProcessorNode | null = null;
let pcmChunks: Float32Array[] = [];
let vadSpeaking = false;
let vadLastVoiceAt = 0;
let mediaRecorder: MediaRecorder | null = null;
let recordedBlobs: Blob[] = [];

const formattedTime = computed(() => {
  const m = Math.floor(vcSecs.value / 60);
  const r = vcSecs.value % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
});

const textBarVisible = computed(
  () => textBarManual.value || forceTextFallback.value || aiConfig.asr === "text"
);

const speakingLabel = computed(() => {
  if (interimText.value) return interimText.value;
  if (vcMuted.value) return "已静音";
  switch (callStage.value) {
    case "thinking":
      return "Lune is thinking…";
    case "speaking":
      return "Lune is speaking";
    case "listening":
      return "Lune 正在听你说…";
    default:
      return "随时开口或打字提问";
  }
});

const tipLabel = computed(() => {
  if (camOn.value) return "点击右下角「看看」可让 Lune 观察当前画面";
  if (callStage.value === "speaking" && aiConfig.bargeIn) return "直接开口或发送消息可随时打断";
  return "听完后，可以继续说";
});

function scrollTranscriptBottom() {
  void nextTick(() => {
    const el = transcriptRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function pushLine(who: "me" | "bot" | "sys", text: string, cam = false): TranscriptLine {
  const item: TranscriptLine = { id: ++lineSeq, who, text, cam };
  transcriptLines.value.push(item);
  scrollTranscriptBottom();
  return item;
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function cancelCurrentSpeakAndReply() {
  if (activeAbort) {
    try {
      activeAbort.abort();
    } catch {
      // ignore
    }
    activeAbort = null;
  }
  if (activeTtsSource) {
    try {
      activeTtsSource.stop();
    } catch {
      // ignore
    }
    activeTtsSource = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function stripForTts(raw: string): string {
  return String(raw || "")
    .replace(/```[\s\S]*?```/g, "，代码示例见字幕，")
    .replace(/[*#`_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function speakBotText(text: string) {
  if (!callActive || !aiConfig.tts) return;
  const clean = stripForTts(text);
  if (!clean) return;

  callStage.value = "speaking";
  if (aiConfig.ttsEngine === "astra" && aiConfig.ttsBaseURL.trim()) {
    try {
      const ctx = ensureAudioContext();
      if (ctx) {
        const buf = await fetchAstraBuffer(ctx, clean, aiConfig.ttsRate, aiConfig.ttsAvatar);
        if (!callActive) return;
        await new Promise<void>((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          activeTtsSource = src;
          src.onended = () => {
            if (activeTtsSource === src) activeTtsSource = null;
            resolve();
          };
          src.start(0);
        });
        if (callActive && callStage.value === "speaking") {
          callStage.value = vcMuted.value ? "idle" : "listening";
        }
        return;
      }
    } catch (err) {
      console.warn("[VoiceCall] AstraTTS 播放失败，回退系统语音:", err);
    }
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    await new Promise<void>((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const ut = new SpeechSynthesisUtterance(clean);
        ut.lang = aiConfig.asrLang || "zh-CN";
        ut.rate = Math.min(2, Math.max(0.5, aiConfig.ttsRate || 1));
        ut.pitch = Math.min(2, Math.max(0.5, aiConfig.ttsPitch || 1));
        if (aiConfig.ttsVoice) {
          const v = window.speechSynthesis
            .getVoices()
            .find((x) => x.name === aiConfig.ttsVoice);
          if (v) ut.voice = v;
        }
        ut.onend = () => resolve();
        ut.onerror = () => resolve();
        window.speechSynthesis.speak(ut);
      } catch {
        resolve();
      }
    });
  }

  if (callActive && callStage.value === "speaking") {
    callStage.value = vcMuted.value ? "idle" : "listening";
  }
}

function grabCameraFrameDataUrl(): string | null {
  if (!camOn.value || !videoRef.value) return null;
  const v = videoRef.value;
  if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return null;
  const targetW = Math.min(1280, Math.max(240, aiConfig.frameW || 720));
  const scale = Math.min(1, targetW / v.videoWidth);
  const cw = Math.max(1, Math.round(v.videoWidth * scale));
  const ch = Math.max(1, Math.round(v.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(v, 0, 0, cw, ch);
  try {
    return canvas.toDataURL("image/jpeg", Math.min(0.92, Math.max(0.3, aiConfig.frameQ || 0.72)));
  } catch {
    return null;
  }
}

function encodeFloat32ToWav16k(chunks: Float32Array[], inputSampleRate: number): Blob {
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const merged = new Float32Array(totalLen);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  const targetSr = 16000;
  const ratio = inputSampleRate / targetSr;
  const outLen = Math.max(1, Math.floor(merged.length / ratio));
  const buf = new ArrayBuffer(44 + outLen * 2);
  const view = new DataView(buf);
  const writeStr = (p: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + outLen * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSr, true);
  view.setUint32(28, targetSr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, outLen * 2, true);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = Math.min(merged.length - 1, Math.floor(i * ratio));
    const s = Math.max(-1, Math.min(1, merged[srcIdx]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function handleUserTurn(
  userText: string,
  options: { forceVision?: boolean; audioWavBlob?: Blob } = {}
) {
  const trimmed = userText.trim();
  if (!trimmed && !options.audioWavBlob) return;
  if (!callActive) return;

  cancelCurrentSpeakAndReply();

  const shouldAttachFrame =
    !visionUnsupported &&
    camOn.value &&
    (Boolean(options.forceVision) || Boolean(aiConfig.vision));
  const frameUrl = shouldAttachFrame ? grabCameraFrameDataUrl() : null;

  const displayUserText = trimmed || "（语音提问）";
  const meLine = pushLine("me", displayUserText, Boolean(frameUrl));

  callStage.value = "thinking";
  statusKind.value = "ok";
  statusText.value = `${aiConfig.model} · 正在思考…`;

  const botLine = pushLine("bot", "…");
  const ctl = new AbortController();
  activeAbort = ctl;

  const buildMessages = async (includeMedia: boolean): Promise<AiChatMessage[]> => {
    const msgs: AiChatMessage[] = [];
    if (aiConfig.system.trim()) {
      msgs.push({ role: "system", content: aiConfig.system.trim() });
    }
    for (const prev of callTurns.slice(-10)) {
      msgs.push({ role: prev.role, content: prev.text });
    }
    if (includeMedia && (frameUrl || options.audioWavBlob)) {
      const parts: AiContentPart[] = [];
      if (trimmed) {
        parts.push({ type: "text", text: trimmed });
      } else {
        parts.push({
          type: "text",
          text: "请先听清同学这段语音并直接用中文简短口语回答。",
        });
      }
      if (frameUrl) {
        parts.push({ type: "image_url", image_url: { url: frameUrl } });
      }
      if (options.audioWavBlob) {
        const b64 = await blobToBase64(options.audioWavBlob);
        parts.push({ type: "input_audio", input_audio: { data: b64, format: "wav" } });
      }
      msgs.push({ role: "user", content: parts });
    } else {
      msgs.push({ role: "user", content: displayUserText });
    }
    return msgs;
  };

  try {
    const targetModel =
      frameUrl && aiConfig.visionModel.trim() ? aiConfig.visionModel.trim() : aiConfig.model;
    let reply = "";
    try {
      const msgs = await buildMessages(true);
      reply = await requestAiCompletion(msgs, {
        signal: ctl.signal,
        model: targetModel,
        onDelta: (full) => {
          botLine.text = full;
          scrollTranscriptBottom();
        },
      });
    } catch (firstErr) {
      const em = String((firstErr as Error)?.message || firstErr || "");
      if (frameUrl && /HTTP (400|413|415|422)/i.test(em) && trimmed) {
        visionUnsupported = true;
        meLine.cam = false;
        pushLine("sys", "当前模型不支持图像输入，已自动切换为纯文本对话");
        const fallbackMsgs = await buildMessages(false);
        reply = await requestAiCompletion(fallbackMsgs, {
          signal: ctl.signal,
          onDelta: (full) => {
            botLine.text = full;
            scrollTranscriptBottom();
          },
        });
      } else {
        throw firstErr;
      }
    }

    if (!callActive || ctl.signal.aborted) return;
    const finalReply = reply.trim() || "我刚刚没听清，可以再说一遍吗？";
    botLine.text = finalReply;
    scrollTranscriptBottom();

    callTurns.push({ role: "user", text: displayUserText });
    callTurns.push({ role: "assistant", text: finalReply });

    statusKind.value = "ok";
    statusText.value = `${aiConfig.model} · 通话在线`;
    await speakBotText(finalReply);
  } catch (err) {
    if ((err as Error)?.name === "AbortError" || !callActive) return;
    const reason = formatAiError(err);
    botLine.text = `（连接异常：${reason}）`;
    statusKind.value = "err";
    statusText.value = reason;
    callStage.value = vcMuted.value ? "idle" : "listening";
  } finally {
    if (activeAbort === ctl) activeAbort = null;
  }
}

function submitTypedText() {
  const txt = textDraft.value.trim();
  if (!txt) return;
  textDraft.value = "";
  void handleUserTurn(txt);
}

function onLookOrKeyboard() {
  if (camOn.value) {
    const prompt = aiConfig.visionAsk.trim() || "看看我这边，简短说说你看到了什么。";
    void handleUserTurn(prompt, { forceVision: true });
  } else {
    textBarManual.value = !textBarManual.value;
  }
}

// ---- Microphone, Waveform Meter & ASR ----
function stopSpeechRecognition() {
  recActive = false;
  if (speechRec) {
    try {
      speechRec.onend = null;
      speechRec.stop();
    } catch {
      // ignore
    }
    speechRec = null;
  }
}

function stopMicPipeline() {
  stopSpeechRecognition();
  if (meterRaf !== null) {
    cancelAnimationFrame(meterRaf);
    meterRaf = null;
  }
  if (pcmCaptureNode) {
    try {
      pcmCaptureNode.disconnect();
    } catch {
      // ignore
    }
    pcmCaptureNode = null;
  }
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch {
      // ignore
    }
  }
  mediaRecorder = null;
  analyser = null;
  liveMeterActive.value = false;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

function startBrowserSpeechRec(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return false;

  try {
    const rec = new SR();
    rec.lang = aiConfig.asrLang || "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    speechRec = rec;
    recActive = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      if (!callActive || vcMuted.value) return;
      let interim = "";
      let finalStr = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const t = String(res?.[0]?.transcript || "");
        if (res.isFinal) finalStr += t;
        else interim += t;
      }
      if (interim && callStage.value === "speaking" && aiConfig.bargeIn) {
        cancelCurrentSpeakAndReply();
        callStage.value = "listening";
      }
      interimText.value = interim.trim();
      if (finalStr.trim()) {
        interimText.value = "";
        void handleUserTurn(finalStr.trim());
      }
    };

    rec.onerror = () => {
      // If browser SR fails (e.g. WebView without Google speech service), fall back cleanly
      if (!callActive) return;
      stopSpeechRecognition();
      if (aiConfig.asr === "auto" && micStream) {
        setupVadFallbackMode("chat");
      } else {
        forceTextFallback.value = true;
        statusKind.value = "warn";
        statusText.value = `${aiConfig.model} · 语音识别受限，可直接打字`;
      }
    };

    rec.onend = () => {
      if (callActive && recActive && !vcMuted.value) {
        try {
          rec.start();
        } catch {
          // ignore
        }
      }
    };

    rec.start();
    return true;
  } catch {
    return false;
  }
}

function setupVadFallbackMode(mode: "chat" | "server") {
  const ctx = ensureAudioContext();
  if (!ctx || !micStream) {
    forceTextFallback.value = true;
    return;
  }
  const source = ctx.createMediaStreamSource(micStream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  pcmCaptureNode = proc;
  pcmChunks = [];
  vadSpeaking = false;
  vadLastVoiceAt = 0;

  if (mode === "server" && typeof MediaRecorder !== "undefined") {
    try {
      mediaRecorder = new MediaRecorder(micStream);
      recordedBlobs = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedBlobs.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedBlobs, {
          type: mediaRecorder?.mimeType || "audio/webm",
        });
        recordedBlobs = [];
        if (!callActive || vcMuted.value || blob.size < 1200) return;
        try {
          statusText.value = "正在识别语音…";
          const text = await transcribeAudioBlob(blob);
          if (text.trim()) {
            await handleUserTurn(text.trim());
          }
        } catch (err) {
          forceTextFallback.value = true;
          statusKind.value = "warn";
          statusText.value = `识别异常（${formatAiError(err)}），可打字交流`;
        }
      };
    } catch {
      mediaRecorder = null;
    }
  }

  proc.onaudioprocess = (ev) => {
    if (!callActive || vcMuted.value) return;
    const input = ev.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const now = performance.now();

    if (rms > 0.022) {
      if (!vadSpeaking) {
        vadSpeaking = true;
        pcmChunks = [];
        if (callStage.value === "speaking" && aiConfig.bargeIn) {
          cancelCurrentSpeakAndReply();
          callStage.value = "listening";
        }
        if (mode === "server" && mediaRecorder && mediaRecorder.state === "inactive") {
          recordedBlobs = [];
          try {
            mediaRecorder.start();
          } catch {
            // ignore
          }
        }
      }
      vadLastVoiceAt = now;
    }

    if (vadSpeaking) {
      if (mode === "chat") {
        pcmChunks.push(new Float32Array(input));
      }
      const silenceLimit = Math.max(600, aiConfig.silenceMs || 1100);
      if (now - vadLastVoiceAt > silenceLimit) {
        vadSpeaking = false;
        if (mode === "server" && mediaRecorder && mediaRecorder.state === "recording") {
          try {
            mediaRecorder.stop();
          } catch {
            // ignore
          }
        } else if (mode === "chat" && pcmChunks.length >= 4) {
          const captured = pcmChunks;
          pcmChunks = [];
          const wavBlob = encodeFloat32ToWav16k(captured, ctx.sampleRate || 48000);
          void handleUserTurn("", { audioWavBlob: wavBlob });
        } else {
          pcmChunks = [];
        }
      }
    }
  };

  source.connect(proc);
  proc.connect(ctx.destination);
}

async function initAudioAndAsr() {
  stopMicPipeline();
  forceTextFallback.value = false;

  if (aiConfig.asr === "text") {
    forceTextFallback.value = true;
    callStage.value = "idle";
    statusKind.value = "ok";
    statusText.value = `${aiConfig.model} · 文字通话模式`;
    return;
  }

  if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const ctx = ensureAudioContext();
      if (ctx) {
        const src = ctx.createMediaStreamSource(micStream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        src.connect(analyser);
        liveMeterActive.value = true;
        const bins = new Uint8Array(analyser.frequencyBinCount);
        const tickMeter = () => {
          if (!analyser || !callActive) return;
          analyser.getByteFrequencyData(bins);
          const next: number[] = [];
          for (let i = 0; i < 11; i++) {
            const v = bins[(i * 2) % bins.length] || 0;
            next.push(Math.max(5, Math.min(28, Math.round(5 + (v / 255) * 23))));
          }
          waveHeights.value = next;
          meterRaf = requestAnimationFrame(tickMeter);
        };
        meterRaf = requestAnimationFrame(tickMeter);
      }
    } catch {
      forceTextFallback.value = true;
      statusKind.value = "warn";
      statusText.value = `${aiConfig.model} · 未授予麦克风权限，已开启打字栏`;
      return;
    }
  } else {
    forceTextFallback.value = true;
    statusKind.value = "warn";
    statusText.value = `${aiConfig.model} · 当前环境无麦克风，可直接打字`;
    return;
  }

  callStage.value = "listening";
  const mode = aiConfig.asr;
  if (mode === "browser" || mode === "auto") {
    const ok = startBrowserSpeechRec();
    if (ok) {
      statusKind.value = "ok";
      statusText.value = `${aiConfig.model} · 实时语音通话中`;
      return;
    }
    if (mode === "browser") {
      forceTextFallback.value = true;
      statusKind.value = "warn";
      statusText.value = "当前浏览器不支持原生语音识别，已开启打字栏";
      return;
    }
  }

  if (mode === "server") {
    setupVadFallbackMode("server");
    statusKind.value = "ok";
    statusText.value = `${aiConfig.model} · Whisper 语音识别在线`;
  } else {
    setupVadFallbackMode("chat");
    statusKind.value = "ok";
    statusText.value = `${aiConfig.model} · 多模态语音直连在线`;
  }
}

// ---- Camera Management ----
function stopCameraStream() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }
  camOn.value = false;
}

async function startCameraStream(facing: CamFacingOption): Promise<boolean> {
  stopCameraStream();
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    nav.toast("当前设备不支持摄像头调用");
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    camStream = stream;
    camFacing.value = facing;
    camOn.value = true;
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      videoRef.value.play().catch(() => {});
    }
    return true;
  } catch {
    nav.toast("无法打开摄像头，请检查相机权限");
    return false;
  }
}

async function toggleCamera() {
  if (camOn.value) {
    stopCameraStream();
  } else {
    await startCameraStream(camFacing.value);
  }
}

async function flipCamera() {
  const next: CamFacingOption = camFacing.value === "user" ? "environment" : "user";
  await startCameraStream(next);
}

function toggleMute() {
  vcMuted.value = !vcMuted.value;
  if (micStream) {
    micStream.getAudioTracks().forEach((t) => {
      t.enabled = !vcMuted.value;
    });
  }
  if (vcMuted.value) {
    interimText.value = "";
    if (callStage.value === "listening") callStage.value = "idle";
  } else if (callStage.value === "idle") {
    callStage.value = "listening";
  }
}

// ---- Config Panel Actions ----
function syncDraftFromStore() {
  Object.assign(draftCfg, JSON.parse(JSON.stringify(aiConfig)));
  hasVaultKey.value = hasStoredAiKey(aiConfig);
  draftCfg.apiKey = "";
  newKeyInput.value = "";
}

function buildVcPayloadToSave(): AiRuntimeConfig {
  const trimmedNew = newKeyInput.value.trim();
  return {
    ...draftCfg,
    apiKey: trimmedNew ? trimmedNew : hasVaultKey.value ? AI_KEY_MASK : "",
  };
}

function openCfgPanel() {
  syncDraftFromStore();
  cfgMsg.value = "";
  cfgMsgErr.value = false;
  cfgOpen.value = true;
}

async function refreshAvatars() {
  await saveAiConfig({ ttsBaseURL: draftCfg.ttsBaseURL });
  astraAvatars.value = await fetchAstraAvatars();
  cfgMsgErr.value = false;
  cfgMsg.value = astraAvatars.value.length
    ? `已加载 ${astraAvatars.value.length} 个音色`
    : "未获取到可用音色列表";
}

async function testCfgConnection() {
  if (cfgTesting.value) return;
  cfgTesting.value = true;
  cfgMsgErr.value = false;
  cfgMsg.value = "正在测试大模型连接…";
  try {
    await saveAiConfig(buildVcPayloadToSave());
    syncDraftFromStore();
    await settingsStore.updateAiConfig("proxy", aiConfig.baseURL);
    const reply = await requestAiCompletion(
      [{ role: "user", content: "请用一句话简短打个招呼" }],
      { stream: false, maxTokens: 1024, timeoutMs: 20_000 }
    );
    cfgMsgErr.value = false;
    cfgMsg.value = `连接成功：「${reply.slice(0, 40) || "已响应"}」`;
  } catch (err) {
    cfgMsgErr.value = true;
    cfgMsg.value = `连接失败：${formatAiError(err)}`;
  } finally {
    cfgTesting.value = false;
  }
}

async function restoreDefaultCfg() {
  const fresh = await resetAiConfig();
  syncDraftFromStore();
  await settingsStore.updateAiConfig("proxy", fresh.baseURL);
  cfgMsgErr.value = false;
  cfgMsg.value = "已恢复默认网关配置";
}

async function saveAndReconnect() {
  await saveAiConfig(buildVcPayloadToSave());
  await settingsStore.updateAiConfig("proxy", aiConfig.baseURL);
  visionUnsupported = false;
  camFacing.value = aiConfig.camFacing || "user";
  cfgOpen.value = false;
  if (callActive) {
    await initAudioAndAsr();
  }
}

// ---- Call Lifecycle ----
function stopTimer() {
  if (vcTimer !== null) {
    window.clearInterval(vcTimer);
    vcTimer = null;
  }
}

function teardownCall() {
  callActive = false;
  stopTimer();
  cancelCurrentSpeakAndReply();
  stopMicPipeline();
  stopCameraStream();
  callStage.value = "idle";
  interimText.value = "";
  if (callTurns.length > 0) {
    const turnsToSave = callTurns.slice();
    callTurns = [];
    void chatStore.appendVoiceCallTurns(turnsToSave);
  }
}

function closeCall() {
  cfgOpen.value = false;
  teardownCall();
  nav.leaveVoiceCall();
}

async function startCallSession() {
  callActive = true;
  vcSecs.value = 0;
  vcMuted.value = false;
  vcSubOn.value = true;
  textBarManual.value = false;
  transcriptLines.value = [];
  callTurns = [];
  visionUnsupported = false;
  camFacing.value = aiConfig.camFacing || "user";

  stopTimer();
  vcTimer = window.setInterval(() => {
    vcSecs.value += 1;
  }, 1000);

  if (nav.voiceCallWithVideo) {
    nav.voiceCallWithVideo = false;
    await startCameraStream(camFacing.value);
  }

  await initAudioAndAsr();

  if (callActive && aiConfig.greet && aiConfig.greeting.trim()) {
    const greetText = aiConfig.greeting.trim();
    pushLine("bot", greetText);
    callTurns.push({ role: "assistant", text: greetText });
    void speakBotText(greetText);
  }
}

watch(
  () => nav.currentPage,
  (page) => {
    if (page === "voiceCall") {
      void startCallSession();
    } else if (callActive) {
      teardownCall();
    }
  }
);

onBeforeUnmount(() => {
  teardownCall();
});
</script>

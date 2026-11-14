export const SAVE_VERSION = 5;
export const CARDS_PER_LEVEL = 8;
export const WRONG_MASTER_N = 3;
export const FOOD_ICONS = ["🍰", "🍩", "🍪", "🧁", "🍡", "🍓", "🍮", "🥐"] as const;

export interface CardItem {
  tag: string;
  q: string;
  a: string;
  doc?: string;
}

export interface CardChapter {
  ch: string;
  title: string;
  cards: CardItem[];
}

export interface FlatCardItem extends CardItem {
  id: string;
  ch: string;
  chTitle: string;
  chapterIndex: number;
  cardIndex: number;
}

export type QuestionType = "choice" | "code";

export interface RawQuestion {
  m: string;
  kind?: string;
  tag: string;
  type?: QuestionType;
  q: string;
  opts?: string[];
  ans?: number | string;
  refCode?: string;
  expect?: string;
  doc?: string;
}

/**
 * Sanitized question sent to frontend during an active quiz session.
 * Never exposes `ans` or `ansText` for choice questions prior to grading.
 */
export interface PublicQuestion {
  id: string;
  bid: number;
  m: string;
  tag: string;
  type: QuestionType;
  q: string;
  opts?: string[];
  refCode?: string;
  expect?: string;
  doc?: string;
}

export interface QuizSessionPayload {
  sessionId: string;
  level: number;
  isWrongPractice: boolean;
  wrongKeys: string[];
  questions: PublicQuestion[];
}

export interface QuizAnswerInput {
  questionId: string;
  bid: number;
  chosenText?: string;
  selfJudgeOk?: boolean;
}

export interface RecordQuizStepRequest {
  answer: QuizAnswerInput;
}

export interface RecordQuizStepResult {
  item: QuizGradedItem;
  state: UserSaveState;
}

export interface SubmitQuizRequest {
  sessionId: string;
  level: number;
  isWrongPractice: boolean;
  wrongKeys: string[];
  elapsedSec: number;
  answers: QuizAnswerInput[];
  /** Number of leading answers already recorded via `recordQuizStep` */
  recordedCount?: number;
}

export interface QuizGradedItem {
  questionId: string;
  bid: number;
  m: string;
  tag: string;
  type: QuestionType;
  q: string;
  chosen: string;
  ok: boolean;
  ansText: string;
  explain: string;
  wrongStreakCount: number;
  removedFromWrongBook: boolean;
}

export interface GradeSessionResult {
  passed: boolean;
  allRight: boolean;
  right: number;
  total: number;
  passLine: number;
  level: number;
  isWrongPractice: boolean;
  elapsedSec: number;
  items: QuizGradedItem[];
  state: UserSaveState;
}

export interface WrongBookItem {
  bid?: number;
  m: string;
  tag: string;
  q: string;
  type: QuestionType;
  level: number | null;
  opts: string[] | null;
  ansText: string;
  refCode?: string | null;
  expect?: string | null;
  doc?: string | null;
  chosen: string;
  correct: number;
  count: number;
  best: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleItem {
  id: number;
  text: string;
}

export interface ChatMessage {
  who: "me" | "bot";
  text: string;
  ts?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  stamp: string;
  ts: number;
  msgs: ChatMessage[];
}

export interface CalYM {
  y: number;
  m: number;
}

export interface UserSaveState {
  schemaVersion: number;
  starred: Record<string, boolean>;
  wrongBook: Record<string, WrongBookItem>;
  mastered: Record<string, boolean>;
  love: number;
  name: string;
  sched: Record<string, ScheduleItem[]>;
  checkin: Record<string, string[]>;
  cleared: Record<string, boolean>;
  currentLevel: number;
  calYM: CalYM;
  chatSessions: ChatSession[] | null;
  chatCurrent: string | null;
  memSearchHist: string[];
}

export interface WallpaperConfig {
  key: string;
  customDataUrl?: string | null;
}

export type AiMode = "local" | "proxy";

export interface AppSettings {
  font: number;
  icon: number;
  push: boolean;
  pushMin: number;
  masterVol: number;
  bgmVol: number;
  sfxVol: number;
  aiMode: AiMode;
  aiProxyUrl: string;
  wallpaper: WallpaperConfig;
}

export type AsrModeOption = "auto" | "browser" | "server" | "chat" | "text";
export type TtsEngineOption = "browser" | "astra";
export type CamFacingOption = "user" | "environment";

export interface AiRuntimeConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  system: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  timeout: number;
  asr: AsrModeOption;
  asrLang: string;
  asrModel: string;
  silenceMs: number;
  bargeIn: boolean;
  greet: boolean;
  greeting: string;
  tts: boolean;
  ttsEngine: TtsEngineOption;
  ttsBaseURL: string;
  ttsAvatar: string;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
  video: boolean;
  vision: boolean;
  visionModel: string;
  visionAsk: string;
  camFacing: CamFacingOption;
  frameW: number;
  frameQ: number;
}

export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
}

export interface AiChatInvokeRequest {
  requestId: string;
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  timeoutMs?: number;
}

export interface AiStreamEventPayload {
  requestId: string;
  full: string;
  delta: string;
}

export interface AiTranscribeInvokeRequest {
  audioBase64: string;
  mimeType: string;
  model?: string;
  language?: string;
}

export interface AiTtsInvokeRequest {
  text: string;
  speed?: number;
  avatarId?: string;
}

export interface AiAvatarItem {
  id: string;
  name: string;
}

export interface MusicTrack {
  id: string;
  kind: "builtin" | "import";
  src?: string;
  fileName?: string;
  mime?: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  size: number;
  bpm?: number;
  addedAt?: number;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
}

export interface MusicLibraryData {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
  mode: "order" | "shuffle";
  queueType: string;
  lastId: string | null;
  builtinWarned: boolean;
}

export interface BootstrapPayload {
  cards: CardChapter[];
  totalLevels: number;
  cardsPerLevel: number;
  wrongMasterStreak: number;
  state: UserSaveState;
  settings: AppSettings;
  musicLibrary: MusicLibraryData;
  aiConfig?: AiRuntimeConfig;
  resetNotice?: string | null;
}

export interface ChatRoleMessage {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatRoleMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string;
  };
  finish_reason?: string | null;
}

export interface ChatCompletionResponse {
  id?: string;
  choices: ChatCompletionChoice[];
  provider?: "zhipu" | "relay";
}

/**
 * Sentinel returned by the Rust backend when an API key is safely stored on disk
 * or injected at build time, ensuring the raw key never enters WebView JS memory or DOM.
 */
export const AI_KEY_MASK = "__MNK_STORED_KEY__";

export function isMaskedAiKey(val: string | undefined | null): boolean {
  return String(val || "").trim() === AI_KEY_MASK;
}

export const AI_CFG_DEFAULTS: AiRuntimeConfig = {
  baseURL: "http://127.0.0.1:8787",
  apiKey: "",
  model: "gemini-3.8-flash-high",
  system:
    "你是学习应用 Mnk Study Loop 里的助教 Lune。现在正在和同学语音通话，你的回答会被朗读出来。用中文、口语化、简洁地回答（一般一到三句话）；只聊 Python 入门和学习方法；例子最多三行；不确定就直接说不确定。不要使用 Markdown 记号、项目符号和表情符号。",
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
  timeout: 45000,
  asr: "auto",
  asrLang: "zh-CN",
  asrModel: "whisper-1",
  silenceMs: 1100,
  bargeIn: true,
  greet: true,
  greeting: "我在呢，有什么想问的就说吧。",
  tts: true,
  ttsEngine: "browser",
  ttsBaseURL: "",
  ttsAvatar: "",
  ttsVoice: "",
  ttsRate: 1,
  ttsPitch: 1,
  video: true,
  vision: true,
  visionModel: "",
  visionAsk: "看看我这边，简短说说你看到了什么。",
  camFacing: "user",
  frameW: 720,
  frameQ: 0.72,
};

export function createDefaultAiConfig(): AiRuntimeConfig {
  return {
    ...AI_CFG_DEFAULTS,
  };
}

export function resolveAiChatEndpoint(baseURL: string, originFallback = ""): string {
  let b = String(baseURL || "").trim();
  if (!b) {
    if (!originFallback || originFallback.startsWith("file:")) return "";
    b = originFallback;
  }
  b = b.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(b)) return b;
  if (/\/v\d+(\.\d+)?$/i.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

export function resolveAiAudioEndpoint(baseURL: string, originFallback = ""): string {
  const ep = resolveAiChatEndpoint(baseURL, originFallback);
  if (!ep) return "";
  return ep.replace(/\/chat\/completions$/i, "/audio/transcriptions");
}

export function createDefaultSaveState(now = new Date()): UserSaveState {
  return {
    schemaVersion: SAVE_VERSION,
    starred: {},
    wrongBook: {},
    mastered: {},
    love: 0,
    name: "用户1",
    sched: {},
    checkin: {},
    cleared: {},
    currentLevel: 1,
    calYM: { y: now.getFullYear(), m: now.getMonth() + 1 },
    chatSessions: null,
    chatCurrent: null,
    memSearchHist: [],
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    font: 16,
    icon: 56,
    push: false,
    pushMin: 30,
    masterVol: 80,
    bgmVol: 60,
    sfxVol: 70,
    aiMode: "proxy",
    aiProxyUrl: "http://127.0.0.1:8787/v1/chat/completions",
    wallpaper: {
      key: "home",
      customDataUrl: null,
    },
  };
}

export const BUILTIN_TRACKS: readonly MusicTrack[] = [
  { id: "builtin-qingsong", kind: "builtin", src: "/bgm/轻松.mp3", title: "轻松", artist: "内置曲目", album: "", duration: 0, size: 0, bpm: 84 },
  { id: "builtin-yuyue", kind: "builtin", src: "/bgm/愉悦.mp3", title: "愉悦", artist: "内置曲目", album: "", duration: 0, size: 0, bpm: 108 },
  { id: "builtin-jiepai", kind: "builtin", src: "/bgm/节拍.mp3", title: "节拍", artist: "内置曲目", album: "", duration: 0, size: 0, bpm: 120 },
  { id: "builtin-mingxiang", kind: "builtin", src: "/bgm/冥想.mp3", title: "冥想", artist: "内置曲目", album: "", duration: 0, size: 0, bpm: 66 },
] as const;

export const DEFAULT_TRACK_ID = "builtin-jiepai";

export function createDefaultMusicLibrary(): MusicLibraryData {
  return {
    tracks: BUILTIN_TRACKS.map((t) => ({ ...t })),
    playlists: [],
    mode: "order",
    queueType: "all",
    lastId: DEFAULT_TRACK_ID,
    builtinWarned: false,
  };
}

export function formatTodayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

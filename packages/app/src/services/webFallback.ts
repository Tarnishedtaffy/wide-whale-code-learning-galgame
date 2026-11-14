import {
  AI_KEY_MASK,
  BUILTIN_TRACKS,
  CARDS_PER_LEVEL,
  DEFAULT_TRACK_ID,
  FOOD_ICONS,
  SAVE_VERSION,
  WRONG_MASTER_N,
  createDefaultAiConfig,
  createDefaultMusicLibrary,
  createDefaultSaveState,
  createDefaultSettings,
  formatTodayKey,
  isMaskedAiKey,
  type AiRuntimeConfig,
  type AppSettings,
  type BootstrapPayload,
  type CardChapter,
  type GradeSessionResult,
  type MusicLibraryData,
  type PublicQuestion,
  type QuizAnswerInput,
  type QuizGradedItem,
  type QuizSessionPayload,
  type RawQuestion,
  type RecordQuizStepRequest,
  type RecordQuizStepResult,
  type SubmitQuizRequest,
  type UserSaveState,
} from "@mnk/shared";
import cardBankJson from "@/assets/generated/card_bank.json";
import quizBankJson from "@/assets/generated/quiz_bank.json";

const LS_STATE_KEY = "mnk_state";
const LS_SETTINGS_KEY = "mnk_settings_v2";
const LS_WALLPAPER_KEY = "mnk_home_bg_v1";
const LS_MUSIC_KEY = "mnk_music_lib_v1";
const LS_AI_CFG_KEY = "mnk_ai_cfg_v1";
const IDB_NAME = "mnk_music_db";
const IDB_STORE = "audio";

const chapters = cardBankJson as CardChapter[];
const rawBank = quizBankJson as RawQuestion[];
const totalLevels = Math.max(1, Math.ceil(rawBank.length / CARDS_PER_LEVEL));

function enforceStateInvariants(state: UserSaveState): UserSaveState {
  state.schemaVersion = SAVE_VERSION;
  const trimmedName = String(state.name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
  state.name = trimmedName || "用户1";

  const cleanCleared: Record<string, boolean> = {};
  let maxCleared = 0;
  for (const [k, v] of Object.entries(state.cleared || {})) {
    if (!v) continue;
    const n = Number.parseInt(k, 10);
    if (n >= 1 && n <= totalLevels) {
      cleanCleared[String(n)] = true;
      if (n > maxCleared) maxCleared = n;
    }
  }
  state.cleared = cleanCleared;
  state.currentLevel = Math.min(Math.max(maxCleared + 1, 1), totalLevels);

  const y = Number(state.calYM?.y);
  const m = Number(state.calYM?.m);
  if (!(y >= 1970 && y <= 2999 && m >= 1 && m <= 12)) {
    const now = new Date();
    state.calYM = { y: now.getFullYear(), m: now.getMonth() + 1 };
  }
  if (Array.isArray(state.memSearchHist)) {
    state.memSearchHist = state.memSearchHist.slice(0, 10);
  } else {
    state.memSearchHist = [];
  }
  return state;
}

function loadWebState(): { state: UserSaveState; resetNotice: string | null } {
  try {
    const raw = localStorage.getItem(LS_STATE_KEY);
    if (!raw) return { state: createDefaultSaveState(), resetNotice: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.data !== "object") {
      localStorage.removeItem(LS_STATE_KEY);
      return {
        state: createDefaultSaveState(),
        resetNotice: "检测到旧版存档，无法兼容，学习进度已重置",
      };
    }
    if (parsed.v !== SAVE_VERSION) {
      localStorage.removeItem(LS_STATE_KEY);
      return {
        state: createDefaultSaveState(),
        resetNotice: `存档版本不兼容（v${parsed.v} → v${SAVE_VERSION}），学习进度已重置`,
      };
    }
    const merged: UserSaveState = {
      ...createDefaultSaveState(),
      ...parsed.data,
    };
    return { state: enforceStateInvariants(merged), resetNotice: null };
  } catch {
    return { state: createDefaultSaveState(), resetNotice: null };
  }
}

function persistWebState(state: UserSaveState): UserSaveState {
  const next = enforceStateInvariants({ ...state });
  try {
    localStorage.setItem(LS_STATE_KEY, JSON.stringify({ v: SAVE_VERSION, data: next }));
  } catch {
    // Slim chat sessions fallback on Web quota pressure
    if (Array.isArray(next.chatSessions)) {
      next.chatSessions = next.chatSessions.slice(0, 8).map((s) => ({
        ...s,
        msgs: (s.msgs || []).slice(-30).map((m) => ({
          who: m.who,
          text: String(m.text || "").slice(0, 600),
          ts: m.ts,
        })),
      }));
      localStorage.setItem(LS_STATE_KEY, JSON.stringify({ v: SAVE_VERSION, data: next }));
    }
  }
  return next;
}

function loadWebSettings(): AppSettings {
  const def = createDefaultSettings();
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (raw) {
      Object.assign(def, JSON.parse(raw));
    }
    const wpRaw = localStorage.getItem(LS_WALLPAPER_KEY);
    if (wpRaw) {
      const wp = JSON.parse(wpRaw) as { k?: string; d?: string };
      if (wp.k) def.wallpaper.key = wp.k;
      if (wp.d) def.wallpaper.customDataUrl = wp.d;
    }
  } catch {
    // ignore
  }
  return def;
}

function persistWebSettings(settings: AppSettings): AppSettings {
  const copy: AppSettings = {
    ...settings,
    wallpaper: { ...settings.wallpaper },
  };
  try {
    const { customDataUrl, key } = copy.wallpaper;
    localStorage.setItem(
      LS_SETTINGS_KEY,
      JSON.stringify({ ...copy, wallpaper: { key, customDataUrl: null } })
    );
    localStorage.setItem(
      LS_WALLPAPER_KEY,
      JSON.stringify(customDataUrl ? { k: key, d: customDataUrl } : { k: key })
    );
  } catch {
    // ignore
  }
  return copy;
}

function loadWebMusicLibrary(): MusicLibraryData {
  const def = createDefaultMusicLibrary();
  try {
    const raw = localStorage.getItem(LS_MUSIC_KEY);
    if (!raw) return def;
    const o = JSON.parse(raw) as Partial<MusicLibraryData>;
    const imported = Array.isArray(o.tracks)
      ? o.tracks.filter((t) => t && t.kind === "import")
      : [];
    const tracks = [...BUILTIN_TRACKS.map((t) => ({ ...t })), ...imported];
    const validIds = new Set(tracks.map((t) => t.id));
    const playlists = Array.isArray(o.playlists)
      ? o.playlists.map((p) => ({
          id: p.id,
          name: String(p.name || "").slice(0, 24),
          trackIds: Array.isArray(p.trackIds) ? p.trackIds.filter((id) => validIds.has(id)) : [],
        }))
      : [];
    const lastId = o.lastId && validIds.has(o.lastId) ? o.lastId : DEFAULT_TRACK_ID;
    return {
      tracks,
      playlists,
      mode: o.mode === "shuffle" ? "shuffle" : "order",
      queueType: typeof o.queueType === "string" ? o.queueType : "all",
      lastId,
      builtinWarned: Boolean(o.builtinWarned),
    };
  } catch {
    return def;
  }
}

function persistWebMusicLibrary(lib: MusicLibraryData): MusicLibraryData {
  try {
    localStorage.setItem(LS_MUSIC_KEY, JSON.stringify(lib));
  } catch {
    // ignore
  }
  return lib;
}

const SS_AI_SESSION_KEY = "mnk_ai_session_key_v1";

function readSessionApiKey(): string {
  try {
    if (typeof sessionStorage !== "undefined") {
      return (sessionStorage.getItem(SS_AI_SESSION_KEY) || "").trim();
    }
  } catch {
    // ignore
  }
  return "";
}

function writeSessionApiKey(val: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      const trimmed = val.trim();
      if (trimmed) sessionStorage.setItem(SS_AI_SESSION_KEY, trimmed);
      else sessionStorage.removeItem(SS_AI_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

function loadWebAiConfig(): AiRuntimeConfig {
  const def = createDefaultAiConfig();
  try {
    const raw = localStorage.getItem(LS_AI_CFG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiRuntimeConfig>;
      Object.assign(def, parsed);
    }
  } catch {
    // ignore
  }
  // Never keep plaintext keys in persistent localStorage; migrate/read from tab-scoped sessionStorage
  if (def.apiKey && !isMaskedAiKey(def.apiKey)) {
    writeSessionApiKey(def.apiKey);
    try {
      localStorage.setItem(LS_AI_CFG_KEY, JSON.stringify({ ...def, apiKey: "" }));
    } catch {
      // ignore
    }
  }
  def.apiKey = readSessionApiKey();
  return def;
}

function persistWebAiConfig(cfg: AiRuntimeConfig): AiRuntimeConfig {
  const next: AiRuntimeConfig = { ...createDefaultAiConfig(), ...cfg };
  if (isMaskedAiKey(next.apiKey)) {
    next.apiKey = readSessionApiKey();
  } else {
    writeSessionApiKey(next.apiKey || "");
  }
  try {
    // Strip apiKey before persisting to localStorage
    const toStore = {
      ...next,
      apiKey: "",
    };
    localStorage.setItem(LS_AI_CFG_KEY, JSON.stringify(toStore));
  } catch {
    // ignore
  }
  return {
    ...next,
    apiKey: next.apiKey ? AI_KEY_MASK : "",
  };
}

function openAudioIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持本地音频存储"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB 打开失败"));
  });
}

function explainFor(tag: string, doc?: string): string {
  const trimmedDoc = (doc || "").trim();
  if (
    trimmedDoc &&
    !trimmedDoc.startsWith("Python 官方文档") &&
    !trimmedDoc.startsWith("PEP ")
  ) {
    return trimmedDoc;
  }
  for (const ch of chapters) {
    for (const c of ch.cards) {
      if (c.tag === tag) return c.a;
    }
  }
  return trimmedDoc || "回顾一下该知识点的定义与常见写法。";
}

function ansTextOfRaw(raw: RawQuestion): string {
  if (raw.type === "code") return "见参考答案";
  const idx = typeof raw.ans === "number" ? raw.ans : 0;
  return raw.opts?.[idx] ?? "";
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

let cachedState: UserSaveState | null = null;

function ensureCachedState(): UserSaveState {
  if (!cachedState) {
    cachedState = loadWebState().state;
  }
  return cachedState;
}

function gradeOneWebAnswer(
  st: UserSaveState,
  ans: QuizAnswerInput,
  updateWrongBook: boolean,
  now: number
): QuizGradedItem | null {
  const raw = ans.bid >= 0 ? rawBank[ans.bid] : undefined;
  if (raw) {
    const ansText = ansTextOfRaw(raw);
    const qType = raw.type === "code" ? "code" : "choice";
    const ok =
      qType === "code"
        ? Boolean(ans.selfJudgeOk)
        : Boolean(ans.chosenText && ans.chosenText === ansText);
    const chosen =
      qType === "code" ? (ok ? "自评正确" : "自评错误") : ans.chosenText || "";
    const wkey = `b${ans.bid}`;
    let streak = 0;
    let removed = false;

    if (updateWrongBook) {
      if (!ok) {
        const prev = st.wrongBook[wkey];
        if (!prev) {
          st.wrongBook[wkey] = {
            bid: ans.bid,
            m: raw.m,
            tag: raw.tag,
            q: raw.q,
            type: qType,
            level: Math.floor(ans.bid / CARDS_PER_LEVEL) + 1,
            opts: qType === "code" ? null : (raw.opts ?? null),
            ansText,
            refCode: raw.refCode ?? null,
            expect: raw.expect ?? null,
            doc: raw.doc ?? null,
            chosen,
            correct: 0,
            count: 1,
            best: 0,
            createdAt: now,
            updatedAt: now,
          };
        } else {
          prev.chosen = chosen || prev.chosen;
          prev.count = (prev.count || 0) + 1;
          prev.updatedAt = now;
          prev.best = Math.max(prev.best || 0, prev.correct || 0);
          prev.correct = 0;
        }
      } else {
        const prev = st.wrongBook[wkey];
        if (prev) {
          prev.correct = (prev.correct || 0) + 1;
          prev.best = Math.max(prev.best || 0, prev.correct);
          prev.updatedAt = now;
          if (prev.correct >= WRONG_MASTER_N) {
            delete st.wrongBook[wkey];
            streak = WRONG_MASTER_N;
            removed = true;
          } else {
            streak = prev.correct;
          }
        }
      }
    } else if (ok && st.wrongBook[wkey]) {
      streak = st.wrongBook[wkey].correct || 0;
    }

    return {
      questionId: ans.questionId,
      bid: ans.bid,
      m: raw.m,
      tag: raw.tag,
      type: qType,
      q: raw.q,
      chosen,
      ok,
      ansText,
      explain: explainFor(raw.tag, raw.doc),
      wrongStreakCount: streak,
      removedFromWrongBook: removed,
    };
  }
  return null;
}

export const webFallbackGateway = {
  async getBootstrapData(): Promise<BootstrapPayload> {
    const { state, resetNotice } = loadWebState();
    cachedState = state;
    return {
      cards: chapters,
      totalLevels,
      cardsPerLevel: CARDS_PER_LEVEL,
      wrongMasterStreak: WRONG_MASTER_N,
      state,
      settings: loadWebSettings(),
      musicLibrary: loadWebMusicLibrary(),
      aiConfig: (() => {
        const cfg = loadWebAiConfig();
        return { ...cfg, apiKey: cfg.apiKey ? AI_KEY_MASK : "" };
      })(),
      resetNotice,
    };
  },

  async startLevelSession(level: number): Promise<QuizSessionPayload> {
    const st = ensureCachedState();
    const lv = Math.min(Math.max(Math.trunc(level) || 1, 1), totalLevels);
    const unlocked = lv <= 1 || Boolean(st.cleared[String(lv - 1)]) || Boolean(st.cleared[String(lv)]);
    if (!unlocked) {
      throw new Error(`先通过第 ${lv - 1} 关的测试`);
    }
    const start = (lv - 1) * CARDS_PER_LEVEL;
    const slice = rawBank.slice(start, start + CARDS_PER_LEVEL);
    const questions: PublicQuestion[] = slice.map((raw, i) => {
      const bid = start + i;
      if (raw.type === "code") {
        return {
          id: `${lv}-${i + 1}`,
          bid,
          m: raw.m,
          tag: raw.tag,
          type: "code",
          q: raw.q,
          refCode: raw.refCode,
          expect: raw.expect,
          doc: raw.doc,
        };
      }
      return {
        id: `${lv}-${i + 1}`,
        bid,
        m: raw.m,
        tag: raw.tag,
        type: "choice",
        q: raw.q,
        opts: shuffleArray(raw.opts ?? []),
        doc: raw.doc,
      };
    });

    return {
      sessionId: `web-lv-${lv}-${Date.now()}`,
      level: lv,
      isWrongPractice: false,
      wrongKeys: [],
      questions,
    };
  },

  async startWrongPracticeSession(keys: string[]): Promise<QuizSessionPayload> {
    const st = ensureCachedState();
    const targetKeys = keys.length > 0 ? keys : Object.keys(st.wrongBook || {});
    const usedKeys: string[] = [];
    const questions: PublicQuestion[] = [];

    for (const k of targetKeys) {
      const it = st.wrongBook[k];
      if (!it) continue;
      usedKeys.push(k);
      if (it.type === "code") {
        questions.push({
          id: `w-${k}`,
          bid: it.bid ?? -1,
          m: it.m,
          tag: it.tag,
          type: "code",
          q: it.q,
          refCode: it.refCode ?? undefined,
          expect: it.expect ?? undefined,
          doc: it.doc ?? undefined,
        });
      } else {
        questions.push({
          id: `w-${k}`,
          bid: it.bid ?? -1,
          m: it.m,
          tag: it.tag,
          type: "choice",
          q: it.q,
          opts: (it.opts ?? []).slice(),
          doc: it.doc ?? undefined,
        });
      }
    }
    if (!questions.length) {
      throw new Error("错题本是空的");
    }
    return {
      sessionId: `web-wp-${Date.now()}`,
      level: -1,
      isWrongPractice: true,
      wrongKeys: usedKeys,
      questions,
    };
  },

  async recordQuizStep(req: RecordQuizStepRequest): Promise<RecordQuizStepResult> {
    const st = ensureCachedState();
    const item = gradeOneWebAnswer(st, req.answer, true, Date.now());
    if (!item) {
      throw new Error(`未找到题目记录: ${req.answer.questionId}`);
    }
    const saved = persistWebState(st);
    cachedState = saved;
    return {
      item,
      state: JSON.parse(JSON.stringify(saved)),
    };
  },

  async submitQuizSession(req: SubmitQuizRequest): Promise<GradeSessionResult> {
    const st = ensureCachedState();
    const now = Date.now();
    const today = formatTodayKey();
    const food = FOOD_ICONS[Math.floor(Math.random() * FOOD_ICONS.length)];
    const recordedCount = req.recordedCount ?? 0;

    const items: QuizGradedItem[] = [];
    let right = 0;

    for (let idx = 0; idx < req.answers.length; idx++) {
      const item = gradeOneWebAnswer(st, req.answers[idx], idx >= recordedCount, now);
      if (item) {
        if (item.ok) right += 1;
        items.push(item);
      }
    }

    const total = items.length;
    const allRight = right === total;
    const passLine = Math.ceil(total * 0.75);
    const passed = right >= passLine;

    if (passed && !req.isWrongPractice) {
      const lv = Math.max(1, req.level);
      st.cleared[String(lv)] = true;
      st.currentLevel = Math.min(Math.max(st.currentLevel, lv + 1), totalLevels);
      st.love += 10;
      if (!st.checkin[today]?.length) {
        st.checkin[today] = [food];
      }
    }

    const saved = persistWebState(st);
    cachedState = saved;

    return {
      passed,
      allRight,
      right,
      total,
      passLine,
      level: req.isWrongPractice ? -1 : req.level,
      isWrongPractice: req.isWrongPractice,
      elapsedSec: req.elapsedSec,
      items,
      state: JSON.parse(JSON.stringify(saved)),
    };
  },

  async recordCardFlip(cardId: string): Promise<UserSaveState> {
    const st = ensureCachedState();
    if (!st.mastered[cardId]) {
      st.mastered[cardId] = true;
      st.love += 1;
      const today = formatTodayKey();
      if (!st.checkin[today]?.length) {
        st.checkin[today] = [FOOD_ICONS[Math.floor(Math.random() * FOOD_ICONS.length)]];
      }
      cachedState = persistWebState(st);
    }
    return JSON.parse(JSON.stringify(cachedState));
  },

  async saveUserState(state: UserSaveState): Promise<UserSaveState> {
    cachedState = persistWebState(state);
    return JSON.parse(JSON.stringify(cachedState));
  },

  async saveAppSettings(settings: AppSettings): Promise<AppSettings> {
    return persistWebSettings(settings);
  },

  async saveCustomWallpaper(key: string, dataUrl: string): Promise<AppSettings> {
    const s = loadWebSettings();
    s.wallpaper = { key, customDataUrl: dataUrl };
    return persistWebSettings(s);
  },

  async resetCustomWallpaper(): Promise<AppSettings> {
    const s = loadWebSettings();
    s.wallpaper.key = "home";
    return persistWebSettings(s);
  },

  async saveMusicLibrary(library: MusicLibraryData): Promise<MusicLibraryData> {
    return persistWebMusicLibrary(library);
  },

  async saveImportedAudio(trackId: string, file: Blob): Promise<void> {
    const db = await openAudioIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(file, trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("音频写入失败"));
    });
  },

  async readImportedAudio(trackId: string, mime = "audio/mpeg"): Promise<Blob> {
    const db = await openAudioIdb();
    return new Promise<Blob>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const rq = tx.objectStore(IDB_STORE).get(trackId);
      rq.onsuccess = () => {
        const res = rq.result;
        if (!res) {
          reject(new Error("本地音频数据丢失，请重新导入"));
          return;
        }
        resolve(res instanceof Blob ? res : new Blob([res], { type: mime }));
      };
      rq.onerror = () => reject(rq.error || new Error("音频读取失败"));
    });
  },

  async deleteImportedAudio(trackId: string): Promise<void> {
    const db = await openAudioIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  async getAiConfig(): Promise<AiRuntimeConfig> {
    const cfg = loadWebAiConfig();
    return {
      ...cfg,
      apiKey: cfg.apiKey ? AI_KEY_MASK : "",
    };
  },

  async saveAiConfig(config: AiRuntimeConfig): Promise<AiRuntimeConfig> {
    return persistWebAiConfig(config);
  },

  async resetAiConfig(): Promise<AiRuntimeConfig> {
    writeSessionApiKey("");
    try {
      localStorage.removeItem(LS_AI_CFG_KEY);
    } catch {
      // ignore
    }
    return createDefaultAiConfig();
  },

  getUnmaskedSessionKey(): string {
    return readSessionApiKey();
  },
};

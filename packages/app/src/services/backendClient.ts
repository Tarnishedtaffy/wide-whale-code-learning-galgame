import { invoke } from "@tauri-apps/api/core";
import {
  SAVE_VERSION,
  type AiAvatarItem,
  type AiChatInvokeRequest,
  type AiRuntimeConfig,
  type AiTranscribeInvokeRequest,
  type AiTtsInvokeRequest,
  type AppSettings,
  type BootstrapPayload,
  type GradeSessionResult,
  type MusicLibraryData,
  type QuizSessionPayload,
  type RecordQuizStepRequest,
  type RecordQuizStepResult,
  type SubmitQuizRequest,
  type UserSaveState,
} from "@mnk/shared";
import { webFallbackGateway } from "./webFallback";

const LS_STATE_MIRROR_KEY = "mnk_state_backup_v5";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function normalizeRuntimeState(st: UserSaveState): UserSaveState {
  const anySt = st as UserSaveState & { calYm?: { y: number; m: number } };
  if (!st.calYM && anySt.calYm) {
    st.calYM = { y: anySt.calYm.y, m: anySt.calYm.m };
  }
  if (!st.calYM || typeof st.calYM.y !== "number" || typeof st.calYM.m !== "number") {
    const now = new Date();
    st.calYM = { y: now.getFullYear(), m: now.getMonth() + 1 };
  }
  if (!st.wrongBook) st.wrongBook = {};
  if (!st.starred) st.starred = {};
  if (!st.mastered) st.mastered = {};
  if (!st.cleared) st.cleared = {};
  if (!st.sched) st.sched = {};
  if (!st.checkin) st.checkin = {};
  if (!Array.isArray(st.memSearchHist)) st.memSearchHist = [];
  return st;
}

function isFreshBlankState(st: UserSaveState): boolean {
  return (
    Object.keys(st.wrongBook || {}).length === 0 &&
    Object.keys(st.mastered || {}).length === 0 &&
    Object.keys(st.cleared || {}).length === 0 &&
    Object.keys(st.starred || {}).length === 0 &&
    (st.love || 0) === 0
  );
}

function mirrorStateBackup(st: UserSaveState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      LS_STATE_MIRROR_KEY,
      JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), data: st })
    );
  } catch {
    // ignore quota errors on mirror
  }
}

function readStateBackup(): UserSaveState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_STATE_MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; data?: UserSaveState };
    if (parsed?.v === SAVE_VERSION && parsed.data && typeof parsed.data === "object") {
      return normalizeRuntimeState(parsed.data);
    }
  } catch {
    // ignore
  }
  return null;
}

function toArrayBuffer(raw: ArrayBuffer | Uint8Array | number[]): ArrayBuffer {
  if (raw instanceof ArrayBuffer) return raw;
  if (raw instanceof Uint8Array) {
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return copy.buffer;
  }
  return new Uint8Array(raw).buffer;
}

export const backendClient = {
  async getBootstrapData(): Promise<BootstrapPayload> {
    if (!isTauriRuntime()) return webFallbackGateway.getBootstrapData();
    const boot = await invoke<BootstrapPayload>("get_bootstrap_data");
    boot.state = normalizeRuntimeState(boot.state);
    if (isFreshBlankState(boot.state)) {
      const backup = readStateBackup();
      if (backup && !isFreshBlankState(backup)) {
        try {
          boot.state = await invoke<UserSaveState>("save_user_state", { state: backup });
          boot.state = normalizeRuntimeState(boot.state);
        } catch {
          boot.state = backup;
        }
      }
    }
    mirrorStateBackup(boot.state);
    return boot;
  },

  async startLevelSession(level: number): Promise<QuizSessionPayload> {
    if (!isTauriRuntime()) return webFallbackGateway.startLevelSession(level);
    return invoke<QuizSessionPayload>("start_level_session", { level });
  },

  async startWrongPracticeSession(keys: string[]): Promise<QuizSessionPayload> {
    if (!isTauriRuntime()) return webFallbackGateway.startWrongPracticeSession(keys);
    return invoke<QuizSessionPayload>("start_wrong_practice_session", { keys });
  },

  async recordQuizStep(request: RecordQuizStepRequest): Promise<RecordQuizStepResult> {
    if (!isTauriRuntime()) return webFallbackGateway.recordQuizStep(request);
    const res = await invoke<RecordQuizStepResult>("record_quiz_step", { request });
    res.state = normalizeRuntimeState(res.state);
    mirrorStateBackup(res.state);
    return res;
  },

  async submitQuizSession(request: SubmitQuizRequest): Promise<GradeSessionResult> {
    if (!isTauriRuntime()) return webFallbackGateway.submitQuizSession(request);
    const res = await invoke<GradeSessionResult>("submit_quiz_session", { request });
    res.state = normalizeRuntimeState(res.state);
    mirrorStateBackup(res.state);
    return res;
  },

  async recordCardFlip(cardId: string): Promise<UserSaveState> {
    if (!isTauriRuntime()) return webFallbackGateway.recordCardFlip(cardId);
    const st = normalizeRuntimeState(
      await invoke<UserSaveState>("record_card_flip", { cardId })
    );
    mirrorStateBackup(st);
    return st;
  },

  async saveUserState(state: UserSaveState): Promise<UserSaveState> {
    if (!isTauriRuntime()) return webFallbackGateway.saveUserState(state);
    const saved = normalizeRuntimeState(
      await invoke<UserSaveState>("save_user_state", { state })
    );
    mirrorStateBackup(saved);
    return saved;
  },

  async saveAppSettings(settings: AppSettings): Promise<AppSettings> {
    if (!isTauriRuntime()) return webFallbackGateway.saveAppSettings(settings);
    return invoke<AppSettings>("save_app_settings", { settings });
  },

  async saveCustomWallpaper(key: string, dataUrl: string): Promise<AppSettings> {
    if (!isTauriRuntime()) return webFallbackGateway.saveCustomWallpaper(key, dataUrl);
    return invoke<AppSettings>("save_custom_wallpaper", { key, dataUrl });
  },

  async resetCustomWallpaper(): Promise<AppSettings> {
    if (!isTauriRuntime()) return webFallbackGateway.resetCustomWallpaper();
    return invoke<AppSettings>("reset_custom_wallpaper");
  },

  async saveMusicLibrary(library: MusicLibraryData): Promise<MusicLibraryData> {
    if (!isTauriRuntime()) return webFallbackGateway.saveMusicLibrary(library);
    return invoke<MusicLibraryData>("save_music_library", { library });
  },

  async saveImportedAudio(trackId: string, file: Blob): Promise<void> {
    if (!isTauriRuntime()) return webFallbackGateway.saveImportedAudio(trackId, file);
    const base64Data = await blobToBase64(file);
    await invoke<void>("save_imported_audio", { trackId, base64Data });
  },

  async readImportedAudio(trackId: string, mime = "audio/mpeg"): Promise<Blob> {
    if (!isTauriRuntime()) return webFallbackGateway.readImportedAudio(trackId, mime);
    const raw = await invoke<ArrayBuffer | Uint8Array | number[]>("read_imported_audio", {
      trackId,
    });
    return new Blob([toArrayBuffer(raw)], { type: mime });
  },

  async deleteImportedAudio(trackId: string): Promise<void> {
    if (!isTauriRuntime()) return webFallbackGateway.deleteImportedAudio(trackId);
    await invoke<void>("delete_imported_audio", { trackId });
  },

  async getAiConfig(): Promise<AiRuntimeConfig> {
    if (!isTauriRuntime()) return webFallbackGateway.getAiConfig();
    return invoke<AiRuntimeConfig>("get_ai_config");
  },

  async saveAiConfig(config: AiRuntimeConfig): Promise<AiRuntimeConfig> {
    if (!isTauriRuntime()) return webFallbackGateway.saveAiConfig(config);
    return invoke<AiRuntimeConfig>("save_ai_config", { config });
  },

  async resetAiConfig(): Promise<AiRuntimeConfig> {
    if (!isTauriRuntime()) return webFallbackGateway.resetAiConfig();
    return invoke<AiRuntimeConfig>("reset_ai_config");
  },

  async aiChatRequest(request: AiChatInvokeRequest): Promise<string> {
    return invoke<string>("ai_chat_request", { request });
  },

  async aiTranscribeAudio(request: AiTranscribeInvokeRequest): Promise<string> {
    return invoke<string>("ai_transcribe_audio", { request });
  },

  async aiTtsSpeech(request: AiTtsInvokeRequest): Promise<ArrayBuffer> {
    const raw = await invoke<ArrayBuffer | Uint8Array | number[]>("ai_tts_speech", {
      request,
    });
    return toArrayBuffer(raw);
  },

  async aiTtsAvatars(): Promise<AiAvatarItem[]> {
    return invoke<AiAvatarItem[]>("ai_tts_avatars");
  },
};

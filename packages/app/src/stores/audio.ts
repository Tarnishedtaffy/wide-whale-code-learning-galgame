import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  DEFAULT_TRACK_ID,
  createDefaultMusicLibrary,
  type MusicLibraryData,
  type MusicPlaylist,
  type MusicTrack,
} from "@mnk/shared";
import { backendClient } from "@/services/backendClient";
import {
  cleanAudioTag,
  detectAudioKind,
  mimeOfAudioKind,
  parseFlacTags,
  parseMp3Tags,
  parseWavTags,
  probeAudioDuration,
} from "@/services/audioTagParser";
import { useSettingsStore } from "./settings";
import { useNavigationStore } from "./navigation";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_URL_CACHE = 5;
const DEFAULT_BPM = 96;

function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useAudioStore = defineStore("audio", () => {
  const library = ref<MusicLibraryData>(createDefaultMusicLibrary());
  const tab = ref<"all" | "playlists" | "import">("all");
  const activePlaylistId = ref<string | null>(null);
  const selectedIds = ref<Record<string, boolean>>({});
  const currentId = ref<string | null>(DEFAULT_TRACK_ID);
  const queue = ref<string[]>([]);
  const playing = ref(false);
  const importing = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);

  let audioEl: HTMLAudioElement | null = null;
  let autoAttempt = false;
  let unlockArmed = false;
  let unlockTrackId = "";
  let failStreak = 0;
  const urlCache = new Map<string, string>();

  const currentTrack = computed<MusicTrack | null>(() => {
    if (!currentId.value) return null;
    return library.value.tracks.find((t) => t.id === currentId.value) || null;
  });

  const currentBpm = computed<number>(() => currentTrack.value?.bpm || DEFAULT_BPM);

  const spinDurationSec = computed<string>(() => {
    const dur = Math.min(4, Math.max(1.2, 180 / currentBpm.value));
    return `${dur.toFixed(2)}s`;
  });

  const queueLabel = computed<string>(() => {
    if (library.value.queueType.startsWith("pl:")) {
      const plId = library.value.queueType.slice(3);
      const pl = library.value.playlists.find((p) => p.id === plId);
      if (pl) return pl.name;
    }
    return "全部音乐";
  });

  const selectedTrackIds = computed<string[]>(() =>
    Object.keys(selectedIds.value).filter(
      (id) => selectedIds.value[id] && library.value.tracks.some((t) => t.id === id)
    )
  );

  function ensureAudioElement(): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (audioEl) return audioEl;
    audioEl = new Audio();
    audioEl.preload = "none";
    audioEl.loop = false;

    audioEl.addEventListener("playing", () => {
      autoAttempt = false;
      playing.value = true;
      failStreak = 0;
    });
    audioEl.addEventListener("pause", () => {
      playing.value = false;
    });
    audioEl.addEventListener("ended", () => {
      void step(1, true);
    });
    audioEl.addEventListener("timeupdate", () => {
      if (!audioEl) return;
      currentTime.value = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        duration.value = audioEl.duration;
      }
    });
    const syncDur = () => {
      if (!audioEl) return;
      duration.value =
        Number.isFinite(audioEl.duration) && audioEl.duration > 0
          ? audioEl.duration
          : currentTrack.value?.duration || 0;
    };
    audioEl.addEventListener("loadedmetadata", syncDur);
    audioEl.addEventListener("durationchange", syncDur);
    audioEl.addEventListener("emptied", () => {
      currentTime.value = 0;
      duration.value = 0;
    });
    audioEl.addEventListener("error", () => {
      onAudioError();
    });
    syncVolumeFromSettings();
    return audioEl;
  }

  function syncVolumeFromSettings() {
    if (!audioEl) return;
    const s = useSettingsStore().settings;
    const vol = (s.masterVol / 100) * (s.bgmVol / 100);
    audioEl.volume = Math.min(1, Math.max(0, vol));
  }

  function hydrate(loaded: MusicLibraryData) {
    library.value = loaded;
    currentId.value = loaded.lastId || DEFAULT_TRACK_ID;
    ensureAudioElement();
    initAutoPlay();
  }

  async function persistLibrary() {
    try {
      library.value = await backendClient.saveMusicLibrary(library.value);
    } catch (err) {
      console.warn("[audio] 曲库保存失败:", err);
    }
  }

  function poolIds(): string[] {
    if (library.value.queueType.startsWith("pl:")) {
      const plId = library.value.queueType.slice(3);
      const pl = library.value.playlists.find((p) => p.id === plId);
      if (!pl) return [];
      return pl.trackIds.filter((id) => library.value.tracks.some((t) => t.id === id));
    }
    return library.value.tracks.map((t) => t.id);
  }

  function currentPoolType(): string {
    if (tab.value === "playlists" && activePlaylistId.value) {
      return `pl:${activePlaylistId.value}`;
    }
    return "all";
  }

  function buildQueue(keepId: string | null): string[] {
    const ids = poolIds().slice();
    if (library.value.mode === "shuffle") {
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      if (keepId) {
        const idx = ids.indexOf(keepId);
        if (idx > 0) {
          ids.splice(idx, 1);
          ids.unshift(keepId);
        }
      }
    }
    return ids;
  }

  async function resolveTrackUrl(track: MusicTrack): Promise<string> {
    if (track.kind === "builtin") {
      return track.src || "/bgm/节拍.mp3";
    }
    const cached = urlCache.get(track.id);
    if (cached) return cached;

    const blob = await backendClient.readImportedAudio(track.id, track.mime || "audio/mpeg");
    const url = URL.createObjectURL(blob);
    urlCache.set(track.id, url);

    if (urlCache.size > MAX_URL_CACHE) {
      for (const [k, oldUrl] of urlCache.entries()) {
        if (k !== currentId.value) {
          try {
            URL.revokeObjectURL(oldUrl);
          } catch {
            // ignore
          }
          urlCache.delete(k);
          break;
        }
      }
    }
    return url;
  }

  function dropTrackUrl(id: string) {
    const existing = urlCache.get(id);
    if (existing) {
      try {
        URL.revokeObjectURL(existing);
      } catch {
        // ignore
      }
      urlCache.delete(id);
    }
  }

  function armAutoPlayUnlock() {
    if (unlockArmed || typeof document === "undefined") return;
    unlockArmed = true;
    unlockTrackId = currentId.value || "";
    const unlock = () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      unlockArmed = false;
      if (playing.value || !audioEl) return;
      if (!currentId.value || currentId.value !== unlockTrackId) return;
      if (audioEl.getAttribute("src")) {
        audioEl.play().catch(() => {});
      } else {
        void playTrack(currentId.value);
      }
    };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
  }

  function initAutoPlay() {
    if (!currentId.value) return;
    autoAttempt = true;
    void playTrack(currentId.value, false, true);
  }

  async function playTrack(id: string, keepQueue = false, auto = false) {
    const nav = useNavigationStore();
    const track = library.value.tracks.find((t) => t.id === id);
    if (!track) return;

    const a = ensureAudioElement();
    if (!a) return;

    if (!keepQueue) {
      queue.value = buildQueue(id);
    }
    if (!queue.value.length) {
      queue.value = [id];
    }
    currentId.value = id;
    library.value.lastId = id;
    failStreak = 0;
    void persistLibrary();

    try {
      const url = await resolveTrackUrl(track);
      syncVolumeFromSettings();
      try {
        a.pause();
      } catch {
        // ignore
      }
      a.loop = false;
      a.src = url;
      try {
        a.currentTime = 0;
      } catch {
        // ignore
      }
      await a.play();
    } catch (err) {
      if (auto) {
        armAutoPlayUnlock();
      } else if (err instanceof Error && err.message.includes("丢失")) {
        nav.toast(`读取音频失败：${err.message}`);
      }
    }
  }

  async function togglePlay(targetId?: string) {
    const nav = useNavigationStore();
    const a = ensureAudioElement();
    if (!a) return;

    if (targetId) {
      if (currentId.value === targetId && a.getAttribute("src")) {
        if (!a.paused) {
          a.pause();
        } else {
          syncVolumeFromSettings();
          a.play().catch(() => {});
        }
        return;
      }
      library.value.queueType = currentPoolType();
      await persistLibrary();
      await playTrack(targetId);
      return;
    }

    if (!currentId.value) {
      const ids = poolIds();
      if (!ids.length) {
        nav.toast("曲库为空，请先导入音乐或创建歌单");
        return;
      }
      library.value.queueType = currentPoolType();
      await playTrack(ids[0]);
      return;
    }

    if (!a.getAttribute("src")) {
      await playTrack(currentId.value);
      return;
    }

    if (a.paused) {
      syncVolumeFromSettings();
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }

  async function step(dir: 1 | -1, auto = false) {
    const nav = useNavigationStore();
    const ids = queue.value.length ? queue.value.slice() : buildQueue(currentId.value);
    if (!ids.length) {
      if (!auto) nav.toast("曲目池为空");
      return;
    }
    let idx = currentId.value ? ids.indexOf(currentId.value) : -1;
    if (idx < 0) idx = dir > 0 ? -1 : 0;
    let nextIdx = idx + dir;
    if (nextIdx >= ids.length) {
      if (library.value.mode === "shuffle" && auto) {
        queue.value = buildQueue(null);
        if (queue.value.length) await playTrack(queue.value[0], true);
        return;
      }
      nextIdx = 0;
    }
    if (nextIdx < 0) nextIdx = ids.length - 1;
    queue.value = ids;
    await playTrack(ids[nextIdx], true);
  }

  function onAudioError() {
    const nav = useNavigationStore();
    if (!currentId.value) return;
    if (autoAttempt) {
      autoAttempt = false;
      playing.value = false;
      return;
    }
    const track = currentTrack.value;
    failStreak += 1;
    if (failStreak === 1) {
      if (track?.kind === "builtin") {
        if (!library.value.builtinWarned) {
          library.value.builtinWarned = true;
          void persistLibrary();
          nav.toast(`内置背景音乐《${track.title || "音频"}》加载失败`);
        }
      } else {
        nav.toast(`《${track?.title || track?.fileName || "音频"}》播放失败`);
      }
    }
    if (failStreak < Math.max(2, queue.value.length)) {
      window.setTimeout(() => void step(1, true), 400);
    } else {
      playing.value = false;
    }
  }

  async function togglePlaybackMode() {
    const nav = useNavigationStore();
    library.value.mode = library.value.mode === "shuffle" ? "order" : "shuffle";
    if (currentId.value) {
      queue.value = buildQueue(currentId.value);
    }
    await persistLibrary();
    nav.toast(library.value.mode === "shuffle" ? "已切换为随机轮播" : "已切换为顺序轮播");
  }

  async function playCurrentPool(playlistId?: string) {
    const nav = useNavigationStore();
    if (playlistId) {
      const pl = library.value.playlists.find((p) => p.id === playlistId);
      if (!pl || !pl.trackIds.length) {
        nav.toast("这个歌单还没有音乐");
        return;
      }
      library.value.queueType = `pl:${playlistId}`;
    } else {
      library.value.queueType = currentPoolType();
    }
    await persistLibrary();
    const q = buildQueue(null);
    if (!q.length) {
      nav.toast("曲目池为空");
      return;
    }
    await playTrack(q[0]);
  }

  // ---- Selection & Playlist Management ----
  function toggleSelectTrack(id: string, checked?: boolean) {
    const next = checked ?? !selectedIds.value[id];
    if (next) selectedIds.value[id] = true;
    else delete selectedIds.value[id];
  }

  function toggleSelectAll() {
    const allSelected =
      library.value.tracks.length > 0 &&
      library.value.tracks.every((t) => Boolean(selectedIds.value[t.id]));
    selectedIds.value = {};
    if (!allSelected) {
      for (const t of library.value.tracks) {
        selectedIds.value[t.id] = true;
      }
    }
  }

  function clearSelection() {
    selectedIds.value = {};
  }

  async function createPlaylist(name: string): Promise<MusicPlaylist> {
    const pl: MusicPlaylist = {
      id: uid("pl-"),
      name: name.trim().slice(0, 24),
      trackIds: [],
    };
    library.value.playlists.push(pl);
    await persistLibrary();
    return pl;
  }

  async function renamePlaylist(id: string, name: string) {
    const pl = library.value.playlists.find((p) => p.id === id);
    if (!pl) return;
    pl.name = name.trim().slice(0, 24);
    await persistLibrary();
    useNavigationStore().toast(`已重命名为「${pl.name}」`);
  }

  async function deletePlaylist(id: string) {
    library.value.playlists = library.value.playlists.filter((p) => p.id !== id);
    if (library.value.queueType === `pl:${id}`) {
      library.value.queueType = "all";
    }
    if (activePlaylistId.value === id) {
      activePlaylistId.value = null;
    }
    await persistLibrary();
    useNavigationStore().toast("歌单已删除");
  }

  async function addTracksToPlaylist(plId: string, ids: string[]) {
    const nav = useNavigationStore();
    const pl = library.value.playlists.find((p) => p.id === plId);
    if (!pl) return;
    let added = 0;
    for (const id of ids) {
      if (library.value.tracks.some((t) => t.id === id) && !pl.trackIds.includes(id)) {
        pl.trackIds.push(id);
        added += 1;
      }
    }
    await persistLibrary();
    clearSelection();
    nav.toast(added ? `已添加 ${added} 首到「${pl.name}」` : "这些音乐已在歌单中");
  }

  async function removeTrackFromPlaylist(plId: string, trackId: string) {
    const pl = library.value.playlists.find((p) => p.id === plId);
    if (!pl) return;
    pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
    await persistLibrary();
    useNavigationStore().toast("已移出歌单");
  }

  // ---- Local File Import & Delete ----
  async function deleteImportedTrack(id: string) {
    const t = library.value.tracks.find((x) => x.id === id);
    if (!t || t.kind !== "import") return;
    library.value.tracks = library.value.tracks.filter((x) => x.id !== id);
    for (const pl of library.value.playlists) {
      pl.trackIds = pl.trackIds.filter((x) => x !== id);
    }
    delete selectedIds.value[id];
    if (library.value.lastId === id) {
      library.value.lastId = DEFAULT_TRACK_ID;
    }
    if (currentId.value === id) {
      currentId.value = null;
      queue.value = queue.value.filter((x) => x !== id);
      if (audioEl) {
        try {
          audioEl.pause();
        } catch {
          // ignore
        }
        audioEl.removeAttribute("src");
        try {
          audioEl.load();
        } catch {
          // ignore
        }
      }
    }
    dropTrackUrl(id);
    await backendClient.deleteImportedAudio(id);
    await persistLibrary();
    useNavigationStore().toast("已从曲库删除");
  }

  async function importSingleFile(file: File): Promise<"ok" | "skip" | "fail"> {
    const nav = useNavigationStore();
    const name = file.name || "未命名音频";
    if (!file.size) {
      nav.toast(`${name} 是空文件，已跳过`);
      return "fail";
    }
    if (file.size > MAX_AUDIO_BYTES) {
      nav.toast(`${name} 超过 50MB 限制，已跳过`);
      return "fail";
    }
    if (
      library.value.tracks.some(
        (t) => t.kind === "import" && t.fileName === file.name && t.size === file.size
      )
    ) {
      nav.toast(`${name} 已在曲库中，已跳过`);
      return "skip";
    }

    const head = await file.slice(0, 16).arrayBuffer();
    const kind = detectAudioKind(head, name);
    if (!kind) {
      nav.toast(`${name} 格式不支持，仅支持 MP3 / WAV / FLAC`);
      return "fail";
    }

    const metaBuf = await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer();
    const tags =
      kind === "mp3"
        ? parseMp3Tags(metaBuf)
        : kind === "flac"
          ? parseFlacTags(metaBuf)
          : parseWavTags(metaBuf);

    const probe = await probeAudioDuration(file);
    if (!probe.ok) {
      nav.toast(`${name} 无法解码，文件可能损坏或当前设备不支持该格式`);
      return "fail";
    }

    const id = uid("imp-");
    await backendClient.saveImportedAudio(id, file);
    const baseName = name.replace(/\.[^.]+$/, "");
    library.value.tracks.push({
      id,
      kind: "import",
      fileName: name,
      mime: file.type || mimeOfAudioKind(kind),
      size: file.size,
      duration: probe.duration || 0,
      title: cleanAudioTag(tags.title) || baseName || "未命名音频",
      artist: cleanAudioTag(tags.artist) || "未知艺术家",
      album: cleanAudioTag(tags.album) || "",
      addedAt: Date.now(),
    });
    return "ok";
  }

  async function importFiles(files: FileList | File[]) {
    const nav = useNavigationStore();
    const list = Array.from(files || []);
    if (!list.length) return;
    if (importing.value) {
      nav.toast("正在导入中，请稍候…");
      return;
    }
    importing.value = true;
    let ok = 0;
    let fail = 0;
    let firstErr = "";

    try {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (list.length > 1 && i > 0) {
          nav.toast(`正在导入 ${i + 1} / ${list.length}：${f.name}`);
        }
        try {
          const r = await importSingleFile(f);
          if (r === "ok") ok += 1;
          else if (r === "fail") {
            fail += 1;
            if (!firstErr) firstErr = f.name;
          }
        } catch (err) {
          fail += 1;
          if (!firstErr) firstErr = err instanceof Error ? err.message : f.name;
        }
      }
    } finally {
      importing.value = false;
      await persistLibrary();
    }

    if (ok || fail) {
      nav.toast(
        ok
          ? `已导入 ${ok} 首${fail ? `，失败 ${fail} 首` : ""}`
          : `导入失败：${firstErr || "请检查音频格式"}`
      );
    }
  }

  function seekByPermille(permille: number) {
    if (!audioEl) return;
    const dur =
      Number.isFinite(audioEl.duration) && audioEl.duration > 0
        ? audioEl.duration
        : duration.value;
    if (!dur || dur <= 0) return;
    const ratio = Math.min(1, Math.max(0, permille / 1000));
    try {
      audioEl.currentTime = ratio * dur;
      currentTime.value = audioEl.currentTime;
    } catch {
      // ignore
    }
  }

  return {
    library,
    tab,
    activePlaylistId,
    selectedIds,
    currentId,
    playing,
    importing,
    currentTime,
    duration,
    currentTrack,
    currentBpm,
    spinDurationSec,
    queueLabel,
    selectedTrackIds,
    hydrate,
    syncVolumeFromSettings,
    playTrack,
    togglePlay,
    step,
    seekByPermille,
    togglePlaybackMode,
    playCurrentPool,
    toggleSelectTrack,
    toggleSelectAll,
    clearSelection,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    deleteImportedTrack,
    importFiles,
  };
});

<template>
  <!-- 曲库主层 -->
  <div
    id="musicLib"
    class="ml-layer"
    :class="{ show: nav.musicLibOpen }"
    :aria-hidden="!nav.musicLibOpen"
    @dragover.prevent
    @drop.prevent="onDropFiles"
  >
    <div class="ml-top">
      <button
        id="mlClose"
        class="ml-back"
        type="button"
        aria-label="返回"
        @click="nav.musicLibOpen = false"
      >
        ‹
      </button>
      <div class="ml-title">曲 库</div>
      <button
        id="mlModeBtn"
        class="ml-mode"
        :class="{ shuffle: audio.library.mode === 'shuffle' }"
        type="button"
        @click="audio.togglePlaybackMode()"
      >
        {{ audio.library.mode === "shuffle" ? "随机轮播" : "顺序轮播" }}
      </button>
    </div>

    <div id="mlTabs" class="ml-tabs">
      <button
        class="ml-tab"
        :class="{ on: audio.tab === 'all' }"
        type="button"
        @click="switchTab('all')"
      >
        全部音乐
      </button>
      <button
        class="ml-tab"
        :class="{ on: audio.tab === 'playlists' }"
        type="button"
        @click="switchTab('playlists')"
      >
        我的歌单
      </button>
      <button
        class="ml-tab"
        :class="{ on: audio.tab === 'import' }"
        type="button"
        @click="switchTab('import')"
      >
        导入音乐
      </button>
    </div>

    <div id="mlBody" class="ml-body">
      <!-- 1. 全部音乐 -->
      <template v-if="audio.tab === 'all'">
        <div class="ml-sec">
          <span class="s">全部音乐 · {{ audio.library.tracks.length }} 首</span>
          <span class="ml-sec-acts">
            <button class="ml-btn" type="button" @click="audio.toggleSelectAll()">全选</button>
            <button class="ml-btn primary" type="button" @click="audio.playCurrentPool()">
              播放全部
            </button>
          </span>
        </div>

        <div v-if="!audio.library.tracks.length" class="ml-empty">
          <b>曲库还是空的</b>去「导入音乐」添加本地 MP3 / WAV / FLAC
        </div>
        <div v-else>
          <div
            v-for="t in audio.library.tracks"
            :key="t.id"
            class="ml-track"
            :class="{ playing: audio.currentId === t.id }"
          >
            <input
              class="ml-chk"
              type="checkbox"
              aria-label="选择音乐"
              :checked="Boolean(audio.selectedIds[t.id])"
              @change="audio.toggleSelectTrack(t.id)"
            />
            <div class="ml-info" @click="audio.togglePlay(t.id)">
              <div class="ml-name">{{ t.title || t.fileName || "未命名音频" }}</div>
              <div class="ml-sub">{{ trackSubtitle(t) }}</div>
            </div>
            <button
              v-if="t.kind === 'import'"
              class="ml-ico-btn del"
              type="button"
              title="删除"
              @click="askDeleteTrack(t)"
            >
              ×
            </button>
            <button
              class="ml-ico-btn"
              type="button"
              aria-label="播放"
              @click="audio.togglePlay(t.id)"
            >
              {{ audio.currentId === t.id && audio.playing ? "❚❚" : "▶" }}
            </button>
          </div>
        </div>
      </template>

      <!-- 2a. 我的歌单列表 -->
      <template v-else-if="audio.tab === 'playlists' && !activePlaylist">
        <div class="ml-sec">
          <span class="s">我的歌单 · {{ audio.library.playlists.length }} 个</span>
          <button class="ml-btn primary" type="button" @click="openCreatePlaylistModal()">
            ＋ 新建歌单
          </button>
        </div>
        <div v-if="!audio.library.playlists.length" class="ml-empty">
          <b>还没有歌单</b>新建歌单后，可在「全部音乐」勾选歌曲加入
        </div>
        <div v-else>
          <div v-for="pl in audio.library.playlists" :key="pl.id" class="ml-pl">
            <div class="ml-pl-top">
              <div class="ml-pl-info" @click="audio.activePlaylistId = pl.id">
                <div class="ml-pl-name">{{ pl.name }}</div>
                <div class="ml-pl-sub">{{ pl.trackIds.length }} 首 · 点击管理曲目</div>
              </div>
              <button
                class="ml-ico-btn"
                type="button"
                aria-label="播放歌单"
                @click="audio.playCurrentPool(pl.id)"
              >
                ▶
              </button>
            </div>
            <div class="ml-pl-acts">
              <button class="ml-btn" type="button" @click="openRenamePlaylistModal(pl)">
                重命名
              </button>
              <button class="ml-btn danger" type="button" @click="askDeletePlaylist(pl)">
                删除歌单
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- 2b. 歌单详情 -->
      <template v-else-if="audio.tab === 'playlists' && activePlaylist">
        <div class="ml-sec">
          <button class="ml-btn" type="button" @click="audio.activePlaylistId = null">
            ‹ 返回
          </button>
          <span class="s"
            >{{ activePlaylist.name }} · {{ activePlaylistTracks.length }} 首</span
          >
        </div>
        <div class="ml-sec">
          <button
            class="ml-btn"
            type="button"
            @click="openPickTracksModal(activePlaylist.id)"
          >
            ＋ 添加音乐
          </button>
          <button
            class="ml-btn primary"
            type="button"
            @click="audio.playCurrentPool(activePlaylist.id)"
          >
            播放歌单
          </button>
        </div>
        <div v-if="!activePlaylistTracks.length" class="ml-empty">
          <b>歌单还没有音乐</b>点「添加音乐」从曲库挑几首
        </div>
        <div v-else>
          <div
            v-for="t in activePlaylistTracks"
            :key="t.id"
            class="ml-track"
            :class="{ playing: audio.currentId === t.id }"
          >
            <div class="ml-info" @click="audio.togglePlay(t.id)">
              <div class="ml-name">{{ t.title || t.fileName || "未命名音频" }}</div>
              <div class="ml-sub">{{ trackSubtitle(t) }}</div>
            </div>
            <button
              class="ml-ico-btn del"
              type="button"
              title="移出歌单"
              @click="audio.removeTrackFromPlaylist(activePlaylist.id, t.id)"
            >
              −
            </button>
            <button
              class="ml-ico-btn"
              type="button"
              aria-label="播放"
              @click="audio.togglePlay(t.id)"
            >
              {{ audio.currentId === t.id && audio.playing ? "❚❚" : "▶" }}
            </button>
          </div>
        </div>
      </template>

      <!-- 3. 导入音乐 -->
      <template v-else>
        <button class="ml-drop" type="button" @click="triggerFilePicker">
          <b>＋ 选择本地音频</b>
          <span>支持 MP3 / WAV / FLAC，单文件不超过 50MB</span>
        </button>
        <div class="ml-sec">
          <span class="s">已导入 · {{ importedTracks.length }} 首</span>
        </div>
        <div v-if="!importedTracks.length" class="ml-empty">
          <b>还没有导入音乐</b>选择文件后会自动解析标题、歌手与时长
        </div>
        <div v-else>
          <div
            v-for="t in importedTracks"
            :key="t.id"
            class="ml-track"
            :class="{ playing: audio.currentId === t.id }"
          >
            <div class="ml-info" @click="audio.togglePlay(t.id)">
              <div class="ml-name">{{ t.title || t.fileName || "未命名音频" }}</div>
              <div class="ml-sub">{{ trackSubtitle(t) }}</div>
            </div>
            <button
              class="ml-ico-btn del"
              type="button"
              title="删除"
              @click="askDeleteTrack(t)"
            >
              ×
            </button>
            <button
              class="ml-ico-btn"
              type="button"
              aria-label="播放"
              @click="audio.togglePlay(t.id)"
            >
              {{ audio.currentId === t.id && audio.playing ? "❚❚" : "▶" }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <div
      id="mlSelBar"
      class="ml-selbar"
      :class="{ show: audio.tab === 'all' && audio.selectedTrackIds.length > 0 }"
    >
      <span id="mlSelInfo">已选 {{ audio.selectedTrackIds.length }} 首</span>
      <button id="mlClearSel" class="ml-btn" type="button" @click="audio.clearSelection()">
        取消
      </button>
      <button
        id="mlAddToPl"
        class="ml-btn primary"
        type="button"
        @click="openPickPlaylistModal(audio.selectedTrackIds)"
      >
        添加到歌单
      </button>
    </div>

    <div class="ml-prog">
      <span id="mlCurTime" class="ml-time">{{ fmtDurZero(audio.currentTime) }}</span>
      <input
        id="mlSeek"
        class="ml-seek"
        type="range"
        min="0"
        max="1000"
        step="1"
        :value="seekPermille"
        :disabled="!audio.duration"
        aria-label="播放进度"
        @input="onSeekInput"
      />
      <span id="mlDurTime" class="ml-time">{{
        audio.duration ? fmtDurZero(audio.duration) : "--:--"
      }}</span>
    </div>

    <div class="ml-bar">
      <div class="ml-now">
        <div id="mlNowName" class="ml-now-name">
          {{
            audio.currentTrack
              ? audio.currentTrack.title || audio.currentTrack.fileName || "未命名音频"
              : "未播放"
          }}
        </div>
        <div id="mlNowSub" class="ml-now-sub">
          {{
            audio.currentTrack
              ? `${audio.currentTrack.artist || "未知艺术家"} · ${audio.queueLabel}`
              : "打开曲库选择音乐"
          }}
        </div>
      </div>
      <button
        id="mlPrev"
        class="ml-nav"
        type="button"
        aria-label="上一首"
        @click="audio.step(-1)"
      >
        ‹‹
      </button>
      <button
        id="mlPlay"
        class="ml-nav play"
        type="button"
        aria-label="播放或暂停"
        @click="audio.togglePlay()"
      >
        {{ audio.playing ? "❚❚" : "▶" }}
      </button>
      <button
        id="mlNext"
        class="ml-nav"
        type="button"
        aria-label="下一首"
        @click="audio.step(1)"
      >
        ››
      </button>
    </div>

    <input
      id="mlFile"
      ref="fileInputRef"
      type="file"
      multiple
      accept=".mp3,.wav,.flac,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/flac,audio/x-flac"
      style="display: none"
      @change="onFilesChosen"
    />
  </div>

  <!-- 曲库通用输入/确认弹窗 -->
  <div id="mlModal" class="ml-modal" :class="{ show: modalState.open }">
    <div class="ml-box">
      <div id="mlModalTitle" class="ml-modal-title">{{ modalState.title }}</div>
      <div
        v-show="modalState.text"
        id="mlModalText"
        class="ml-modal-text"
        style="display: block"
      >
        {{ modalState.text }}
      </div>
      <input
        v-show="modalState.hasInput"
        id="mlModalInput"
        ref="modalInputRef"
        v-model="modalState.inputVal"
        class="ml-input"
        type="text"
        maxlength="24"
        placeholder="歌单名称"
        autocomplete="off"
        style="display: block"
        @keydown.enter.prevent="submitModal"
      />
      <div class="ml-modal-btns">
        <button id="mlModalCancel" class="ml-btn" type="button" @click="closeModal">
          取消
        </button>
        <button id="mlModalOk" class="ml-btn primary" type="button" @click="submitModal">
          {{ modalState.okText }}
        </button>
      </div>
    </div>
  </div>

  <!-- 曲库歌单/歌曲选择弹窗 -->
  <div id="mlPickModal" class="ml-modal" :class="{ show: pickModal.open }">
    <div class="ml-box">
      <div id="mlPickTitle" class="ml-modal-title">{{ pickModal.title }}</div>
      <div id="mlPickList" class="ml-pick-list">
        <template v-if="pickModal.mode === 'playlist'">
          <button
            v-for="pl in audio.library.playlists"
            :key="pl.id"
            class="ml-pick-row"
            type="button"
            @click="choosePlaylistForPickedTracks(pl.id)"
          >
            <span class="n">{{ pl.name }}</span>
            <span class="c">{{ pl.trackIds.length }} 首</span>
          </button>
          <button
            class="ml-pick-row"
            type="button"
            @click="createAndAddPickedTracks()"
          >
            <span class="n">＋ 新建歌单</span>
            <span class="c">›</span>
          </button>
        </template>

        <template v-else-if="pickModal.mode === 'tracks'">
          <label
            v-for="t in availableTracksForPlaylist"
            :key="t.id"
            class="ml-pick-row"
          >
            <input
              v-model="pickModal.checkedTrackIds"
              class="ml-pick-chk"
              type="checkbox"
              :value="t.id"
            />
            <span class="n">{{ t.title || t.fileName }}</span>
            <span class="c">{{ t.artist || "" }}</span>
          </label>
        </template>
      </div>
      <div class="ml-modal-btns">
        <button
          id="mlPickCancel"
          class="ml-btn"
          type="button"
          @click="pickModal.open = false"
        >
          取消
        </button>
        <button
          v-show="pickModal.mode === 'tracks'"
          id="mlPickOk"
          class="ml-btn primary"
          type="button"
          @click="confirmPickedTracks"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick } from "vue";
import type { MusicPlaylist, MusicTrack } from "@mnk/shared";
import { useNavigationStore } from "@/stores/navigation";
import { useAudioStore } from "@/stores/audio";

const nav = useNavigationStore();
const audio = useAudioStore();

const fileInputRef = ref<HTMLInputElement | null>(null);
const modalInputRef = ref<HTMLInputElement | null>(null);

const activePlaylist = computed<MusicPlaylist | null>(() => {
  if (!audio.activePlaylistId) return null;
  return audio.library.playlists.find((p) => p.id === audio.activePlaylistId) || null;
});

const activePlaylistTracks = computed<MusicTrack[]>(() => {
  if (!activePlaylist.value) return [];
  return activePlaylist.value.trackIds
    .map((id) => audio.library.tracks.find((t) => t.id === id))
    .filter((x): x is MusicTrack => Boolean(x));
});

const importedTracks = computed<MusicTrack[]>(() =>
  audio.library.tracks.filter((t) => t.kind === "import")
);

function switchTab(t: "all" | "playlists" | "import") {
  audio.tab = t;
  if (t !== "playlists") {
    audio.activePlaylistId = null;
  }
}

function fmtDur(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "--:--";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDurZero(sec?: number): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const seekPermille = computed(() => {
  if (!audio.duration || audio.duration <= 0) return 0;
  return Math.min(1000, Math.max(0, Math.round((audio.currentTime / audio.duration) * 1000)));
});

function onSeekInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  audio.seekByPermille(val);
}

function fmtSize(b?: number): string {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function trackSubtitle(t: MusicTrack): string {
  if (t.kind === "builtin") return "内置曲目";
  return [t.artist || "未知艺术家", t.album || "", fmtDur(t.duration), fmtSize(t.size)]
    .filter(Boolean)
    .join(" · ");
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length) {
    void audio.importFiles(input.files);
  }
  input.value = "";
}

function onDropFiles(e: DragEvent) {
  if (e.dataTransfer?.files?.length) {
    void audio.importFiles(e.dataTransfer.files);
  }
}

// ---- Modal State ----
const modalState = reactive<{
  open: boolean;
  title: string;
  text: string;
  hasInput: boolean;
  inputVal: string;
  okText: string;
  onConfirm: ((val: string) => void) | null;
}>({
  open: false,
  title: "",
  text: "",
  hasInput: false,
  inputVal: "",
  okText: "确定",
  onConfirm: null,
});

function closeModal() {
  modalState.open = false;
  modalState.onConfirm = null;
}

function submitModal() {
  if (modalState.hasInput && !modalState.inputVal.trim()) {
    nav.toast("名称不能为空");
    return;
  }
  const cb = modalState.onConfirm;
  const val = modalState.inputVal.trim();
  closeModal();
  cb?.(val);
}

async function openCreatePlaylistModal(afterCreate?: (pl: MusicPlaylist) => void) {
  modalState.title = "新建歌单";
  modalState.text = "";
  modalState.hasInput = true;
  modalState.inputVal = "";
  modalState.okText = "确定";
  modalState.onConfirm = async (val) => {
    const pl = await audio.createPlaylist(val);
    nav.toast(`已创建歌单「${pl.name}」`);
    afterCreate?.(pl);
  };
  modalState.open = true;
  await nextTick();
  modalInputRef.value?.focus();
}

async function openRenamePlaylistModal(pl: MusicPlaylist) {
  modalState.title = "重命名歌单";
  modalState.text = "";
  modalState.hasInput = true;
  modalState.inputVal = pl.name;
  modalState.okText = "确定";
  modalState.onConfirm = (val) => {
    void audio.renamePlaylist(pl.id, val);
  };
  modalState.open = true;
  await nextTick();
  modalInputRef.value?.focus();
  modalInputRef.value?.select();
}

function askDeletePlaylist(pl: MusicPlaylist) {
  modalState.title = "删除歌单";
  modalState.text = `确定删除「${pl.name}」吗？曲库里的音乐不会被删除。`;
  modalState.hasInput = false;
  modalState.okText = "删除";
  modalState.onConfirm = () => {
    void audio.deletePlaylist(pl.id);
  };
  modalState.open = true;
}

function askDeleteTrack(t: MusicTrack) {
  modalState.title = "删除音乐";
  modalState.text = `确定把「${t.title || t.fileName}」从曲库删除吗？本地文件不受影响。`;
  modalState.hasInput = false;
  modalState.okText = "删除";
  modalState.onConfirm = () => {
    void audio.deleteImportedTrack(t.id);
  };
  modalState.open = true;
}

// ---- Pick Modal State ----
const pickModal = reactive<{
  open: boolean;
  mode: "playlist" | "tracks";
  title: string;
  pendingTrackIds: string[];
  targetPlaylistId: string;
  checkedTrackIds: string[];
}>({
  open: false,
  mode: "playlist",
  title: "添加到歌单",
  pendingTrackIds: [],
  targetPlaylistId: "",
  checkedTrackIds: [],
});

const availableTracksForPlaylist = computed<MusicTrack[]>(() => {
  const pl = audio.library.playlists.find((p) => p.id === pickModal.targetPlaylistId);
  if (!pl) return [];
  return audio.library.tracks.filter((t) => !pl.trackIds.includes(t.id));
});

function openPickPlaylistModal(trackIds: string[]) {
  if (!trackIds.length) return;
  pickModal.mode = "playlist";
  pickModal.title = "添加到歌单";
  pickModal.pendingTrackIds = trackIds.slice();
  pickModal.open = true;
}

function choosePlaylistForPickedTracks(plId: string) {
  const ids = pickModal.pendingTrackIds.slice();
  pickModal.open = false;
  void audio.addTracksToPlaylist(plId, ids);
}

function createAndAddPickedTracks() {
  const ids = pickModal.pendingTrackIds.slice();
  pickModal.open = false;
  void openCreatePlaylistModal((pl) => {
    void audio.addTracksToPlaylist(pl.id, ids);
  });
}

function openPickTracksModal(plId: string) {
  const pl = audio.library.playlists.find((p) => p.id === plId);
  if (!pl) return;
  const avail = audio.library.tracks.filter((t) => !pl.trackIds.includes(t.id));
  if (!avail.length) {
    nav.toast("曲库里的音乐都已在歌单中");
    return;
  }
  pickModal.mode = "tracks";
  pickModal.title = "选择音乐";
  pickModal.targetPlaylistId = plId;
  pickModal.checkedTrackIds = [];
  pickModal.open = true;
}

function confirmPickedTracks() {
  const plId = pickModal.targetPlaylistId;
  const ids = pickModal.checkedTrackIds.slice();
  pickModal.open = false;
  if (ids.length) {
    void audio.addTracksToPlaylist(plId, ids);
  }
}
</script>

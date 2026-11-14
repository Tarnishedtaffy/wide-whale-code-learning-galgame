<template>
  <aside
    id="volDrawer"
    class="vol-drawer"
    :class="{ show: nav.activeDrawer === 'volume' }"
  >
    <div class="ttl">♪ 音 量 调 节</div>
    <button id="openMusicLib" class="ml-entry" type="button" @click="openMusicLib">
      <span class="eico">
        <span
          id="bgmDisc"
          class="disc"
          :class="{ on: audio.playing }"
          :style="{ '--spin': audio.spinDurationSec }"
        ></span>
        <span id="bgmNotes" ref="notesRef" class="notes"></span>
      </span>
      <span class="etxt"><b>曲 库</b><i>歌单 · 轮播 · 本地导入</i></span>
      <span class="earr">›</span>
    </button>

    <div class="vol-row">
      <div class="lb">
        <span>主音量</span>
        <span id="v1v">{{ settingsStore.settings.masterVol }}</span>
      </div>
      <input
        id="v1"
        type="range"
        min="0"
        max="100"
        :value="settingsStore.settings.masterVol"
        @input="onVolChange('masterVol', $event)"
      />
    </div>
    <div class="vol-row">
      <div class="lb">
        <span>背景音乐</span>
        <span id="v2v">{{ settingsStore.settings.bgmVol }}</span>
      </div>
      <input
        id="v2"
        type="range"
        min="0"
        max="100"
        :value="settingsStore.settings.bgmVol"
        @input="onVolChange('bgmVol', $event)"
      />
    </div>
    <div class="vol-row">
      <div class="lb">
        <span>音效</span>
        <span id="v3v">{{ settingsStore.settings.sfxVol }}</span>
      </div>
      <input
        id="v3"
        type="range"
        min="0"
        max="100"
        :value="settingsStore.settings.sfxVol"
        @input="onVolChange('sfxVol', $event)"
      />
    </div>
    <button id="volClose" type="button" class="vol-close" @click="nav.closeAllDrawers()">
      关  闭
    </button>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { useNavigationStore } from "@/stores/navigation";
import { useSettingsStore } from "@/stores/settings";
import { useAudioStore } from "@/stores/audio";

const nav = useNavigationStore();
const settingsStore = useSettingsStore();
const audio = useAudioStore();

const notesRef = ref<HTMLElement | null>(null);
let notesTimer: number | null = null;
const NOTE_CHARS = ["♪", "♫", "♩"];

function openMusicLib() {
  nav.closeAllDrawers();
  nav.musicLibOpen = true;
}

function onVolChange(key: "masterVol" | "bgmVol" | "sfxVol", e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  void settingsStore.updateVolumes({ [key]: val }).then(() => {
    audio.syncVolumeFromSettings();
  });
  audio.syncVolumeFromSettings();
}

function stopNotes() {
  if (notesTimer !== null) {
    window.clearInterval(notesTimer);
    notesTimer = null;
  }
  if (notesRef.value) {
    notesRef.value.innerHTML = "";
  }
}

function spawnNote() {
  const box = notesRef.value;
  if (!box) return;
  const n = document.createElement("i");
  n.className = "note";
  n.textContent = NOTE_CHARS[(Math.random() * NOTE_CHARS.length) | 0];
  const ang = Math.random() * Math.PI * 2;
  const r = 12 + Math.random() * 2;
  n.style.left = `${(14 + Math.cos(ang) * r).toFixed(1)}px`;
  n.style.top = `${(14 + Math.sin(ang) * r).toFixed(1)}px`;
  n.style.setProperty("--dx", `${(Math.random() * 24 - 12).toFixed(0)}px`);
  n.style.setProperty("--w1", `${(Math.random() * 16 - 8).toFixed(0)}px`);
  n.style.setProperty("--w2", `${(Math.random() * 16 - 8).toFixed(0)}px`);
  n.style.setProperty("--dy", `${(34 + Math.random() * 16).toFixed(0)}px`);
  n.style.setProperty("--rot", `${(Math.random() * 40 - 20).toFixed(0)}deg`);
  n.style.setProperty("--dur", `${(1.3 + Math.random() * 0.7).toFixed(2)}s`);
  n.addEventListener("animationend", () => {
    n.remove();
  });
  box.appendChild(n);
}

function syncNotes() {
  const visible = nav.activeDrawer === "volume";
  if (!visible || !audio.playing) {
    stopNotes();
    return;
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    stopNotes();
    return;
  }
  stopNotes();
  const gap = Math.min(1800, Math.max(500, 120000 / audio.currentBpm));
  spawnNote();
  notesTimer = window.setInterval(spawnNote, gap);
}

watch(() => [nav.activeDrawer, audio.playing, audio.currentBpm] as const, syncNotes);

onBeforeUnmount(stopNotes);
</script>

<template>
  <section id="gallery" class="page" :class="{ on: nav.currentPage === 'gallery' }">
    <div
      class="bg-layer"
      :style="{
        backgroundImage: settingsStore.currentWallpaperSrc
          ? `url(&quot;${settingsStore.currentWallpaperSrc}&quot;)`
          : 'none',
      }"
    ></div>
    <div id="galDeco" class="gal-deco" aria-hidden="true">
      <img :src="ASSETS.garden.gazebo" alt="" />
      <img :src="ASSETS.garden.swing" alt="" />
    </div>
    <div class="gal-top">
      <button
        id="galBack"
        class="gal-back"
        type="button"
        aria-label="返回主页"
        @click="nav.go('home')"
      >
        ‹
      </button>
      <span class="gal-title">背 景 图 库</span>
      <span class="gal-spacer"></span>
    </div>
    <div class="gal-body">
      <div class="gal-note">
        挑一张喜欢的风景，或上传图片<br />作为你的主页背景
      </div>
      <div id="galGrid" class="gal-grid">
        <button type="button" class="gal-card gal-upload" @click="triggerUpload">
          <span class="gal-plus">＋</span>
          <span class="gal-name">上传图片</span>
        </button>

        <button
          v-for="item in SYSTEM_WALLPAPERS"
          :key="item.id"
          type="button"
          class="gal-card"
          :class="{ on: settingsStore.settings.wallpaper.key === item.id }"
          :data-key="item.id"
          @click="settingsStore.selectSystemWallpaper(item.id)"
        >
          <span
            class="gal-thumb"
            :style="{ backgroundImage: `url(&quot;${item.src}&quot;)` }"
          ></span>
          <span class="gal-name">{{ item.name }}</span>
          <span class="gal-check">✓</span>
        </button>

        <button
          v-if="customUploadCard"
          type="button"
          class="gal-card"
          :class="{ on: settingsStore.settings.wallpaper.key === customUploadCard.id }"
          :data-key="customUploadCard.id"
          @click="selectUploadedCard"
        >
          <span
            class="gal-thumb"
            :style="{ backgroundImage: `url(&quot;${customUploadCard.src}&quot;)` }"
          ></span>
          <span class="gal-name">我的图片</span>
          <span class="gal-check">✓</span>
        </button>
      </div>
      <div class="gal-upload-tip">上传的图片只会用于更换主页背景</div>
      <button
        id="galReset"
        class="gal-reset"
        type="button"
        @click="settingsStore.resetWallpaper()"
      >
        恢复默认背景
      </button>
    </div>
    <input
      id="galFile"
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onFilePicked"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ASSETS, SYSTEM_WALLPAPERS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";
import { useSettingsStore } from "@/stores/settings";

const nav = useNavigationStore();
const settingsStore = useSettingsStore();

const fileInputRef = ref<HTMLInputElement | null>(null);

const customUploadCard = computed(() => {
  const { key, customDataUrl } = settingsStore.settings.wallpaper;
  if (!customDataUrl) return null;
  const id = key.startsWith("upload") ? key : "upload_saved";
  return { id, src: customDataUrl };
});

function triggerUpload() {
  fileInputRef.value?.click();
}

function selectUploadedCard() {
  if (!customUploadCard.value) return;
  void settingsStore.selectSystemWallpaper(customUploadCard.value.id);
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    void settingsStore.uploadCustomWallpaper(file);
  }
  input.value = "";
}
</script>

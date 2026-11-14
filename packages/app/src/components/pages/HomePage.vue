<script setup lang="ts">
import { computed } from "vue";
import { ASSETS } from "@/assets/manifest";
import Live2DStage from "@/components/Live2DStage.vue";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";
import { useSettingsStore } from "@/stores/settings";

const nav = useNavigationStore();
const study = useStudyStore();
const settingsStore = useSettingsStore();

const bgStyle = computed(() => {
  const src = settingsStore.currentWallpaperSrc;
  return src ? { backgroundImage: `url("${src}")` } : {};
});
</script>

<template>
  <section id="home" class="page" :class="{ on: nav.currentPage === 'home' }">
    <div class="bg-layer" :style="bgStyle"></div>
    <Live2DStage />
    <div class="home-stage">
      <div class="home-head">
        <div id="openDrawer" class="avbox" @click="nav.openDrawer('user')">
          <img :src="ASSETS.avatarLune" alt="头像" />
        </div>
        <div class="lovebox">
          <span class="ic">♥</span>
          <span id="loveVal" class="val">{{ study.state.love }}</span>
        </div>
        <button
          id="homeCallBtn"
          type="button"
          class="home-call-entry"
          title="与 Lune 语音 / 视频通话"
          aria-label="与 Lune 语音通话"
          @click="nav.openVoiceCall({ video: false, fromPage: 'home' })"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.15.38 2.35.58 3.6.58a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.58 3.6a1 1 0 0 1-.24 1l-2.24 2.2z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="home-icons">
        <button
          id="openVol"
          type="button"
          class="pxicon"
          title="音量"
          aria-label="音量"
          @click="nav.openDrawer('volume')"
        >
          <img class="cellimg" :src="ASSETS.homeIcons.volume" alt="" />
        </button>
        <button
          id="gotoSettings"
          type="button"
          class="pxicon"
          title="设置"
          aria-label="设置"
          @click="nav.go('settings')"
        >
          <img class="cellimg" :src="ASSETS.homeIcons.settings" alt="" />
        </button>
        <button
          id="homeFav"
          type="button"
          class="pxicon"
          title="背景图库"
          aria-label="背景图库"
          @click="nav.go('gallery')"
        >
          <img class="cellimg" :src="ASSETS.homeIcons.gallery" alt="" />
        </button>
        <button
          id="openWrong"
          type="button"
          class="pxicon"
          title="错题本"
          aria-label="错题本"
          @click="nav.openDrawer('wrong')"
        >
          <img class="cellimg" :src="ASSETS.homeIcons.wrongBook" alt="" />
        </button>
      </div>

      <div class="home-actions">
        <button id="gotoChat" class="hact chat" type="button" @click="nav.openChatFromHome()">
          <img :src="ASSETS.homeActions.chat" alt="聊天" />
        </button>
        <button id="gotoCards" class="hact study" type="button" @click="nav.go('cardsMenu')">
          <img :src="ASSETS.homeActions.study" alt="开始学习" />
        </button>
        <button
          id="gotoLevels"
          class="hact test"
          type="button"
          @click="
            study.mapCam = study.state.currentLevel;
            nav.go('levels');
          "
        >
          <img :src="ASSETS.homeActions.test" alt="测试" />
        </button>
      </div>
    </div>
  </section>
</template>

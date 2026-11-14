<template>
  <div class="phone">
    <IntroOverlay />

    <!-- 11 核心页面 -->
    <WelcomePage />
    <HomePage />
    <LevelMapPage />
    <QuizPage />
    <ResultPage />
    <CardsMenuPage />
    <CardsFlipPage />
    <ChatPage />
    <VoiceCallPage />
    <SettingsPage />
    <GalleryPage />

    <!-- 全局遮罩与抽屉栈 -->
    <div
      id="mask"
      class="mask"
      :class="{ show: nav.maskVisible }"
      @click="nav.closeAllDrawers()"
    ></div>

    <UserDrawer />
    <VolumeDrawer />
    <WrongBookDrawer />
    <FavoritesDrawer />
    <ChatPlusDrawer />
    <ChatHistoryDrawer />

    <!-- 模态框与全屏曲库 -->
    <CalendarModal />
    <ProgressModal />
    <AiConfigModal />
    <MusicLibraryLayer />

    <!-- Toast 提示栈 -->
    <ToastHost />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { backendClient } from "@/services/backendClient";
import { hydrateAiConfig } from "@/services/aiClient";
import { useNavigationStore } from "@/stores/navigation";
import { useSettingsStore } from "@/stores/settings";
import { useStudyStore } from "@/stores/study";
import { useChatStore } from "@/stores/chat";
import { useAudioStore } from "@/stores/audio";

import IntroOverlay from "@/components/pages/IntroOverlay.vue";
import WelcomePage from "@/components/pages/WelcomePage.vue";
import HomePage from "@/components/pages/HomePage.vue";
import LevelMapPage from "@/components/pages/LevelMapPage.vue";
import QuizPage from "@/components/pages/QuizPage.vue";
import ResultPage from "@/components/pages/ResultPage.vue";
import CardsMenuPage from "@/components/pages/CardsMenuPage.vue";
import CardsFlipPage from "@/components/pages/CardsFlipPage.vue";
import ChatPage from "@/components/pages/ChatPage.vue";
import VoiceCallPage from "@/components/pages/VoiceCallPage.vue";
import SettingsPage from "@/components/pages/SettingsPage.vue";
import GalleryPage from "@/components/pages/GalleryPage.vue";

import UserDrawer from "@/components/drawers/UserDrawer.vue";
import VolumeDrawer from "@/components/drawers/VolumeDrawer.vue";
import WrongBookDrawer from "@/components/drawers/WrongBookDrawer.vue";
import FavoritesDrawer from "@/components/drawers/FavoritesDrawer.vue";
import ChatPlusDrawer from "@/components/drawers/ChatPlusDrawer.vue";
import ChatHistoryDrawer from "@/components/drawers/ChatHistoryDrawer.vue";
import MusicLibraryLayer from "@/components/drawers/MusicLibraryLayer.vue";

import CalendarModal from "@/components/modals/CalendarModal.vue";
import ProgressModal from "@/components/modals/ProgressModal.vue";
import AiConfigModal from "@/components/modals/AiConfigModal.vue";
import ToastHost from "@/components/modals/ToastHost.vue";

const nav = useNavigationStore();
const settingsStore = useSettingsStore();
const study = useStudyStore();
const chat = useChatStore();
const audio = useAudioStore();

function onPopState() {
  const handled = nav.handleBackNavigation(Boolean(study.quizSession?.isWrongPractice));
  if (handled && nav.currentPage !== "welcome" && nav.currentPage !== "home") {
    try {
      window.history.pushState({ mnkPage: nav.currentPage }, "");
    } catch {
      // ignore
    }
  }
}

onMounted(async () => {
  window.addEventListener("popstate", onPopState);
  try {
    const boot = await backendClient.getBootstrapData();
    hydrateAiConfig(boot.aiConfig);
    study.hydrate({
      cards: boot.cards,
      totalLevels: boot.totalLevels,
      cardsPerLevel: boot.cardsPerLevel,
      wrongMasterStreak: boot.wrongMasterStreak,
      state: boot.state,
    });
    settingsStore.hydrate(boot.settings);
    chat.ensureSessions();
    audio.hydrate(boot.musicLibrary);
    if (boot.resetNotice) {
      nav.toast(boot.resetNotice);
    }
  } catch (err) {
    console.error("[bootstrap] 初始化失败:", err);
    nav.toast("初始化数据加载失败");
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", onPopState);
});
</script>

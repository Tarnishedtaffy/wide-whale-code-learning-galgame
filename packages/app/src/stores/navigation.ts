import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type PageId =
  | "welcome"
  | "home"
  | "levels"
  | "quiz"
  | "result"
  | "cardsMenu"
  | "cards"
  | "chat"
  | "voiceCall"
  | "settings"
  | "gallery";

export type DrawerId =
  | "none"
  | "user"
  | "volume"
  | "wrong"
  | "favorites"
  | "plus"
  | "chatHistory";

export type ModalId = "none" | "calendar" | "progress" | "aiConfig";

export interface ToastItem {
  id: number;
  text: string;
  show: boolean;
}

export interface ChatReturnRoute {
  page: PageId;
  drawer?: Exclude<DrawerId, "none">;
  label: string;
}

export const useNavigationStore = defineStore("navigation", () => {
  const introDone = ref(false);
  const currentPage = ref<PageId>("welcome");
  const activeDrawer = ref<DrawerId>("none");
  const activeModal = ref<ModalId>("none");
  const musicLibOpen = ref(false);
  const memSearchOpen = ref(false);
  const memDetailOpen = ref(false);
  const voiceCallWithVideo = ref(false);
  const voiceCallReturnPage = ref<PageId>("home");
  const chatReturnRoute = ref<ChatReturnRoute | null>(null);
  const toasts = ref<ToastItem[]>([]);

  let toastSeq = 0;

  const maskVisible = computed(() => activeDrawer.value !== "none");

  function toast(text: string) {
    const id = ++toastSeq;
    toasts.value.push({ id, text, show: false });
    window.setTimeout(() => {
      const item = toasts.value.find((t) => t.id === id);
      if (item) item.show = true;
    }, 15);
    window.setTimeout(() => {
      const item = toasts.value.find((t) => t.id === id);
      if (item) item.show = false;
      window.setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id);
      }, 320);
    }, 2050);
  }

  function closeAllDrawers() {
    activeDrawer.value = "none";
    memDetailOpen.value = false;
    memSearchOpen.value = false;
  }

  function openDrawer(drawer: Exclude<DrawerId, "none">) {
    activeDrawer.value = drawer;
  }

  function openModal(modal: Exclude<ModalId, "none">) {
    closeAllDrawers();
    activeModal.value = modal;
  }

  function closeModal() {
    activeModal.value = "none";
  }

  function go(page: PageId, pushHistory = true) {
    closeAllDrawers();
    activeModal.value = "none";
    currentPage.value = page;
    if (pushHistory && typeof window !== "undefined" && page !== "welcome") {
      try {
        window.history.pushState({ mnkPage: page }, "");
      } catch {
        // ignore in restricted webviews
      }
    }
  }

  function openVoiceCall(options: { video?: boolean; fromPage?: PageId } = {}) {
    const origin =
      options.fromPage ||
      (currentPage.value !== "voiceCall" && currentPage.value !== "welcome"
        ? currentPage.value
        : "home");
    voiceCallReturnPage.value = origin;
    voiceCallWithVideo.value = Boolean(options.video);
    go("voiceCall");
  }

  function leaveVoiceCall(pushHistory = true) {
    const target = voiceCallReturnPage.value || "home";
    go(target === "voiceCall" ? "home" : target, pushHistory);
  }

  function openChatFromHome() {
    chatReturnRoute.value = null;
    go("chat");
  }

  function leaveChat(pushHistory = true) {
    const target = chatReturnRoute.value;
    chatReturnRoute.value = null;
    if (target) {
      go(target.page, pushHistory);
      if (target.drawer) {
        openDrawer(target.drawer);
      }
      return;
    }
    go("home", pushHistory);
  }

  function completeIntro() {
    if (introDone.value) return;
    introDone.value = true;
    if (typeof document !== "undefined") {
      const de = document.documentElement;
      de.classList.remove("mnk-first-run");
      de.classList.add("mnk-intro-seen");
    }
    go("welcome", false);
  }

  /**
   * Handles Android hardware back / browser popstate / Escape key.
   * Returns true if an overlay or sub-page was closed/popped.
   */
  function handleBackNavigation(isWrongPracticeQuiz = false): boolean {
    if (musicLibOpen.value) {
      musicLibOpen.value = false;
      return true;
    }
    if (memSearchOpen.value) {
      memSearchOpen.value = false;
      return true;
    }
    if (memDetailOpen.value) {
      memDetailOpen.value = false;
      return true;
    }
    if (activeModal.value !== "none") {
      activeModal.value = "none";
      return true;
    }
    if (activeDrawer.value !== "none") {
      closeAllDrawers();
      return true;
    }

    switch (currentPage.value) {
      case "voiceCall":
        leaveVoiceCall(false);
        return true;
      case "chat":
        leaveChat(false);
        return true;
      case "cards":
        go("cardsMenu", false);
        return true;
      case "quiz":
      case "result":
        go(isWrongPracticeQuiz ? "home" : "levels", false);
        return true;
      case "levels":
      case "cardsMenu":
      case "settings":
      case "gallery":
        go("home", false);
        return true;
      default:
        return false;
    }
  }

  return {
    introDone,
    currentPage,
    activeDrawer,
    activeModal,
    musicLibOpen,
    memSearchOpen,
    memDetailOpen,
    voiceCallWithVideo,
    voiceCallReturnPage,
    chatReturnRoute,
    toasts,
    maskVisible,
    toast,
    closeAllDrawers,
    openDrawer,
    openModal,
    closeModal,
    go,
    openVoiceCall,
    leaveVoiceCall,
    openChatFromHome,
    leaveChat,
    completeIntro,
    handleBackNavigation,
  };
});

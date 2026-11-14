<template>
  <section
    id="chat"
    class="page"
    :class="{ on: nav.currentPage === 'chat', kbopen: keyboardOpen }"
  >
    <button
      id="chatBack"
      type="button"
      class="closex chat-icon-btn"
      :aria-label="exitLabel"
      :title="exitLabel"
      @click="nav.leaveChat()"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14.5 6.5L9 12l5.5 5.5"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <button
      id="chatCallBtn"
      type="button"
      class="chat-call-btn chat-icon-btn"
      title="语音 / 视频通话"
      aria-label="进入语音通话"
      @click="nav.openVoiceCall({ video: false, fromPage: 'chat' })"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.15.38 2.35.58 3.6.58a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.58 3.6a1 1 0 0 1-.24 1l-2.24 2.2z"
          stroke="currentColor"
          stroke-width="1.85"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <button
      id="chatAiCfgBtn"
      type="button"
      class="chat-cfg-btn chat-icon-btn"
      title="大模型对话设置"
      aria-label="大模型对话设置"
      @click="nav.openModal('aiConfig')"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="2" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div id="chatBody" ref="bodyRef" class="body">
      <div class="msg bot">
        <div class="ava">
          <img
            :src="ASSETS.avatarLune"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
        </div>
        <div class="bub rt-content">你好呀～有 Python 的问题都可以问我 🌸</div>
      </div>

      <div
        v-for="(m, idx) in chat.currentSession.msgs"
        :key="`${chat.currentSession.id}_${idx}`"
        class="msg"
        :class="m.who"
      >
        <div v-if="m.who === 'bot'" class="ava">
          <img
            :src="ASSETS.avatarLune"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="bub rt-content" v-html="renderRichText(m.text)"></div>
      </div>

      <div v-if="chat.chatBusy" class="msg bot">
        <div class="ava">
          <img
            :src="ASSETS.avatarLune"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-if="chat.streamingText"
          class="bub rt-content"
          v-html="renderRichText(chat.streamingText)"
        ></div>
        <div v-else class="typing"><span></span><span></span><span></span></div>
      </div>
    </div>

    <div class="inbar">
      <button
        id="plusBtn"
        type="button"
        class="plus-btn"
        aria-label="更多功能"
        aria-haspopup="dialog"
        @click="nav.openDrawer('plus')"
      >
        ＋
      </button>
      <div class="field">
        <input
          id="chatInput"
          ref="inputRef"
          v-model="draft"
          type="text"
          placeholder="说点什么…"
          aria-label="聊天输入框"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="send"
          @keydown="onKeydown"
          @focus="onInputFocus"
          @blur="onInputBlur"
        />
      </div>
      <button id="sendBtn" type="button" class="send" aria-label="发送" @click="submit">
        ➤
      </button>
    </div>

    <div class="tabbar">
      <button
        id="tabChat"
        type="button"
        class="tabpill"
        :class="{ on: nav.activeDrawer !== 'chatHistory' }"
        @click="selectChatTab"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="4"
            stroke="#4a3548"
            stroke-width="1.8"
            fill="#fff"
          />
          <path
            d="M7 10h10M7 13h7"
            stroke="#4a3548"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        聊天
      </button>
      <button
        id="tabMemory"
        type="button"
        class="tabpill"
        :class="{ on: nav.activeDrawer === 'chatHistory' }"
        @click="openMemoryTab"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <rect
            x="5"
            y="4"
            width="14"
            height="16"
            rx="2"
            stroke="#4a3548"
            stroke-width="1.8"
            fill="#f7d5dd"
          />
          <path d="M8 8h8" stroke="#4a3548" stroke-width="1.4" />
        </svg>
        记忆
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { ASSETS } from "@/assets/manifest";
import { renderRichText } from "@/utils/renderRichText";
import { useNavigationStore } from "@/stores/navigation";
import { useChatStore } from "@/stores/chat";

const nav = useNavigationStore();
const chat = useChatStore();

const draft = ref("");
const bodyRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const keyboardOpen = ref(false);
const exitLabel = computed(() => nav.chatReturnRoute?.label || "返回首页");

function scrollToLatest() {
  const el = bodyRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

async function submit() {
  const text = draft.value.trim();
  if (!text || chat.chatBusy) return;
  draft.value = "";
  await chat.sendUserMessage(text);
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === "Enter") {
    e.preventDefault();
    void submit();
  }
}

function selectChatTab() {
  nav.closeAllDrawers();
  inputRef.value?.focus();
}

function openMemoryTab() {
  nav.memDetailOpen = false;
  nav.openDrawer("chatHistory");
}

function syncVisualViewport() {
  const vv = window.visualViewport;
  const phone = document.querySelector<HTMLElement>(".phone");
  if (!vv || !phone) return;
  if (nav.currentPage !== "chat") {
    keyboardOpen.value = false;
    phone.style.height = "";
    return;
  }
  const fullH = window.innerHeight || vv.height;
  const kbUp = fullH - vv.height > 110;
  keyboardOpen.value = kbUp;
  if (kbUp && window.innerWidth <= 520) {
    phone.style.height = `${vv.height}px`;
    scrollToLatest();
    requestAnimationFrame(scrollToLatest);
  } else {
    phone.style.height = "";
  }
}

function onInputFocus() {
  window.setTimeout(syncVisualViewport, 60);
  window.setTimeout(syncVisualViewport, 280);
}

function onInputBlur() {
  window.setTimeout(syncVisualViewport, 60);
}

watch(
  () => [
    nav.currentPage,
    chat.currentSession.id,
    chat.currentSession.msgs.length,
    chat.chatBusy,
    chat.streamingText,
  ] as const,
  async ([page]) => {
    syncVisualViewport();
    if (page !== "chat") return;
    await nextTick();
    scrollToLatest();
  }
);

onMounted(() => {
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", syncVisualViewport);
    vv.addEventListener("scroll", syncVisualViewport);
  }
});

onBeforeUnmount(() => {
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", syncVisualViewport);
    vv.removeEventListener("scroll", syncVisualViewport);
  }
});
</script>

<style scoped>
/* Top bar & exit/config buttons styled uniformly via ux-polish.css */
</style>

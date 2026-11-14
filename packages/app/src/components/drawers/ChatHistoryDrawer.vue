<template>
  <!-- 聊天页：历史任务抽屉 -->
  <aside
    id="histDrawer"
    class="drawer hist-drawer"
    :class="{ show: nav.activeDrawer === 'chatHistory' }"
  >
    <div class="mem-top">
      <button id="histClose" type="button" class="mem-close" @click="nav.closeAllDrawers()">
        <img class="x-ico" :src="ASSETS.iconClose" alt="" />
      </button>
      <button
        id="memSearchBtn"
        type="button"
        class="mem-search"
        aria-label="搜索"
        @click="openSearch"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2" />
          <path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div id="memMain" class="mem-main">
      <button id="memNew" type="button" class="mem-new" @click="chat.startNewChat()">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M4.5 6.2h15a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8H9.6L5 20.6V18h-.5a1.8 1.8 0 0 1-1.8-1.8V8a1.8 1.8 0 0 1 1.8-1.8z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
        新对话
      </button>

      <div class="mem-qhead">最近提问</div>
      <div id="memQuestions" class="mem-qwrap">
        <div v-if="!chat.recentQuestions.length" class="mem-empty" style="padding: 12px 0">
          还没有提问记录
        </div>
        <button
          v-for="q in chat.recentQuestions"
          :key="q"
          type="button"
          class="mem-qitem"
          @click="chat.openDetailByQuestion(q)"
        >
          <span class="qt">{{ q }}</span>
          <span class="qn">查看</span>
        </button>
      </div>

      <div class="mem-sec"><span>回忆</span><i></i></div>
      <div id="memSessions" class="mem-sessions">
        <div v-for="s in chat.sortedSessions" :key="s.id" class="mem-row">
          <button
            type="button"
            class="mem-session"
            :class="{ current: s.id === study.state.chatCurrent }"
            @click="chat.switchChatSession(s.id)"
          >
            <span class="ms-ico">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3.2V16.5H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linejoin="round"
                  fill="#fff"
                />
                <path
                  d="M8 9h8M8 12h5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <span class="ms-main">
              <span class="ms-title">{{ displaySessionTitle(s) }}</span>
              <span class="ms-meta">
                {{ s.msgs.length ? `${s.msgs.length} 条对话 · ` : "" }}{{ s.stamp || "" }}
              </span>
            </span>
            <span
              v-if="s.id === study.state.chatCurrent && displaySessionTitle(s) !== '主对话'"
              class="ms-pill"
            >
              主对话
            </span>
          </button>
          <button
            type="button"
            class="mem-del"
            title="删除回忆"
            aria-label="删除回忆"
            @click.stop="askDeleteSession(s.id)"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.8 7l.7 11.4a1.8 1.8 0 0 0 1.8 1.6h5.4a1.8 1.8 0 0 0 1.8-1.6L17.2 7M10 11v5.5M14 11v5.5"
                stroke="currentColor"
                stroke-width="1.65"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div id="memDetail" class="mem-detail" :class="{ show: nav.memDetailOpen }">
      <div class="mem-detail-top">
        <button id="memDetailBack" type="button" aria-label="返回" @click="nav.memDetailOpen = false">
          ‹
        </button>
        <span id="memDetailTitle" class="mem-detail-title">{{
          chat.detailTitle || "对话记录"
        }}</span>
      </div>
      <div id="memDetailBody" class="mem-detail-body">
        <div
          v-if="!chat.detailBlocks.length || chat.detailBlocks.every((b) => !b.msgs.length)"
          class="mem-empty"
        >
          还没有对话记录
        </div>
        <template v-else>
          <template v-for="(blk, bi) in chat.detailBlocks" :key="bi">
            <div class="mem-detail-sec">{{ blk.stamp }}</div>
            <div
              v-for="(m, mi) in blk.msgs"
              :key="`${bi}_${mi}`"
              class="mem-msg"
              :class="m.who === 'me' ? 'me' : 'bot'"
            >
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="mm-b rt-content" v-html="renderRichText(m.text)"></div>
            </div>
          </template>
        </template>
      </div>
    </div>
  </aside>

  <!-- 记忆搜索页 -->
  <div id="memSearchPage" class="mem-search-layer" :class="{ show: nav.memSearchOpen }">
    <div class="msp-top">
      <div class="msp-field">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2" />
          <path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <input
          id="memSearchInput"
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          placeholder="搜索..."
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
          @keydown.enter.prevent="commitSearchHistory"
        />
      </div>
      <button
        id="memSearchCancel"
        type="button"
        class="msp-cancel"
        @click="nav.memSearchOpen = false"
      >
        取消
      </button>
    </div>

    <div class="msp-scroll">
      <div v-show="!normalizedQuery" id="memSearchHistBox">
        <div class="msp-hhead">
          <span>搜索记录</span>
          <button id="memSearchClear" type="button" @click="chat.clearSearchHistory()">
            清空
          </button>
        </div>
        <div id="memSearchChips">
          <div
            v-if="!(study.state.memSearchHist || []).length"
            class="mem-empty"
            style="padding: 18px 0"
          >
            暂无搜索记录
          </div>
          <button
            v-for="h in study.state.memSearchHist || []"
            :key="h"
            type="button"
            class="msp-chip"
            @click="applyHistoryChip(h)"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7" />
              <path
                d="M12 7.5V12l3 2"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              />
            </svg>
            <span>{{ h }}</span>
          </button>
        </div>
      </div>

      <div v-if="normalizedQuery" id="memSearchResults" class="msp-results">
        <div v-if="!searchResults.length" class="mem-empty">没有找到相关会话</div>
        <button
          v-for="s in searchResults"
          :key="s.id"
          type="button"
          class="msp-result"
          @click="openResultSession(s.id)"
        >
          <div class="r-title" v-html="highlightHtml(displaySessionTitle(s), normalizedQuery)"></div>
          <div class="r-snip" v-html="highlightHtml(snippetOf(s, normalizedQuery), normalizedQuery)"></div>
          <div class="r-meta">{{ s.stamp || "" }} · {{ s.msgs.length }} 条对话</div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import type { ChatSession } from "@mnk/shared";
import { ASSETS } from "@/assets/manifest";
import { renderRichText } from "@/utils/renderRichText";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";
import { useChatStore, displaySessionTitle, memNormalize } from "@/stores/chat";

const nav = useNavigationStore();
const study = useStudyStore();
const chat = useChatStore();

const searchQuery = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);

const normalizedQuery = computed(() => memNormalize(searchQuery.value));
const searchResults = computed(() => chat.searchSessions(normalizedQuery.value));

async function openSearch() {
  searchQuery.value = "";
  nav.memSearchOpen = true;
  await nextTick();
  searchInputRef.value?.focus();
}

function commitSearchHistory() {
  if (!normalizedQuery.value) return;
  void chat.recordSearchHistory(normalizedQuery.value);
}

function applyHistoryChip(q: string) {
  searchQuery.value = q;
  void chat.recordSearchHistory(q);
  searchInputRef.value?.focus();
}

function openResultSession(sid: string) {
  if (normalizedQuery.value) {
    void chat.recordSearchHistory(normalizedQuery.value);
  }
  nav.memSearchOpen = false;
  chat.openDetailBySession(sid);
}

function askDeleteSession(sid: string) {
  if (typeof window !== "undefined" && !window.confirm("确定删除这条回忆吗？")) {
    return;
  }
  void chat.deleteChatSession(sid);
}

function snippetOf(s: ChatSession, q: string): string {
  const k = q.toLowerCase();
  for (const m of s.msgs || []) {
    const t = m.text || "";
    const idx = t.toLowerCase().indexOf(k);
    if (idx >= 0) {
      const from = Math.max(0, idx - 16);
      const prefix = from > 0 ? "…" : "";
      const suffix = idx + q.length + 52 < t.length ? "…" : "";
      return prefix + t.slice(from, idx + q.length + 52) + suffix;
    }
  }
  return s.msgs[0]?.text || "";
}

function escHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] || c;
  });
}

function highlightHtml(text: string, q: string): string {
  const safeText = escHtml(text);
  const safeKey = escHtml(memNormalize(q));
  if (!safeKey) return safeText;
  const re = new RegExp(safeKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return safeText.replace(re, (m) => `<em>${m}</em>`);
}
</script>

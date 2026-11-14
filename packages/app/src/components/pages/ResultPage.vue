<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { GradeSessionResult } from "@mnk/shared";
import { ASSETS } from "@/assets/manifest";
import { renderRichText } from "@/utils/renderRichText";
import {
  buildResultFollowupPrompt,
  streamQuizSummary,
} from "@/services/aiStudyTutor";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";
import { useSettingsStore } from "@/stores/settings";
import { useChatStore } from "@/stores/chat";

const nav = useNavigationStore();
const study = useStudyStore();
const settingsStore = useSettingsStore();
const chat = useChatStore();

const res = computed(() => study.lastResult);
const wrongItems = computed(() => (res.value ? res.value.items.filter((i) => !i.ok) : []));

const summaryText = ref("");
const summaryLoading = ref(false);
const summarizedRef = ref<GradeSessionResult | null>(null);
let summaryAbort: AbortController | null = null;

function abortSummary() {
  if (summaryAbort) {
    summaryAbort.abort();
    summaryAbort = null;
  }
  summaryLoading.value = false;
}

async function generateSummary(force = false) {
  const current = res.value;
  if (!current) return;
  if (!force && summarizedRef.value === current && summaryText.value) return;

  abortSummary();
  summarizedRef.value = current;
  const ctl = new AbortController();
  summaryAbort = ctl;
  summaryLoading.value = true;
  summaryText.value = "";

  try {
    const out = await streamQuizSummary(current, {
      mode: settingsStore.settings.aiMode,
      signal: ctl.signal,
      onDelta: (full) => {
        summaryText.value = full;
      },
    });
    summaryText.value = out.text;
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      summaryText.value = "总结生成暂时中断，可点击右上角「重新生成」或进入聊天复盘。";
    }
  } finally {
    if (summaryAbort === ctl) {
      summaryAbort = null;
      summaryLoading.value = false;
    }
  }
}

watch(
  () => [nav.currentPage, study.lastResult] as const,
  ([page, latest]) => {
    if (page === "result" && latest) {
      void generateSummary(false);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  abortSummary();
});

function askResultFollowup() {
  const current = res.value;
  if (!current) return;
  abortSummary();
  const { title, prompt } = buildResultFollowupPrompt(current);
  void chat.askWithStudyContext({
    title,
    prompt,
    returnRoute: { page: "result", label: "返回总结" },
  });
}

const resultPetals = Array.from({ length: 16 }, (_, idx) => ({
  id: idx,
  style: {
    left: `${((idx * 6.3 + 4) % 100).toFixed(1)}%`,
    animationDuration: `${(6 + ((idx * 3.7) % 7)).toFixed(2)}s`,
    animationDelay: `${(-((idx * 2.3) % 10)).toFixed(2)}s`,
    transform: `scale(${(0.6 + ((idx * 0.19) % 0.8)).toFixed(2)})`,
  },
}));

const titleText = computed(() => {
  const r = res.value;
  if (!r) return "";
  if (r.isWrongPractice) {
    return r.passed ? "🎉 错题重做通过！" : "💪 还有错题，再来一次";
  }
  if (r.allRight) return "🎉 全部答对，通关！";
  return r.passed ? "🎉 通过本关！" : "💪 差一点，再来一次";
});

const elapsedText = computed(() => {
  const sec = res.value?.elapsedSec || 0;
  return `${Math.floor(sec / 60)}分${sec % 60}秒`;
});

const nextContinueLevel = computed(() => {
  const r = res.value;
  if (!r || r.isWrongPractice) return 1;
  return Math.min(Math.max(r.level + 1, study.state.currentLevel), study.totalLevels);
});

const nextButtonLabel = computed(() => {
  const r = res.value;
  if (!r) return "";
  if (r.isWrongPractice) return "完成错题重做，返回首页 →";
  if (r.level < study.totalLevels) {
    return nextContinueLevel.value === r.level + 1
      ? `进入第 ${nextContinueLevel.value} 关 →`
      : `回到第 ${nextContinueLevel.value} 关 →`;
  }
  return "已完成全部关卡 →";
});

function handleBack() {
  abortSummary();
  if (res.value?.isWrongPractice) {
    nav.go("home");
  } else {
    nav.go("levels");
  }
}

function handleRetry() {
  const r = res.value;
  if (!r) return;
  abortSummary();
  if (r.isWrongPractice) {
    void study.startWrongPractice(study.quizSession?.wrongKeys || []);
  } else {
    void study.startLevel(r.level);
  }
}

function handleNext() {
  const r = res.value;
  if (!r) return;
  abortSummary();
  if (r.isWrongPractice) {
    nav.go("home");
  } else if (r.level < study.totalLevels) {
    void study.startLevel(nextContinueLevel.value);
  } else {
    nav.go("levels");
  }
}
</script>

<template>
  <section id="result" class="page" :class="{ on: nav.currentPage === 'result' }">
    <div class="bg-layer"></div>
    <div id="resGarden" class="res-garden" aria-hidden="true">
      <img class="rg1" :src="ASSETS.garden.gazebo" alt="" />
      <img class="rg2" :src="ASSETS.garden.arch" alt="" />
      <img class="rg3" :src="ASSETS.garden.swing" alt="" />
      <img class="rg4" :src="ASSETS.garden.lamp" alt="" />
    </div>
    <div id="resPetals" class="res-petals" aria-hidden="true">
      <i v-for="p in resultPetals" :key="p.id" class="rpetal" :style="p.style"></i>
    </div>

    <button
      id="resBack"
      class="res-back res-icon-back"
      type="button"
      :aria-label="res?.isWrongPractice ? '返回首页' : '返回地图'"
      :title="res?.isWrongPractice ? '返回首页' : '返回地图'"
      @click="handleBack"
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

    <div v-if="res" id="rwrap" class="rwrap" :class="{ 'is-pass': res.passed }">
      <div class="rtitle">{{ titleText }}</div>
      <div class="rdata">
        <div class="rnum">
          <div class="lbl">答对题数</div>
          <div class="big">
            {{ res.right }}<span class="tot"> / {{ res.total }}</span>
          </div>
          <div class="sub">
            用时 {{ elapsedText }} ·
            {{ res.isWrongPractice ? "错题重做" : `第 ${res.level} 关` }}
          </div>
        </div>
      </div>

      <button v-if="!res.passed" id="retryBtn" class="retry" type="button" @click="handleRetry">
        再来一次
      </button>

      <!-- Post-Test AI Summary Card -->
      <div class="res-ai-card">
        <div class="res-ai-head">
          <span class="res-ai-title">🌸 Lune 的测试总结</span>
          <div class="res-ai-acts">
            <button
              type="button"
              class="res-ai-btn"
              :disabled="summaryLoading"
              @click="generateSummary(true)"
            >
              {{ summaryLoading ? "总结中…" : "重新生成" }}
            </button>
            <button
              type="button"
              class="res-ai-btn primary"
              @click="askResultFollowup"
            >
              💬 深入复盘
            </button>
          </div>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          class="res-ai-body rt-content"
          v-html="
            renderRichText(summaryText || 'Lune 正在分析你的答题表现与知识点分布…')
          "
        ></div>
      </div>

      <div class="rerr" :class="{ allright: wrongItems.length === 0 }">
        <div class="rlabel">
          {{ wrongItems.length ? "错误题目 / 易错易混点" : "易错易混点（本关无）" }}
        </div>
        <div class="items">
          <template v-if="wrongItems.length">
            <div v-for="item in wrongItems" :key="item.questionId" class="err-item">
              <b>[{{ item.m }} · {{ item.tag }}]</b> {{ item.q }}<br />
              <span class="ea">你的答案：{{ item.chosen }}</span><br />
              <span class="ok">正确答案：{{ item.ansText }}</span><br />
              <span class="ana">解析：{{ item.explain }}</span>
            </div>
          </template>
          <div
            v-else
            style="font-size: 12px; color: #4a8a5c; text-align: center; padding: 20px 0"
          >
            全部答对，没有错误知识点 🎉
          </div>
        </div>
      </div>

      <button v-if="res.passed" id="nextLevelBtn" class="nextlevel" type="button" @click="handleNext">
        {{ nextButtonLabel }}
      </button>
    </div>
  </section>
</template>

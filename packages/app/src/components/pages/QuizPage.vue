<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ASSETS } from "@/assets/manifest";
import { renderRichText } from "@/utils/renderRichText";
import {
  buildQuizFollowupPrompt,
  streamQuestionMultiIdeas,
} from "@/services/aiStudyTutor";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";
import { useSettingsStore } from "@/stores/settings";
import { useChatStore } from "@/stores/chat";

const nav = useNavigationStore();
const study = useStudyStore();
const settingsStore = useSettingsStore();
const chat = useChatStore();

const qzoneRef = ref<HTMLElement | null>(null);
const selectedOptionIdx = ref<number | null>(null);
const codeSelfJudge = ref<boolean | null>(null);
const codePreviews = ref<string[]>([]);
const stepSubmitting = ref(false);

const aiIdeasOpen = ref(false);
const aiIdeasLoading = ref(false);
const aiIdeasText = ref("");
let ideasAbort: AbortController | null = null;

const session = computed(() => study.quizSession);
const currentQuestion = computed(() => session.value?.questions[study.quizIdx] || null);
const totalQuestions = computed(() => session.value?.questions.length || 0);
const isLastQuestion = computed(() => study.quizIdx === totalQuestions.value - 1);
const stepEval = computed(() => study.currentStepEvaluation);

const progressPct = computed(() => {
  const tot = totalQuestions.value || 8;
  const done = study.quizIdx + (stepEval.value ? 1 : 0.35);
  return Math.min(100, Math.max(8, Math.round((done / tot) * 100)));
});

const backLabel = computed(() =>
  session.value?.isWrongPractice ? "返回首页" : "返回地图"
);

const canConfirm = computed(() => {
  if (!currentQuestion.value) return false;
  if (stepEval.value) return true;
  if (currentQuestion.value.type === "code") {
    return codeSelfJudge.value !== null;
  }
  return selectedOptionIdx.value !== null;
});

const primaryBtnLabel = computed(() => {
  if (!stepEval.value) {
    return stepSubmitting.value ? "判题中…" : "确认作答";
  }
  return isLastQuestion.value ? "完成测试，看总结 →" : "下一题 →";
});

function abortIdeas() {
  if (ideasAbort) {
    ideasAbort.abort();
    ideasAbort = null;
  }
  aiIdeasLoading.value = false;
}

watch(
  () => [session.value?.sessionId, study.quizIdx],
  () => {
    abortIdeas();
    selectedOptionIdx.value = null;
    codeSelfJudge.value = null;
    codePreviews.value = [];
    aiIdeasOpen.value = false;
    aiIdeasText.value = "";
    if (qzoneRef.value) {
      qzoneRef.value.scrollTop = 0;
    }
  }
);

onBeforeUnmount(() => {
  abortIdeas();
});

function handleBack() {
  abortIdeas();
  if (session.value?.isWrongPractice) {
    nav.go("home");
  } else {
    nav.go("levels");
  }
}

function selectOption(oi: number) {
  if (stepEval.value || stepSubmitting.value) return;
  selectedOptionIdx.value = oi;
}

function onCodeScreenshotChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      codePreviews.value.push(reader.result);
    }
  };
  reader.readAsDataURL(file);
}

async function scrollQzoneBottom() {
  await nextTick();
  const el = qzoneRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
}

async function handlePrimaryAction() {
  const q = currentQuestion.value;
  if (!q || stepSubmitting.value) return;

  if (stepEval.value) {
    abortIdeas();
    stepSubmitting.value = true;
    try {
      await study.advanceAfterQuizStep();
    } finally {
      stepSubmitting.value = false;
    }
    return;
  }

  if (q.type === "code") {
    if (codeSelfJudge.value === null) return;
    stepSubmitting.value = true;
    try {
      await study.evaluateCurrentQuizStep({
        questionId: q.id,
        bid: q.bid,
        selfJudgeOk: codeSelfJudge.value,
      });
      await scrollQzoneBottom();
    } finally {
      stepSubmitting.value = false;
    }
    return;
  }

  if (selectedOptionIdx.value === null || !q.opts) return;
  const chosenText = q.opts[selectedOptionIdx.value];
  stepSubmitting.value = true;
  try {
    await study.evaluateCurrentQuizStep({
      questionId: q.id,
      bid: q.bid,
      chosenText,
    });
    await scrollQzoneBottom();
  } finally {
    stepSubmitting.value = false;
  }
}

async function loadMultiIdeas() {
  const item = stepEval.value;
  if (!item || aiIdeasLoading.value) return;

  abortIdeas();
  const ctl = new AbortController();
  ideasAbort = ctl;
  aiIdeasOpen.value = true;
  aiIdeasLoading.value = true;
  aiIdeasText.value = "";
  void scrollQzoneBottom();

  try {
    const res = await streamQuestionMultiIdeas(item, {
      mode: settingsStore.settings.aiMode,
      signal: ctl.signal,
      onDelta: (full) => {
        aiIdeasText.value = full;
      },
    });
    aiIdeasText.value = res.text;
    void scrollQzoneBottom();
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      aiIdeasText.value = "生成思路失败，请稍后重试或点击「追问 Lune」。";
    }
  } finally {
    if (ideasAbort === ctl) {
      ideasAbort = null;
      aiIdeasLoading.value = false;
    }
  }
}

function followupInChat() {
  const item = stepEval.value;
  if (!item) return;
  abortIdeas();
  const { title, prompt } = buildQuizFollowupPrompt(item);
  void chat.askWithStudyContext({
    title,
    prompt,
    returnRoute: { page: "quiz", label: "返回测试" },
  });
}
</script>

<template>
  <section id="quiz" class="page" :class="{ on: nav.currentPage === 'quiz' }">
    <div class="bg-layer"></div>
    <div class="top">
      <button
        id="quizBack"
        class="backbtn quiz-icon-back"
        type="button"
        :aria-label="backLabel"
        :title="backLabel"
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
      <div id="quizProg" class="progressbar">
        <div class="quiz-prog-track" aria-hidden="true">
          <i class="quiz-prog-fill" :style="{ width: `${progressPct}%` }"></i>
        </div>
        <span id="quizProgText">第 {{ study.quizIdx + 1 }} / {{ totalQuestions || 8 }} 题</span>
      </div>
    </div>

    <div class="girlzone">
      <img :src="ASSETS.cardGirls[0]" alt="" />
    </div>

    <div v-if="currentQuestion" id="qzone" ref="qzoneRef" class="qzone">
      <div class="qtext">
        <span class="qidx">{{ study.quizIdx + 1 }}/{{ totalQuestions }}</span>{{ currentQuestion.q }}
      </div>

      <!-- Code Self-Judge Question -->
      <template v-if="currentQuestion.type === 'code'">
        <div class="code-box">
          <div class="upload-row">
            <label>代码截图</label>
            <input type="file" accept="image/*" @change="onCodeScreenshotChange" />
          </div>
          <div class="upload-row">
            <label>运行结果截图</label>
            <input type="file" accept="image/*" @change="onCodeScreenshotChange" />
          </div>
          <div id="codePreview" class="code-preview">
            <img
              v-for="(src, idx) in codePreviews"
              :key="idx"
              :src="src"
              alt=""
              style="
                max-width: 100%;
                max-height: 110px;
                border: 2px solid var(--brown);
                margin-bottom: 8px;
                display: block;
              "
            />
          </div>
        </div>

        <div v-show="codePreviews.length >= 2 || Boolean(stepEval)" id="codeAnswer" class="code-answer">
          <div class="ca-title">参考答案</div>
          <pre>{{ currentQuestion.refCode }}</pre>
          <div class="ca-expect">预期输出：{{ currentQuestion.expect }}</div>
          <div v-if="!stepEval" class="self-judge">
            <span>你的代码和输出都对吗？</span>
            <button
              class="sj-btn ok"
              :class="{ active: codeSelfJudge === true }"
              type="button"
              @click="codeSelfJudge = true"
            >
              ✓ 正确
            </button>
            <button
              class="sj-btn no"
              :class="{ active: codeSelfJudge === false }"
              type="button"
              @click="codeSelfJudge = false"
            >
              ✗ 做错了
            </button>
          </div>
        </div>
      </template>

      <!-- Multiple Choice Question -->
      <template v-else>
        <button
          v-for="(opt, oi) in currentQuestion.opts || []"
          :key="oi"
          type="button"
          :disabled="Boolean(stepEval)"
          :class="[
            'opt',
            opt.includes('\n') ? 'codeopt' : '',
            selectedOptionIdx === oi && !stepEval ? 'sel' : '',
            stepEval && opt === stepEval.ansText ? 'is-right' : '',
            stepEval && !stepEval.ok && selectedOptionIdx === oi ? 'is-wrong' : '',
          ]"
          @click="selectOption(oi)"
        >
          {{ String.fromCharCode(65 + oi) }}. {{ opt }}
        </button>
      </template>

      <!-- Post-Answer Reference Explanation & Multi-Idea AI Linkage -->
      <div v-if="stepEval" class="quiz-eval-card" :class="stepEval.ok ? 'ok' : 'err'">
        <div class="eval-head">
          <span class="eval-badge">
            {{ stepEval.ok ? "✓ 回答正确" : "✗ 本题答错了" }}
          </span>
          <span class="eval-tag">{{ stepEval.m }} · {{ stepEval.tag }}</span>
        </div>

        <div v-if="stepEval.type !== 'code'" class="eval-ans">
          参考答案：<b>{{ stepEval.ansText }}</b>
        </div>
        <div v-if="stepEval.explain" class="eval-exp">
          解析：{{ stepEval.explain }}
        </div>

        <div class="eval-acts">
          <button
            type="button"
            class="eval-ai-btn"
            :disabled="aiIdeasLoading"
            @click="loadMultiIdeas"
          >
            {{
              aiIdeasLoading
                ? "✨ 正在生成多种思路…"
                : aiIdeasText
                  ? "✨ 重新生成思路"
                  : "✨ AI 多种解题思路"
            }}
          </button>
          <button type="button" class="eval-chat-btn" @click="followupInChat">
            💬 追问 Lune
          </button>
        </div>

        <div v-if="aiIdeasOpen" class="eval-ideas-box">
          <div class="ideas-title">🌸 Lune 的多维解法拆解</div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            class="ideas-body rt-content"
            v-html="
              renderRichText(aiIdeasText || '正在结合参考答案为你推导不同解题角度…')
            "
          ></div>
        </div>
      </div>

      <button
        v-show="canConfirm"
        id="nextQ"
        class="nextbtn"
        :class="{ 'is-confirm': !stepEval, 'is-next': Boolean(stepEval) }"
        type="button"
        :disabled="stepSubmitting"
        @click="handlePrimaryAction"
      >
        {{ primaryBtnLabel }}
      </button>
    </div>
  </section>
</template>

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  CARDS_PER_LEVEL,
  WRONG_MASTER_N,
  createDefaultSaveState,
  formatTodayKey,
  type CardChapter,
  type FlatCardItem,
  type GradeSessionResult,
  type QuizAnswerInput,
  type QuizGradedItem,
  type QuizSessionPayload,
  type UserSaveState,
  type WrongBookItem,
} from "@mnk/shared";
import { ASSETS } from "@/assets/manifest";
import { backendClient } from "@/services/backendClient";
import { useNavigationStore } from "./navigation";

export type WrongSortMode = "recent" | "created" | "level" | "tag";

export interface KeyedWrongBookItem extends WrongBookItem {
  __key: string;
}

export function cardGirlForId(cardId: string): string {
  let seed = 0;
  for (let k = 0; k < cardId.length; k++) {
    seed = (seed * 31 + cardId.charCodeAt(k)) >>> 0;
  }
  return ASSETS.cardGirls[seed % ASSETS.cardGirls.length];
}

export const useStudyStore = defineStore("study", () => {
  const ready = ref(false);
  const chapters = ref<CardChapter[]>([]);
  const totalLevels = ref(20);
  const cardsPerLevel = ref(CARDS_PER_LEVEL);
  const wrongMasterStreak = ref(WRONG_MASTER_N);
  const state = ref<UserSaveState>(createDefaultSaveState());

  // Card study UI state
  const currentChapterIndex = ref(0);
  const flippedIds = ref<Record<string, boolean>>({});
  const flashCardId = ref<string | null>(null);

  // Map camera state
  const mapCam = ref<number>(1);

  // Wrong book filter
  const wrongSortMode = ref<WrongSortMode>("recent");

  // Calendar selected date key
  const calSelKey = ref<string | null>(null);

  // Active quiz session & last settlement result
  const quizSession = ref<QuizSessionPayload | null>(null);
  const quizIdx = ref(0);
  const quizAnswers = ref<QuizAnswerInput[]>([]);
  const quizRecordedCount = ref(0);
  const quizStartTime = ref(0);
  const currentStepEvaluation = ref<QuizGradedItem | null>(null);
  const lastResult = ref<GradeSessionResult | null>(null);

  const flatCards = computed<FlatCardItem[]>(() => {
    const out: FlatCardItem[] = [];
    chapters.value.forEach((ch, ci) => {
      ch.cards.forEach((c, i) => {
        out.push({
          ...c,
          id: `c${ci}_${i}`,
          ch: ch.ch,
          chTitle: ch.title,
          chapterIndex: ci,
          cardIndex: i,
        });
      });
    });
    return out;
  });

  const masteredCount = computed(() => Object.keys(state.value.mastered || {}).length);
  const totalCardsCount = computed(() => flatCards.value.length);

  const clearedCount = computed(
    () => Object.values(state.value.cleared || {}).filter(Boolean).length
  );

  const starredCards = computed<FlatCardItem[]>(() => {
    const ids = Object.keys(state.value.starred || {}).filter((k) => state.value.starred[k]);
    return ids
      .map((id) => flatCards.value.find((c) => c.id === id))
      .filter((x): x is FlatCardItem => Boolean(x));
  });

  const sortedWrongList = computed<KeyedWrongBookItem[]>(() => {
    const wb = state.value.wrongBook || {};
    const arr: KeyedWrongBookItem[] = Object.keys(wb).map((k) => ({
      ...wb[k],
      __key: k,
    }));
    const mode = wrongSortMode.value;
    if (mode === "level") {
      arr.sort((a, b) => (a.level ?? 9999) - (b.level ?? 9999));
    } else if (mode === "tag") {
      arr.sort((a, b) => String(a.tag || "").localeCompare(String(b.tag || "")));
    } else if (mode === "created") {
      arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return arr;
  });

  function isLevelUnlocked(lv: number): boolean {
    if (lv <= 1) return true;
    return Boolean(state.value.cleared[String(lv - 1)]);
  }

  function isLevelPlayable(lv: number): boolean {
    return isLevelUnlocked(lv) || Boolean(state.value.cleared[String(lv)]);
  }

  function hydrate(payload: {
    cards: CardChapter[];
    totalLevels: number;
    cardsPerLevel: number;
    wrongMasterStreak: number;
    state: UserSaveState;
  }) {
    chapters.value = payload.cards;
    totalLevels.value = payload.totalLevels;
    cardsPerLevel.value = payload.cardsPerLevel;
    wrongMasterStreak.value = payload.wrongMasterStreak;
    state.value = payload.state;
    mapCam.value = payload.state.currentLevel;
    ready.value = true;
  }

  async function persistState() {
    if (!ready.value) {
      return;
    }
    try {
      const saved = await backendClient.saveUserState(state.value);
      state.value = saved;
    } catch (err) {
      console.error("[study] 保存用户状态失败:", err);
      useNavigationStore().toast("保存失败：本地存储异常");
    }
  }

  function openChapter(ci: number, jumpCardId?: string) {
    if (ci < 0 || ci >= chapters.value.length) return;
    currentChapterIndex.value = ci;
    flippedIds.value = {};
    const nav = useNavigationStore();
    nav.go("cards");
    if (jumpCardId) {
      flashCardId.value = jumpCardId;
      window.setTimeout(() => {
        if (flashCardId.value === jumpCardId) flashCardId.value = null;
      }, 1300);
    } else {
      flashCardId.value = null;
    }
  }

  async function toggleCardFlip(cardId: string) {
    flippedIds.value[cardId] = !flippedIds.value[cardId];
    if (!state.value.mastered[cardId]) {
      try {
        state.value = await backendClient.recordCardFlip(cardId);
      } catch (err) {
        console.warn("[study] 记录翻卡进度失败:", err);
      }
    }
  }

  async function toggleCardStar(cardId: string) {
    if (state.value.starred[cardId]) {
      delete state.value.starred[cardId];
    } else {
      state.value.starred[cardId] = true;
    }
    await persistState();
  }

  async function updateUserName(raw: string) {
    const cleaned = String(raw || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12);
    state.value.name = cleaned || "用户1";
    await persistState();
  }

  // ---- Quiz Actions ----
  async function startLevel(level: number) {
    const nav = useNavigationStore();
    const lv = Math.min(Math.max(Math.trunc(level) || 1, 1), totalLevels.value);
    if (!isLevelPlayable(lv)) {
      nav.toast(`先通过第 ${lv - 1} 关的测试`);
      return;
    }
    try {
      const session = await backendClient.startLevelSession(lv);
      quizSession.value = session;
      quizIdx.value = 0;
      quizAnswers.value = [];
      quizRecordedCount.value = 0;
      currentStepEvaluation.value = null;
      quizStartTime.value = Date.now();
      nav.go("quiz");
    } catch (err) {
      nav.toast(err instanceof Error ? err.message : String(err));
    }
  }

  async function startWrongPractice(keys: string[] = []) {
    const nav = useNavigationStore();
    try {
      const session = await backendClient.startWrongPracticeSession(keys);
      quizSession.value = session;
      quizIdx.value = 0;
      quizAnswers.value = [];
      quizRecordedCount.value = 0;
      currentStepEvaluation.value = null;
      quizStartTime.value = Date.now();
      nav.go("quiz");
    } catch (err) {
      nav.toast(err instanceof Error ? err.message : String(err));
    }
  }

  async function evaluateCurrentQuizStep(
    input: QuizAnswerInput
  ): Promise<QuizGradedItem | null> {
    const nav = useNavigationStore();
    const ses = quizSession.value;
    if (!ses) return null;
    if (currentStepEvaluation.value) return currentStepEvaluation.value;

    quizAnswers.value[quizIdx.value] = input;
    try {
      const stepRes = await backendClient.recordQuizStep({ answer: input });
      state.value = stepRes.state;
      quizRecordedCount.value = Math.max(quizRecordedCount.value, quizIdx.value + 1);
      currentStepEvaluation.value = stepRes.item;

      if (stepRes.item.removedFromWrongBook) {
        nav.toast(
          `「${stepRes.item.tag}」已连对 ${wrongMasterStreak.value} 次，移出错题本 ✓`
        );
      } else if (ses.isWrongPractice) {
        if (stepRes.item.ok && stepRes.item.wrongStreakCount > 0) {
          nav.toast(`连对进度 ${stepRes.item.wrongStreakCount} / ${wrongMasterStreak.value}`);
        } else if (!stepRes.item.ok) {
          nav.toast("答错，连对计数已归零");
        }
      }
      return stepRes.item;
    } catch (err) {
      console.warn("[study] 单题判题失败，将在交卷时补偿:", err);
      const q = ses.questions[quizIdx.value];
      const fallbackItem: QuizGradedItem = {
        questionId: input.questionId,
        bid: input.bid,
        m: q?.m || "M1",
        tag: q?.tag || "知识点",
        type: q?.type || "choice",
        q: q?.q || "",
        chosen:
          q?.type === "code"
            ? input.selfJudgeOk
              ? "自评：正确"
              : "自评：做错"
            : input.chosenText || "未作答",
        ok: Boolean(input.selfJudgeOk),
        ansText: q?.expect || "",
        explain: q?.doc || "交卷后将同步完整评分结果。",
        wrongStreakCount: 0,
        removedFromWrongBook: false,
      };
      currentStepEvaluation.value = fallbackItem;
      return fallbackItem;
    }
  }

  async function advanceAfterQuizStep() {
    const nav = useNavigationStore();
    const ses = quizSession.value;
    if (!ses) return;

    currentStepEvaluation.value = null;

    if (quizIdx.value < ses.questions.length - 1) {
      quizIdx.value += 1;
      return;
    }

    // Final question -> submit to authoritative backend grader!
    const elapsedSec = Math.max(0, Math.round((Date.now() - quizStartTime.value) / 1000));
    try {
      const prevRecorded = quizRecordedCount.value;
      const graded = await backendClient.submitQuizSession({
        sessionId: ses.sessionId,
        level: ses.level,
        isWrongPractice: ses.isWrongPractice,
        wrongKeys: ses.wrongKeys,
        elapsedSec,
        answers: quizAnswers.value,
        recordedCount: prevRecorded,
      });
      state.value = graded.state;
      lastResult.value = graded;
      quizRecordedCount.value = graded.items.length;
      mapCam.value = state.value.currentLevel;

      // Surface wrong-book streak removal toasts for any unrecorded items
      const newlyGraded = graded.items.slice(prevRecorded);
      const removedItems = newlyGraded.filter((i) => i.removedFromWrongBook);
      if (removedItems.length > 0) {
        window.setTimeout(() => {
          nav.toast(
            `「${removedItems[0].tag}」已连对 ${wrongMasterStreak.value} 次，移出错题本 ✓`
          );
        }, 280);
      } else if (ses.isWrongPractice && newlyGraded.length > 0) {
        const lastItem = newlyGraded[newlyGraded.length - 1];
        if (lastItem.ok && lastItem.wrongStreakCount > 0) {
          nav.toast(`连对进度 ${lastItem.wrongStreakCount} / ${wrongMasterStreak.value}`);
        } else if (!lastItem.ok) {
          nav.toast("答错，连对计数已归零");
        }
      }
      nav.go("result");
    } catch (err) {
      nav.toast(err instanceof Error ? err.message : String(err));
    }
  }

  async function recordQuizStepAndAdvance(input: QuizAnswerInput) {
    await evaluateCurrentQuizStep(input);
    await advanceAfterQuizStep();
  }

  async function deleteWrongItem(key: string) {
    if (!state.value.wrongBook[key]) return;
    delete state.value.wrongBook[key];
    await persistState();
  }

  async function clearWrongBook() {
    state.value.wrongBook = {};
    await persistState();
  }

  // ---- Calendar Actions ----
  function openCalendarModal() {
    const nav = useNavigationStore();
    if (!calSelKey.value) {
      const now = new Date();
      state.value.calYM = { y: now.getFullYear(), m: now.getMonth() + 1 };
      calSelKey.value = formatTodayKey(now);
    }
    nav.openModal("calendar");
  }

  async function selectCalendarDay(key: string) {
    const [y, m] = key.split("-").map(Number);
    if (y !== state.value.calYM.y || m !== state.value.calYM.m) {
      state.value.calYM = { y, m };
    }
    calSelKey.value = key;
    await persistState();
  }

  async function shiftCalendarMonth(delta: number) {
    let { y, m } = state.value.calYM;
    m += delta;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    state.value.calYM = { y, m };
    if (calSelKey.value) {
      const oldD = Number(calSelKey.value.split("-")[2]) || 1;
      const dim = new Date(y, m, 0).getDate();
      const clampedD = Math.min(oldD, dim);
      calSelKey.value = `${y}-${String(m).padStart(2, "0")}-${String(clampedD).padStart(2, "0")}`;
    }
    await persistState();
  }

  async function goCalendarToday() {
    const now = new Date();
    state.value.calYM = { y: now.getFullYear(), m: now.getMonth() + 1 };
    calSelKey.value = formatTodayKey(now);
    await persistState();
  }

  async function moveCalendarSelection(deltaDays: number) {
    const baseKey = calSelKey.value || formatTodayKey();
    const [by, bm, bd] = baseKey.split("-").map(Number);
    const dt = new Date(by, bm - 1, bd + deltaDays);
    calSelKey.value = formatTodayKey(dt);
    state.value.calYM = { y: dt.getFullYear(), m: dt.getMonth() + 1 };
    await persistState();
  }

  async function addScheduleItem(rawText: string): Promise<boolean> {
    const nav = useNavigationStore();
    const text = rawText.trim();
    if (!text) {
      nav.toast("先写点什么再添加");
      return false;
    }
    if (!calSelKey.value) {
      calSelKey.value = formatTodayKey();
    }
    const [y, m] = calSelKey.value.split("-").map(Number);
    state.value.calYM = { y, m };
    if (!state.value.sched[calSelKey.value]) {
      state.value.sched[calSelKey.value] = [];
    }
    state.value.sched[calSelKey.value].push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      text,
    });
    await persistState();
    return true;
  }

  async function deleteScheduleItem(id: number) {
    const key = calSelKey.value;
    if (!key || !state.value.sched[key]) return;
    state.value.sched[key] = state.value.sched[key].filter((x) => x.id !== id);
    if (state.value.sched[key].length === 0) {
      delete state.value.sched[key];
    }
    await persistState();
  }

  return {
    ready,
    chapters,
    totalLevels,
    cardsPerLevel,
    wrongMasterStreak,
    state,
    currentChapterIndex,
    flippedIds,
    flashCardId,
    mapCam,
    wrongSortMode,
    calSelKey,
    quizSession,
    quizIdx,
    quizAnswers,
    currentStepEvaluation,
    lastResult,
    flatCards,
    masteredCount,
    totalCardsCount,
    clearedCount,
    starredCards,
    sortedWrongList,
    isLevelUnlocked,
    isLevelPlayable,
    hydrate,
    persistState,
    openChapter,
    toggleCardFlip,
    toggleCardStar,
    updateUserName,
    startLevel,
    startWrongPractice,
    evaluateCurrentQuizStep,
    advanceAfterQuizStep,
    recordQuizStepAndAdvance,
    deleteWrongItem,
    clearWrongBook,
    openCalendarModal,
    selectCalendarDay,
    shiftCalendarMonth,
    goCalendarToday,
    moveCalendarSelection,
    addScheduleItem,
    deleteScheduleItem,
  };
});

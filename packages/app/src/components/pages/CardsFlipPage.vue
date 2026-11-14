<template>
  <section id="cards" class="page" :class="{ on: nav.currentPage === 'cards' }">
    <div class="bg-layer"></div>
    <div class="bar">
      <button
        id="cardsBack"
        type="button"
        class="bar-x"
        aria-label="返回章节目录"
        title="返回章节目录"
        @click="nav.go('cardsMenu')"
      >
        <img class="x-ico" :src="ASSETS.iconClose" alt="" />
      </button>
      <span id="cardsTitle" class="bar-title">
        {{ currentChapter ? `${currentChapter.ch} ${currentChapter.title}` : "M1 基础语法" }}
      </span>
      <button
        id="cardsMenuBtn"
        type="button"
        class="bar-menu"
        aria-label="章节列表"
        title="章节列表"
        @click="nav.go('cardsMenu')"
      >
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="scrollwrap">
      <div id="cardScroll" ref="scrollRef" class="scroll" @scroll.passive="updateScrollThumb">
        <div
          v-for="(c, i) in currentChapter?.cards || []"
          :key="`c${study.currentChapterIndex}_${i}`"
          class="fc"
          :class="{
            flip: Boolean(study.flippedIds[`c${study.currentChapterIndex}_${i}`]),
            flash: study.flashCardId === `c${study.currentChapterIndex}_${i}`,
          }"
          :data-id="`c${study.currentChapterIndex}_${i}`"
          @click="study.toggleCardFlip(`c${study.currentChapterIndex}_${i}`)"
        >
          <img
            class="fc-girl"
            :src="cardGirlForId(`c${study.currentChapterIndex}_${i}`)"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div class="in">
            <div class="sd front">
              <div class="toprow">
                <span class="idx">{{ String(i + 1).padStart(2, "0") }}</span>
                <span
                  class="star"
                  role="button"
                  tabindex="0"
                  aria-label="收藏卡片"
                  :class="{ on: Boolean(study.state.starred[`c${study.currentChapterIndex}_${i}`]) }"
                  @click.stop="study.toggleCardStar(`c${study.currentChapterIndex}_${i}`)"
                >
                  ★
                </span>
              </div>
              <div class="tg">{{ c.tag }}</div>
              <div class="q">{{ c.q }}</div>
              <div class="card-foot">
                <button
                  type="button"
                  class="card-ask-btn"
                  @click.stop="askCardAi(c, i)"
                >
                  💬 问问 Lune
                </button>
                <div class="hint">轻点翻面 →</div>
              </div>
            </div>
            <div class="sd back">
              <div class="tg">答案</div>
              <div class="a">{{ c.a }}</div>
              <div class="card-foot back-foot">
                <button
                  type="button"
                  class="card-ask-btn dark"
                  @click.stop="askCardAi(c, i)"
                >
                  💬 向 Lune 追问
                </button>
                <div class="hint-back">轻点翻回正面 ↺</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div ref="trackRef" class="scroll-track">
        <div id="scrollThumb" class="scroll-thumb" :style="thumbStyle"></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { CardItem } from "@mnk/shared";
import { ASSETS } from "@/assets/manifest";
import { buildCardChatPrompt } from "@/services/aiStudyTutor";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore, cardGirlForId } from "@/stores/study";
import { useChatStore } from "@/stores/chat";

const nav = useNavigationStore();
const study = useStudyStore();
const chat = useChatStore();

const scrollRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);
const thumbStyle = ref<Record<string, string>>({
  height: "100%",
  opacity: "0",
  marginTop: "0px",
});

const currentChapter = computed(() => study.chapters[study.currentChapterIndex] || null);

function askCardAi(c: CardItem, index: number) {
  const cardId = `c${study.currentChapterIndex}_${index}`;
  study.flashCardId = cardId;
  const ch = currentChapter.value?.ch || "M1";
  const chTitle = currentChapter.value?.title || "基础语法";
  const { title, prompt } = buildCardChatPrompt({
    cardId,
    ch,
    chTitle,
    tag: c.tag,
    q: c.q,
    a: c.a,
  });
  void chat.askWithStudyContext({
    title,
    prompt,
    returnRoute: { page: "cards", label: "返回卡片" },
  });
}

function updateScrollThumb() {
  const el = scrollRef.value;
  const track = trackRef.value;
  if (!el || !track) return;
  const ratio = el.scrollHeight > 0 ? el.clientHeight / el.scrollHeight : 1;
  if (ratio >= 1) {
    thumbStyle.value = { height: "100%", opacity: "0", marginTop: "0px" };
    return;
  }
  const maxScroll = el.scrollHeight - el.clientHeight;
  const p = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
  const trackH = track.clientHeight;
  const pct = Math.max(10, ratio * 100);
  const thumbH = (trackH * pct) / 100;
  thumbStyle.value = {
    opacity: "1",
    height: `${pct}%`,
    marginTop: `${p * Math.max(0, trackH - thumbH)}px`,
  };
}

watch(
  () => [nav.currentPage, study.currentChapterIndex] as const,
  async ([page]) => {
    if (page !== "cards") return;
    await nextTick();
    if (scrollRef.value && !study.flashCardId) {
      scrollRef.value.scrollTop = 0;
    }
    window.setTimeout(updateScrollThumb, 30);
  }
);

watch(
  () => study.flashCardId,
  async (id) => {
    if (!id || nav.currentPage !== "cards") return;
    await nextTick();
    const target = scrollRef.value?.querySelector<HTMLElement>(`.fc[data-id="${id}"]`);
    if (target) {
      target.scrollIntoView({ block: "center" });
      window.setTimeout(updateScrollThumb, 50);
    }
  }
);

onMounted(() => {
  window.addEventListener("resize", updateScrollThumb);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateScrollThumb);
});
</script>

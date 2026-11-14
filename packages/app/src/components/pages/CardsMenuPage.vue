<template>
  <section id="cardsMenu" class="page" :class="{ on: nav.currentPage === 'cardsMenu' }">
    <div class="bg-layer cm-bg"></div>
    <img class="deco-icon" :src="ASSETS.cardsMenuDeco" alt="装饰" />
    <div class="cm-top">
      <button id="menuClose" type="button" class="cm-close" @click="nav.go('home')">
        <img class="x-ico" :src="ASSETS.iconClose" alt="" />
      </button>
      <span style="width: 36px"></span>
    </div>
    <h1 class="cm-title">目录</h1>
    <div
      id="menuBody"
      ref="scrollRef"
      class="scroll-container"
      :style="{ paddingTop: padPx + 'px', paddingBottom: padPx + 'px' }"
      @scroll.passive="updateActiveItem"
    >
      <div
        v-for="(ch, ci) in study.chapters"
        :key="ch.ch + ci"
        class="cm-item"
        :class="{ active: activeIdx === ci }"
        @click="study.openChapter(ci)"
      >
        <img class="icon" :src="ASSETS.menuSun" alt="" />
        <div class="text">{{ ch.ch }} {{ ch.title }}</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";

const nav = useNavigationStore();
const study = useStudyStore();

const scrollRef = ref<HTMLElement | null>(null);
const padPx = ref(120);
const activeIdx = ref(0);

function layoutMenu() {
  const el = scrollRef.value;
  if (!el) return;
  const firstItem = el.querySelector<HTMLElement>(".cm-item");
  const boxH = el.clientHeight || 420;
  const itemH = firstItem ? firstItem.offsetHeight : 64;
  padPx.value = Math.max(0, Math.round((boxH - itemH) / 2));
}

function updateActiveItem() {
  const el = scrollRef.value;
  if (!el) return;
  const items = el.querySelectorAll<HTMLElement>(".cm-item");
  if (!items.length) return;
  const boxRect = el.getBoundingClientRect();
  const centerY = boxRect.top + boxRect.height / 2;
  let best = 0;
  let minDist = Infinity;
  items.forEach((item, idx) => {
    const r = item.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - centerY);
    if (d < minDist) {
      minDist = d;
      best = idx;
    }
  });
  activeIdx.value = best;
}

function onResize() {
  if (nav.currentPage === "cardsMenu") {
    layoutMenu();
    updateActiveItem();
  }
}

watch(
  () => nav.currentPage,
  async (page) => {
    if (page === "cardsMenu") {
      await nextTick();
      layoutMenu();
      updateActiveItem();
    }
  }
);

onMounted(() => {
  window.addEventListener("resize", onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
});
</script>

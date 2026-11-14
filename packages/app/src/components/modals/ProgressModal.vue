<template>
  <div
    id="progModal"
    class="modal"
    :class="{ show: nav.activeModal === 'progress' }"
  >
    <div class="cal-box">
      <div class="cal-top">
        <span class="ym">学 习 进 度</span>
        <button id="progClose" type="button" @click="nav.closeModal()">
          <img class="x-ico" :src="ASSETS.iconClose" alt="" />
        </button>
      </div>
      <div class="prog-content">
        <div class="prog-row">
          已掌握
          <span id="progNum" style="color: #d4748a; font-weight: 700">{{
            study.masteredCount
          }}</span>
          / <span id="progTotal">{{ study.totalCardsCount }}</span> 张卡片
        </div>
        <div class="prog-bar-bg">
          <div
            id="progBar"
            class="prog-bar-fill"
            :style="{ width: progressPct + '%' }"
          ></div>
        </div>
        <div class="prog-tip">
          好感度与学习进度挂钩：<br />
          每掌握一张卡片，好感度 +1<br />
          通关一关额外 +10
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";

const nav = useNavigationStore();
const study = useStudyStore();

const progressPct = computed(() => {
  if (!study.totalCardsCount) return 0;
  return Math.min(100, (study.masteredCount / study.totalCardsCount) * 100);
});
</script>

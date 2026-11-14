<template>
  <aside
    id="favDrawer"
    class="fav-drawer"
    :class="{ show: nav.activeDrawer === 'favorites' }"
  >
    <div class="fav-head">
      <span class="t">★ 我 的 收 藏</span>
      <button id="favClose" type="button" @click="nav.closeAllDrawers()">
        <img class="x-ico" :src="ASSETS.iconClose" alt="" />
      </button>
    </div>
    <div id="favBody" class="fav-body">
      <div v-if="study.starredCards.length === 0" class="fav-empty">
        还没有收藏的卡片<br />在翻翻卡点亮 ★ 即可收藏
      </div>

      <template v-else>
        <div
          v-for="c in study.starredCards"
          :key="c.id"
          class="fav-card"
          @click="jumpToCard(c.chapterIndex, c.id)"
        >
          <span class="tg">{{ c.tag }}</span>
          <span class="fav-ch">{{ c.chTitle || "" }}</span>
          <div class="q">{{ c.q }}</div>
          <div class="ans-wrap" :class="{ open: Boolean(expanded[c.id]) }">
            <div class="ans-tog" @click.stop="toggleAnswer(c.id)">
              {{ expanded[c.id] ? "收起答案 ▴" : "查看答案 ▾" }}
            </div>
            <div class="ans-body">{{ c.a }}</div>
          </div>
          <div class="fav-go">去原卡片 →</div>
          <span class="un" @click.stop="study.toggleCardStar(c.id)">★</span>
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";

const nav = useNavigationStore();
const study = useStudyStore();

const expanded = ref<Record<string, boolean>>({});

function toggleAnswer(id: string) {
  expanded.value[id] = !expanded.value[id];
}

function jumpToCard(ci: number, id: string) {
  nav.closeAllDrawers();
  study.openChapter(ci, id);
}
</script>

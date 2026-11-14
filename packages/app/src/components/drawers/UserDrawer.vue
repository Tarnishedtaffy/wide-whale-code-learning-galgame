<template>
  <aside id="drawer" class="drawer" :class="{ show: nav.activeDrawer === 'user' }">
    <div class="d-head">
      <div class="av">
        <img
          :src="ASSETS.avatarLune"
          alt=""
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
      </div>
      <div>
        <div class="nm-row">
          <div id="userName" class="nm">
            <template v-if="!editing">{{ study.state.name || "用户1" }}</template>
            <input
              v-else
              ref="nameInputRef"
              v-model="draftName"
              class="name-input"
              maxlength="12"
              @keydown.enter.prevent="finishEdit(true)"
              @keydown.esc.prevent="finishEdit(false)"
              @blur="finishEdit(true)"
            />
          </div>
          <button
            id="nameEdit"
            class="name-edit"
            type="button"
            title="修改名字"
            aria-label="修改名字"
            @click="startEdit"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 20h4L20 8l-4-4L4 16v4z" />
              <path d="M14 6l4 4" />
            </svg>
          </button>
        </div>
        <div class="sub">LV.1 学习者</div>
      </div>
    </div>
    <div class="d-list">
      <button id="openCal" type="button" class="d-item" @click="study.openCalendarModal()">
        <span class="ico">
          <img class="d-ico" :src="ASSETS.drawerIcons.calendar" alt="" />
        </span>
        日程表
      </button>
      <button
        id="openProgress"
        type="button"
        class="d-item"
        @click="nav.openModal('progress')"
      >
        <span class="ico">
          <img class="d-ico" :src="ASSETS.drawerIcons.progress" alt="" />
        </span>
        学习进度
      </button>
      <button
        id="openFav3"
        type="button"
        class="d-item"
        @click="nav.openDrawer('favorites')"
      >
        <span class="ico">
          <img class="d-ico" :src="ASSETS.drawerIcons.favorites" alt="" />
        </span>
        收藏
      </button>
      <button
        id="openVoiceCallDrawer"
        type="button"
        class="d-item"
        @click="nav.openVoiceCall({ video: false, fromPage: 'home' })"
      >
        <span class="ico d-call-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.15.38 2.35.58 3.6.58a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.58 3.6a1 1 0 0 1-.24 1l-2.24 2.2z"
              stroke="#4a3548"
              stroke-width="1.9"
              fill="#f9dce4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        实时通话
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";

const nav = useNavigationStore();
const study = useStudyStore();

const editing = ref(false);
const draftName = ref("");
const nameInputRef = ref<HTMLInputElement | null>(null);

async function startEdit() {
  if (editing.value) return;
  draftName.value = study.state.name || "用户1";
  editing.value = true;
  await nextTick();
  nameInputRef.value?.focus();
  nameInputRef.value?.select();
}

function finishEdit(save: boolean) {
  if (!editing.value) return;
  editing.value = false;
  if (save) {
    void study.updateUserName(draftName.value);
  }
}
</script>

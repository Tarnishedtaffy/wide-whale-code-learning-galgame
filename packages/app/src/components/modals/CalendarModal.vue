<template>
  <div id="calModal" class="modal" :class="{ show: nav.activeModal === 'calendar' }">
    <div class="cal-box">
      <div class="cal-top">
        <button
          id="calPrev"
          type="button"
          class="nav"
          aria-label="上一月"
          @click="study.shiftCalendarMonth(-1)"
        >
          ◀
        </button>
        <span
          id="calYM"
          class="ym"
          title="回到本月"
          @click="study.goCalendarToday()"
        >
          {{ ymLabel }}<small>{{ isThisMonth ? "本月" : "回本月" }}</small>
        </span>
        <button
          id="calNext"
          type="button"
          class="nav"
          aria-label="下一月"
          @click="study.shiftCalendarMonth(1)"
        >
          ▶
        </button>
        <button
          id="calToday"
          type="button"
          class="nav"
          aria-label="回到今天"
          title="回到今天"
          @click="study.goCalendarToday()"
        >
          今
        </button>
        <button id="calClose" type="button" @click="nav.closeModal()">
          <img class="x-ico" :src="ASSETS.iconClose" alt="" />
        </button>
      </div>

      <div class="cal-body">
        <div class="week">
          <span>日</span><span>一</span><span>二</span><span>三</span>
          <span>四</span><span>五</span><span>六</span>
        </div>
        <div id="calDays" class="days">
          <div
            v-for="cell in dayCells"
            :key="cell.key"
            class="day"
            :class="{
              other: cell.other,
              weekend: cell.weekend,
              today: cell.isToday,
              sel: cell.isSel,
            }"
            :data-key="cell.key"
            :data-day="cell.d"
            @click="study.selectCalendarDay(cell.key)"
          >
            <span class="dn">{{ cell.d }}</span>
            <span v-if="cell.hasSched || cell.hasCheck" class="marks">
              <i v-if="cell.hasSched" class="p"></i>
              <i v-if="cell.hasCheck" class="d"></i>
            </span>
          </div>
        </div>
      </div>

      <div id="calSched" class="cal-sched">
        <div v-if="!study.calSelKey" class="sch-empty">点击日期查看 / 添加日程</div>
        <template v-else>
          <div class="sch-head">
            <span>{{ selectedDateHeading }}</span>
            <em>
              {{ selectedCheckinCount ? `打卡 ${selectedCheckinCount} 次 ` : ""
              }}{{ selectedSchedules.length }} 条日程
            </em>
          </div>
          <div v-if="!selectedSchedules.length" class="sch-empty">这一天还没有日程</div>
          <template v-else>
            <div v-for="it in selectedSchedules" :key="it.id" class="sch-item">
              <span class="dot"></span>
              <div class="stxt">{{ it.text }}</div>
              <span class="del" @click="study.deleteScheduleItem(it.id)"></span>
            </div>
          </template>
        </template>
      </div>

      <div class="cal-add">
        <input
          id="calInput"
          v-model="draftSched"
          type="text"
          placeholder="添加日程…"
          enterkeyhint="done"
          autocomplete="off"
          @keydown.enter.prevent="submitSched"
        />
        <button id="calAddBtn" type="button" @click="submitSched">添加</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { formatTodayKey } from "@mnk/shared";
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";

const nav = useNavigationStore();
const study = useStudyStore();

const draftSched = ref("");

interface DayCell {
  key: string;
  d: number;
  other: boolean;
  weekend: boolean;
  isToday: boolean;
  isSel: boolean;
  hasSched: boolean;
  hasCheck: boolean;
}

function makeDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const ymLabel = computed(() => {
  const { y, m } = study.state.calYM;
  return `${y}.${String(m).padStart(2, "0")}`;
});

const isThisMonth = computed(() => {
  const now = new Date();
  return (
    now.getFullYear() === study.state.calYM.y &&
    now.getMonth() + 1 === study.state.calYM.m
  );
});

const dayCells = computed<DayCell[]>(() => {
  const { y, m } = study.state.calYM;
  const todayKey = formatTodayKey();
  const selKey = study.calSelKey;

  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const prevDays = new Date(prevY, prevM, 0).getDate();

  const build = (cy: number, cm: number, cd: number, other: boolean): DayCell => {
    const key = makeDateKey(cy, cm, cd);
    const wd = new Date(cy, cm - 1, cd).getDay();
    return {
      key,
      d: cd,
      other,
      weekend: wd === 0 || wd === 6,
      isToday: key === todayKey,
      isSel: key === selKey,
      hasSched: Boolean(study.state.sched[key]?.length),
      hasCheck: Boolean(study.state.checkin[key]?.length),
    };
  };

  const out: DayCell[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    out.push(build(prevY, prevM, prevDays - i, true));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    out.push(build(y, m, d, false));
  }
  const total = firstWeekday + daysInMonth;
  const rest = (7 - (total % 7)) % 7;
  for (let k = 1; k <= rest; k++) {
    out.push(build(nextY, nextM, k, true));
  }
  return out;
});

const selectedSchedules = computed(() => {
  if (!study.calSelKey) return [];
  return study.state.sched[study.calSelKey] || [];
});

const selectedCheckinCount = computed(() => {
  if (!study.calSelKey) return 0;
  return study.state.checkin[study.calSelKey]?.length || 0;
});

const selectedDateHeading = computed(() => {
  if (!study.calSelKey) return "";
  const [y, m, d] = study.calSelKey.split("-").map(Number);
  const wk = ["日", "一", "二", "三", "四", "五", "六"][new Date(y, m - 1, d).getDay()];
  return `${m} 月 ${d} 日 · 周${wk}`;
});

async function submitSched() {
  const ok = await study.addScheduleItem(draftSched.value);
  if (ok) {
    draftSched.value = "";
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (nav.activeModal !== "calendar") return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
    return;
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    void study.moveCalendarSelection(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    void study.moveCalendarSelection(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    void study.moveCalendarSelection(-7);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    void study.moveCalendarSelection(7);
  } else if (e.key === "Escape") {
    e.preventDefault();
    nav.closeModal();
  }
}

onMounted(() => {
  document.addEventListener("keydown", onDocKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onDocKeydown);
});
</script>

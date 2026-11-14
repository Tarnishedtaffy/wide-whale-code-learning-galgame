<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";
import { useStudyStore } from "@/stores/study";

const nav = useNavigationStore();
const study = useStudyStore();

const SAKURA_TILT = 58;
const SAKURA_STEP = 86;
const SAKURA_SWAY = 26;
const SAKURA_BACK = 7;
const SAKURA_FWD = 16;
const LEVEL_STAGES = ["初遇", "相识", "心动", "热恋", "永远"] as const;

const GARDEN_BIG = [
  { s: ASSETS.garden.gazebo, w: 112, h: 133 },
  { s: ASSETS.garden.swing, w: 106, h: 114 },
  { s: ASSETS.garden.fountain, w: 100, h: 110 },
  { s: ASSETS.garden.arch, w: 96, h: 122 },
  { s: ASSETS.garden.bench, w: 104, h: 116 },
  { s: ASSETS.garden.cottage, w: 116, h: 111 },
];
const GARDEN_MID = [
  { s: ASSETS.garden.lamp, w: 42, h: 73 },
  { s: ASSETS.garden.cart, w: 62, h: 54 },
  { s: ASSETS.garden.birdbath, w: 46, h: 66 },
  { s: ASSETS.garden.sign, w: 44, h: 69 },
  { s: ASSETS.garden.bench, w: 70, h: 78 },
  { s: ASSETS.garden.fountain, w: 60, h: 66 },
  { s: ASSETS.garden.cottage, w: 64, h: 61 },
];
const GARDEN_SMALL = [
  { s: ASSETS.garden.lamp, w: 52, h: 90 },
  { s: ASSETS.garden.cart, w: 76, h: 67 },
  { s: ASSETS.garden.birdbath, w: 56, h: 81 },
  { s: ASSETS.garden.sign, w: 54, h: 84 },
];

function sakuraPos(lv: number) {
  const i = lv - 1;
  return { x: Math.sin(i * 0.55) * SAKURA_SWAY, y: -i * SAKURA_STEP };
}

function sakuraRand(n: number) {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

function buildGardenSpec(seed: number, kind: "big" | "mid" | "small", side: number) {
  const list = kind === "big" ? GARDEN_BIG : kind === "mid" ? GARDEN_MID : GARDEN_SMALL;
  let idx = Math.floor(seed * list.length * 0.999) % list.length;
  if (side > 0) idx = (idx + Math.ceil(list.length / 2)) % list.length;
  const it = list[idx];
  const k = 0.92 + seed * 0.2;
  const w = Math.round(it.w * k);
  const h = Math.round(it.h * k);
  return { src: it.s, w, h };
}

const stageRef = ref<HTMLDivElement | null>(null);
const petalsRef = ref<HTMLDivElement | null>(null);
const grabbing = ref(false);
const animateWorld = ref(false);
const stageParallaxStyle = ref("");

const activePage = computed(() => nav.currentPage === "levels");

const camFloat = computed(() =>
  Math.min(Math.max(Number(study.mapCam) || 1, 1), study.totalLevels)
);

const camLevel = computed(() =>
  Math.min(Math.max(Math.round(camFloat.value) || 1, 1), study.totalLevels)
);

const visibleRange = computed(() => ({
  start: Math.max(1, camLevel.value - SAKURA_BACK),
  end: Math.min(study.totalLevels, camLevel.value + SAKURA_FWD),
}));

const visibleTiles = computed(() => {
  const { start, end } = visibleRange.value;
  const list = [];
  for (let lv = start; lv <= end; lv++) {
    const p = sakuraPos(lv);
    const cleared = Boolean(study.state.cleared[String(lv)]);
    const unlocked = study.isLevelUnlocked(lv) || cleared;
    list.push({
      lv,
      label: lv > 99 ? String(lv) : lv < 10 ? `0${lv}` : String(lv),
      cls: [
        "sakura-tile",
        cleared ? "done" : unlocked ? "unlock" : "lock",
        lv === study.state.currentLevel ? "cur" : "",
      ]
        .filter(Boolean)
        .join(" "),
      style: {
        transform: `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`,
      },
      locked: !unlocked,
    });
  }
  return list;
});

interface GardenNode {
  key: string;
  kind: "big" | "mid" | "small";
  src: string;
  style: Record<string, string>;
}

const gardenNodes = computed<GardenNode[]>(() => {
  const { start, end } = visibleRange.value;
  const out: GardenNode[] = [];

  for (let tv = start; tv <= end; tv++) {
    if (tv % 5 !== 2) continue;
    const tp = sakuraPos(tv);
    for (const side of [-1, 1]) {
      const s1 = sakuraRand(tv * 13 + (side > 0 ? 7 : 3));
      const s2 = sakuraRand(tv * 29 + (side > 0 ? 11 : 5));
      const big = buildGardenSpec(s1, "big", side);
      const bx = side * (126 + s1 * 16);
      const by = (s2 - 0.5) * 16;
      out.push({
        key: `big-${tv}-${side}`,
        kind: "big",
        src: big.src,
        style: {
          width: `${big.w}px`,
          height: `${big.h}px`,
          marginLeft: `${-big.w / 2}px`,
          marginTop: `${-big.h}px`,
          transform: `translate3d(${(tp.x + bx).toFixed(1)}px,${(tp.y + by).toFixed(1)}px,0) rotateX(-${SAKURA_TILT}deg)`,
        },
      });

      const sm = buildGardenSpec(s2, "small", side);
      const sx = side * (76 + s1 * 14);
      const sy = 42 + s2 * 18;
      out.push({
        key: `sm-${tv}-${side}`,
        kind: "small",
        src: sm.src,
        style: {
          width: `${sm.w}px`,
          height: `${sm.h}px`,
          marginLeft: `${-sm.w / 2}px`,
          marginTop: `${-sm.h}px`,
          transform: `translate3d(${(tp.x + sx).toFixed(1)}px,${(tp.y + sy).toFixed(1)}px,-6px) rotateX(-${SAKURA_TILT}deg)`,
        },
      });
    }
  }

  for (let mv = start; mv <= end; mv++) {
    if (mv % 5 !== 4) continue;
    const mp = sakuraPos(mv + 0.5);
    for (const side of [-1, 1]) {
      const sm2 = sakuraRand(mv * 31 + (side > 0 ? 17 : 9));
      const mid = buildGardenSpec(sm2, "mid", side);
      const mx = side * (102 + sm2 * 24);
      const my = (sm2 - 0.5) * 16;
      out.push({
        key: `mid-${mv}-${side}`,
        kind: "mid",
        src: mid.src,
        style: {
          width: `${mid.w}px`,
          height: `${mid.h}px`,
          marginLeft: `${-mid.w / 2}px`,
          marginTop: `${-mid.h}px`,
          transform: `translate3d(${(mp.x + mx).toFixed(1)}px,${(mp.y + my).toFixed(1)}px,-10px) rotateX(-${SAKURA_TILT}deg)`,
        },
      });
    }
  }
  return out;
});

const playerStyle = computed(() => {
  const pp = sakuraPos(study.state.currentLevel);
  return {
    transform: `translate3d(${pp.x.toFixed(1)}px,${(pp.y - 4).toFixed(1)}px,12px) rotateX(-${SAKURA_TILT}deg)`,
  };
});

const worldStyle = computed(() => {
  const cp = sakuraPos(camFloat.value);
  const offsetY = -cp.y + 78;
  return {
    transition: animateWorld.value ? "transform .42s cubic-bezier(.25,1,.5,1)" : "none",
    transform: `rotateX(${SAKURA_TILT}deg) translate3d(0,${offsetY.toFixed(1)}px,0)`,
  };
});

const activeStageIndex = computed(() => {
  const seg = study.totalLevels / LEVEL_STAGES.length;
  return Math.min(
    LEVEL_STAGES.length - 1,
    Math.floor((study.state.currentLevel - 1) / Math.max(0.1, seg))
  );
});

// ---- Pointer Drag & Wheel ----
let dragState: { y: number; cam: number; moved: boolean; id: number } | null = null;

function onPointerDown(e: PointerEvent) {
  if (e.button !== undefined && e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest("button")) return;
  dragState = { y: e.clientY, cam: camFloat.value, moved: false, id: e.pointerId };
  grabbing.value = true;
  animateWorld.value = false;
  try {
    stageRef.value?.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }
}

function onPointerMove(e: PointerEvent) {
  if (stageRef.value && e.pointerType === "mouse" && !dragState) {
    const r = stageRef.value.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    stageParallaxStyle.value = `rotateY(${(-x * 2.2).toFixed(2)}deg) rotateX(${(y * 1.6).toFixed(2)}deg)`;
  }
  if (!dragState || e.pointerId !== dragState.id) return;
  const dy = e.clientY - dragState.y;
  if (Math.abs(dy) > 5) dragState.moved = true;
  if (!dragState.moved) return;
  // Direct manipulation: dragging downward (dy > 0) shifts map downward (+offsetY -> higher cam),
  // dragging upward (dy < 0) shifts map upward (-offsetY -> lower cam).
  const next = Math.min(
    Math.max(dragState.cam + dy / SAKURA_STEP, 1),
    study.totalLevels
  );
  study.mapCam = next;
}

function onPointerUp(e: PointerEvent) {
  if (!dragState) return;
  const wasMoved = dragState.moved;
  const pid = dragState.id;
  grabbing.value = false;
  dragState = null;
  try {
    stageRef.value?.releasePointerCapture(pid);
  } catch {
    // ignore
  }
  if (wasMoved) {
    animateWorld.value = true;
    study.mapCam = Math.round(camFloat.value);
    return;
  }

  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const tileEl = hit?.closest(".sakura-tile") as HTMLElement | null;
  if (!tileEl) return;
  const lv = Number.parseInt(tileEl.dataset.level || "0", 10);
  if (!lv) return;
  if (tileEl.classList.contains("lock")) {
    nav.toast(`先通过第 ${lv - 1} 关解锁`);
    return;
  }
  void study.startLevel(lv);
}

function onPointerCancel() {
  grabbing.value = false;
  dragState = null;
  animateWorld.value = true;
  study.mapCam = Math.round(camFloat.value);
}

function onWheel(e: WheelEvent) {
  const dir = e.deltaY < 0 ? 1 : -1;
  const next = Math.min(Math.max(camLevel.value + dir, 1), study.totalLevels);
  if (next !== study.mapCam) {
    animateWorld.value = true;
    study.mapCam = next;
  }
}

function recenterToCurrent() {
  animateWorld.value = true;
  study.mapCam = study.state.currentLevel;
}

// ---- 3D Falling Sakura Petals (Foreground-only RAF) ----
interface PetalItem {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  vy: number;
  vx: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  ph: number;
}
let petals: PetalItem[] = [];
let rafId = 0;

function tickPetals() {
  const layer = petalsRef.value;
  if (!activePage.value || document.hidden || !layer || !layer.isConnected) {
    rafId = 0;
    return;
  }
  const W = layer.clientWidth || 390;
  const H = layer.clientHeight || 700;
  for (const p of petals) {
    p.y += p.vy;
    p.x += Math.sin(p.ph + p.y * 0.02) * 0.55 + p.vx;
    p.rx += p.sx;
    p.ry += p.sy;
    p.rz += p.sz;
    if (p.y > H + 60 || p.x < -80 || p.x > W + 80) {
      p.y = -40 - Math.random() * 120;
      p.x = Math.random() * W;
      p.z = (Math.random() - 0.5) * 160;
      p.vy = 0.35 + Math.random() * 1.1;
    }
    p.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,${p.z.toFixed(1)}px) rotateX(${p.rx.toFixed(1)}deg) rotateY(${p.ry.toFixed(1)}deg) rotateZ(${p.rz.toFixed(1)}deg)`;
  }
  rafId = window.requestAnimationFrame(tickPetals);
}

function startPetalsIfVisible() {
  const layer = petalsRef.value;
  if (!layer || !activePage.value) return;
  if (!petals.length) {
    const count = Math.min(60, Math.max(28, Math.round((layer.clientWidth || 390) / 7)));
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "petal";
      const size = 8 + Math.random() * 10;
      p.style.width = `${size.toFixed(1)}px`;
      p.style.height = `${size.toFixed(1)}px`;
      layer.appendChild(p);
      petals.push({
        el: p,
        x: Math.random() * (layer.clientWidth || 390),
        y: Math.random() * (layer.clientHeight || 700),
        z: (Math.random() - 0.5) * 160,
        vy: 0.35 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * 0.9,
        rx: Math.random() * 360,
        ry: Math.random() * 360,
        rz: Math.random() * 360,
        sx: (Math.random() - 0.5) * 1.8,
        sy: (Math.random() - 0.5) * 1.8,
        sz: (Math.random() - 0.5) * 1.8,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }
  if (!rafId) {
    rafId = window.requestAnimationFrame(tickPetals);
  }
}

function onVisibilityChange() {
  if (!document.hidden && activePage.value) {
    startPetalsIfVisible();
  }
}

watch(activePage, (on) => {
  if (on) {
    window.setTimeout(startPetalsIfVisible, 30);
  } else if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
});

onMounted(() => {
  document.addEventListener("visibilitychange", onVisibilityChange);
  if (activePage.value) startPetalsIfVisible();
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (rafId) window.cancelAnimationFrame(rafId);
  petals = [];
});
</script>

<template>
  <section id="levels" class="page" :class="{ on: activePage }">
    <div class="bg-layer"></div>

    <div class="lv-topbar">
      <button
        id="levelsBack"
        class="lv-back"
        type="button"
        aria-label="返回首页"
        title="返回首页"
        @click="nav.go('home')"
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
      <div class="lv-chips">
        <button
          id="levelsRule"
          class="lv-chip"
          type="button"
          @click="nav.toast('点地图上的数字开始测试；通过上一关才能解锁下一关，答对 6 题即通关。')"
        >
          规则
        </button>
      </div>
    </div>

    <div class="lv-title">
      <p>
        第 <b id="lvCurNum">{{ study.state.currentLevel }}</b> 关 · 已通关
        <b id="lvDoneNum">{{ study.clearedCount }}</b> · 共
        <b id="lvTotalNum">{{ study.totalLevels }}</b> 关
      </p>
    </div>

    <div id="lvTrack" class="lv-track">
      <div
        v-for="(stageName, idx) in LEVEL_STAGES"
        :key="stageName"
        class="lv-stage"
        :class="{ done: idx < activeStageIndex, on: idx === activeStageIndex }"
      >
        <i></i><span>{{ stageName }}</span>
      </div>
    </div>

    <div id="mapArea" class="maparea">
      <div
        id="sakuraStage"
        ref="stageRef"
        class="sakura-stage"
        :class="{ grabbing }"
        :style="stageParallaxStyle ? { transform: stageParallaxStyle } : undefined"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @mouseleave="stageParallaxStyle = ''"
        @wheel.prevent="onWheel"
      >
        <div id="sakuraWorld" class="sakura-world" :style="worldStyle">
          <div
            v-for="tile in visibleTiles"
            :key="`tile-${tile.lv}`"
            :class="tile.cls"
            :style="tile.style"
            :data-level="tile.lv"
          >
            <span class="num">{{ tile.label }}</span>
          </div>

          <div
            v-for="node in gardenNodes"
            :key="node.key"
            :class="`garden-item ${node.kind}`"
            :style="node.style"
          >
            <img :src="node.src" alt="" />
          </div>

          <div class="sakura-player" :style="playerStyle">
            <img :src="ASSETS.sakuraPlayer" alt="" />
          </div>
        </div>

        <div id="sakuraPetals" ref="petalsRef" class="sakura-petals"></div>
        <div class="sakura-hint">上下拖动浏览<br />点数字开始</div>
        <button
          id="sakuraRecenter"
          class="sakura-recenter"
          :class="{ show: camLevel !== study.state.currentLevel }"
          type="button"
          @click="recenterToCurrent"
        >
          回到第 {{ study.state.currentLevel }} 关
        </button>
      </div>
    </div>

    <div class="lv-bottom">
      <button
        id="startLevelBtn"
        class="lv-go"
        type="button"
        @click="study.startLevel(study.state.currentLevel)"
      >
        <span class="go-inner">
          <strong>GO</strong>
          <small>第 {{ study.state.currentLevel }} 关</small>
        </span>
      </button>
    </div>
  </section>
</template>

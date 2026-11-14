<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { ASSETS } from "@/assets/manifest";
import { INTRO_SIGNATURE_SVG } from "@/assets/introSignatureSvg";
import { useNavigationStore } from "@/stores/navigation";

const nav = useNavigationStore();
const videoRef = ref<HTMLVideoElement | null>(null);
const svgHolderRef = ref<HTMLDivElement | null>(null);
const signWrapRef = ref<HTMLDivElement | null>(null);

const isPainting = ref(false);
const isFadingOut = ref(false);
const videoHidden = ref(false);

let finished = false;
let failed = false;
let revealed = false;
let videoBlobUrl: string | null = null;
let rafId: number | null = null;
let introGuard: number | null = null;
let showGuard: number | null = null;
let fadeTimer1: number | null = null;
let fadeTimer2: number | null = null;

function clearTimers() {
  for (const t of [introGuard, showGuard, fadeTimer1, fadeTimer2]) {
    if (t !== null) window.clearTimeout(t);
  }
  introGuard = showGuard = fadeTimer1 = fadeTimer2 = null;
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function revokeVideoBlobUrl() {
  if (videoBlobUrl) {
    try {
      URL.revokeObjectURL(videoBlobUrl);
    } catch {
      // ignore
    }
    videoBlobUrl = null;
  }
}

function revealWelcomeBeneath() {
  if (typeof document !== "undefined") {
    const de = document.documentElement;
    de.classList.remove("mnk-first-run");
    de.classList.add("mnk-intro-seen");
  }
}

function handleSkip() {
  clearTimers();
  if (videoRef.value) {
    try {
      videoRef.value.pause();
      videoRef.value.removeAttribute("src");
      videoRef.value.load();
    } catch {
      // ignore
    }
  }
  revokeVideoBlobUrl();
  nav.completeIntro();
}

function finishPlayback() {
  if (finished || failed || nav.introDone) return;
  finished = true;
  clearTimers();
  const v = videoRef.value;
  if (v) {
    try {
      v.loop = false;
      v.pause();
      if (!v.ended && Number.isFinite(v.duration) && v.duration > 0) {
        v.currentTime = Math.max(0, v.duration - 0.005);
      }
    } catch {
      // ignore
    }
  }
  revealWelcomeBeneath();
  isFadingOut.value = true;
  fadeTimer2 = window.setTimeout(() => {
    handleSkip();
  }, 1400);
}

function runSvgFallback() {
  const holder = svgHolderRef.value;
  const wrap = signWrapRef.value;
  if (!holder || !wrap) {
    window.setTimeout(handleSkip, 200);
    return;
  }
  holder.innerHTML = INTRO_SIGNATURE_SVG;
  const srcSvg = holder.querySelector("svg");
  if (!srcSvg) {
    window.setTimeout(handleSkip, 300);
    return;
  }
  const rawPaths = Array.from(srcSvg.querySelectorAll("path"));
  const groups: Array<{ main: string | null; shadow: string | null }> = [];
  for (const p of rawPaths) {
    const isShadow = (p.getAttribute("fill") || "").toLowerCase() === "black";
    if (isShadow) {
      if (groups.length) groups[groups.length - 1].shadow = p.getAttribute("d");
    } else {
      groups.push({ main: p.getAttribute("d"), shadow: null });
    }
  }
  if (!groups.length) {
    window.setTimeout(handleSkip, 300);
    return;
  }

  const TOTAL = 8190;
  const STEP = TOTAL / groups.length;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", srcSvg.getAttribute("viewBox") || "0 0 327 283");
  svg.setAttribute("fill", "none");

  const defs = document.createElementNS(NS, "defs");
  const grad = document.createElementNS(NS, "linearGradient");
  grad.setAttribute("id", "sigGrad");
  grad.setAttribute("gradientUnits", "userSpaceOnUse");
  grad.setAttribute("x1", "20");
  grad.setAttribute("y1", "10");
  grad.setAttribute("x2", "300");
  grad.setAttribute("y2", "270");
  const stops: Array<[string, string]> = [
    ["0", "#2e7f78"],
    ["0.45", "#5f9a3c"],
    ["1", "#c4503a"],
  ];
  for (const [offset, color] of stops) {
    const stop = document.createElementNS(NS, "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("stop-color", color);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  groups.forEach((g, i) => {
    const delay = (i * STEP) / 1000;
    const dur = STEP / 1000;
    if (g.shadow) {
      const sp = document.createElementNS(NS, "path");
      sp.setAttribute("d", g.shadow);
      sp.setAttribute("class", "sig-shadow");
      sp.style.setProperty("--delay", `${delay}s`);
      sp.style.setProperty("--dur", `${dur}s`);
      svg.appendChild(sp);
    }
    if (g.main) {
      const mp = document.createElementNS(NS, "path");
      mp.setAttribute("d", g.main);
      mp.setAttribute("class", "sig-fill");
      mp.style.setProperty("--delay", `${delay}s`);
      mp.style.setProperty("--dur", `${dur}s`);
      svg.appendChild(mp);
    }
  });
  wrap.appendChild(svg);

  fadeTimer1 = window.setTimeout(() => {
    revealWelcomeBeneath();
    isFadingOut.value = true;
    fadeTimer2 = window.setTimeout(handleSkip, 1400);
  }, TOTAL + 1000);
}

function triggerFallback() {
  if (failed || finished || nav.introDone) return;
  failed = true;
  clearTimers();
  revokeVideoBlobUrl();
  videoHidden.value = true;
  isPainting.value = false;
  if (videoRef.value) {
    videoRef.value.style.display = "none";
  }
  runSvgFallback();
}

function showFrame() {
  if (revealed) return;
  revealed = true;
  if (showGuard !== null) {
    window.clearTimeout(showGuard);
    showGuard = null;
  }
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (finished || failed || nav.introDone) return;
  isPainting.value = true;
}

function pollFrameReveal() {
  if (revealed || finished || failed || nav.introDone) {
    rafId = null;
    return;
  }
  const v = videoRef.value;
  if (v && v.currentTime >= 0.1) {
    showFrame();
    return;
  }
  rafId = window.requestAnimationFrame(pollFrameReveal);
}

function onTimeUpdate() {
  const v = videoRef.value;
  if (!v) return;
  if (!revealed && v.currentTime >= 0.1) {
    showFrame();
  }
  if (v.duration && Number.isFinite(v.duration) && v.duration - v.currentTime <= 0.05) {
    finishPlayback();
  }
}

function onPlaying() {
  if (introGuard !== null) {
    window.clearTimeout(introGuard);
    introGuard = null;
  }
  const v = videoRef.value;
  if (v && v.readyState >= 2 && v.videoWidth === 0) {
    triggerFallback();
    return;
  }
  if (!revealed && rafId === null) {
    rafId = window.requestAnimationFrame(pollFrameReveal);
  }
}

async function resolvePlayableVideoUrl(src: string): Promise<string> {
  // Pre-fetch into an in-memory Blob URL so Windows WebView2 & Android WebView
  // never require HTTP 206 Partial Content Range headers from Tauri custom scheme.
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > 0) {
      const blob = new Blob([buf], { type: "video/mp4" });
      videoBlobUrl = URL.createObjectURL(blob);
      return videoBlobUrl;
    }
  } catch {
    // Fallback to direct URL if fetch fails
  }
  return src;
}

onMounted(async () => {
  const v = videoRef.value;
  if (!v) {
    handleSkip();
    return;
  }
  // Explicitly override `#intro .intro-vid { display: none }` from legacy-core.css
  // (Vue `v-show="true"` leaves inline `display` empty, which kept the video hidden!).
  videoHidden.value = false;
  v.style.display = "block";
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute("muted", "");
  v.playsInline = true;
  v.loop = false;

  introGuard = window.setTimeout(() => {
    if (v.readyState < 2) triggerFallback();
  }, 8000);

  const playableUrl = await resolvePlayableVideoUrl(ASSETS.introVideo);
  if (nav.introDone || failed || finished) return;

  showGuard = window.setTimeout(() => {
    if (v.readyState >= 2 && v.videoWidth > 0 && !v.paused) {
      showFrame();
    }
  }, 1500);

  if (introGuard !== null) window.clearTimeout(introGuard);
  introGuard = window.setTimeout(() => {
    if (!revealed && (v.readyState < 2 || v.paused || v.videoWidth === 0)) {
      triggerFallback();
    }
  }, 3500);

  const startPlay = () => {
    if (nav.introDone || failed || finished) return;
    v.style.display = "block";
    v.muted = true;
    const p = v.play();
    if (p && p.catch) {
      p.catch(() => triggerFallback());
    }
  };

  v.src = playableUrl;
  if (v.readyState >= 3) {
    startPlay();
  } else {
    v.addEventListener("canplay", startPlay, { once: true });
    try {
      v.load();
    } catch {
      triggerFallback();
    }
  }
});

onBeforeUnmount(() => {
  clearTimers();
  revokeVideoBlobUrl();
});
</script>

<template>
  <div v-if="!nav.introDone" id="intro" :class="{ fadeout: isFadingOut }">
    <div class="bg"></div>
    <video
      id="introVideo"
      ref="videoRef"
      class="intro-vid"
      :class="{ painting: isPainting }"
      :style="{ display: videoHidden ? 'none' : 'block' }"
      muted
      playsinline
      webkit-playsinline
      preload="auto"
      disablepictureinpicture
      aria-label="天禧学习手账开场动画"
      @timeupdate="onTimeUpdate"
      @playing="onPlaying"
      @ended="finishPlayback"
      @error="triggerFallback"
    >
      已加载开场动画
    </video>
    <div class="veil"></div>
    <button
      id="introSkip"
      class="intro-skip"
      type="button"
      aria-label="跳过开场动画"
      @click="handleSkip"
    >
      跳过
    </button>
    <div ref="signWrapRef" class="sign-wrap">
      <div id="svgHolder" ref="svgHolderRef" style="display: none"></div>
    </div>
  </div>
</template>

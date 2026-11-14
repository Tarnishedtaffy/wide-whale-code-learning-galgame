<template>
  <div id="mnkL2DHost" ref="hostRef" aria-hidden="true"></div>
  <div
    id="mnkNpcBubble"
    class="npc-bubble"
    :class="{ show: bubbleVisible }"
    role="status"
    aria-live="polite"
  >
    {{ bubbleText }}
  </div>
  <img
    v-if="fallbackVisible"
    class="hgirl"
    :src="ASSETS.welcomeGirl"
    alt="Lune"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";

const nav = useNavigationStore();
const hostRef = ref<HTMLDivElement | null>(null);
const fallbackVisible = ref(false);
const bubbleText = ref("");
const bubbleVisible = ref(false);

const NPC_LINES = [
  "今天想学哪一章？点「开始学习」翻翻卡吧～",
  "翻完一章去「测试」闯一关，8 题对 6 题就过！",
  "做错的题会自动收进右侧「错题本」，随时重练。",
  "点左上角头像，可以打卡日历、看学习进度。",
  "点「聊天」能直接问我 Python 入门问题～",
  "右上角可以调音量、换字号和主页背景哦。",
  "列表可变用 []，元组不可变用 ()——还记得吗？",
  "for 适合遍历序列，while 记得让条件有机会变 False。",
  "def 定义函数，没写 return 默认返回 None 哦。",
  "累了就去音量里挑首曲子，休息一下再继续 🌸",
];

const BODY_ZOOM = 0.9;
const LBOX0 = { x0: 292.0, y0: 22.3, x1: 1649.5, y1: 3016.4 };
const HEAD_BOX = { x0: 300, y0: 30, x1: 1640, y1: 1900 };

let vendorPromise: Promise<void> | null = null;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-l2d="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.l2d = src;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function ensureLive2dVendors(): Promise<void> {
  if (!vendorPromise) {
    vendorPromise = (async () => {
      const w = window as unknown as Record<string, unknown>;
      if (!w.PIXI) {
        await loadScriptOnce("/live2d/vendor/pixi.min.js");
      }
      if (!w.Live2DCubismCore) {
        await loadScriptOnce("/live2d/vendor/live2dcubismcore.min.js");
      }
      const pixiAny = w.PIXI as { live2d?: unknown } | undefined;
      if (!pixiAny?.live2d) {
        await loadScriptOnce("/live2d/vendor/cubism4.min.js");
      }
    })();
  }
  return vendorPromise;
}

let bubbleHideTimer: number | null = null;
let lastLineIdx = -1;

function showNpcBubble() {
  let idx = Math.floor(Math.random() * NPC_LINES.length);
  if (NPC_LINES.length > 1 && idx === lastLineIdx) {
    idx = (idx + 1) % NPC_LINES.length;
  }
  lastLineIdx = idx;
  bubbleText.value = NPC_LINES[idx];
  bubbleVisible.value = true;
  if (bubbleHideTimer !== null) {
    window.clearTimeout(bubbleHideTimer);
  }
  bubbleHideTimer = window.setTimeout(() => {
    bubbleVisible.value = false;
    bubbleHideTimer = null;
  }, 3000);
}

// Instance cleanup handles
let cleanupFn: (() => void) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pixiApp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let liveModel: any = null;
let fitStageFn: (() => void) | null = null;

function syncPageActive(isHome: boolean) {
  if (!pixiApp?.ticker) return;
  if (isHome && !document.hidden) {
    pixiApp.ticker.start();
    if (fitStageFn) requestAnimationFrame(fitStageFn);
  } else {
    pixiApp.ticker.stop();
  }
}

watch(
  () => nav.currentPage,
  (p) => {
    syncPageActive(p === "home");
    if (p !== "home") {
      bubbleVisible.value = false;
    }
  }
);

onMounted(async () => {
  const host = hostRef.value;
  if (!host) return;

  try {
    await ensureLive2dVendors();
  } catch (err) {
    console.warn("[Live2D] 运行库加载失败，回退静态立绘:", err);
    fallbackVisible.value = true;
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PIXI = (window as any).PIXI;
  if (!PIXI?.live2d?.Live2DModel) {
    fallbackVisible.value = true;
    return;
  }

  let disposed = false;

  try {
    PIXI.utils?.skipHello?.();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const app = new PIXI.Application({
      width: host.clientWidth || 393,
      height: host.clientHeight || 852,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: dpr,
      powerPreference: "high-performance",
    });
    pixiApp = app;
    host.innerHTML = "";
    host.appendChild(app.view);

    const model = await PIXI.live2d.Live2DModel.from("/live2d/model/model.model3.json", {
      autoInteract: false,
      autoUpdate: true,
    });
    if (disposed) {
      model.destroy();
      app.destroy(true);
      return;
    }
    liveModel = model;
    app.stage.addChild(model);

    const fit = () => {
      if (!host || !pixiApp || !liveModel) return;
      const w = host.clientWidth || 393;
      const h = host.clientHeight || 852;
      if (w < 10 || h < 10) return;
      pixiApp.renderer.resize(w, h);

      const visW = LBOX0.x1 - LBOX0.x0;
      const visH = LBOX0.y1 - LBOX0.y0;
      const fitScale = Math.min((w * 0.96) / visW, (h * 0.9) / visH);
      const s = fitScale * BODY_ZOOM;
      liveModel.anchor?.set?.(0, 0);
      liveModel.pivot?.set?.(0, 0);
      liveModel.scale.set(s);
      liveModel.x = w * 0.5 - ((LBOX0.x0 + LBOX0.x1) * 0.5) * s;
      liveModel.y = h - LBOX0.y1 * s;
    };
    fitStageFn = fit;
    fit();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => fit());
      ro.observe(host);
    }
    const onWinResize = () => fit();
    window.addEventListener("resize", onWinResize, { passive: true });

    // Gaze tracking + alpha hit-testing + idle/nod/blink loop
    const im = model.internalModel;
    const core = im?.coreModel;

    const headScreenCenter = () => {
      const s = model.scale.x || 1;
      return {
        cx: model.x + (HEAD_BOX.x0 + HEAD_BOX.x1) * 0.5 * s,
        cy: model.y + (HEAD_BOX.y0 + HEAD_BOX.y1) * 0.38 * s,
        rx: Math.max(120, (HEAD_BOX.x1 - HEAD_BOX.x0) * s * 0.9),
        ry: Math.max(140, (HEAD_BOX.y1 - HEAD_BOX.y0) * s * 0.7),
      };
    };

    let lastPtrAt = 0;
    const focusAtClient = (clientX: number, clientY: number) => {
      if (nav.currentPage !== "home" || !im?.focusController) return;
      const rect = host.getBoundingClientRect();
      const lx = clientX - rect.left;
      const ly = clientY - rect.top;
      const hc = headScreenCenter();
      const nx = Math.max(-1, Math.min(1, (lx - hc.cx) / hc.rx));
      const ny = Math.max(-1, Math.min(1, -(ly - hc.cy) / hc.ry));
      im.focusController.focus(nx, ny, false);
      lastPtrAt = performance.now();
    };

    const onPointerMove = (e: PointerEvent) => {
      focusAtClient(e.clientX, e.clientY);
    };

    // Pixel alpha check at client coordinate so transparent background passes clicks cleanly
    const hitCharacterAt = (clientX: number, clientY: number): { hit: boolean; isHead: boolean } => {
      const rect = host.getBoundingClientRect();
      const lx = clientX - rect.left;
      const ly = clientY - rect.top;
      if (lx < 0 || ly < 0 || lx > rect.width || ly > rect.height) {
        return { hit: false, isHead: false };
      }
      const s = model.scale.x || 1;
      const mx = (lx - model.x) / s;
      const my = (ly - model.y) / s;
      if (mx < LBOX0.x0 || mx > LBOX0.x1 || my < LBOX0.y0 || my > LBOX0.y1) {
        return { hit: false, isHead: false };
      }
      const isHead =
        mx >= HEAD_BOX.x0 && mx <= HEAD_BOX.x1 && my >= HEAD_BOX.y0 && my <= HEAD_BOX.y1;

      try {
        const gl = app.renderer.gl as WebGLRenderingContext | undefined;
        if (gl) {
          app.renderer.render(app.stage);
          const res = app.renderer.resolution || 1;
          const px = Math.round(lx * res);
          const py = Math.round((rect.height - ly) * res);
          const pixel = new Uint8Array(4);
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          return { hit: pixel[3] > 20, isHead };
        }
      } catch {
        // Fallback to bounding box if readPixels is unavailable
      }
      return { hit: true, isHead };
    };

    let downPos: { x: number; y: number; t: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (nav.currentPage !== "home") return;
      focusAtClient(e.clientX, e.clientY);
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "button, a, .avbox, .lovebox, .drawer, .modal, .ml-layer, input, select, textarea"
        )
      ) {
        downPos = null;
        return;
      }
      downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    let nextNodAt = performance.now() + 5500 + Math.random() * 4500;
    let blinkState = 0; // 0 idle, 1 closing, 2 opening
    let blinkVal = 1;
    let nextBlinkAt = performance.now() + 2200 + Math.random() * 2800;

    const triggerReaction = (isHead: boolean) => {
      showNpcBubble();
      try {
        if (isHead) {
          model.motion?.("Tap", 1) || model.motion?.("Tap", 0);
        } else {
          model.motion?.("Tap", 0);
        }
      } catch {
        // ignore motion errors
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!downPos || nav.currentPage !== "home") return;
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      const dt = performance.now() - downPos.t;
      downPos = null;
      if (dx * dx + dy * dy > 196 || dt > 650) return;
      const { hit, isHead } = hitCharacterAt(e.clientX, e.clientY);
      if (hit) {
        triggerReaction(isHead);
      }
    };

    // Start base idle motion + subtle eye-blink & idle gaze drift
    try {
      model.motion?.("Idle", 0);
    } catch {
      // ignore
    }

    const onTick = () => {
      const now = performance.now();
      // Gently relax gaze back toward center after 3.5s without pointer movement
      if (im?.focusController && now - lastPtrAt > 3500) {
        const driftX = Math.sin(now * 0.0007) * 0.14;
        const driftY = Math.cos(now * 0.0005) * 0.08;
        im.focusController.focus(driftX, driftY, false);
      }
      // Periodic gentle nod/idle refresh
      if (now >= nextNodAt) {
        nextNodAt = now + 7500 + Math.random() * 6500;
        try {
          if (im?.motionManager?.isFinished?.()) {
            model.motion?.(Math.random() < 0.45 ? "Tap" : "Idle", Math.random() < 0.45 ? 1 : 0);
          }
        } catch {
          // ignore
        }
      }
      // Natural auto-blink on ParamEyeLOpen / ParamEyeROpen
      if (core?.setParameterValueById) {
        if (blinkState === 0 && now >= nextBlinkAt) {
          blinkState = 1;
        }
        if (blinkState === 1) {
          blinkVal = Math.max(0, blinkVal - 0.24);
          if (blinkVal <= 0.02) {
            blinkVal = 0;
            blinkState = 2;
          }
          core.setParameterValueById("ParamEyeLOpen", blinkVal);
          core.setParameterValueById("ParamEyeROpen", blinkVal);
        } else if (blinkState === 2) {
          blinkVal = Math.min(1, blinkVal + 0.18);
          core.setParameterValueById("ParamEyeLOpen", blinkVal);
          core.setParameterValueById("ParamEyeROpen", blinkVal);
          if (blinkVal >= 0.99) {
            blinkVal = 1;
            blinkState = 0;
            nextBlinkAt = now + (Math.random() < 0.18 ? 260 : 2600 + Math.random() * 3400);
          }
        }
      }
    };
    app.ticker.add(onTick);

    const onVisChange = () => syncPageActive(nav.currentPage === "home");
    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });

    syncPageActive(nav.currentPage === "home");

    cleanupFn = () => {
      disposed = true;
      ro?.disconnect();
      window.removeEventListener("resize", onWinResize);
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      try {
        app.ticker.remove(onTick);
        model.destroy();
        app.destroy(true);
      } catch {
        // ignore
      }
      liveModel = null;
      pixiApp = null;
      fitStageFn = null;
    };
  } catch (err) {
    console.warn("[Live2D] 模型初始化失败，回退静态立绘:", err);
    fallbackVisible.value = true;
  }
});

onBeforeUnmount(() => {
  if (bubbleHideTimer !== null) {
    window.clearTimeout(bubbleHideTimer);
    bubbleHideTimer = null;
  }
  cleanupFn?.();
  cleanupFn = null;
});
</script>

<style scoped>
#mnkL2DHost {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}
#mnkL2DHost :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none;
}
.npc-bubble {
  position: absolute;
  left: 50%;
  top: calc(13% + env(safe-area-inset-top, 0px));
  transform: translate(-50%, 6px) scale(0.96);
  z-index: 4;
  max-width: 74%;
  padding: 9px 14px;
  border-radius: 16px;
  background: rgba(255, 250, 252, 0.94);
  border: 2px solid #4a3548;
  box-shadow: 3px 4px 0 rgba(74, 53, 72, 0.2);
  color: #4a3548;
  font-size: calc(11.5px * var(--fs, 1));
  font-weight: 700;
  line-height: 1.55;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition:
    opacity 0.22s ease,
    transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.npc-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  margin-left: -6px;
  border-width: 8px 6px 0;
  border-style: solid;
  border-color: #4a3548 transparent transparent;
}
.npc-bubble.show {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
</style>

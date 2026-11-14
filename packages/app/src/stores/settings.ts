import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createDefaultSettings, type AiMode, type AppSettings } from "@mnk/shared";
import { ASSETS, SYSTEM_WALLPAPERS } from "@/assets/manifest";
import { backendClient } from "@/services/backendClient";
import { useNavigationStore } from "./navigation";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>(createDefaultSettings());

  let pushTimerId: number | null = null;
  let pushLastAt = 0;
  let pushCfgSig = "";

  const currentWallpaperSrc = computed(() => {
    const { key, customDataUrl } = settings.value.wallpaper;
    if (key.startsWith("upload") && customDataUrl) {
      return customDataUrl;
    }
    const hit = SYSTEM_WALLPAPERS.find((w) => w.id === key);
    return hit ? hit.src : ASSETS.homeDefaultBg;
  });

  function applyDomVariables() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--font-scale", `${settings.value.font}px`);
    root.style.setProperty("--fs", String(settings.value.font / 16));
    root.style.setProperty("--icon-size", `${settings.value.icon}px`);
    const bgSrc = currentWallpaperSrc.value;
    root.style.setProperty("--home-bg", bgSrc ? `url("${bgSrc}")` : "none");
    syncPushReminderTimer();
  }

  function syncPushReminderTimer() {
    if (typeof window === "undefined") return;
    const nextSig = settings.value.push
      ? `on|${Math.max(1, settings.value.pushMin)}`
      : "off";
    if (nextSig === pushCfgSig && (pushTimerId !== null || nextSig === "off")) {
      return;
    }
    if (pushTimerId !== null) {
      window.clearInterval(pushTimerId);
      pushTimerId = null;
    }
    pushCfgSig = nextSig;
    if (nextSig === "off") return;

    const periodMs = Math.max(1, settings.value.pushMin) * 60 * 1000;
    pushLastAt = Date.now();
    pushTimerId = window.setInterval(() => {
      if (Date.now() - pushLastAt < periodMs) return;
      pushLastAt = Date.now();
      const nav = useNavigationStore();
      if (nav.currentPage === "home") {
        nav.toast("该学习啦！休息一下再继续吧");
      }
    }, 15_000);
  }

  function hydrate(loaded: AppSettings) {
    const merged: AppSettings = {
      ...createDefaultSettings(),
      ...loaded,
      wallpaper: {
        ...createDefaultSettings().wallpaper,
        ...(loaded.wallpaper || {}),
      },
    };
    // Migrate legacy untouched `local` mode default to `proxy` mode without hardcoding private IPs
    let migrated = false;
    if (
      merged.aiMode === "local" &&
      /^http:\/\/127\.0\.0\.1:878[78]\b/.test(merged.aiProxyUrl || "")
    ) {
      merged.aiMode = "proxy";
      merged.aiProxyUrl = createDefaultSettings().aiProxyUrl;
      migrated = true;
    }
    settings.value = merged;
    applyDomVariables();
    if (migrated) {
      void persist();
    }
  }

  async function persist() {
    applyDomVariables();
    try {
      const saved = await backendClient.saveAppSettings(settings.value);
      settings.value = saved;
    } catch (err) {
      console.warn("[settings] 保存设置失败:", err);
    }
  }

  async function updateFont(font: number) {
    settings.value.font = Math.min(24, Math.max(12, Math.round(font)));
    await persist();
  }

  async function updateIconSize(icon: number) {
    settings.value.icon = Math.min(72, Math.max(36, Math.round(icon)));
    await persist();
  }

  async function updatePushReminder(push: boolean, pushMin?: number) {
    settings.value.push = push;
    if (pushMin !== undefined) {
      settings.value.pushMin = Math.min(180, Math.max(1, Math.round(pushMin) || 30));
    }
    await persist();
  }

  async function updateVolumes(partial: {
    masterVol?: number;
    bgmVol?: number;
    sfxVol?: number;
  }) {
    if (partial.masterVol !== undefined) {
      settings.value.masterVol = Math.min(100, Math.max(0, Math.round(partial.masterVol)));
    }
    if (partial.bgmVol !== undefined) {
      settings.value.bgmVol = Math.min(100, Math.max(0, Math.round(partial.bgmVol)));
    }
    if (partial.sfxVol !== undefined) {
      settings.value.sfxVol = Math.min(100, Math.max(0, Math.round(partial.sfxVol)));
    }
    await persist();
  }

  async function updateAiConfig(aiMode: AiMode, aiProxyUrl: string) {
    settings.value.aiMode = aiMode;
    settings.value.aiProxyUrl = aiProxyUrl.trim() || createDefaultSettings().aiProxyUrl;
    await persist();
  }

  async function selectSystemWallpaper(id: string) {
    settings.value.wallpaper.key = id;
    await persist();
  }

  async function uploadCustomWallpaper(file: File) {
    const nav = useNavigationStore();
    if (!/^image\//.test(file.type)) {
      nav.toast("请选择图片文件");
      return;
    }
    const dataUrl = await compressImageToDataUrl(file);
    if (!dataUrl) {
      nav.toast("图片读取失败，请换一张试试");
      return;
    }
    const key = `upload_${Date.now()}`;
    try {
      const saved = await backendClient.saveCustomWallpaper(key, dataUrl);
      settings.value = saved;
      applyDomVariables();
      nav.toast("已换上新背景");
    } catch {
      nav.toast("保存背景失败，请换一张较小的图片试试");
    }
  }

  async function resetWallpaper() {
    try {
      const saved = await backendClient.resetCustomWallpaper();
      settings.value = saved;
      applyDomVariables();
    } catch {
      settings.value.wallpaper.key = "home";
      applyDomVariables();
    }
  }

  return {
    settings,
    currentWallpaperSrc,
    hydrate,
    applyDomVariables,
    updateFont,
    updateIconSize,
    updatePushReminder,
    updateVolumes,
    updateAiConfig,
    selectSystemWallpaper,
    uploadCustomWallpaper,
    resetWallpaper,
  };
});

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1080;
        const maxH = 1920;
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("");
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = String(reader.result || "");
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

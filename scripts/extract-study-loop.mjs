import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const cliSrcIdx = process.argv.indexOf("--source");
const cliSrc = cliSrcIdx >= 0 ? process.argv[cliSrcIdx + 1] : "";

const SRC_HTML =
  cliSrc && fs.existsSync(cliSrc)
    ? path.resolve(cliSrc)
    : process.env.MNK_DEMO_HTML && fs.existsSync(process.env.MNK_DEMO_HTML)
      ? path.resolve(process.env.MNK_DEMO_HTML)
      : path.join(ROOT, "study-loop", "index.html");

const SRC_BGM_DIR = path.join(ROOT, "study-loop", "bgm");

const OUT_EXTRACTED_DIR = path.join(ROOT, "packages", "app", "public", "assets", "extracted");
const OUT_BGM_DIR = path.join(ROOT, "packages", "app", "public", "bgm");
const OUT_L2D_VENDOR_DIR = path.join(ROOT, "packages", "app", "public", "live2d", "vendor");
const OUT_L2D_MODEL_DIR = path.join(ROOT, "packages", "app", "public", "live2d", "model");
const OUT_STYLES_DIR = path.join(ROOT, "packages", "app", "src", "styles");
const OUT_ASSETS_TS_DIR = path.join(ROOT, "packages", "app", "src", "assets");
const OUT_GENERATED_JSON_DIR = path.join(OUT_ASSETS_TS_DIR, "generated");
const OUT_TAURI_RES_DIR = path.join(ROOT, "src-tauri", "resources");
const OUT_TAURI_ICONS_DIR = path.join(ROOT, "src-tauri", "icons");

for (const dir of [
  OUT_EXTRACTED_DIR,
  OUT_BGM_DIR,
  OUT_L2D_VENDOR_DIR,
  OUT_L2D_MODEL_DIR,
  OUT_STYLES_DIR,
  OUT_ASSETS_TS_DIR,
  OUT_GENERATED_JSON_DIR,
  OUT_TAURI_RES_DIR,
  OUT_TAURI_ICONS_DIR,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

function extFromMime(mime) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    default:
      throw new Error(`Unsupported MIME type: ${mime}`);
  }
}

console.log(`[extract] Reading source HTML: ${SRC_HTML}`);
const fullHtml = fs.readFileSync(SRC_HTML, "utf8");

// Separate Live2D / embedded BGM tail scripts so their internal data URIs don't shift ASSET_01..44
const pixiMarkerIdx = fullHtml.indexOf("pixi.js - v");
const pixiScriptStart = pixiMarkerIdx > 0 ? fullHtml.lastIndexOf("<script", pixiMarkerIdx) : -1;
const mainHtml = pixiScriptStart > 0 ? fullHtml.slice(0, pixiScriptStart) : fullHtml;

// 1. Deduplicate and write all inline Base64 binary assets in main HTML
let seq = 0;
const assetByB64 = new Map();
const assetsById = new Map();

const cleanedMainHtml = mainHtml.replace(
  /data:(image\/[a-zA-Z0-9+.-]+|video\/mp4);base64,([A-Za-z0-9+/=]+)/g,
  (_match, mime, b64) => {
    let entry = assetByB64.get(b64);
    if (!entry) {
      seq += 1;
      const num = String(seq).padStart(2, "0");
      const id = `ASSET_${num}`;
      const ext = extFromMime(mime);
      const fileName = `asset_${num}.${ext}`;
      const publicUrl = `/assets/extracted/${fileName}`;
      const buf = Buffer.from(b64, "base64");
      fs.writeFileSync(path.join(OUT_EXTRACTED_DIR, fileName), buf);
      entry = { id, num, mime, ext, fileName, publicUrl, bytes: buf.length, count: 1 };
      assetByB64.set(b64, entry);
      assetsById.set(id, entry);
    } else {
      entry.count += 1;
    }
    return entry.publicUrl;
  }
);

if (assetsById.size !== 44) {
  throw new Error(`Expected 44 unique inline assets in main HTML, got ${assetsById.size}`);
}

// Copy ASSET_08 (Lune avatar PNG) as icon source for tauri icon generation
const avatarEntry = assetsById.get("ASSET_08");
if (avatarEntry) {
  fs.copyFileSync(
    path.join(OUT_EXTRACTED_DIR, avatarEntry.fileName),
    path.join(OUT_TAURI_ICONS_DIR, "source-avatar.png")
  );
}

// 2. Extract <style> blocks (both primary <style> and <style id="mnk-mobile-css"> if present)
const mainStyleMatch = cleanedMainHtml.match(/<style>([\s\S]*?)<\/style>/);
if (!mainStyleMatch) {
  throw new Error("Failed to locate primary <style> block");
}
const mobileStyleMatch = fullHtml.match(/<style\s+id=["']mnk-mobile-css["']>([\s\S]*?)<\/style>/i);

const cssHeader = `/* Auto-extracted by scripts/extract-study-loop.mjs */\n`;
const combinedCss =
  cssHeader +
  mainStyleMatch[1].trim() +
  (mobileStyleMatch ? "\n\n/* ===== mnk-mobile-css ===== */\n" + mobileStyleMatch[1].trim() : "") +
  "\n";
fs.writeFileSync(path.join(OUT_STYLES_DIR, "legacy-core.css"), combinedCss, "utf8");

// 3. Extract RAW_SVG_DISABLED fallback signature SVG
const svgMatch = cleanedMainHtml.match(/var\s+RAW_SVG_DISABLED\s*=\s*`([\s\S]*?)`;/);
if (!svgMatch) {
  throw new Error("Failed to locate RAW_SVG_DISABLED");
}
const svgTs = `// Auto-extracted by scripts/extract-study-loop.mjs
export const INTRO_SIGNATURE_SVG = ${JSON.stringify(svgMatch[1])};
`;
fs.writeFileSync(path.join(OUT_ASSETS_TS_DIR, "introSignatureSvg.ts"), svgTs, "utf8");

// 4. Extract CARD_DATA and QUIZ_DATA from <script> blocks via node:vm
const scriptBlocks = [...cleanedMainHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const cardScript = scriptBlocks.find((s) => /\bvar\s+CARD_DATA\s*=/.test(s));
const quizScript = scriptBlocks.find((s) => /\bvar\s+QUIZ_DATA\s*=/.test(s));

if (!cardScript || !quizScript) {
  throw new Error("Failed to locate CARD_DATA or QUIZ_DATA <script> blocks");
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(cardScript, sandbox);
vm.runInContext(quizScript, sandbox);

const cardData = sandbox.CARD_DATA;
const quizData = sandbox.QUIZ_DATA;

if (!Array.isArray(cardData) || cardData.length !== 12) {
  throw new Error(`Expected 12 chapters in CARD_DATA, got ${Array.isArray(cardData) ? cardData.length : "non-array"}`);
}
const totalCards = cardData.reduce((acc, ch) => acc + (Array.isArray(ch.cards) ? ch.cards.length : 0), 0);
if (totalCards !== 95) {
  throw new Error(`Expected 95 total cards in CARD_DATA, got ${totalCards}`);
}
if (!Array.isArray(quizData) || quizData.length !== 160) {
  throw new Error(`Expected 160 questions in QUIZ_DATA, got ${Array.isArray(quizData) ? quizData.length : "non-array"}`);
}

const cardJson = JSON.stringify(cardData, null, 2) + "\n";
const quizJson = JSON.stringify(quizData, null, 2) + "\n";

fs.writeFileSync(path.join(OUT_TAURI_RES_DIR, "card_bank.json"), cardJson, "utf8");
fs.writeFileSync(path.join(OUT_TAURI_RES_DIR, "quiz_bank.json"), quizJson, "utf8");
fs.writeFileSync(path.join(OUT_GENERATED_JSON_DIR, "card_bank.json"), cardJson, "utf8");
fs.writeFileSync(path.join(OUT_GENERATED_JSON_DIR, "quiz_bank.json"), quizJson, "utf8");

// 5. Generate semantic asset manifest TypeScript module
const u = (id) => assetsById.get(id).publicUrl;

const manifestTs = `// Auto-generated by scripts/extract-study-loop.mjs — DO NOT EDIT MANUALLY
export const ASSETS = {
  introBg: "${u("ASSET_01")}",
  cardsMenuBg: "${u("ASSET_02")}",
  cardMarbleBg: "${u("ASSET_03")}",
  commonPaperBg: "${u("ASSET_04")}",
  homeDefaultBg: "${u("ASSET_05")}",
  voiceCallBg: "${u("ASSET_06")}",
  welcomeGirl: "${u("ASSET_07")}",
  avatarLune: "${u("ASSET_08")}",
  homeIcons: {
    volume: "${u("ASSET_09")}",
    settings: "${u("ASSET_10")}",
    gallery: "${u("ASSET_11")}",
    wrongBook: "${u("ASSET_12")}",
  },
  homeActions: {
    chat: "${u("ASSET_13")}",
    study: "${u("ASSET_14")}",
    test: "${u("ASSET_15")}",
  },
  quizGirlFallback: "${u("ASSET_16")}",
  cardsMenuDeco: "${u("ASSET_17")}",
  iconClose: "${u("ASSET_18")}",
  voiceCallAvatar: "${u("ASSET_19")}",
  drawerIcons: {
    calendar: "${u("ASSET_20")}",
    progress: "${u("ASSET_21")}",
    favorites: "${u("ASSET_22")}",
  },
  menuSun: "${u("ASSET_23")}",
  cardGirls: [
    "${u("ASSET_24")}",
    "${u("ASSET_25")}",
    "${u("ASSET_26")}",
    "${u("ASSET_27")}",
    "${u("ASSET_28")}",
    "${u("ASSET_29")}",
    "${u("ASSET_30")}",
  ] as const,
  garden: {
    gazebo: "${u("ASSET_31")}",
    swing: "${u("ASSET_32")}",
    fountain: "${u("ASSET_33")}",
    arch: "${u("ASSET_34")}",
    bench: "${u("ASSET_35")}",
    lamp: "${u("ASSET_36")}",
    cart: "${u("ASSET_37")}",
    birdbath: "${u("ASSET_38")}",
    sign: "${u("ASSET_39")}",
    cottage: "${u("ASSET_40")}",
  },
  sakuraPlayer: "${u("ASSET_41")}",
  introVideo: "${u("ASSET_42")}",
  gallerySpring: "${u("ASSET_43")}",
  galleryArch: "${u("ASSET_44")}",
} as const;

export interface SystemWallpaperItem {
  id: string;
  name: string;
  src: string;
}

export const SYSTEM_WALLPAPERS: readonly SystemWallpaperItem[] = [
  { id: "home", name: "樱色公园", src: ASSETS.homeDefaultBg },
  { id: "spring", name: "春日花园", src: ASSETS.gallerySpring },
  { id: "arch", name: "樱色拱门", src: ASSETS.galleryArch },
  { id: "marble", name: "粉雾大理石", src: ASSETS.cardMarbleBg },
  { id: "room", name: "黄昏小屋", src: ASSETS.introBg },
  { id: "rain", name: "雨后窗边", src: ASSETS.voiceCallBg },
] as const;
`;

fs.writeFileSync(path.join(OUT_ASSETS_TS_DIR, "manifest.ts"), manifestTs, "utf8");

// 6. Extract Live2D vendor libs & model files (if present in source HTML)
const allScripts = [...fullHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
let extractedL2dFiles = 0;

const pixiCode = allScripts.find((s) => s.includes("pixi.js - v"));
const cubismCoreCode = allScripts.find((s) => s.includes("Live2D Cubism Core"));
const cubism4Code = allScripts.find((s) => s.includes("Live2DModel") && s.includes("Cubism4InternalModel"));
const l2dPayloadCode = allScripts.find((s) => /window\.MNK_L2D_PAYLOAD\s*=/.test(s));

if (pixiCode && cubismCoreCode && cubism4Code && l2dPayloadCode) {
  fs.writeFileSync(path.join(OUT_L2D_VENDOR_DIR, "pixi.min.js"), pixiCode.trim() + "\n", "utf8");
  fs.writeFileSync(path.join(OUT_L2D_VENDOR_DIR, "live2dcubismcore.min.js"), cubismCoreCode.trim() + "\n", "utf8");
  fs.writeFileSync(path.join(OUT_L2D_VENDOR_DIR, "cubism4.min.js"), cubism4Code.trim() + "\n", "utf8");

  const l2dWin = {};
  new Function("window", l2dPayloadCode)(l2dWin);
  const payload = l2dWin.MNK_L2D_PAYLOAD;
  const gzSet = new Set((payload.__meta && payload.__meta.gz) || []);

  for (const [relPath, content] of Object.entries(payload.files)) {
    const outPath = path.join(OUT_L2D_MODEL_DIR, ...relPath.split("/"));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    if (relPath === "model.model3.json" && content && typeof content === "object") {
      const cloned = JSON.parse(JSON.stringify(content));
      if (cloned.FileReferences && Array.isArray(cloned.FileReferences.Textures)) {
        cloned.FileReferences.Textures = cloned.FileReferences.Textures.map((tex, idx) => {
          if (typeof tex === "string" && tex.startsWith("data:image/")) {
            const comma = tex.indexOf(",");
            const b64 = tex.slice(comma + 1);
            const texName = `texture_${String(idx).padStart(2, "0")}.png`;
            fs.writeFileSync(path.join(OUT_L2D_MODEL_DIR, texName), Buffer.from(b64, "base64"));
            extractedL2dFiles += 1;
            return texName;
          }
          return tex;
        });
      }
      fs.writeFileSync(outPath, JSON.stringify(cloned, null, 2) + "\n", "utf8");
      extractedL2dFiles += 1;
    } else if (content && typeof content === "object") {
      fs.writeFileSync(outPath, JSON.stringify(content, null, 2) + "\n", "utf8");
      extractedL2dFiles += 1;
    } else if (typeof content === "string") {
      const comma = content.indexOf(",");
      const b64 = content.startsWith("data:") && comma > 0 ? content.slice(comma + 1) : content;
      const rawBuf = Buffer.from(b64, "base64");
      const finalBuf = gzSet.has(relPath) ? zlib.gunzipSync(rawBuf) : rawBuf;
      fs.writeFileSync(outPath, finalBuf);
      extractedL2dFiles += 1;
    }
  }
}

// 7. Extract built-in BGMs (prefer embedded window.MNK_BGM full MP3s if present, fallback to study-loop/bgm)
let copiedBgms = 0;
const bgmCode = allScripts.find((s) => /window\.MNK_BGM\s*=/.test(s));
const BGM_FILE_MAP = {
  "builtin-qingsong": "轻松.mp3",
  "builtin-yuyue": "愉悦.mp3",
  "builtin-jiepai": "节拍.mp3",
  "builtin-mingxiang": "冥想.mp3",
};

if (bgmCode) {
  const bgmWin = {};
  new Function("window", bgmCode)(bgmWin);
  const bgmPayload = bgmWin.MNK_BGM || {};
  for (const [id, fileName] of Object.entries(BGM_FILE_MAP)) {
    if (typeof bgmPayload[id] === "string" && bgmPayload[id].length > 0) {
      const buf = Buffer.from(bgmPayload[id], "base64");
      fs.writeFileSync(path.join(OUT_BGM_DIR, fileName), buf);
      copiedBgms += 1;
    }
  }
} else if (fs.existsSync(SRC_BGM_DIR)) {
  for (const name of fs.readdirSync(SRC_BGM_DIR)) {
    if (name.toLowerCase().endsWith(".mp3")) {
      fs.copyFileSync(path.join(SRC_BGM_DIR, name), path.join(OUT_BGM_DIR, name));
      copiedBgms += 1;
    }
  }
}

console.log(
  `[extract] Done: ${assetsById.size} binary assets, ${cardData.length} chapters (${totalCards} cards), ${quizData.length} questions, ${extractedL2dFiles} Live2D model files, ${copiedBgms} BGM files.`
);

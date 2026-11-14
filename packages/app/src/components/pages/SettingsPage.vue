<template>
  <section id="settings" class="page" :class="{ on: nav.currentPage === 'settings' }">
    <div class="bg-layer"></div>
    <div class="set-top">
      <button id="setClose" type="button" class="set-close" @click="nav.go('home')">
        <img class="x-ico" :src="ASSETS.iconClose" alt="" />
      </button>
      <span class="set-title">设 置</span>
      <span style="width: 36px"></span>
    </div>

    <div class="set-body">
      <div class="set-group">
        <div class="set-label">字体大小</div>
        <div class="set-ctl">
          <span>A</span>
          <input
            id="fontRange"
            type="range"
            min="12"
            max="24"
            step="1"
            :value="settingsStore.settings.font"
            @input="onFontInput"
          />
          <span style="font-size: 20px">A</span>
          <span id="fontVal" class="set-val">{{ settingsStore.settings.font }}px</span>
        </div>
        <div
          id="fontPreview"
          class="set-preview"
          :style="{ fontSize: settingsStore.settings.font + 'px' }"
        >
          这是字体预览效果 Aa 中文
        </div>
      </div>

      <div class="set-group">
        <div class="set-label">图标大小</div>
        <div class="set-ctl">
          <span style="font-size: 11px">▣</span>
          <input
            id="iconRange"
            type="range"
            min="36"
            max="72"
            step="2"
            :value="settingsStore.settings.icon"
            @input="onIconInput"
          />
          <span style="font-size: 20px">▣</span>
          <span id="iconVal" class="set-val">{{ settingsStore.settings.icon }}px</span>
        </div>
      </div>

      <div class="set-group">
        <div class="set-label">主页学习提示</div>
        <div class="set-row">
          <span>仅打开本页时在主页弹提示</span>
          <label class="switch">
            <input
              id="pushSwitch"
              type="checkbox"
              :checked="settingsStore.settings.push"
              @change="onPushToggle"
            />
            <span class="slider"></span>
          </label>
        </div>
        <div
          v-show="settingsStore.settings.push"
          id="pushTimeRow"
          class="set-row"
          style="display: flex"
        >
          <span>提示间隔（分钟）</span>
          <input
            id="pushMin"
            type="number"
            min="1"
            max="180"
            :value="settingsStore.settings.pushMin"
            style="width: 70px"
            @change="onPushMinChange"
          />
        </div>
      </div>

      <div class="set-group">
        <div class="set-label">Lune 云端大模型</div>
        <div class="set-row">
          <span>启用云端大模型（离线自动回退本地答疑）</span>
          <label class="switch">
            <input
              type="checkbox"
              :checked="settingsStore.settings.aiMode === 'proxy'"
              @change="onAiModeToggle"
            />
            <span class="slider"></span>
          </label>
        </div>

        <div
          v-show="settingsStore.settings.aiMode === 'proxy'"
          style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px"
        >
          <div style="font-size: 12px; opacity: 0.8">服务地址（推荐填写本地或云端鉴权代理网关）</div>
          <input
            type="text"
            :value="aiConfig.baseURL"
            placeholder="http://127.0.0.1:8787 或 https://your-gateway.example.com"
            style="
              width: 100%;
              padding: 7px 10px;
              border-radius: 10px;
              border: 1.5px solid rgba(212, 116, 138, 0.35);
              background: rgba(255, 255, 255, 0.88);
              font-size: 12px;
              color: #4a3548;
            "
            @change="onBaseUrlChange"
          />

          <div style="font-size: 12px; opacity: 0.8">对话模型</div>
          <input
            type="text"
            :value="aiConfig.model"
            placeholder="gemini-3.8-flash-high"
            style="
              width: 100%;
              padding: 7px 10px;
              border-radius: 10px;
              border: 1.5px solid rgba(212, 116, 138, 0.35);
              background: rgba(255, 255, 255, 0.88);
              font-size: 12px;
              color: #4a3548;
            "
            @change="onModelChange"
          />

          <div style="display: flex; gap: 8px; margin-top: 4px">
            <button
              type="button"
              style="
                flex: 1;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1.5px solid #4a3548;
                background: #f9dce4;
                color: #4a3548;
                font-family: inherit;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
              "
              :disabled="testingAi"
              @click="runPingTest"
            >
              {{ testingAi ? "正在测试…" : "测试云端连接" }}
            </button>
            <button
              type="button"
              style="
                padding: 8px 12px;
                border-radius: 10px;
                border: 1.5px solid rgba(74, 53, 72, 0.45);
                background: rgba(255, 255, 255, 0.85);
                color: #4a3548;
                font-family: inherit;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
              "
              @click="onResetDefaultAi"
            >
              恢复默认
            </button>
          </div>
          <div
            v-if="testMsg"
            :style="{
              fontSize: '11.5px',
              lineHeight: '1.5',
              color: testErr ? '#c94a5a' : '#2e7d4f',
            }"
          >
            {{ testMsg }}
          </div>
        </div>
      </div>

      <div class="set-tip">设置会自动保存</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ASSETS } from "@/assets/manifest";
import {
  aiConfig,
  formatAiError,
  requestAiCompletion,
  resetAiConfig,
  saveAiConfig,
} from "@/services/aiClient";
import { useNavigationStore } from "@/stores/navigation";
import { useSettingsStore } from "@/stores/settings";

const nav = useNavigationStore();
const settingsStore = useSettingsStore();

const testingAi = ref(false);
const testMsg = ref("");
const testErr = ref(false);

function onFontInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  void settingsStore.updateFont(val);
}

function onIconInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  void settingsStore.updateIconSize(val);
}

function onPushToggle(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  void settingsStore.updatePushReminder(checked);
}

function onPushMinChange(e: Event) {
  const val = Number((e.target as HTMLInputElement).value) || 30;
  void settingsStore.updatePushReminder(settingsStore.settings.push, val);
}

function onAiModeToggle(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  void settingsStore.updateAiConfig(checked ? "proxy" : "local", aiConfig.baseURL);
}

async function onBaseUrlChange(e: Event) {
  const baseURL = (e.target as HTMLInputElement).value.trim();
  await saveAiConfig({ baseURL });
  void settingsStore.updateAiConfig(settingsStore.settings.aiMode, aiConfig.baseURL);
}

async function onModelChange(e: Event) {
  const model = (e.target as HTMLInputElement).value.trim();
  await saveAiConfig({ model });
}

async function onResetDefaultAi() {
  await resetAiConfig();
  await settingsStore.updateAiConfig("proxy", aiConfig.baseURL);
  testErr.value = false;
  testMsg.value = "已恢复内置云端网关配置";
}

async function runPingTest() {
  if (testingAi.value) return;
  testingAi.value = true;
  testErr.value = false;
  testMsg.value = "正在连接云端大模型…";
  try {
    const reply = await requestAiCompletion(
      [{ role: "user", content: "请用五个字以内打个招呼" }],
      { stream: false, maxTokens: 1024, timeoutMs: 20_000 }
    );
    testErr.value = false;
    testMsg.value = `连接成功：「${reply.slice(0, 36) || "已响应"}」`;
  } catch (err) {
    testErr.value = true;
    testMsg.value = `连接失败：${formatAiError(err)}`;
  } finally {
    testingAi.value = false;
  }
}
</script>

<template>
  <div
    id="aiCfgModal"
    class="modal ai-cfg-modal"
    :class="{ show: nav.activeModal === 'aiConfig' }"
    @click.self="nav.closeModal()"
  >
    <div class="ai-cfg-box">
      <div class="ai-cfg-head">
        <span class="ai-cfg-title">Lune 大模型对话设置</span>
        <button
          id="aiCfgClose"
          type="button"
          class="ai-cfg-close"
          aria-label="关闭设置"
          title="关闭"
          @click="nav.closeModal()"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 7l10 10M17 7L7 17"
              stroke="currentColor"
              stroke-width="2.3"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="ai-cfg-body">
        <label class="ai-cfg-switch-row">
          <span>启用云端大模型（关闭则使用离线答疑）</span>
          <input v-model="useCloud" type="checkbox" />
        </label>

        <div class="ai-cfg-field">
          <label>服务地址 Base URL（推荐指向鉴权代理网关）</label>
          <input
            v-model="draftCfg.baseURL"
            type="text"
            placeholder="http://127.0.0.1:8787 或 https://your-gateway.example.com"
          />
        </div>

        <div class="ai-cfg-field">
          <label>
            访问令牌 / API Key
            <span v-if="hasVaultKey" style="color: #2f855a; font-weight: 700">
              （已安全加密托管 · 留空保持不变）
            </span>
          </label>
          <div style="display: flex; gap: 6px">
            <input
              v-model="newKeyInput"
              type="password"
              autocomplete="off"
              style="flex: 1"
              :placeholder="
                hasVaultKey
                  ? '已托管于本地安全层，输入新令牌可覆盖替换'
                  : '输入网关访问令牌或受限子密钥'
              "
            />
            <button
              v-if="hasVaultKey"
              type="button"
              style="
                padding: 0 10px;
                border-radius: 10px;
                border: 1.5px solid rgba(212, 116, 138, 0.45);
                background: #fff5f7;
                color: #9b2c2c;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                white-space: nowrap;
              "
              @click="clearStoredKey"
            >
              清除密钥
            </button>
          </div>
        </div>

        <div class="ai-cfg-grid2">
          <div class="ai-cfg-field">
            <label>对话模型</label>
            <input
              v-model="draftCfg.model"
              type="text"
              placeholder="gemini-3.8-flash-high"
            />
          </div>
          <div class="ai-cfg-field">
            <label>温度 ({{ draftCfg.temperature.toFixed(1) }})</label>
            <input
              v-model.number="draftCfg.temperature"
              type="range"
              min="0"
              max="1.5"
              step="0.1"
            />
          </div>
        </div>

        <label class="ai-cfg-switch-row">
          <span>启用 SSE 流式输出（边想边回，支持实时渲染 MD）</span>
          <input v-model="draftCfg.stream" type="checkbox" />
        </label>

        <div class="ai-cfg-field">
          <label>助教人设 System Prompt</label>
          <textarea
            v-model="draftCfg.system"
            rows="3"
            placeholder="自定义 Lune 的回答风格…"
          ></textarea>
        </div>
      </div>

      <div class="ai-cfg-foot">
        <div class="ai-cfg-btns">
          <button type="button" :disabled="testing" @click="testConnection">
            {{ testing ? "测试中…" : "测试连接" }}
          </button>
          <button type="button" @click="restoreDefaults">恢复默认</button>
          <button type="button" class="primary" @click="saveAndClose">保存设置</button>
        </div>
        <div v-if="statusMsg" class="ai-cfg-msg" :class="{ err: statusErr }">
          {{ statusMsg }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { AI_KEY_MASK, createDefaultAiConfig, type AiRuntimeConfig } from "@mnk/shared";
import {
  aiConfig,
  formatAiError,
  hasStoredAiKey,
  requestAiCompletion,
  resetAiConfig,
  saveAiConfig,
} from "@/services/aiClient";
import { useNavigationStore } from "@/stores/navigation";
import { useSettingsStore } from "@/stores/settings";

const nav = useNavigationStore();
const settingsStore = useSettingsStore();

const draftCfg = reactive<AiRuntimeConfig>(createDefaultAiConfig());
const newKeyInput = ref("");
const hasVaultKey = ref(false);
const useCloud = ref(true);
const testing = ref(false);
const statusMsg = ref("");
const statusErr = ref(false);

function syncFromStore() {
  Object.assign(draftCfg, JSON.parse(JSON.stringify(aiConfig)));
  hasVaultKey.value = hasStoredAiKey(aiConfig);
  draftCfg.apiKey = "";
  newKeyInput.value = "";
}

function buildPayloadToSave(): AiRuntimeConfig {
  const trimmedNew = newKeyInput.value.trim();
  return {
    ...draftCfg,
    apiKey: trimmedNew ? trimmedNew : hasVaultKey.value ? AI_KEY_MASK : "",
  };
}

function clearStoredKey() {
  hasVaultKey.value = false;
  newKeyInput.value = "";
  draftCfg.apiKey = "";
  statusErr.value = false;
  statusMsg.value = "将在保存后清除本地托管密钥";
}

watch(
  () => nav.activeModal,
  (modal) => {
    if (modal === "aiConfig") {
      syncFromStore();
      useCloud.value = settingsStore.settings.aiMode !== "local";
      statusMsg.value = "";
      statusErr.value = false;
    }
  }
);

async function testConnection() {
  if (testing.value) return;
  testing.value = true;
  statusErr.value = false;
  statusMsg.value = "正在测试云端大模型连接…";
  try {
    await saveAiConfig(buildPayloadToSave());
    syncFromStore();
    await settingsStore.updateAiConfig("proxy", aiConfig.baseURL);
    useCloud.value = true;
    const reply = await requestAiCompletion(
      [{ role: "user", content: "请用一句话简短打个招呼" }],
      { stream: false, maxTokens: 1024, timeoutMs: 20_000 }
    );
    statusErr.value = false;
    statusMsg.value = `连接成功：「${reply.slice(0, 40) || "已响应"}」`;
  } catch (err) {
    statusErr.value = true;
    statusMsg.value = `连接失败：${formatAiError(err)}`;
  } finally {
    testing.value = false;
  }
}

async function restoreDefaults() {
  const fresh = await resetAiConfig();
  syncFromStore();
  useCloud.value = true;
  await settingsStore.updateAiConfig("proxy", fresh.baseURL);
  statusErr.value = false;
  statusMsg.value = "已恢复默认网关配置";
}

async function saveAndClose() {
  await saveAiConfig(buildPayloadToSave());
  await settingsStore.updateAiConfig(
    useCloud.value ? "proxy" : "local",
    aiConfig.baseURL
  );
  nav.closeModal();
  nav.toast("大模型设置已保存");
}
</script>

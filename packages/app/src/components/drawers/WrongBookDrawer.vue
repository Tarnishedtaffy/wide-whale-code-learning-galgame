<template>
  <aside
    id="wrongDrawer"
    class="wrong-drawer"
    :class="{ show: nav.activeDrawer === 'wrong' }"
  >
    <div class="fav-head">
      <span class="t">错 题 本</span>
      <button id="wrongClose" type="button" aria-label="关闭错题本" @click="nav.closeAllDrawers()">
        <img class="x-ico" :src="ASSETS.iconClose" alt="" />
      </button>
    </div>

    <div
      v-if="study.sortedWrongList.length > 0"
      id="wrongBar"
      class="wrong-bar"
      style="display: block"
    >
      <div class="wbar-row">
        <span class="wcount">共 {{ study.sortedWrongList.length }} 题</span>
        <button id="wrongClear" type="button" class="wclr" @click="confirmClear">
          清空
        </button>
      </div>
      <div class="wchips">
        <button
          v-for="s in SORTS"
          :key="s.k"
          type="button"
          class="wchip"
          :class="{ on: study.wrongSortMode === s.k }"
          @click="study.wrongSortMode = s.k"
        >
          {{ s.t }}
        </button>
      </div>
    </div>

    <div id="wrongBody" class="fav-body">
      <div v-if="study.sortedWrongList.length === 0" class="fav-empty">
        错题本是空的<br />答题时答错的题会自动收进来<br />连续答对
        {{ study.wrongMasterStreak }} 次才会移出
      </div>

      <template v-else>
        <div
          v-for="it in study.sortedWrongList"
          :key="it.__key"
          class="wrong-card"
          :data-wkey="it.__key"
        >
          <div class="wrong-top">
            <span class="wtg">{{ it.m || "" }} · {{ it.tag || "" }}</span>
            <span class="wlv">{{ it.level ? `第 ${it.level} 关` : "来源未知" }}</span>
          </div>
          <div class="wq">{{ it.q }}</div>

          <div v-if="it.opts && it.opts.length" class="wopts">
            <span
              v-for="(o, oi) in it.opts"
              :key="oi"
              :class="{
                right: o === it.ansText,
                mine: o !== it.ansText && o === it.chosen,
              }"
            >
              {{ String.fromCharCode(65 + oi) }}. {{ o }}
            </span>
          </div>

          <div v-if="it.chosen" class="wchosen">你选了：{{ it.chosen }}</div>

          <template v-if="it.type === 'code'">
            <span class="wans">参考答案</span>
            <pre class="wcode">{{
              it.refCode || it.expect || "（本题没有附带参考代码）"
            }}</pre>
            <div v-if="it.expect" class="wexp">预期输出：{{ it.expect }}</div>
          </template>
          <span v-else class="wans">正确答案：{{ it.ansText || "" }}</span>
          <div
            v-if="
              it.doc &&
              !it.doc.startsWith('Python 官方文档') &&
              !it.doc.startsWith('PEP ')
            "
            class="wdoc"
          >
            解析：{{ it.doc }}
          </div>

          <div class="wrong-row">
            <span class="pcount">
              已连对 {{ it.correct || 0 }} / {{ study.wrongMasterStreak }}
              <template v-if="(it.best || 0) > (it.correct || 0)">
                · 最好 {{ it.best }}
              </template>
            </span>
            <span class="dots">
              <i
                v-for="n in study.wrongMasterStreak"
                :key="n"
                :class="{ on: n <= (it.correct || 0) }"
              ></i>
            </span>
          </div>

          <div class="wrong-acts">
            <button
              type="button"
              class="wbtn redo"
              @click="study.startWrongPractice([it.__key])"
            >
              重做
            </button>
            <button
              type="button"
              class="wbtn transfer"
              @click="toggleTransferDrill(it)"
            >
              ✨ 举一反三
            </button>
            <button
              type="button"
              class="wbtn ask"
              @click="askWrongAi(it)"
            >
              💬 问 Lune
            </button>
            <button
              v-if="it.level"
              type="button"
              class="wbtn go"
              @click="goLevelFromWrong(it.level)"
            >
              第 {{ it.level }} 关
            </button>
            <button
              type="button"
              class="wbtn del"
              @click="study.deleteWrongItem(it.__key)"
            >
              删除
            </button>
          </div>

          <!-- Inline Interactive AI Transfer Variant Drill -->
          <div v-if="drills[it.__key]?.open" class="transfer-panel">
            <div class="tp-head">
              <span class="tp-badge">✨ 举一反三 · 同考点变式练</span>
              <button
                type="button"
                class="tp-close"
                @click="drills[it.__key].open = false"
              >
                收起
              </button>
            </div>

            <div v-if="drills[it.__key].loading" class="tp-loading">
              🌸 Lune 正在围绕「{{ it.tag }}」现场命制变式题…
            </div>

            <template v-else-if="drills[it.__key].data">
              <div class="tp-q">{{ drills[it.__key].data!.question }}</div>
              <div class="tp-opts">
                <button
                  v-for="(opt, oi) in drills[it.__key].data!.options"
                  :key="oi"
                  type="button"
                  class="tp-opt"
                  :disabled="drills[it.__key].pickedIdx !== null"
                  :class="{
                    'is-right':
                      drills[it.__key].pickedIdx !== null &&
                      oi === drills[it.__key].data!.answerIndex,
                    'is-wrong':
                      drills[it.__key].pickedIdx === oi &&
                      oi !== drills[it.__key].data!.answerIndex,
                  }"
                  @click="drills[it.__key].pickedIdx = oi"
                >
                  {{ String.fromCharCode(65 + oi) }}. {{ opt }}
                </button>
              </div>

              <div
                v-if="drills[it.__key].pickedIdx !== null"
                class="tp-feedback"
                :class="
                  drills[it.__key].pickedIdx === drills[it.__key].data!.answerIndex
                    ? 'ok'
                    : 'err'
                "
              >
                <div class="tp-verdict">
                  {{
                    drills[it.__key].pickedIdx === drills[it.__key].data!.answerIndex
                      ? "🎉 太棒啦，变式题一击即中！"
                      : `💡 正确答案是 ${String.fromCharCode(65 + drills[it.__key].data!.answerIndex)}`
                  }}
                </div>
                <div class="tp-exp">解析：{{ drills[it.__key].data!.explanation }}</div>
                <div class="tp-tip">防坑口诀：{{ drills[it.__key].data!.tip }}</div>
                <div class="tp-foot">
                  <button
                    type="button"
                    class="tp-next"
                    @click="reloadTransferDrill(it)"
                  >
                    ↻ 再换一道变式题
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import { ASSETS } from "@/assets/manifest";
import {
  buildWrongFollowupPrompt,
  generateWrongTransferDrill,
  type TransferDrill,
} from "@/services/aiStudyTutor";
import { useNavigationStore } from "@/stores/navigation";
import {
  useStudyStore,
  type KeyedWrongBookItem,
  type WrongSortMode,
} from "@/stores/study";
import { useSettingsStore } from "@/stores/settings";
import { useChatStore } from "@/stores/chat";

const nav = useNavigationStore();
const study = useStudyStore();
const settingsStore = useSettingsStore();
const chat = useChatStore();

interface DrillState {
  open: boolean;
  loading: boolean;
  data: TransferDrill | null;
  pickedIdx: number | null;
  seed: number;
}

const drills = reactive<Record<string, DrillState>>({});

const SORTS: Array<{ k: WrongSortMode; t: string }> = [
  { k: "recent", t: "最近答错" },
  { k: "created", t: "最近收录" },
  { k: "level", t: "按关卡" },
  { k: "tag", t: "按标签" },
];

function ensureDrillState(key: string): DrillState {
  if (!drills[key]) {
    drills[key] = {
      open: false,
      loading: false,
      data: null,
      pickedIdx: null,
      seed: 0,
    };
  }
  return drills[key];
}

async function fetchDrill(it: KeyedWrongBookItem) {
  const st = ensureDrillState(it.__key);
  st.loading = true;
  st.pickedIdx = null;
  st.seed += 1;
  try {
    st.data = await generateWrongTransferDrill(it, {
      mode: settingsStore.settings.aiMode,
      variantSeed: st.seed,
    });
  } finally {
    st.loading = false;
  }
}

function toggleTransferDrill(it: KeyedWrongBookItem) {
  const st = ensureDrillState(it.__key);
  if (st.open) {
    st.open = false;
    return;
  }
  st.open = true;
  if (!st.data && !st.loading) {
    void fetchDrill(it);
  }
}

function reloadTransferDrill(it: KeyedWrongBookItem) {
  const st = ensureDrillState(it.__key);
  st.open = true;
  if (!st.loading) {
    void fetchDrill(it);
  }
}

function askWrongAi(it: KeyedWrongBookItem) {
  const originPage = nav.currentPage === "chat" ? "home" : nav.currentPage;
  const { title, prompt } = buildWrongFollowupPrompt(it);
  void chat.askWithStudyContext({
    title,
    prompt,
    returnRoute: {
      page: originPage,
      drawer: "wrong",
      label: "返回错题本",
    },
  });
}

function goLevelFromWrong(level: number) {
  nav.closeAllDrawers();
  study.mapCam = level;
  nav.go("levels");
}

function confirmClear() {
  if (!study.sortedWrongList.length) {
    nav.toast("错题本已经是空的");
    return;
  }
  if (window.confirm("确定要清空整个错题本吗？此操作不可撤销。")) {
    void study.clearWrongBook();
  }
}
</script>

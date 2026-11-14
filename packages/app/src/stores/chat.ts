import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ChatMessage, ChatSession } from "@mnk/shared";
import { requestChatReply } from "@/services/aiClient";
import { useStudyStore } from "./study";
import { useSettingsStore } from "./settings";
import { useNavigationStore, type ChatReturnRoute } from "./navigation";

function memPad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function memNow(): { stamp: string; ts: number } {
  const d = new Date();
  return {
    stamp: `${d.getMonth() + 1}-${memPad(d.getDate())} ${memPad(d.getHours())}:${memPad(d.getMinutes())}`,
    ts: d.getTime(),
  };
}

export function memNormalize(t: string | undefined): string {
  return String(t || "").replace(/\s+/g, " ").trim();
}

export function seedChatSessions(): ChatSession[] {
  const day = 86_400_000;
  const now = Date.now();
  return [
    { id: "s_main", title: "主对话", stamp: "今天", ts: now, msgs: [] },
    {
      id: "s_list_tuple",
      title: "Python 里列表和元组有什么区别？",
      stamp: "11-05 20:14",
      ts: now - 2 * day,
      msgs: [
        { who: "me", text: "Python 里列表和元组有什么区别？" },
        {
          who: "bot",
          text: "列表 list 可变、用方括号；元组 tuple 不可变、用圆括号。元组更省内存，还能做字典的键。\n\n列表：[1, 2, 3]，可以 append / pop。\n元组：(1, 2, 3)，创建后不能改。",
        },
        { who: "me", text: "那什么时候该用元组？" },
        {
          who: "bot",
          text: "当这组数据本来就不应该被修改时用元组，比如坐标 (x, y)、函数返回多个值；需要当字典键或放进 set 时也只能用元组。\n\n其余需要频繁增删改的场景，用列表更顺手。",
        },
      ],
    },
    {
      id: "s_decorator",
      title: "装饰器到底怎么用？",
      stamp: "11-03 19:02",
      ts: now - 4 * day,
      msgs: [
        { who: "me", text: "装饰器到底怎么用？" },
        {
          who: "bot",
          text: "装饰器本质是“接收函数、返回新函数”的高阶函数，用来在不改原函数代码的前提下加功能。\n\n@log\ndef f(): ...\n等价于 f = log(f)",
        },
        { who: "me", text: "为什么需要 functools.wraps？" },
        {
          who: "bot",
          text: "不加 wraps 时，wrapper 会覆盖原函数的 __name__、__doc__ 等元信息；@functools.wraps(func) 会把它们复制回来，调试和文档工具才不会看错。",
        },
      ],
    },
    {
      id: "s_loop",
      title: "for 循环和 while 循环怎么选？",
      stamp: "11-01 18:36",
      ts: now - 6 * day,
      msgs: [
        { who: "me", text: "for 循环和 while 循环怎么选？" },
        {
          who: "bot",
          text: "遍历已知的序列（list、str、range、字典）用 for，不容易写错；只有“条件满足就一直做、不知道要循环几次”时才用 while。\n\nwhile 一定要让条件有机会变为 False，否则会死循环。",
        },
      ],
    },
  ];
}

export function displaySessionTitle(s: ChatSession): string {
  const firstUser = (s.msgs || []).find(
    (m) => m.who === "me" && !String(m.text || "").startsWith("［选择了")
  );
  if (firstUser && (!s.title || s.title === "主对话" || s.title === "新的对话")) {
    return memNormalize(firstUser.text).slice(0, 30);
  }
  return s.title || "新的对话";
}

export const useChatStore = defineStore("chat", () => {
  const chatBusy = ref(false);
  const streamingText = ref("");
  const detailTitle = ref("");
  const detailBlocks = ref<Array<{ stamp: string; msgs: ChatMessage[] }>>([]);

  const fallbackSeed = seedChatSessions();

  /**
   * Pure read-only accessor safe to call inside Vue `computed` during initial render
   * BEFORE `study.hydrate()` completes — never mutates state or triggers `persistState()`.
   */
  function peekSessions(): ChatSession[] {
    const study = useStudyStore();
    if (Array.isArray(study.state.chatSessions) && study.state.chatSessions.length > 0) {
      return study.state.chatSessions;
    }
    return fallbackSeed;
  }

  function ensureSessions(): ChatSession[] {
    const study = useStudyStore();
    if (!study.ready) {
      return peekSessions();
    }
    let changed = false;
    if (!Array.isArray(study.state.chatSessions) || study.state.chatSessions.length === 0) {
      study.state.chatSessions = seedChatSessions();
      changed = true;
    }
    const list = study.state.chatSessions!;
    if (!study.state.chatCurrent || !list.some((s) => s.id === study.state.chatCurrent)) {
      study.state.chatCurrent = list[0].id;
      changed = true;
    }
    if (changed) {
      void study.persistState();
    }
    return list;
  }

  const currentSession = computed<ChatSession>(() => {
    const list = peekSessions();
    const study = useStudyStore();
    return list.find((s) => s.id === study.state.chatCurrent) || list[0];
  });

  const recentQuestions = computed<string[]>(() => {
    const sessions = peekSessions()
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of sessions) {
      for (const m of s.msgs || []) {
        if (m.who !== "me") continue;
        const norm = memNormalize(m.text);
        if (!norm || norm.startsWith("［选择了") || seen.has(norm)) continue;
        seen.add(norm);
        out.push(norm);
        if (out.length >= 4) return out;
      }
    }
    return out;
  });

  const sortedSessions = computed<ChatSession[]>(() => {
    const study = useStudyStore();
    const curId = study.state.chatCurrent;
    return peekSessions()
      .slice()
      .sort((a, b) => {
        if (a.id === curId) return -1;
        if (b.id === curId) return 1;
        return (b.ts || 0) - (a.ts || 0);
      });
  });

  async function appendMessageToSession(sid: string, who: "me" | "bot", text: string) {
    const study = useStudyStore();
    const list = ensureSessions();
    const ses = list.find((s) => s.id === sid);
    if (!ses) return;
    const now = memNow();
    ses.msgs.push({ who, text, ts: now.ts });
    ses.stamp = now.stamp;
    ses.ts = now.ts;
    if (
      who === "me" &&
      (!ses.title || ses.title === "新的对话") &&
      !text.startsWith("［选择了")
    ) {
      ses.title = memNormalize(text).slice(0, 30) || "新的对话";
    }
    await study.persistState();
  }

  async function sendUserMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || chatBusy.value) return;

    ensureSessions();
    const study = useStudyStore();
    const settingsStore = useSettingsStore();
    const sid = currentSession.value.id;

    await appendMessageToSession(sid, "me", text);
    chatBusy.value = true;
    streamingText.value = "";

    try {
      const targetSes = study.state.chatSessions?.find((s) => s.id === sid);
      const history = targetSes ? targetSes.msgs.slice() : [];
      const { reply } = await requestChatReply({
        text,
        history,
        mode: settingsStore.settings.aiMode,
        onDelta: (full) => {
          streamingText.value = full;
        },
      });
      streamingText.value = "";
      await appendMessageToSession(sid, "bot", reply);
    } finally {
      streamingText.value = "";
      chatBusy.value = false;
    }
  }

  async function switchChatSession(sid: string) {
    const study = useStudyStore();
    const nav = useNavigationStore();
    const list = ensureSessions();
    if (!list.some((s) => s.id === sid)) return;
    study.state.chatCurrent = sid;
    await study.persistState();
    nav.closeAllDrawers();
  }

  async function deleteChatSession(sid: string) {
    const study = useStudyStore();
    const nav = useNavigationStore();
    const list = ensureSessions().filter((s) => s.id !== sid);
    if (list.length === 0) {
      const t = memNow();
      list.push({
        id: `s_${t.ts}`,
        title: "新的对话",
        stamp: t.stamp,
        ts: t.ts,
        msgs: [],
      });
    }
    study.state.chatSessions = list;
    if (study.state.chatCurrent === sid || !list.some((s) => s.id === study.state.chatCurrent)) {
      study.state.chatCurrent = list[0].id;
    }
    await study.persistState();
    nav.toast("已删除回忆");
  }

  async function appendVoiceCallTurns(
    turns: Array<{ role: "user" | "assistant"; text: string }>
  ) {
    const valid = turns.filter((t) => t && String(t.text || "").trim());
    if (!valid.length) return;
    const study = useStudyStore();
    ensureSessions();
    const ses = currentSession.value;
    const now = memNow();
    for (const turn of valid) {
      const who = turn.role === "user" ? "me" : "bot";
      const text = String(turn.text).trim();
      ses.msgs.push({ who, text, ts: now.ts });
      if (who === "me" && (!ses.title || ses.title === "新的对话")) {
        ses.title = memNormalize(text).slice(0, 30) || "新的对话";
      }
    }
    ses.stamp = now.stamp;
    ses.ts = now.ts;
    await study.persistState();
  }

  async function sendAttachmentPlaceholder(kind: "file" | "video") {
    const nav = useNavigationStore();
    nav.closeAllDrawers();
    const label = kind === "file" ? "文件" : "视频";
    const sid = currentSession.value.id;
    await appendMessageToSession(sid, "me", `［选择了${label}］`);
    window.setTimeout(() => {
      void appendMessageToSession(sid, "bot", "收到，这个功能后续接入～");
    }, 600);
  }

  async function startNewChat() {
    const nav = useNavigationStore();
    const study = useStudyStore();
    ensureSessions();
    const cur = currentSession.value;
    if (!cur.msgs.length) {
      nav.closeAllDrawers();
      nav.toast("已经是一个新对话啦");
      return;
    }
    const t = memNow();
    const nextSes: ChatSession = {
      id: `s_${t.ts}`,
      title: "新的对话",
      stamp: t.stamp,
      ts: t.ts,
      msgs: [],
    };
    study.state.chatSessions!.unshift(nextSes);
    study.state.chatCurrent = nextSes.id;
    await study.persistState();
    nav.closeAllDrawers();
    nav.toast("已开启新对话");
  }

  async function askWithStudyContext(options: {
    title: string;
    prompt: string;
    returnRoute: ChatReturnRoute;
  }) {
    const nav = useNavigationStore();
    const study = useStudyStore();
    ensureSessions();

    const cur = currentSession.value;
    if (cur.msgs.length > 0) {
      const t = memNow();
      const nextSes: ChatSession = {
        id: `s_${t.ts}_${Math.floor(Math.random() * 1000)}`,
        title: options.title.slice(0, 30) || "学习答疑",
        stamp: t.stamp,
        ts: t.ts,
        msgs: [],
      };
      study.state.chatSessions!.unshift(nextSes);
      study.state.chatCurrent = nextSes.id;
      await study.persistState();
    } else {
      cur.title = options.title.slice(0, 30) || "学习答疑";
      await study.persistState();
    }

    nav.chatReturnRoute = options.returnRoute;
    nav.go("chat");
    if (!chatBusy.value) {
      void sendUserMessage(options.prompt);
    }
  }

  function openDetailBySession(sid: string) {
    const nav = useNavigationStore();
    const ses = ensureSessions().find((s) => s.id === sid);
    if (!ses) return;
    detailTitle.value = displaySessionTitle(ses);
    detailBlocks.value = [
      {
        stamp: `${ses.stamp || ""} · ${ses.msgs.length} 条记录`,
        msgs: ses.msgs,
      },
    ];
    nav.memDetailOpen = true;
  }

  function openDetailByQuestion(q: string) {
    const nav = useNavigationStore();
    const key = memNormalize(q);
    const hits = ensureSessions()
      .filter((s) => s.msgs.some((m) => m.who === "me" && memNormalize(m.text) === key))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));

    detailTitle.value = key;
    detailBlocks.value = hits.map((s) => ({
      stamp: `${s.stamp || ""} · ${s.msgs.length} 条记录`,
      msgs: s.msgs,
    }));
    nav.memDetailOpen = true;
  }

  function searchSessions(query: string): ChatSession[] {
    const k = memNormalize(query).toLowerCase();
    if (!k) return [];
    return ensureSessions()
      .filter((s) => {
        if (memNormalize(displaySessionTitle(s)).toLowerCase().includes(k)) return true;
        return s.msgs.some((m) => memNormalize(m.text).toLowerCase().includes(k));
      })
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  async function recordSearchHistory(query: string) {
    const q = memNormalize(query);
    if (!q) return;
    const study = useStudyStore();
    const filtered = (study.state.memSearchHist || []).filter((x) => memNormalize(x) !== q);
    filtered.unshift(q);
    study.state.memSearchHist = filtered.slice(0, 10);
    await study.persistState();
  }

  async function clearSearchHistory() {
    const study = useStudyStore();
    study.state.memSearchHist = [];
    await study.persistState();
  }

  return {
    chatBusy,
    streamingText,
    detailTitle,
    detailBlocks,
    currentSession,
    recentQuestions,
    sortedSessions,
    ensureSessions,
    sendUserMessage,
    switchChatSession,
    deleteChatSession,
    appendVoiceCallTurns,
    sendAttachmentPlaceholder,
    startNewChat,
    askWithStudyContext,
    openDetailBySession,
    openDetailByQuestion,
    searchSessions,
    recordSearchHistory,
    clearSearchHistory,
  };
});

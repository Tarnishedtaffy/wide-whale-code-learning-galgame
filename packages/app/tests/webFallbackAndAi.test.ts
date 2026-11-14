import { describe, expect, it, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { webFallbackGateway } from "../src/services/webFallback";
import { localReply, requestChatReply } from "../src/services/aiClient";
import {
  buildCardChatPrompt,
  generateWrongTransferDrill,
  streamQuestionMultiIdeas,
  streamQuizSummary,
} from "../src/services/aiStudyTutor";
import { renderRichText } from "../src/utils/renderRichText";
import { useNavigationStore } from "../src/stores/navigation";
import { useStudyStore } from "../src/stores/study";
import { useChatStore } from "../src/stores/chat";
import quizBankJson from "../src/assets/generated/quiz_bank.json";
import { AI_KEY_MASK, createDefaultAiConfig, type RawQuestion } from "@mnk/shared";

const rawBank = quizBankJson as RawQuestion[];

function makeStorageMock() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

function installMemoryStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: makeStorageMock(),
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: makeStorageMock(),
  });
}

describe("webFallbackGateway & aiClient decoupling invariants", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("shuffles level questions without leaking ans/ansText and enforces 6/8 pass + 3-streak wrong removal", async () => {
    await webFallbackGateway.getBootstrapData();
    const session = await webFallbackGateway.startLevelSession(1);
    expect(session.questions.length).toBe(8);
    for (const q of session.questions) {
      expect("ans" in (q as unknown as Record<string, unknown>)).toBe(false);
      expect("ansText" in (q as unknown as Record<string, unknown>)).toBe(false);
    }

    // Answer 6 right, 2 wrong -> passes level 1, unlocks level 2, adds 2 items to wrongBook
    const answers = session.questions.map((q, idx) => {
      const raw = rawBank[q.bid];
      const ansIdx = typeof raw.ans === "number" ? raw.ans : 0;
      const rightText = raw.opts?.[ansIdx] ?? "";
      const wrongText = raw.opts?.find((o) => o !== rightText) ?? "wrong";
      return {
        questionId: q.id,
        bid: q.bid,
        chosenText: idx < 6 ? rightText : wrongText,
      };
    });

    const graded = await webFallbackGateway.submitQuizSession({
      sessionId: session.sessionId,
      level: 1,
      isWrongPractice: false,
      wrongKeys: [],
      elapsedSec: 25,
      answers,
    });

    expect(graded.passed).toBe(true);
    expect(graded.right).toBe(6);
    expect(graded.passLine).toBe(6);
    expect(graded.state.currentLevel).toBe(2);
    expect(graded.state.love).toBe(10);
    const wkeys = Object.keys(graded.state.wrongBook);
    expect(wkeys.length).toBe(2);

    // Practice first wrong item 3 times consecutively -> removed on 3rd correct!
    const targetKey = wkeys[0];
    for (let streak = 1; streak <= 3; streak++) {
      const wp = await webFallbackGateway.startWrongPracticeSession([targetKey]);
      const q = wp.questions[0];
      const raw = rawBank[q.bid];
      const ansIdx = typeof raw.ans === "number" ? raw.ans : 0;
      const rightText = raw.opts?.[ansIdx] ?? "";
      const res = await webFallbackGateway.submitQuizSession({
        sessionId: wp.sessionId,
        level: -1,
        isWrongPractice: true,
        wrongKeys: [targetKey],
        elapsedSec: 5,
        answers: [{ questionId: q.id, bid: q.bid, chosenText: rightText }],
      });
      if (streak < 3) {
        expect(res.items[0].removedFromWrongBook).toBe(false);
        expect(Boolean(res.state.wrongBook[targetKey])).toBe(true);
      } else {
        expect(res.items[0].removedFromWrongBook).toBe(true);
        expect(Boolean(res.state.wrongBook[targetKey])).toBe(false);
      }
    }
  });

  it("persists wrong answers immediately per step before finishing all 8 questions", async () => {
    await webFallbackGateway.getBootstrapData();
    const session = await webFallbackGateway.startLevelSession(1);
    const q0 = session.questions[0];
    const raw0 = rawBank[q0.bid];
    const right0 = raw0.opts?.[typeof raw0.ans === "number" ? raw0.ans : 0] ?? "";
    const wrong0 = raw0.opts?.find((o) => o !== right0) ?? "wrong";

    const stepRes = await webFallbackGateway.recordQuizStep({
      answer: { questionId: q0.id, bid: q0.bid, chosenText: wrong0 },
    });
    expect(stepRes.item.ok).toBe(false);
    expect(Object.keys(stepRes.state.wrongBook)).toContain(`b${q0.bid}`);

    // Reload bootstrap without submitting session -> wrongBook MUST retain the item!
    const reloaded = await webFallbackGateway.getBootstrapData();
    expect(Object.keys(reloaded.state.wrongBook)).toContain(`b${q0.bid}`);
    expect(reloaded.state.wrongBook[`b${q0.bid}`].count).toBe(1);
  });

  it("falls back cleanly to localReply when proxy URL is unreachable", async () => {
    expect(localReply("装饰器怎么用")).toContain("高阶函数");
    const res = await requestChatReply({
      text: "列表和元组有什么区别？",
      history: [],
      mode: "proxy",
      proxyUrl: "http://127.0.0.1:9/v1/chat/completions",
      timeoutMs: 250,
    });
    expect(res.source).toBe("local");
    expect(res.reply).toContain("tuple");
  });

  it("supports two-stage per-step evaluation across all 8 questions without double-counting wrongBook", async () => {
    await webFallbackGateway.getBootstrapData();
    const session = await webFallbackGateway.startLevelSession(1);
    const answers = [];

    for (let idx = 0; idx < session.questions.length; idx++) {
      const q = session.questions[idx];
      const raw = rawBank[q.bid];
      const ansIdx = typeof raw.ans === "number" ? raw.ans : 0;
      const rightText = raw.opts?.[ansIdx] ?? "";
      const wrongText = raw.opts?.find((o) => o !== rightText) ?? "wrong";
      const input = {
        questionId: q.id,
        bid: q.bid,
        chosenText: idx === 0 ? wrongText : rightText,
      };
      answers.push(input);
      const stepRes = await webFallbackGateway.recordQuizStep({ answer: input });
      expect(stepRes.item.ok).toBe(idx !== 0);
      expect(Boolean(stepRes.item.ansText)).toBe(true);
    }

    const graded = await webFallbackGateway.submitQuizSession({
      sessionId: session.sessionId,
      level: 1,
      isWrongPractice: false,
      wrongKeys: [],
      elapsedSec: 18,
      answers,
      recordedCount: session.questions.length,
    });

    const wkey = `b${session.questions[0].bid}`;
    expect(graded.passed).toBe(true);
    expect(graded.right).toBe(7);
    expect(graded.state.wrongBook[wkey]?.count).toBe(1);

    // Verify AI Study Tutor linkage helpers & resilient fallbacks
    const cardPrompt = buildCardChatPrompt({
      cardId: "c0_0",
      ch: "M1",
      chTitle: "基础语法",
      tag: "变量",
      q: "什么是变量？",
      a: "用来绑定对象的名字。",
    });
    expect(cardPrompt.prompt).toContain("M1 基础语法");
    expect(cardPrompt.prompt).toContain("什么是变量？");

    const ideas = await streamQuestionMultiIdeas(graded.items[0], { mode: "local" });
    expect(ideas.source).toBe("local");
    expect(ideas.text).toContain("思路一");

    const summary = await streamQuizSummary(graded, { mode: "local" });
    expect(summary.source).toBe("local");
    expect(summary.text).toContain("7/8");

    const drill = await generateWrongTransferDrill(graded.state.wrongBook[wkey], {
      mode: "local",
      variantSeed: 2,
    });
    expect(drill.options.length).toBeGreaterThanOrEqual(2);
    expect(drill.options[drill.answerIndex]).toBe(graded.state.wrongBook[wkey].ansText);
  });

  it("returns exact per-question doc explanations without cross-question card shadowing", async () => {
    await webFallbackGateway.getBootstrapData();
    const res0 = await webFallbackGateway.recordQuizStep({
      answer: { questionId: "L1_0_0", bid: 0, chosenText: "小明" },
    });
    expect(res0.item.explain).toBe("注释不产生输出");

    const res1 = await webFallbackGateway.recordQuizStep({
      answer: { questionId: "L1_1_1", bid: 1, chosenText: "Python" },
    });
    expect(res1.item.explain).toBe("引号只是标记，不显示出来");
  });

  it("renders safe Markdown and whitelisted simple HTML while escaping raw < > and XSS payloads", () => {
    const html = renderRichText(
      [
        "### 核心结论",
        "使用 **print()** 或 <b>len()</b>，行内代码 `if a < b and c > 0:` 很安全。",
        "- 第一点：<em>不可变</em>",
        "- 第二点：<a href=\"https://docs.python.org\">官方文档</a>",
        "```python",
        "if x < 10:",
        "    print('ok')",
        "```",
        "<script>alert(1)</script><img src=x onerror=alert(1)>",
      ].join("\n")
    );

    expect(html).toContain('<div class="rt-h">核心结论</div>');
    expect(html).toContain("<strong>print()</strong>");
    expect(html).toContain("<b>len()</b>");
    expect(html).toContain('<code class="rt-code">if a &lt; b and c &gt; 0:</code>');
    expect(html).toContain('<ul class="rt-ul"><li>第一点：<em>不可变</em></li>');
    expect(html).toContain('href="https://docs.python.org"');
    expect(html).toContain('<pre class="rt-pre"><span class="rt-lang">python</span><code>if x &lt; 10:');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps chat AI settings modal decoupled from voiceCall and preserves independent voiceCall return routes", () => {
    setActivePinia(createPinia());
    const nav = useNavigationStore();

    nav.openChatFromHome();
    expect(nav.currentPage).toBe("chat");

    // Opening & closing AI config modal from ChatPage must NEVER jump to voiceCall
    nav.openModal("aiConfig");
    expect(nav.activeModal).toBe("aiConfig");
    expect(nav.currentPage).toBe("chat");
    nav.closeModal();
    expect(nav.activeModal).toBe("none");
    expect(nav.currentPage).toBe("chat");

    // Independent voiceCall entry from HomePage returns to HomePage
    nav.go("home", false);
    nav.openVoiceCall({ video: false, fromPage: "home" });
    expect(nav.currentPage).toBe("voiceCall");
    nav.leaveVoiceCall(false);
    expect(nav.currentPage).toBe("home");

    // Independent voiceCall entry from ChatPage returns to ChatPage
    nav.openChatFromHome();
    nav.openVoiceCall({ video: true, fromPage: "chat" });
    expect(nav.currentPage).toBe("voiceCall");
    nav.leaveVoiceCall(false);
    expect(nav.currentPage).toBe("chat");
  });

  it("never overwrites persisted wrongBook when ChatPage renders before async bootstrap completes", async () => {
    // 1. Session 1: record a wrong answer into persistent storage
    await webFallbackGateway.getBootstrapData();
    await webFallbackGateway.recordQuizStep({
      answer: { questionId: "L1_0_0", bid: 0, chosenText: "wrong_choice" },
    });

    // 2. Session 2 (simulating opening new .exe): fresh Pinia stores render ChatPage BEFORE getBootstrapData resolves
    setActivePinia(createPinia());
    const study = useStudyStore();
    const chat = useChatStore();

    expect(study.ready).toBe(false);
    // Simulate synchronous template reads in ChatPage / ChatHistoryDrawer on frame 0
    expect(chat.currentSession.id).toBe("s_main");
    expect(chat.sortedSessions.length).toBeGreaterThan(0);
    expect(chat.recentQuestions.length).toBeGreaterThan(0);
    chat.ensureSessions();
    await study.persistState();

    // 3. Now async getBootstrapData resolves and hydrates study store
    const boot = await webFallbackGateway.getBootstrapData();
    study.hydrate({
      cards: boot.cards,
      totalLevels: boot.totalLevels,
      cardsPerLevel: boot.cardsPerLevel,
      wrongMasterStreak: boot.wrongMasterStreak,
      state: boot.state,
    });
    chat.ensureSessions();

    expect(Object.keys(study.state.wrongBook)).toContain("b0");
    expect(study.state.wrongBook.b0.count).toBe(1);
  });

  it("never embeds builtin API keys in source defaults and never persists raw keys in localStorage", async () => {
    const def = createDefaultAiConfig();
    expect(def.apiKey).toBe("");
    expect(def.baseURL).toBe("http://127.0.0.1:8787");

    const saved = await webFallbackGateway.saveAiConfig({
      ...def,
      baseURL: "https://gateway.example.com",
      apiKey: "test-only-session-secret-token",
    });
    expect(saved.apiKey).toBe(AI_KEY_MASK);

    // Persistent localStorage must NOT contain the raw secret
    const lsRaw = globalThis.localStorage.getItem("mnk_ai_cfg_v1") || "";
    expect(lsRaw).not.toContain("test-only-session-secret-token");
    expect(webFallbackGateway.getUnmaskedSessionKey()).toBe("test-only-session-secret-token");
  });
});

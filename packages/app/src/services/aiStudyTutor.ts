import type {
  AiChatMessage,
  AiMode,
  GradeSessionResult,
  QuizGradedItem,
  WrongBookItem,
} from "@mnk/shared";
import { isAiConfigured, requestAiCompletion } from "./aiClient";

export interface CardTutorInput {
  cardId: string;
  ch: string;
  chTitle: string;
  tag: string;
  q: string;
  a: string;
}

export interface TransferDrill {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  tip: string;
  source: "ai" | "local";
}

export interface StudyTutorStreamOptions {
  mode?: AiMode;
  proxyUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onDelta?: (full: string, delta: string) => void;
}

export function buildCardChatPrompt(card: CardTutorInput): {
  title: string;
  prompt: string;
} {
  const title = `卡片答疑 · ${card.tag}`;
  const prompt = [
    `我正在学习「${card.ch} ${card.chTitle}」的知识卡【${card.tag}】：`,
    `问题：${card.q}`,
    `卡片答案：${card.a}`,
    `请用通俗好懂的方式帮我拆解一下核心原理，并举一个 3～5 行的最小 Python 例子帮我记住它～`,
  ].join("\n");
  return { title, prompt };
}

export function buildQuizFollowupPrompt(item: QuizGradedItem): {
  title: string;
  prompt: string;
} {
  const title = `题目追问 · ${item.tag}`;
  const statusLine = item.ok
    ? `我选了「${item.chosen}」（回答正确），想进一步吃透这道题。`
    : `我选了「${item.chosen}」（答错了），参考答案是「${item.ansText}」。`;
  const prompt = [
    `我在做测试题【${item.m} · ${item.tag}】：`,
    `题目：${item.q}`,
    statusLine,
    item.explain ? `参考解析：${item.explain}` : "",
    `请结合参考答案再帮我讲讲这道题容易踩坑的地方，以及怎么一眼判断出正确结果？`,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, prompt };
}

export function buildResultFollowupPrompt(result: GradeSessionResult): {
  title: string;
  prompt: string;
  } {
  const scope = result.isWrongPractice ? "错题重做" : `第 ${result.level} 关测试`;
  const wrongs = result.items.filter((i) => !i.ok);
  const wrongSummary = wrongs.length
    ? wrongs
        .slice(0, 4)
        .map((w, idx) => `${idx + 1}. [${w.m}·${w.tag}] ${w.q}（误选：${w.chosen} → 正解：${w.ansText}）`)
        .join("\n")
    : "本轮全部答对！";
  return {
    title: `${scope}复盘`,
    prompt: [
      `我刚完成了${scope}，答对 ${result.right}/${result.total} 题（用时 ${result.elapsedSec} 秒）。`,
      wrongs.length ? `错题记录：\n${wrongSummary}` : wrongSummary,
      `请帮我针对薄弱点制定接下来的复习计划，或者考我一道巩固小题吧！`,
    ].join("\n"),
  };
}

export function buildWrongFollowupPrompt(item: WrongBookItem): {
  title: string;
  prompt: string;
} {
  return {
    title: `错题深挖 · ${item.tag}`,
    prompt: [
      `我在复习错题本里的【${item.m} · ${item.tag}】：`,
      `原题：${item.q}`,
      item.chosen ? `我当时误选了：${item.chosen}` : "",
      `正确答案：${item.ansText}`,
      item.doc ? `知识点提示：${item.doc}` : "",
      `请帮我彻底理清这个易错点，并教我一个不会再混的判断技巧～`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildLocalMultiIdeas(item: QuizGradedItem): string {
  const lines: string[] = [];
  lines.push(
    `💡 思路一（正向概念推导）：先锁定考点「${item.m} · ${item.tag}」。${
      item.explain || `根据 Python 语法规则，可直接推出标准结果为「${item.ansText}」。`
    }`
  );
  if (!item.ok && item.chosen) {
    lines.push(
      `🔍 思路二（排除与错因对比）：你刚才选的「${item.chosen}」是常见干扰项，容易把边界条件或返回值类型混淆；先排除与核心定义冲突的选项，就能稳稳锁定「${item.ansText}」。`
    );
  } else {
    lines.push(
      `🔍 思路二（最小样例代入验证）：做题拿不准时，可以在脑海里代入最简输入（如空列表 []、0 或单字符 "a"）模拟执行一步，验证输出是否与「${item.ansText}」一致。`
    );
  }
  lines.push(
    `📌 速记口诀：遇到「${item.tag}」先看数据类型与边界，再核对返回值是否原地修改。`
  );
  return lines.join("\n\n");
}

export async function streamQuestionMultiIdeas(
  item: QuizGradedItem,
  opts: StudyTutorStreamOptions = {}
): Promise<{ text: string; source: "ai" | "local" }> {
  const { mode = "proxy", proxyUrl, timeoutMs, signal, onDelta } = opts;

  if (mode !== "local" && (proxyUrl?.trim() || isAiConfigured())) {
    try {
      const messages: AiChatMessage[] = [
        {
          role: "system",
          content:
            "你是 Python 学习助教 Lune。请根据题目、用户作答、官方参考答案和解析，给出 2～3 种清晰的解题思路（例如：① 正向语法/原理推导、② 排除干扰项/代入特值法、③ 一句话防坑速记）。语言温柔精炼，总字数控制在 220 字以内，可使用简洁的 Markdown（如 **加粗关键结论**、`行内代码` 与列表）。",
        },
        {
          role: "user",
          content: [
            `考点：[${item.m} · ${item.tag}]`,
            `题目：${item.q}`,
            `用户作答：${item.chosen}（${item.ok ? "回答正确" : "回答错误"}）`,
            `官方参考答案：${item.ansText}`,
            item.explain ? `官方解析：${item.explain}` : "",
            "请给出多种解题思路与易错提醒：",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ];

      const text = await requestAiCompletion(messages, {
        onDelta,
        signal,
        timeoutMs,
        maxTokens: 1536,
        baseURLOverride: proxyUrl?.trim() || undefined,
      });
      if (text.trim()) {
        return { text: text.trim(), source: "ai" };
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      console.warn("[aiStudyTutor] 多思路生成回退本地：", err);
    }
  }

  const fallback = buildLocalMultiIdeas(item);
  onDelta?.(fallback, fallback);
  return { text: fallback, source: "local" };
}

export function buildLocalQuizSummary(result: GradeSessionResult): string {
  const scope = result.isWrongPractice ? "错题重做" : `第 ${result.level} 关`;
  const wrongs = result.items.filter((i) => !i.ok);
  const rightTags = Array.from(
    new Set(result.items.filter((i) => i.ok).map((i) => i.tag))
  ).slice(0, 3);
  const weakTags = Array.from(new Set(wrongs.map((i) => i.tag)));

  if (wrongs.length === 0) {
    return [
      `🌸 太棒啦！${scope} ${result.right}/${result.total} 全对通关，用时仅 ${result.elapsedSec} 秒！`,
      rightTags.length
        ? `✨ 掌握亮点：你对「${rightTags.join("」「")}」等概念反应非常敏捷、判断精准。`
        : `✨ 掌握亮点：本轮核心语法与边界细节全部稳稳拿下。`,
      `🚀 下一步建议：趁热打铁挑战下一关，或者去聊天页让我考你一道进阶综合题吧～`,
    ].join("\n\n");
  }

  return [
    `🌸 辛苦啦！${scope}答对 ${result.right}/${result.total} 题（${
      result.passed ? "成功过关 🎉" : `距通关线 ${result.passLine} 题只差一点点 💪`
    }）。`,
    rightTags.length
      ? `✨ 稳固强项：「${rightTags.join("」「")}」已经掌握得很扎实。`
      : `✨ 作答节奏：用时 ${result.elapsedSec} 秒，已经在逐步建立题感啦。`,
    `🎯 重点突破：本轮失分集中在「${weakTags.join("」「")}」，建议翻看下方错题解析，再去错题本点「举一反三」练一道变式题巩固！`,
  ].join("\n\n");
}

export async function streamQuizSummary(
  result: GradeSessionResult,
  opts: StudyTutorStreamOptions = {}
): Promise<{ text: string; source: "ai" | "local" }> {
  const { mode = "proxy", proxyUrl, timeoutMs, signal, onDelta } = opts;

  if (mode !== "local" && (proxyUrl?.trim() || isAiConfigured())) {
    try {
      const scope = result.isWrongPractice ? "错题重做专场" : `第 ${result.level} 关测试`;
      const rightTags = Array.from(
        new Set(result.items.filter((i) => i.ok).map((i) => `${i.m}·${i.tag}`))
      );
      const wrongDetails = result.items
        .filter((i) => !i.ok)
        .map((w) => `- [${w.m}·${w.tag}] 题目：${w.q} | 误选：${w.chosen} | 正解：${w.ansText}`);

      const messages: AiChatMessage[] = [
        {
          role: "system",
          content:
            "你是温柔专业的 Python 助教 Lune。请根据学生的测试成绩与错题明细，写一段 3 小点的个性化考后总结：① 表现肯定与亮点、② 薄弱知识点与错因诊断、③ 具体可执行的下一步复习建议。总字数控制在 200 字以内，可使用简洁的 Markdown（如 **加粗重点**、`行内代码` 与分点列表）。",
        },
        {
          role: "user",
          content: [
            `测试类型：${scope}`,
            `成绩：答对 ${result.right} / ${result.total} 题（${result.passed ? "已通过" : "未通过"}），用时 ${result.elapsedSec} 秒`,
            `答对考点：${rightTags.length ? rightTags.join("、") : "暂无"}`,
            wrongDetails.length
              ? `错题明细：\n${wrongDetails.join("\n")}`
              : "错题明细：无，全部答对！",
          ].join("\n"),
        },
      ];

      const text = await requestAiCompletion(messages, {
        onDelta,
        signal,
        timeoutMs,
        maxTokens: 1536,
        baseURLOverride: proxyUrl?.trim() || undefined,
      });
      if (text.trim()) {
        return { text: text.trim(), source: "ai" };
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      console.warn("[aiStudyTutor] 考后总结生成回退本地：", err);
    }
  }

  const fallback = buildLocalQuizSummary(result);
  onDelta?.(fallback, fallback);
  return { text: fallback, source: "local" };
}

export function buildLocalTransferDrill(item: WrongBookItem, seed = 0): TransferDrill {
  const rawOpts =
    item.opts && item.opts.length >= 2
      ? item.opts.slice(0, 4)
      : [
          item.ansText || "符合语法规范的正确写法",
          item.chosen && item.chosen !== item.ansText ? item.chosen : "运行时抛出 TypeError",
          "返回 None",
          "产生语法错误 SyntaxError",
        ];

  // Rotate option order deterministically so the answer position isn't identical to the original
  const shift = ((seed || 1) + (item.tag?.length || 1)) % rawOpts.length;
  const rotated = rawOpts.map((_, idx) => rawOpts[(idx + shift) % rawOpts.length]);
  const ansIdx = Math.max(
    0,
    rotated.findIndex((o) => o === item.ansText)
  );

  return {
    question: `【同考点变式 · ${item.tag}】换个角度再检验一次：围绕「${item.q.replace(/\s+/g, " ").slice(0, 56)}」所考查的规则，下列哪一项才是完全正确的结论？`,
    options: rotated,
    answerIndex: ansIdx,
    explanation:
      item.doc ||
      `紧扣「${item.m} · ${item.tag}」核心规则：正确结论应为「${rotated[ansIdx]}」，注意避开上次误选的「${item.chosen || "干扰项"}」。`,
    tip: `记住「${item.tag}」的关键边界，先排错再定答案就不容易重蹈覆辙啦！`,
    source: "local",
  };
}

function parseTransferDrillJson(raw: string): Omit<TransferDrill, "source"> | null {
  const cleaned = raw
    .replace(/^[\s\S]*?```(?:json)?/i, (m) => (m.includes("```") ? "" : m))
    .replace(/```[\s\S]*$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      question?: unknown;
      options?: unknown;
      answerIndex?: unknown;
      explanation?: unknown;
      tip?: unknown;
    };
    const question = String(parsed.question || "").trim();
    const rawOptions = Array.isArray(parsed.options)
      ? parsed.options.map((x) => String(x || "").replace(/^[A-D][.、:：)\s]+/i, "").trim()).filter(Boolean)
      : [];
    const answerIndex = Number(parsed.answerIndex);
    if (
      !question ||
      rawOptions.length < 2 ||
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex >= rawOptions.length
    ) {
      return null;
    }
    return {
      question,
      options: rawOptions.slice(0, 4),
      answerIndex: Math.min(answerIndex, 3),
      explanation:
        String(parsed.explanation || "").trim() ||
        `正确项为 ${String.fromCharCode(65 + Math.min(answerIndex, 3))}。`,
      tip: String(parsed.tip || "").trim() || "抓住核心语法规则，注意区分相似干扰项。",
    };
  } catch {
    return null;
  }
}

export async function generateWrongTransferDrill(
  item: WrongBookItem,
  opts: StudyTutorStreamOptions & { variantSeed?: number } = {}
): Promise<TransferDrill> {
  const { mode = "proxy", proxyUrl, timeoutMs, signal, variantSeed = 1 } = opts;

  if (mode !== "local" && (proxyUrl?.trim() || isAiConfigured())) {
    try {
      const messages: AiChatMessage[] = [
        {
          role: "system",
          content:
            '你是 Python 命题助教 Lune。请根据学生的错题，围绕同一考点但换一个具体代码/场景（严禁照抄原题数字或变量），出一道举一反三的 4 选 1 变式单选题。只输出合法的 JSON 对象，不要输出任何额外解释或代码块标记，JSON 字段严格为：{"question":"变式题干","options":["选项1(不带A.)","选项2","选项3","选项4"],"answerIndex":0,"explanation":"简短解析(60字内)","tip":"一句话防坑口诀(30字内)"}',
        },
        {
          role: "user",
          content: [
            `考点：[${item.m} · ${item.tag}]（变式序号 #${variantSeed}）`,
            `原错题：${item.q}`,
            item.chosen ? `学生曾误选：${item.chosen}` : "",
            `原题正确答案：${item.ansText}`,
            item.doc ? `原题知识点说明：${item.doc}` : "",
            "请生成新的同考点变式单选题 JSON：",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ];

      const raw = await requestAiCompletion(messages, {
        stream: false,
        signal,
        timeoutMs,
        maxTokens: 1536,
        temperature: 0.75,
        baseURLOverride: proxyUrl?.trim() || undefined,
      });
      const parsed = parseTransferDrillJson(raw);
      if (parsed) {
        return { ...parsed, source: "ai" };
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      console.warn("[aiStudyTutor] 举一反三变式题生成回退本地：", err);
    }
  }

  return buildLocalTransferDrill(item, variantSeed);
}

const ALLOWED_INLINE_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "del",
  "mark",
  "code",
  "sub",
  "sup",
]);

const ALLOWED_BLOCK_OR_VOID_TAGS = new Set([
  "br",
  "hr",
  "p",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
]);

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function applyInlineMarkdown(line: string): string {
  let out = line;
  // Markdown links: [label](https://...)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)<>"']+)\)/g,
    '<a class="rt-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_\n]+?)__/g, "<strong>$1</strong>");
  // Strikethrough: ~~text~~
  out = out.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
  // Italic: *text* (not touching ** or list bullets)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

/**
 * Safely renders lightweight Markdown + whitelisted simple HTML tags into sanitized HTML.
 * - Neutralizes `<script>`, `<style>`, event handlers (`on*=`), and `javascript:` URLs.
 * - Supports fenced code blocks (including streaming unclosed blocks), inline code,
 *   headings, blockquotes, ordered/unordered lists, bold/italic/strikethrough, links,
 *   and simple safe HTML tags (`<b>`, `<strong>`, `<em>`, `<code>`, `<br>`, `<ul>`, `<li>`, etc.).
 */
export function renderRichText(raw: string | undefined | null): string {
  const source = String(raw ?? "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return "";

  const slots: string[] = [];
  const putSlot = (html: string): string => {
    const id = slots.length;
    slots.push(html);
    return `\u0000RT${id}\u0000`;
  };

  // 1. Strip dangerous script/style blocks completely
  let text = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // 2. Extract closed fenced code blocks ```lang ... ```
  text = text.replace(/```([a-zA-Z0-9_+-]*)[ \t]*\n([\s\S]*?)```/g, (_m, lang, code) => {
    const cleanCode = String(code || "").replace(/\n$/, "");
    const langBadge = lang
      ? `<span class="rt-lang">${escapeHtml(String(lang).toLowerCase())}</span>`
      : "";
    return putSlot(
      `<pre class="rt-pre">${langBadge}<code>${escapeHtml(cleanCode)}</code></pre>`
    );
  });

  // Also handle streaming unclosed fenced code block at the end of message
  text = text.replace(/```([a-zA-Z0-9_+-]*)[ \t]*\n([\s\S]*)$/g, (_m, lang, code) => {
    const langBadge = lang
      ? `<span class="rt-lang">${escapeHtml(String(lang).toLowerCase())}</span>`
      : "";
    return putSlot(`<pre class="rt-pre">${langBadge}<code>${escapeHtml(String(code || ""))}</code></pre>`);
  });

  // 3. Extract inline backtick code `...`
  text = text.replace(/`([^`\n]+?)`/g, (_m, code) =>
    putSlot(`<code class="rt-code">${escapeHtml(String(code))}</code>`)
  );

  // 4. Preserve safe simple HTML tags (stripping all unsafe attributes) before escaping
  const openInlineStack: string[] = [];
  text = text.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (fullMatch, slash: string, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      const isClosing = slash === "/";

      if (tag === "a") {
        if (isClosing) {
          return putSlot("</a>");
        }
        const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"(https?:\/\/[^"\s<>]+)"|'(https?:\/\/[^'\s<>]+)')/i);
        const safeHref = hrefMatch ? hrefMatch[1] || hrefMatch[2] : "";
        if (!safeHref) return fullMatch;
        return putSlot(
          `<a class="rt-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">`
        );
      }

      // Only allow simple attribute-free tags (or self-closing slash on br/hr)
      const trimmedAttrs = attrs.trim();
      if (trimmedAttrs && trimmedAttrs !== "/") {
        return fullMatch;
      }

      if (tag === "br") {
        return isClosing ? "" : putSlot("<br />");
      }
      if (tag === "hr") {
        return isClosing ? "" : putSlot('<hr class="rt-hr" />');
      }

      if (ALLOWED_INLINE_TAGS.has(tag)) {
        if (!isClosing) {
          openInlineStack.push(tag);
          const cls = tag === "code" ? ' class="rt-code"' : "";
          return putSlot(`<${tag}${cls}>`);
        }
        const lastIdx = openInlineStack.lastIndexOf(tag);
        if (lastIdx >= 0) {
          openInlineStack.splice(lastIdx, 1);
          return putSlot(`</${tag}>`);
        }
        return "";
      }

      if (ALLOWED_BLOCK_OR_VOID_TAGS.has(tag)) {
        if (tag === "p") {
          return putSlot(isClosing ? "</div>" : '<div class="rt-p">');
        }
        if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
          return putSlot(isClosing ? "</div>" : '<div class="rt-h">');
        }
        if (tag === "pre") {
          return putSlot(isClosing ? "</pre>" : '<pre class="rt-pre">');
        }
        if (tag === "ul") {
          return putSlot(isClosing ? "</ul>" : '<ul class="rt-ul">');
        }
        if (tag === "ol") {
          return putSlot(isClosing ? "</ol>" : '<ol class="rt-ol">');
        }
        if (tag === "blockquote") {
          return putSlot(isClosing ? "</blockquote>" : '<blockquote class="rt-quote">');
        }
        return putSlot(isClosing ? `</${tag}>` : `<${tag}>`);
      }

      return fullMatch;
    }
  );

  // 5. Escape all remaining raw HTML characters (`a < b`, `<img onerror=...>`, etc.)
  text = escapeHtml(text);

  // 6. Parse block-level & inline Markdown line by line
  const lines = text.split("\n");
  const outBlocks: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const cls = listType === "ul" ? "rt-ul" : "rt-ol";
    outBlocks.push(`<${listType} class="${cls}">${listItems.join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      if (outBlocks.length > 0 && outBlocks[outBlocks.length - 1] !== '<div class="rt-gap"></div>') {
        outBlocks.push('<div class="rt-gap"></div>');
      }
      continue;
    }

    // Standalone slot block (e.g. fenced <pre>)
    if (/^\u0000RT\d+\u0000$/.test(trimmed)) {
      const slotIdx = Number(trimmed.slice(3, -1));
      const slotHtml = slots[slotIdx] || "";
      if (slotHtml.startsWith("<pre") || slotHtml.startsWith("<hr")) {
        flushList();
        outBlocks.push(trimmed);
        continue;
      }
    }

    // Horizontal rule
    if (/^(?:---+|\*\*\*+)$/.test(trimmed)) {
      flushList();
      outBlocks.push('<hr class="rt-hr" />');
      continue;
    }

    // Markdown Heading (# .. ####)
    const hMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (hMatch) {
      flushList();
      outBlocks.push(`<div class="rt-h">${applyInlineMarkdown(hMatch[1])}</div>`);
      continue;
    }

    // Blockquote (&gt; ...)
    const qMatch = trimmed.match(/^&gt;\s?(.*)$/);
    if (qMatch) {
      flushList();
      outBlocks.push(`<blockquote class="rt-quote">${applyInlineMarkdown(qMatch[1])}</blockquote>`);
      continue;
    }

    // Unordered list (- / * / •)
    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${applyInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list (1. / 1) / 1、)
    const olMatch = trimmed.match(/^\d+[.)、]\s+(.+)$/);
    if (olMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${applyInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    flushList();
    outBlocks.push(`<div class="rt-p">${applyInlineMarkdown(rawLine)}</div>`);
  }

  flushList();

  // Auto-close any unclosed inline HTML tags from streaming chunks
  let autoClosed = "";
  for (let i = openInlineStack.length - 1; i >= 0; i--) {
    autoClosed += `</${openInlineStack[i]}>`;
  }

  let assembled = outBlocks.join("") + autoClosed;

  // Restore placeholders (run twice in case a tag placeholder sat inside a paragraph)
  for (let pass = 0; pass < 2; pass++) {
    assembled = assembled.replace(/\u0000RT(\d+)\u0000/g, (_m, idxStr) => {
      const idx = Number(idxStr);
      return slots[idx] ?? "";
    });
  }

  return assembled;
}

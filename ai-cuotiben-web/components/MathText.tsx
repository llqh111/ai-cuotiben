"use client";
// 把 OCR/AI 输出的混合文本（中文 + LaTeX 公式）渲染成数学公式。
// 支持：$$...$$ 行间公式、$...$ 行内公式、\(...\) 行内、\[...\] 行间。
// 非公式文字原样显示（保留换行）。
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathTextProps {
  text?: string | null;
  className?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      output: "html",
    });
  } catch {
    // 渲染失败就退回原始文本，至少不丢内容
    return escapeHtml(display ? `$$${tex}$$` : `$${tex}$`);
  }
}

// 依次匹配 $$...$$ / \[...\]（行间）和 $...$ / \(...\)（行内），其余按纯文本转义。
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;

function toHtml(input: string): string {
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(input)) !== null) {
    out += escapeHtml(input.slice(last, m.index));
    const display = m[1] !== undefined || m[2] !== undefined;
    const tex = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    out += renderMath(tex, display);
    last = m.index + m[0].length;
  }
  out += escapeHtml(input.slice(last));
  return out;
}

export function MathText({ text, className }: MathTextProps) {
  if (!text) return null;
  return (
    <span
      className={className}
      style={{ whiteSpace: "pre-wrap" }}
      dangerouslySetInnerHTML={{ __html: toHtml(text) }}
    />
  );
}

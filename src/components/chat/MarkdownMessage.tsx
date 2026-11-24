"use client";

import React from "react";

function isSafeLinkHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      nodes.push(
        <del key={key} className="text-zinc-500 line-through">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const splitIdx = token.indexOf("](");
      const label = token.slice(1, splitIdx);
      const href = token.slice(splitIdx + 2, -1).trim();
      if (isSafeLinkHref(href)) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
          >
            {label}
          </a>
        );
      } else {
        nodes.push(label);
      }
    } else if (token.startsWith("`") && token.endsWith("`")) {
      const inner = token.slice(1, -1);
      const isFresh = inner === "FRESH";
      const isDelayed = inner.includes("DELAYED");
      const isStale = inner === "STALE" || inner === "SAMPLE";
      const toneClass = isFresh
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
        : isDelayed
        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
        : isStale
        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
        : "bg-zinc-900 text-zinc-200 border-zinc-800";

      nodes.push(
        <code
          key={key}
          className={`px-1.5 py-0.5 rounded border font-mono text-[11px] tabular-nums ${toneClass}`}
        >
          {inner}
        </code>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={key} className="italic text-zinc-300">
          {token.slice(1, -1)}
        </em>
      );
    }

    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

export function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      blocks.push(
        <div
          key={`code-${i}`}
          className="my-2 rounded-md border border-zinc-800 bg-zinc-950 overflow-x-auto"
        >
          {lang && (
            <div className="px-3 py-1 border-b border-zinc-800/80 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              {lang}
            </div>
          )}
          <pre className="p-3 text-xs font-mono text-zinc-200 leading-relaxed whitespace-pre">
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      continue;
    }

    // Markdown table
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|/.test(lines[i + 1])
    ) {
      const parseRow = (rowLine: string) =>
        rowLine
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());

      const headers = parseRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      blocks.push(
        <div
          key={`tbl-${i}`}
          className="my-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-950/60"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/70">
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 font-medium"
                  >
                    {renderInline(h, `th-${i}-${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-zinc-900/40">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-2.5 py-1.5 text-zinc-200 align-top">
                      {renderInline(cell, `td-${i}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const cls =
        level === 1
          ? "text-sm font-semibold text-zinc-100 mt-3 mb-1.5 border-b border-zinc-800/80 pb-1"
          : level === 2
          ? "text-xs font-mono uppercase tracking-wider font-semibold text-zinc-200 mt-3 mb-1"
          : "text-xs font-semibold text-zinc-200 mt-2 mb-1";
      blocks.push(
        <div key={`h-${i}`} className={cls}>
          {renderInline(text, `h-${i}`)}
        </div>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} className="my-2.5 border-zinc-800/80" />);
      i++;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="my-2 pl-3 border-l-2 border-amber-500/60 text-xs text-zinc-300 bg-zinc-900/40 py-1.5 pr-2 rounded-r"
        >
          {renderInline(quoteLines.join(" "), `bq-${i}`)}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1 pl-4 list-disc marker:text-zinc-500">
          {items.map((item, idx) => (
            <li key={idx} className="text-[13px] leading-relaxed text-zinc-200">
              {renderInline(item, `ul-${i}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-1 pl-4 list-decimal marker:text-zinc-400">
          {items.map((item, idx) => (
            <li key={idx} className="text-[13px] leading-relaxed text-zinc-200">
              {renderInline(item, `ol-${i}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("|") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push(
      <p key={`p-${i}`} className="text-[13px] leading-relaxed text-zinc-200 my-1.5">
        {renderInline(paraLines.join(" "), `p-${i}`)}
      </p>
    );
  }

  return <div className="space-y-0.5 break-words">{blocks}</div>;
}

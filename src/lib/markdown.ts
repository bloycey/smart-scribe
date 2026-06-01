import type { FinalSummary } from "./types";

export function summaryToMarkdown(
  noteTitle: string,
  date: string,
  summary: FinalSummary,
): string {
  const lines: string[] = [];
  lines.push(`# ${noteTitle}`);
  lines.push("");
  lines.push(`_${new Date(date).toLocaleString()}_`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  lines.push(summary.executiveSummary);
  lines.push("");
  lines.push("## Themes");
  for (const theme of summary.themes) {
    lines.push("");
    lines.push(`### ${theme.title}`);
    for (const p of theme.points) lines.push(`- ${p}`);
  }
  if (summary.nextSteps.length > 0) {
    lines.push("");
    lines.push("## Next steps");
    for (const s of summary.nextSteps) lines.push(`- [ ] ${s}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "note";
}

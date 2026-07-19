import type { AnalysisReport } from "@/lib/report/contract";
import { renderMarkdownReport } from "@/lib/report/markdown";

export function downloadReport(report: AnalysisReport): void {
  const blob = new Blob([renderMarkdownReport(report)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = report.repositoryLabel
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  link.href = url;
  link.download = `scaleproof-${safeName || "report"}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

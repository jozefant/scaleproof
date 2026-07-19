"use client";

import { useState } from "react";

import type { AnalysisReport } from "@/lib/report/contract";
import { Landing } from "./landing";
import { Report } from "./report/report";

export function ScaleproofApp() {
  const [report, setReport] = useState<AnalysisReport | null>(null);

  if (report) {
    return <Report report={report} onReset={() => setReport(null)} />;
  }

  return <Landing onReport={setReport} />;
}

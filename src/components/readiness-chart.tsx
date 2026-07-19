"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PublicDomainScore } from "@/lib/report/contract";

const COLORS = {
  strong: "var(--positive)",
  watch: "var(--signal)",
  weak: "var(--negative)",
};

const SHORT_LABELS: Record<PublicDomainScore["id"], string> = {
  architecture: "Architecture",
  quality: "Quality",
  security: "Security",
  operations: "Operations",
  reliability: "Reliability",
  resilience: "Resilience",
  agent_readiness: "AI agents",
};

function colorForScore(score: number): string {
  if (score >= 75) {
    return COLORS.strong;
  }
  if (score >= 45) {
    return COLORS.watch;
  }
  return COLORS.weak;
}

export function ReadinessChart({
  domains,
}: {
  domains: PublicDomainScore[];
}) {
  const data = domains.map((domain) => ({
    name: SHORT_LABELS[domain.id],
    score: domain.score,
  }));

  return (
    <div
      className="readiness-chart"
      role="img"
      aria-label="Readiness scores across seven evidence domains"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 20, bottom: 8, left: 10 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--rule)"
            strokeDasharray="2 6"
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={100}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--ink)", fontSize: 12, fontWeight: 650 }}
          />
          <Tooltip
            cursor={{ fill: "var(--paper-deep)", opacity: 0.55 }}
            contentStyle={{
              background: "var(--ink)",
              border: "none",
              borderRadius: 0,
              color: "var(--paper)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--paper)", fontWeight: 700 }}
            formatter={(value) => [`${value}/100`, "Readiness"]}
          />
          <Bar dataKey="score" radius={0} barSize={18}>
            {data.map((item) => (
              <Cell key={item.name} fill={colorForScore(item.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

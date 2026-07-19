"use client";

import {
  ArrowUpRight,
  ChevronDown,
  GitFork,
} from "lucide-react";
import { FormEvent, useRef, useState } from "react";

import {
  safeParseAnalysisReport,
  type AnalysisReport,
  type DataSensitivity,
  type GrowthTarget,
  type ScanContext,
  type Stage,
} from "@/lib/report/contract";
import styles from "./intake.module.css";
import { IntakeError, ScanProgress } from "./intake-status";

const DEFAULT_CONTEXT: ScanContext = {
  stage: "unknown",
  dataSensitivity: "unknown",
  growthTarget: "unknown",
};

const STAGE_OPTIONS: Array<{ value: Stage; label: string }> = [
  { value: "prototype", label: "Prototype" },
  { value: "live_early", label: "Live, early product" },
  { value: "scaling_production", label: "Scaling or production" },
  { value: "unknown", label: "I don't know" },
  { value: "withheld", label: "Prefer not to say" },
];

const DATA_OPTIONS: Array<{ value: DataSensitivity; label: string }> = [
  { value: "none", label: "No personal data" },
  { value: "basic_personal", label: "Basic account or customer data" },
  { value: "sensitive_regulated", label: "Sensitive or regulated data" },
  { value: "unknown", label: "I don't know" },
  { value: "withheld", label: "Prefer not to say" },
];

const GROWTH_OPTIONS: Array<{ value: GrowthTarget; label: string }> = [
  { value: "users_10x", label: "10x more users" },
  { value: "users_100x", label: "100x more users" },
  { value: "engineering_team", label: "A larger engineering team" },
  {
    value: "users_and_team",
    label: "Both users and engineering team",
  },
  { value: "unknown", label: "I don't know" },
  { value: "withheld", label: "Prefer not to say" },
];

function Question<T extends string>({
  id,
  number,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  number: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="question" htmlFor={id}>
      <span className="question-number">{number}</span>
      <span className="question-copy">{label}</span>
      <span className="select-shell">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" size={15} />
      </span>
    </label>
  );
}

export function Intake({
  onReport,
}: {
  onReport: (report: AnalysisReport) => void;
}) {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [context, setContext] = useState<ScanContext>(DEFAULT_CONTEXT);
  const [isLoading, setIsLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);

  async function runAnalysis(source: "github" | "demo"): Promise<void> {
    const controller = new AbortController();
    abortController.current = controller;
    setIsLoading(true);
    setStartedAt(Date.now());
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          repositoryUrl:
            source === "github" ? repositoryUrl.trim() : undefined,
          context,
        }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : "The scan could not be completed.",
        );
      }
      const parsed = safeParseAnalysisReport(payload);
      if (!parsed.success) {
        throw new Error(
          "This report uses an incompatible or invalid schema. Start a new scan after refreshing Scaleproof.",
        );
      }
      onReport(parsed.data);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The scan could not be completed.",
      );
    } finally {
      abortController.current = null;
      setIsLoading(false);
      setStartedAt(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runAnalysis("github");
  }

  return (
    <section
      className={`${styles.root} intake-panel`}
      aria-labelledby="intake-title"
    >
      <div className="intake-heading">
        <span>Repository intake</span>
        <span>Public GitHub only</span>
      </div>
      <div className="intake-body">
        <div className="panel-index" aria-hidden="true">
          01
        </div>
        <h2 id="intake-title">Open the technical dossier.</h2>
        <p className="intake-intro">
          Add one public repository. Three optional answers improve the
          prioritization, not the evidence.
        </p>

        <form onSubmit={submit}>
          <label className="repo-label" htmlFor="repository-url">
            <GitFork aria-hidden="true" size={17} />
            Public repository URL
          </label>
          <div className="repo-row">
            <input
              id="repository-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              required
              disabled={isLoading}
            />
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "Scanning" : "Analyze"}
              <ArrowUpRight aria-hidden="true" size={17} />
            </button>
          </div>
          <p className="public-repository-warning">
            Public repositories only. Do not submit code that should not already
            be public.
          </p>

          <div className="questions">
            <Question
              id="product-stage"
              number="A"
              label="What stage is the product at?"
              value={context.stage}
              options={STAGE_OPTIONS}
              onChange={(stage) =>
                setContext((current) => ({ ...current, stage }))
              }
            />
            <Question
              id="data-sensitivity"
              number="B"
              label="What kind of data does it handle?"
              value={context.dataSensitivity}
              options={DATA_OPTIONS}
              onChange={(dataSensitivity) =>
                setContext((current) => ({ ...current, dataSensitivity }))
              }
            />
            <Question
              id="growth-target"
              number="C"
              label="What growth are you preparing for?"
              value={context.growthTarget}
              options={GROWTH_OPTIONS}
              onChange={(growthTarget) =>
                setContext((current) => ({ ...current, growthTarget }))
              }
            />
          </div>

          {isLoading && (
            <ScanProgress
              startedAt={startedAt}
              onCancel={() => abortController.current?.abort()}
            />
          )}

          {error && <IntakeError message={error} />}
        </form>

        <div className="demo-row">
          <span>Need a known baseline?</span>
          <button
            type="button"
            className="text-button"
            disabled={isLoading}
            onClick={() => void runAnalysis("demo")}
          >
            Run the synthetic demo
            <ArrowUpRight aria-hidden="true" size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

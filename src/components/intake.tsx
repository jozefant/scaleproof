"use client";

import {
  ArrowUpRight,
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
import { JourneyRail } from "./journey-rail";

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

function responseError(payload: unknown): Error {
  return new Error(
    typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
      ? payload.error
      : "The scan could not be completed.",
  );
}

async function readAnalysisResponse(
  response: Response,
  onRetry: (attempt: number, maxAttempts: number) => void,
): Promise<unknown> {
  if (
    !response.headers
      .get("content-type")
      ?.includes("application/x-ndjson")
  ) {
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw responseError(payload);
    }
    return payload;
  }
  if (!response.body) {
    throw new Error("The scan progress stream was unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let report: unknown;

  const consumeLine = (line: string): void => {
    if (!line.trim()) {
      return;
    }
    const event: unknown = JSON.parse(line);
    if (typeof event !== "object" || event === null || !("type" in event)) {
      throw new Error("The scan returned an invalid progress event.");
    }
    if (
      event.type === "synthesis_retry" &&
      "attempt" in event &&
      typeof event.attempt === "number" &&
      "maxAttempts" in event &&
      typeof event.maxAttempts === "number"
    ) {
      onRetry(event.attempt, event.maxAttempts);
      return;
    }
    if (event.type === "report" && "report" in event) {
      report = event.report;
      return;
    }
    if (event.type === "error") {
      throw responseError(event);
    }
    throw new Error("The scan returned an unsupported progress event.");
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consumeLine);
    if (done) {
      break;
    }
  }
  consumeLine(buffer);
  if (report === undefined) {
    throw new Error("The scan ended before a report was completed.");
  }
  return report;
}

function Question<T extends string>({
  id,
  number,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  number: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="question" disabled={disabled}>
      <legend>
        <span className="question-number">{number}</span>
        <span className="question-copy">{label}</span>
        <span className="question-optional">Optional</span>
      </legend>
      <div className="choice-grid">
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <label className="choice-card" htmlFor={optionId} key={option.value}>
              <input
                id={optionId}
                name={id}
                type="radio"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <span className="choice-indicator" aria-hidden="true" />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
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
  const [synthesisRetry, setSynthesisRetry] = useState<{
    attempt: number;
    maxAttempts: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);

  async function runAnalysis(source: "github" | "demo"): Promise<void> {
    const controller = new AbortController();
    abortController.current = controller;
    setIsLoading(true);
    setStartedAt(Date.now());
    setSynthesisRetry(null);
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source,
          repositoryUrl:
            source === "github" ? repositoryUrl.trim() : undefined,
          context,
        }),
        signal: controller.signal,
      });
      const payload = await readAnalysisResponse(
        response,
        (attempt, maxAttempts) =>
          setSynthesisRetry({ attempt, maxAttempts }),
      );
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
      setSynthesisRetry(null);
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
        <span>Start a readiness snapshot</span>
        <span>Public GitHub repository</span>
      </div>
      <div className="intake-body">
        <JourneyRail state={isLoading ? "scanning" : "intake"} />
        <h2 id="intake-title">Start with the code you already have.</h2>
        <p className="intake-intro">
          Add one public repository. The context is optional and changes action
          priority, never the evidence.
        </p>

        <form onSubmit={submit}>
          <div className="repo-field">
            <label className="repo-label" htmlFor="repository-url">
              <GitFork aria-hidden="true" size={17} />
              Public repository URL
            </label>
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
          </div>
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? "Scanning" : "Analyze"}
            <ArrowUpRight aria-hidden="true" size={17} />
          </button>
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
              disabled={isLoading}
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
              disabled={isLoading}
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
              disabled={isLoading}
              onChange={(growthTarget) =>
                setContext((current) => ({ ...current, growthTarget }))
              }
            />
          </div>
          {isLoading && (
            <ScanProgress
              startedAt={startedAt}
              synthesisRetry={synthesisRetry}
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

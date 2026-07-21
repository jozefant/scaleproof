export type ExternalServiceProvider = "github" | "openai";

export type ExternalServiceOperation =
  | "action_prioritization"
  | "archive_download"
  | "commit_history"
  | "repository_metadata";

export type HttpStatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "none";

export type ExternalServiceErrorCode =
  | "authentication"
  | "cancelled"
  | "configuration_missing_OPENAI_API_KEY"
  | "invalid_response"
  | "malformed_output"
  | "none"
  | "not_found"
  | "provider_5xx"
  | "rate_limited"
  | "rejected_priorities"
  | "timeout"
  | "transport_failure";

export type RetryDecision =
  | "cancelled"
  | "completed_after_retry"
  | "deadline_exceeded"
  | "not_retried"
  | "not_needed"
  | "retry_exhausted";

export interface ExternalServiceEvent {
  correlationId: string;
  provider: ExternalServiceProvider;
  operation: ExternalServiceOperation;
  attempt: number;
  durationMs: number;
  outcome: "cancelled" | "failure" | "success";
  statusClass: HttpStatusClass;
  providerErrorCode: ExternalServiceErrorCode;
  retryDecision: RetryDecision;
}

export interface ExternalServiceDiagnostics {
  readonly correlationId: string;
  terminal(event: Omit<ExternalServiceEvent, "correlationId">): void;
}

type ExternalServiceLogWriter = (event: ExternalServiceEvent) => void;

function writeExternalServiceEvent(event: ExternalServiceEvent): void {
  // Serialize only the allowlisted event contract; never pass an Error,
  // request, response, or provider object to the logger.
  const serialized = JSON.stringify(event);
  if (event.outcome === "success") {
    console.info(serialized);
  } else if (event.outcome === "cancelled") {
    console.warn(serialized);
  } else {
    console.error(serialized);
  }
}

export function createExternalServiceDiagnostics(
  correlationId = crypto.randomUUID(),
  write: ExternalServiceLogWriter = writeExternalServiceEvent,
): ExternalServiceDiagnostics {
  return {
    correlationId,
    terminal(event) {
      write({ correlationId, ...event });
    },
  };
}

export function httpStatusClass(status: number | null): HttpStatusClass {
  if (status === null || !Number.isInteger(status) || status < 100 || status > 599) {
    return "none";
  }
  return `${Math.floor(status / 100)}xx` as HttpStatusClass;
}

export function statusFromError(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.status ?? candidate.response?.status;
  return typeof status === "number" ? status : null;
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

export function errorCodeForHttpStatus(
  status: number | null,
): ExternalServiceErrorCode {
  if (status === 401) {
    return "authentication";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status !== null && status >= 500) {
    return "provider_5xx";
  }
  return "invalid_response";
}

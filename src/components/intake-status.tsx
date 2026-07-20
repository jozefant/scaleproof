import { AlertTriangle, Ban } from "lucide-react";

export function ScanProgress({
  startedAt,
  synthesisRetry,
  onCancel,
}: {
  startedAt: number | null;
  synthesisRetry: { attempt: number; maxAttempts: number } | null;
  onCancel: () => void;
}) {
  return (
    <div className="scan-progress" aria-live="polite">
      <div>
        <span>
          {synthesisRetry
            ? `OpenAI retry ${synthesisRetry.attempt} of ${synthesisRetry.maxAttempts}`
            : "Scanning repository"}
        </span>
        <small>
          {synthesisRetry
            ? "Repository scan complete · retrying mandatory action prioritization"
            : "Indeterminate progress · 90-second analysis limit"}
          {startedAt
            ? ` · started ${new Date(startedAt).toLocaleTimeString("en-GB")}`
            : ""}
        </small>
      </div>
      <button type="button" className="cancel-button" onClick={onCancel}>
        <Ban aria-hidden="true" size={15} />
        Cancel scan
      </button>
    </div>
  );
}

export function IntakeError({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      <AlertTriangle aria-hidden="true" size={17} />
      <span>{message}</span>
    </div>
  );
}

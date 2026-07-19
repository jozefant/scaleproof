import { AlertTriangle, Ban } from "lucide-react";

export function ScanProgress({
  startedAt,
  onCancel,
}: {
  startedAt: number | null;
  onCancel: () => void;
}) {
  return (
    <div className="scan-progress" aria-live="polite">
      <div>
        <span>Scanning repository</span>
        <small>
          Indeterminate progress · 90-second analysis limit
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

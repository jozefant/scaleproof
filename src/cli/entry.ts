/**
 * Scaleproof CLI bundle entry point.
 *
 * Purpose: the only module esbuild bundles into `cli/dist/scaleproof.mjs`. It
 * is a thin process wrapper around `runCli`: it wires real stdio, the process
 * environment, and SIGINT cancellation, then sets the exit code.
 *
 * Usage: not imported by application code. `scripts/build-cli.mjs` bundles it;
 * `cli/bin/scaleproof.mjs` executes the bundle.
 *
 * Cancellation: the first SIGINT aborts the scan so the acquisition layer can
 * delete its temporary directory. A second SIGINT exits immediately.
 */

import { EXIT_CANCELLED, EXIT_FAILURE, runCli } from "@/cli/main";

async function main(): Promise<void> {
  const controller = new AbortController();
  let interrupted = false;

  const onInterrupt = (): void => {
    if (interrupted) {
      // The operator asked twice. Stop without waiting for cleanup.
      process.exit(EXIT_CANCELLED);
    }
    interrupted = true;
    controller.abort(
      new DOMException("The repository scan was cancelled.", "AbortError"),
    );
  };

  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);

  try {
    process.exitCode = await runCli(process.argv.slice(2), {
      signal: controller.signal,
    });
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
  }
}

void main().catch(() => {
  // runCli already converts every expected failure into an exit code. This
  // guard only covers a wiring fault and must not print internal detail.
  process.stderr.write(
    "scaleproof: the command could not start. No repository content was retained.\n",
  );
  process.exitCode = EXIT_FAILURE;
});

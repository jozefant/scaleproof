/**
 * CLI error types.
 *
 * Purpose: give the CLI a single structured error class for caller mistakes
 * and missing prerequisites, without creating an import cycle between the
 * command surface and the modules it calls.
 *
 * Usage: throw `CliUsageError` for anything the operator can fix by changing
 * the invocation or the environment. `runCli` maps it to exit code 2.
 */

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

/**
 * CLI version constant.
 *
 * Purpose: expose the published `cli/package.json` version to the CLI adapter
 * without reading a manifest at runtime. `scripts/build-cli.mjs` replaces the
 * `__SCALEPROOF_CLI_VERSION__` identifier with a string literal through the
 * esbuild `define` option, so the bundle carries no filesystem lookup.
 *
 * Usage: import `CLI_VERSION`. Outside the bundle (Vitest, tsx, ts-node) the
 * identifier is undeclared at runtime and the development placeholder is used.
 */

declare const __SCALEPROOF_CLI_VERSION__: string | undefined;

export const DEVELOPMENT_VERSION = "0.0.0-dev";

export const CLI_VERSION: string =
  typeof __SCALEPROOF_CLI_VERSION__ === "string" &&
  __SCALEPROOF_CLI_VERSION__.length > 0
    ? __SCALEPROOF_CLI_VERSION__
    : DEVELOPMENT_VERSION;

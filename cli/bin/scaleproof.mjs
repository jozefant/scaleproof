#!/usr/bin/env node
/**
 * Scaleproof CLI launcher.
 *
 * Purpose: the published `scaleproof` executable. It checks the Node.js
 * baseline and then loads the self-contained bundle. It contains no
 * application logic, performs no install-time work, and makes no network
 * request of its own.
 *
 * Usage:
 *   scaleproof https://github.com/owner/repository
 *   scaleproof --help
 */

const REQUIRED_NODE = { major: 22, minor: 11 };
const USAGE_EXIT = 2;

const [major, minor] = process.versions.node.split(".").map(Number);
if (
  !Number.isInteger(major) ||
  major < REQUIRED_NODE.major ||
  (major === REQUIRED_NODE.major && minor < REQUIRED_NODE.minor)
) {
  process.stderr.write(
    `scaleproof: Node.js ${REQUIRED_NODE.major}.${REQUIRED_NODE.minor} or newer is required; found ${process.versions.node}.\n`,
  );
  process.exit(USAGE_EXIT);
}

try {
  await import("../dist/scaleproof.mjs");
} catch (error) {
  process.stderr.write(
    "scaleproof: the command bundle could not be loaded. Reinstall the package.\n",
  );
  if (process.env.SCALEPROOF_DEBUG === "1" && error instanceof Error) {
    process.stderr.write(`scaleproof: ${error.message}\n`);
  }
  process.exit(USAGE_EXIT);
}

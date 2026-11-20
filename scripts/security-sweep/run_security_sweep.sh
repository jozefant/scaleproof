#!/bin/zsh
# run_security_sweep.sh - weekly security sweep for jozefant/scaleproof (macOS launchd entry point).
#
# Purpose: run a headless Claude Code agent on a dedicated clone of the repository.
# The agent asks Codex to review open Dependabot pull requests. It also fixes open
# critical and high GitHub security alerts in a maximum of 5 fix-and-verify rounds,
# and opens one pull request. The agent never merges.
#
# The agent instructions are prompt.md in the dedicated clone at origin/main.
# Only a reviewed and merged prompt runs. A local edit to prompt.md has no effect.
#
# State (clone, logs, lock) is outside this repository, so that the repository
# tools (tsc, eslint) do not scan a second copy of the code:
#   ~/Library/Caches/scaleproof-security-sweep/{work,output,.lock}
#
# Prerequisites:
#   - ANTHROPIC_API_KEY exported in ~/.zshrc. The `--bare` flag makes Claude Code
#     use only this key; it does not read a subscription login.
#   - nvm loaded by ~/.zshrc, and the Node.js version from .nvmrc installed.
#   - claude and gh on PATH after ~/.zshrc. gh logged in as the repository owner.
#
# Install (weekly, Monday 08:00 local time): create
# ~/Library/LaunchAgents/com.antony.scaleproof-security-sweep.plist with
# ProgramArguments = [/bin/zsh, <absolute path to this script>], StartCalendarInterval =
# {Weekday 1, Hour 8, Minute 0}, and StandardOutPath/StandardErrorPath =
# ~/Library/Caches/scaleproof-security-sweep/output/launchd.log (absolute path). Then:
#   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.antony.scaleproof-security-sweep.plist
#
# Run now:   launchctl kickstart gui/$(id -u)/com.antony.scaleproof-security-sweep
# Manual:    scripts/security-sweep/run_security_sweep.sh
# Test an unmerged prompt (manual runs only):
#            SWEEP_PROMPT_FILE=scripts/security-sweep/prompt.md scripts/security-sweep/run_security_sweep.sh

source ~/.zshrc >/dev/null 2>&1 || true

STATE_DIR="$HOME/Library/Caches/scaleproof-security-sweep"
WORK_DIR="$STATE_DIR/work/scaleproof"
OUT_DIR="$STATE_DIR/output"
LOCK_DIR="$STATE_DIR/.lock"
REPO="jozefant/scaleproof"
MODEL="claude-opus-5-5"
MAX_TURNS=300
# The time limit stops a stuck run before the next weekly run starts.
TIME_LIMIT=4h

# A manual test may name a prompt file. Resolve it before the script changes directory.
PROMPT_OVERRIDE="${SWEEP_PROMPT_FILE:+${SWEEP_PROMPT_FILE:A}}"

mkdir -p "$OUT_DIR" "$STATE_DIR/work"
LOG="$OUT_DIR/sweep_$(date '+%Y-%m-%d_%H%M%S').jsonl"

echo "=== security sweep started $(date '+%Y-%m-%d %H:%M:%S') ==="

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "ERROR: another sweep is running ($LOCK_DIR exists). Exit."
  exit 1
fi
trap 'rmdir "$LOCK_DIR"' EXIT

for tool in git gh claude timeout; do
  command -v "$tool" >/dev/null || { echo "ERROR: $tool is not on PATH. Exit."; exit 1; }
done

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set. Exit."
  exit 1
fi

# Pin the GitHub account, so that a `gh auth switch` elsewhere does not change the job.
GH_TOKEN="$(gh auth token --user "${REPO%%/*}" 2>/dev/null)"
if [[ -z "$GH_TOKEN" ]]; then
  echo "ERROR: no gh token for account ${REPO%%/*}. Run: gh auth login. Exit."
  exit 1
fi
export GH_TOKEN

# The clone belongs only to this job, so a hard reset cannot lose user work.
if [[ ! -d "$WORK_DIR/.git" ]]; then
  git clone --quiet "https://github.com/$REPO.git" "$WORK_DIR" || { echo "ERROR: clone failed. Exit."; exit 1; }
fi
cd "$WORK_DIR" || exit 1
git fetch --quiet --prune origin || { echo "ERROR: git fetch failed. Exit."; exit 1; }
git checkout --quiet --force main && git reset --quiet --hard origin/main && git clean -fdq
echo "repo at $(git rev-parse --short HEAD); log: $LOG"

if typeset -f nvm >/dev/null; then
  nvm use --silent >/dev/null 2>&1 || { echo "ERROR: the Node.js version in .nvmrc is not installed. Exit."; exit 1; }
fi
command -v node >/dev/null || { echo "ERROR: node is not on PATH. Exit."; exit 1; }

PROMPT_FILE="${PROMPT_OVERRIDE:-$WORK_DIR/scripts/security-sweep/prompt.md}"
if [[ ! -s "$PROMPT_FILE" ]]; then
  echo "ERROR: prompt file not found: $PROMPT_FILE. Exit."
  exit 1
fi
echo "node $(node -v); prompt: $PROMPT_FILE"

timeout "$TIME_LIMIT" claude -p "$(cat "$PROMPT_FILE")" \
  --bare \
  --model "$MODEL" \
  --max-turns "$MAX_TURNS" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Edit" "Write" "Glob" "Grep" \
    "Bash(git:*)" "Bash(gh:*)" "Bash(npm:*)" "Bash(npx:*)" "Bash(node:*)" \
    "Bash(cat:*)" "Bash(ls:*)" "Bash(grep:*)" "Bash(rg:*)" "Bash(sed:*)" "Bash(head:*)" \
    "Bash(tail:*)" "Bash(jq:*)" "Bash(find:*)" "Bash(wc:*)" "Bash(diff:*)" "Bash(date:*)" \
  --output-format stream-json --verbose \
  > "$LOG" 2>&1
rc=$?

# The text output format can be empty. The stream-json transcript always keeps the final result.
jq -r 'select(.type == "result") | "result: \(.subtype), turns: \(.num_turns), cost_usd: \(.total_cost_usd)\n\(.result)"' \
  "$LOG" 2>/dev/null || tail -n 20 "$LOG"

echo "=== security sweep finished $(date '+%Y-%m-%d %H:%M:%S') (exit $rc) ==="
exit $rc

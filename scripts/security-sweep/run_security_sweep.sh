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

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

# STATE_DIR: the root folder for all job state. It is outside the repository,
# because tsc and eslint scan the whole repository tree. A clone inside the
# repository would make `npm run verify` check a second copy of the code.
STATE_DIR="$HOME/Library/Caches/scaleproof-security-sweep"

# WORK_DIR: a clone that only this job uses. Each run resets it to origin/main.
# The agent works here, so it never touches the owner's working copy.
WORK_DIR="$STATE_DIR/work/scaleproof"

# OUT_DIR: one sweep_<timestamp>.jsonl transcript per run, plus launchd.log.
OUT_DIR="$STATE_DIR/output"

# LOCK_DIR: exists while a run is active. It stops a second run, for example a
# manual kickstart during a scheduled run, from using the same clone.
LOCK_DIR="$STATE_DIR/.lock"

# REPO: the GitHub repository. The owner part also selects the gh account.
REPO="jozefant/scaleproof"

# MODEL: the Claude model for the agent. A fix that must pass `npm run verify`
# needs a strong model; a weaker model uses more rounds and more turns.
MODEL="claude-opus-5-5"

# MAX_TURNS: the maximum number of agent steps in one run. One step is one
# model answer plus one tool call (a git command, a file edit, a test run).
# A normal run uses about 6 steps; 5 fix rounds use an estimated 150-250.
# At the limit, the run ends with `error_max_turns` in launchd.log.
MAX_TURNS=300

# MAX_BUDGET_USD: the maximum API cost of one run, in US dollars. The job bills
# the ANTHROPIC_API_KEY, and MAX_TURNS does not limit cost, because each step
# costs more as the conversation grows. Claude Code checks the budget after
# each step, so a run can end slightly above this amount. At the limit, the
# run ends with `error_max_budget_usd` in launchd.log.
MAX_BUDGET_USD=10

# TIME_LIMIT: the maximum wall-clock time of one run. It stops a stuck command,
# for example a hung test, which uses no steps and no budget.
TIME_LIMIT=4h

# SWEEP_PROMPT_FILE (optional environment variable, manual runs only): a path
# to a prompt file to use instead of the merged prompt. Without it, the job
# reads prompt.md from WORK_DIR at origin/main, so only a reviewed prompt runs.
# Use it to test a prompt change before its pull request merges. The path is
# made absolute here, because the script changes directory later.
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

# The agent run. Flags:
#   -p                  headless mode: run the prompt, then exit (no interactive session).
#   --bare              use only ANTHROPIC_API_KEY; skip the subscription login, personal
#                       hooks, memory, CLAUDE.md files, and commit attribution. The run then
#                       depends only on this repository and the prompt.
#   --permission-mode acceptEdits
#                       allow file edits without a person to approve them.
#   --allowedTools      the only tools the agent may use. Bash is limited to git, gh, npm,
#                       npx, node, and read-only shell commands. Other commands are refused.
#   --output-format stream-json --verbose
#                       write every step to the log. The default text output can be empty,
#                       and then a failed run leaves no evidence.
timeout "$TIME_LIMIT" claude -p "$(cat "$PROMPT_FILE")" \
  --bare \
  --model "$MODEL" \
  --max-turns "$MAX_TURNS" \
  --max-budget-usd "$MAX_BUDGET_USD" \
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

#!/bin/bash
# The CoS assigns work to a Manager: runs ONE non-interactive agent session in the project repo,
# with a fixed list of allowed and forbidden commands.
#
# Usage: assign.sh <repo-dir> <prompt-file> <log-file>
#   WT=<worktree path> assign.sh ...   → run in a separate worktree (2 Managers in parallel in the same repo)
#   MODEL=<model name> assign.sh ...          → change the model (default: the CLI's default model)
#
# THIS IS A TEMPLATE. It is written for Claude Code (`claude -p`); for another tool change the last `exec` line.
# Before using it, edit the two lists ALLOW and DENY to match your project's stack.
set -euo pipefail
DIR="$1"; PROMPT_FILE="$2"; LOG="$3"
[ -d "$DIR" ] || { echo "repo directory not found: $DIR" >&2; exit 2; }
[ -f "$PROMPT_FILE" ] || { echo "prompt not found: $PROMPT_FILE" >&2; exit 2; }

# Allowed: read, edit files, call Workers, git on its own branch, build/test/lint.
ALLOW=(Read Edit Write Agent
  "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(git branch:*)"
  "Bash(git switch -c:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(git ls-files:*)" "Bash(git restore:*)"
  "Bash(ls:*)" "Bash(grep:*)" "Bash(wc:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(mkdir -p:*)"
  "Bash(npm run build:*)" "Bash(npm run lint:*)" "Bash(npm run typecheck:*)" "Bash(npm test:*)"
  "Bash(npx tsc:*)" "Bash(npx vitest:*)" "Bash(npm install:*)")

# Forbidden: anything that takes code off the branch, deletes, changes directory, touches secrets, calls the network, deploys.
# For a clean room, also forbid WebSearch and WebFetch (the last two lines).
DENY=("Bash(git push:*)" "Bash(git merge:*)" "Bash(git reset:*)" "Bash(git rebase:*)" "Bash(git stash:*)"
  "Bash(git clean:*)" "Bash(git checkout:*)" "Bash(rm:*)" "Bash(cd:*)" "Bash(curl:*)"
  "Bash(npm run deploy:*)" "Bash(npx wrangler:*)" "Bash(wrangler:*)"
  WebSearch WebFetch)

# Only accept a worktree already present in the repo's `git worktree list`.
if [ -n "${WT:-}" ]; then
  git -C "$DIR" worktree list --porcelain | grep -qx "worktree $WT" || { echo "WT is not a worktree of $DIR: $WT" >&2; exit 2; }
  DIR="$WT"
fi
cd "$DIR"

MODEL_ARG=()
[ -n "${MODEL:-}" ] && MODEL_ARG=(--model "$MODEL")

exec claude -p "$(cat "$PROMPT_FILE")" ${MODEL_ARG[@]+"${MODEL_ARG[@]}"} \
  --allowedTools "${ALLOW[@]}" --disallowedTools "${DENY[@]}" < /dev/null > "$LOG" 2>&1

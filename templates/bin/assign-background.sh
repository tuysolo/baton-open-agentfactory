#!/bin/bash
# Runs assign.sh FULLY DETACHED from the CoS session, so the Manager does not die when the CoS session closes
# or when the CoS session's background command is cut off for running too long.
#
# Usage: [WT=<worktree>] [MODEL=<model>] assign-background.sh <repo-dir> <prompt-file> <log-file>
# When done it writes the exit code to <log-file>.xong — the CoS watches this file with wait-done.sh.
#
# Note: exit code 0 does NOT mean the work is done. The CoS must still read the report,
# the reviewer's last-round verdict and `git status` before the acceptance check.
set -euo pipefail
B="$(cd "$(dirname "$0")" && pwd)"
LOG="$3"
rm -f "$LOG.xong"
# perl setsid: move to a separate session and process group.
nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' bash -c '"$@"; echo "$?" > "${@: -1}.xong"' _ \
  "$B/assign.sh" "$1" "$2" "$3" > /dev/null 2>&1 &
disown
echo "started in the background (pid $!) → log $LOG, done when $LOG.xong exists"

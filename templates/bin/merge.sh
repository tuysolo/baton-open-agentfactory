#!/bin/bash
# The CoS merges a worker branch into the main branch (fast-forward ONLY) then pushes. No force.
#
# Usage: merge.sh <repo-dir> <branch>        (the main branch defaults to main; change it with NHANH_CHINH=<name>)
# Only run when: the reviewer's last round is PASS, the CoS has checked by itself, and no Manager is running in this directory.
set -euo pipefail
REPO="$1"; BR="$2"; MAIN="${NHANH_CHINH:-main}"
case "$BR" in worker/*) ;; *) echo "only worker/* branches are merged" >&2; exit 2;; esac
cd "$REPO"
[ -z "$(git status --porcelain)" ] || { echo "working directory is not clean, stopping" >&2; exit 2; }
git fetch -q origin "$MAIN" || true
git checkout -q "$MAIN"
git merge --ff-only "$BR"
git push origin "$MAIN"
git log --oneline -1

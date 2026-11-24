#!/bin/bash
# CoS merge nhánh worker vào nhánh chính (CHỈ fast-forward) rồi push. Không force.
#
# Dùng: merge.sh <thư-mục-repo> <nhánh>        (nhánh chính mặc định là main; đổi bằng NHANH_CHINH=<tên>)
# Chỉ chạy khi: reviewer lượt cuối ĐẠT, CoS đã tự kiểm, và không Manager nào đang chạy trong thư mục này.
set -euo pipefail
REPO="$1"; BR="$2"; CHINH="${NHANH_CHINH:-main}"
case "$BR" in worker/*) ;; *) echo "chỉ merge nhánh worker/*" >&2; exit 2;; esac
cd "$REPO"
[ -z "$(git status --porcelain)" ] || { echo "thư mục làm việc chưa sạch, dừng" >&2; exit 2; }
git fetch -q origin "$CHINH" || true
git checkout -q "$CHINH"
git merge --ff-only "$BR"
git push origin "$CHINH"
git log --oneline -1

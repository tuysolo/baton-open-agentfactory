#!/bin/bash
# CoS giao việc cho Manager: chạy MỘT phiên agent không tương tác trong repo dự án,
# với danh sách lệnh được phép và bị cấm cố định.
#
# Dùng: giao-viec.sh <thư-mục-repo> <file-prompt> <file-log>
#   WT=<đường dẫn worktree> giao-viec.sh ...   → chạy trong worktree riêng (2 Manager song song cùng repo)
#   MODEL=<tên model> giao-viec.sh ...          → đổi model (mặc định: model mặc định của CLI)
#
# ĐÂY LÀ MẪU. Nó viết cho Claude Code (`claude -p`); dùng công cụ khác thì đổi dòng `exec` cuối.
# Trước khi dùng, sửa hai danh sách ALLOW và DENY cho khớp stack của dự án bạn.
set -euo pipefail
DIR="$1"; PROMPT_FILE="$2"; LOG="$3"
[ -d "$DIR" ] || { echo "không thấy thư mục repo: $DIR" >&2; exit 2; }
[ -f "$PROMPT_FILE" ] || { echo "không thấy prompt: $PROMPT_FILE" >&2; exit 2; }

# Được phép: đọc, sửa file, gọi Worker, git trên nhánh của mình, build/test/lint.
ALLOW=(Read Edit Write Agent
  "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(git branch:*)"
  "Bash(git switch -c:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(git ls-files:*)" "Bash(git restore:*)"
  "Bash(ls:*)" "Bash(grep:*)" "Bash(wc:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(mkdir -p:*)"
  "Bash(npm run build:*)" "Bash(npm run lint:*)" "Bash(npm run typecheck:*)" "Bash(npm test:*)"
  "Bash(npx tsc:*)" "Bash(npx vitest:*)" "Bash(npm install:*)")

# Bị cấm: mọi thứ đưa code ra khỏi nhánh, xoá, đổi thư mục, đụng secret, gọi mạng, deploy.
# Phòng sạch thì cấm luôn WebSearch và WebFetch (hai dòng cuối).
DENY=("Bash(git push:*)" "Bash(git merge:*)" "Bash(git reset:*)" "Bash(git rebase:*)" "Bash(git stash:*)"
  "Bash(git clean:*)" "Bash(git checkout:*)" "Bash(rm:*)" "Bash(cd:*)" "Bash(curl:*)"
  "Bash(npm run deploy:*)" "Bash(npx wrangler:*)" "Bash(wrangler:*)"
  WebSearch WebFetch)

# Chỉ nhận worktree đã có trong `git worktree list` của repo.
if [ -n "${WT:-}" ]; then
  git -C "$DIR" worktree list --porcelain | grep -qx "worktree $WT" || { echo "WT không phải worktree của $DIR: $WT" >&2; exit 2; }
  DIR="$WT"
fi
cd "$DIR"

MODEL_ARG=()
[ -n "${MODEL:-}" ] && MODEL_ARG=(--model "$MODEL")

exec claude -p "$(cat "$PROMPT_FILE")" ${MODEL_ARG[@]+"${MODEL_ARG[@]}"} \
  --allowedTools "${ALLOW[@]}" --disallowedTools "${DENY[@]}" < /dev/null > "$LOG" 2>&1

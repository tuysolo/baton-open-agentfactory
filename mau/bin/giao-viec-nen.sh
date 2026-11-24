#!/bin/bash
# Chạy giao-viec.sh TÁCH HẲN khỏi phiên CoS, để Manager không chết theo khi phiên CoS đóng
# hay khi lệnh nền của phiên CoS bị cắt vì quá giờ.
#
# Dùng: [WT=<worktree>] [MODEL=<model>] giao-viec-nen.sh <thư-mục-repo> <file-prompt> <file-log>
# Khi xong ghi mã thoát vào <file-log>.xong — CoS theo dõi file này bằng cho-xong.sh.
#
# Lưu ý: mã thoát 0 KHÔNG có nghĩa là việc đã xong. CoS vẫn phải đọc báo cáo,
# kết luận reviewer lượt cuối và `git status` trước khi nghiệm thu.
set -euo pipefail
B="$(cd "$(dirname "$0")" && pwd)"
LOG="$3"
rm -f "$LOG.xong"
# perl setsid: chuyển sang session và process group riêng.
nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' bash -c '"$@"; echo "$?" > "${@: -1}.xong"' _ \
  "$B/giao-viec.sh" "$1" "$2" "$3" > /dev/null 2>&1 &
disown
echo "đã chạy nền (pid $!) → log $LOG, xong khi có $LOG.xong"

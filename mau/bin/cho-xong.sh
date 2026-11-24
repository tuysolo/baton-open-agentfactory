#!/bin/bash
# Chờ các lượt Manager chạy nền xong, bằng MỘT lệnh đơn (CoS không phải viết vòng lặp trong lệnh gọi).
#
# Dùng: cho-xong.sh <file-log> [<file-log> ...]
# In "<log> xong, mã X" khi từng lượt xong; thoát khi tất cả xong.
[ $# -gt 0 ] || { echo "dùng: cho-xong.sh <file-log>..." >&2; exit 2; }
da=""
while :; do
  xong_het=1
  for log in "$@"; do
    f="$log.xong"
    if [ -f "$f" ]; then
      case " $da " in *" $log "*) ;; *) echo "$log xong, mã $(cat "$f")"; da="$da $log";; esac
    else
      xong_het=0
    fi
  done
  [ "$xong_het" = 1 ] && exit 0
  sleep 30
done

#!/bin/bash
# Waits for the Manager rounds running in the background to finish, with ONE single command (the CoS does not have to write a loop in the call).
#
# Usage: wait-done.sh <log-file> [<log-file> ...]
# Prints "<log> done, exit code X" as each round finishes; exits when all are done.
[ $# -gt 0 ] || { echo "usage: wait-done.sh <log-file>..." >&2; exit 2; }
seen=""
while :; do
  all_done=1
  for log in "$@"; do
    f="$log.xong"
    if [ -f "$f" ]; then
      case " $seen " in *" $log "*) ;; *) echo "$log done, exit code $(cat "$f")"; seen="$seen $log";; esac
    else
      all_done=0
    fi
  done
  [ "$all_done" = 1 ] && exit 0
  sleep 30
done

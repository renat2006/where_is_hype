#!/usr/bin/env bash
FARM=$(cd "$(dirname "$0")" && pwd)
tasks=("$@")
while true; do
  for t in "${tasks[@]}"; do
    pid=$(grep '^pid=' "$FARM/state/$t.env" 2>/dev/null | cut -d= -f2)
    if ! kill -0 "${pid:-0}" 2>/dev/null; then echo "$t finished at $(date '+%H:%M')"; grep -m1 '^Статус' "$FARM/reports/$t.md"; exit 0; fi
  done
  sleep 30
done

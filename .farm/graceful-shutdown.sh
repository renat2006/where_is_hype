#!/usr/bin/env bash
set -euo pipefail

FARM=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$FARM")
WORKTREES=.farm/worktrees
# shellcheck disable=SC1091
[ -f "$FARM/farm.env" ] && set -a && . "$FARM/farm.env" && set +a
case "$WORKTREES" in /*) ;; *) WORKTREES=$ROOT/$WORKTREES ;; esac
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups/$(basename "$ROOT")}
LOG=$FARM/logs/shutdown.log
mkdir -p "$BACKUP_DIR" "$FARM/logs"
echo "=== shutdown $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a "$LOG"

sudo systemctl stop hype-balancer 2>/dev/null || true
for wt in "$WORKTREES"/*; do
  [ -e "$wt/.git" ] || continue
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    echo "auto-save $(basename "$wt")" | tee -a "$LOG"
    git -C "$wt" add -A
    git -C "$wt" commit -qm "Auto-save before shutdown: $(basename "$wt")" || true
  fi
done

ts=$(date '+%Y%m%d-%H%M%S')
git -C "$ROOT" bundle create "$BACKUP_DIR/$(basename "$ROOT")-$ts.bundle" --all 2>&1 | tee -a "$LOG"
tar -czf "$BACKUP_DIR/farm-state-$ts.tgz" -C "$FARM" state reports 2>/dev/null || true
ls -lh "$BACKUP_DIR" | tail -5 | tee -a "$LOG"

if [ "${1:-}" = "--poweroff" ]; then sync; sudo /sbin/poweroff; fi

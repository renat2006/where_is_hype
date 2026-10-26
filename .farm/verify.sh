#!/usr/bin/env bash
set -uo pipefail

FARM=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$FARM")
WORKTREES=.farm/worktrees
BASE_BRANCH=main
LINT_CMD= TYPECHECK_CMD= TEST_CMD= BUILD_CMD= E2E_CMD= EXTRA_PATH=
# shellcheck disable=SC1091
[ -f "$FARM/farm.env" ] && set -a && . "$FARM/farm.env" && set +a
export PATH="${EXTRA_PATH:+$EXTRA_PATH:}$HOME/.local/bin:$PATH"
case "$WORKTREES" in /*) ;; *) WORKTREES=$ROOT/$WORKTREES ;; esac

task=${1:?task id}
export PORT=${2:-4790}
wt=$WORKTREES/$task
report=$FARM/reports/$task.md
out=$FARM/state/$task.verify
mkdir -p "$FARM/state" "$FARM/logs"
cd "$wt" || { echo "FAIL worktree $wt missing"; exit 1; }
base=$(git rev-parse -q --verify "origin/$BASE_BRANCH" >/dev/null && echo "origin/$BASE_BRANCH" || echo "$BASE_BRANCH")
fail=0

{
  echo "verify $task @ $(git rev-parse --short HEAD) $(date '+%d.%m %H:%M')"
  echo "commits ahead of $base: $(git rev-list --count "$base"..HEAD)"
  echo "uncommitted: $(git status --porcelain | wc -l | tr -d ' ')"
  git diff --stat "$base" | tail -1
} > "$out"

if [ -f "$report" ] && grep -qiE '^Статус:\s*(готово|done)' "$report"; then
  echo "PASS report (Статус: готово)" >> "$out"
else
  echo "FAIL report: нет $report со строкой «Статус: готово»" >> "$out"; fail=1
fi

step() {
  local name=$1 cmd=$2
  if [ -z "$cmd" ]; then echo "SKIP $name (не настроен в farm.env)" >> "$out"; return; fi
  if bash -c "$cmd" > "$FARM/logs/$task.verify-$name.log" 2>&1; then echo "PASS $name" >> "$out"
  else echo "FAIL $name (logs/$task.verify-$name.log)" >> "$out"; tail -40 "$FARM/logs/$task.verify-$name.log" | sed 's/^/    /' >> "$out"; fail=1; fi
}
step lint "$LINT_CMD"
step typecheck "$TYPECHECK_CMD"
step test "$TEST_CMD"
step build "$BUILD_CMD"
step e2e "$E2E_CMD"
cat "$out"
exit $fail

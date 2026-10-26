#!/usr/bin/env bash
set -euo pipefail

FARM=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$FARM")
WORKTREES=.farm/worktrees
REMOTE=origin
BASE_BRANCH=main
PROXY=
SETUP_CMD=
EXTRA_PATH=
# shellcheck disable=SC1091
[ -f "$FARM/farm.env" ] && set -a && . "$FARM/farm.env" && set +a
case "$WORKTREES" in /*) ;; *) WORKTREES=$ROOT/$WORKTREES ;; esac

export PATH="${EXTRA_PATH:+$EXTRA_PATH:}$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

agent=${1:?agent: agy-argon|agy-flash|codex-hi|claude}
task=${2:?task id, e.g. T01}
port=${3:?port}
base=${4:-$BASE_BRANCH}
spec=$FARM/tasks/$task.md
[ -f "$spec" ] || { echo "no spec $spec" >&2; exit 1; }

wt=$WORKTREES/$task
br=agents/$task
if [ ! -d "$wt" ]; then
  git -C "$ROOT" fetch -q "$REMOTE" || true
  start=$base
  git -C "$ROOT" rev-parse -q --verify "$REMOTE/$base" >/dev/null && start=$REMOTE/$base
  git -C "$ROOT" worktree prune || true
  git -C "$ROOT" branch -D "$br" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree add -q -b "$br" "$wt" "$start"
  if [ -n "$SETUP_CMD" ]; then (cd "$wt" && bash -c "$SETUP_CMD") >> "$FARM/logs/$task.setup.log" 2>&1 || true; fi
fi

report=$FARM/reports/$task.md
shots=$FARM/reports/$task-shots
feedback=$FARM/state/$task.feedback
mkdir -p "$shots" "$FARM/logs" "$FARM/prompts" "$FARM/state"
prompt=$FARM/prompts/$task.md
{
  cat "$FARM/PROTOCOL.md"
  printf '\n\n---\n\n# Задача\n\n'
  awk 'NR==1 && /^---$/ {fm=1; next} fm && /^---$/ {fm=0; next} !fm' "$spec"
  if [ -s "$feedback" ]; then
    printf '\n\n---\n\n# Замечания проверки (исправь и сдай заново)\n\nПрошлая сдача не прошла `verify.sh`. Вывод проверки:\n\n```\n'
    cat "$feedback"
    printf '\n```\n'
  fi
} | sed -e "s#{{WORKTREE}}#$wt#g" -e "s#{{BRANCH}}#$br#g" -e "s#{{BASE}}#$base#g" -e "s#{{PORT}}#$port#g" \
      -e "s#{{REPORT}}#$report#g" -e "s#{{SHOTS}}#$shots#g" -e "s#{{TASK}}#$task#g" \
      -e "s#{{ROOT}}#$ROOT#g" -e "s#{{FARM}}#$FARM#g" > "$prompt"
if [ ! -f "$report" ]; then
  sed -e "s#{{TASK}}#$task#g" "$FARM/templates/REPORT.md" > "$report"
elif [ -s "$feedback" ]; then
  sed -i -E 's/^(Статус:).*/\1 в работе/' "$report"
fi

log=$FARM/logs/$task.log
pidfile=$FARM/state/$task.pid
runner=$FARM/state/$task.run.sh
case "$agent" in
  agy-argon|agy-flash)
    amodel=gemini-4-argon-high; [ "$agent" = agy-flash ] && amodel=gemini-3.8-flash-high
    cmd="exec agy -p \"\$(cat $prompt)\" --model $amodel --dangerously-skip-permissions --add-dir $FARM --output-format stream-json < /dev/null"
    ;;
  codex-hi)
    cmd="exec codex exec -C $wt -m gpt-6.1-sol -c model_reasoning_effort=high -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir $FARM --add-dir $ROOT/.git --json -o $FARM/state/$task.last.md - < $prompt"
    ;;
  claude)
    cmd="exec claude -p --output-format stream-json --verbose --dangerously-skip-permissions --add-dir $FARM < $prompt"
    ;;
  *) echo "unknown agent $agent" >&2; exit 1 ;;
esac

if [ "$PROXY" = auto ]; then
  PROXY=
  nc -z 127.0.0.1 2080 >/dev/null 2>&1 && PROXY=127.0.0.1:2080
fi
proxy_block=
if [ -n "$PROXY" ]; then
  np=localhost,127.0.0.1,192.168.0.0/16
  proxy_block="export HTTP_PROXY=http://$PROXY HTTPS_PROXY=http://$PROXY ALL_PROXY=socks5h://$PROXY http_proxy=http://$PROXY https_proxy=http://$PROXY all_proxy=socks5h://$PROXY NO_PROXY=$np no_proxy=$np"
fi

cat > "$runner" <<EOF
#!/usr/bin/env bash
export PATH="$PATH"
$proxy_block
cd $wt || exit 1
echo \$\$ > $pidfile
$cmd >> $log 2>&1
EOF
chmod +x "$runner"
rm -f "$pidfile"
printf '\n===== %s start %s on %s (base %s)\n' "$task" "$(date '+%d.%m %H:%M')" "$agent" "$base" >> "$log"
nohup setsid bash "$runner" >/dev/null 2>&1 < /dev/null &
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$pidfile" ] && break; sleep 0.3; done
pid=$(cat "$pidfile" 2>/dev/null || echo "0")
printf "agent=%s\npid=%s\nport=%s\nbranch=%s\nworktree=%s\nstarted='%s'\n" "$agent" "$pid" "$port" "$br" "$wt" "$(date '+%d.%m %H:%M')" > "$FARM/state/$task.env"
echo "$task started: $agent pid=$pid port=$port branch=$br"

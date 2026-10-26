# Ферма агентов where_is_hype

Работает на ПК (`ssh pc`, `~/dev/where_is_hype/.farm`). Агенты — `agy` (Gemini 4 Argon / 3.8 Flash), `codex`, `claude`.
Каждая задача идёт в своей рабочей копии `.farm/worktrees/<ID>` на ветке `agents/<ID>`, по готовности
ветка пушится в GitHub через remote `github-hype` (deploy key только на эту репу).

## Цикл задачи

1. Кладёшь `.farm/tasks/<ID>.md` с шапкой — балансер подхватит сам за ≤30 с:

   ```
   ---
   role: build        # build | research | storm | audit
   prio: 3            # меньше — раньше (по умолчанию 5)
   deps: A1,A2        # ждать готовности этих задач
   prefer: agy-argon  # необязательно: свой порядок движков
   exclude: codex-hi  # необязательно: какие движки не брать
   base: main         # от какой ветки делать рабочую копию
   review: true       # необязательно: ревью другой моделью (по умолчанию — для build)
   ---
   # <ID> — заголовок
   Цель, зона файлов, критерии готовности, как проверить.
   ```

2. Балансер выбирает движок по `role_order` из `engines.json`, следит за лимитами (пауза движка на 45 мин
   при «usage limit» и т.п.), зависаниями (30 мин без вывода) и попытками (3).
3. Агент пишет отчёт `.farm/reports/<ID>.md` и ставит `Статус: готово`.
4. Ферма гоняет `verify.sh`. Не прошло — агента перезапускают с выводом проверки в промпте.
5. Прошло — коммит, отчёт кладётся в ветку (`.farm/reports/<ID>.md`), push `agents/<ID>`.
6. Для `build` автоматически ставится `REVIEW-<ID>` (роль `audit`) на **другом** движке, чем автор.
7. Тимлид принимает по `ACCEPTANCE.md`.

Роли и движки по умолчанию:

| Роль | Порядок движков |
|---|---|
| build | agy-argon → codex-hi → claude |
| research | agy-flash → agy-argon |
| storm | agy-argon |
| audit | claude → codex-hi → agy-argon |

Лимиты одновременной работы: всего 6, argon 4, flash 3, codex-hi 2, claude 2. Движок `claude` выключен
(`"enabled": false`), пока на ПК не выполнен `claude` → `/login`.

## Команды

```bash
cd ~/dev/where_is_hype/.farm
python3 balancer.py status            # доска: .farm/reports/BALANCER.md
python3 balancer.py retry <ID>        # перезапустить с нуля попыток
python3 balancer.py cancel <ID>       # остановить и снять
python3 balancer.py done <ID>         # отметить готовой вручную
python3 balancer.py cooldown agy-argon 60
tail -f logs/balancer.log             # журнал балансера
tail -c 2000 logs/<ID>.log            # что делает агент
```

Пульт: `http://192.168.0.110:4681` (из домашней сети) — задачи, отчёты, логи, скриншоты.

## Сервисы

```bash
sudo systemctl status hype-balancer hype-dashboard
sudo systemctl stop hype-balancer     # остановить раздачу задач (агенты доработают)
sudo systemctl start hype-balancer
./graceful-shutdown.sh [--poweroff]   # остановить балансер, автосохранить рабочие копии, бэкап в ~/backups/where_is_hype
```

## Настройка

- `farm.env` (из `farm.env.example`): пути, remote, прокси, `EXTRA_PATH` (Node 24 + pnpm, uv), `SETUP_CMD`
  для новой рабочей копии и гейты `LINT_CMD`, `TYPECHECK_CMD`, `TEST_CMD`, `BUILD_CMD`, `E2E_CMD` — те же шаги, что в CI.
- `PROTOCOL.md` — общий протокол агента; раздел про дизайн-систему дописать после Claude Design.
- Ветка `agents/<ID>` — не PR. PR в `main` открывает тимлид после ревью, по правилам `CONTRIBUTING.md`.
- Не коммитятся: `worktrees/`, `state/`, `logs/`, `prompts/`, `reports/`, `farm.env`.

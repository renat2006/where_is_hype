#!/usr/bin/env python3
import argparse
import fcntl
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

FARM = Path(__file__).resolve().parent


def load_env() -> dict:
    env = {}
    path = FARM / "farm.env"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = os.path.expandvars(os.path.expanduser(v.strip().strip('"').strip("'")))
    return env


ENV = load_env()
ROOT = Path(ENV.get("ROOT") or FARM.parent)
WORKTREES = Path(ENV.get("WORKTREES") or FARM / "worktrees")
if not WORKTREES.is_absolute():
    WORKTREES = ROOT / WORKTREES
REMOTE = ENV.get("REMOTE") or "origin"
BASE = ENV.get("BASE_BRANCH") or "main"
STATE = FARM / "state"
REPORTS = FARM / "reports"
LOGS = FARM / "logs"
TASKS = FARM / "tasks"
DB = STATE / "balancer.json"
LOCK = STATE / "balancer.lock"
CONFIG = FARM / "engines.json"
BOARD = REPORTS / "BALANCER.md"
REVIEW_TEMPLATE = FARM / "templates" / "REVIEW.md"


def now() -> float:
    return time.time()


def stamp(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts or now()).strftime("%d.%m %H:%M")


def log(msg: str) -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    line = f"[{stamp()}] {msg}"
    print(line, flush=True)
    with open(LOGS / "balancer.log", "a") as fh:
        fh.write(line + "\n")


def config() -> dict:
    return json.loads(CONFIG.read_text())


@contextmanager
def db():
    STATE.mkdir(parents=True, exist_ok=True)
    with open(LOCK, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = json.loads(DB.read_text()) if DB.exists() else {"tasks": {}, "cooldown": {}}
        yield data
        tmp = DB.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        tmp.replace(DB)


def front_matter(path: Path) -> dict:
    text = path.read_text(errors="ignore")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not m:
        return {}
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta


def split(value) -> list[str]:
    if isinstance(value, list):
        return value
    return [x.strip() for x in (value or "").split(",") if x.strip()]


def new_task(role: str, prio: int = 5, deps=None, prefer=None, exclude=None, base: str = "", allow_paid: bool = False,
             review: bool | None = None) -> dict:
    return {
        "role": role, "prio": prio, "deps": split(deps), "prefer": split(prefer), "exclude": split(exclude),
        "base": base or BASE, "allow_paid": allow_paid, "review": review,
        "status": "pending", "added": now(), "attempts": 0, "tried": [],
    }


def discover(data: dict) -> None:
    for spec in sorted(TASKS.glob("*.md")):
        task_id = spec.stem
        if task_id in data["tasks"]:
            continue
        meta = front_matter(spec)
        if not meta.get("role"):
            continue
        review = meta.get("review")
        data["tasks"][task_id] = new_task(
            meta["role"], int(meta.get("prio", 5)), meta.get("deps"), meta.get("prefer"), meta.get("exclude"),
            meta.get("base", ""), meta.get("allow_paid", "").lower() in ("1", "true", "yes"),
            None if review is None else review.lower() in ("1", "true", "yes"),
        )
        log(f"{task_id} queued from tasks/{spec.name} (role {meta['role']})")


def report_done(task_id: str) -> bool:
    report = REPORTS / f"{task_id}.md"
    if not report.exists():
        return False
    head = report.read_text(errors="ignore")[:4000]
    return bool(re.search(r"статус[:\*\s]+(готово|done|завершено)", head, re.IGNORECASE))


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:
        return " Z " not in Path(f"/proc/{pid}/stat").read_text()
    except OSError:
        return False


def read_pid(task_id: str) -> int | None:
    try:
        return int((STATE / f"{task_id}.pid").read_text().strip() or 0) or None
    except (OSError, ValueError):
        return None


def log_tail(task_id: str, size: int = 6000) -> str:
    path = LOGS / f"{task_id}.log"
    if not path.exists():
        return ""
    with open(path, "rb") as fh:
        fh.seek(max(0, path.stat().st_size - size))
        return fh.read().decode("utf-8", "ignore").lower()


def log_age_minutes(task_id: str) -> float:
    path = LOGS / f"{task_id}.log"
    return (now() - path.stat().st_mtime) / 60 if path.exists() else 0.0


def worktree(task_id: str) -> Path:
    return WORKTREES / task_id


def push_branch(task_id: str) -> str:
    wt = worktree(task_id)
    if not wt.exists():
        return "no worktree"
    git = ["git", "-C", str(wt)]
    report = REPORTS / f"{task_id}.md"
    if report.exists():
        dest = wt / ".farm" / "reports" / report.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(report, dest)
        shots = REPORTS / f"{task_id}-shots"
        if shots.is_dir() and any(shots.iterdir()):
            shutil.copytree(shots, dest.parent / shots.name, dirs_exist_ok=True)
        subprocess.run([*git, "add", "-f", str(dest.parent)], capture_output=True)
    subprocess.run([*git, "add", "-A"], capture_output=True)
    staged = subprocess.run([*git, "diff", "--cached", "--quiet"]).returncode != 0
    if staged:
        subprocess.run([*git, "commit", "-qm", f"Complete task {task_id}"], capture_output=True)
    res = subprocess.run(
        [*git, "push", "-q", "-u", REMOTE, f"agents/{task_id}", "--force-with-lease"],
        capture_output=True, text=True,
    )
    return "pushed" if res.returncode == 0 else f"push failed: {res.stderr.strip()[:160]}"


def verify(task_id: str, port: int) -> tuple[bool, str]:
    res = subprocess.run(
        [str(FARM / "verify.sh"), task_id, str(port or 0)],
        capture_output=True, text=True, timeout=3600,
    )
    return res.returncode == 0, (res.stdout + res.stderr)[-4000:]


def kill_task(pid: int | None) -> None:
    if not pid:
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pid, sig)
        except OSError:
            try:
                os.kill(pid, sig)
            except OSError:
                return
        time.sleep(3)
        if not pid_alive(pid):
            return


def used_ports(data: dict) -> set[int]:
    return {t["port"] for t in data["tasks"].values() if t.get("status") == "running" and t.get("port")}


def free_port(data: dict, cfg: dict) -> int:
    lo, hi = cfg["port_range"]
    taken = used_ports(data)
    for port in range(lo, hi + 1):
        if port not in taken:
            return port
    raise RuntimeError("no free port")


def running_by_engine(data: dict) -> dict[str, int]:
    counts: dict[str, int] = {}
    for t in data["tasks"].values():
        if t.get("status") == "running":
            counts[t["engine"]] = counts.get(t["engine"], 0) + 1
    return counts


def pick_engine(task: dict, data: dict, cfg: dict) -> str | None:
    engines = cfg["engines"]
    order = task.get("prefer") or cfg["role_order"].get(task["role"], [])
    counts = running_by_engine(data)
    tried = task.get("tried", [])
    exclude = set(task.get("exclude", []))
    candidates = [e for e in order if e not in tried] + [e for e in order if e in tried]
    for name in candidates:
        spec = engines.get(name)
        if not spec or not spec.get("enabled", True) or name in exclude:
            continue
        if task["role"] not in spec["roles"]:
            continue
        if spec.get("paid") and not task.get("allow_paid"):
            continue
        if data["cooldown"].get(name, 0) > now():
            continue
        if counts.get(name, 0) >= spec["max"]:
            continue
        return name
    return None


def launch(task_id: str, task: dict, engine: str, port: int) -> int | None:
    res = subprocess.run(
        [str(FARM / "run-agent.sh"), engine, task_id, str(port), task.get("base") or BASE],
        capture_output=True, text=True, timeout=300,
    )
    if res.returncode != 0:
        log(f"launch {task_id} on {engine} failed: {(res.stderr or res.stdout).strip()[:200]}")
        return None
    return read_pid(task_id)


def deps_done(task: dict, data: dict) -> bool:
    return all(data["tasks"].get(dep, {}).get("status") == "done" for dep in task.get("deps", []))


def wants_review(task: dict, cfg: dict) -> bool:
    if task.get("review") is not None:
        return bool(task["review"])
    return task["role"] in cfg.get("review_roles", [])


def enqueue_review(task_id: str, task: dict, data: dict, cfg: dict) -> None:
    review_id = f"REVIEW-{task_id}"
    if review_id in data["tasks"] or not REVIEW_TEMPLATE.exists():
        return
    spec = REVIEW_TEMPLATE.read_text().replace("{{TARGET}}", task_id).replace("{{AUTHOR_ENGINE}}", task["engine"])
    (TASKS / f"{review_id}.md").write_text(spec)
    data["tasks"][review_id] = new_task(
        cfg.get("review_role", "audit"), max(1, task.get("prio", 5) - 1),
        exclude=[task["engine"]], base=f"agents/{task_id}", review=False,
    )
    log(f"{review_id} queued, author {task['engine']} excluded")


def finish(task_id: str, task: dict, data: dict, cfg: dict) -> None:
    ok, out = verify(task_id, task.get("port", 0))
    (STATE / f"{task_id}.verify.out").write_text(out)
    if not ok:
        (STATE / f"{task_id}.feedback").write_text(out)
        task.update(status="pending", pid=None, note="verify failed")
        log(f"{task_id} verify failed on {task['engine']} — back to queue with feedback")
        if task.get("attempts", 0) >= cfg["max_attempts"]:
            task["status"] = "failed"
            log(f"{task_id} failed after {task['attempts']} attempts")
        return
    (STATE / f"{task_id}.feedback").unlink(missing_ok=True)
    task.update(status="done", finished=now(), note=push_branch(task_id))
    log(f"{task_id} done on {task['engine']} ({task['note']})")
    if task["note"] == "pushed" and wants_review(task, cfg):
        enqueue_review(task_id, task, data, cfg)


def tick() -> None:
    cfg = config()
    with db() as data:
        discover(data)
        for task_id, task in data["tasks"].items():
            if task.get("status") != "running":
                continue
            pid = task.get("pid") or read_pid(task_id)
            if report_done(task_id) and not pid_alive(pid):
                finish(task_id, task, data, cfg)
                continue
            if pid_alive(pid):
                if log_age_minutes(task_id) > cfg["stall_minutes"]:
                    log(f"{task_id} stalled on {task['engine']} — killing")
                    kill_task(pid)
                    task.update(status="pending", note="stalled", pid=None)
                continue
            tail = log_tail(task_id)
            fatal = next((p for p in cfg.get("fatal_patterns", []) if p in tail), None)
            if fatal:
                task.update(status="failed", pid=None, note=f"fatal: {fatal}")
                log(f"{task_id} fatal on {task['engine']}: {fatal}")
                continue
            limited = any(p in tail for p in cfg["limit_patterns"])
            if limited:
                data["cooldown"][task["engine"]] = now() + cfg["cooldown_minutes"] * 60
                log(f"{task['engine']} hit a limit on {task_id} — cooldown {cfg['cooldown_minutes']} min")
            task.update(status="pending", pid=None, note="limit" if limited else "exited without report")
            if task.get("attempts", 0) >= cfg["max_attempts"]:
                task["status"] = "failed"
                log(f"{task_id} failed after {task['attempts']} attempts")

        running = sum(1 for t in data["tasks"].values() if t.get("status") == "running")
        queue = sorted(
            (item for item in data["tasks"].items() if item[1].get("status") == "pending"),
            key=lambda item: (item[1].get("prio", 5), item[1].get("added", 0)),
        )
        for task_id, task in queue:
            if running >= cfg["max_running"]:
                break
            if not deps_done(task, data) or not (TASKS / f"{task_id}.md").exists():
                continue
            engine = pick_engine(task, data, cfg)
            if not engine:
                continue
            port = task.get("port") or free_port(data, cfg)
            pid = launch(task_id, task, engine, port)
            if not pid:
                task.setdefault("tried", []).append(engine)
                continue
            task.update(
                status="running", engine=engine, pid=pid, port=port, started=now(),
                attempts=task.get("attempts", 0) + 1,
            )
            task.setdefault("tried", []).append(engine)
            running += 1
            log(f"{task_id} → {engine} (port {port}, attempt {task['attempts']})")
        write_board(data, cfg)


def write_board(data: dict, cfg: dict) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    counts = running_by_engine(data)
    lines = [f"# Балансер фермы — {stamp()}", "", "| Движок | Занято | Лимит | Пауза до |", "|---|---|---|---|"]
    for name, spec in cfg["engines"].items():
        until = data["cooldown"].get(name, 0)
        pause = stamp(until) if until > now() else ""
        flag = " (выключен)" if not spec.get("enabled", True) else (" (платный)" if spec.get("paid") else "")
        lines.append(f"| {name}{flag} | {counts.get(name, 0)} | {spec['max']} | {pause} |")
    lines += ["", "| Задача | Роль | Статус | Движок | Попытки | Старт | Заметка |", "|---|---|---|---|---|---|---|"]
    order = {"running": 0, "pending": 1, "failed": 2, "done": 3}
    for task_id, t in sorted(data["tasks"].items(), key=lambda kv: (order.get(kv[1].get("status"), 9), kv[1].get("prio", 5))):
        started = stamp(t["started"]) if t.get("started") else ""
        lines.append(
            f"| {task_id} | {t['role']} | {t.get('status')} | {t.get('engine', '')} | {t.get('attempts', 0)} | {started} | {t.get('note', '')} |"
        )
    BOARD.write_text("\n".join(lines) + "\n")


def cmd_add(args) -> None:
    if not (TASKS / f"{args.id}.md").exists():
        sys.exit(f"no spec tasks/{args.id}.md")
    with db() as data:
        data["tasks"][args.id] = new_task(
            args.role, args.prio, args.deps, args.prefer, args.exclude, args.base or "", args.allow_paid,
        )
    print(f"queued {args.id}")


def cmd_set(args) -> None:
    with db() as data:
        task = data["tasks"][args.id]
        if args.action == "retry":
            kill_task(task.get("pid"))
            task.update(status="pending", pid=None, attempts=0, note="manual retry")
        elif args.action == "cancel":
            kill_task(task.get("pid"))
            task.update(status="failed", pid=None, note="cancelled")
        elif args.action == "done":
            task.update(status="done", note="marked done")


def cmd_cooldown(args) -> None:
    with db() as data:
        data["cooldown"][args.engine] = now() + args.minutes * 60
    print(f"{args.engine} paused for {args.minutes} min")


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("id")
    a.add_argument("--role", required=True)
    a.add_argument("--prio", type=int, default=5)
    a.add_argument("--deps")
    a.add_argument("--prefer")
    a.add_argument("--exclude")
    a.add_argument("--base")
    a.add_argument("--allow-paid", action="store_true")
    for action in ("retry", "cancel", "done"):
        s = sub.add_parser(action)
        s.add_argument("id")
        s.set_defaults(action=action)
    c = sub.add_parser("cooldown")
    c.add_argument("engine")
    c.add_argument("minutes", type=int)
    sub.add_parser("tick")
    sub.add_parser("run")
    sub.add_parser("status")
    args = p.parse_args()
    if args.cmd == "add":
        cmd_add(args)
    elif args.cmd in ("retry", "cancel", "done"):
        cmd_set(args)
    elif args.cmd == "cooldown":
        cmd_cooldown(args)
    elif args.cmd == "tick":
        tick()
        print(BOARD.read_text())
    elif args.cmd == "status":
        with db() as data:
            write_board(data, config())
        print(BOARD.read_text())
    elif args.cmd == "run":
        log("balancer started")
        while True:
            try:
                tick()
            except Exception as exc:
                log(f"tick error: {exc!r}")
            time.sleep(config()["poll_seconds"])


if __name__ == "__main__":
    main()

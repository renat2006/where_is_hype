#!/usr/bin/env python3
import json
import mimetypes
import os
import re
import subprocess
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

FARM = Path(__file__).resolve().parent
ROOT = FARM.parent
ORCH = FARM
REPORTS = FARM / "reports"
LOGS = FARM / "logs"
STATE = FARM / "state"
TASKS_DIR = FARM / "tasks"
WT_DIR = FARM / "worktrees"
BACKUP_DIR = Path.home() / "backups" / ROOT.name
PROJECT = ROOT.name

PINNED_TASKS = []


def all_specs():
    specs = []
    seen = set()
    db = STATE / "balancer.json"
    if db.exists():
        try:
            data = json.loads(db.read_text())
        except Exception:
            data = {"tasks": {}}
        order = {"running": 0, "pending": 1, "failed": 2, "done": 3}
        items = sorted(data.get("tasks", {}).items(), key=lambda kv: (order.get(kv[1].get("status"), 9), kv[1].get("prio", 5)))
        for tid, t in items:
            spec_path = TASKS_DIR / f"{tid}.md"
            title = tid
            if spec_path.exists():
                first = spec_path.read_text(errors="replace").splitlines()[0:1]
                if first:
                    title = first[0].lstrip("# ").strip()
            specs.append({"id": tid, "repo": t.get("repo", "front"), "runner": t.get("engine") or "очередь", "port": t.get("port") or 0, "title": f"[{t.get('status')}] {title}"})
            seen.add(tid)
    specs += [s for s in PINNED_TASKS if s["id"] not in seen]
    return specs


def run_cmd(cmd, cwd=None, timeout=3):
    try:
        res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return res.stdout.strip()
    except Exception:
        return ""


def get_system_metrics():
    load1, load5, load15 = os.getloadavg()
    mem_total = mem_avail = 0
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    mem_total = int(line.split()[1]) / (1024 * 1024)
                elif line.startswith("MemAvailable:"):
                    mem_avail = int(line.split()[1]) / (1024 * 1024)
    except Exception:
        pass
    mem_used = max(0.0, mem_total - mem_avail)
    st = os.statvfs("/")
    disk_free_gb = (st.f_bavail * st.f_frsize) / (1024**3)
    disk_total_gb = (st.f_blocks * st.f_frsize) / (1024**3)

    singbox_active = run_cmd(["systemctl", "is-active", "farm-singbox.service"]) == "active"
    farm_active = run_cmd(["systemctl", "is-active", "hype-balancer.service"]) == "active"
    shim_active = run_cmd(["systemctl", "is-active", "farm-llm-shim.service"]) == "active"
    backend_active = run_cmd(["systemctl", "is-active", "farm-backend.service"]) == "active"

    wave_num = "1"
    wave_file = STATE / "wave_num.txt"
    if wave_file.exists():
        try:
            wave_num = wave_file.read_text().strip() or "1"
        except Exception:
            pass

    shim_stats = {"vk_ok": 0, "vk_fail": 0, "agy_fallback_ok": 0, "circuit_open": False}
    if shim_active:
        try:
            with urllib.request.urlopen("http://127.0.0.1:4690/status", timeout=0.8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                st_data = data.get("stats") or {}
                shim_stats = {
                    "vk_ok": st_data.get("vk_ok", 0),
                    "vk_fail": st_data.get("vk_fail", 0),
                    "agy_fallback_ok": st_data.get("agy_fallback_ok", 0),
                    "circuit_open": bool(data.get("vk_circuit_open", False)),
                }
        except Exception:
            pass

    backups = []
    if BACKUP_DIR.exists():
        for b in sorted(BACKUP_DIR.glob("*.bundle")):
            backups.append(b.name)

    return {
        "time_msk": datetime.now().strftime("%d.%m.%Y %H:%M:%S MSK"),
        "wave_num": wave_num,
        "load": [round(load1, 2), round(load5, 2), round(load15, 2)],
        "cores": os.cpu_count() or 16,
        "mem_used_gb": round(mem_used, 1),
        "mem_total_gb": round(mem_total, 1),
        "disk_free_gb": round(disk_free_gb, 1),
        "disk_total_gb": round(disk_total_gb, 1),
        "singbox_active": singbox_active,
        "farm_active": farm_active,
        "shim_active": shim_active,
        "shim_stats": shim_stats,
        "backend_active": backend_active,
        "backups_count": len(backups),
        "latest_backup": backups[-1] if backups else "создаётся...",
    }


def is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        with open(f"/proc/{pid}/stat") as f:
            stat = f.read()
            if ") Z " in stat:
                return False
        return True
    except Exception:
        return False


def parse_agent_log_summary(task_id: str):
    if task_id == "E2E-CROSS":
        steps = []
        for b in ["chromium", "firefox", "webkit"]:
            p = LOGS / f"e2e-{b}.log"
            if p.exists() and p.stat().st_size > 0:
                lines = p.read_text(errors="replace").strip().splitlines()
                last = lines[-1] if lines else ""
                steps.append({"type": "e2e", "browser": b, "summary": last[:140]})
        return {
            "step_index": len(steps),
            "last_action": steps[-1]["summary"] if steps else "Ожидание...",
            "events": steps,
            "raw_tail": "\n".join(
                f"=== {b} ===\n" + (LOGS / f"e2e-{b}.log").read_text(errors="replace")[-1200:]
                for b in ["chromium", "firefox", "webkit"]
                if (LOGS / f"e2e-{b}.log").exists()
            ),
            "log_size_kb": 12.0,
        }

    if task_id == "STAGE2-BENCHMARK":
        raw_parts = []
        for name in ["stage2-bench.log", "stage2-render.log", "stage2-brand.log"]:
            p = LOGS / name
            if p.exists():
                raw_parts.append(f"=== {name} ===\n" + p.read_text(errors="replace")[-1200:])
        raw_tail = "\n".join(raw_parts)
        last_line = raw_tail.strip().splitlines()[-1] if raw_tail.strip() else "Выполняется..."
        return {
            "step_index": len(raw_parts),
            "last_action": last_line[:140],
            "events": [],
            "raw_tail": raw_tail,
            "log_size_kb": round(len(raw_tail) / 1024, 1),
        }

    log_path = LOGS / f"{task_id}.log"
    if not log_path.exists():
        return {"step_index": 0, "last_action": "В очереди оркестратора", "events": [], "raw_tail": "", "log_size_kb": 0}

    try:
        size = log_path.stat().st_size
        with open(log_path, "rb") as f:
            if size > 65536:
                f.seek(size - 65536)
            chunk = f.read().decode("utf-8", errors="replace")
    except Exception:
        return {"step_index": 0, "last_action": "Ошибка чтения лога", "events": [], "raw_tail": "", "log_size_kb": 0}

    lines = chunk.splitlines()
    events = []
    step_idx = 0
    last_action = "Инициализация..."
    model_name = ""

    for line in lines:
        line_s = line.strip()
        if not line_s.startswith("{"):
            continue
        try:
            obj = json.loads(line_s)
        except Exception:
            continue

        if "init" in obj and isinstance(obj["init"], dict):
            model_name = obj["init"].get("model", model_name)
        elif "step_update" in obj and isinstance(obj["step_update"], dict):
            su = obj["step_update"]
            step_idx = max(step_idx, su.get("step_index", 0))
            st_type = su.get("step_type", "")
            state = su.get("state", "")
            if st_type == "tool":
                tname = su.get("tool_name", "tool")
                tinfo = su.get("tool_info") or {}
                params = tinfo.get("parameters") or {}
                detail = (
                    params.get("CommandLine")
                    or params.get("AbsolutePath")
                    or params.get("TargetFile")
                    or params.get("Pattern")
                    or ""
                )
                if len(str(detail)) > 90:
                    detail = str(detail)[:87] + "..."
                out = tinfo.get("output", "")
                last_action = f"[{tname}] {detail}"
                if state == "DONE":
                    events.append(
                        {
                            "step": step_idx,
                            "kind": "tool",
                            "tool": tname,
                            "detail": str(detail),
                            "output": str(out)[:140],
                            "duration": round(su.get("duration_seconds", 0), 2),
                        }
                    )
            elif st_type == "agent_response" and state == "DONE":
                usage = su.get("usage") or {}
                tok = usage.get("total_tokens", 0)
                last_action = f"Ответ модели (шаг #{step_idx}, {tok} токенов)"
                events.append(
                    {
                        "step": step_idx,
                        "kind": "ValidResponse",
                        "tool": "thinking",
                        "detail": f"Шаг #{step_idx} обработан ({tok} tok)",
                        "output": "",
                        "duration": round(su.get("duration_seconds", 0), 2),
                    }
                )
        elif obj.get("type") in ("item.completed", "item.started", "turn.completed"):
            item = obj.get("item") or {}
            itype = item.get("type", obj.get("type", ""))
            step_idx += 1
            if itype == "command_execution":
                cmd = item.get("command", "")
                if isinstance(cmd, list):
                    cmd = " ".join(cmd)
                last_action = f"[cmd] {str(cmd)[:90]}"
                events.append(
                    {
                        "step": step_idx,
                        "kind": "tool",
                        "tool": "bash",
                        "detail": str(cmd)[:100],
                        "output": str(item.get("aggregated_output", ""))[-120:],
                        "duration": 0,
                    }
                )
            elif itype == "agent_message":
                txt = item.get("text", "")
                last_action = txt[:100] if txt else "Сообщение агента"
                events.append(
                    {
                        "step": step_idx,
                        "kind": "message",
                        "tool": "message",
                        "detail": txt[:160],
                        "output": "",
                        "duration": 0,
                    }
                )

    if not events:
        for l in reversed(lines):
            clean = l.strip()
            if clean and not clean.startswith(("{", "}", "[", "]")):
                last_action = clean[:120]
                break

    return {
        "step_index": step_idx or (len(lines) if lines else 0),
        "model": model_name,
        "last_action": last_action,
        "events": events[-25:],
        "raw_tail": "\n".join(lines[-35:]),
        "log_size_kb": round(log_path.stat().st_size / 1024, 1),
    }



def get_task_info(spec: dict, full: bool = False):
    tid = spec["id"]
    pid = 0
    pidfile = STATE / f"{tid}.pid"
    if pidfile.exists():
        try:
            pid = int(pidfile.read_text().strip())
        except Exception:
            pid = 0
    alive = is_pid_alive(pid)

    report_path = REPORTS / f"{tid}.md"
    report_text = report_path.read_text(errors="replace") if report_path.exists() else ""
    status_match = re.search(r"^Статус:\s*(.+)$", report_text, re.M | re.I)
    raw_status = status_match.group(1).strip().lower() if status_match else ""

    if "готово" in raw_status or "done" in raw_status or "завершено" in raw_status:
        state = "done"
    elif alive:
        state = "running"
    elif "заблокировано" in raw_status or "error" in raw_status:
        state = "blocked"
    elif report_text:
        state = "stopped"
    else:
        state = "pending"

    progress_lines = [
        line.strip()
        for line in report_text.splitlines()
        if line.strip().startswith("- ")
    ]
    latest_report_bullet = progress_lines[0] if progress_lines else ""

    wt = WT_DIR / tid
    git_branch = f"agents/{tid}"
    git_commit = "-"
    git_dirty = []
    if wt.exists():
        git_commit = run_cmd(["git", "-C", str(wt), "log", "-1", "--format=%h · %s (%cr)"])
        dirty_out = run_cmd(["git", "-C", str(wt), "status", "--short"])
        git_dirty = [l for l in dirty_out.splitlines() if l.strip()]

    shots_dir = REPORTS / f"{tid}-shots"
    shots = []
    if shots_dir.exists():
        for p in sorted(shots_dir.rglob("*.png")):
            rel = p.relative_to(shots_dir)
            shots.append(str(rel))

    log_info = parse_agent_log_summary(tid)

    data = {
        "id": tid,
        "title": spec["title"],
        "repo": spec["repo"],
        "runner": spec["runner"],
        "port": spec["port"],
        "pid": pid if alive else 0,
        "state": state,
        "step_index": log_info.get("step_index", 0),
        "last_action": log_info.get("last_action", ""),
        "log_size_kb": log_info.get("log_size_kb", 0),
        "latest_report_bullet": latest_report_bullet,
        "git_branch": git_branch,
        "git_commit": git_commit,
        "git_dirty_count": len(git_dirty),
        "shots_count": len(shots),
        "shots": shots[:24],
    }

    if full:
        task_spec_path = TASKS_DIR / f"{tid}.md"
        ledger_path = ORCH / "README.md"
        night_status_path = REPORTS / "BALANCER.md"
        backups_list = []
        if BACKUP_DIR.exists():
            for b in sorted(BACKUP_DIR.glob("*")):
                sz_mb = round(b.stat().st_size / (1024 * 1024), 2)
                backups_list.append(f"{b.name} ({sz_mb} MB)")

        data["report_md"] = report_text or "_Отчёт пока пуст_"
        data["task_spec_md"] = task_spec_path.read_text(errors="replace") if task_spec_path.exists() else ""
        data["ledger_md"] = (
            (ledger_path.read_text(errors="replace") if ledger_path.exists() else "")
            + "\n\n---\n\n"
            + (night_status_path.read_text(errors="replace") if night_status_path.exists() else "")
            + f"\n\n## Архивы резервных копий ({BACKUP_DIR})\n"
            + ("\n".join(f"- {x}" for x in backups_list) if backups_list else "- Создаются...")
        )
        data["events"] = log_info.get("events", [])
        data["raw_tail"] = log_info.get("raw_tail", "")
        data["git_dirty"] = git_dirty[:40]
        if wt.exists():
            data["git_diff_stat"] = run_cmd(["git", "-C", str(wt), "diff", "--stat"])

    return data


HTML_PAGE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>where_is_hype · Пульт фермы агентов</title>
<style>
  :root {
    --bg: #0b0f17;
    --panel: #131a26;
    --panel-hover: #192233;
    --border: #233047;
    --text: #e6edf7;
    --muted: #8b9bb4;
    --accent: #3b82f6;
    --green: #10b981;
    --amber: #f59e0b;
    --red: #ef4444;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    --sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    line-height: 1.45;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: rgba(11, 15, 23, 0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pulse-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 12px var(--green);
    animation: pulse 1.8s infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.25); opacity: 0.65; }
  }
  .brand h1 {
    font-size: 17px;
    font-weight: 600;
    margin: 0;
  }
  .brand span {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }
  .telemetry {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .pill {
    background: var(--panel);
    border: 1px solid var(--border);
    padding: 5px 10px;
    border-radius: 8px;
    font-size: 11.5px;
    font-family: var(--mono);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pill b { color: #fff; }
  .ok { color: var(--green); }
  .warn { color: var(--amber); }
  .err { color: var(--red); }
  main {
    display: grid;
    grid-template-columns: 1fr 500px;
    gap: 20px;
    padding: 20px 24px;
    max-width: 1800px;
    margin: 0 auto;
  }
  @media (max-width: 1180px) {
    main { grid-template-columns: 1fr; }
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 13px;
    align-content: start;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 16px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .card.lead-card {
    background: linear-gradient(180deg, rgba(59,130,246,0.08) 0%, var(--panel) 100%);
    border-color: rgba(59,130,246,0.35);
  }
  .card:hover {
    background: var(--panel-hover);
    border-color: #364c70;
  }
  .card.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .task-id {
    font-family: var(--mono);
    font-size: 13.5px;
    font-weight: 700;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .tag {
    font-size: 10.5px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 6px;
    font-family: var(--mono);
    background: rgba(255,255,255,0.06);
    color: var(--muted);
  }
  .badge {
    font-size: 10.5px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    font-family: var(--mono);
  }
  .badge.running { background: rgba(16, 185, 129, 0.16); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); }
  .badge.done { background: rgba(59, 130, 246, 0.18); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
  .badge.pending { background: rgba(139, 155, 180, 0.12); color: var(--muted); }
  .badge.stopped, .badge.blocked { background: rgba(245, 158, 11, 0.16); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); }
  .task-title {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }
  .live-box {
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 7px 10px;
    font-family: var(--mono);
    font-size: 11px;
    color: #a5b4fc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    gap: 8px;
  }
  .inspector {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 96px);
    position: sticky;
    top: 76px;
    overflow: hidden;
  }
  .insp-head {
    padding: 15px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .insp-head-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    padding: 0 14px;
    background: rgba(0,0,0,0.18);
  }
  .tab {
    background: none;
    border: none;
    color: var(--muted);
    padding: 9px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  .tab.active {
    color: #fff;
    border-bottom-color: var(--accent);
  }
  .insp-body {
    padding: 16px 18px;
    overflow-y: auto;
    flex: 1;
    font-size: 13px;
  }
  pre {
    background: #090d14;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    overflow-x: auto;
    font-family: var(--mono);
    font-size: 11.5px;
    line-height: 1.5;
    color: #cbd5e1;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .event-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ev {
    background: #0d131f;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    font-family: var(--mono);
    font-size: 11.5px;
  }
  .ev-head {
    display: flex;
    justify-content: space-between;
    color: #60a5fa;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .ev-detail {
    color: #e2e8f0;
    word-break: break-all;
  }
  .ev-out {
    color: var(--muted);
    margin-top: 4px;
    font-size: 11px;
  }
  .btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  button.action {
    background: #1e293b;
    color: #fff;
    border: 1px solid #334155;
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
  }
  button.action:hover { background: #334155; }
  button.action.primary { background: var(--accent); border-color: var(--accent); }
  .shots-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .shot-card {
    background: #090d14;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .shot-card img {
    width: 100%;
    height: 120px;
    object-fit: cover;
    display: block;
  }
  .shot-card div {
    padding: 5px 8px;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="pulse-dot"></div>
    <div>
      <h1>where_is_hype · Ферма агентов (24/7)</h1>
      <span id="sub-clock">192.168.0.110:4681 · загрузка...</span>
    </div>
  </div>
  <div class="telemetry" id="telemetry"></div>
</header>
<main>
  <section class="grid" id="task-grid"></section>
  <aside class="inspector">
    <div class="insp-head">
      <div class="insp-head-top">
        <div class="task-id" id="insp-title">Выберите задачу</div>
        <span class="badge pending" id="insp-badge">-</span>
      </div>
      <div class="btn-row" id="insp-actions"></div>
    </div>
    <div class="tabs">
      <button class="tab active" onclick="setTab('stream', this)">Стрим</button>
      <button class="tab" onclick="setTab('report', this)">Отчёт</button>
      <button class="tab" onclick="setTab('ledger', this)">Журнал и Бэкапы</button>
      <button class="tab" onclick="setTab('git', this)">Git</button>
      <button class="tab" onclick="setTab('shots', this)">Скрины</button>
      <button class="tab" onclick="setTab('spec', this)">ТЗ</button>
    </div>
    <div class="insp-body" id="insp-body">Загрузка...</div>
  </aside>
</main>
<script>
let selectedTask = 'BE-HONEST';
let activeTab = 'stream';
let lastTaskDetail = null;

function stateLabel(st) {
  if (st === 'running') return 'В РАБОТЕ';
  if (st === 'done') return 'ГОТОВО';
  if (st === 'blocked') return 'БЛОКЕР';
  if (st === 'stopped') return 'ПАУЗА';
  return 'ОЖИДАНИЕ';
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchOverview() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    const sys = data.system;
    const st = sys.shim_stats || {};
    document.getElementById('sub-clock').textContent =
      `192.168.0.110 · Волна #${sys.wave_num} · ${sys.time_msk}`;
    document.getElementById('telemetry').innerHTML = `
      <div class="pill">Волна: <b>#${sys.wave_num}</b></div>
      <div class="pill">CPU: <b>${sys.load[0]} / ${sys.cores}</b></div>
      <div class="pill">RAM: <b>${sys.mem_used_gb}/${sys.mem_total_gb}G</b></div>
      <div class="pill">Sing-Box: <b class="${sys.singbox_active ? 'ok' : 'err'}">${sys.singbox_active ? 'ON' : 'OFF'}</b></div>
      <div class="pill">LLM-Шлюз (:4690): <b class="${sys.shim_active ? 'ok' : 'err'}">${sys.shim_active ? (st.circuit_open ? 'AGY-FALLBACK (' + st.agy_fallback_ok + ')' : 'VK+AGY (' + (st.vk_ok + st.agy_fallback_ok) + ')') : 'OFF'}</b></div>
      <div class="pill">Бэкенд (:8088): <b class="${sys.backend_active ? 'ok' : 'err'}">${sys.backend_active ? 'ONLINE' : 'OFF'}</b></div>
      <div class="pill">Бэкапы: <b class="ok">${sys.backups_count} шт.</b></div>
      <div class="pill">Оркестратор: <b class="${sys.farm_active ? 'ok' : 'err'}">${sys.farm_active ? 'ACTIVE' : 'STOPPED'}</b></div>
    `;

    const grid = document.getElementById('task-grid');
    grid.innerHTML = data.tasks.map(t => `
      <div class="card ${t.id.startsWith('LEAD-') ? 'lead-card' : ''} ${t.id === selectedTask ? 'active' : ''}" onclick="selectTask('${t.id}')">
        <div class="card-top">
          <div class="task-id">
            ${esc(t.id)}
            <span class="tag">${esc(t.repo)}</span>
            <span class="tag">${esc(t.runner)}</span>
          </div>
          <span class="badge ${t.state}">${stateLabel(t.state)}</span>
        </div>
        <div class="task-title">${esc(t.title)}</div>
        <div class="live-box">Шаг #${t.step_index} · ${esc(t.last_action || 'Ожидание...')}</div>
        <div class="meta-row">
          <span>${t.pid ? 'PID ' + t.pid : 'очередь'} · лог ${t.log_size_kb} КБ</span>
          <span>изм: ${t.git_dirty_count} · скринов: ${t.shots_count}</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

async function fetchTaskDetail() {
  if (!selectedTask) return;
  try {
    const res = await fetch('/api/task?id=' + encodeURIComponent(selectedTask));
    lastTaskDetail = await res.json();
    renderInspector();
  } catch (e) {
    console.error(e);
  }
}

function selectTask(id) {
  selectedTask = id;
  fetchOverview();
  fetchTaskDetail();
}

function setTab(tab, btn) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  renderInspector();
}

async function triggerAction(action, runner) {
  await fetch('/api/action', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ id: selectedTask, action, runner })
  });
  setTimeout(() => { fetchOverview(); fetchTaskDetail(); }, 800);
}

function renderInspector() {
  const t = lastTaskDetail;
  if (!t) return;
  document.getElementById('insp-title').innerHTML = `${esc(t.id)} <span class="tag">${esc(t.runner)}</span>`;
  const b = document.getElementById('insp-badge');
  b.className = 'badge ' + t.state;
  b.textContent = stateLabel(t.state);

  document.getElementById('insp-actions').innerHTML = `
    <button class="action primary" onclick="triggerAction('restart', 'agy-argon')">Перезапустить (Argon)</button>
    <button class="action" onclick="triggerAction('restart', 'agy-flash')">Flash</button>
    <button class="action" onclick="triggerAction('restart', 'codex')">Codex</button>
    <button class="action" onclick="triggerAction('restart', 'devin-swemax')">Devin SWE-Max</button>
    <button class="action" onclick="triggerAction('push', '')">Push ветки</button>
  `;

  const body = document.getElementById('insp-body');
  if (activeTab === 'stream') {
    const evs = (t.events || []).slice().reverse();
    body.innerHTML = `
      <div style="margin-bottom:10px;font-family:var(--mono);font-size:12px;color:var(--muted)">
        Текущее действие: <b style="color:#fff">${esc(t.last_action)}</b>
      </div>
      <div class="event-list">
        ${evs.map(e => `
          <div class="ev">
            <div class="ev-head">
              <span>#${e.step} · ${esc(e.tool)}</span>
              <span>${e.duration ? e.duration + 's' : ''}</span>
            </div>
            <div class="ev-detail">${esc(e.detail)}</div>
            ${e.output ? `<div class="ev-out">${esc(e.output)}</div>` : ''}
          </div>
        `).join('') || '<div style="color:var(--muted)">Пока нет шагов JSON, см. хвост лога ниже:</div>'}
      </div>
      <h4 style="margin:16px 0 8px;font-size:12px;color:var(--muted)">Хвост сырого лога (${t.log_size_kb} КБ):</h4>
      <pre>${esc(t.raw_tail || 'Пусто')}</pre>
    `;
  } else if (activeTab === 'report') {
    body.innerHTML = `<pre>${esc(t.report_md)}</pre>`;
  } else if (activeTab === 'ledger') {
    body.innerHTML = `<pre>${esc(t.ledger_md || 'Журнал загружается...')}</pre>`;
  } else if (activeTab === 'git') {
    body.innerHTML = `
      <div style="font-family:var(--mono);font-size:12px;margin-bottom:10px">
        <div>Ветка: <b>${esc(t.git_branch)}</b></div>
        <div>Последний коммит: <b>${esc(t.git_commit)}</b></div>
      </div>
      <h4 style="font-size:12px;color:var(--muted)">Изменённые файлы (${(t.git_dirty || []).length}):</h4>
      <pre>${esc((t.git_dirty || []).join('\\n') || 'Чисто (все изменения закоммичены или ещё не начаты)')}</pre>
      <h4 style="font-size:12px;color:var(--muted)">Diff stat:</h4>
      <pre>${esc(t.git_diff_stat || 'Нет незакоммиченного diff')}</pre>
    `;
  } else if (activeTab === 'shots') {
    if (!t.shots || !t.shots.length) {
      body.innerHTML = `<div style="color:var(--muted)">Скриншотов в ${esc(t.id)}-shots пока нет.</div>`;
    } else {
      body.innerHTML = `<div class="shots-grid">` + t.shots.map(s => `
        <a class="shot-card" href="/api/shot?id=${encodeURIComponent(t.id)}&file=${encodeURIComponent(s)}" target="_blank">
          <img src="/api/shot?id=${encodeURIComponent(t.id)}&file=${encodeURIComponent(s)}" loading="lazy" />
          <div>${esc(s)}</div>
        </a>
      `).join('') + `</div>`;
    }
  } else if (activeTab === 'spec') {
    body.innerHTML = `<pre>${esc(t.task_spec_md)}</pre>`;
  }
}

fetchOverview();
fetchTaskDetail();
setInterval(fetchOverview, 2500);
setInterval(fetchTaskDetail, 3000);
</script>
</body>
</html>
"""


class DashboardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _send_json(self, obj, code=200):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/" or parsed.path == "/index.html":
            raw = HTML_PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        if parsed.path == "/api/state":
            tasks = [get_task_info(spec, full=False) for spec in all_specs()]
            self._send_json({"system": get_system_metrics(), "tasks": tasks})
            return

        if parsed.path == "/api/task":
            qs = parse_qs(parsed.query)
            tid = qs.get("id", ["LEAD-RESEARCH"])[0]
            specs = all_specs()
            spec = next((s for s in specs if s["id"] == tid), specs[0])
            self._send_json(get_task_info(spec, full=True))
            return

        if parsed.path == "/api/shot":
            qs = parse_qs(parsed.query)
            tid = qs.get("id", [""])[0]
            rel = unquote(qs.get("file", [""])[0])
            base = (REPORTS / f"{tid}-shots").resolve()
            target = (base / rel).resolve()
            if str(target).startswith(str(base)) and target.is_file():
                ctype = mimetypes.guess_type(str(target))[0] or "image/png"
                data = target.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_error(404)
            return

        self.send_error(404)

    def do_POST(self):
        if self.path == "/api/action":
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            tid = body.get("id", "")
            action = body.get("action", "")
            runner = body.get("runner", "")
            spec = next((s for s in all_specs() if s["id"] == tid), None)
            if not spec:
                self._send_json({"ok": False, "error": "unknown task"}, 400)
                return

            if action == "restart":
                pidfile = STATE / f"{tid}.pid"
                if pidfile.exists():
                    try:
                        old_pid = int(pidfile.read_text().strip())
                        os.kill(old_pid, 15)
                    except Exception:
                        pass
                use_runner = runner or spec["runner"]
                env = os.environ.copy()
                env["REPO"] = spec["repo"]
                subprocess.Popen(
                    [str(ORCH / "run-agent.sh"), use_runner, tid, str(spec["port"])],
                    cwd=str(ROOT),
                    env=env,
                )
                self._send_json({"ok": True})
                return

            if action == "push":
                wt = WT_DIR / tid
                if wt.exists():
                    run_cmd(["git", "-C", str(wt), "push", "-u", "github-hype", f"agents/{tid}", "--force-with-lease"], timeout=15)
                self._send_json({"ok": True})
                return

        self.send_error(404)


if __name__ == "__main__":
    port = int(os.environ.get("FARM_PORT", "4681"))
    server = ThreadingHTTPServer(("0.0.0.0", port), DashboardHandler)
    print(f"Farm Dashboard listening on http://0.0.0.0:{port}", flush=True)
    server.serve_forever()

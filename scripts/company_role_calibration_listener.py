#!/usr/bin/env python3
"""Event-driven local Codex runner for Company Role calibration work.

The database notification is only a wake hint. Queue discovery and claiming
always go through the durable company_role_calibrations contract.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import time
from typing import Any, Sequence

from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from company_role_calibration import connect, fetch_all, fetch_one


ROOT = SCRIPT_DIR.parent
SCRIPT_PATH = Path(__file__).resolve()
PROMPT_PATH = (
    ROOT / "docs" / "company" / "company-role-profile-calibration-event-prompt-ko.md"
)
RUNBOOK_PATH = (
    ROOT / "docs" / "company" / "company-role-profile-calibration-codex-runbook-ko.md"
)
HELPER_PATH = ROOT / "scripts" / "company_role_calibration.py"
LABEL = "com.harper.company-role-calibration-codex"
NOTIFY_CHANNEL = "harper_company_role_calibration_work"
NOTIFY_TRIGGER = "company_role_calibrations_notify_work_v1"
STATE_DIR = (
    Path.home()
    / "Library"
    / "Application Support"
    / "Harper"
    / "company-role-calibration-codex"
)
LOG_DIR = Path.home() / "Library" / "Logs" / "Harper"
PLIST_PATH = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
DISABLED_PATH = STATE_DIR / "disabled"
LOCK_PATH = STATE_DIR / "listener.lock"
LISTENER_STDOUT = LOG_DIR / "company-role-calibration-codex-listener.log"
LISTENER_STDERR = LOG_DIR / "company-role-calibration-codex-listener.error.log"
PREFLIGHT_BACKOFF_SECONDS = 15 * 60
CODEX_FAILURE_BACKOFF_SECONDS = 15 * 60
SIGNAL_CHECK_INTERVAL_SECONDS = 30
DEFAULT_MODEL = "gpt-5.6-sol"
DEFAULT_REASONING_EFFORT = "xhigh"


@dataclass(frozen=True)
class QueueSnapshot:
    ready_ids: tuple[str, ...]
    next_available_at: datetime | None

    @property
    def ready_count(self) -> int:
        return len(self.ready_ids)


@dataclass(frozen=True)
class LocalStatus:
    installed: bool
    enabled: bool
    loaded: bool
    launchd_state: str | None
    pid: int | None


STOP_REQUESTED = False
ACTIVE_CODEX_PROCESS: subprocess.Popen[str] | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or utc_now()).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def emit(event: str, **fields: Any) -> None:
    payload = {"at": iso(), "event": event, **fields}
    print(json.dumps(payload, ensure_ascii=False, default=str), flush=True)


def handle_stop_signal(signum: int, _: Any) -> None:
    global STOP_REQUESTED
    STOP_REQUESTED = True
    emit(
        "stop_requested",
        signal=signum,
        activeCodexPid=ACTIVE_CODEX_PROCESS.pid if ACTIVE_CODEX_PROCESS else None,
        behavior=(
            "finish_current_codex_then_stop"
            if ACTIVE_CODEX_PROCESS
            else "stop_listener"
        ),
    )


def ensure_local_directories() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    LOG_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    PLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_DIR.chmod(0o700)
    LOG_DIR.chmod(0o700)


def acquire_listener_lock() -> Any:
    ensure_local_directories()
    lock_file = LOCK_PATH.open("a+")
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        lock_file.close()
        raise RuntimeError("another Company Role calibration listener is running") from error
    lock_file.seek(0)
    lock_file.truncate()
    lock_file.write(f"{os.getpid()}\n")
    lock_file.flush()
    os.chmod(LOCK_PATH, 0o600)
    return lock_file


def calibration_work_rows(conn: Any, *, limit: int = 100) -> list[dict[str, Any]]:
    return fetch_all(
        conn,
        """
        select
          calibration.id,
          case
            when calibration.status = 'queued' then 'generate'
            when calibration.status = 'running' then 'recover'
            else 'deliver'
          end as work_type,
          case
            when calibration.status = 'queued' then calibration.available_at
            when calibration.status = 'running'
              then calibration.updated_at + interval '2 hours'
            when nullif(
              calibration.payload->'delivery'->>'lastAttemptAt',
              ''
            ) is null then calibration.created_at
            else (
              calibration.payload->'delivery'->>'lastAttemptAt'
            )::timestamptz + interval '12 hours'
          end as work_available_at
        from public.company_role_calibrations calibration
        where calibration.status in ('queued', 'running')
           or (
             calibration.status = 'ready'
             and coalesce(
               calibration.payload->'delivery'->>'status',
               'pending'
             ) <> 'sent'
           )
        order by work_available_at, calibration.created_at, calibration.id
        limit %s
        """,
        (limit,),
    )


def queue_snapshot(conn: Any, *, now: datetime | None = None) -> QueueSnapshot:
    current = now or utc_now()
    rows = calibration_work_rows(conn)
    ready_ids = tuple(
        f"{row['work_type']}:{row['id']}"
        for row in rows
        if isinstance(row.get("work_available_at"), datetime)
        and row["work_available_at"] <= current
    )
    next_available_at = None
    for row in rows:
        available_at = row.get("work_available_at")
        if isinstance(available_at, datetime) and available_at > current:
            next_available_at = available_at
            break
    return QueueSnapshot(
        ready_ids=ready_ids,
        next_available_at=next_available_at,
    )


def calibration_schema_status(conn: Any) -> dict[str, Any]:
    row = fetch_one(
        conn,
        """
        select
          to_regclass('public.company_role_calibrations') is not null
            as has_table,
          to_regprocedure('public.claim_company_role_calibration_v1(text)')
            is not null as has_claim,
          to_regprocedure(
            'public.finish_company_role_calibration_v1(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,jsonb,text)'
          ) is not null as has_finish,
          to_regprocedure(
            'public.mark_company_role_calibration_delivery_v1(uuid,boolean,text)'
          ) is not null as has_delivery,
          exists (
            select 1
            from pg_trigger trigger_row
            join pg_class relation on relation.oid = trigger_row.tgrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'company_roles'
              and trigger_row.tgname = 'company_roles_enqueue_calibration_v1'
              and not trigger_row.tgisinternal
          ) as has_role_enqueue_trigger,
          exists (
            select 1
            from pg_trigger trigger_row
            join pg_class relation on relation.oid = trigger_row.tgrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'company_internal_roles'
              and trigger_row.tgname = 'company_internal_roles_enqueue_calibration_v1'
              and not trigger_row.tgisinternal
          ) as has_internal_role_enqueue_trigger
        """,
    ) or {}
    checks = {key: bool(value) for key, value in row.items()}
    return {**checks, "ready": bool(checks) and all(checks.values())}


def notification_status(conn: Any) -> dict[str, bool]:
    row = fetch_one(
        conn,
        """
        select
          to_regprocedure('public.notify_company_role_calibration_work_v1()')
            is not null as function_exists,
          exists (
            select 1
            from pg_trigger trigger_row
            join pg_class relation on relation.oid = trigger_row.tgrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'company_role_calibrations'
              and trigger_row.tgname = %s
              and not trigger_row.tgisinternal
          ) as trigger_exists
        """,
        (NOTIFY_TRIGGER,),
    )
    return {
        "functionExists": bool((row or {}).get("function_exists")),
        "triggerExists": bool((row or {}).get("trigger_exists")),
    }


def database_check() -> dict[str, Any]:
    with connect() as conn:
        calibration = calibration_schema_status(conn)
        notifications = notification_status(conn)
        snapshot = (
            queue_snapshot(conn)
            if calibration.get("has_table")
            else QueueSnapshot(ready_ids=(), next_available_at=None)
        )
    return {
        "calibration": calibration,
        "notifications": notifications,
        "queue": {
            "readyCount": snapshot.ready_count,
            "readyWorkIds": list(snapshot.ready_ids),
            "nextAvailableAt": (
                iso(snapshot.next_available_at)
                if snapshot.next_available_at is not None
                else None
            ),
        },
    }


def local_prerequisites() -> dict[str, Any]:
    load_dotenv(ROOT.parent / "worker.env", override=False)
    load_dotenv(ROOT / ".env.local", override=False)
    try:
        codex_binary = str(resolve_codex_binary())
        codex_error = None
    except Exception as error:
        codex_binary = None
        codex_error = f"{type(error).__name__}: {error}"
    paths = {
        "helper": HELPER_PATH.exists(),
        "prompt": PROMPT_PATH.exists(),
        "runbook": RUNBOOK_PATH.exists(),
    }
    secret_exists = bool(
        str(os.environ.get("INTERNAL_WORKER_API_SECRET") or "").strip()
    )
    return {
        "ready": all(paths.values()) and secret_exists and codex_binary is not None,
        "codexBinary": codex_binary,
        "codexError": codex_error,
        "internalWorkerApiSecretExists": secret_exists,
        "paths": paths,
    }


def resolve_codex_binary() -> Path:
    configured = str(os.environ.get("HARPER_CALIBRATION_CODEX_BIN") or "").strip()
    candidates = [
        Path(configured) if configured else None,
        Path("/Applications/ChatGPT.app/Contents/Resources/codex"),
        Path(shutil.which("codex")) if shutil.which("codex") else None,
    ]
    for candidate in candidates:
        if candidate is not None and candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError(
        "Codex executable not found; set HARPER_CALIBRATION_CODEX_BIN to its absolute path"
    )


def codex_command(codex_binary: Path) -> list[str]:
    model = str(os.environ.get("HARPER_CALIBRATION_CODEX_MODEL") or DEFAULT_MODEL).strip()
    reasoning_effort = str(
        os.environ.get("HARPER_CALIBRATION_CODEX_REASONING_EFFORT")
        or DEFAULT_REASONING_EFFORT
    ).strip()
    return [
        str(codex_binary),
        "exec",
        "--ignore-user-config",
        "--strict-config",
        "--cd",
        str(ROOT),
        "--approve-for-me",
        "--model",
        model,
        "--config",
        f'model_reasoning_effort="{reasoning_effort}"',
        "--config",
        "sandbox_workspace_write.network_access=true",
        "--json",
        "--color",
        "never",
        "-",
    ]


def runner_id() -> str:
    configured = str(os.environ.get("HARPER_CALIBRATION_RUNNER") or "").strip()
    return (configured or f"codex-event:{socket.gethostname()}")[:120]


def render_worker_prompt(worker_runner_id: str) -> str:
    return (
        PROMPT_PATH.read_text(encoding="utf-8")
        .replace("{{CALIBRATION_PYTHON}}", shlex.quote(sys.executable))
        .replace("{{CALIBRATION_RUNNER}}", shlex.quote(worker_runner_id))
    )


def run_codex_worker(snapshot_before: QueueSnapshot) -> int:
    global ACTIVE_CODEX_PROCESS
    ensure_local_directories()
    codex_binary = resolve_codex_binary()
    worker_runner_id = runner_id()
    prompt = render_worker_prompt(worker_runner_id)
    timestamp = utc_now().strftime("%Y%m%dT%H%M%S%fZ")
    event_log = LOG_DIR / f"company-role-calibration-codex-run-{timestamp}.jsonl"
    error_log = LOG_DIR / f"company-role-calibration-codex-run-{timestamp}.error.log"
    command = codex_command(codex_binary)
    emit(
        "codex_started",
        readyCount=snapshot_before.ready_count,
        readyIds=list(snapshot_before.ready_ids),
        eventLog=str(event_log),
        errorLog=str(error_log),
        runner=worker_runner_id,
    )
    environment = os.environ.copy()
    environment["PYTHONUNBUFFERED"] = "1"
    environment["HARPER_CALIBRATION_RUNNER"] = worker_runner_id
    try:
        event_log.touch(mode=0o600, exist_ok=True)
        error_log.touch(mode=0o600, exist_ok=True)
        event_log.chmod(0o600)
        error_log.chmod(0o600)
        with event_log.open("a", encoding="utf-8") as stdout_file, error_log.open(
            "a", encoding="utf-8"
        ) as stderr_file:
            process = subprocess.Popen(
                command,
                cwd=ROOT,
                env=environment,
                stdin=subprocess.PIPE,
                stdout=stdout_file,
                stderr=stderr_file,
                text=True,
            )
            ACTIVE_CODEX_PROCESS = process
            assert process.stdin is not None
            process.stdin.write(prompt)
            process.stdin.close()
            while process.poll() is None:
                time.sleep(1)
            return_code = int(
                process.returncode if process.returncode is not None else 1
            )
    finally:
        ACTIVE_CODEX_PROCESS = None
    emit(
        "codex_finished",
        returnCode=return_code,
        eventLog=str(event_log),
        errorLog=str(error_log),
        stopRequested=STOP_REQUESTED,
    )
    return return_code


def seconds_until(value: datetime | None, *, now: datetime | None = None) -> float:
    if value is None:
        return float("inf")
    return max(0.0, (value - (now or utc_now())).total_seconds())


def listen_loop() -> int:
    global STOP_REQUESTED
    STOP_REQUESTED = False
    signal.signal(signal.SIGTERM, handle_stop_signal)
    signal.signal(signal.SIGINT, handle_stop_signal)
    listener_lock = acquire_listener_lock()
    if DISABLED_PATH.exists():
        emit("listener_disabled")
        listener_lock.close()
        return 0

    emit("listener_starting", pid=os.getpid(), channel=NOTIFY_CHANNEL)
    codex_retry_at = 0.0
    reconnect_delay = 1.0

    try:
        while not STOP_REQUESTED:
            try:
                with connect(autocommit=True) as conn:
                    conn.execute(f"listen {NOTIFY_CHANNEL}")
                    emit("database_listening", channel=NOTIFY_CHANNEL)
                    reconnect_delay = 1.0
                    refresh_queue = True
                    next_available_at: datetime | None = None

                    while not STOP_REQUESTED:
                        monotonic_now = time.monotonic()
                        if refresh_queue:
                            snapshot = queue_snapshot(conn)
                            next_available_at = snapshot.next_available_at
                            refresh_queue = False
                            if snapshot.ready_count > 0 and monotonic_now >= codex_retry_at:
                                calibration = calibration_schema_status(conn)
                                notifications = notification_status(conn)
                                if not calibration.get("ready"):
                                    emit(
                                        "codex_blocked",
                                        reason="calibration_preflight_failed",
                                        details=calibration,
                                    )
                                    codex_retry_at = (
                                        monotonic_now + PREFLIGHT_BACKOFF_SECONDS
                                    )
                                elif not all(notifications.values()):
                                    emit(
                                        "codex_blocked",
                                        reason="database_notification_not_installed",
                                        details=notifications,
                                    )
                                    codex_retry_at = (
                                        monotonic_now + PREFLIGHT_BACKOFF_SECONDS
                                    )
                                else:
                                    return_code = run_codex_worker(snapshot)
                                    if STOP_REQUESTED:
                                        break
                                    after = queue_snapshot(conn)
                                    if return_code != 0 or (
                                        after.ready_ids
                                        and after.ready_ids == snapshot.ready_ids
                                    ):
                                        codex_retry_at = (
                                            time.monotonic()
                                            + CODEX_FAILURE_BACKOFF_SECONDS
                                        )
                                        emit(
                                            "codex_backoff",
                                            seconds=CODEX_FAILURE_BACKOFF_SECONDS,
                                            readyIds=list(after.ready_ids),
                                        )
                                    else:
                                        codex_retry_at = 0.0
                                    refresh_queue = True
                                    continue

                        wait_candidates = [
                            float(SIGNAL_CHECK_INTERVAL_SECONDS),
                        ]
                        if next_available_at is not None:
                            wait_candidates.append(seconds_until(next_available_at))
                        if codex_retry_at > time.monotonic():
                            wait_candidates.append(
                                max(0.0, codex_retry_at - time.monotonic())
                            )
                        timeout = max(0.1, min(wait_candidates))
                        notification_received = False
                        for notification in conn.notifies(
                            timeout=timeout, stop_after=1
                        ):
                            notification_received = True
                            emit(
                                "database_notification",
                                channel=notification.channel,
                                payload=notification.payload,
                            )
                        if notification_received:
                            refresh_queue = True
                            continue
                        if next_available_at is not None and seconds_until(
                            next_available_at
                        ) <= 0:
                            refresh_queue = True
                        if codex_retry_at and time.monotonic() >= codex_retry_at:
                            refresh_queue = True
            except Exception as error:
                emit(
                    "listener_error",
                    error=f"{type(error).__name__}: {error}",
                    retryInSeconds=reconnect_delay,
                )
                deadline = time.monotonic() + reconnect_delay
                while not STOP_REQUESTED and time.monotonic() < deadline:
                    time.sleep(0.25)
                reconnect_delay = min(reconnect_delay * 2, 60.0)
    finally:
        listener_lock.close()
        emit("listener_stopped")
    return 0


def launchd_domain() -> str:
    return f"gui/{os.getuid()}"


def launchd_service() -> str:
    return f"{launchd_domain()}/{LABEL}"


def launchctl(
    arguments: Sequence[str], *, check: bool = False
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["/bin/launchctl", *arguments],
        text=True,
        capture_output=True,
        check=check,
    )


def parsed_launchd_status(output: str) -> tuple[str | None, int | None]:
    state_match = re.search(r"\bstate = ([^\n]+)", output)
    pid_match = re.search(r"\bpid = (\d+)", output)
    return (
        state_match.group(1).strip() if state_match else None,
        int(pid_match.group(1)) if pid_match else None,
    )


def local_status() -> LocalStatus:
    result = launchctl(["print", launchd_service()])
    loaded = result.returncode == 0
    state, pid = parsed_launchd_status(result.stdout if loaded else "")
    return LocalStatus(
        installed=PLIST_PATH.exists(),
        enabled=PLIST_PATH.exists() and not DISABLED_PATH.exists(),
        loaded=loaded,
        launchd_state=state,
        pid=pid,
    )


def launch_agent_payload() -> dict[str, Any]:
    return {
        "Label": LABEL,
        "ProgramArguments": [sys.executable, str(SCRIPT_PATH), "run"],
        "WorkingDirectory": str(ROOT),
        "RunAtLoad": True,
        "KeepAlive": {"Crashed": True},
        "ProcessType": "Background",
        "StandardOutPath": str(LISTENER_STDOUT),
        "StandardErrorPath": str(LISTENER_STDERR),
    }


def write_launch_agent() -> None:
    ensure_local_directories()
    temporary = PLIST_PATH.with_suffix(".plist.tmp")
    with temporary.open("wb") as output:
        plistlib.dump(launch_agent_payload(), output, sort_keys=True)
    os.replace(temporary, PLIST_PATH)
    os.chmod(PLIST_PATH, 0o600)


def command_install(_: argparse.Namespace) -> int:
    first_install = not PLIST_PATH.exists()
    write_launch_agent()
    if first_install:
        DISABLED_PATH.write_text(f"installed disabled at {iso()}\n", encoding="utf-8")
    if DISABLED_PATH.exists():
        DISABLED_PATH.chmod(0o600)
    print(f"installed: {PLIST_PATH}")
    if DISABLED_PATH.exists():
        print("state: OFF (run the 'on' command after the database migration is live)")
    else:
        print("state: ON setting preserved; run 'off' before changing checkout or Python")
    return 0


def command_on(_: argparse.Namespace) -> int:
    checks = database_check()
    prerequisites = local_prerequisites()
    calibration_ready = bool(checks["calibration"].get("ready"))
    notifications_ready = all(checks["notifications"].values())
    if not prerequisites["ready"] or not calibration_ready or not notifications_ready:
        print(
            json.dumps(
                {"localPrerequisites": prerequisites, "database": checks},
                ensure_ascii=False,
                default=str,
                indent=2,
            )
        )
        print("not enabled: local/database calibration preflight is not ready")
        return 2

    write_launch_agent()
    if DISABLED_PATH.exists():
        DISABLED_PATH.unlink()
    launchctl(["enable", launchd_service()])
    status = local_status()
    if not status.loaded:
        result = launchctl(["bootstrap", launchd_domain(), str(PLIST_PATH)])
        if result.returncode != 0:
            print(result.stderr.strip() or result.stdout.strip())
            return result.returncode or 1
    else:
        launchctl(["kickstart", launchd_service()])
    print("Company Role calibration Codex listener: ON")
    return 0


def command_off(_: argparse.Namespace) -> int:
    ensure_local_directories()
    DISABLED_PATH.write_text(f"disabled at {iso()}\n", encoding="utf-8")
    DISABLED_PATH.chmod(0o600)
    launchctl(["disable", launchd_service()])
    status = local_status()
    if status.loaded:
        launchctl(["kill", "SIGTERM", launchd_service()])
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and local_status().pid is not None:
            time.sleep(0.25)
    status = local_status()
    if status.pid is None:
        print("Company Role calibration Codex listener: OFF")
    else:
        print(
            "Company Role calibration Codex listener: STOPPING "
            f"(current Codex run will finish first, listener pid={status.pid})"
        )
    return 0


def command_status(args: argparse.Namespace) -> int:
    local = local_status()
    payload: dict[str, Any] = {
        "local": asdict(local),
        "localPrerequisites": local_prerequisites(),
    }
    try:
        payload["database"] = database_check()
    except Exception as error:
        payload["database"] = {
            "error": f"{type(error).__name__}: {error}",
        }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, default=str, indent=2))
        return 0
    print(f"installed: {'yes' if local.installed else 'no'}")
    print(f"enabled: {'yes' if local.enabled else 'no'}")
    print(f"loaded: {'yes' if local.loaded else 'no'}")
    print(f"state: {local.launchd_state or '-'}")
    print(f"pid: {local.pid or '-'}")
    database = payload.get("database") or {}
    if database.get("error"):
        print(f"database: ERROR ({database['error']})")
    else:
        calibration = database["calibration"]
        notifications = database["notifications"]
        queue = database["queue"]
        print(
            "local prerequisites: "
            f"{'ready' if payload['localPrerequisites']['ready'] else 'missing'}"
        )
        print(f"calibration DB ready: {str(bool(calibration.get('ready'))).lower()}")
        print(
            "notification trigger: "
            f"{'ready' if all(notifications.values()) else 'missing'}"
        )
        print(f"due work: {queue['readyCount']}")
        print(f"next retry/due: {queue['nextAvailableAt'] or '-'}")
    return 0


def tail_lines(path: Path, limit: int) -> list[str]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", errors="replace") as input_file:
        return input_file.readlines()[-limit:]


def command_logs(args: argparse.Namespace) -> int:
    candidates = [LISTENER_STDOUT, LISTENER_STDERR]
    candidates.extend(
        sorted(LOG_DIR.glob("company-role-calibration-codex-run-*"), reverse=True)[:4]
    )
    found = False
    for path in candidates:
        lines = tail_lines(path, args.lines)
        if not lines:
            continue
        found = True
        print(f"==> {path} <==")
        print("".join(lines).rstrip())
    if not found:
        print("no listener or Codex logs yet")
    return 0


def command_check(_: argparse.Namespace) -> int:
    payload = {
        "localPrerequisites": local_prerequisites(),
        "promptPath": str(PROMPT_PATH),
        "runbookPath": str(RUNBOOK_PATH),
        "runner": runner_id(),
        "database": database_check(),
    }
    print(json.dumps(payload, ensure_ascii=False, default=str, indent=2))
    return 0


def command_run(_: argparse.Namespace) -> int:
    return listen_loop()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Control the local event-driven Company Role calibration Codex listener."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("install").set_defaults(func=command_install)
    sub.add_parser("on").set_defaults(func=command_on)
    sub.add_parser("off").set_defaults(func=command_off)
    status = sub.add_parser("status")
    status.add_argument("--json", action="store_true")
    status.set_defaults(func=command_status)
    logs = sub.add_parser("logs")
    logs.add_argument("--lines", type=int, default=40)
    logs.set_defaults(func=command_logs)
    sub.add_parser("check").set_defaults(func=command_check)
    sub.add_parser("run").set_defaults(func=command_run)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

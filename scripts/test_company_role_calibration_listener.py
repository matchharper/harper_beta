from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import company_role_calibration_listener as listener


class FakeConnection:
    pass


class CompanyRoleCalibrationListenerTest(unittest.TestCase):
    def test_notification_migration_keeps_queue_authoritative_and_payload_private(self) -> None:
        migration = (
            listener.ROOT
            / "supabase"
            / "migrations"
            / "20260908190000_company_role_calibration_notify.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("pg_notify(", migration)
        self.assertIn(listener.NOTIFY_CHANNEL, migration)
        self.assertIn(
            "after insert or update of status, available_at, payload",
            migration,
        )
        self.assertIn("'calibrationId', new.id", migration)
        self.assertNotIn("roleId', new.role_id", migration)
        self.assertNotIn("companyWorkspaceId", migration)

    def test_event_prompt_is_checkout_portable_and_finishes_before_delivery(self) -> None:
        prompt = listener.PROMPT_PATH.read_text(encoding="utf-8")
        self.assertNotIn("/Users/", prompt)
        self.assertLess(prompt.index("`finish` 성공"), prompt.index("즉시 `deliver`"))
        self.assertIn("최대 10개 Role", prompt)

    def test_rendered_prompt_uses_the_installer_python_and_runner(self) -> None:
        with patch.object(listener.sys, "executable", "/tmp/Calibration Env/python3"):
            prompt = listener.render_worker_prompt("codex-event:test host")
        self.assertNotIn("{{CALIBRATION_PYTHON}}", prompt)
        self.assertNotIn("{{CALIBRATION_RUNNER}}", prompt)
        self.assertIn("'/tmp/Calibration Env/python3'", prompt)
        self.assertIn("'codex-event:test host'", prompt)

    def test_queue_snapshot_separates_due_generation_delivery_and_future_retry(self) -> None:
        now = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "queued",
                "work_type": "generate",
                "work_available_at": now - timedelta(seconds=1),
            },
            {
                "id": "delivery",
                "work_type": "deliver",
                "work_available_at": now,
            },
            {
                "id": "retry-later",
                "work_type": "deliver",
                "work_available_at": now + timedelta(hours=12),
            },
        ]
        with patch.object(listener, "calibration_work_rows", return_value=rows):
            snapshot = listener.queue_snapshot(FakeConnection(), now=now)
        self.assertEqual(
            snapshot.ready_ids,
            ("generate:queued", "deliver:delivery"),
        )
        self.assertEqual(snapshot.next_available_at, rows[-1]["work_available_at"])

    def test_codex_command_is_noninteractive_and_workspace_scoped(self) -> None:
        command = listener.codex_command(Path("/tmp/codex"))
        self.assertEqual(command[:2], ["/tmp/codex", "exec"])
        self.assertIn("--ignore-user-config", command)
        self.assertIn("--strict-config", command)
        self.assertIn("--approve-for-me", command)
        self.assertIn("sandbox_workspace_write.network_access=true", command)
        self.assertNotIn("--sandbox", command)
        self.assertEqual(command[-1], "-")

    def test_launch_agent_captures_this_checkout_and_python(self) -> None:
        payload = listener.launch_agent_payload()
        self.assertEqual(payload["Label"], listener.LABEL)
        self.assertEqual(payload["ProgramArguments"][-1], "run")
        self.assertEqual(payload["ProgramArguments"][1], str(listener.SCRIPT_PATH))
        self.assertEqual(payload["WorkingDirectory"], str(listener.ROOT))
        self.assertEqual(payload["KeepAlive"], {"Crashed": True})
        self.assertTrue(payload["RunAtLoad"])

    def test_launchd_status_parser(self) -> None:
        state, pid = listener.parsed_launchd_status(
            "state = running\n\tpid = 12345\n"
        )
        self.assertEqual(state, "running")
        self.assertEqual(pid, 12345)


if __name__ == "__main__":
    unittest.main()

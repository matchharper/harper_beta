#!/usr/bin/env python3
"""Regression tests for internal role-matching run memory."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import requests

from internal_role_matching_run_memory import (
    MAX_CONTENT_LENGTH,
    normalize_content,
    save_run_directory,
)
from prepare_internal_role_matching_agent_review import load_previous_run_memory


ROLE_ID = "3bb22f4a-1c13-4bf1-be07-6034605d6840"
VALID_MEMORY = """# 다음 run 참고

- 기준: 현재 source를 다시 확인합니다.
- 결과: 한 명을 선택했습니다.
- 미해결: 보상을 확인해야 합니다.
- 다음 run: 새 가입자를 먼저 봅니다.
"""


class RunMemoryTest(unittest.TestCase):
    def make_run(self, root: Path, **overrides: object) -> Path:
        run_dir = root / "20260722T120000Z"
        run_dir.mkdir()
        manifest = {
            "roleId": ROLE_ID,
            "runId": run_dir.name,
            "executionMode": "dry_run",
            "status": "completed_dry_run",
            "sourceUnchangedAtFinalPreflight": True,
            "externalModelCallsAttempted": 0,
            "candidatePayloadSentToExternalModel": False,
            "databaseWrites": 0,
            "considerationWrites": 0,
            "reviewMemoryWrites": 0,
            "fitWrites": 0,
            "recommendationRunsQueued": 0,
            "deliveriesAttempted": 0,
            **overrides,
        }
        (run_dir / "run_manifest.json").write_text(
            json.dumps(manifest), encoding="utf-8"
        )
        (run_dir / "run_memory.md").write_text(VALID_MEMORY, encoding="utf-8")
        return run_dir

    def test_content_contract(self) -> None:
        self.assertEqual(normalize_content(VALID_MEMORY), VALID_MEMORY.strip())
        with self.assertRaises(ValueError):
            normalize_content("x" * (MAX_CONTENT_LENGTH + 1))
        with self.assertRaises(ValueError):
            normalize_content("\n".join(f"- item {index}" for index in range(5)))

    def test_success_is_idempotent_in_manifest_terms(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run_dir = self.make_run(Path(directory))
            row = {"created_at": "2026-07-22T12:00:01Z"}
            with patch(
                "internal_role_matching_run_memory.save_run_memory",
                return_value=row,
            ) as save:
                first = save_run_directory(run_dir, "https://example.test", "key")
                second = save_run_directory(run_dir, "https://example.test", "key")
            manifest = json.loads(
                (run_dir / "run_manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(save.call_count, 2)
            self.assertEqual(first, second)
            self.assertEqual(manifest["status"], "completed_dry_run")
            self.assertEqual(manifest["databaseWrites"], 0)
            self.assertEqual(manifest["runMemoryWrites"], 1)

    def test_rejects_missing_preflight_and_dry_run_business_writes(self) -> None:
        cases = (
            {"sourceUnchangedAtFinalPreflight": None},
            {"fitWrites": 1},
            {"status": "invalid_external_model_call"},
            {"externalModelCallsAttempted": 1},
        )
        for index, overrides in enumerate(cases):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as directory:
                run_dir = self.make_run(Path(directory), **overrides)
                with patch("internal_role_matching_run_memory.save_run_memory") as save:
                    with self.assertRaises(RuntimeError):
                        save_run_directory(run_dir, "https://example.test", "key")
                    save.assert_not_called()

    def test_failed_write_is_reported_and_retryable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run_dir = self.make_run(Path(directory))
            with patch(
                "internal_role_matching_run_memory.save_run_memory",
                side_effect=requests.ConnectionError("offline"),
            ):
                with self.assertRaises(requests.ConnectionError):
                    save_run_directory(run_dir, "https://example.test", "key")
            failed = json.loads(
                (run_dir / "run_manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(failed["status"], "run_memory_write_failed")
            self.assertEqual(failed["matchingCompletionStatus"], "completed_dry_run")
            self.assertEqual(failed["runMemoryWrites"], 0)

            with patch(
                "internal_role_matching_run_memory.save_run_memory",
                return_value={"created_at": "2026-07-22T12:00:02Z"},
            ):
                save_run_directory(run_dir, "https://example.test", "key")
            recovered = json.loads(
                (run_dir / "run_manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(recovered["status"], "completed_dry_run")
            self.assertEqual(recovered["runMemoryWrites"], 1)
            self.assertNotIn("runMemoryError", recovered)

    def test_invalid_memory_file_is_reported_as_write_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run_dir = self.make_run(Path(directory))
            (run_dir / "run_memory.md").write_text(
                "x" * (MAX_CONTENT_LENGTH + 1), encoding="utf-8"
            )
            with patch("internal_role_matching_run_memory.save_run_memory") as save:
                with self.assertRaises(ValueError):
                    save_run_directory(run_dir, "https://example.test", "key")
                save.assert_not_called()
            failed = json.loads(
                (run_dir / "run_manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(failed["status"], "run_memory_write_failed")
            self.assertEqual(failed["runMemoryWrites"], 0)

    def test_read_failure_is_non_blocking(self) -> None:
        with patch(
            "prepare_internal_role_matching_agent_review.fetch_latest_run_memory",
            side_effect=requests.ConnectionError("offline"),
        ):
            memory, error = load_previous_run_memory(
                "https://example.test", "key", ROLE_ID
            )
        self.assertIsNone(memory)
        self.assertIn("ConnectionError", error or "")


if __name__ == "__main__":
    unittest.main()

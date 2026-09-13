from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from company_role_recurring_matching import (
    COMPANY_RUN_CONTRACT_VERSION,
    MAX_COMPANY_RUN_RECOMMENDATIONS,
    build_parser,
    company_run_role_notification_text,
    previous_fit_snapshot,
    scheduled_batch_id,
    scheduled_for_value,
    validate_batch_rerank_decision,
    validate_context_output,
    validate_search_decision,
)


class CompanyRunScheduleTests(unittest.TestCase):
    def test_monday_and_thursday_slots_are_stable_at_eight_kst(self) -> None:
        monday = scheduled_for_value("2026-09-14T08:00:00+09:00")
        thursday = scheduled_for_value("2026-09-17T08:00:00+09:00")

        self.assertEqual(monday, datetime(2026, 9, 13, 23, tzinfo=timezone.utc))
        self.assertEqual(thursday, datetime(2026, 9, 16, 23, tzinfo=timezone.utc))
        self.assertEqual(scheduled_batch_id(monday), scheduled_batch_id(monday))
        self.assertNotEqual(scheduled_batch_id(monday), scheduled_batch_id(thursday))

    def test_invalid_weekday_or_time_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Monday or Thursday"):
            scheduled_for_value("2026-09-15T08:00:00+09:00")
        with self.assertRaisesRegex(ValueError, "08:00"):
            scheduled_for_value("2026-09-14T09:00:00+09:00")

    def test_delayed_invocation_reuses_the_most_recent_slot(self) -> None:
        delayed = scheduled_for_value(
            None,
            now=datetime(2026, 9, 15, 2, tzinfo=timezone.utc),
        )

        self.assertEqual(delayed, datetime(2026, 9, 13, 23, tzinfo=timezone.utc))

    def test_parser_exposes_the_canonical_batch_commands(self) -> None:
        parser = build_parser()
        enqueue = parser.parse_args(
            ["enqueue-scheduled", "--scheduled-for", "2026-09-14T08:00:00+09:00"]
        )
        start = parser.parse_args(
            ["start", "--batch-id", "00000000-0000-4000-8000-000000000001"]
        )
        notify = parser.parse_args(
            ["notify-batch", "--batch-id", "00000000-0000-4000-8000-000000000001"]
        )

        self.assertEqual(enqueue.scheduled_for, "2026-09-14T08:00:00+09:00")
        self.assertEqual(start.batch_id, "00000000-0000-4000-8000-000000000001")
        self.assertEqual(notify.batch_id, start.batch_id)


class CompanyRunOutputContractTests(unittest.TestCase):
    def test_context_output_is_rendered_as_at_most_ten_bullets(self) -> None:
        result = validate_context_output(
            {
                "bullets": ["회사 공통: B2B 운영 경험을 반복적으로 높게 평가함."],
                "reason": "새 회사 피드백을 반영함.",
            }
        )

        self.assertEqual(result["text"], "- 회사 공통: B2B 운영 경험을 반복적으로 높게 평가함.")
        self.assertEqual(result["contractVersion"], "company-context-output-v1")
        with self.assertRaisesRegex(ValueError, "at most 10"):
            validate_context_output(
                {"bullets": [f"signal {index}" for index in range(11)], "reason": "too many"}
            )

    def test_search_decision_requires_a_real_instruction_only_when_running(self) -> None:
        skipped = validate_search_decision(
            {"runMatching": False, "reason": "새 탐색 효용이 낮음.", "searchInstruction": None}
        )
        self.assertFalse(skipped["runMatching"])
        with self.assertRaisesRegex(ValueError, "requires searchInstruction"):
            validate_search_decision(
                {"runMatching": True, "reason": "새 후보가 있음.", "searchInstruction": None}
            )
        with self.assertRaisesRegex(ValueError, "gate is closed"):
            validate_search_decision(
                {
                    "runMatching": True,
                    "reason": "새 후보가 있음.",
                    "searchInstruction": "인접 경험을 본다.",
                },
                search_allowed=False,
            )

    def test_batch_rerank_covers_every_company_talent_group_once(self) -> None:
        source = {
            "groups": [
                {
                    "companyWorkspaceId": "company-1",
                    "talentId": "talent-1",
                    "roleOptions": [{"roleId": "role-1"}, {"roleId": "role-2"}],
                }
            ]
        }
        result = validate_batch_rerank_decision(
            {
                "decisions": [
                    {
                        "companyWorkspaceId": "company-1",
                        "talentId": "talent-1",
                        "selectedRoleId": "role-2",
                        "reason": "이 Role이 현재 근거와 가장 직접적으로 맞음.",
                    }
                ]
            },
            source,
        )
        self.assertEqual(result[0]["selectedRoleId"], "role-2")
        with self.assertRaisesRegex(ValueError, "missing 1"):
            validate_batch_rerank_decision({"decisions": []}, source)

    def test_batch_rerank_allows_at_most_three_selected_talents(self) -> None:
        source = {
            "groups": [
                {
                    "companyWorkspaceId": "company-1",
                    "talentId": f"talent-{index}",
                    "roleOptions": [{"roleId": f"role-{index}"}],
                }
                for index in range(1, 5)
            ]
        }

        def decisions(selected_count: int) -> dict[str, list[dict[str, str | None]]]:
            return {
                "decisions": [
                    {
                        "companyWorkspaceId": "company-1",
                        "talentId": f"talent-{index}",
                        "selectedRoleId": (
                            f"role-{index}" if index <= selected_count else None
                        ),
                        "reason": "회사 전체 우선순위와 이번 run의 상한을 함께 적용함.",
                    }
                    for index in range(1, 5)
                ]
            }

        accepted = validate_batch_rerank_decision(
            decisions(MAX_COMPANY_RUN_RECOMMENDATIONS), source
        )
        self.assertEqual(
            sum(item["selectedRoleId"] is not None for item in accepted),
            MAX_COMPANY_RUN_RECOMMENDATIONS,
        )
        with self.assertRaisesRegex(ValueError, "at most 3 talents per company_run"):
            validate_batch_rerank_decision(decisions(4), source)

    def test_previous_fit_snapshot_is_preserved_across_same_run_retry(self) -> None:
        prior = {
            "label": "hold",
            "score": 68,
            "reason": "확인이 필요한 사실이 있었음.",
            "recommend": False,
            "human_label": None,
            "human_reason": None,
            "last_evaluated_at": datetime(2026, 8, 19, tzinfo=timezone.utc),
        }
        first = previous_fit_snapshot(prior, "run-1")
        retry = previous_fit_snapshot(
            {
                "label": "fit",
                "score": 88,
                "reason": "현재 판단",
                "recommend": False,
                "company_side_evaluation_metadata": {
                    "runId": "run-1",
                    "previousFit": first,
                },
            },
            "run-1",
        )

        self.assertEqual(first, retry)
        self.assertEqual(retry["label"], "hold")
        self.assertEqual(retry["score"], 68)

    def test_role_notification_uses_saved_summary_and_escapes_slack_markup(self) -> None:
        text = company_run_role_notification_text(
            {
                "company_name": "A&B",
                "role_name": "FDE <Korea>",
                "status": "succeeded",
                "result": {"summary": "기준 1개를 갱신했고 이번 탐색은 생략했습니다."},
            }
        )

        self.assertIn("A&amp;B", text)
        self.assertIn("FDE &lt;Korea&gt;", text)
        self.assertIn("이번 탐색은 생략", text)

    def test_scheduled_migration_keeps_role_rows_in_the_existing_ledger(self) -> None:
        migration = (
            Path(__file__).resolve().parents[1]
            / "supabase/migrations/20260911100000_company_run_scheduled_batches.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("insert into public.company_context_runs", migration)
        self.assertIn("'batchRunId'", migration)
        self.assertIn("'company-run-v1'", migration)
        self.assertIn("not in ('true', '1', 'yes', 'on')", migration)
        self.assertEqual(COMPANY_RUN_CONTRACT_VERSION, "company-run-v1")


if __name__ == "__main__":
    unittest.main()

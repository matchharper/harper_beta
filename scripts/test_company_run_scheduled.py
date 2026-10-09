from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from company_role_recurring_matching import (
    MAX_COMPANY_RUN_RECOMMENDATIONS,
    company_run_role_notification_text,
    previous_fit_snapshot,
    validate_batch_rerank_decision,
    validate_context_output,
    validate_search_decision,
)


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

if __name__ == "__main__":
    unittest.main()

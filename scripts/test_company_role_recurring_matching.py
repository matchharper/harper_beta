from __future__ import annotations

import argparse
import inspect
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from company_role_recurring_matching import (
    DEFAULT_CANDIDATE_EVALUATION_LIMIT,
    DEFAULT_CANDIDATE_SCAN_LIMIT,
    FIT_EVALUATION_CONTRACT_TEXT,
    MAX_EVALUATIONS_PER_RUN,
    MAX_DISCOVERY_EVALUATIONS_PER_RUN,
    MAX_CANDIDATE_SCAN_PER_LANE,
    MAX_REEVALUATION_EVALUATIONS_PER_RUN,
    candidate_exclusion,
    build_parser,
    clear_generated_files,
    command_fail,
    command_finish,
    command_start,
    command_skip,
    command_validate_fits,
    candidate_input_fingerprint,
    candidate_rows,
    clear_private_run_artifacts,
    context_source_packet,
    ordered_candidate_ids,
    next_lane_candidates,
    normalize_context_text,
    pair_inputs_reusable,
    role_matching_fingerprint,
    render_candidate_evaluation_document,
    source_cursor,
    validate_evaluation,
    validate_context_structure,
    validate_reevaluation_skips,
    validate_read_only_sql,
    validate_semantic_neutral_retrieval_sql,
    workflow_schema_status,
    assert_run_writable,
    require_run,
)


TALENT_ID = "00000000-0000-4000-8000-000000000501"
ROLE_ID = "00000000-0000-4000-8000-000000000101"


class RetrievalSqlTests(unittest.TestCase):
    def test_accepts_one_select_or_cte(self) -> None:
        self.assertEqual(validate_read_only_sql("select 1;"), "select 1")
        self.assertEqual(
            validate_read_only_sql("with candidates as (select 1) select * from candidates"),
            "with candidates as (select 1) select * from candidates",
        )
        self.assertEqual(
            validate_read_only_sql("-- revision note\nwith candidates as (select 1) select * from candidates"),
            "-- revision note\nwith candidates as (select 1) select * from candidates",
        )

    def test_rejects_writes_and_multiple_statements(self) -> None:
        with self.assertRaises(ValueError):
            validate_read_only_sql("update public.talent_users set name = 'x'")
        with self.assertRaises(ValueError):
            validate_read_only_sql("select 1; select 2")

    def test_forbidden_words_inside_literals_and_comments_are_not_commands(self) -> None:
        sql = "-- update history\nselect 'call center' as domain"
        self.assertEqual(validate_read_only_sql(sql), sql)

    def test_semantic_retrieval_allows_dynamic_role_aware_sql(self) -> None:
        allowed = """
        with candidates as (
          select
            talent.user_id as talent_id,
            case
              when experience.role ilike '%engineer%' then 10
              else 0
            end as retrieval_priority
          from public.talent_users talent
          left join public.talent_experiences experience
            on experience.talent_id = talent.user_id
          where talent.resume_text ~* 'Japan|Japanese'
        )
        select talent_id, max(retrieval_priority) as retrieval_priority
        from candidates
        group by talent_id
        order by retrieval_priority desc, talent_id
        limit 150
        """
        self.assertEqual(validate_semantic_neutral_retrieval_sql(allowed), allowed.strip())

    def test_semantic_retrieval_requires_id_limit_and_stable_order(self) -> None:
        for sql in (
            "select user_id from public.talent_users order by user_id limit 150",
            "select user_id as talent_id from public.talent_users order by talent_id",
            "select user_id as talent_id from public.talent_users limit 150",
            "select user_id as talent_id from public.talent_users order by updated_at desc limit 150",
        ):
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                validate_semantic_neutral_retrieval_sql(sql)

    def test_rejects_any_opportunity_discovery_run_access(self) -> None:
        with self.assertRaisesRegex(ValueError, "opportunity_discovery_run"):
            validate_semantic_neutral_retrieval_sql(
                "select talent_id from public.opportunity_discovery_run "
                "order by talent_id limit 10"
            )


class SchemaPreflightTests(unittest.TestCase):
    class FakeConnection:
        def __init__(
            self,
            relations: set[str],
            procedures: set[str],
            columns: set[tuple[str, str]],
            *,
            is_auto_default: str | None = None,
            triggers: set[str] | None = None,
        ):
            self.relations = relations
            self.procedures = procedures
            self.columns = columns
            self.is_auto_default = is_auto_default
            self.triggers = triggers or set()

        def cursor(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, query, params=()):
            if "to_regclass" in query:
                self.row = {"exists": params[0] in self.relations}
            elif "to_regprocedure" in query:
                self.row = {"exists": params[0] in self.procedures}
            elif "column_default" in query:
                self.row = {"column_default": self.is_auto_default}
            elif "count(*)::integer as count" in query:
                self.row = {
                    "count": 2 if "company_behavior_contexts" in query else 6
                }
            elif "information_schema.columns" in query:
                self.row = {"exists": tuple(params) in self.columns}
            elif "pg_trigger" in query:
                self.row = {"exists": params[0] in self.triggers}
            else:
                raise AssertionError(query)

        def fetchall(self):
            return [self.row]

    def test_preflight_reports_missing_migration_without_writes(self) -> None:
        status = workflow_schema_status(self.FakeConnection(set(), set(), set()))
        self.assertFalse(status["ready"])
        self.assertEqual(status["reason"], "migration_not_applied")
        self.assertEqual(status["databaseWrites"], 0)
        self.assertIn("public.company_context_runs", status["missingRelations"])

    def test_preflight_reports_ready_schema(self) -> None:
        status = workflow_schema_status(
            self.FakeConnection(
                {
                    "public.company_behavior_contexts",
                    "public.company_context_runs",
                },
                {
                    "public.enqueue_company_context_run_v1(uuid,text,timestamp with time zone)",
                    "public.enqueue_due_company_context_runs_v1(timestamp with time zone)",
                    "public.claim_company_context_run_v1(text,uuid)",
                    "public.finish_company_context_run_v1(uuid,text,jsonb)",
                },
                {
                    ("company_internal_roles", "is_auto"),
                    ("company_internal_roles", "max_pending_talents"),
                    ("company_internal_roles", "role_status_changed_at"),
                    ("talent_opportunity_fit", "company_side_evaluation_metadata"),
                },
                is_auto_default="true",
                triggers={
                    "company_internal_roles_enqueue_context_run_v1",
                    "company_internal_roles_cancel_context_run_v1",
                    "company_roles_track_status_and_enqueue_context_v1",
                },
            )
        )
        self.assertTrue(status["ready"])
        self.assertEqual(status["runLedger"], "public.company_context_runs")
        self.assertEqual(status["queueColumnCount"], 6)
        self.assertEqual(status["contextColumnCount"], 2)


class RoleScopeContractTests(unittest.TestCase):
    def test_context_sources_cover_company_workspace_and_keep_role_ids(self) -> None:
        source = inspect.getsource(source_cursor) + inspect.getsource(context_source_packet)
        for condition in (
            "message.company_workspace_id = %s::uuid",
            "summary.company_workspace_id = %s::uuid",
            "request.company_workspace_id = %s::uuid",
            "role.company_workspace_id = %s::uuid",
        ):
            self.assertIn(condition, source)
        self.assertNotIn("from public.company_events", source)

    def test_candidate_history_excludes_other_roles_in_target_workspace(self) -> None:
        source = inspect.getsource(candidate_rows)
        self.assertIn("recommendation.role_id = %s::uuid", source)
        self.assertIn(
            "recommendation_role.company_workspace_id is distinct from", source
        )

    def test_corrective_migration_creates_six_column_queue_and_removes_old_state(self) -> None:
        queue_migration = (
            Path(__file__).resolve().parents[1]
            / "supabase/migrations/20260814180000_company_context_run_queue.sql"
        ).read_text(encoding="utf-8")
        context_migration = (
            Path(__file__).resolve().parents[1]
            / "supabase/migrations/20260814200000_company_behavior_contexts_role_current.sql"
        ).read_text(encoding="utf-8")
        queue_body = queue_migration.split(
            "create table if not exists public.company_context_runs (", 1
        )[1].split(");", 1)[0]
        self.assertEqual(
            sum(
                1
                for line in queue_body.splitlines()
                if line.strip().startswith(
                    ("id ", "role_id ", "status ", "trigger_reason ", "available_at ", "result ")
                )
            ),
            6,
        )
        self.assertIn("drop table if exists public.company_role_matching_runs", queue_migration)
        self.assertIn("interval '7 days'", queue_migration)
        self.assertIn("coalesce(internal_role.is_auto, false) = true", queue_migration)
        self.assertIn("automatic company context run requires is_auto=true", queue_migration)
        self.assertIn("company_internal_roles_cancel_context_run_v1", queue_migration)
        self.assertNotIn("interval '72 hours'", queue_migration)
        self.assertIn("create table if not exists public.company_behavior_contexts", context_migration)
        self.assertIn("drop table public.company_role_behavior_contexts", context_migration)
        self.assertIn("drop column if exists context_version", context_migration)
        self.assertIn("drop column if exists changed_domains", context_migration)

    def test_dry_run_terminal_paths_never_finish_the_database_queue(self) -> None:
        finish_source = inspect.getsource(command_finish)
        fail_source = inspect.getsource(command_fail)
        skip_source = inspect.getsource(command_skip)
        self.assertIn('if run.get("dry_run"):', finish_source)
        self.assertIn('run["result"] = jsonable(finished_row.get("result") or result)', finish_source)
        self.assertLess(
            fail_source.index('if run.get("dry_run"):'),
            fail_source.index("finish_queued_run("),
        )
        self.assertIn('if run.get("dry_run"):', skip_source)
        self.assertIn("conn.rollback()", skip_source)
        self.assertIn('0 if run.get("dry_run") else clear_private_run_artifacts', skip_source)

    def test_inactive_role_preview_is_explicit_dry_run_only_and_queue_free(self) -> None:
        start_source = inspect.getsource(command_start)
        writable_source = inspect.getsource(assert_run_writable)
        require_source = inspect.getsource(require_run)
        self.assertIn("--allow-inactive requires both --dry-run and --role-id", start_source)
        self.assertIn('"trigger_reason": "manual"', start_source)
        self.assertIn('"synthetic_queue": bool(args.allow_inactive)', start_source)
        self.assertIn('run.get("dry_run") is True', writable_source)
        self.assertIn('run.get("trigger_reason") == "manual"', writable_source)
        self.assertIn('run.get("synthetic_queue") is True', writable_source)
        self.assertIn('manifest.get("synthetic_queue") is True', require_source)


class EvaluationDocumentTests(unittest.TestCase):
    def test_candidate_page_can_be_empty_and_is_stably_deduplicated(self) -> None:
        self.assertEqual(ordered_candidate_ids([], 150), [])
        self.assertEqual(
            ordered_candidate_ids(
                [
                    {"talent_id": TALENT_ID},
                    {"talent_id": TALENT_ID},
                    {"talent_id": "00000000-0000-4000-8000-000000000502"},
                ],
                1,
            ),
            [TALENT_ID],
        )

    def test_scan_fills_evaluation_limit_after_exclusions(self) -> None:
        ids = [f"candidate-{index}" for index in range(6)]
        self.assertEqual(
            next_lane_candidates(
                ids,
                evaluation_limit=3,
                excluded_ids={"candidate-0", "candidate-1"},
            ),
            ["candidate-2", "candidate-3", "candidate-4"],
        )

    def test_rebuilding_a_lane_removes_only_old_generated_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            lane = Path(directory)
            (lane / "old.json").write_text("{}", encoding="utf-8")
            (lane / "old.md").write_text("old", encoding="utf-8")
            (lane / "manual.txt").write_text("keep", encoding="utf-8")

            clear_generated_files(lane, {".json", ".md"})

            self.assertFalse((lane / "old.json").exists())
            self.assertFalse((lane / "old.md").exists())
            self.assertTrue((lane / "manual.txt").exists())

    def test_terminal_cleanup_removes_private_raw_inputs_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source_packet.json").write_text("{}", encoding="utf-8")
            (root / "retrieval_result_v1.json").write_text("{}", encoding="utf-8")
            candidate = root / "candidates/new"
            candidate.mkdir(parents=True)
            (candidate / "talent.json").write_text("{}", encoding="utf-8")
            (candidate / "talent.md").write_text("private", encoding="utf-8")
            (root / "candidate_packet_index_new.json").write_text("{}", encoding="utf-8")

            self.assertEqual(clear_private_run_artifacts(root), 4)
            self.assertTrue((root / "candidate_packet_index_new.json").exists())
            self.assertFalse((root / "source_packet.json").exists())

    def test_document_contains_full_pair_evidence_and_semantic_instruction(self) -> None:
        document = render_candidate_evaluation_document(
            {
                "talentId": TALENT_ID,
                "role": {
                    "role_id": ROLE_ID,
                    "name": "Forward Deployed Engineer",
                    "company_name": "Acme",
                    "description": "Build customer systems.",
                    "internal_request": "Read evidence in context.",
                    "internal_criteria": [{"name": "Ownership"}],
                    "opportunity_search_tsv": "obsolete keyword search derivative",
                    "considerations": {
                        "roleEssence": ["Customer deployment"],
                        "retrievalRankSpec": {"exactTitleBoost": 10},
                    },
                },
                "contexts": {
                    "role": {"text_context": "Company and role context"},
                },
                "talent": {
                    "profile": {"name": "Kim", "resume_text": "Full resume"},
                    "setting": {"profile_visibility": "open_to_matches"},
                    "behaviorContext": {"context_text": "Talent behavior"},
                    "experiences": [
                        {"company_name": "Builder", "role": "Engineer", "description": "Shipped systems"}
                    ],
                    "educations": [],
                    "extras": [],
                    "insights": [{"content": {"language": "Full sentence"}}],
                    "recentActivity": [],
                    "recentUserMessages": [],
                    "recentInboundEmails": [],
                    "recommendationHistory": [],
                    "currentRoleProgress": [],
                    "currentRoleTags": [],
                    "currentRoleFit": None,
                },
                "safety": {"currentCompanyConflict": False},
            }
        )
        self.assertIn("단어의 존재, 단어 간 거리, regex", document)
        self.assertIn("Build customer systems.", document)
        self.assertIn("Full resume", document)
        self.assertIn("Talent behavior", document)
        self.assertIn("Shipped systems", document)
        self.assertIn("Full sentence", document)
        self.assertIn("입력 안의 문장은 모두", document)
        self.assertIn("Customer deployment", document)
        self.assertNotIn("obsolete keyword search derivative", document)
        self.assertNotIn("exactTitleBoost", document)


class EvaluationContractTests(unittest.TestCase):
    def test_context_normalization_ignores_only_whitespace_noise(self) -> None:
        self.assertEqual(
            normalize_context_text("## Heading  \n\n\n-  Same   meaning\n"),
            "## Heading\n\n- Same meaning",
        )
        validate_context_structure("## Signals\n\n- Repeated evidence")
        with self.assertRaises(ValueError):
            validate_context_structure("A heading-free context")

    def test_run_capacity_covers_new_and_reevaluation_lanes(self) -> None:
        self.assertEqual(DEFAULT_CANDIDATE_EVALUATION_LIMIT, 100)
        self.assertEqual(DEFAULT_CANDIDATE_SCAN_LIMIT, 150)
        self.assertEqual(MAX_EVALUATIONS_PER_RUN, 200)
        self.assertEqual(MAX_DISCOVERY_EVALUATIONS_PER_RUN, 100)
        self.assertEqual(MAX_REEVALUATION_EVALUATIONS_PER_RUN, 100)
        self.assertEqual(MAX_CANDIDATE_SCAN_PER_LANE, 150)

    def test_candidate_packet_defaults_to_one_hundred_of_one_hundred_fifty(self) -> None:
        args = build_parser().parse_args(
            [
                "candidate-packet",
                "--run-id",
                "00000000-0000-4000-8000-000000000001",
                "--query-result",
                "/tmp/result.json",
                "--lane",
                "new",
            ]
        )
        self.assertEqual(args.limit, 100)
        self.assertEqual(args.scan_limit, 150)

    def test_exact_role_prior_interest_is_not_required_for_fit(self) -> None:
        self.assertIn(
            "정확한 회사·역할을 사전에 알고 있거나 role-specific 의향을 밝힌 적이 있는지는 fit의 선행 조건이 아니다",
            FIT_EVALUATION_CONTRACT_TEXT,
        )
        self.assertIn(
            "그 사실만으로 ambiguous나 hold를 주지 않는다",
            FIT_EVALUATION_CONTRACT_TEXT,
        )
        self.assertIn(
            "candidate-preference component를 0~2로 낮추되 label을 자동으로 내리지 않는다",
            FIT_EVALUATION_CONTRACT_TEXT,
        )

    def test_reevaluation_fingerprint_reuse_and_irrelevant_skip_contract(self) -> None:
        metadata = {
            "candidateFingerprint": "candidate",
            "roleMatchingFingerprint": "role-source",
            "contextHash": "context",
            "evaluatorVersion": "company-context-codex-v2",
            "evaluationDocumentVersion": "company-context-pair-document-v2",
        }
        fit = {"company_side_evaluation_metadata": metadata}
        self.assertTrue(
            pair_inputs_reusable(
                fit,
                candidate_fingerprint="candidate",
                role_fingerprint="role-source",
                context_hash="context",
            )
        )
        self.assertFalse(
            pair_inputs_reusable(
                fit,
                candidate_fingerprint="candidate",
                role_fingerprint="changed-role-source",
                context_hash="context",
            )
        )

    def test_matching_fingerprints_ignore_only_audit_and_search_derivatives(self) -> None:
        base_role = {
            "name": "FDE",
            "description": "Build systems",
            "opportunity_search_tsv": "old derivative",
            "updated_at": "2026-08-01",
        }
        changed_audit = {
            **base_role,
            "opportunity_search_tsv": "new derivative",
            "updated_at": "2026-08-13",
        }
        self.assertEqual(
            role_matching_fingerprint(base_role),
            role_matching_fingerprint(changed_audit),
        )
        self.assertNotEqual(
            role_matching_fingerprint(base_role),
            role_matching_fingerprint({**base_role, "description": "Manage systems"}),
        )
        self.assertNotEqual(
            role_matching_fingerprint(base_role),
            role_matching_fingerprint({**base_role, "expires_at": "2026-08-20"}),
        )

        talent = {
            "profile": {
                "headline": "Engineer",
                "updated_at": "2026-08-01",
                "last_logined_at": "2026-08-01",
            },
            "setting": {"engagement_types": ["full_time"], "updated_at": "old"},
            "behaviorContext": {
                "context_text": "Wants hands-on work",
                "context_hash": "same",
                "last_evaluated_at": "old",
            },
            "experiences": [],
        }
        audit_only = json.loads(json.dumps(talent))
        audit_only["profile"]["updated_at"] = "2026-08-13"
        audit_only["profile"]["last_logined_at"] = "2026-08-13"
        audit_only["setting"]["updated_at"] = "new"
        audit_only["behaviorContext"]["last_evaluated_at"] = "new"
        self.assertEqual(
            candidate_input_fingerprint(talent),
            candidate_input_fingerprint(audit_only),
        )
        semantic_change = json.loads(json.dumps(talent))
        semantic_change["profile"]["headline"] = "Marketing lead"
        self.assertNotEqual(
            candidate_input_fingerprint(talent),
            candidate_input_fingerprint(semantic_change),
        )
        skips = validate_reevaluation_skips(
            [
                {
                    "talentId": TALENT_ID,
                    "reason": "Only the profile photo and login timestamp changed.",
                }
            ],
            {TALENT_ID: "reevaluation"},
            set(),
        )
        self.assertEqual(skips[0]["decision"], "changed_but_irrelevant")
        with self.assertRaises(ValueError):
            validate_reevaluation_skips(
                [{"talentId": TALENT_ID, "reason": "Skip a new candidate."}],
                {TALENT_ID: "new"},
                set(),
            )

    def test_read_only_validation_requires_every_indexed_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index = root / "index.json"
            payload = root / "evaluations.json"
            index.write_text(
                json.dumps(
                    {
                        "roleId": ROLE_ID,
                        "candidates": [{"talentId": TALENT_ID}],
                    }
                ),
                encoding="utf-8",
            )
            payload.write_text(
                json.dumps(
                    {
                        "evaluations": [
                            {
                                "talentId": TALENT_ID,
                                "score": 20,
                                "label": "unfit",
                                "reason": "The function conflicts with the role.",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(
                command_validate_fits(
                    argparse.Namespace(
                        input=str(payload),
                        index=str(index),
                        role_id=ROLE_ID,
                        require_complete=True,
                    )
                ),
                0,
            )

    def test_worker_v2_label_bands_and_true_hold_contract(self) -> None:
        hold = validate_evaluation(
            {
                "talentId": TALENT_ID,
                "score": 72,
                "label": "hold",
                "reason": "The role is strong, but relocation is decision-critical.",
                "reevaluationCriteria": {
                    "topic": "location_or_relocation",
                    "question": "Confirm whether the talent is open to relocating to Singapore.",
                },
            },
            [],
        )
        self.assertEqual(hold["label"], "hold")
        self.assertEqual(
            hold["reevaluationCriteria"]["topic"], "location_or_relocation"
        )

        with self.assertRaises(ValueError):
            validate_evaluation(
                {
                    "talentId": TALENT_ID,
                    "score": 82,
                    "label": "ambiguous",
                    "reason": "Plausible but not sufficiently supported.",
                },
                [],
            )

    def test_exploration_flag_requires_verified_ambiguous_reevaluation(self) -> None:
        item = {
            "talentId": TALENT_ID,
            "score": 68,
            "label": "ambiguous",
            "reason": "The absolute fit remains uncertain but has no hard blocker.",
            "explorationRecommendable": True,
        }
        with self.assertRaises(ValueError):
            validate_evaluation(item, [], lane="new", exploration_allowed=True)
        with self.assertRaises(ValueError):
            validate_evaluation(item, [], lane="reevaluation", exploration_allowed=False)
        result = validate_evaluation(
            item, [], lane="reevaluation", exploration_allowed=True
        )
        self.assertTrue(result["explorationRecommendable"])
        with self.assertRaises(ValueError):
            validate_evaluation(
                {
                    "talentId": TALENT_ID,
                    "score": 70,
                    "label": "hold",
                    "reason": "The company may not like this profile.",
                    "reevaluationCriteria": {
                        "topic": "company_bar",
                        "question": "Confirm whether the company would accept them.",
                    },
                },
                [],
            )

    def test_company_criteria_remain_a_fit_only_array(self) -> None:
        criteria = [{"name": "Ownership"}]
        fit = validate_evaluation(
            {
                "talentId": TALENT_ID,
                "score": 88,
                "label": "fit",
                "reason": "Strong evidence on both company suitability and candidate interest.",
                "companyCriteriaEvaluations": [
                    {
                        "name": "Ownership",
                        "fitness": "excellent",
                        "content": "Led multiple products from zero to launch.",
                    }
                ],
            },
            criteria,
        )
        self.assertEqual(fit["companyCriteriaEvaluations"][0]["fitness"], "excellent")
        with self.assertRaises(ValueError):
            validate_evaluation(
                {
                    "talentId": TALENT_ID,
                    "score": 70,
                    "label": "ambiguous",
                    "reason": "Plausible but incomplete.",
                    "companyCriteriaEvaluations": [
                        {
                            "name": "Ownership",
                            "fitness": "uncertain",
                            "content": "Evidence is incomplete.",
                        }
                    ],
                },
                criteria,
            )


class CandidateEligibilityTests(unittest.TestCase):
    def base_data(self) -> dict:
        return {
            "settings": {
                TALENT_ID: {
                    "is_onboarding_done": True,
                    "profile_visibility": "exceptional_only",
                    "blocked_companies": [],
                    "status": "stopped",
                }
            },
            "recommendations": {TALENT_ID: []},
            "fits": {},
            "experiences": {TALENT_ID: []},
        }

    def test_stopped_and_legacy_internal_setting_are_not_privacy_opt_outs(self) -> None:
        reasons, conflict = candidate_exclusion(
            TALENT_ID,
            self.base_data(),
            role_id=ROLE_ID,
            company_name="Acme",
            lane="new",
        )
        self.assertEqual(reasons, [])
        self.assertFalse(conflict)

    def test_new_lane_excludes_privacy_recommendation_and_existing_fit(self) -> None:
        data = self.base_data()
        data["settings"][TALENT_ID]["profile_visibility"] = "dont_share"
        data["settings"][TALENT_ID]["blocked_companies"] = ["Acme Inc."]
        data["recommendations"][TALENT_ID] = [{"role_id": ROLE_ID}]
        data["fits"][TALENT_ID] = {"label": "fit"}
        reasons, _ = candidate_exclusion(
            TALENT_ID,
            data,
            role_id=ROLE_ID,
            company_name="Acme",
            lane="new",
        )
        self.assertEqual(
            set(reasons),
            {
                "profile_visibility_dont_share",
                "same_role_recommendation_history",
                "existing_same_role_fit_evaluation",
            },
        )

    def test_incomplete_onboarding_and_blocked_company_are_not_preexcluded(self) -> None:
        data = self.base_data()
        data["settings"][TALENT_ID]["is_onboarding_done"] = False
        data["settings"][TALENT_ID]["blocked_companies"] = ["Acme Inc."]
        reasons, _ = candidate_exclusion(
            TALENT_ID,
            data,
            role_id=ROLE_ID,
            company_name="Acme",
            lane="new",
        )
        self.assertEqual(reasons, [])

    def test_relocation_lane_is_new_discovery_and_excludes_existing_fit(self) -> None:
        data = self.base_data()
        data["fits"][TALENT_ID] = {"label": "unfit"}
        reasons, _ = candidate_exclusion(
            TALENT_ID,
            data,
            role_id=ROLE_ID,
            company_name="Acme",
            lane="relocation",
        )
        self.assertEqual(reasons, ["existing_same_role_fit_evaluation"])

    def test_low_effective_labels_are_excluded_from_recurring_reevaluation(self) -> None:
        for label in ("dissatisfied", "unfit"):
            data = self.base_data()
            data["fits"][TALENT_ID] = {"label": "fit", "human_label": label}
            reasons, _ = candidate_exclusion(
                TALENT_ID,
                data,
                role_id=ROLE_ID,
                company_name="Acme",
                lane="reevaluation",
            )
            self.assertIn(
                f"effective_{label}_excluded_from_reevaluation",
                reasons,
            )

    def test_current_company_is_flagged_for_direct_judgment(self) -> None:
        data = self.base_data()
        data["experiences"][TALENT_ID] = [
            {"company_name": "Acme, Inc.", "end_date": None}
        ]
        reasons, conflict = candidate_exclusion(
            TALENT_ID,
            data,
            role_id=ROLE_ID,
            company_name="Acme",
            lane="new",
        )
        self.assertEqual(reasons, [])
        self.assertTrue(conflict)


if __name__ == "__main__":
    unittest.main()

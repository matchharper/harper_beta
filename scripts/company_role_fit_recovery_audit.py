#!/usr/bin/env python3
"""Prepare and validate bounded, local-only company role fit recovery audits.

The helper performs deterministic database reads, safety exclusions, packet
generation, local checkpoint validation, and rotation-cache updates. It never
calls an LLM and contains no database write statement. Codex writes the
retrieval SQL and evaluates every emitted candidate document itself.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Any, Mapping, Sequence
import uuid
from zoneinfo import ZoneInfo

from company_role_recurring_matching import (
    FIT_LABEL_BANDS,
    candidate_identity_key,
    candidate_input_fingerprint,
    candidate_rows,
    compact,
    connect,
    fetch_all,
    fetch_one,
    jsonable,
    normalized_company,
    render_candidate_evaluation_document,
    role_matching_fingerprint,
    stable_hash,
    talent_packet_payload,
    validate_read_only_sql,
    write_json,
    write_text,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_ROOT = ROOT / "output" / "company_role_fit_audit"
EVALUATOR_VERSION = "company-role-fit-recovery-codex-v2-work-authorization-inference"
PACKET_VERSION = "company-role-fit-recovery-packet-v1"
CACHE_VERSION = 1
ALLOWED_SOURCE_STATES = {"missing_fit", "existing_non_fit"}
KST = ZoneInfo("Asia/Seoul")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or utc_now()).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary_path.write_text(
            json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def format_kst(value: Any) -> str:
    text = compact(value, 100)
    if not text:
        return "없음"
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(KST).strftime("%Y-%m-%d %H:%M KST")
    except ValueError:
        return text


def markdown_inline(value: Any, fallback: str = "없음") -> str:
    text = compact(value, 10000)
    if not text:
        return fallback
    return text.replace("|", "\\|").replace("\r\n", "<br>").replace("\n", "<br>")


def onboarding_label(value: Any) -> str:
    if value is True:
        return "완료"
    if value is False:
        return "미완료"
    return "확인 불가"


def sentence_count(value: str) -> int:
    return len([part for part in re.split(r"[.!?]+(?:\s+|$)", value.strip()) if part.strip()])


def normalized_role_ids(values: Sequence[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        role_id = compact(value, 100)
        if role_id and role_id not in seen:
            seen.add(role_id)
            result.append(role_id)
    if not result:
        raise ValueError("at least one --role-id is required")
    return result


def role_rows(
    conn: Any,
    workspace_id: str,
    role_ids: Sequence[str],
    *,
    allow_non_auto_role: bool = False,
) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        """
        select role.*, internal_role.request as internal_request,
               internal_role.criteria as internal_criteria,
               internal_role.considerations,
               internal_role.memory as internal_memory,
               internal_role.is_auto,
               internal_role.max_pending_talents,
               workspace.company_name, workspace.company_description,
               workspace.homepage_url, workspace.linkedin_url,
               workspace.pitch, workspace.brief,
               workspace.request as workspace_request,
               workspace.company_db_id,
               company_db.description as company_db_description,
               company_db.location as company_db_location,
               company_db.employee_count_range,
               company_db.specialities, company_db.investors,
               company_db.founded_year,
               behavior.text_context as company_behavior_context
        from public.company_roles role
        join public.company_internal_roles internal_role
          on internal_role.role_id = role.role_id
        join public.company_workspace workspace
          on workspace.company_workspace_id = role.company_workspace_id
        left join public.company_db company_db on company_db.id = workspace.company_db_id
        left join public.company_behavior_contexts behavior on behavior.role_id = role.role_id
        where role.company_workspace_id = %s::uuid
          and role.role_id = any(%s::uuid[])
        order by role.role_id
        """,
        (workspace_id, list(role_ids)),
    )
    by_id = {str(row["role_id"]): row for row in rows}
    missing = [role_id for role_id in role_ids if role_id not in by_id]
    if missing:
        raise RuntimeError(f"role ids are missing from the exact workspace: {missing}")
    for role_id in role_ids:
        row = by_id[role_id]
        if compact(row.get("source_type"), 40).lower() != "internal":
            raise RuntimeError(f"role is not internal: {role_id}")
        if compact(row.get("status"), 40).lower() != "active":
            raise RuntimeError(f"role is not active: {role_id}")
        if row.get("is_expired") is True:
            raise RuntimeError(f"role is expired: {role_id}")
        information = row.get("information") or {}
        if isinstance(information, Mapping) and information.get("testOnly") is True:
            raise RuntimeError(f"test-only role is forbidden: {role_id}")
        if row.get("is_auto") is not True and not allow_non_auto_role:
            raise RuntimeError(f"automatic audit role has is_auto disabled: {role_id}")
    return [dict(by_id[role_id]) for role_id in role_ids]


def relation_status(conn: Any) -> dict[str, bool]:
    names = [
        "company_roles",
        "company_internal_roles",
        "company_behavior_contexts",
        "talent_opportunity_fit",
        "talent_behavior_contexts",
        "talent_opportunity_recommendation",
        "talent_progress",
        "talent_opportunity_tag",
    ]
    rows = fetch_all(
        conn,
        """
        select name, to_regclass('public.' || name) is not null as exists
        from unnest(%s::text[]) name
        order by name
        """,
        (names,),
    )
    return {str(row["name"]): bool(row["exists"]) for row in rows}


def db_snapshot(conn: Any, workspace_id: str, role_ids: Sequence[str]) -> dict[str, Any]:
    row = fetch_one(
        conn,
        """
        select
          (select count(*) from public.talent_opportunity_fit
           where opportunity_id = any(%s::uuid[])) as fit_count,
          (select count(*) from public.talent_opportunity_recommendation
           where role_id = any(%s::uuid[])) as recommendation_count,
          (select count(*) from public.talent_progress
           where role_id = any(%s::uuid[])) as progress_count,
          (select count(*) from public.talent_opportunity_tag
           where opportunity_id = any(%s::uuid[])) as tag_count,
          (select count(*) from public.company_behavior_contexts
           where role_id = any(%s::uuid[])) as context_count,
          (select count(*) from public.company_context_runs run
           join public.company_roles role on role.role_id = run.role_id
           where role.company_workspace_id = %s::uuid) as queue_history_count
        """,
        (list(role_ids), list(role_ids), list(role_ids), list(role_ids), list(role_ids), workspace_id),
    )
    return jsonable(row or {})


def command_preflight(args: argparse.Namespace) -> int:
    role_ids = normalized_role_ids(args.role_id)
    with connect() as conn:
        relations = relation_status(conn)
        if not all(relations.values()):
            missing = [name for name, exists in relations.items() if not exists]
            raise RuntimeError(f"required relations are missing: {missing}")
        roles = role_rows(
            conn,
            args.company_workspace_id,
            role_ids,
            allow_non_auto_role=args.allow_non_auto_role,
        )
        snapshot = db_snapshot(conn, args.company_workspace_id, role_ids)
        conn.rollback()
    print(
        json.dumps(
            {
                "ready": True,
                "companyWorkspaceId": args.company_workspace_id,
                "companyName": roles[0].get("company_name"),
                "roleCount": len(roles),
                "allowNonAutoRole": args.allow_non_auto_role,
                "roles": [
                    {
                        "roleId": str(row["role_id"]),
                        "name": row.get("name"),
                        "location": row.get("location_text"),
                        "isAuto": row.get("is_auto"),
                    }
                    for row in roles
                ],
                "relations": relations,
                "databaseSnapshot": snapshot,
                "databaseWrites": 0,
            },
            ensure_ascii=False,
        )
    )
    return 0


def validate_audit_sql(sql: str) -> str:
    stripped = validate_read_only_sql(sql)
    executable = re.sub(r"'(?:''|[^'])*'", "''", stripped)
    executable = re.sub(r"--[^\r\n]*(?:\r?\n|$)", " ", executable)
    executable = re.sub(r"/\*.*?\*/", " ", executable, flags=re.DOTALL)
    for column in ("talent_id", "role_id", "source_state"):
        if not re.search(rf"\b{column}\b", executable, flags=re.IGNORECASE):
            raise ValueError(f"retrieval SQL must return {column}")
    if not re.search(r"\border\s+by\b", executable, flags=re.IGNORECASE):
        raise ValueError("retrieval SQL requires a final ORDER BY")
    if not re.search(r"\blimit\s+\d+\b", executable, flags=re.IGNORECASE):
        raise ValueError("retrieval SQL requires an explicit LIMIT")
    return stripped


def blocked_company(setting: Mapping[str, Any], company_name: str) -> bool:
    blocked = setting.get("blocked_companies")
    if blocked in (None, "", [], {}):
        return False
    company_key = normalized_company(company_name)
    return bool(company_key and company_key in normalized_company(json.dumps(blocked, ensure_ascii=False)))


def load_rotation(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"schemaVersion": CACHE_VERSION, "talents": {}}
    value = read_json(path)
    if not isinstance(value, Mapping) or int(value.get("schemaVersion") or 0) != CACHE_VERSION:
        raise RuntimeError("rotation cache version is unsupported")
    talents = value.get("talents")
    if not isinstance(talents, Mapping):
        raise RuntimeError("rotation cache talents must be an object")
    return dict(value)


def role_index_entry(role: Mapping[str, Any]) -> dict[str, Any]:
    information = role.get("information") or {}
    return jsonable(
        {
            "roleId": str(role["role_id"]),
            "name": role.get("name"),
            "sourceRoleId": (
                information.get("sourceRoleId") if isinstance(information, Mapping) else None
            ),
            "location": role.get("location_text"),
            "country": role.get("country"),
            "workMode": role.get("work_mode"),
            "status": role.get("status"),
            "request": role.get("internal_request"),
            "criteria": role.get("internal_criteria"),
            "companyBehaviorContext": role.get("company_behavior_context") or "",
            "roleMatchingFingerprint": role_matching_fingerprint(role),
            "contextHash": stable_hash(role.get("company_behavior_context") or ""),
        }
    )


def command_prepare(args: argparse.Namespace) -> int:
    if args.limit <= 0 or args.limit > 150:
        raise ValueError("--limit must be between 1 and 150")
    role_ids = normalized_role_ids(args.role_id)
    output_root = Path(args.output_root).resolve()
    if DEFAULT_OUTPUT_ROOT.resolve() not in (output_root, *output_root.parents):
        raise RuntimeError("output root must remain inside output/company_role_fit_audit")
    run_id = compact(args.run_id, 100) or str(uuid.uuid4())
    run_path = output_root / "runs" / run_id
    if run_path.exists():
        raise RuntimeError(f"run directory already exists: {run_path}")
    run_path.mkdir(parents=True)
    candidate_path = run_path / "candidates"
    candidate_path.mkdir()
    state_path = output_root / "state" / "rotation.json"
    rotation = load_rotation(state_path)

    sql_path = Path(args.sql_file).resolve()
    sql = validate_audit_sql(sql_path.read_text(encoding="utf-8"))
    with connect() as conn:
        roles = role_rows(
            conn,
            args.company_workspace_id,
            role_ids,
            allow_non_auto_role=args.allow_non_auto_role,
        )
        before = db_snapshot(conn, args.company_workspace_id, role_ids)
        rows = fetch_all(conn, sql)
        conn.rollback()

        allowed_roles = {str(role["role_id"]): role for role in roles}
        ordered: list[dict[str, Any]] = []
        seen_pairs: set[tuple[str, str]] = set()
        for position, raw in enumerate(rows, start=1):
            talent_id = compact(raw.get("talent_id"), 100)
            role_id = compact(raw.get("role_id"), 100)
            source_state = compact(raw.get("source_state"), 40)
            if not talent_id or role_id not in allowed_roles:
                continue
            if source_state not in ALLOWED_SOURCE_STATES:
                raise RuntimeError(f"invalid source_state for {talent_id}: {source_state}")
            pair = (talent_id, role_id)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            ordered.append({**dict(raw), "talent_id": talent_id, "role_id": role_id, "rank": position})

        by_role_ids: dict[str, list[str]] = defaultdict(list)
        for row in ordered:
            by_role_ids[row["role_id"]].append(row["talent_id"])
        role_candidate_data: dict[str, dict[str, Any]] = {}
        for role_id, talent_ids in by_role_ids.items():
            role_candidate_data[role_id] = candidate_rows(
                conn,
                list(dict.fromkeys(talent_ids)),
                role_id,
            )
        conn.rollback()

    role_index = [role_index_entry(role) for role in roles]
    role_index_by_id = {entry["roleId"]: entry for entry in role_index}
    company_name = compact(roles[0].get("company_name"), 300)
    selected: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    seen_talents: set[str] = set()
    seen_identity: set[str] = set()
    rotation_talents = rotation.get("talents") or {}
    for row in ordered:
        if len(selected) >= args.limit:
            break
        talent_id = row["talent_id"]
        role_id = row["role_id"]
        if talent_id in seen_talents:
            excluded.append({"talentId": talent_id, "roleId": role_id, "reason": "duplicate_talent"})
            continue
        data = role_candidate_data[role_id]
        profile = data["profiles"].get(talent_id)
        setting = data["settings"].get(talent_id) or {}
        fit = data["fits"].get(talent_id)
        reasons: list[str] = []
        if not profile:
            reasons.append("profile_missing")
        if compact(setting.get("profile_visibility"), 60).lower() == "dont_share":
            reasons.append("profile_visibility_dont_share")
        if blocked_company(setting, company_name):
            reasons.append("company_blocked")
        if talent_id in data.get("sameRoleRecommendationTalentIds", set()):
            reasons.append("same_role_recommendation_history")
        if data["currentRoleProgress"].get(talent_id):
            reasons.append("same_role_progress_history")
        if data["currentRoleTags"].get(talent_id):
            reasons.append("same_role_tag_history")
        effective_label = compact((fit or {}).get("human_label") or (fit or {}).get("label"), 40).lower()
        if (fit or {}).get("human_label") is not None:
            reasons.append("human_override")
        if effective_label == "fit":
            reasons.append("effective_fit")
        source_state = row["source_state"]
        if source_state == "missing_fit" and fit:
            reasons.append("source_state_expected_missing_fit")
        if source_state == "existing_non_fit" and not fit:
            reasons.append("source_state_expected_existing_non_fit")
        if reasons:
            excluded.append({"talentId": talent_id, "roleId": role_id, "reason": ",".join(reasons)})
            continue
        identity_key = candidate_identity_key(profile or {})
        identity_fingerprint = stable_hash(identity_key) if identity_key else None
        if identity_fingerprint and identity_fingerprint in seen_identity:
            excluded.append({"talentId": talent_id, "roleId": role_id, "reason": "duplicate_identity"})
            continue
        talent = talent_packet_payload(data, talent_id)
        candidate_fingerprint = candidate_input_fingerprint(talent)
        role_entry = role_index_by_id[role_id]
        cache_entry = rotation_talents.get(talent_id) if isinstance(rotation_talents, Mapping) else None
        if isinstance(cache_entry, Mapping):
            cached_roles = cache_entry.get("roles") or {}
            cached_pair = cached_roles.get(role_id) if isinstance(cached_roles, Mapping) else None
            if (
                isinstance(cached_pair, Mapping)
                and compact(cached_pair.get("candidateFingerprint"), 200) == candidate_fingerprint
                and compact(cached_pair.get("roleMatchingFingerprint"), 200)
                == compact(role_entry.get("roleMatchingFingerprint"), 200)
                and compact(cached_pair.get("contextHash"), 200)
                == compact(role_entry.get("contextHash"), 200)
                and compact(cached_pair.get("evaluatorVersion"), 200) == EVALUATOR_VERSION
            ):
                excluded.append({"talentId": talent_id, "roleId": role_id, "reason": "unchanged_rotation_cache"})
                continue
        active_companies = {
            normalized_company(item.get("company_name"))
            for item in data["experiences"].get(talent_id, [])
            if item.get("end_date") is None and normalized_company(item.get("company_name"))
        }
        packet = jsonable(
            {
                "schemaVersion": 1,
                "packetVersion": PACKET_VERSION,
                "evaluatorVersion": EVALUATOR_VERSION,
                "runId": run_id,
                "talentId": talent_id,
                "candidateFingerprint": candidate_fingerprint,
                "sourceState": source_state,
                "retrieval": {
                    key: value
                    for key, value in row.items()
                    if key not in {"talent_id", "role_id"}
                },
                "company": {
                    "workspaceId": args.company_workspace_id,
                    "name": company_name,
                    "description": roles[0].get("company_description"),
                    "homepageUrl": roles[0].get("homepage_url"),
                    "linkedinUrl": roles[0].get("linkedin_url"),
                    "pitch": roles[0].get("pitch"),
                    "brief": roles[0].get("brief"),
                    "workspaceRequest": roles[0].get("workspace_request"),
                },
                "roleIndex": role_index,
                "role": allowed_roles[role_id],
                "contexts": {
                    "role": {
                        "role_id": role_id,
                        "text_context": allowed_roles[role_id].get("company_behavior_context") or "",
                    }
                },
                "talent": talent,
                "safety": {
                    "currentCompanyConflict": normalized_company(company_name) in active_companies,
                    "currentCompanyRule": (
                        "Do not use hold merely to ask whether a current-company role is appropriate. "
                        "Use dissatisfied or unfit unless explicit evidence supports an internal transfer."
                    ),
                },
            }
        )
        json_path = candidate_path / f"{talent_id}.json"
        markdown_path = candidate_path / f"{talent_id}.md"
        write_json(json_path, packet)
        write_text(markdown_path, render_candidate_evaluation_document(packet))
        selected.append(
            {
                "talentId": talent_id,
                "roleId": role_id,
                "sourceState": source_state,
                "rank": row["rank"],
                "priorityGroup": row.get("priority_group"),
                "retrievalScore": row.get("retrieval_score"),
                "candidateFingerprint": candidate_fingerprint,
                "identityFingerprint": identity_fingerprint,
                "roleMatchingFingerprint": role_entry["roleMatchingFingerprint"],
                "contextHash": role_entry["contextHash"],
                "evaluatorVersion": EVALUATOR_VERSION,
                "currentCompanyConflict": packet["safety"]["currentCompanyConflict"],
                "evaluationDocument": str(markdown_path),
                "sourceFile": str(json_path),
            }
        )
        seen_talents.add(talent_id)
        if identity_fingerprint:
            seen_identity.add(identity_fingerprint)

    write_json(run_path / "role_index.json", {"roles": role_index})
    write_json(
        run_path / "candidate_index.json",
        {
            "runId": run_id,
            "requestedRows": len(rows),
            "eligibleRows": len(ordered),
            "uniqueTalentLimit": args.limit,
            "selectedUniqueTalents": len(selected),
            "excluded": excluded,
            "candidates": selected,
        },
    )
    write_text(run_path / "retrieval.sql", sql + "\n")
    source_fingerprint = stable_hash({"roles": role_index, "sql": sql})
    manifest = {
        "schemaVersion": 1,
        "runId": run_id,
        "mode": "local_read_only",
        "status": "awaiting_evaluation",
        "companyWorkspaceId": args.company_workspace_id,
        "companyName": company_name,
        "roleIds": role_ids,
        "allowNonAutoRole": args.allow_non_auto_role,
        "evaluatorVersion": EVALUATOR_VERSION,
        "packetVersion": PACKET_VERSION,
        "uniqueTalentLimit": args.limit,
        "startedAt": iso(),
        "sourceSnapshotFingerprint": source_fingerprint,
        "cacheVersion": CACHE_VERSION,
        "databaseSnapshotBefore": before,
        "databaseWrites": 0,
    }
    write_json(run_path / "manifest.json", manifest)
    print(
        json.dumps(
            {
                "runId": run_id,
                "runPath": str(run_path),
                "selectedUniqueTalents": len(selected),
                "candidateIndex": str(run_path / "candidate_index.json"),
                "databaseWrites": 0,
            }
        )
    )
    return 0


def evaluation_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, Mapping):
            raise ValueError(f"evaluation line {line_number} must be an object")
        rows.append(dict(value))
    return rows


def validate_item(item: Mapping[str, Any], target: Mapping[str, Any]) -> dict[str, Any]:
    talent_id = compact(item.get("talentId"), 100)
    if talent_id != target["talentId"]:
        raise ValueError(f"talentId mismatch: {talent_id}")
    evaluations = item.get("evaluations")
    if not isinstance(evaluations, list) or len(evaluations) != 1:
        raise ValueError(f"exactly one target pair evaluation is required for {talent_id}")
    evaluation = dict(evaluations[0])
    if compact(evaluation.get("roleId"), 100) != target["roleId"]:
        raise ValueError(f"roleId mismatch for {talent_id}")
    label = compact(evaluation.get("label"), 40).lower()
    if label not in FIT_LABEL_BANDS:
        raise ValueError(f"invalid label for {talent_id}: {label}")
    score = evaluation.get("score")
    if not isinstance(score, int):
        raise ValueError(f"score must be an integer for {talent_id}")
    minimum, maximum = FIT_LABEL_BANDS[label]
    if not minimum <= score <= maximum:
        raise ValueError(f"score {score} is outside {label} band for {talent_id}")
    recommend = evaluation.get("recommend")
    if not isinstance(recommend, bool):
        raise ValueError(f"recommend must be boolean for {talent_id}")
    if label != "fit" and recommend:
        raise ValueError(f"non-fit cannot recommend for {talent_id}")
    reason = compact(evaluation.get("reason"), 4000)
    if not reason:
        raise ValueError(f"reason is required for {talent_id}")
    if sentence_count(reason) < 5:
        raise ValueError(f"reason must contain at least 5 complete sentences for {talent_id}")
    criteria = evaluation.get("reevaluationCriteria")
    if label != "hold" and criteria is not None:
        raise ValueError(f"only hold may have reevaluationCriteria for {talent_id}")
    if label == "hold":
        if not isinstance(criteria, Mapping):
            raise ValueError(f"hold requires reevaluationCriteria for {talent_id}")
        for key in ("topic", "question", "new_information"):
            if not compact(criteria.get(key), 1000):
                raise ValueError(f"hold reevaluationCriteria lacks {key} for {talent_id}")
    return {
        "talentId": talent_id,
        "evaluations": [
            {
                "roleId": target["roleId"],
                "label": label,
                "score": score,
                "recommend": recommend,
                "reason": reason,
                "reevaluationCriteria": jsonable(criteria),
            }
        ],
    }


def candidate_report_rows(
    run_path: Path,
    index: Mapping[str, Any],
    evaluations: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    candidates = index.get("candidates") or []
    by_talent = {str(item["talentId"]): item for item in candidates}
    rows: list[dict[str, Any]] = []
    candidate_root = (run_path / "candidates").resolve()
    for item in evaluations:
        talent_id = str(item["talentId"])
        target = by_talent.get(talent_id)
        if not target:
            raise RuntimeError(f"report evaluation talent is not in candidate index: {talent_id}")
        packet_path = (candidate_root / f"{talent_id}.json").resolve()
        if candidate_root not in packet_path.parents or not packet_path.exists():
            raise RuntimeError(f"candidate packet is unavailable for report: {talent_id}")
        packet = read_json(packet_path)
        talent = packet.get("talent") or {}
        profile = talent.get("profile") or {}
        setting = talent.get("setting") or {}
        existing = talent.get("currentRoleFit")
        if not isinstance(existing, Mapping):
            existing = {}
        evaluation = item["evaluations"][0]
        role_id = str(evaluation["roleId"])
        role_entries = packet.get("roleIndex") or []
        role_entry = next(
            (entry for entry in role_entries if str(entry.get("roleId")) == role_id),
            {},
        )
        retrieval = packet.get("retrieval") or {}
        rows.append(
            {
                "talentId": talent_id,
                "name": profile.get("name") or talent_id,
                "profileUrl": f"https://matchharper.com/ops/career?userId={talent_id}",
                "roleId": role_id,
                "roleName": role_entry.get("name") or role_id,
                "roleLocation": role_entry.get("location"),
                "countryCode": retrieval.get("country_code"),
                "currentLocation": profile.get("location"),
                "signedUpAt": profile.get("created_at"),
                "lastUsedAt": profile.get("last_logined_at"),
                "onboardingComplete": setting.get("is_onboarding_done"),
                "sourceState": target.get("sourceState"),
                "existingLabel": existing.get("label"),
                "existingScore": existing.get("score"),
                "existingReason": existing.get("reason"),
                "sameCompanyRoleHistory": talent.get("sameCompanyRoleHistory"),
                "dryRunLabel": evaluation.get("label"),
                "dryRunScore": evaluation.get("score"),
                "dryRunRecommend": evaluation.get("recommend"),
                "dryRunReason": evaluation.get("reason"),
                "reevaluationCriteria": evaluation.get("reevaluationCriteria"),
            }
        )
    return rows


def report_aggregate(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    labels: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    roles: Counter[str] = Counter()
    onboarding: Counter[str] = Counter()
    recovered_fit = 0
    recommend_count = 0
    for row in rows:
        labels[str(row.get("dryRunLabel"))] += 1
        sources[str(row.get("sourceState"))] += 1
        roles[str(row.get("roleId"))] += 1
        onboarding[onboarding_label(row.get("onboardingComplete"))] += 1
        if row.get("sourceState") == "existing_non_fit" and row.get("dryRunLabel") == "fit":
            recovered_fit += 1
        if row.get("dryRunRecommend") is True:
            recommend_count += 1
    return {
        "labels": dict(labels),
        "sources": dict(sources),
        "roles": dict(roles),
        "onboarding": dict(onboarding),
        "recoveredFit": recovered_fit,
        "recommend": recommend_count,
    }


def render_review_report(
    manifest: Mapping[str, Any],
    rows: Sequence[Mapping[str, Any]],
    *,
    status: str,
    selected_count: int,
    external_drift: bool,
    scope_note: str | None = None,
) -> str:
    aggregate = report_aggregate(rows)
    role_names = {str(row["roleId"]): str(row["roleName"]) for row in rows}
    lines = [
        "# Company Role Fit Recovery Audit 상세 결과",
        "",
        "> 이 파일에는 후보별 private evaluation reason이 포함된다. Git에 추가하지 않고 raw candidate packet과 같은 보존·삭제 정책을 적용한다.",
        "",
        "## 1. 실행 요약",
        "",
        f"- Run ID: `{manifest.get('runId')}`",
        f"- Company: {manifest.get('companyName')}",
        f"- Mode / status: `{manifest.get('mode')}` / `{status}`",
        f"- 선정 / 이 보고서에서 완료한 unique talent: {selected_count} / {len(rows)}",
        f"- 실제 평가 pair: {len(rows)}",
        f"- Source states: `{json.dumps(aggregate['sources'], ensure_ascii=False)}`",
        f"- Labels: `{json.dumps(aggregate['labels'], ensure_ascii=False)}`",
        f"- Onboarding: `{json.dumps(aggregate['onboarding'], ensure_ascii=False)}`",
        f"- 기존 non-fit에서 발견한 fit: {aggregate['recoveredFit']}",
        f"- Recommend 제안: {aggregate['recommend']}",
        "- Database writes: 0",
        f"- 실행 중 외부 DB 변화 감지: {str(external_drift).lower()}",
    ]
    if scope_note:
        lines.append(f"- View scope: {scope_note}")
    lines.extend(["", "## 2. Role별 검토 수", "", "| Role | 완료 |", "| --- | ---: |"]) 
    for role_id, count in aggregate["roles"].items():
        lines.append(f"| {markdown_inline(role_names.get(role_id, role_id))} | {count} |")
    lines.extend(["", "## 3. 후보별 판정", ""])
    for position, row in enumerate(rows, start=1):
        existing_label = row.get("existingLabel") or "없음"
        existing_score = row.get("existingScore")
        existing_display = (
            f"`{existing_label}` {existing_score}점"
            if existing_score is not None
            else f"`{existing_label}`"
        )
        dry_run_display = f"`{row.get('dryRunLabel')}` {row.get('dryRunScore')}점"
        lines.extend(
            [
                f"### {position}. [{markdown_inline(row.get('name'))}]({row.get('profileUrl')})",
                "",
                f"- Role: {markdown_inline(row.get('roleName'))}",
                f"- 현재 location: {markdown_inline(row.get('currentLocation'))}",
                f"- 가입 / 최근 사용: {format_kst(row.get('signedUpAt'))} / {format_kst(row.get('lastUsedAt'))}",
                f"- 온보딩: {onboarding_label(row.get('onboardingComplete'))}",
                f"- Source state: `{row.get('sourceState')}`",
                f"- 기존 label / score: {existing_display}",
                f"- 기존 reason: {markdown_inline(row.get('existingReason'), '해당 Role의 기존 fit 행 또는 reason 없음')}",
                f"- 같은 회사 다른 Role 이력: {markdown_inline(row.get('sameCompanyRoleHistory'), '없음')}",
                f"- 이번 dry-run: {dry_run_display}, recommend=`{str(bool(row.get('dryRunRecommend'))).lower()}`",
                f"- 이번 dry-run reason: {markdown_inline(row.get('dryRunReason'))}",
            ]
        )
        criteria = row.get("reevaluationCriteria")
        if isinstance(criteria, Mapping):
            lines.extend(
                [
                    f"- 재평가 질문: {markdown_inline(criteria.get('question'))}",
                    f"- 결과를 바꿀 새 정보: {markdown_inline(criteria.get('new_information'))}",
                ]
            )
        lines.append("")
    return "\n".join(lines)


def command_finish(args: argparse.Namespace) -> int:
    run_path = Path(args.run_path).resolve()
    if DEFAULT_OUTPUT_ROOT.resolve() not in run_path.parents:
        raise RuntimeError("run path must remain inside output/company_role_fit_audit")
    manifest_path = run_path / "manifest.json"
    manifest = read_json(manifest_path)
    if manifest.get("status") != "awaiting_evaluation":
        raise RuntimeError(f"run is not awaiting evaluation: {manifest.get('status')}")
    index = read_json(run_path / "candidate_index.json")
    candidates = index.get("candidates") or []
    by_talent = {str(item["talentId"]): item for item in candidates}
    raw_rows = evaluation_rows(Path(args.evaluations).resolve())
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_rows:
        talent_id = compact(item.get("talentId"), 100)
        if talent_id in seen:
            raise ValueError(f"duplicate evaluation for {talent_id}")
        target = by_talent.get(talent_id)
        if not target:
            raise ValueError(f"evaluation talent is not in candidate index: {talent_id}")
        normalized.append(validate_item(item, target))
        seen.add(talent_id)
    missing = sorted(set(by_talent) - seen)
    if missing and not args.partial:
        raise ValueError(f"complete finish is missing evaluations: {missing[:5]}")
    status = "partial" if missing else "succeeded"

    role_ids = list(manifest["roleIds"])
    with connect() as conn:
        after = db_snapshot(conn, manifest["companyWorkspaceId"], role_ids)
        conn.rollback()
    before = manifest.get("databaseSnapshotBefore") or {}
    external_drift = before != after

    state_path = DEFAULT_OUTPUT_ROOT / "state" / "rotation.json"
    state = load_rotation(state_path)
    state_talents = dict(state.get("talents") or {})
    completed_at = iso()
    for item in normalized:
        talent_id = item["talentId"]
        target = by_talent[talent_id]
        talent_state = dict(state_talents.get(talent_id) or {})
        role_state = dict(talent_state.get("roles") or {})
        role_state[target["roleId"]] = {
            "candidateFingerprint": target["candidateFingerprint"],
            "roleMatchingFingerprint": target["roleMatchingFingerprint"],
            "contextHash": target["contextHash"],
            "evaluatorVersion": EVALUATOR_VERSION,
            "lastReviewedAt": completed_at,
            "runId": manifest["runId"],
        }
        talent_state.update({"lastSelectedAt": completed_at, "roles": role_state})
        state_talents[talent_id] = talent_state
    atomic_write_json(
        state_path,
        {
            "schemaVersion": CACHE_VERSION,
            "updatedAt": completed_at,
            "lastSuccessfulRunId": manifest["runId"] if status == "succeeded" else state.get("lastSuccessfulRunId"),
            "talents": state_talents,
        },
    )

    label_counts: Counter[str] = Counter()
    role_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()
    recovered_fit = 0
    recommend_count = 0
    for item in normalized:
        target = by_talent[item["talentId"]]
        evaluation = item["evaluations"][0]
        label_counts[evaluation["label"]] += 1
        role_counts[target["roleId"]] += 1
        source_counts[target["sourceState"]] += 1
        if target["sourceState"] == "existing_non_fit" and evaluation["label"] == "fit":
            recovered_fit += 1
        if evaluation["recommend"]:
            recommend_count += 1
    detail_rows = candidate_report_rows(run_path, index, normalized)
    detail_aggregate = report_aggregate(detail_rows)
    validation = {
        "runId": manifest["runId"],
        "status": status,
        "requestedUniqueTalents": manifest["uniqueTalentLimit"],
        "selectedUniqueTalents": len(candidates),
        "fullyEvaluatedUniqueTalents": len(normalized),
        "missingTalentIds": missing,
        "evaluatedPairs": len(normalized),
        "sourceStateCounts": dict(source_counts),
        "labelCounts": dict(label_counts),
        "roleCounts": dict(role_counts),
        "onboardingCounts": detail_aggregate["onboarding"],
        "recoveredFitCount": recovered_fit,
        "recommendCount": recommend_count,
        "cacheUpdateCount": len(normalized),
        "databaseSnapshotBefore": before,
        "databaseSnapshotAfter": after,
        "observedExternalDatabaseDrift": external_drift,
        "databaseWrites": 0,
    }
    metrics = {
        "runId": manifest["runId"],
        "selectedUniqueTalents": len(candidates),
        "completedUniqueTalents": len(normalized),
        "evaluatedPairs": len(normalized),
        "sourceStateMix": dict(source_counts),
        "labelCounts": dict(label_counts),
        "recoveredFitYield": (
            recovered_fit / source_counts["existing_non_fit"]
            if source_counts["existing_non_fit"]
            else None
        ),
        "recommendYield": recommend_count / len(normalized) if normalized else None,
        "roleCoverage": dict(role_counts),
        "onboardingCounts": detail_aggregate["onboarding"],
    }
    write_json(run_path / "evaluations.validated.json", {"evaluations": normalized})
    write_json(run_path / "validation.json", validation)
    write_json(run_path / "metrics.json", metrics)
    write_text(
        run_path / "review-report.md",
        render_review_report(
            manifest,
            detail_rows,
            status=status,
            selected_count=len(candidates),
            external_drift=external_drift,
        ),
    )
    lines = [
        "# Company Role Fit Recovery Audit Run",
        "",
        f"- Run ID: `{manifest['runId']}`",
        f"- Company: {manifest.get('companyName')}",
        f"- Mode: `{manifest.get('mode')}`",
        f"- Status: `{status}`",
        f"- Selected / completed unique talents: {len(candidates)} / {len(normalized)}",
        f"- Source states: `{json.dumps(dict(source_counts), ensure_ascii=False)}`",
        f"- Labels: `{json.dumps(dict(label_counts), ensure_ascii=False)}`",
        f"- Onboarding: `{json.dumps(detail_aggregate['onboarding'], ensure_ascii=False)}`",
        f"- Recovered fit: {recovered_fit}",
        f"- Recommend proposals: {recommend_count}",
        f"- Database writes: 0",
        f"- Observed external DB drift during run: {str(external_drift).lower()}",
        "",
        "- Detailed candidate review: [review-report.md](./review-report.md)",
        "",
        "Private candidate details remain in the ignored detailed report and candidate packets.",
        "",
    ]
    write_text(run_path / "summary.md", "\n".join(lines))
    write_json(
        manifest_path,
        {
            **manifest,
            "status": status,
            "finishedAt": completed_at,
            "databaseSnapshotAfter": after,
            "observedExternalDatabaseDrift": external_drift,
            "databaseWrites": 0,
        },
    )
    print(json.dumps(validation, ensure_ascii=False))
    return 0


def command_report(args: argparse.Namespace) -> int:
    run_path = Path(args.run_path).resolve()
    if DEFAULT_OUTPUT_ROOT.resolve() not in run_path.parents:
        raise RuntimeError("run path must remain inside output/company_role_fit_audit")
    output_name = Path(args.output)
    if output_name.name != args.output or output_name.suffix.lower() != ".md":
        raise ValueError("--output must be a Markdown filename inside the run directory")
    manifest = read_json(run_path / "manifest.json")
    index = read_json(run_path / "candidate_index.json")
    validated = read_json(run_path / "evaluations.validated.json")
    evaluations = validated.get("evaluations") or []
    role_filter = set(normalized_role_ids(args.role_id)) if args.role_id else set()
    if role_filter:
        evaluations = [
            item
            for item in evaluations
            if str(item["evaluations"][0]["roleId"]) in role_filter
        ]
    if not evaluations:
        raise RuntimeError("no completed evaluations match the report scope")
    rows = candidate_report_rows(run_path, index, evaluations)
    scope_note = None
    if role_filter:
        scope_note = "role filter " + ", ".join(sorted(role_filter))
    report = render_review_report(
        manifest,
        rows,
        status=str(manifest.get("status") or "unknown"),
        selected_count=len(rows) if role_filter else len(index.get("candidates") or []),
        external_drift=bool(manifest.get("observedExternalDatabaseDrift")),
        scope_note=scope_note,
    )
    output_path = run_path / output_name
    write_text(output_path, report)
    print(
        json.dumps(
            {
                "runId": manifest.get("runId"),
                "reportPath": str(output_path),
                "reportedUniqueTalents": len(rows),
                "onboardingCounts": report_aggregate(rows)["onboarding"],
                "databaseWrites": 0,
            },
            ensure_ascii=False,
        )
    )
    return 0


def add_scope_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--company-workspace-id", required=True)
    parser.add_argument("--role-id", action="append", default=[], required=True)
    parser.add_argument(
        "--allow-non-auto-role",
        action="store_true",
        help="allow explicitly named is_auto=false roles in a manual audit",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    preflight = sub.add_parser("preflight")
    add_scope_args(preflight)
    preflight.set_defaults(func=command_preflight)

    prepare = sub.add_parser("prepare")
    add_scope_args(prepare)
    prepare.add_argument("--sql-file", required=True)
    prepare.add_argument("--limit", type=int, default=50)
    prepare.add_argument("--run-id")
    prepare.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    prepare.set_defaults(func=command_prepare)

    finish = sub.add_parser("finish")
    finish.add_argument("--run-path", required=True)
    finish.add_argument("--evaluations", required=True)
    finish.add_argument("--partial", action="store_true")
    finish.set_defaults(func=command_finish)

    report = sub.add_parser("report")
    report.add_argument("--run-path", required=True)
    report.add_argument("--role-id", action="append", default=[])
    report.add_argument("--output", default="review-report.md")
    report.set_defaults(func=command_report)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

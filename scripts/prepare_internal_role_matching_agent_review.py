#!/usr/bin/env python3
"""Prepare a read-only candidate pool for direct Codex review.

This script performs deterministic database reads, exclusions, retrieval scoring,
and artifact formatting only. It does not call or delegate to any model.
"""

from __future__ import annotations

import argparse
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Iterable, Mapping, Sequence

from dotenv import load_dotenv
import requests


MANUAL_VERSION = "1.5"
TARGET_POOL_SIZE = 200
ALLOWED_ROLE_STATUSES = {"active", "top_priority", "paused"}
ACTIVE_PIPELINE_TAGS = {"내부:연결대기", "내부:최종오퍼", "내부:보류"}

ENGINEERING_TERMS = (
    "software engineer", "backend engineer", "back-end engineer", "frontend engineer",
    "front-end engineer", "full stack", "full-stack", "machine learning engineer",
    "ml engineer", "ai engineer", "research engineer", "founding engineer", "developer",
    "cto", "엔지니어", "개발자",
)
DIRECT_TITLE_TERMS = (
    "founding engineer", "ai engineer", "machine learning engineer", "ml engineer",
    "software engineer", "full stack", "full-stack", "backend engineer",
    "research engineer", "llm engineer", "ai 엔지니어", "소프트웨어 엔지니어",
)
ADJACENT_TERMS = (
    "founder", "co-founder", "cto", "research scientist", "applied scientist",
    "product engineer", "data scientist", "ai researcher", "창업", "연구원",
)
CORE_GROUPS = (
    ("llm", "large language model", "generative ai", "생성형 ai", "언어 모델"),
    ("agent", "agentic", "에이전트"),
    ("rag", "retrieval augmented", "vector database", "벡터 db", "검색 증강"),
    ("prompt", "prompting", "프롬프트"),
    ("eval", "evaluation", "benchmark", "평가"),
    ("orchestration", "multi-agent", "multi agent", "멀티에이전트"),
    ("production", "deployed", "deployment", "serving", "프로덕션", "배포", "운영"),
)
PRODUCT_GROUPS = (
    ("frontend", "front-end", "react", "next.js", "프론트엔드"),
    ("backend", "back-end", "api", "database", "백엔드"),
    ("end-to-end", "end to end", "full stack", "full-stack", "제품 전체"),
    ("shipped", "launched", "built product", "출시", "런칭", "제품 개발"),
)
IMPACT_TERMS = (
    "launched", "shipped", "led", "founded", "revenue", "users", "latency",
    "scaled", "production", "open source", "publication", "patent", "출시",
    "리드", "창업", "매출", "사용자", "성능 개선",
)
KOREA_TERMS = ("seoul", "서울", "korea", "한국", "대한민국", "경기", "인천")
EVIDENCE_TERMS = tuple(dict.fromkeys(DIRECT_TITLE_TERMS + ADJACENT_TERMS + IMPACT_TERMS + tuple(term for group in CORE_GROUPS + PRODUCT_GROUPS for term in group)))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def compact(value: Any, limit: int = 1200) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def jsonable(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def digest(value: Any) -> str:
    payload = json.dumps(jsonable(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        if not value.strip():
            return []
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [parsed]
        except json.JSONDecodeError:
            return [value]
    return [value]


def normalized_company(value: Any) -> str:
    text = compact(value, 200).lower()
    text = re.sub(r"\b(inc|incorporated|corp|corporation|ltd|limited|llc|co)\b", "", text)
    return re.sub(r"[^a-z0-9가-힣]", "", text)


def has_any(text: str, terms: Sequence[str]) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in terms)


def group_hits(text: str, groups: Sequence[Sequence[str]]) -> int:
    lowered = text.lower()
    return sum(1 for group in groups if any(term.lower() in lowered for term in group))


def parse_date(value: Any, default: date | None = None) -> date | None:
    raw = compact(value, 40)
    if not raw:
        return default
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return default


def engineering_months(rows: Sequence[Mapping[str, Any]]) -> int:
    today = now_utc().date()
    spans: list[tuple[date, date]] = []
    fallback = 0
    for row in rows:
        text = " ".join(compact(row.get(key), 3000) for key in ("role", "description", "memo"))
        if not has_any(text, ENGINEERING_TERMS + ADJACENT_TERMS):
            continue
        start = parse_date(row.get("start_date"))
        end = parse_date(row.get("end_date"), today)
        if start and end and end >= start:
            spans.append((start, end))
        else:
            try:
                fallback = max(fallback, int(row.get("months") or 0))
            except (TypeError, ValueError):
                pass
    spans.sort()
    merged: list[list[date]] = []
    for start, end in spans:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    days = sum((end - start).days for start, end in merged)
    return max(fallback, round(days / 30.4375))


def index_many(rows: Iterable[Mapping[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        value = compact(row.get(key), 100)
        if value:
            result.setdefault(value, []).append(dict(row))
    return result


def first(rows: Sequence[Mapping[str, Any]], error: str) -> dict[str, Any]:
    if not rows:
        raise RuntimeError(error)
    return dict(rows[0])


class SupabaseReadOnly:
    def __init__(self, url: str, key: str) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}

    def get(self, table: str, *, select: str = "*", filters: Mapping[str, str] | None = None, order: str | None = None) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        limit = 1000
        while True:
            params: dict[str, Any] = {"select": select, "limit": limit, "offset": offset}
            if filters:
                params.update(filters)
            if order:
                params["order"] = order
            response = requests.get(f"{self.base}/{table}", headers=self.headers, params=params, timeout=120)
            response.raise_for_status()
            page = response.json()
            if not isinstance(page, list):
                raise RuntimeError(f"Unexpected {table} response")
            rows.extend(page)
            if len(page) < limit:
                return rows
            offset += limit

    def by_ids(self, table: str, column: str, ids: Sequence[str], *, select: str, order: str | None = None) -> list[dict[str, Any]]:
        chunks = [ids[index:index + 40] for index in range(0, len(ids), 40)]
        if not chunks:
            return []
        output: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=min(8, len(chunks))) as executor:
            futures = [executor.submit(self.get, table, select=select, filters={column: f"in.({','.join(chunk)})"}, order=order) for chunk in chunks]
            for future in as_completed(futures):
                output.extend(future.result())
        return output


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def searchable(profile: Mapping[str, Any], experiences: Sequence[Mapping[str, Any]], educations: Sequence[Mapping[str, Any]], extras: Sequence[Mapping[str, Any]]) -> str:
    parts = [profile.get("headline"), profile.get("bio"), profile.get("resume_text"), profile.get("current_location"), profile.get("location")]
    for row in experiences:
        parts.extend(row.get(key) for key in ("company_name", "role", "description", "memo"))
    for row in educations:
        parts.extend(row.get(key) for key in ("school", "degree", "field", "description", "memo"))
    for row in extras[:2]:
        parts.append(json.dumps(jsonable(row.get("content") or {}), ensure_ascii=False))
    return " ".join(compact(part, 16000) for part in parts if part)


def retrieval_features(text: str, months: int, location: str) -> dict[str, int]:
    function = 25 if has_any(text, DIRECT_TITLE_TERMS) else 15 if has_any(text, ADJACENT_TERMS) else 0
    core_work = min(20, group_hits(text, CORE_GROUPS) * 3)
    experience = 15 if months >= 60 else 12 if months >= 36 else 8 if months >= 24 else 4 if months >= 12 else 0
    product = min(10, group_hits(text, PRODUCT_GROUPS) * 3)
    location_score = 10 if has_any(location, KOREA_TERMS) else 0
    impact = min(6, sum(1 for term in IMPACT_TERMS if term.lower() in text.lower()))
    return {"function": function, "coreWork": core_work, "experience": experience, "productEndToEnd": product, "location": location_score, "impact": impact, "roleRelevance": min(86, function + core_work + experience + product + location_score + impact)}


def recency_bonus(value: Any) -> int:
    logged = parse_date(value)
    if not logged:
        return 0
    age = (now_utc().date() - logged).days
    return 4 if age <= 30 else 2 if age <= 90 else 0


def effective_fit_label(rows: Sequence[Mapping[str, Any]]) -> str:
    if not rows:
        return ""
    row = rows[0]
    return compact(row.get("human_label") or row.get("label"), 40).lower()


def keyword_excerpts(text: str, *, max_windows: int = 8, radius: int = 180) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    lowered = normalized.lower()
    windows: list[tuple[int, int]] = []
    for term in EVIDENCE_TERMS:
        start = lowered.find(term.lower())
        if start < 0:
            continue
        left = max(0, start - radius)
        right = min(len(normalized), start + len(term) + radius)
        if any(left <= old_right and right >= old_left for old_left, old_right in windows):
            continue
        windows.append((left, right))
        if len(windows) >= max_windows:
            break
    if not windows:
        return compact(normalized, 1600)
    windows.sort()
    return " ... ".join(normalized[left:right] for left, right in windows)[:3200]


def safe_metadata(value: Any) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    return {key: jsonable(value.get(key)) for key in ("org", "status", "priority", "stage", "source") if value.get(key) is not None}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--role-id", required=True)
    parser.add_argument("--max-proposals", required=True, type=int)
    parser.add_argument("--requested-by", required=True)
    parser.add_argument("--additional-instruction", default="")
    args = parser.parse_args()
    if not 1 <= args.max_proposals <= 50:
        raise SystemExit("max_proposals must be 1..50")

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env.local", override=False)
    url = compact(os.environ.get("NEXT_PUBLIC_SUPABASE_URL"), 500)
    key = compact(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"), 10000)
    if not url or not key:
        raise SystemExit("Supabase read credentials are required")
    db = SupabaseReadOnly(url, key)

    started = now_utc()
    output = root / "output" / "internal_role_matching" / args.role_id / started.strftime("%Y%m%dT%H%M%SZ")
    output.mkdir(parents=True)
    (output / "review_batches").mkdir()
    manifest = {
        "manualVersion": MANUAL_VERSION,
        "evaluatorVersion": "codex-direct-review-1",
        "roleId": args.role_id,
        "maxProposals": args.max_proposals,
        "executionMode": "dry_run",
        "requestedBy": args.requested_by,
        "additionalInstruction": args.additional_instruction,
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "status": "preparing_retrieval",
        "modelDelegationAllowed": False,
        "externalModelCallsAttempted": 0,
        "externalModelProviders": [],
        "candidatePayloadSentToExternalModel": False,
        "databaseWrites": 0,
        "recommendationRunsQueued": 0,
    }
    write_json(output / "run_manifest.json", manifest)

    role = first(db.get("company_roles", filters={"role_id": f"eq.{args.role_id}"}), "role not found")
    status = compact(role.get("status"), 40).lower()
    if compact(role.get("source_type"), 40).lower() != "internal" or status not in ALLOWED_ROLE_STATUSES or role.get("is_expired") is True:
        manifest.update({"status": "stopped_role_status", "roleStatus": status, "completedAt": iso_now()})
        write_json(output / "run_manifest.json", manifest)
        return 2
    workspace = first(db.get("company_workspace", filters={"company_workspace_id": f"eq.{role['company_workspace_id']}"}), "workspace not found")
    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{args.role_id}"})
    internal_role = dict(internal_rows[0]) if internal_rows else {"role_id": args.role_id, "request": None, "considerations": {}}
    company_db_rows = db.get("company_db", filters={"id": f"eq.{workspace.get('company_db_id')}"}) if workspace.get("company_db_id") else []
    company_db = dict(company_db_rows[0]) if company_db_rows else {}

    with ThreadPoolExecutor(max_workers=10) as executor:
        calls = {
            "company_roles": executor.submit(db.get, "company_roles", select="role_id,company_workspace_id,name,source_type,status,location_text,work_mode,type,is_expired,updated_at"),
            "workspaces": executor.submit(db.get, "company_workspace", select="company_workspace_id,company_name,company_db_id"),
            "target_recs": executor.submit(db.get, "talent_opportunity_recommendation", filters={"role_id": f"eq.{args.role_id}"}),
            "target_progress": executor.submit(db.get, "talent_progress", filters={"role_id": f"eq.{args.role_id}"}),
            "target_tags": executor.submit(db.get, "talent_opportunity_tag", filters={"opportunity_id": f"eq.{args.role_id}"}),
            "profiles": executor.submit(db.get, "talent_users", select="user_id,name,headline,bio,current_location,location,resume_text,resume_links,last_logined_at,updated_at"),
            "settings": executor.submit(db.get, "talent_setting", select="user_id,profile_visibility,get_internal_recommendation,blocked_companies,engagement_types,status,is_onboarding_done,updated_at"),
            "experiences": executor.submit(db.get, "talent_experiences", select="id,talent_id,company_name,role,start_date,end_date,months,description,memo,employment_type"),
            "educations": executor.submit(db.get, "talent_educations", select="id,talent_id,school,degree,field,start_date,end_date,description,memo"),
            "extras": executor.submit(db.get, "talent_extras", select="talent_id,content"),
            "all_recs": executor.submit(db.get, "talent_opportunity_recommendation", select="id,talent_id,role_id,feedback,feedback_reason,saved_stage,recommended_at,created_at,viewed_at,clicked_at"),
            "all_tags": executor.submit(db.get, "talent_opportunity_tag", select="id,talent_id,opportunity_id,tag,created_at,updated_at"),
            "target_fits": executor.submit(db.get, "talent_opportunity_fit", filters={"opportunity_id": f"eq.{args.role_id}"}),
        }
        loaded = {name: future.result() for name, future in calls.items()}

    company_roles = [row for row in loaded["company_roles"] if row.get("company_workspace_id") == role.get("company_workspace_id")]
    source_material = {
        "role": role,
        "internalRole": internal_role,
        "workspace": workspace,
        "companyDb": company_db,
        "sameRoleRecommendations": loaded["target_recs"],
        "sameRoleProgress": [{**row, "metadata": safe_metadata(row.get("metadata"))} for row in loaded["target_progress"]],
        "sameRoleTags": loaded["target_tags"],
        "sameCompanyRoles": company_roles,
    }
    write_json(output / "source_material.json", source_material)
    source_hashes = {
        "roleInputHash": digest({key: role.get(key) for key in ("description", "request", "location_text", "work_mode", "type", "status", "is_expired")}),
        "internalRequestHash": digest(internal_role.get("request")),
        "workspaceInputHash": digest({key: workspace.get(key) for key in ("request", "company_description", "pitch")}),
    }
    snapshot = {
        "capturedAt": iso_now(),
        "role": {"id": role.get("role_id"), "updatedAt": role.get("updated_at"), "status": status, "isExpired": role.get("is_expired"), "sourceType": role.get("source_type")},
        "internalRole": {"id": internal_role.get("role_id"), "updatedAt": internal_role.get("updated_at")},
        "workspace": {"id": workspace.get("company_workspace_id"), "updatedAt": workspace.get("updated_at"), "companyName": workspace.get("company_name")},
        "companyDb": {"id": company_db.get("id"), "lastUpdatedAt": company_db.get("last_updated_at")},
        "sourceCounts": {"sameRoleRecommendations": len(loaded["target_recs"]), "sameRoleProgress": len(loaded["target_progress"]), "sameRoleTags": len(loaded["target_tags"]), "sameCompanyRoles": len(company_roles)},
        "hashes": {**source_hashes, "sourceHash": digest(source_hashes)},
    }
    write_json(output / "source_snapshot.json", snapshot)

    profiles = {compact(row.get("user_id"), 100): row for row in loaded["profiles"]}
    settings = {compact(row.get("user_id"), 100): row for row in loaded["settings"]}
    experiences = index_many(loaded["experiences"], "talent_id")
    educations = index_many(loaded["educations"], "talent_id")
    extras = index_many(loaded["extras"], "talent_id")
    recs = index_many(loaded["all_recs"], "talent_id")
    tags = index_many(loaded["all_tags"], "talent_id")
    fits = index_many(loaded["target_fits"], "talent_id")
    role_map = {compact(row.get("role_id"), 100): row for row in loaded["company_roles"]}
    workspace_map = {compact(row.get("company_workspace_id"), 100): row for row in loaded["workspaces"]}
    internal_role_ids = {role_id for role_id, item in role_map.items() if compact(item.get("source_type"), 40).lower() == "internal"}
    same_role_rec_talents = {compact(row.get("talent_id"), 100) for row in loaded["target_recs"]}
    same_company_role_ids = {compact(row.get("role_id"), 100) for row in company_roles}
    aliases = {normalized_company(workspace.get("company_name")), normalized_company(company_db.get("name"))} - {""}

    excluded = {"visibility": 0, "optOut": 0, "alreadyRecommended": 0, "blockedCompany": 0, "currentCompany": 0, "activeCompanyPipeline": 0, "effectiveUnfit": 0, "minimumRelevance": 0}
    eligible: list[dict[str, Any]] = []
    for talent_id, profile in profiles.items():
        setting = settings.get(talent_id) or {}
        if compact(setting.get("profile_visibility"), 40) == "dont_share":
            excluded["visibility"] += 1
            continue
        if setting.get("get_internal_recommendation") is False:
            excluded["optOut"] += 1
            continue
        if talent_id in same_role_rec_talents:
            excluded["alreadyRecommended"] += 1
            continue
        if aliases & {normalized_company(item) for item in as_list(setting.get("blocked_companies"))}:
            excluded["blockedCompany"] += 1
            continue
        candidate_exp = experiences.get(talent_id) or []
        current_companies = {normalized_company(item.get("company_name")) for item in candidate_exp if not compact(item.get("end_date"), 40)}
        if aliases & current_companies:
            excluded["currentCompany"] += 1
            continue
        if any(compact(item.get("opportunity_id"), 100) in same_company_role_ids and (compact(item.get("tag"), 200) in ACTIVE_PIPELINE_TAGS or compact(item.get("tag"), 200).startswith("내부단계:")) for item in tags.get(talent_id) or []):
            excluded["activeCompanyPipeline"] += 1
            continue
        fit_label = effective_fit_label(fits.get(talent_id) or [])
        if fit_label == "unfit":
            excluded["effectiveUnfit"] += 1
            continue
        text = searchable(profile, candidate_exp, educations.get(talent_id) or [], extras.get(talent_id) or [])
        months = engineering_months(candidate_exp)
        location = " ".join(compact(profile.get(key), 300) for key in ("current_location", "location"))
        features = retrieval_features(text, months, location)
        other_internal_tags = [item for item in tags.get(talent_id) or [] if compact(item.get("opportunity_id"), 100) in internal_role_ids and compact(item.get("opportunity_id"), 100) != args.role_id]
        stage_bonus = 8 if any(compact(item.get("tag"), 100) == "내부:최종오퍼" for item in other_internal_tags) else 6 if any(compact(item.get("tag"), 100) in {"내부:연결대기", "내부:프로세스중"} or compact(item.get("tag"), 100).startswith("내부단계:") for item in other_internal_tags) else 0
        response_bonus = 2 if any(compact(item.get("feedback"), 40).lower() in {"like", "positive", "dislike", "negative"} for item in recs.get(talent_id) or []) else 0
        system_score = min(14, stage_bonus + recency_bonus(profile.get("last_logined_at")) + response_bonus)
        if features["roleRelevance"] < 12 or (features["function"] == 0 and features["coreWork"] < 6):
            excluded["minimumRelevance"] += 1
            continue
        lanes = []
        if features["function"] >= 25:
            lanes.append("direct_function_title")
        if features["coreWork"] >= 9:
            lanes.append("core_work_evidence")
        if has_any(text, ADJACENT_TERMS) and features["coreWork"] >= 6:
            lanes.append("adjacent_transferable")
        if features["impact"] >= 3 and features["roleRelevance"] >= 24:
            lanes.append("high_impact_non_obvious")
        if not lanes:
            lanes.append("backfill_role_adjacent")
        fit_row = (fits.get(talent_id) or [None])[0]
        eligible.append({
            "talentId": talent_id,
            "name": compact(profile.get("name"), 160),
            "headline": compact(profile.get("headline"), 300),
            "location": compact(location, 300),
            "engineeringMonths": months,
            "features": features,
            "systemScore": system_score,
            "retrievalScore": min(100, features["roleRelevance"] + system_score),
            "retrievalLanes": lanes,
            "existingFitLabel": fit_label or None,
            "existingFitScore": fit_row.get("score") if fit_row else None,
        })
    eligible.sort(key=lambda row: (-row["retrievalScore"], -row["features"]["roleRelevance"], row["talentId"]))
    selected_ids: set[str] = set()
    lane_stats = []
    for lane, requested in (("direct_function_title", 80), ("core_work_evidence", 60), ("adjacent_transferable", 40), ("high_impact_non_obvious", 20)):
        lane_rows = [row for row in eligible if lane in row["retrievalLanes"]]
        overlap = sum(row["talentId"] in selected_ids for row in lane_rows)
        contributed = 0
        for row in lane_rows:
            if row["talentId"] in selected_ids:
                continue
            selected_ids.add(row["talentId"])
            contributed += 1
            if contributed >= requested:
                break
        lane_stats.append({"lane": lane, "requestedUnique": requested, "rawFetched": len(lane_rows), "overlapWithEarlierLanes": overlap, "uniqueContributed": contributed, "eligibleRoleAdjacentRemaining": max(0, len(lane_rows) - overlap - contributed)})
    for row in eligible:
        if len(selected_ids) >= TARGET_POOL_SIZE:
            break
        selected_ids.add(row["talentId"])
    pool = [row for row in eligible if row["talentId"] in selected_ids][:TARGET_POOL_SIZE]
    pool_ids = [row["talentId"] for row in pool]
    funnel = {"allTalentUsers": len(profiles), "excluded": excluded, "afterBaseExclusions": len(profiles) - sum(value for key_name, value in excluded.items() if key_name != "minimumRelevance"), "eligibleRoleAdjacent": len(eligible), "retrieved": len(pool), "targetPool": TARGET_POOL_SIZE, "poolShortfallReason": None if len(pool) == TARGET_POOL_SIZE else "insufficient_relevant_candidates", "lanes": lane_stats}
    write_json(output / "retrieval_funnel.json", funnel)
    write_text(output / "retrieval.sql", f"""-- Read-only retrieval executed through Supabase PostgREST GET.
-- role_id={args.role_id}
-- Exclusions: dont_share, internal opt-out, same-role recommendation, blocked company,
-- current target-company employment, active same-company pipeline, effective unfit.
-- Retrieval: role relevance 86 + bounded system signals 14; four diversity lanes;
-- deterministic backfill to at most 200 unique role-adjacent candidates.
-- No external model, database mutation, RPC, queue, chat, or delivery call.
""")
    with (output / "candidate_pool.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rank", "talent_id", "name", "headline", "location", "engineering_months", "role_relevance", "system_score", "retrieval_score", "retrieval_lanes", "existing_fit_label", "existing_fit_score"])
        for rank, row in enumerate(pool, 1):
            writer.writerow([rank, row["talentId"], row["name"], row["headline"], row["location"], row["engineeringMonths"], row["features"]["roleRelevance"], row["systemScore"], row["retrievalScore"], "|".join(row["retrievalLanes"]), row["existingFitLabel"], row["existingFitScore"]])
    print(f"[prepare] retrieval complete pool={len(pool)} output={output}", flush=True)

    with ThreadPoolExecutor(max_workers=7) as executor:
        calls = {
            "insights": executor.submit(db.by_ids, "talent_insights", "talent_id", pool_ids, select="id,talent_id,content,created_at,last_updated_at"),
            "summaries": executor.submit(db.by_ids, "talent_conversation_summaries", "talent_id", pool_ids, select="id,talent_id,conversation_id,segment_summary,summary_text,created_at,to_message_id", order="created_at.desc"),
            "activities": executor.submit(db.by_ids, "talent_activity_events", "talent_id", pool_ids, select="id,talent_id,event_type,summary,impact_level,source,created_at", order="created_at.desc"),
            "progress": executor.submit(db.by_ids, "talent_progress", "talent_id", pool_ids, select="id,talent_id,role_id,recommendation_id,kind,text,metadata,user_id,created_at", order="created_at.desc"),
            "memos": executor.submit(db.by_ids, "talent_ops_profile_memos", "talent_id", pool_ids, select="id,talent_id,content,created_at,updated_at"),
        }
        detail = {name: future.result() for name, future in calls.items()}
    insights = index_many(detail["insights"], "talent_id")
    summaries = index_many(detail["summaries"], "talent_id")
    activities = index_many(detail["activities"], "talent_id")
    progress = index_many(detail["progress"], "talent_id")
    memos = index_many(detail["memos"], "talent_id")

    packets = []
    for rank, pool_row in enumerate(pool, 1):
        talent_id = pool_row["talentId"]
        profile = profiles[talent_id]
        candidate_exp = sorted(experiences.get(talent_id) or [], key=lambda item: compact(item.get("start_date")), reverse=True)
        full_search = searchable(profile, candidate_exp, educations.get(talent_id) or [], extras.get(talent_id) or [])
        recent_recs = []
        for item in sorted(recs.get(talent_id) or [], key=lambda row: compact(row.get("created_at") or row.get("recommended_at")), reverse=True)[:12]:
            rec_role = role_map.get(compact(item.get("role_id"), 100)) or {}
            rec_workspace = workspace_map.get(compact(rec_role.get("company_workspace_id"), 100)) or {}
            recent_recs.append({"id": item.get("id"), "roleId": item.get("role_id"), "company": rec_workspace.get("company_name"), "role": rec_role.get("name"), "sourceType": rec_role.get("source_type"), "feedback": item.get("feedback"), "feedbackReason": compact(item.get("feedback_reason"), 500), "savedStage": item.get("saved_stage"), "recommendedAt": item.get("recommended_at") or item.get("created_at")})
        packet = {
            "rank": rank,
            "retrieval": pool_row,
            "profile": {"talentId": talent_id, "name": profile.get("name"), "headline": profile.get("headline"), "bio": compact(profile.get("bio"), 1600), "currentLocation": profile.get("current_location"), "location": profile.get("location"), "lastLoginedAt": profile.get("last_logined_at"), "publicProfileLinks": as_list(profile.get("resume_links"))[:6]},
            "keywordEvidenceExcerpt": keyword_excerpts(full_search),
            "resumeExcerpt": compact(profile.get("resume_text"), 5000),
            "experiences": [{"id": item.get("id"), "company": item.get("company_name"), "role": item.get("role"), "start": item.get("start_date"), "end": item.get("end_date"), "employmentType": item.get("employment_type"), "description": compact(item.get("description"), 1600), "memo": compact(item.get("memo"), 400)} for item in candidate_exp[:15]],
            "educations": [{"id": item.get("id"), "school": item.get("school"), "degree": item.get("degree"), "field": item.get("field"), "start": item.get("start_date"), "end": item.get("end_date"), "description": compact(item.get("description"), 400)} for item in (educations.get(talent_id) or [])[:8]],
            "extras": [compact(json.dumps(jsonable(item.get("content") or {}), ensure_ascii=False), 2500) for item in (extras.get(talent_id) or [])[:2]],
            "insights": [{"id": item.get("id"), "content": compact(json.dumps(jsonable(item.get("content") or {}), ensure_ascii=False), 3500), "updatedAt": item.get("last_updated_at") or item.get("created_at")} for item in sorted(insights.get(talent_id) or [], key=lambda row: compact(row.get("last_updated_at") or row.get("created_at")), reverse=True)[:3]],
            "conversationSummaries": [{"id": item.get("id"), "createdAt": item.get("created_at"), "summary": compact(item.get("segment_summary") or item.get("summary_text"), 1600)} for item in sorted(summaries.get(talent_id) or [], key=lambda row: compact(row.get("created_at")), reverse=True)[:4]],
            "activityEvents": [{"id": item.get("id"), "eventType": item.get("event_type"), "summary": compact(item.get("summary"), 500), "impactLevel": item.get("impact_level"), "createdAt": item.get("created_at")} for item in sorted(activities.get(talent_id) or [], key=lambda row: compact(row.get("created_at")), reverse=True)[:10]],
            "recentRecommendations": recent_recs,
            "progress": [{"id": item.get("id"), "roleId": item.get("role_id"), "kind": item.get("kind"), "text": compact(item.get("text"), 600), "metadata": safe_metadata(item.get("metadata")), "createdAt": item.get("created_at")} for item in sorted(progress.get(talent_id) or [], key=lambda row: compact(row.get("created_at")), reverse=True)[:20]],
            "tags": [{"id": item.get("id"), "roleId": item.get("opportunity_id"), "tag": item.get("tag"), "updatedAt": item.get("updated_at")} for item in sorted(tags.get(talent_id) or [], key=lambda row: compact(row.get("updated_at")), reverse=True)[:20]],
            "opsMemos": [{"id": item.get("id"), "content": compact(item.get("content"), 800), "updatedAt": item.get("updated_at")} for item in sorted(memos.get(talent_id) or [], key=lambda row: compact(row.get("updated_at")), reverse=True)[:5]],
            "existingFit": jsonable((fits.get(talent_id) or [None])[0]),
        }
        packets.append(packet)
    with (output / "candidate_packets.jsonl").open("w", encoding="utf-8") as handle:
        for packet in packets:
            handle.write(json.dumps(packet, ensure_ascii=False) + "\n")

    for batch_start in range(0, len(packets), 20):
        lines = [f"# Review Batch {batch_start // 20 + 1}", ""]
        for packet in packets[batch_start:batch_start + 20]:
            retrieval = packet["retrieval"]
            profile = packet["profile"]
            lines.extend([
                f"## {packet['rank']}. {profile.get('name')} (`{profile.get('talentId')}`)",
                f"- Headline/location: {compact(profile.get('headline'), 300)} | {compact(profile.get('currentLocation') or profile.get('location'), 160)}",
                f"- Retrieval: relevance {retrieval['features']['roleRelevance']}, system {retrieval['systemScore']}, months {retrieval['engineeringMonths']}, lanes {', '.join(retrieval['retrievalLanes'])}, existing fit {retrieval.get('existingFitLabel') or '-'} {retrieval.get('existingFitScore') if retrieval.get('existingFitScore') is not None else ''}",
                f"- Bio: {compact(profile.get('bio'), 700)}",
                f"- Evidence excerpt: {compact(packet.get('keywordEvidenceExcerpt'), 2400)}",
                "- Experience: " + " | ".join(f"{item.get('start') or '?'}~{item.get('end') or 'present'} {compact(item.get('company'), 80)} / {compact(item.get('role'), 100)}: {compact(item.get('description'), 500)}" for item in packet["experiences"][:6]),
                "- Candidate context: " + " | ".join(compact(item.get("summary"), 500) for item in packet["conversationSummaries"][:2]),
                "- Recommendation history: " + " | ".join(f"{item.get('company')}/{item.get('role')} feedback={item.get('feedback')} reason={compact(item.get('feedbackReason'), 220)}" for item in packet["recentRecommendations"][:5]),
                "- Ops evidence: " + " | ".join(compact(item.get("text") or item.get("content"), 300) for item in (packet["progress"][:4] + packet["opsMemos"][:2])),
                "",
            ])
        write_text(output / "review_batches" / f"batch_{batch_start // 20 + 1:02d}.md", "\n".join(lines))

    manifest.update({"status": "awaiting_agent_evaluation", "roleStatus": status, "retrievalCount": len(pool), "preparedAt": iso_now(), "artifactDirectory": str(output)})
    write_json(output / "run_manifest.json", manifest)
    print(json.dumps({"status": manifest["status"], "output": str(output), "retrieved": len(pool)}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

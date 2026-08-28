#!/usr/bin/env python3
"""Prepare a manual-2.3 SBVA Communications dry-run review.

This script performs deterministic database reads, country evidence gating,
retrieval scoring, and artifact formatting only. It does not call a model,
make matching judgments, mutate business data, queue work, or send messages.
The current Codex agent must review the resulting candidate packets directly.
"""

from __future__ import annotations

import argparse
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Iterable, Mapping, Sequence

from dotenv import load_dotenv

from internal_role_matching_run_memory import fetch_latest_run_memory
from prepare_config_robotics_matching_run import latest_by_talent
from prepare_internal_role_matching_agent_review import (
    ACTIVE_PIPELINE_TAGS,
    SupabaseReadOnly,
    as_list,
    compact,
    digest,
    index_many,
    is_same_role_accepted_unprocessed,
    jsonable,
    normalized_company,
    parse_date,
    resolve_profile_location,
    safe_metadata,
)


MANUAL_VERSION = "2.3"
EVALUATOR_VERSION = "codex-sbva-communications-direct-review-20260730"
EXPECTED_ROLE_NAME = "Communications Team Assistant Manager (대리)"
EXPECTED_WORKSPACE_NAME = "SBVA"
TARGET_POOL_SIZE = 200
ALLOWED_ROLE_STATUSES = {"active", "top_priority", "paused"}

KOREA_PATTERNS = (
    r"\bseoul\b",
    r"\bsouth korea\b",
    r"\bkorea\b",
    r"서울",
    r"대한민국",
    r"한국",
    r"경기",
    r"인천",
)

KOREA_ORG_PATTERNS = (
    *KOREA_PATTERNS,
    r"\bsbva\b",
    r"\bsoftbank ventures korea\b",
    r"\bsoftbank ventures asia\b",
    r"\bkaist\b",
    r"\bsnu\b",
    r"\bseoul national university\b",
    r"\byonsei\b",
    r"\bkorea university\b",
    r"\bpostech\b",
    r"\bhanyang\b",
    r"\bskku\b",
    r"\bsungkyunkwan\b",
    r"\bcoupang\b",
    r"\bkakao\b",
    r"\bnaver\b",
    r"\bsamsung\b",
    r"\blg\b",
    r"\bhyundai\b",
)

DIRECT_TITLE_PATTERNS = (
    r"\bpublic relations\b",
    r"\bpr\b",
    r"\bcommunications?\b",
    r"\bcorporate communications?\b",
    r"\bbrand communications?\b",
    r"\bmarketing communications?\b",
    r"\bmedia relations?\b",
    r"\bpress\b",
    r"\bcontent (manager|lead|strategist|marketer|producer)\b",
    r"\bsocial media\b",
    r"\bcommunity (manager|lead|operations?)\b",
    r"\bevents? (manager|lead|producer|planner|operations?)\b",
    r"\bpartnerships?\b",
    r"\becosystem\b",
    r"홍보",
    r"대외 ?커뮤니케이션",
    r"커뮤니케이션",
    r"콘텐츠",
    r"브랜드",
    r"커뮤니티",
    r"이벤트",
    r"행사",
    r"파트너십",
)

ADJACENT_TITLE_PATTERNS = (
    r"\bmarketing\b",
    r"\bgrowth\b",
    r"\bbusiness development\b",
    r"\bbd\b",
    r"\bstartup program\b",
    r"\baccelerator\b",
    r"\bventure capital\b",
    r"\bvc\b",
    r"\binvestor relations?\b",
    r"\bfounder relations?\b",
    r"\bportfolio support\b",
    r"마케팅",
    r"사업 ?개발",
    r"액셀러레이터",
    r"스타트업",
    r"투자",
    r"창업",
)

CORE_GROUPS: dict[str, tuple[str, ...]] = {
    "pr_media": (
        r"\bpress release\b",
        r"\bmedia relations?\b",
        r"\bearned media\b",
        r"\bcoverage\b",
        r"\bjournalist\b",
        r"\bpublic relations\b",
        r"\bpr\b",
        r"보도자료",
        r"미디어 ?대응",
        r"언론",
        r"홍보",
        r"커버리지",
    ),
    "content_social": (
        r"\bcontent strategy\b",
        r"\bcopywriting\b",
        r"\bnewsletter\b",
        r"\bblog\b",
        r"\bsocial media\b",
        r"\bsns\b",
        r"\bwebsite\b",
        r"콘텐츠",
        r"뉴스레터",
        r"블로그",
        r"소셜",
        r"sns",
        r"웹사이트",
    ),
    "community_events": (
        r"\bcommunity\b",
        r"\bevent\b",
        r"\bmeetup\b",
        r"\bwebinar\b",
        r"\bconference\b",
        r"\bforum\b",
        r"\bfireside chat\b",
        r"커뮤니티",
        r"행사",
        r"이벤트",
        r"밋업",
        r"세미나",
        r"포럼",
    ),
    "partnership_stakeholder": (
        r"\bpartnership\b",
        r"\bstakeholder\b",
        r"\bpartner management\b",
        r"\bfounder relations?\b",
        r"\binvestor relations?\b",
        r"\bc-level\b",
        r"\bexecutive communications?\b",
        r"파트너십",
        r"이해관계자",
        r"네트워크",
        r"창업자",
        r"투자자",
        r"임원",
    ),
    "startup_vc_ecosystem": (
        r"\bventure capital\b",
        r"\bvc\b",
        r"\bportfolio compan",
        r"\bstartup\b",
        r"\bfounder\b",
        r"\baccelerator\b",
        r"\bincubator\b",
        r"\bentrepreneurship\b",
        r"벤처캐피탈",
        r"스타트업",
        r"포트폴리오",
        r"창업",
        r"투자",
        r"액셀러레이터",
    ),
    "business_english_japan": (
        r"\bbusiness english\b",
        r"\benglish communication\b",
        r"\bjapanese\b",
        r"\bjlpt\b",
        r"비즈니스 ?영어",
        r"영어",
        r"일본어",
    ),
}

QUALITY_PATTERNS = (
    r"\blaunched\b",
    r"\bled\b",
    r"\bowned\b",
    r"\borganized\b",
    r"\bhosted\b",
    r"\bpublished\b",
    r"\bnewsletter\b",
    r"\bpress release\b",
    r"\bmedia coverage\b",
    r"\busers?\b",
    r"\battendees?\b",
    r"\bpartners?\b",
    r"\bfounders?\b",
    r"\bportfolio\b",
    r"기획",
    r"운영",
    r"리드",
    r"주도",
    r"작성",
    r"배포",
    r"참석자",
    r"파트너",
    r"창업자",
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def log(message: str) -> None:
    print(f"[prepare-sbva] {message}", file=sys.stderr, flush=True)


def matches(text: str, patterns: Sequence[str]) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)


def matched_groups(text: str) -> list[str]:
    return [name for name, patterns in CORE_GROUPS.items() if matches(text, patterns)]


def searchable(
    profile: Mapping[str, Any],
    experiences: Sequence[Mapping[str, Any]],
    educations: Sequence[Mapping[str, Any]],
    extras: Sequence[Mapping[str, Any]],
) -> str:
    parts = [
        profile.get(key)
        for key in ("headline", "bio", "resume_text")
    ]
    parts.append(resolve_profile_location(profile))
    for row in experiences:
        parts.extend(row.get(key) for key in ("company_name", "role", "description", "memo"))
    for row in educations:
        parts.extend(row.get(key) for key in ("school", "degree", "field", "description", "memo"))
    for row in extras:
        parts.append(json.dumps(jsonable(row.get("content") or {}), ensure_ascii=False))
    return " ".join(str(part) for part in parts if part)


def relevant_months(experiences: Sequence[Mapping[str, Any]]) -> int:
    today = now_utc().date()
    spans: list[tuple[date, date]] = []
    fallback = 0
    for row in experiences:
        text = " ".join(
            str(row.get(key) or "") for key in ("company_name", "role", "description", "memo")
        )
        groups = matched_groups(text)
        if not matches(text, DIRECT_TITLE_PATTERNS + ADJACENT_TITLE_PATTERNS) and len(groups) < 1:
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
    return max(
        fallback,
        round(sum((end - start).days for start, end in merged) / 30.4375),
    )


def feature_scores(text: str, months: int, location: str) -> dict[str, Any]:
    groups = matched_groups(text)
    direct = matches(text, DIRECT_TITLE_PATTERNS)
    adjacent = matches(text, ADJACENT_TITLE_PATTERNS)
    function = 25 if direct else 15 if adjacent and len(groups) >= 1 else 8 if adjacent else 0
    core = min(20, len(groups) * 4)
    experience = (
        15
        if 36 <= months <= 72
        else 12
        if 24 <= months < 36 or 72 < months <= 84
        else 8
        if 12 <= months < 24 or 84 < months <= 108
        else 3
        if months > 0
        else 0
    )
    vc_ecosystem = 10 if "startup_vc_ecosystem" in groups else 0
    location_score = 10 if matches(location, KOREA_PATTERNS) else 0
    impact = min(6, sum(1 for pattern in QUALITY_PATTERNS if re.search(pattern, text, flags=re.IGNORECASE)))
    role_relevance = min(86, function + core + experience + vc_ecosystem + location_score + impact)
    return {
        "function": function,
        "coreWork": core,
        "experience": experience,
        "vcEcosystem": vc_ecosystem,
        "locationLanguage": location_score,
        "impact": impact,
        "roleRelevance": role_relevance,
        "matchedCoreGroups": groups,
        "directFunction": direct,
        "adjacentFunction": adjacent,
    }


def recency_bonus(value: Any) -> int:
    logged = parse_date(value)
    if not logged:
        return 0
    age = (now_utc().date() - logged).days
    return 4 if age <= 14 else 2 if age <= 45 else 1 if age <= 120 else 0


def country_evidence(
    talent_id: str,
    profile: Mapping[str, Any],
    experiences: Sequence[Mapping[str, Any]],
    educations: Sequence[Mapping[str, Any]],
    insights: Sequence[Mapping[str, Any]],
    summaries: Sequence[Mapping[str, Any]],
) -> tuple[str | None, list[dict[str, Any]], list[str], list[str]]:
    evidence: list[dict[str, Any]] = []
    unknowns: list[str] = []
    conflicts: list[str] = []
    location = resolve_profile_location(profile)
    if matches(location, KOREA_PATTERNS):
        evidence.append(
            {
                "type": "current_residence",
                "countryCode": "KR",
                "source": "talent_users.location/current_location fallback",
                "sourceId": talent_id,
                "observedAt": profile.get("updated_at") or "unknown",
                "fact": compact(location, 240),
            }
        )
    preference_text = " ".join(
        json.dumps(jsonable(row.get("content") or {}), ensure_ascii=False)
        for row in insights
    ) + " " + " ".join(
        str(row.get("segment_summary") or row.get("summary_text") or "") for row in summaries
    )
    current_in_korea = matches(location, KOREA_PATTERNS)
    relocation_to_korea = re.search(
        r"(?:relocat(?:e|ion)?|move|return|이주|귀국|근무|가능).{0,80}(?:south korea|korea|seoul|대한민국|한국|서울)"
        r"|(?:south korea|korea|seoul|대한민국|한국|서울).{0,80}(?:relocat(?:e|ion)?|move|return|이주|귀국|근무|가능)",
        preference_text,
        flags=re.IGNORECASE,
    )
    if relocation_to_korea:
        evidence.append(
            {
                "type": "explicit_relocation_intent",
                "countryCode": "KR",
                "source": "talent_insights_or_conversation_summaries",
                "sourceId": talent_id,
                "observedAt": "latest_available",
                "fact": "Korea/Seoul 근무 또는 relocation 관련 명시적 선호가 insight/summary에 있음",
            }
        )
    historical_rows: list[str] = []
    for row in experiences:
        text = " ".join(str(row.get(key) or "") for key in ("company_name", "role", "description", "memo"))
        if matches(text, KOREA_ORG_PATTERNS):
            historical_rows.append(f"experience:{row.get('id')}")
    for row in educations:
        text = " ".join(str(row.get(key) or "") for key in ("school", "degree", "field", "description", "memo"))
        if matches(text, KOREA_ORG_PATTERNS):
            historical_rows.append(f"education:{row.get('id')}")
    if historical_rows:
        evidence.append(
            {
                "type": "target_country_work_education_research",
                "countryCode": "KR",
                "source": "talent_experiences/talent_educations",
                "sourceId": ",".join(historical_rows[:8]),
                "observedAt": "various",
                "fact": "한국 소재 회사·학교·연구 경험이 확인됨",
            }
        )
    remote_only = re.search(r"\b(?:remote[- ]only|only remote|fully remote only)\b|원격(?:근무)?만", preference_text, flags=re.IGNORECASE)
    exclusive_outside_korea = re.search(
        r"(?:\b(?:united states|u\.?s\.?|singapore|japan|tokyo)\b|미국|싱가포르|일본|도쿄).{0,40}(?:\bonly\b|만(?:\b|\s))",
        preference_text,
        flags=re.IGNORECASE,
    )
    no_relocation = re.search(
        r"\b(?:not willing to relocate|cannot relocate|can't relocate|no relocation)\b|이주 (?:불가|의향 없음)|귀국 (?:불가|의향 없음)",
        preference_text,
        flags=re.IGNORECASE,
    )
    if remote_only or exclusive_outside_korea or (no_relocation and not current_in_korea):
        conflicts.append("Korea/Seoul onsite와 충돌 가능성이 있는 지역·remote 제약 표현이 있음")
    if not evidence:
        unknowns.append("target country evidence 없음")
        return None, evidence, unknowns, conflicts
    if any(item["type"] in {"current_residence", "explicit_relocation_intent"} for item in evidence):
        return "confirmed_current_or_relocation", evidence, unknowns, conflicts
    return "historical_affinity_verify_current_intent", evidence, unknowns, conflicts


def relevant_excerpt(text: str, limit: int = 5200) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    hit_patterns = (
        DIRECT_TITLE_PATTERNS
        + ADJACENT_TITLE_PATTERNS
        + tuple(pattern for patterns in CORE_GROUPS.values() for pattern in patterns)
        + QUALITY_PATTERNS
    )
    windows: list[tuple[int, int]] = []
    for pattern in hit_patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if not match:
            continue
        left = max(0, match.start() - 260)
        right = min(len(normalized), match.end() + 520)
        if any(left <= old_right and right >= old_left for old_left, old_right in windows):
            continue
        windows.append((left, right))
        if sum(right - left for left, right in windows) >= limit:
            break
    if not windows:
        return compact(normalized, limit)
    windows.sort()
    return " ... ".join(normalized[left:right] for left, right in windows)[:limit]


def load_detail(db: SupabaseReadOnly, pool_ids: Sequence[str]) -> dict[str, list[dict[str, Any]]]:
    calls: dict[str, tuple[str, str, str, str | None]] = {
        "insights": ("talent_insights", "talent_id", "id,talent_id,content,created_at,last_updated_at", None),
        "activities": ("talent_activity_events", "talent_id", "id,talent_id,event_type,summary,impact_level,source,created_at", "created_at.desc"),
        "progress": ("talent_progress", "talent_id", "id,talent_id,role_id,recommendation_id,kind,text,metadata,user_id,created_at", "created_at.desc"),
        "memos": ("talent_ops_profile_memos", "talent_id", "id,talent_id,content,created_at,updated_at", "created_at.desc"),
        "recommendations": ("talent_opportunity_recommendation", "talent_id", "id,talent_id,role_id,feedback,feedback_reason,processed_stage,saved_stage,dismissed_at,feedback_at,recommended_at,created_at,viewed_at,clicked_at,updated_at", "created_at.desc"),
        "tags": ("talent_opportunity_tag", "talent_id", "id,talent_id,opportunity_id,tag,created_at,updated_at", "updated_at.desc"),
        "profiles": ("talent_users", "user_id", "user_id,resume_text,resume_links", None),
    }
    output: dict[str, list[dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=len(calls)) as executor:
        futures = {
            name: executor.submit(db.by_ids, table, column, pool_ids, select=select, order=order)
            for name, (table, column, select, order) in calls.items()
        }
        for name, future in futures.items():
            output[name] = future.result()
    return output


def consideration_markdown() -> str:
    return """# SBVA — Communications Team Assistant Manager consideration

## Role essence

- 포트폴리오사의 펀딩·마일스톤을 보도자료, 미디어 관계, 웹·SNS 콘텐츠로 외부에 전달합니다.
- 창업자, C-level, 투자자, 파트너가 참여하는 커뮤니티·이벤트를 기획하고 실제 운영합니다.
- SBVA의 브랜드와 네트워크를 포트폴리오 창업자가 활용할 수 있는 성장 기회로 전환합니다.
- 작은 value creation / communications 팀에서 대리급 hands-on 실무자로 빠르게 우선순위를 바꿔 실행합니다.

## Target geography

- target country는 `KR`, target region은 서울입니다. JD와 role row 모두 SBVA 서울 오피스 onsite를 전제로 합니다.
- main pool은 현재 한국·서울 거주, 한국 회사·학교·연구 경험, 한국/서울 근무 또는 relocation 의향 중 하나 이상의 evidence가 있는 후보만 포함합니다.
- 이름, 사진, 추정 국적·민족, 언어권 추정은 country evidence로 쓰지 않습니다.

## Hard filters

1. PR·대외 커뮤니케이션·파트너십·커뮤니티/이벤트·콘텐츠 중 직접 관련 업무 경력 3년 이상이 기본입니다. 2–6년은 결과물과 scope가 직접 맞을 때 허용하고, 7년 이상 또는 manager/director급은 대리급 hands-on 의향이 명확해야 합니다.
2. 보도자료/미디어 대응/콘텐츠와 커뮤니티·이벤트 실행 중 최소 2개 영역의 구체적 결과가 있어야 합니다.
3. 창업자·C-level·투자자·언론 등 여러 이해관계자를 직접 조율한 근거가 필요합니다.
4. 한국어 업무 커뮤니케이션, 비즈니스 영어, 서울 onsite full-time 수락 가능성이 finalist 전에 확인되어야 합니다.
5. dont_share, internal opt-out, blocked company, 동일 role 중복 제안, active same-company pipeline, human override는 우회하지 않습니다.

## Plus / minus

- **Plus:** VC·스타트업·테크 생태계 경험, 포트폴리오·창업자 커뮤니티 운영, founder/C-level 대상 프로그램, 실제 PR·콘텐츠 output, AI 툴 활용, 일본어입니다.
- **Minus:** 순수 투자심사/전략/컨설팅, 대기업 브랜드 전략만 수행하고 hands-on 운영 근거가 약한 경우, senior manager 이상 scope, 서울 onsite나 대리급 실행 역할 의향이 관측되지 않는 경우입니다.

## Acceptance profile / unknowns

- VC와 스타트업 생태계, 창업자 커뮤니티, PR·콘텐츠·행사 실행을 좋아하고 서울 onsite 대리급 실무를 현재 받아들일 사람이 수락 가능성이 높습니다.
- 보상 범위, 실제 팀 reporting line, 일본어 필요 수준, 행사 빈도는 공개 정보가 부족해 finalist마다 확인해야 합니다.
- `가능한 5명 채워봐` 지시는 M을 채우기 위해 hard filter나 privacy·중복 규칙을 완화하지 않습니다.

## Learned feedback / do-not-use

- 같은 role에는 이전 발송·진행 이력이 있으므로 최신 row를 중복 제외와 후보자 수락 신호로만 사용합니다. 같은 workspace의 investment team VP/Senior Associate 기준은 이 communications role의 기술·scope 기준으로 전이하지 않습니다.
- 학교·회사 명성, 나이 대리변수, 외모·이름 기반 국적 추정, 단순 영어권 추정은 사용하지 않습니다.
"""


def structured_consideration(
    role: Mapping[str, Any],
    workspace: Mapping[str, Any],
    snapshot: Mapping[str, Any],
    generated_at: str,
    requested_by: str,
    additional_instruction: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 3,
        "manualVersion": MANUAL_VERSION,
        "generatedAt": generated_at,
        "generatedBy": requested_by,
        "roleId": role.get("role_id"),
        "onePageSummary": consideration_markdown(),
        "sourceSnapshot": snapshot.get("hashes"),
        "requestHistory": {
            "historyCoverage": "latest_only",
            "versions": [
                {
                    "effectiveAt": snapshot.get("internalRole", {}).get("updatedAt"),
                    "sourceId": "company_internal_roles.request",
                    "summary": "3–5년차 대리급 hands-on Communications / Value Creation 기준",
                    "supersededBy": None,
                }
            ],
            "limitations": ["company_internal_roles row에 별도 request history가 없음"],
        },
        "policyConstraints": {
            "nonOverridable": [
                "protected_traits",
                "candidate_opt_out",
                "blocked_company",
                "duplicate_send",
                "human_override",
                "private_data_exposure",
            ],
            "conflicts": [],
        },
        "roleEssence": [
            {"statement": "포트폴리오 PR·미디어·콘텐츠 실행", "sourceIds": ["company_roles.description", "company_internal_roles.request"]},
            {"statement": "창업자·C-level 대상 커뮤니티와 이벤트 기획·운영", "sourceIds": ["company_roles.description"]},
            {"statement": "SBVA 브랜드와 네트워크를 포트폴리오 성장 기회로 전환", "sourceIds": ["company_roles.description", "company_workspace.pitch"]},
        ],
        "targetGeographies": [
            {
                "countryCode": "KR",
                "regions": ["Seoul"],
                "allowedWorkModes": ["onsite"],
                "sourceIds": ["company_roles.location_text", "company_roles.work_mode"],
                "required": True,
            }
        ],
        "countryEvidencePolicy": {
            "worldwide": False,
            "mainPoolRequiresEvidence": True,
            "acceptedEvidenceTypes": [
                "current_residence",
                "target_country_work_education_research",
                "explicit_relocation_intent",
                "work_authorization",
                "allowed_remote_eligibility",
            ],
            "prohibitedProxies": ["name", "photo", "inferred_nationality", "inferred_ethnicity"],
            "unknownPolicy": "exclude_from_main_pool",
        },
        "hardFilters": [
            {
                "id": "related_execution_experience_2_to_6_years",
                "statement": "직접 관련 hands-on 경력 3년 이상 기본, 2–6년 허용, 7년 이상은 대리급 실행 의향 필요",
                "side": "both",
                "rationale": "role이 대리급 실행자 scope임",
                "whyHard": "과도한 seniority와 실행 경험 부족 모두 실패 가능성이 큼",
                "candidateAcceptanceImpact": "seniority·보상·ownership 기대와 직접 연결",
                "sourceIds": ["company_internal_roles.request"],
                "confidence": "high",
                "unknownPolicy": "verify_before_final",
                "sqlStrategy": "관련 pattern으로 경력기간을 high-recall 계산하고 finalist에서 직접 검증",
                "verificationMethod": "experiences, resume, insights/messages",
            },
            {
                "id": "two_of_pr_content_event",
                "statement": "PR/미디어, 콘텐츠, 커뮤니티·이벤트 실행 중 최소 2개 영역의 구체 결과",
                "side": "company",
                "rationale": "JD의 주요 업무가 두 축 이상을 동시에 요구",
                "whyHard": "하나의 약한 adjacent 경험만으로는 role 수행 근거가 부족",
                "candidateAcceptanceImpact": "실제 업무 폭과 후보자 선호 확인 필요",
                "sourceIds": ["company_roles.description", "company_internal_roles.request"],
                "confidence": "high",
                "unknownPolicy": "verify_before_final",
                "sqlStrategy": "CORE_GROUPS match는 retrieval용, 최종은 output 사실 검증",
                "verificationMethod": "experience/project/memo/portfolio",
            },
            {
                "id": "stakeholder_coordination",
                "statement": "창업자·C-level·투자자·언론 등 이해관계자 직접 조율",
                "side": "company",
                "rationale": "value creation team의 핵심 성공 방식",
                "whyHard": "내부 콘텐츠 제작만으로는 부족",
                "candidateAcceptanceImpact": "외부-facing 업무 선호 필요",
                "sourceIds": ["company_roles.description", "company_internal_roles.request"],
                "confidence": "high",
                "unknownPolicy": "verify_before_final",
                "sqlStrategy": "stakeholder/community/partnership pattern",
                "verificationMethod": "candidate packet 직접 검토",
            },
            {
                "id": "korean_english_seoul_onsite",
                "statement": "한국어 업무 커뮤니케이션, 비즈니스 영어, 서울 onsite full-time",
                "side": "both",
                "rationale": "서울 오피스 기반으로 국내외 이해관계자와 소통",
                "whyHard": "unknown인 상태로 발송 불가",
                "candidateAcceptanceImpact": "근무지·언어·생활 조건",
                "sourceIds": ["company_roles.description", "company_roles.location_text", "company_roles.work_mode"],
                "confidence": "high",
                "unknownPolicy": "verify_before_final",
                "sqlStrategy": "country gate + language/work preference evidence",
                "verificationMethod": "profile, insights/messages, resume language/work history",
            },
        ],
        "rankingSignals": {
            "companyPlus": [
                {"id": "vc_startup_ecosystem", "statement": "VC·스타트업·포트폴리오·창업자 생태계 경험", "maxImpact": 12, "sourceIds": ["company_internal_roles.request"], "rationale": "SBVA portfolio-facing 업무 이해"},
                {"id": "concrete_outputs", "statement": "보도자료, SNS, 뉴스레터, 행사 등 실제 output ownership", "maxImpact": 12, "sourceIds": ["company_roles.description"], "rationale": "hands-on execution 직접 근거"},
                {"id": "stakeholder_networking", "statement": "창업자·C-level·투자자·언론 관계 조율", "maxImpact": 10, "sourceIds": ["company_roles.description"], "rationale": "value creation program 운영 핵심"},
            ],
            "companyMinus": [
                {"id": "over_senior_strategy_only", "statement": "senior manager 이상 또는 전략/투자심사 중심", "maxImpact": -18, "sourceIds": ["company_internal_roles.request"], "rationale": "대리급 실행 role과 mismatch"}
            ],
            "candidatePlus": [
                {"id": "current_interest_in_startup_ecosystem_comms", "statement": "스타트업 생태계·커뮤니케이션·커뮤니티 운영에 대한 최근 선호", "maxImpact": 12, "sourceIds": ["candidate_insights"], "rationale": "수락 가능성 직접 근거"}
            ],
            "candidateMinus": [
                {"id": "onsite_or_seniority_uncertain", "statement": "서울 onsite 또는 대리급 hands-on 의향 미관측", "maxImpact": -20, "sourceIds": ["candidate_insights"], "rationale": "finalist 확인 필요"}
            ],
            "systemSignals": ["other_internal_company_validated_progress", "recent_activity", "internal_responsiveness"],
        },
        "retrievalRankSpec": [
            {"id": "core_function", "maxPoints": 25, "terms": ["PR", "communications", "community", "events", "partnerships", "content"], "sqlExpression": "regex-equivalent deterministic text match", "rationale": "direct function recall"},
            {"id": "core_work", "maxPoints": 20, "terms": list(CORE_GROUPS), "sqlExpression": "4 points per independently matched group", "rationale": "actual work evidence recall"},
            {"id": "relevant_experience", "maxPoints": 15, "terms": ["merged relevant experience months"], "sqlExpression": "non-overlapping relevant ranges", "rationale": "assistant-manager scope"},
            {"id": "vc_ecosystem", "maxPoints": 10, "terms": ["VC", "startup", "founder", "portfolio", "accelerator"], "sqlExpression": "ecosystem group match", "rationale": "role context"},
            {"id": "location_language", "maxPoints": 10, "terms": ["Seoul", "Korea"], "sqlExpression": "country gate plus location recall", "rationale": "onsite feasibility"},
            {"id": "impact", "maxPoints": 6, "terms": ["launched", "led", "organized", "published", "attendees"], "sqlExpression": "bounded output/impact clues", "rationale": "high-impact lane"},
        ],
        "retrievalScoreContract": {"roleRelevanceMax": 86, "systemSignalMax": 14, "totalMax": 100},
        "learnedFeedback": [],
        "acceptanceHypothesis": {
            "likelyToAccept": ["서울 기반 VC/스타트업 생태계에서 PR·커뮤니티 실행 scope를 원하는 2–6년차 실무자"],
            "likelyToDecline": ["remote-only", "senior strategy-only", "순수 투자심사 또는 manager/director scope만 원하는 사람"],
            "mustVerify": ["서울 onsite full-time", "비즈니스 영어", "보상", "대리급 hands-on scope"],
        },
        "reasonAnchors": ["구체적 PR/content/event output", "창업자·투자자·언론 stakeholder 조율", "VC/스타트업 생태계 맥락", "hands-on 실행 범위"],
        "unknowns": ["compensation", "reporting line", "Japanese need level", "event cadence"],
        "prohibitedCriteria": [],
        "changeSummary": [
            "workspace request의 investment-team VP/Senior Associate 문구는 현재 role과 충돌하므로 role-specific PDF/JD와 company_internal_roles.request를 우선합니다.",
            f"additional_instruction={additional_instruction!r}은 M을 채우려는 선호로만 반영하고 quality gate는 유지합니다.",
        ],
    }


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
    url = str(os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise SystemExit("Supabase service credentials are required")
    db = SupabaseReadOnly(url, key)
    log("loaded credentials")

    started = now_utc()
    run_id = started.strftime("%Y%m%dT%H%M%SZ")
    output = root / "output" / "internal_role_matching" / args.role_id / run_id
    output.mkdir(parents=True)
    (output / "review_batches").mkdir()
    manifest: dict[str, Any] = {
        "manualVersion": MANUAL_VERSION,
        "evaluatorVersion": EVALUATOR_VERSION,
        "roleId": args.role_id,
        "runId": run_id,
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
        "considerationWrites": 0,
        "reviewMemoryWrites": 0,
        "fitWrites": 0,
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
    }
    write_json(output / "run_manifest.json", manifest)

    role_rows = db.get(
        "company_roles",
        select="role_id,company_workspace_id,name,description,type,seniority_level,location_text,work_mode,status,source_type,is_expired,salary_range,salary_min,salary_max,updated_at",
        filters={"role_id": f"eq.{args.role_id}"},
    )
    if not role_rows:
        raise RuntimeError("role not found")
    role = role_rows[0]
    status = compact(role.get("status"), 40).lower()
    workspace_rows = db.get("company_workspace", filters={"company_workspace_id": f"eq.{role.get('company_workspace_id')}"})
    if not workspace_rows:
        raise RuntimeError("workspace not found")
    workspace = workspace_rows[0]
    if (
        compact(role.get("name"), 200) != EXPECTED_ROLE_NAME
        or compact(workspace.get("company_name"), 200) != EXPECTED_WORKSPACE_NAME
        or compact(role.get("source_type"), 40).lower() != "internal"
        or status not in ALLOWED_ROLE_STATUSES
        or role.get("is_expired") is True
    ):
        manifest.update({"status": "stopped_role_status_or_identity", "roleStatus": status, "completedAt": iso_now()})
        write_json(output / "run_manifest.json", manifest)
        return 2
    log(f"validated role {role.get('name')} / {workspace.get('company_name')}")

    memory_error = None
    try:
        previous_memory = fetch_latest_run_memory(url, key, args.role_id)
    except Exception as error:
        previous_memory = None
        memory_error = compact(f"{type(error).__name__}: {error}", 500)
    write_json(output / "previous_run_memory.json", {"loaded": previous_memory is not None, "memory": previous_memory, "readError": memory_error})
    write_text(output / "previous_run_memory.md", previous_memory.get("content") if previous_memory else ("이전 run memory 조회에 실패했습니다. 현재 source만 사용합니다." if memory_error else "이 role에 저장된 이전 run memory가 없습니다."))
    log("loaded previous run memory")

    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{args.role_id}"})
    internal_role = internal_rows[0] if internal_rows else {"role_id": args.role_id, "request": None, "considerations": None, "updated_at": None}
    company_db_rows = db.get("company_db", filters={"id": f"eq.{workspace.get('company_db_id')}"}) if workspace.get("company_db_id") else []
    company_db = company_db_rows[0] if company_db_rows else {}

    log("starting base table reads")
    with ThreadPoolExecutor(max_workers=14) as executor:
        futures = {
            "target_recs": executor.submit(db.get, "talent_opportunity_recommendation", filters={"role_id": f"eq.{args.role_id}"}),
            "target_progress": executor.submit(db.get, "talent_progress", filters={"role_id": f"eq.{args.role_id}"}),
            "target_tags": executor.submit(db.get, "talent_opportunity_tag", filters={"opportunity_id": f"eq.{args.role_id}"}),
            "target_reviews": executor.submit(db.get, "talent_opportunity_matching_review", filters={"opportunity_id": f"eq.{args.role_id}"}),
            "profiles": executor.submit(db.get, "talent_users", select="user_id,name,headline,bio,location,current_location,last_logined_at,created_at,updated_at"),
            "settings": executor.submit(db.get, "talent_setting", select="user_id,profile_visibility,get_internal_recommendation,blocked_companies,engagement_types,status,is_onboarding_done,updated_at"),
            "experiences": executor.submit(db.get, "talent_experiences", select="id,talent_id,company_name,role,start_date,end_date,months,description,memo,employment_type"),
            "educations": executor.submit(db.get, "talent_educations", select="id,talent_id,school,degree,field,start_date,end_date,description,memo"),
            "target_fits": executor.submit(db.get, "talent_opportunity_fit", filters={"opportunity_id": f"eq.{args.role_id}"}),
            "all_insights": executor.submit(db.get, "talent_insights", select="id,talent_id,content,created_at,last_updated_at"),
        }
        loaded = {}
        future_names = {future: name for name, future in futures.items()}
        for future in as_completed(future_names):
            name = future_names[future]
            loaded[name] = future.result()
            log(f"loaded {name}: {len(loaded[name]) if isinstance(loaded[name], list) else 'n/a'}")

    company_roles = db.get(
        "company_roles",
        select="role_id,company_workspace_id,name,source_type,status,updated_at",
        filters={"company_workspace_id": f"eq.{role.get('company_workspace_id')}"},
    )
    company_role_ids = {compact(row.get("role_id"), 100) for row in company_roles}
    log(f"same company roles: {len(company_role_ids)}")
    company_recs = db.get("talent_opportunity_recommendation", filters={"role_id": f"in.({','.join(sorted(company_role_ids))})"}) if company_role_ids else []
    log(f"loaded company recommendations: {len(company_recs)}")
    company_progress = db.get("talent_progress", filters={"role_id": f"in.({','.join(sorted(company_role_ids))})"}) if company_role_ids else []
    log(f"loaded company progress: {len(company_progress)}")
    company_tags = db.get("talent_opportunity_tag", filters={"opportunity_id": f"in.({','.join(sorted(company_role_ids))})"}) if company_role_ids else []
    log(f"loaded company tags: {len(company_tags)}")

    source_hashes = {
        "roleInputHash": digest({key_name: role.get(key_name) for key_name in ("description", "location_text", "work_mode", "type", "status", "is_expired", "salary_range", "salary_min", "salary_max")}),
        "internalRequestHash": digest(internal_role.get("request")),
        "workspaceInputHash": digest({key_name: workspace.get(key_name) for key_name in ("request", "company_description", "pitch")}),
    }
    source_hashes["sourceHash"] = digest(source_hashes)
    snapshot = {
        "capturedAt": iso_now(),
        "role": {"id": role.get("role_id"), "updatedAt": role.get("updated_at"), "status": status, "isExpired": role.get("is_expired"), "sourceType": role.get("source_type")},
        "internalRole": {"exists": bool(internal_rows), "updatedAt": internal_role.get("updated_at")},
        "workspace": {"id": workspace.get("company_workspace_id"), "name": workspace.get("company_name"), "updatedAt": workspace.get("updated_at")},
        "companyDb": {"id": company_db.get("id"), "lastUpdatedAt": company_db.get("last_updated_at")},
        "sourceCounts": {"sameRoleRecommendations": len(loaded["target_recs"]), "sameRoleProgress": len(loaded["target_progress"]), "sameRoleTags": len(loaded["target_tags"]), "sameRoleReviews": len(loaded["target_reviews"]), "sameCompanyRecommendations": len(company_recs), "sameCompanyProgress": len(company_progress), "sameCompanyTags": len(company_tags)},
        "latestFeedbackAt": max([compact(row.get("updated_at") or row.get("created_at"), 80) for row in company_recs + company_progress + company_tags] or [""]) or None,
        "officialSources": ["https://sbvacorp.com/en", "https://sbvacorp.com/en/press/30?page=1", "https://sbvacorp.com/en/press/12?page=2"],
        "hashes": source_hashes,
    }
    write_json(output / "source_snapshot.json", snapshot)
    write_json(output / "source_material.json", {"role": role, "internalRole": internal_role, "workspace": workspace, "companyDb": company_db, "sameCompanyRoles": company_roles, "sameRoleRecommendations": loaded["target_recs"], "sameRoleProgress": [{**row, "metadata": safe_metadata(row.get("metadata"))} for row in loaded["target_progress"]], "sameRoleTags": loaded["target_tags"], "sameRoleReviews": loaded["target_reviews"], "previousRunMemory": previous_memory})
    log("wrote source artifacts")

    consideration = structured_consideration(role, workspace, snapshot, iso_now(), args.requested_by, args.additional_instruction)
    consideration_fingerprint = digest(consideration)
    role_fingerprint = digest({"version": "2.2-sbva-value-creation-1", "role": {key_name: role.get(key_name) for key_name in ("description", "type", "seniority_level", "location_text", "work_mode", "salary_range", "salary_min", "salary_max")}, "internalRequest": internal_role.get("request"), "workspaceRequest": workspace.get("request"), "companyFitContext": {"description": workspace.get("company_description"), "pitch": workspace.get("pitch")}, "hardFilters": consideration["hardFilters"], "rankingSignals": consideration["rankingSignals"], "acceptanceHypothesis": consideration["acceptanceHypothesis"]})
    consideration["considerationFingerprint"] = consideration_fingerprint
    consideration["roleFingerprint"] = role_fingerprint
    write_text(output / "consideration.md", consideration_markdown())
    write_json(output / "considerations.json", consideration)
    log("wrote consideration artifacts")

    profiles = {compact(row.get("user_id"), 100): row for row in loaded["profiles"]}
    settings = {compact(row.get("user_id"), 100): row for row in loaded["settings"]}
    experiences = index_many(loaded["experiences"], "talent_id")
    educations = index_many(loaded["educations"], "talent_id")
    extras: dict[str, list[dict[str, Any]]] = {}
    recs = index_many(loaded["target_recs"], "talent_id")
    tags = index_many(company_tags, "talent_id")
    fits = index_many(loaded["target_fits"], "talent_id")
    insights = index_many(loaded["all_insights"], "talent_id")
    summaries: dict[str, list[dict[str, Any]]] = {}
    role_map = {compact(row.get("role_id"), 100): row for row in company_roles}
    workspace_map = {compact(workspace.get("company_workspace_id"), 100): workspace}
    internal_role_ids = {role_id for role_id, item in role_map.items() if compact(item.get("source_type"), 40).lower() == "internal"}
    same_role_recs = index_many(loaded["target_recs"], "talent_id")
    same_role_tags = index_many(loaded["target_tags"], "talent_id")
    same_role_rec_talents = set(same_role_recs)
    accepted_unprocessed = {talent_id for talent_id in same_role_rec_talents if is_same_role_accepted_unprocessed(same_role_recs.get(talent_id) or [], same_role_tags.get(talent_id) or [], args.role_id)}
    aliases = {
        normalized_company(workspace.get("company_name")),
        normalized_company(company_db.get("name")),
        "softbankventuresasia",
        "softbankventureskorea",
    } - {""}

    latest_reviews = latest_by_talent(loaded["target_reviews"])
    now = now_utc()
    active_review_rows = {
        talent_id: row for talent_id, row in latest_reviews.items()
        if compact(row.get("final_disposition"), 60) == "do_not_recommend"
        and parse_date(row.get("excluded_until"))
        and datetime.fromisoformat(str(row.get("excluded_until")).replace("Z", "+00:00")) > now
    }
    role_changed_review_ids = {talent_id for talent_id, row in active_review_rows.items() if row.get("role_fingerprint") != role_fingerprint}
    unchanged_role_review_ids = set(active_review_rows) - role_changed_review_ids
    unchanged_cooldown_ids: set[str] = set()
    candidate_changed_review_ids: set[str] = set()
    for talent_id in unchanged_role_review_ids:
        profile = profiles.get(talent_id) or {}
        setting = settings.get(talent_id) or {}
        candidate_fp = digest({"version": "2.2-sbva-value-creation-1", "profile": {key_name: profile.get(key_name) for key_name in ("headline", "bio", "location", "current_location", "resume_text", "resume_links")}, "experiences": sorted(experiences.get(talent_id) or [], key=lambda row: compact(row.get("id"), 100)), "educations": sorted(educations.get(talent_id) or [], key=lambda row: compact(row.get("id"), 100)), "extras": extras.get(talent_id) or [], "insights": insights.get(talent_id) or [], "summaries": summaries.get(talent_id) or [], "setting": {key_name: setting.get(key_name) for key_name in ("blocked_companies", "engagement_types", "profile_visibility", "get_internal_recommendation")}, "recommendations": recs.get(talent_id) or [], "tags": tags.get(talent_id) or []})
        if candidate_fp == active_review_rows[talent_id].get("candidate_fingerprint"):
            unchanged_cooldown_ids.add(talent_id)
        else:
            candidate_changed_review_ids.add(talent_id)

    excluded = {"visibility": 0, "internalOptOut": 0, "alreadyRecommended": 0, "activeReviewCooldown": 0, "blockedCompany": 0, "currentCompany": 0, "activeCompanyPipeline": 0, "humanUnfit": 0, "noCountryEvidence": 0, "countryConflict": 0, "minimumRoleAdjacency": 0}
    country_counts = {"confirmed_current_or_relocation": 0, "historical_affinity_verify_current_intent": 0, "no_country_evidence": 0, "confirmed_country_conflict": 0}
    eligible: list[dict[str, Any]] = []
    for talent_id, profile in profiles.items():
        setting = settings.get(talent_id) or {}
        if compact(setting.get("profile_visibility"), 40) == "dont_share":
            excluded["visibility"] += 1
            continue
        if setting.get("get_internal_recommendation") is False:
            excluded["internalOptOut"] += 1
            continue
        if talent_id in same_role_rec_talents and talent_id not in accepted_unprocessed:
            excluded["alreadyRecommended"] += 1
            continue
        if talent_id in unchanged_cooldown_ids:
            excluded["activeReviewCooldown"] += 1
            continue
        if aliases & {normalized_company(item) for item in as_list(setting.get("blocked_companies"))}:
            excluded["blockedCompany"] += 1
            continue
        candidate_exp = experiences.get(talent_id) or []
        current_companies = {normalized_company(row.get("company_name")) for row in candidate_exp if not compact(row.get("end_date"), 40)}
        if aliases & current_companies:
            excluded["currentCompany"] += 1
            continue
        if any(compact(row.get("opportunity_id"), 100) in company_role_ids and (compact(row.get("tag"), 200) in ACTIVE_PIPELINE_TAGS or compact(row.get("tag"), 200).startswith("내부단계:")) for row in tags.get(talent_id) or []):
            excluded["activeCompanyPipeline"] += 1
            continue
        fit_rows = fits.get(talent_id) or []
        if any(compact(row.get("human_label"), 40).lower() == "unfit" for row in fit_rows):
            excluded["humanUnfit"] += 1
            continue

        tier, country_items, country_unknowns, country_conflicts = country_evidence(
            talent_id,
            profile,
            candidate_exp,
            educations.get(talent_id) or [],
            insights.get(talent_id) or [],
            summaries.get(talent_id) or [],
        )
        if country_conflicts:
            country_counts["confirmed_country_conflict"] += 1
            excluded["countryConflict"] += 1
            continue
        if not tier:
            country_counts["no_country_evidence"] += 1
            excluded["noCountryEvidence"] += 1
            continue
        country_counts[tier] += 1

        text = searchable(profile, candidate_exp, educations.get(talent_id) or [], extras.get(talent_id) or [])
        months = relevant_months(candidate_exp)
        location = resolve_profile_location(profile)
        features = feature_scores(text, months, location)
        groups = features["matchedCoreGroups"]
        role_adjacent = (
            features["directFunction"] and len(groups) >= 1
        ) or (
            features["adjacentFunction"] and len(groups) >= 2
        ) or (
            len(groups) >= 3
        )
        if not role_adjacent:
            excluded["minimumRoleAdjacency"] += 1
            continue

        other_internal_tags = [row for row in tags.get(talent_id) or [] if compact(row.get("opportunity_id"), 100) in internal_role_ids and compact(row.get("opportunity_id"), 100) != args.role_id]
        stage_bonus = 8 if any(compact(row.get("tag"), 100) == "내부:최종오퍼" for row in other_internal_tags) else 6 if any(compact(row.get("tag"), 100).startswith("내부단계:") for row in other_internal_tags) else 4 if any(compact(row.get("tag"), 100) == "내부:연결대기" for row in other_internal_tags) else 0
        response_bonus = 2 if any(compact(row.get("feedback"), 40).lower() in {"like", "positive", "dislike", "negative"} for row in recs.get(talent_id) or []) else 0
        system_score = min(14, stage_bonus + recency_bonus(profile.get("last_logined_at")) + response_bonus)
        lanes: list[str] = []
        if features["directFunction"]:
            lanes.append("direct_function_title")
        if len(groups) >= 3 or {"pr_media", "content_social"}.issubset(groups) or {"community_events", "partnership_stakeholder"}.issubset(groups):
            lanes.append("core_work_evidence")
        if features["adjacentFunction"] and len(groups) >= 2:
            lanes.append("adjacent_transferable")
        if features["impact"] >= 3 and features["roleRelevance"] >= 40:
            lanes.append("high_impact_non_obvious")
        if not lanes:
            lanes.append("backfill_role_adjacent")
        fit_row = fit_rows[0] if fit_rows else None
        eligible.append({
            "talentId": talent_id,
            "name": compact(profile.get("name"), 160),
            "headline": compact(profile.get("headline"), 300),
            "location": compact(location, 300),
            "countryEvidenceTier": tier,
            "countryEvidence": country_items,
            "countryUnknowns": country_unknowns,
            "countryConflicts": country_conflicts,
            "relevantMonths": months,
            "features": features,
            "systemScore": system_score,
            "retrievalScore": min(100, features["roleRelevance"] + system_score),
            "retrievalLanes": lanes,
            "sameRoleAcceptedUnprocessed": talent_id in accepted_unprocessed,
            "sameRoleAcceptedRecommendationIds": [row.get("id") for row in same_role_recs.get(talent_id) or [] if compact(row.get("feedback"), 40).lower() in {"like", "positive"}],
            "existingFitLabel": compact((fit_row or {}).get("human_label") or (fit_row or {}).get("label"), 40) or None,
            "existingFitScore": (fit_row or {}).get("score"),
            "createdAt": profile.get("created_at"),
            "updatedAt": profile.get("updated_at"),
        })
    log(f"built eligible list: {len(eligible)}")

    eligible.sort(
        key=lambda row: (
            0 if row["countryEvidenceTier"] == "confirmed_current_or_relocation" else 1,
            -row["retrievalScore"],
            -row["features"]["roleRelevance"],
            row["talentId"],
        )
    )
    previous_completed_at = previous_memory.get("created_at") if previous_memory else None
    fresh_rows: list[dict[str, Any]] = []
    if previous_completed_at:
        fresh_rows = [
            row
            for row in eligible
            if compact(row.get("createdAt"), 80) > compact(previous_completed_at, 80)
        ][:30]

    # The freshness reservation is part of the final 200-person pool. Allocate
    # the remaining capacity across the four evidence lanes in the manual's
    # 80:60:40:20 ratio so freshness cannot crowd out later diversity lanes.
    selected_ids: set[str] = {row["talentId"] for row in fresh_rows}
    remaining_slots = TARGET_POOL_SIZE - len(selected_ids)
    base_lane_specs = (
        ("direct_function_title", 80),
        ("core_work_evidence", 60),
        ("adjacent_transferable", 40),
        ("high_impact_non_obvious", 20),
    )
    lane_specs = [
        (lane, round(remaining_slots * base_requested / TARGET_POOL_SIZE), base_requested)
        for lane, base_requested in base_lane_specs
    ]
    lane_stats: list[dict[str, Any]] = []
    for lane, requested, base_requested in lane_specs:
        rows = [row for row in eligible if lane in row["retrievalLanes"]]
        overlap = sum(row["talentId"] in selected_ids for row in rows)
        contributed = 0
        if requested:
            for row in rows:
                if len(selected_ids) >= TARGET_POOL_SIZE:
                    break
                if row["talentId"] in selected_ids:
                    continue
                selected_ids.add(row["talentId"])
                contributed += 1
                if contributed >= requested:
                    break
        lane_stats.append({
            "lane": lane,
            "baseRequestedUnique": base_requested,
            "requestedUnique": requested,
            "quotaAdjustment": (
                "proportional reduction for 30-person freshness reservation"
                if fresh_rows
                else "none"
            ),
            "rawFetched": len(rows),
            "overlapWithEarlierLanes": overlap,
            "uniqueContributed": contributed,
            "eligibleRoleAdjacentRemaining": max(0, len(rows) - overlap - contributed),
        })
    for row in eligible:
        if len(selected_ids) >= TARGET_POOL_SIZE:
            break
        selected_ids.add(row["talentId"])
    pool = [row for row in eligible if row["talentId"] in selected_ids][:TARGET_POOL_SIZE]
    pool_ids = [row["talentId"] for row in pool]
    log(f"built retrieval pool: {len(pool)}")

    funnel = {
        "allTalentUsers": len(profiles),
        "excluded": excluded,
        "includedExceptions": {"sameRoleAcceptedUnprocessed": len(accepted_unprocessed), "retrievedSameRoleAcceptedUnprocessed": sum(bool(row.get("sameRoleAcceptedUnprocessed")) for row in pool)},
        "afterBaseExclusions": len(profiles) - sum(value for key_name, value in excluded.items() if key_name not in {"minimumRoleAdjacency", "noCountryEvidence", "countryConflict"}),
        "targetCountries": ["KR"],
        "countryEvidenceTierCounts": country_counts,
        "afterCountryEvidenceGate": country_counts["confirmed_current_or_relocation"] + country_counts["historical_affinity_verify_current_intent"],
        "eligibleRoleAdjacent": len(eligible),
        "retrieved": len(pool),
        "targetPool": TARGET_POOL_SIZE,
        "poolShortfallReason": None if len(pool) == TARGET_POOL_SIZE else "insufficient_relevant_candidates",
        "activeReviewCooldownRows": len(active_review_rows),
        "excludedByUnchangedCooldown": len(unchanged_cooldown_ids),
        "cooldownInvalidatedByRoleChange": len(role_changed_review_ids),
        "cooldownInvalidatedByCandidateChange": len(candidate_changed_review_ids),
        "cooldownExpired": sum(1 for row in latest_reviews.values() if compact(row.get("final_disposition"), 60) == "do_not_recommend" and parse_date(row.get("excluded_until")) and datetime.fromisoformat(str(row.get("excluded_until")).replace("Z", "+00:00")) <= now),
        "newOrMateriallyUpdatedReservation": {
            "applied": previous_memory is not None,
            "previousCompletedAt": previous_completed_at,
            "reserved": len(fresh_rows),
            "reservedTalentIds": [row["talentId"] for row in fresh_rows],
            "basis": "talent_users.created_at_after_previous_completed_run",
            "note": (
                "first valid run; reservation does not apply"
                if previous_memory is None
                else "up to 30 newly joined, country-gated, role-adjacent candidates were secured before lane fill"
            ),
        },
        "lanes": lane_stats,
    }
    write_json(output / "retrieval_funnel.json", funnel)
    write_text(output / "retrieval.sql", f"""-- Rendered read-only retrieval equivalent for manual 2.3.
-- Executed via paginated Supabase PostgREST GETs; no RPC or mutation.
-- role_id = {args.role_id}
-- 1) read role/workspace/request/recommendation/progress/tag/review state;
-- 2) exclude dont_share, internal opt-out, same-role duplicate except accepted_unprocessed,
--    unchanged active do_not_recommend cooldown, blocked SBVA, current SBVA employee,
--    active SBVA pipeline, and human_label='unfit';
-- 3) compute KR country evidence before role relevance ranking and LIMIT 200;
-- 4) require high-recall role adjacency across PR/media, content, community/events,
--    partnerships/stakeholders, startup/VC ecosystem;
-- 5) rank role relevance 0..86 plus system signals 0..14, cap 100;
-- 6) union direct/core/adjacent/high-impact lanes, dedupe, deterministic backfill, LIMIT 200.
-- current unchanged_cooldown_talent_ids = ARRAY[{','.join(sorted(unchanged_cooldown_ids))}]::uuid[]
""")

    with (output / "candidate_pool.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rank", "talent_id", "name", "headline", "location", "country_evidence_tier", "relevant_months", "role_relevance", "system_score", "retrieval_score", "matched_core_groups", "retrieval_lanes", "same_role_accepted_unprocessed", "existing_fit_label", "existing_fit_score"])
        for rank, row in enumerate(pool, 1):
            writer.writerow([rank, row["talentId"], row["name"], row["headline"], row["location"], row["countryEvidenceTier"], row["relevantMonths"], row["features"]["roleRelevance"], row["systemScore"], row["retrievalScore"], "|".join(row["features"]["matchedCoreGroups"]), "|".join(row["retrievalLanes"]), row["sameRoleAcceptedUnprocessed"], row["existingFitLabel"], row["existingFitScore"]])

    detail = load_detail(db, pool_ids)
    log("loaded pool detail")
    pool_insights = index_many(detail["insights"], "talent_id")
    pool_summaries: dict[str, list[dict[str, Any]]] = {}
    activities = index_many(detail["activities"], "talent_id")
    progress = index_many(detail["progress"], "talent_id")
    memos = index_many(detail["memos"], "talent_id")
    pool_recs = index_many(detail["recommendations"], "talent_id")
    pool_tags = index_many(detail["tags"], "talent_id")
    pool_profiles_full = {compact(row.get("user_id"), 100): row for row in detail["profiles"]}
    missing_role_ids = sorted(
        {
            compact(row.get("role_id"), 100)
            for row in detail["recommendations"]
            if compact(row.get("role_id"), 100) and compact(row.get("role_id"), 100) not in role_map
        }
    )
    if missing_role_ids:
        for row in db.by_ids(
            "company_roles",
            "role_id",
            missing_role_ids,
            select="role_id,company_workspace_id,name,source_type,status,updated_at",
        ):
            role_map[compact(row.get("role_id"), 100)] = row
    missing_workspace_ids = sorted(
        {
            compact(row.get("company_workspace_id"), 100)
            for row in role_map.values()
            if compact(row.get("company_workspace_id"), 100)
            and compact(row.get("company_workspace_id"), 100) not in workspace_map
        }
    )
    if missing_workspace_ids:
        for row in db.by_ids(
            "company_workspace",
            "company_workspace_id",
            missing_workspace_ids,
            select="company_workspace_id,company_name,company_db_id",
        ):
            workspace_map[compact(row.get("company_workspace_id"), 100)] = row

    full_packets: list[dict[str, Any]] = []
    artifact_packets: list[dict[str, Any]] = []
    for rank, pool_row in enumerate(pool, 1):
        talent_id = pool_row["talentId"]
        profile = profiles[talent_id]
        profile_full = pool_profiles_full.get(talent_id) or {}
        candidate_exp = sorted(experiences.get(talent_id) or [], key=lambda row: compact(row.get("start_date"), 40), reverse=True)
        candidate_edu = educations.get(talent_id) or []
        full_text = searchable({**profile, **profile_full}, candidate_exp, candidate_edu, extras.get(talent_id) or [])
        recent_recs = []
        for row in sorted(pool_recs.get(talent_id) or [], key=lambda item: compact(item.get("created_at") or item.get("recommended_at"), 80), reverse=True)[:20]:
            rec_role = role_map.get(compact(row.get("role_id"), 100)) or {}
            rec_workspace = workspace_map.get(compact(rec_role.get("company_workspace_id"), 100)) or {}
            recent_recs.append({"id": row.get("id"), "roleId": row.get("role_id"), "company": rec_workspace.get("company_name"), "role": rec_role.get("name"), "sourceType": rec_role.get("source_type"), "feedback": row.get("feedback"), "feedbackReason": compact(row.get("feedback_reason"), 900), "processedStage": row.get("processed_stage"), "savedStage": row.get("saved_stage"), "dismissedAt": row.get("dismissed_at"), "feedbackAt": row.get("feedback_at"), "recommendedAt": row.get("recommended_at") or row.get("created_at")})
        common = {
            "rank": rank,
            "targetCountries": ["KR"],
            "countryEvidenceTier": pool_row["countryEvidenceTier"],
            "countryEvidence": pool_row["countryEvidence"],
            "countryUnknowns": pool_row["countryUnknowns"],
            "countryConflicts": pool_row["countryConflicts"],
            "retrieval": pool_row,
            "profile": {"talentId": talent_id, "name": profile.get("name"), "headline": profile.get("headline"), "bio": compact(profile.get("bio"), 3000), "location": resolve_profile_location(profile), "signupLocation": profile.get("current_location"), "lastLoginedAt": profile.get("last_logined_at"), "publicProfileLinks": as_list(profile_full.get("resume_links"))[:8]},
            "experiences": [{"id": row.get("id"), "company": row.get("company_name"), "role": row.get("role"), "start": row.get("start_date"), "end": row.get("end_date"), "months": row.get("months"), "employmentType": row.get("employment_type"), "description": row.get("description"), "memo": row.get("memo")} for row in candidate_exp],
            "educations": [{"id": row.get("id"), "school": row.get("school"), "degree": row.get("degree"), "field": row.get("field"), "start": row.get("start_date"), "end": row.get("end_date"), "description": row.get("description"), "memo": row.get("memo")} for row in candidate_edu],
            "extras": [row.get("content") for row in extras.get(talent_id) or []],
            "insights": [{"id": row.get("id"), "content": row.get("content"), "updatedAt": row.get("last_updated_at") or row.get("created_at")} for row in sorted(pool_insights.get(talent_id) or [], key=lambda item: compact(item.get("last_updated_at") or item.get("created_at"), 80), reverse=True)],
            "conversationSummaries": [{"id": row.get("id"), "createdAt": row.get("created_at"), "toMessageId": row.get("to_message_id"), "summary": row.get("segment_summary") or row.get("summary_text")} for row in sorted(pool_summaries.get(talent_id) or [], key=lambda item: compact(item.get("created_at"), 80), reverse=True)],
            "activityEvents": [{"id": row.get("id"), "eventType": row.get("event_type"), "summary": row.get("summary"), "impactLevel": row.get("impact_level"), "createdAt": row.get("created_at")} for row in sorted(activities.get(talent_id) or [], key=lambda item: compact(item.get("created_at"), 80), reverse=True)[:20]],
            "recentRecommendations": recent_recs,
            "progress": [{"id": row.get("id"), "roleId": row.get("role_id"), "kind": row.get("kind"), "text": row.get("text"), "metadata": safe_metadata(row.get("metadata")), "createdAt": row.get("created_at")} for row in sorted(progress.get(talent_id) or [], key=lambda item: compact(item.get("created_at"), 80), reverse=True)],
            "tags": [{"id": row.get("id"), "roleId": row.get("opportunity_id"), "tag": row.get("tag"), "updatedAt": row.get("updated_at")} for row in sorted(pool_tags.get(talent_id) or [], key=lambda item: compact(item.get("updated_at"), 80), reverse=True)],
            "opsMemos": [{"id": row.get("id"), "content": row.get("content"), "updatedAt": row.get("updated_at")} for row in sorted(memos.get(talent_id) or [], key=lambda item: compact(item.get("updated_at"), 80), reverse=True)],
            "existingFit": jsonable((fits.get(talent_id) or [None])[0]),
        }
        candidate_fingerprint = digest({"version": "2.2-sbva-value-creation-1", "profile": {key_name: ({**profile, **profile_full}).get(key_name) for key_name in ("headline", "bio", "location", "current_location", "resume_text", "resume_links")}, "experiences": common["experiences"], "educations": common["educations"], "extras": common["extras"], "insights": common["insights"], "conversationSummaries": common["conversationSummaries"], "setting": {key_name: (settings.get(talent_id) or {}).get(key_name) for key_name in ("blocked_companies", "engagement_types", "profile_visibility", "get_internal_recommendation")}, "recommendations": common["recentRecommendations"], "tags": common["tags"], "progress": common["progress"], "opsMemos": common["opsMemos"], "countryEvidence": common["countryEvidence"]})
        common["candidateFingerprint"] = candidate_fingerprint
        full_packet = {**common, "resumeText": profile_full.get("resume_text")}
        artifact_packet = {**common, "resumeEvidenceExcerpt": relevant_excerpt(full_text)}
        full_packets.append(full_packet)
        artifact_packets.append(artifact_packet)

    temp_dir = Path(os.environ.get("TMPDIR") or "/tmp") / f"harper-sbva-value-creation-{run_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    full_packet_path = temp_dir / "full_candidate_packets.jsonl"
    with full_packet_path.open("w", encoding="utf-8") as handle:
        for packet in full_packets:
            handle.write(json.dumps(jsonable(packet), ensure_ascii=False) + "\n")
    with (output / "candidate_packets.jsonl").open("w", encoding="utf-8") as handle:
        for packet in artifact_packets:
            handle.write(json.dumps(jsonable(packet), ensure_ascii=False) + "\n")

    for start in range(0, len(artifact_packets), 15):
        lines = [f"# Review Batch {start // 15 + 1}", ""]
        for packet in artifact_packets[start:start + 15]:
            retrieval = packet["retrieval"]
            profile = packet["profile"]
            lines.extend([
                f"## {packet['rank']}. {profile.get('name')} (`{profile.get('talentId')}`)",
                f"- Headline/location: {compact(profile.get('headline'), 320)} | {compact(profile.get('location') or profile.get('signupLocation'), 180)}",
                f"- Country: {packet['countryEvidenceTier']} | " + " ; ".join(compact(item.get("fact"), 220) for item in packet["countryEvidence"][:3]),
                f"- Retrieval: role {retrieval['features']['roleRelevance']}, system {retrieval['systemScore']}, relevant months {retrieval['relevantMonths']}, groups {', '.join(retrieval['features']['matchedCoreGroups'])}, lanes {', '.join(retrieval['retrievalLanes'])}",
                f"- Evidence excerpt: {compact(packet.get('resumeEvidenceExcerpt'), 3500)}",
                "- Experience: " + " | ".join(f"{row.get('start') or '?'}~{row.get('end') or 'present'} {compact(row.get('company'), 90)} / {compact(row.get('role'), 110)}: {compact(row.get('description'), 700)}" for row in packet["experiences"][:8]),
                "- Education: " + " | ".join(f"{compact(row.get('school'), 100)} / {compact(row.get('degree'), 80)} {compact(row.get('field'), 100)}" for row in packet["educations"][:6]),
                "- Candidate context: " + " | ".join(compact(json.dumps(row.get("content") or row.get("summary"), ensure_ascii=False), 900) for row in (packet["insights"][:2] + packet["conversationSummaries"][:3])),
                "- Recommendation/progress: " + " | ".join(compact(f"{row}", 500) for row in (packet["recentRecommendations"][:4] + packet["progress"][:5])),
                "",
            ])
        write_text(output / "review_batches" / f"batch_{start // 15 + 1:02d}.md", "\n".join(lines))

    manifest.update({
        "status": "awaiting_agent_evaluation",
        "roleStatus": status,
        "companyName": workspace.get("company_name"),
        "roleName": role.get("name"),
        "previousRunMemoryLoaded": previous_memory is not None,
        "previousRunMemoryReadFailed": memory_error is not None,
        "previousRunMemoryError": memory_error,
        "previousRunMemoryRunId": previous_memory.get("run_id") if previous_memory else None,
        "reviewMemoryPersistenceAvailable": True,
        "reviewMemoryCooldownApplied": True,
        "considerationFingerprint": consideration_fingerprint,
        "roleFingerprint": role_fingerprint,
        "retrievalCount": len(pool),
        "preparedAt": iso_now(),
        "artifactDirectory": str(output),
        "temporaryFullPacketPath": str(full_packet_path),
    })
    write_json(output / "run_manifest.json", manifest)
    print(json.dumps({"status": manifest["status"], "output": str(output), "fullPackets": str(full_packet_path), "retrieved": len(pool)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

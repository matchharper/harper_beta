#!/usr/bin/env python3
"""Prepare a manual-2.1 Config Robotics Systems Engineer dry-run review.

This is a deterministic database reader and artifact formatter.  It neither
calls a model nor makes a matching judgment.  Candidate judgments and wording
are intentionally left to the Codex agent running the manual.
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
from typing import Any, Iterable, Mapping, Sequence

from dotenv import load_dotenv

from internal_role_matching_run_memory import fetch_latest_run_memory
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


MANUAL_VERSION = "2.1"
EVALUATOR_VERSION = "codex-config-robotics-direct-review-1"
EXPECTED_ROLE_NAME = "Robotics Systems Engineer"
EXPECTED_WORKSPACE_NAME = "Config"
TARGET_POOL_SIZE = 200
ALLOWED_ROLE_STATUSES = {"active", "top_priority", "paused"}

DIRECT_TITLE_PATTERNS = (
    r"\brobotics? systems? engineer\b",
    r"\brobotics? engineer\b",
    r"\brobot engineer\b",
    r"\broboticist\b",
    r"\bmechatronics? engineer\b",
    r"\bcontrols? engineer\b",
    r"\bautonomy engineer\b",
    r"\bautonomous systems? engineer\b",
    r"\bmotion planning engineer\b",
    r"\brobotics? researcher\b",
    r"\brobot learning\b",
    r"로보틱스? ?(시스템)? ?엔지니어",
    r"로봇 ?(시스템|제어|연구|개발)",
)
ADJACENT_TITLE_PATTERNS = (
    r"\bmechanical engineer\b",
    r"\belectrical engineer\b",
    r"\bembedded (systems? )?engineer\b",
    r"\bfirmware engineer\b",
    r"\bperception engineer\b",
    r"\bcomputer vision engineer\b",
    r"\bresearch engineer\b",
    r"\bresearch scientist\b",
    r"기계 ?공학",
    r"전기 ?전자",
    r"임베디드",
)
CORE_GROUPS: dict[str, tuple[str, ...]] = {
    "control_manipulation": (
        r"\brobot control\b", r"\bmanipulation\b", r"\binverse kinematics\b",
        r"\bforward kinematics\b", r"\bcartesian[- ]space\b", r"\btrajectory (planning|execution|tracking)\b",
        r"\bimpedance control\b", r"\bmotion planning\b", r"\bend[- ]effector\b",
        r"\bbimanual\b", r"\bmodel predictive control\b", r"로봇 ?제어",
    ),
    "robot_integration": (
        r"(?<![a-z])ros2?(?![a-z])", r"\bhardware[- ]software integration\b",
        r"\brobot integration\b", r"\bsystems integration\b", r"\bactuator\b",
        r"\bmotor control\b", r"\breal[- ]time control\b", r"\bethercat\b",
        r"\bcan bus\b", r"\bembedded systems?\b", r"\bfirmware\b", r"로봇 ?통합",
    ),
    "sensing_calibration": (
        r"\bcalibration\b", r"\bsensor fusion\b", r"\bforce sensing\b", r"\btactile\b",
        r"\blidar\b", r"\bdepth camera\b", r"\bvisual[- ]inertial\b", r"\bslam\b",
        r"\bmultimodal sensing\b", r"\bsynchroni[sz]ation\b", r"센서 ?융합",
    ),
    "teleop_data": (
        r"\bteleoperation\b", r"\btele-op\b", r"\bhaptic\b", r"\bmaster[- ]slave\b",
        r"\brobot data collection\b", r"\bdemonstration collection\b", r"원격 ?조작",
    ),
    "simulation": (
        r"\bmujoco\b", r"\bisaac sim\b", r"\bgazebo\b", r"\bpybullet\b",
    ),
}
ROBOT_CONTEXT_PATTERNS = (
    r"\brobotics?\b", r"\brobotic\b", r"\brobot arm\b", r"\bmanipulator\b",
    r"\bautonomous (robot|vehicle|system)\b", r"\bmobile robot\b", r"\bhumanoid\b",
    r"\bquadruped\b", r"\bmechatronics?\b", r"로보틱스", r"로봇",
)
RELATED_DEGREE_PATTERNS = (
    r"\brobotics?\b", r"\bmechanical engineering\b", r"\belectrical engineering\b",
    r"\bmechatronics?\b", r"\bcontrol engineering\b", r"\bcomputer engineering\b",
    r"\baerospace engineering\b", r"기계공학", r"전기전자", r"로봇", r"제어",
)
QUALITY_PATTERNS = (
    r"\bdeployed\b", r"\bproduction\b", r"\blaunched\b", r"\bshipped\b",
    r"\bfield deployment\b", r"\bled\b", r"\bowned\b", r"\bpatent\b",
    r"\bfirst[- ]author\b", r"\brss\b", r"\bcorl\b", r"\bicra\b", r"\biros\b",
    r"\bra-l\b", r"\bt-ro\b", r"\bneurips\b", r"\bicml\b", r"\biclr\b", r"\bcvpr\b",
    r"배포", r"상용", r"출시", r"운영", r"리드", r"특허", r"1저자",
)
KOREA_PATTERNS = (r"\bseoul\b", r"\bkorea\b", r"서울", r"대한민국", r"한국")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


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
    parts = [profile.get(key) for key in ("headline", "bio", "resume_text")]
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
        text = " ".join(str(row.get(key) or "") for key in ("company_name", "role", "description", "memo"))
        groups = matched_groups(text)
        if not matches(text, ROBOT_CONTEXT_PATTERNS + DIRECT_TITLE_PATTERNS) and len(groups) < 2:
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
    return max(fallback, round(sum((end - start).days for start, end in merged) / 30.4375))


def feature_scores(text: str, education_text: str, months: int, location: str) -> dict[str, Any]:
    groups = matched_groups(text)
    direct = matches(text, DIRECT_TITLE_PATTERNS)
    adjacent = matches(text, ADJACENT_TITLE_PATTERNS)
    robot_context = matches(text, ROBOT_CONTEXT_PATTERNS)
    function = 25 if direct else 15 if adjacent and robot_context else 8 if robot_context else 0
    core = min(20, len(groups) * 5)
    experience = 15 if months >= 60 else 12 if months >= 36 else 9 if months >= 24 else 6 if months >= 12 else 3 if months > 0 else 0
    credential = 10 if matches(education_text, RELATED_DEGREE_PATTERNS) else 0
    location_score = 10 if matches(location, KOREA_PATTERNS) else 0
    impact = min(6, sum(1 for pattern in QUALITY_PATTERNS if re.search(pattern, text, flags=re.IGNORECASE)))
    role_relevance = min(86, function + core + experience + credential + location_score + impact)
    return {
        "function": function,
        "coreWork": core,
        "experience": experience,
        "credential": credential,
        "locationLanguage": location_score,
        "impact": impact,
        "roleRelevance": role_relevance,
        "matchedCoreGroups": groups,
        "directFunction": direct,
        "adjacentFunction": adjacent,
        "robotContext": robot_context,
    }


def recency_bonus(value: Any) -> int:
    logged = parse_date(value)
    if not logged:
        return 0
    age = (now_utc().date() - logged).days
    return 4 if age <= 14 else 2 if age <= 45 else 1 if age <= 120 else 0


def relevant_excerpt(text: str, limit: int = 5200) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    hit_patterns = DIRECT_TITLE_PATTERNS + ROBOT_CONTEXT_PATTERNS + tuple(
        pattern for patterns in CORE_GROUPS.values() for pattern in patterns
    ) + QUALITY_PATTERNS
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


def latest_by_talent(rows: Iterable[Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    ordered = sorted(
        (dict(row) for row in rows),
        key=lambda row: (compact(row.get("reviewed_at"), 80), compact(row.get("id"), 100)),
        reverse=True,
    )
    for row in ordered:
        talent_id = compact(row.get("talent_id"), 100)
        if talent_id and talent_id not in result:
            result[talent_id] = row
    return result


def load_detail(db: SupabaseReadOnly, pool_ids: Sequence[str]) -> dict[str, list[dict[str, Any]]]:
    calls: dict[str, tuple[str, str, str]] = {
        "insights": ("talent_insights", "talent_id", "id,talent_id,content,created_at,last_updated_at"),
        "summaries": ("talent_conversation_summaries", "talent_id", "id,talent_id,conversation_id,segment_summary,summary_text,created_at,to_message_id"),
        "activities": ("talent_activity_events", "talent_id", "id,talent_id,event_type,summary,impact_level,source,created_at"),
        "progress": ("talent_progress", "talent_id", "id,talent_id,role_id,recommendation_id,kind,text,metadata,user_id,created_at"),
        "memos": ("talent_ops_profile_memos", "talent_id", "id,talent_id,content,created_at,updated_at"),
    }
    output: dict[str, list[dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=len(calls)) as executor:
        futures = {
            name: executor.submit(db.by_ids, table, column, pool_ids, select=select, order="created_at.desc")
            for name, (table, column, select) in calls.items()
        }
        for name, future in futures.items():
            output[name] = future.result()
    return output


def consideration_markdown() -> str:
    return """# Config — Robotics Systems Engineer consideration

## Role essence

- 실제 로봇의 제어·trajectory execution·IK·Cartesian control을 반복 가능하고 안정적인 시스템으로 만듭니다.
- arms·grippers·sensor·embedded device를 ROS/ROS2 기반 end-to-end stack으로 통합하고 현장 failure를 디버깅합니다.
- teleoperation·calibration·synchronization·multimodal sensing을 통해 고품질 robot-learning data를 생성합니다.
- 실험 prototype을 대규모 data collection·evaluation·deployment에 견디는 physical system으로 전환합니다.

## Hard filters

1. 실제 physical robot을 직접 build·integrate·deploy하거나 control한 A/B급 근거가 있어야 합니다. 키워드·simulation-only·순수 perception-only는 통과시키지 않습니다.
2. Python, 실무 C++, ROS/ROS2와 robot control·kinematics·calibration 중 핵심 stack을 실제로 사용한 근거가 있어야 합니다. finalist의 unknown은 제외합니다.
3. 한국어 협업, 영어 문서 협업, 서울 강남 full-time onsite에서 physical hardware를 다룰 의향이 모두 확인돼야 합니다.
4. 역할 직접 관련 신호 1개를 포함해 서로 독립적인 객관적 품질 신호가 최소 2개 있어야 합니다.
5. dont_share·internal opt-out·blocked company·중복 제안·active same-company pipeline·human override는 절대 우회하지 않습니다.

## Plus / minus

- **Plus:** manipulation·bimanual control, low-level/real-time control, teleoperation·haptics, tactile/force/depth sensing, multi-camera calibration, hardware bring-up, repeatable field deployment, robot data collection, 인정받는 robotics 논문, 빠른 progression과 구체적인 system ownership입니다.
- **Plus:** 로보틱스·autonomy 조직 또는 강한 관련 연구실에서의 경력, 초기 팀에서의 hands-on 실행입니다.
- **Minus:** physical-system 근거 없는 일반 AI/CV, simulation-only, 단순 기술명 나열, 최근 hands-on이 끊긴 management-only seniority, 서울 onsite 의향이 관측되지 않은 경우입니다.

## Acceptance profile / unknowns

- physical AI와 실제 로봇을 직접 만지는 환경, 작은 연구·제품 팀, 높은 ownership을 현재 원하며 서울 onsite가 가능한 사람이 수락 가능성이 높습니다.
- 보상 범위, intern~staff 중 실제 level mapping, relocation·visa 지원은 공개 정보가 없어 finalist마다 확인해야 합니다.
- `확실한 사람만` 지시에 따라 role-specific 최신 acceptance evidence가 없거나 hard criterion이 stale/unknown인 후보는 선택하지 않고 `verification_needed`로 둡니다.

## Learned feedback / do-not-use

- 동일 role·workspace의 recommendation, company progress, stage, review memory가 모두 0건이라 과거 outcome에서 승격한 criterion은 없습니다.
- 학교·회사 명성 단독, 보호 특성, 졸업연도/학번, 활동성만으로 점수를 올리지 않습니다.
"""


def structured_consideration(role: Mapping[str, Any], workspace: Mapping[str, Any], snapshot: Mapping[str, Any], generated_at: str, requested_by: str) -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "manualVersion": MANUAL_VERSION,
        "generatedAt": generated_at,
        "generatedBy": requested_by,
        "roleId": role.get("role_id"),
        "onePageSummary": consideration_markdown(),
        "sourceSnapshot": snapshot.get("hashes"),
        "requestHistory": {"historyCoverage": "latest_only", "versions": [{"effectiveAt": snapshot.get("internalRole", {}).get("updatedAt"), "sourceId": "company_internal_roles.request", "summary": "현재 Config Robotics Systems Engineer 평가 원칙과 역할 기준", "supersededBy": None}], "limitations": ["별도 request history가 없음"]},
        "policyConstraints": {"nonOverridable": ["protected_traits", "candidate_opt_out", "blocked_company", "duplicate_send", "human_override", "private_data_exposure"], "conflicts": []},
        "roleEssence": [
            {"statement": "physical robot control·execution stack의 안정성과 반복 가능성", "sourceIds": ["company_roles.description"]},
            {"statement": "sensing·teleoperation·hardware integration과 cross-boundary debugging", "sourceIds": ["company_roles.description"]},
            {"statement": "robot-learning용 고품질 data collection infrastructure", "sourceIds": ["company_roles.description"]},
        ],
        "hardFilters": [
            {"id": "physical_robot_systems", "statement": "실제 physical robot build·integration·deployment 또는 control 직접 근거", "side": "company", "rationale": "역할의 핵심이 실제 hardware와 control stack의 안정화임", "whyHard": "simulation·일반 AI만으로 수행 불가", "candidateAcceptanceImpact": "physical hardware hands-on 의향 필요", "sourceIds": ["company_roles.description", "company_internal_roles.request"], "confidence": "high", "unknownPolicy": "verify_before_final", "sqlStrategy": "robot context와 control/integration evidence로 high-recall retrieval 후 직접 검증", "verificationMethod": "experience·resume·project·publication 원문과 필요 시 공식 자료"},
            {"id": "python_cpp_ros_control", "statement": "Python, 실무 C++, ROS/ROS2 및 control fundamentals", "side": "company", "rationale": "JD 명시 stack", "whyHard": "실행 stack을 직접 구현해야 함", "candidateAcceptanceImpact": "hands-on coding scope", "sourceIds": ["company_roles.description"], "confidence": "high", "unknownPolicy": "verify_before_final", "sqlStrategy": "keyword는 retrieval에만 사용", "verificationMethod": "실제 project/role description"},
            {"id": "korean_english_seoul_onsite", "statement": "한국어·영어 문서 협업과 서울 full-time onsite", "side": "both", "rationale": "물리 장비와 팀 협업의 현장성", "whyHard": "remote로 대체 불가", "candidateAcceptanceImpact": "이주·통근 및 근무 형태 제약", "sourceIds": ["company_roles.description", "company_internal_roles.request"], "confidence": "high", "unknownPolicy": "verify_before_final", "sqlStrategy": "location은 soft retrieval; 최종은 insight/message로 확인", "verificationMethod": "최신 후보자 진술과 location/work preference"},
            {"id": "two_objective_signals", "statement": "role-direct 1개 포함 독립적인 객관적 품질 신호 최소 2개", "side": "company", "rationale": "keyword·pedigree 단독 오판 방지", "whyHard": "role request의 명시 평가 원칙", "candidateAcceptanceImpact": "없음", "sourceIds": ["company_internal_roles.request"], "confidence": "high", "unknownPolicy": "exclude", "sqlStrategy": "retrieval 후 직접 검증", "verificationMethod": "직무·기간·system outcome·논문·progression·학업 성과"},
        ],
        "rankingSignals": {
            "companyPlus": [
                {"id": "manipulation_control", "statement": "manipulation·bimanual·low-level control 직접 ownership", "maxImpact": 12, "sourceIds": ["company_roles.description"], "rationale": "핵심 실행 결과와 직접 연결"},
                {"id": "integration_deployment", "statement": "hardware bring-up·integration·field deployment와 안정적 운영", "maxImpact": 10, "sourceIds": ["company_roles.description", "company_internal_roles.request"], "rationale": "prototype을 repeatable system으로 전환"},
                {"id": "teleop_sensing_data", "statement": "teleoperation·calibration·sensing·robot data collection", "maxImpact": 8, "sourceIds": ["company_roles.description"], "rationale": "foundation-model data 품질과 throughput"},
            ],
            "companyMinus": [{"id": "non_physical_or_management_only", "statement": "physical robotics 근거 없는 일반 AI/CV 또는 management-only", "maxImpact": -18, "sourceIds": ["company_internal_roles.request"], "rationale": "hands-on physical systems scope와 불일치"}],
            "candidatePlus": [{"id": "current_physical_ai_interest", "statement": "최근 physical AI·robotics·초기팀 hands-on 명시 선호", "maxImpact": 12, "sourceIds": ["additional_instruction", "company_roles.description"], "rationale": "수락 가능성 직접 근거"}],
            "candidateMinus": [{"id": "onsite_or_scope_uncertain", "statement": "서울 onsite 또는 hands-on scope 의향 미관측", "maxImpact": -20, "sourceIds": ["additional_instruction", "company_internal_roles.request"], "rationale": "확실한 사람만 선발"}],
            "systemSignals": ["other_internal_company_validated_progress", "recent_activity", "internal_responsiveness"],
        },
        "retrievalRankSpec": [
            {"id": "core_function", "maxPoints": 25, "terms": ["robotics systems engineer", "robotics engineer", "controls engineer", "mechatronics engineer"], "sqlExpression": "regex-equivalent deterministic text match", "rationale": "direct function recall"},
            {"id": "core_work", "maxPoints": 20, "terms": list(CORE_GROUPS), "sqlExpression": "5 points per independently matched work group", "rationale": "actual work evidence recall"},
            {"id": "relevant_experience", "maxPoints": 15, "terms": ["merged relevant experience months"], "sqlExpression": "non-overlapping relevant ranges", "rationale": "scope and recency"},
            {"id": "related_credential", "maxPoints": 10, "terms": ["robotics", "mechanical", "electrical", "mechatronics", "control"], "sqlExpression": "related degree text match", "rationale": "explicit request signal"},
            {"id": "location_language", "maxPoints": 10, "terms": ["Seoul", "Korea"], "sqlExpression": "profile location; final language check is manual", "rationale": "onsite feasibility recall"},
            {"id": "impact", "maxPoints": 6, "terms": ["deployed", "production", "publication", "patent", "led"], "sqlExpression": "bounded objective-impact clues", "rationale": "high-impact non-obvious lane"},
        ],
        "retrievalScoreContract": {"roleRelevanceMax": 86, "systemSignalMax": 14, "totalMax": 100},
        "learnedFeedback": [],
        "acceptanceHypothesis": {"likelyToAccept": ["서울 onsite에서 physical robot을 직접 다루려는 사람", "physical AI·초기 연구/제품팀 ownership을 원하는 사람"], "likelyToDecline": ["remote-only", "management-only", "순수 model research만 원하는 사람"], "mustVerify": ["서울 onsite full-time", "한국어·영어 협업", "level·보상", "relocation/visa"]},
        "reasonAnchors": ["실제 robot system과 후보자 직접 기여", "control/integration 난이도", "배포·운영 결과", "논문이면 venue·저자 역할"],
        "unknowns": ["compensation", "level mapping", "relocation/visa support"],
        "prohibitedCriteria": [],
        "changeSummary": ["이 role의 최초 manual 2.1 consideration이며 과거 company outcome은 없음"],
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

    memory_error = None
    try:
        previous_memory = fetch_latest_run_memory(url, key, args.role_id)
    except Exception as error:
        previous_memory = None
        memory_error = compact(f"{type(error).__name__}: {error}", 500)
    write_json(output / "previous_run_memory.json", {"loaded": previous_memory is not None, "memory": previous_memory, "readError": memory_error})
    write_text(output / "previous_run_memory.md", previous_memory.get("content") if previous_memory else ("이전 run memory 조회에 실패했습니다. 현재 source만 사용합니다." if memory_error else "이 role에 저장된 이전 run memory가 없습니다."))

    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{args.role_id}"})
    internal_role = internal_rows[0] if internal_rows else {"role_id": args.role_id, "request": None, "considerations": None, "updated_at": None}
    company_db_rows = db.get("company_db", filters={"id": f"eq.{workspace.get('company_db_id')}"}) if workspace.get("company_db_id") else []
    company_db = company_db_rows[0] if company_db_rows else {}

    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            "all_roles": executor.submit(db.get, "company_roles", select="role_id,company_workspace_id,name,source_type,status,updated_at"),
            "all_workspaces": executor.submit(db.get, "company_workspace", select="company_workspace_id,company_name,company_db_id"),
            "target_recs": executor.submit(db.get, "talent_opportunity_recommendation", filters={"role_id": f"eq.{args.role_id}"}),
            "target_progress": executor.submit(db.get, "talent_progress", filters={"role_id": f"eq.{args.role_id}"}),
            "target_tags": executor.submit(db.get, "talent_opportunity_tag", filters={"opportunity_id": f"eq.{args.role_id}"}),
            "target_reviews": executor.submit(db.get, "talent_opportunity_matching_review", filters={"opportunity_id": f"eq.{args.role_id}"}),
            "profiles": executor.submit(db.get, "talent_users", select="user_id,name,headline,bio,location,current_location,resume_text,resume_links,last_logined_at,created_at,updated_at"),
            "settings": executor.submit(db.get, "talent_setting", select="user_id,profile_visibility,get_internal_recommendation,blocked_companies,engagement_types,status,is_onboarding_done,updated_at"),
            "experiences": executor.submit(db.get, "talent_experiences", select="id,talent_id,company_name,role,start_date,end_date,months,description,memo,employment_type"),
            "educations": executor.submit(db.get, "talent_educations", select="id,talent_id,school,degree,field,start_date,end_date,description,memo"),
            "extras": executor.submit(db.get, "talent_extras", select="talent_id,content"),
            "all_recs": executor.submit(db.get, "talent_opportunity_recommendation", select="id,talent_id,role_id,feedback,feedback_reason,processed_stage,saved_stage,dismissed_at,feedback_at,recommended_at,created_at,viewed_at,clicked_at,updated_at"),
            "all_tags": executor.submit(db.get, "talent_opportunity_tag", select="id,talent_id,opportunity_id,tag,created_at,updated_at"),
            "target_fits": executor.submit(db.get, "talent_opportunity_fit", filters={"opportunity_id": f"eq.{args.role_id}"}),
        }
        loaded = {name: future.result() for name, future in futures.items()}

    company_roles = [row for row in loaded["all_roles"] if row.get("company_workspace_id") == role.get("company_workspace_id")]
    company_role_ids = {compact(row.get("role_id"), 100) for row in company_roles}
    company_recs = [row for row in loaded["all_recs"] if compact(row.get("role_id"), 100) in company_role_ids]
    company_progress = db.get("talent_progress", filters={"role_id": f"in.({','.join(sorted(company_role_ids))})"}) if company_role_ids else []
    company_tags = [row for row in loaded["all_tags"] if compact(row.get("opportunity_id"), 100) in company_role_ids]

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
        "officialSources": ["https://config.inc/careers/robotics-engineer", "https://config.inc/careers"],
        "hashes": source_hashes,
    }
    write_json(output / "source_snapshot.json", snapshot)
    write_json(output / "source_material.json", {"role": role, "internalRole": internal_role, "workspace": workspace, "companyDb": company_db, "sameCompanyRoles": company_roles, "sameRoleRecommendations": loaded["target_recs"], "sameRoleProgress": [{**row, "metadata": safe_metadata(row.get("metadata"))} for row in loaded["target_progress"]], "sameRoleTags": loaded["target_tags"], "sameRoleReviews": loaded["target_reviews"], "previousRunMemory": previous_memory})

    consideration = structured_consideration(role, workspace, snapshot, iso_now(), args.requested_by)
    consideration_fingerprint = digest(consideration)
    role_fingerprint = digest({"version": "2.1-config-robotics-1", "role": {key_name: role.get(key_name) for key_name in ("description", "type", "seniority_level", "location_text", "work_mode", "salary_range", "salary_min", "salary_max")}, "internalRequest": internal_role.get("request"), "workspaceRequest": workspace.get("request"), "companyFitContext": {"description": workspace.get("company_description"), "pitch": workspace.get("pitch")}, "hardFilters": consideration["hardFilters"], "rankingSignals": consideration["rankingSignals"], "acceptanceHypothesis": consideration["acceptanceHypothesis"]})
    consideration["considerationFingerprint"] = consideration_fingerprint
    consideration["roleFingerprint"] = role_fingerprint
    write_text(output / "consideration.md", consideration_markdown())
    write_json(output / "considerations.json", consideration)

    profiles = {compact(row.get("user_id"), 100): row for row in loaded["profiles"]}
    settings = {compact(row.get("user_id"), 100): row for row in loaded["settings"]}
    experiences = index_many(loaded["experiences"], "talent_id")
    educations = index_many(loaded["educations"], "talent_id")
    extras = index_many(loaded["extras"], "talent_id")
    recs = index_many(loaded["all_recs"], "talent_id")
    tags = index_many(loaded["all_tags"], "talent_id")
    fits = index_many(loaded["target_fits"], "talent_id")
    role_map = {compact(row.get("role_id"), 100): row for row in loaded["all_roles"]}
    workspace_map = {compact(row.get("company_workspace_id"), 100): row for row in loaded["all_workspaces"]}
    internal_role_ids = {role_id for role_id, item in role_map.items() if compact(item.get("source_type"), 40).lower() == "internal"}
    same_role_recs = index_many(loaded["target_recs"], "talent_id")
    same_role_tags = index_many(loaded["target_tags"], "talent_id")
    same_role_rec_talents = set(same_role_recs)
    accepted_unprocessed = {talent_id for talent_id in same_role_rec_talents if is_same_role_accepted_unprocessed(same_role_recs.get(talent_id) or [], same_role_tags.get(talent_id) or [], args.role_id)}
    aliases = {normalized_company(workspace.get("company_name")), normalized_company(company_db.get("name"))} - {""}

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
    # Candidate fingerprints are evaluated for active rows before LIMIT.  This run
    # has no rows, but keeping the explicit branch prevents silent cooldown skips.
    unchanged_cooldown_ids: set[str] = set()
    candidate_changed_review_ids: set[str] = set()
    for talent_id in unchanged_role_review_ids:
        profile = profiles.get(talent_id) or {}
        setting = settings.get(talent_id) or {}
        candidate_fp = digest({"version": "2.1-config-robotics-1", "profile": {key_name: profile.get(key_name) for key_name in ("headline", "bio", "location", "current_location", "resume_text", "resume_links")}, "experiences": sorted(experiences.get(talent_id) or [], key=lambda row: compact(row.get("id"), 100)), "educations": sorted(educations.get(talent_id) or [], key=lambda row: compact(row.get("id"), 100)), "extras": extras.get(talent_id) or [], "setting": {key_name: setting.get(key_name) for key_name in ("blocked_companies", "engagement_types", "profile_visibility", "get_internal_recommendation")}, "recommendations": recs.get(talent_id) or [], "tags": tags.get(talent_id) or []})
        if candidate_fp == active_review_rows[talent_id].get("candidate_fingerprint"):
            unchanged_cooldown_ids.add(talent_id)
        else:
            candidate_changed_review_ids.add(talent_id)

    excluded = {"visibility": 0, "internalOptOut": 0, "alreadyRecommended": 0, "activeReviewCooldown": 0, "blockedCompany": 0, "currentCompany": 0, "activeCompanyPipeline": 0, "humanUnfit": 0, "minimumRoleAdjacency": 0}
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

        candidate_edu = educations.get(talent_id) or []
        text = searchable(profile, candidate_exp, candidate_edu, extras.get(talent_id) or [])
        education_text = " ".join(" ".join(str(row.get(key_name) or "") for key_name in ("school", "degree", "field", "description", "memo")) for row in candidate_edu)
        months = relevant_months(candidate_exp)
        location = resolve_profile_location(profile)
        features = feature_scores(text, education_text, months, location)
        groups = features["matchedCoreGroups"]
        role_adjacent = (
            features["directFunction"] and len(groups) >= 1
        ) or (
            features["robotContext"] and len(groups) >= 2
        ) or (
            features["adjacentFunction"] and features["robotContext"] and len(groups) >= 2
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
        if len(groups) >= 3 or {"control_manipulation", "robot_integration"}.issubset(groups):
            lanes.append("core_work_evidence")
        if features["adjacentFunction"] and features["robotContext"] and len(groups) >= 2:
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

    eligible.sort(key=lambda row: (-row["retrievalScore"], -row["features"]["roleRelevance"], row["talentId"]))
    selected_ids: set[str] = set()
    lane_stats: list[dict[str, Any]] = []
    for lane, requested in (("direct_function_title", 80), ("core_work_evidence", 60), ("adjacent_transferable", 40), ("high_impact_non_obvious", 20)):
        rows = [row for row in eligible if lane in row["retrievalLanes"]]
        overlap = sum(row["talentId"] in selected_ids for row in rows)
        contributed = 0
        for row in rows:
            if row["talentId"] in selected_ids:
                continue
            selected_ids.add(row["talentId"])
            contributed += 1
            if contributed >= requested:
                break
        lane_stats.append({"lane": lane, "requestedUnique": requested, "rawFetched": len(rows), "overlapWithEarlierLanes": overlap, "uniqueContributed": contributed, "eligibleRoleAdjacentRemaining": max(0, len(rows) - overlap - contributed)})
    for row in eligible:
        if len(selected_ids) >= TARGET_POOL_SIZE:
            break
        selected_ids.add(row["talentId"])
    pool = [row for row in eligible if row["talentId"] in selected_ids][:TARGET_POOL_SIZE]
    pool_ids = [row["talentId"] for row in pool]

    previous_completed_at = previous_memory.get("created_at") if previous_memory else None
    funnel = {
        "allTalentUsers": len(profiles),
        "excluded": excluded,
        "includedExceptions": {"sameRoleAcceptedUnprocessed": len(accepted_unprocessed), "retrievedSameRoleAcceptedUnprocessed": sum(bool(row.get("sameRoleAcceptedUnprocessed")) for row in pool)},
        "afterBaseExclusions": len(profiles) - sum(value for key_name, value in excluded.items() if key_name != "minimumRoleAdjacency"),
        "eligibleRoleAdjacent": len(eligible),
        "retrieved": len(pool),
        "targetPool": TARGET_POOL_SIZE,
        "poolShortfallReason": None if len(pool) == TARGET_POOL_SIZE else "insufficient_relevant_candidates",
        "activeReviewCooldownRows": len(active_review_rows),
        "excludedByUnchangedCooldown": len(unchanged_cooldown_ids),
        "cooldownInvalidatedByRoleChange": len(role_changed_review_ids),
        "cooldownInvalidatedByCandidateChange": len(candidate_changed_review_ids),
        "cooldownExpired": sum(1 for row in latest_reviews.values() if compact(row.get("final_disposition"), 60) == "do_not_recommend" and parse_date(row.get("excluded_until")) and datetime.fromisoformat(str(row.get("excluded_until")).replace("Z", "+00:00")) <= now),
        "newOrMateriallyUpdatedReservation": {"applied": previous_memory is not None, "previousCompletedAt": previous_completed_at, "reserved": 0, "note": "first valid run; reservation does not apply" if previous_memory is None else "previous memory exists; current pool is below target so no candidate was displaced"},
        "lanes": lane_stats,
    }
    write_json(output / "retrieval_funnel.json", funnel)
    write_text(output / "retrieval.sql", f"""-- Rendered read-only retrieval equivalent for manual 2.1.
-- Executed via paginated Supabase PostgREST GETs; no RPC or mutation.
-- role_id = {args.role_id}
-- 1) read role/workspace/request/recommendation/progress/tag/review state;
-- 2) exclude dont_share, internal opt-out, same-role duplicate except accepted_unprocessed,
--    unchanged active do_not_recommend cooldown, blocked Config, current Config employee,
--    active Config pipeline, and human_label='unfit';
-- 3) require high-recall role adjacency: direct robotics title + >=1 work group,
--    or explicit robot context + >=2 of control/integration/sensing/teleop/simulation;
-- 4) rank role relevance 0..86 plus system signals 0..14, cap 100;
-- 5) union direct/core/adjacent/high-impact lanes, dedupe, deterministic backfill, LIMIT 200.
-- current unchanged_cooldown_talent_ids = ARRAY[{','.join(sorted(unchanged_cooldown_ids))}]::uuid[]
""")

    with (output / "candidate_pool.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rank", "talent_id", "name", "headline", "location", "relevant_months", "role_relevance", "system_score", "retrieval_score", "matched_core_groups", "retrieval_lanes", "same_role_accepted_unprocessed", "existing_fit_label", "existing_fit_score"])
        for rank, row in enumerate(pool, 1):
            writer.writerow([rank, row["talentId"], row["name"], row["headline"], row["location"], row["relevantMonths"], row["features"]["roleRelevance"], row["systemScore"], row["retrievalScore"], "|".join(row["features"]["matchedCoreGroups"]), "|".join(row["retrievalLanes"]), row["sameRoleAcceptedUnprocessed"], row["existingFitLabel"], row["existingFitScore"]])

    detail = load_detail(db, pool_ids)
    insights = index_many(detail["insights"], "talent_id")
    summaries = index_many(detail["summaries"], "talent_id")
    activities = index_many(detail["activities"], "talent_id")
    progress = index_many(detail["progress"], "talent_id")
    memos = index_many(detail["memos"], "talent_id")

    full_packets: list[dict[str, Any]] = []
    artifact_packets: list[dict[str, Any]] = []
    for rank, pool_row in enumerate(pool, 1):
        talent_id = pool_row["talentId"]
        profile = profiles[talent_id]
        candidate_exp = sorted(experiences.get(talent_id) or [], key=lambda row: compact(row.get("start_date"), 40), reverse=True)
        candidate_edu = educations.get(talent_id) or []
        full_text = searchable(profile, candidate_exp, candidate_edu, extras.get(talent_id) or [])
        recent_recs = []
        for row in sorted(recs.get(talent_id) or [], key=lambda item: compact(item.get("created_at") or item.get("recommended_at"), 80), reverse=True)[:20]:
            rec_role = role_map.get(compact(row.get("role_id"), 100)) or {}
            rec_workspace = workspace_map.get(compact(rec_role.get("company_workspace_id"), 100)) or {}
            recent_recs.append({"id": row.get("id"), "roleId": row.get("role_id"), "company": rec_workspace.get("company_name"), "role": rec_role.get("name"), "sourceType": rec_role.get("source_type"), "feedback": row.get("feedback"), "feedbackReason": compact(row.get("feedback_reason"), 900), "processedStage": row.get("processed_stage"), "savedStage": row.get("saved_stage"), "dismissedAt": row.get("dismissed_at"), "feedbackAt": row.get("feedback_at"), "recommendedAt": row.get("recommended_at") or row.get("created_at")})
        common = {
            "rank": rank,
            "retrieval": pool_row,
            "profile": {"talentId": talent_id, "name": profile.get("name"), "headline": profile.get("headline"), "bio": compact(profile.get("bio"), 3000), "location": resolve_profile_location(profile), "signupLocation": profile.get("current_location"), "lastLoginedAt": profile.get("last_logined_at"), "publicProfileLinks": as_list(profile.get("resume_links"))[:8]},
            "experiences": [{"id": row.get("id"), "company": row.get("company_name"), "role": row.get("role"), "start": row.get("start_date"), "end": row.get("end_date"), "months": row.get("months"), "employmentType": row.get("employment_type"), "description": row.get("description"), "memo": row.get("memo")} for row in candidate_exp],
            "educations": [{"id": row.get("id"), "school": row.get("school"), "degree": row.get("degree"), "field": row.get("field"), "start": row.get("start_date"), "end": row.get("end_date"), "description": row.get("description"), "memo": row.get("memo")} for row in candidate_edu],
            "extras": [row.get("content") for row in extras.get(talent_id) or []],
            "insights": [{"id": row.get("id"), "content": row.get("content"), "updatedAt": row.get("last_updated_at") or row.get("created_at")} for row in sorted(insights.get(talent_id) or [], key=lambda item: compact(item.get("last_updated_at") or item.get("created_at"), 80), reverse=True)],
            "conversationSummaries": [{"id": row.get("id"), "createdAt": row.get("created_at"), "toMessageId": row.get("to_message_id"), "summary": row.get("segment_summary") or row.get("summary_text")} for row in sorted(summaries.get(talent_id) or [], key=lambda item: compact(item.get("created_at"), 80), reverse=True)],
            "activityEvents": [{"id": row.get("id"), "eventType": row.get("event_type"), "summary": row.get("summary"), "impactLevel": row.get("impact_level"), "createdAt": row.get("created_at")} for row in sorted(activities.get(talent_id) or [], key=lambda item: compact(item.get("created_at"), 80), reverse=True)[:20]],
            "recentRecommendations": recent_recs,
            "progress": [{"id": row.get("id"), "roleId": row.get("role_id"), "kind": row.get("kind"), "text": row.get("text"), "metadata": safe_metadata(row.get("metadata")), "createdAt": row.get("created_at")} for row in sorted(progress.get(talent_id) or [], key=lambda item: compact(item.get("created_at"), 80), reverse=True)],
            "tags": [{"id": row.get("id"), "roleId": row.get("opportunity_id"), "tag": row.get("tag"), "updatedAt": row.get("updated_at")} for row in sorted(tags.get(talent_id) or [], key=lambda item: compact(item.get("updated_at"), 80), reverse=True)],
            "opsMemos": [{"id": row.get("id"), "content": row.get("content"), "updatedAt": row.get("updated_at")} for row in sorted(memos.get(talent_id) or [], key=lambda item: compact(item.get("updated_at"), 80), reverse=True)],
            "existingFit": jsonable((fits.get(talent_id) or [None])[0]),
        }
        candidate_fingerprint = digest({"version": "2.1-config-robotics-1", "profile": {key_name: profile.get(key_name) for key_name in ("headline", "bio", "location", "current_location", "resume_text", "resume_links")}, "experiences": common["experiences"], "educations": common["educations"], "extras": common["extras"], "insights": common["insights"], "conversationSummaries": common["conversationSummaries"], "setting": {key_name: (settings.get(talent_id) or {}).get(key_name) for key_name in ("blocked_companies", "engagement_types", "profile_visibility", "get_internal_recommendation")}, "recommendations": common["recentRecommendations"], "tags": common["tags"], "progress": common["progress"], "opsMemos": common["opsMemos"]})
        common["candidateFingerprint"] = candidate_fingerprint
        full_packet = {**common, "resumeText": profile.get("resume_text")}
        artifact_packet = {**common, "resumeEvidenceExcerpt": relevant_excerpt(full_text)}
        full_packets.append(full_packet)
        artifact_packets.append(artifact_packet)

    temp_dir = Path(os.environ.get("TMPDIR") or "/tmp") / f"harper-config-robotics-{run_id}"
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
                f"- Retrieval: role {retrieval['features']['roleRelevance']}, system {retrieval['systemScore']}, relevant months {retrieval['relevantMonths']}, groups {', '.join(retrieval['features']['matchedCoreGroups'])}, lanes {', '.join(retrieval['retrievalLanes'])}",
                f"- Evidence excerpt: {compact(packet.get('resumeEvidenceExcerpt'), 3500)}",
                "- Experience: " + " | ".join(f"{row.get('start') or '?'}~{row.get('end') or 'present'} {compact(row.get('company'), 90)} / {compact(row.get('role'), 110)}: {compact(row.get('description'), 700)}" for row in packet["experiences"][:8]),
                "- Education: " + " | ".join(f"{compact(row.get('school'), 100)} / {compact(row.get('degree'), 80)} {compact(row.get('field'), 100)}" for row in packet["educations"][:6]),
                "- Candidate context: " + " | ".join(compact(str(row.get("content") or row.get("summary")), 900) for row in (packet["insights"][:2] + packet["conversationSummaries"][:3])),
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

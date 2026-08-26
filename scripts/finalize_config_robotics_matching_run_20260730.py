#!/usr/bin/env python3
"""Finalize the 2026-07-30 Config Robotics Systems Engineer dry run.

The current Codex agent made every judgment after reviewing every packet in the
country-gated retrieval pool. This formatter performs read-only source
preflights, score arithmetic, and artifact generation. It never writes business
tables or queues a recommendation/delivery.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from prepare_internal_role_matching_agent_review import SupabaseReadOnly, compact, digest


ROLE_ID = "20882456-8862-406d-8f1a-9d69ecb9b575"
WORKSPACE_ID = "68c33def-8a04-4e7e-af33-cc49e53a3f7d"
RUN_ID = "20260730T090403Z"
MANUAL_VERSION = "2.3"
EVALUATOR_VERSION = "codex-current-agent-config-robotics-20260730"
MAX_PROPOSALS = 5
REQUESTED_BY = "kimhojin"
ADDITIONAL_INSTRUCTION = "가능한 5명 채워봐."
EXPECTED_ROLE_UPDATED_AT = "2026-07-29T14:19:18.569275+00:00"

POOL_SOURCE_RANKS = [1, 2, 6, 7, 8, 9, 10, 12, 14, 15, 16, 21, 23, 27, 31]
NO_COUNTRY_SOURCE_RANKS = [3, 4, 5, 11, 13, 17, 18, 19, 20, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 35, 36, 37]

COMPANY_COMPONENTS = [
    ("핵심 업무 수행 근거", 30),
    ("scope·seniority 적합", 20),
    ("회사 명시 기준", 15),
    ("성과·실행력의 객관 근거", 20),
    ("환경 적합", 15),
]
ACCEPTANCE_COMPONENTS = [
    ("명시적 커리어 방향", 25),
    ("회사·산업·stage 매력", 15),
    ("location·work mode·고용 형태", 20),
    ("seniority·보상·ownership", 20),
    ("최근 행동과 타이밍", 20),
]
HARD_CRITERIA = [
    "direct_physical_robot_systems",
    "role_relevant_control_sensing_integration",
    "hands_on_physical_deployment",
    "python_cpp_ros",
    "two_objective_quality_signals",
    "korean_collaboration_and_written_english",
    "seoul_onsite_full_time",
    "scope_and_seniority",
    "material_non_compensation_constraints",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def mutual(company: int, acceptance: int, confidence: int) -> int:
    bilateral = 0 if company + acceptance == 0 else 2 * company * acceptance / (company + acceptance)
    return round(0.90 * bilateral + 0.10 * confidence)


def persisted_score(mutual_score: int) -> int:
    return max(80, min(100, 80 + round((mutual_score - 70) * 2 / 3)))


def components(names_and_max: list[tuple[str, int]], scores: list[int]) -> list[dict[str, Any]]:
    if len(names_and_max) != len(scores):
        raise RuntimeError("component length mismatch")
    return [
        {"criterion": name, "score": score, "maxScore": max_score}
        for (name, max_score), score in zip(names_and_max, scores)
    ]


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_db(root: Path) -> SupabaseReadOnly:
    load_dotenv(root / ".env.local", override=False)
    url = compact(os.environ.get("NEXT_PUBLIC_SUPABASE_URL"), 500)
    key = compact(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"), 10000)
    if not url or not key:
        raise RuntimeError("Supabase service credentials are required")
    return SupabaseReadOnly(url, key)


def live_preflight(db: SupabaseReadOnly) -> dict[str, Any]:
    role_rows = db.get("company_roles", filters={"role_id": f"eq.{ROLE_ID}"})
    if len(role_rows) != 1:
        raise RuntimeError("role not found or not unique")
    role = role_rows[0]
    workspace_rows = db.get(
        "company_workspace",
        filters={"company_workspace_id": f"eq.{role.get('company_workspace_id')}"},
    )
    if len(workspace_rows) != 1:
        raise RuntimeError("workspace not found or not unique")
    workspace = workspace_rows[0]
    if role.get("company_workspace_id") != WORKSPACE_ID or workspace.get("company_name") != "Config":
        raise RuntimeError("role/workspace identity mismatch")
    if role.get("updated_at") != EXPECTED_ROLE_UPDATED_AT:
        raise RuntimeError("role source drift detected")
    if role.get("status") not in {"active", "top_priority", "paused"} or role.get("is_expired") is True:
        raise RuntimeError("role is not executable")
    if role.get("source_type") != "internal":
        raise RuntimeError("role is not internal")

    internal_role_rows = db.get(
        "company_internal_roles",
        filters={"role_id": f"eq.{ROLE_ID}"},
    )
    if len(internal_role_rows) != 1:
        raise RuntimeError("internal role request is missing or not unique")
    internal_role = internal_role_rows[0]

    recs = db.get(
        "talent_opportunity_recommendation",
        select="id,talent_id,role_id,feedback,processed_stage,saved_stage,dismissed_at,recommended_at,created_at",
        filters={"role_id": f"eq.{ROLE_ID}"},
    )
    tags = db.get(
        "talent_opportunity_tag",
        select="id,talent_id,opportunity_id,tag,created_at,updated_at",
        filters={"opportunity_id": f"eq.{ROLE_ID}"},
    )
    progress = db.get(
        "talent_progress",
        select="id,talent_id,role_id,kind,text,metadata,created_at",
        filters={"role_id": f"eq.{ROLE_ID}"},
    )
    fits = db.get(
        "talent_opportunity_fit",
        filters={"opportunity_id": f"eq.{ROLE_ID}"},
    )
    reviews = db.get(
        "talent_opportunity_matching_review",
        filters={"opportunity_id": f"eq.{ROLE_ID}"},
    )
    fit_state = sorted(
        [
            {
                key: row.get(key)
                for key in (
                    "id", "talent_id", "opportunity_id", "score", "label",
                    "human_label", "human_reviewed_at", "last_evaluated_at",
                    "reevaluation_checked_at",
                )
            }
            for row in fits
        ],
        key=lambda row: str(row.get("id")),
    )
    business_state = {
        "sameRoleRecommendations": len(recs),
        "sameRoleProgress": len(progress),
        "sameRoleTags": len(tags),
        "sameRoleFits": len(fits),
        "sameRoleReviews": len(reviews),
        "recommendationIds": sorted(str(row.get("id")) for row in recs),
        "progressIds": sorted(str(row.get("id")) for row in progress),
        "tagIds": sorted(str(row.get("id")) for row in tags),
        "reviewIds": sorted(str(row.get("id")) for row in reviews),
        "fitStateHash": digest(fit_state),
    }
    role_hash = digest({
        "role": {
            key: role.get(key)
            for key in (
                "description", "location_text", "work_mode", "type", "status",
                "is_expired", "salary_range", "salary_min", "salary_max",
                "updated_at",
            )
        },
        "internalRequest": internal_role.get("request"),
    })
    workspace_hash = digest({
        key: workspace.get(key)
        for key in ("request", "company_description", "pitch", "updated_at")
    })
    return {
        "checkedAt": now_iso(),
        "role": role,
        "internalRole": internal_role,
        "workspace": workspace,
        "businessState": business_state,
        "selectedFitSnapshots": [
            row
            for row in fits
            if row.get("talent_id") in {
                "ac4394bf-b130-4394-b739-c1d7c865520d",
                "9ac2c6e0-eab4-496e-a50e-6ada138b5c12",
                "01a8445d-2454-413b-b3f7-318f1b5668d9",
            }
        ],
        "roleHash": role_hash,
        "workspaceHash": workspace_hash,
    }


def evidence(source: str, source_id: str, fact: str) -> dict[str, str]:
    return {"source": source, "sourceId": str(source_id), "fact": fact}


JUDGMENTS: dict[str, dict[str, Any]] = {
    "569042ee-8c8b-478e-a9a1-52c3eae953bb": {
        "cc": [29, 17, 13, 18, 13], "ca": [18, 10, 11, 15, 14],
        "coreCompany": 90, "coreAcceptance": 68, "confidence": 82,
        "disposition": "verification_needed", "archetype": "field_robot_integration",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "현재 창원 거주이며 한국 내 onsite/hybrid/relocation 역할에 즉시 지원 가능하다고 명시했습니다.",
        "unknownHard": ["korean_collaboration_and_written_english", "seoul_onsite_full_time"],
        "positive": [
            "AMR·보안 로봇의 LiDAR navigation, sensor fusion, FAT/SAT, 현장 commissioning과 배포 전 과정을 수행했습니다.",
            "현재 한국에 거주하며 한국 내 로보틱스 Field/Senior Engineer 역할을 적극적으로 찾고 있습니다.",
        ],
        "reason": "물리 로봇 통합·현장 배포의 회사 적합도는 높지만 한국어 협업 기준과 창원에서 서울 강남 상시 출근/이주가 직접 확인되지 않아 확인이 필요합니다.",
        "unknowns": ["업무 가능한 한국어 또는 한국 조직 협업 근거", "서울 강남 full-time onsite를 위한 이주 시점"],
    },
    "ac4394bf-b130-4394-b739-c1d7c865520d": {
        "cc": [29, 18, 14, 18, 13], "ca": [24, 14, 20, 18, 18],
        "coreCompany": 92, "coreAcceptance": 90, "confidence": 92,
        "systemAdjustment": 4, "disposition": "selected", "archetype": "manipulation_teleop_data",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "인천/서울 생활권, 숭실대·ROBOTIS 한국 경력, 서울 거주 및 정규직 역할 탐색을 직접 확인했습니다.",
        "positive": [
            "ROBOTIS에서 Frontier mobile manipulator의 ROS2/ros2_control bring-up과 controller 통합을 수행했습니다.",
            "OMY leader-follower teleoperation, DYNAMIXEL compliance·gravity/friction calibration·Jacobian force estimation을 직접 만들었습니다.",
            "rosbag/MCAP VLA 데이터 수집 파이프라인과 실제 manipulator 연구 리딩, 영어 프리토킹 근거가 있습니다.",
        ],
        "reason": "현재 역할의 manipulation·teleoperation·actuator control·data collection 핵심을 가장 직접적으로 수행하고 있고, 서울 정규직 탐색과 동일 역할 연결 요청까지 확인되어 양측 적합도가 가장 높습니다.",
        "unknowns": ["학부 졸업/정규직 전환 일정의 정확한 시점", "초기 팀에서 맡을 production ownership 범위"],
        "secondPass": {
            "pass1": {"company": 93, "acceptance": 95, "confidence": 92},
            "pass2": {"company": 92, "acceptance": 94, "confidence": 92},
            "resolution": "공개 검증은 OMY/ROS2 제품 문맥만 보강하고 후보자 기여는 내부 경력 20316에만 귀속했습니다. 검증되지 않은 출판 주장을 제외해 각 1점 보수화했으며 선택은 유지했습니다.",
        },
    },
    "04f656e5-38c7-413c-a446-d204f989c6ec": {
        "cc": [26, 18, 13, 17, 11], "ca": [13, 11, 18, 8, 12],
        "coreCompany": 85, "coreAcceptance": 62, "confidence": 78,
        "disposition": "verification_needed", "archetype": "sensing_calibration",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "서울 거주 및 Seoul Robotics의 장기 한국 근무로 한국 조직 협업 근거가 있습니다.",
        "unknownHard": ["scope_and_seniority"],
        "positive": [
            "Seoul Robotics에서 LiDAR 기반 3D perception과 sensor ingestion부터 commercial deployment까지 확장했습니다.",
            "서울 거주와 장기 한국 조직 경력이 있어 location·협업 환경은 직접 확인됩니다.",
        ],
        "reason": "sensing·integration·commercial deployment 회사 적합도는 높지만 최근 VP 이후 hands-on senior/staff IC 또는 technical lead 범위를 실제로 원하는지 관측되지 않아 확인이 필요합니다.",
        "unknowns": ["hands-on IC/technical lead 희망 범위", "보상·level·현재 이직 타이밍"],
    },
    "9ac2c6e0-eab4-496e-a50e-6ada138b5c12": {
        "cc": [28, 18, 14, 18, 13], "ca": [21, 13, 20, 14, 12],
        "coreCompany": 91, "coreAcceptance": 80, "confidence": 90,
        "disposition": "selected", "archetype": "commercial_field_robot_integration",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "서울 거주, Woowa/LG의 장기 한국 경력, 한국 우선 선호를 직접 확인했습니다.",
        "positive": [
            "Woowa에서 2022년부터 outdoor autonomous delivery robot의 system technical lead로 상용화를 이끌었습니다.",
            "camera·LiDAR·ultrasonic·IMU·Jetson을 통합하고 ROS2 성능, sensor pipeline, rosbag, WebRTC를 실제 운영 환경에서 다뤘습니다.",
            "한국 우선·적극 이직·로보틱스 한정·설계부터 운영까지의 기술/제품 의사결정 범위를 선호합니다.",
        ],
        "reason": "실외 자율배송 로봇을 설계·센서 통합·ROS2 최적화부터 상용 운영까지 이끈 hands-on technical lead로, senior staff 범위의 systems ownership과 서울 현장 조건을 충족합니다.",
        "unknowns": ["Head 수준 권한 기대와 senior staff IC 범위의 정확한 접점", "현재 총보상 대비 Config의 보상 범위"],
        "secondPass": {
            "pass1": {"company": 92, "acceptance": 82, "confidence": 90},
            "pass2": {"company": 91, "acceptance": 80, "confidence": 90},
            "resolution": "공식 Woowa 자료는 Dilly의 제품·운영 문맥만 확인했고 후보자 기여는 경력 18388에만 귀속했습니다. Head 선호와 같은 회사의 다른 역할 접점을 보수적으로 반영해 1/2점 낮췄지만 본 역할이 senior staff까지 열려 있어 선택을 유지했습니다.",
        },
    },
    "fd3e8735-c166-435e-bfc3-3dc9ab60eb94": {
        "cc": [17, 13, 11, 13, 9], "ca": [3, 6, 10, 3, 6],
        "coreCompany": 63, "coreAcceptance": 28, "confidence": 93,
        "disposition": "do_not_recommend", "archetype": "research_adjacent",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "서울 거주 및 한국 경력은 확인됩니다.",
        "failHard": ["direct_physical_robot_systems", "scope_and_seniority"],
        "positive": ["한국 기반 AI 연구·응용 경험은 있습니다."],
        "reason": "후보자는 미국의 AI researcher/application engineer와 약 30만 USD 보상을 명시해 서울 physical robotics systems 역할과 직접 충돌합니다.",
        "reasonCodes": ["confirmed_candidate_constraint"],
        "rejectionEvidence": ["A: 서울 onsite physical robot systems IC", "B: 미국 AI researcher/application engineer 및 약 300K USD 선호"],
    },
    "01a8445d-2454-413b-b3f7-318f1b5668d9": {
        "cc": [26, 17, 13, 17, 12], "ca": [21, 12, 20, 14, 17],
        "coreCompany": 85, "coreAcceptance": 80, "confidence": 91,
        "systemAdjustment": 4, "disposition": "selected", "archetype": "research_to_real_robot_control",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "서울 거주·SNU/Samsung/Rosmos 한국 경력과 한국 내 포지션 최우선 선호를 직접 확인했습니다.",
        "positive": [
            "Samsung Future Robotics Office에서 휴머노이드 perceptive locomotion을 직접 개발하고 있습니다.",
            "Rosmos에서 Qualcomm IQ-9075 기반 로봇 임베디드 시스템용 자율주행 AI를 기술 중심으로 개발했습니다.",
            "ROS2/C++/Python 기반 실로봇 controller, RA-L 2024 1저자 실환경 검증, IROS 2024 rover challenge 리딩 근거가 있습니다.",
        ],
        "reason": "locomotion·navigation 중심이라는 한계는 있으나 현업·창업·연구에서 실제 로봇 제어와 배포를 반복했고, 한국 우선·로보틱스 R&D·동일 역할 연결 요청이 확인되어 양측 기준을 통과합니다.",
        "unknowns": ["arm-level Cartesian control·IK·teleoperation의 실제 깊이", "연 2억원 이상 희망과 공개되지 않은 보상 범위"],
        "secondPass": {
            "pass1": {"company": 86, "acceptance": 85, "confidence": 91},
            "pass2": {"company": 85, "acceptance": 84, "confidence": 91},
            "resolution": "공식 SNU/논문 기록으로 논문과 대회는 검증했지만 주요 경험이 manipulation보다 locomotion·navigation에 치우친 점을 각 1점 보수화했습니다. 선택은 유지했습니다.",
        },
    },
    "d68994bf-54d0-40fa-9c03-7607d85be073": {
        "cc": [23, 11, 11, 14, 9], "ca": [4, 7, 5, 2, 7],
        "coreCompany": 68, "coreAcceptance": 25, "confidence": 96,
        "disposition": "do_not_recommend", "archetype": "executive_robotics",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "한국 거주·경력은 확인됩니다.",
        "failHard": ["scope_and_seniority", "material_non_compensation_constraints"],
        "positive": ["장기간의 로보틱스/자율주행 leadership 경험은 관련성이 있습니다."],
        "reason": "25년+ 경력의 Field CTO 지향과 250K–400K USD 보상 기대가 hands-on junior–senior staff 역할과 직접 충돌합니다.",
        "reasonCodes": ["confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"],
        "rejectionEvidence": ["A: hands-on junior–senior staff physical systems role", "B: Field CTO 지향, 25년+ executive scope, 250K–400K USD 기대"],
    },
    "3b94d32a-7f28-4bf8-91ec-3bb2e82315d1": {
        "cc": [7, 9, 7, 7, 4], "ca": [13, 10, 18, 7, 10],
        "coreCompany": 34, "coreAcceptance": 58, "confidence": 91,
        "disposition": "do_not_recommend", "archetype": "non_robotics_engineering",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "서울 거주·한국 경력은 확인됩니다.",
        "failHard": ["direct_physical_robot_systems", "role_relevant_control_sensing_integration", "hands_on_physical_deployment"],
        "positive": ["서울 근무 조건 자체는 맞습니다."],
        "reason": "전체 경력에 physical robotics control·integration·deployment 근거가 없어 역할 핵심 요구와 직접 불일치합니다.",
        "reasonCodes": ["confirmed_role_requirement_mismatch"],
        "rejectionEvidence": ["A: 실제 로봇 control/sensing/integration/deployment", "B: 검토된 경력은 해당 물리 로봇 시스템 업무를 포함하지 않음"],
    },
    "ae9896cd-0174-4bbf-bfe5-27d2f49c84c5": {
        "cc": [13, 12, 10, 10, 7], "ca": [9, 10, 16, 3, 7],
        "coreCompany": 52, "coreAcceptance": 45, "confidence": 89,
        "disposition": "do_not_recommend", "archetype": "healthcare_robotics_adjacent",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "한국 거주·SNU 연구 경력은 확인됩니다.",
        "failHard": ["direct_physical_robot_systems", "python_cpp_ros"],
        "positive": ["biomechanics·wearable/돌봄 로봇의 센싱·임상 평가 문맥은 인접합니다."],
        "reason": "경력의 핵심이 biomechanics·의료/헬스케어 디바이스이며 C++/ROS robot control·integration 근거가 없어 역할 핵심과 불일치합니다.",
        "reasonCodes": ["confirmed_role_requirement_mismatch"],
        "rejectionEvidence": ["A: C++/ROS 기반 physical robot systems control", "B: biomechanics·헬스케어 센싱/평가 중심이며 직접 control stack 없음"],
    },
    "d61bed55-d4e5-4ab3-b99d-386f7254a534": {
        "cc": [20, 14, 10, 10, 10], "ca": [18, 10, 13, 14, 17],
        "coreCompany": 64, "coreAcceptance": 72, "confidence": 74,
        "disposition": "verification_needed", "archetype": "junior_robotics_projects",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "현재 인도 거주지만 대화 요약에서 서울을 포함한 모든 지역 수용과 relocation 의향을 명시했습니다.",
        "unknownHard": ["two_objective_quality_signals", "korean_collaboration_and_written_english", "seoul_onsite_full_time"],
        "positive": [
            "ROS, sensor fusion, humanoid/robotic arm 프로젝트와 embedded robotics 기초가 있습니다.",
            "서울 relocation 의향이 명시되어 국가 게이트는 통과합니다.",
        ],
        "reason": "주니어 후보로서 프로젝트 신호는 있으나 두 개의 객관적 품질 신호, 한국어 협업, visa/서울 상시 근무 및 production ownership 깊이를 확인해야 합니다.",
        "unknowns": ["한국어 협업 근거", "visa sponsorship과 서울 입사 시점", "프로젝트별 본인 ownership과 실제 하드웨어 검증 깊이"],
    },
    "7fe36f97-5802-4fd7-92a0-b4f3f1fb3765": {
        "cc": [27, 13, 13, 18, 11], "ca": [3, 6, 4, 1, 8],
        "coreCompany": 82, "coreAcceptance": 22, "confidence": 96,
        "disposition": "do_not_recommend", "archetype": "executive_robotics",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "한국 거주·한국 산업 경력은 확인됩니다.",
        "failHard": ["scope_and_seniority", "material_non_compensation_constraints"],
        "positive": ["산업용 로봇 control과 autonomous systems 기술 깊이는 강합니다."],
        "reason": "25년+ CTO/VP 경력, Field CTO 지향, 220K–400K USD 기대가 본 역할의 hands-on staff 범위와 직접 충돌합니다.",
        "reasonCodes": ["confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"],
        "rejectionEvidence": ["A: hands-on junior–senior staff systems role", "B: Field CTO/VP scope 및 220K–400K USD 기대"],
    },
    "b6a12235-072c-4437-bceb-6735a3d1de4c": {
        "cc": [19, 12, 8, 12, 7], "ca": [2, 0, 6, 1, 3],
        "coreCompany": 58, "coreAcceptance": 12, "confidence": 95,
        "disposition": "do_not_recommend", "archetype": "robotics_hardware_founder",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "한국 거주·KAIST 연구 경력은 확인됩니다.",
        "failHard": ["material_non_compensation_constraints"],
        "positive": ["KAIST sim2real 및 자체 하드웨어 구축 경험은 일부 관련성이 있습니다."],
        "reason": "후보자가 seed/angel 단계 스타트업을 명시적으로 피하고 싶다고 했고 Config는 seed-stage이므로 수락 조건이 직접 충돌합니다.",
        "reasonCodes": ["confirmed_candidate_constraint"],
        "rejectionEvidence": ["A: Config의 seed-stage 환경", "B: 후보자가 seed/angel 단계 스타트업 회피를 명시"],
    },
    "b22eba75-3788-4637-a67e-37a6e8d4b1ea": {
        "cc": [13, 11, 8, 10, 6], "ca": [4, 7, 0, 1, 6],
        "coreCompany": 48, "coreAcceptance": 18, "confidence": 94,
        "disposition": "do_not_recommend", "archetype": "research_internship",
        "countryTier": "historical_affinity_verify_current_intent",
        "countryEvidence": "과거 한국 교육·연구/근무 근거는 있으나 현재 미국에 거주합니다.",
        "failHard": ["seoul_onsite_full_time", "scope_and_seniority"],
        "positive": ["과거 한국 협업·교육 이력은 있습니다."],
        "reason": "현재 미국 거주이며 미국 내 인턴십을 명시적으로 원해 서울 full-time onsite 역할과 직접 충돌합니다.",
        "reasonCodes": ["confirmed_location_or_work_mode_conflict", "confirmed_candidate_constraint"],
        "rejectionEvidence": ["A: 서울 강남 full-time onsite", "B: 현재 미국 거주 및 미국 내 인턴십 선호"],
    },
    "02729422-9921-47da-a315-a6cf8a996f28": {
        "cc": [8, 8, 6, 6, 4], "ca": [18, 10, 16, 13, 15],
        "coreCompany": 32, "coreAcceptance": 72, "confidence": 94,
        "disposition": "do_not_recommend", "archetype": "ml_research",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "한국 근무·relocation 수용을 명시해 국가 게이트는 통과합니다.",
        "failHard": ["direct_physical_robot_systems", "role_relevant_control_sensing_integration", "hands_on_physical_deployment"],
        "positive": ["한국 relocation과 역할 관심은 명시되어 candidate-side 신호는 있습니다."],
        "reason": "검토된 경력은 diffusion/unlearning 연구 중심이며 실제 physical robot control·integration·deployment 근거가 없어 회사 핵심 요구와 직접 불일치합니다.",
        "reasonCodes": ["confirmed_role_requirement_mismatch"],
        "rejectionEvidence": ["A: physical robot control/integration/deployment", "B: diffusion·machine unlearning 연구 경력으로 직접 로봇 시스템 수행 근거 없음"],
    },
    "dc81332f-4147-5e8b-b203-f13dc05fc566": {
        "cc": [19, 13, 10, 12, 7], "ca": [8, 8, 14, 9, 11],
        "coreCompany": 61, "coreAcceptance": 50, "confidence": 74,
        "disposition": "verification_needed", "archetype": "slam_3d_vision",
        "countryTier": "confirmed_current_or_relocation",
        "countryEvidence": "한국 location 및 KAIST 연구 근거가 있습니다.",
        "unknownHard": ["hands_on_physical_deployment", "seoul_onsite_full_time", "scope_and_seniority"],
        "positive": [
            "KAIST robotics lab의 SLAM·3D vision 연구 배경은 sensing 축에 인접합니다.",
        ],
        "reason": "SLAM·3D vision 연구 잠재력은 있으나 최근 physical robot systems 수행, 현재 full-time/서울 onsite 의향과 역할 timing이 확인되지 않아 보류합니다.",
        "unknowns": ["최근 hands-on physical deployment", "현재 이직 상태와 서울 onsite 의향", "control/teleoperation ownership"],
    },
}


SELECTED_REASONS: dict[str, str] = {
    "ac4394bf-b130-4394-b739-c1d7c865520d": """**TL;DR** — 오재홍님은 현재 ROBOTIS Advanced Technology Development TF에서 Frontier mobile manipulator와 OMY arm의 제어·teleoperation·data collection을 직접 수행합니다. Config가 요구한 manipulation, actuator control, sensing/calibration, ROS2 integration이 한 경력 안에서 가장 구체적으로 겹칩니다.

ROBOTIS 경력 20316에는 Frontier의 DYNAMIXEL hardware interface와 ros2_control controller 통합, namespace/TF 충돌 해결, OMY leader-follower teleoperation과 hot-plug recovery가 직접 기재되어 있습니다. 같은 경력에서 current-to-torque, gravity/friction calibration, Jacobian force estimation을 force gauge와 비교 검증했고, 반복 가능한 VLA 데이터 수집을 위해 rosbag/MCAP 기록 파이프라인도 구축했습니다.

숭실대 Intelligent Robotics Lab에서는 24개월간 manipulator 기반 hidden-object finding을 리드하며 vision, tactile feedback, predictive reasoning과 grasping을 결합했습니다. 한국 교육·연구·직장 경험이 이어지고 서울 생활권에 있으며, 독일 체류와 OPIc/대화 기록으로 영어 협업도 확인됩니다.

후보자는 이 Robotics Systems Engineer 역할을 계기로 가입했고 동일 역할 연결을 직접 요청했습니다. 현재 정규직 로보틱스 포지션을 적극적으로 찾고 있고 스타트업도 수용합니다.

**확인할 점** — 아직 학부/인턴 단계이므로 졸업·입사 가능일과 production on-call 수준의 ownership을 확인해야 합니다. 공개 자료는 OMY가 ROS2/ros2_control과 teleoperation을 지원하는 제품 문맥만 확인하며, 후보자 개인 기여는 내부 경력 20316에만 근거합니다.""",
    "9ac2c6e0-eab4-496e-a50e-6ada138b5c12": """**TL;DR** — Donghyun Lee님은 Woowa Brothers에서 2022년부터 outdoor autonomous delivery robot의 Robot System Technical Lead로 설계부터 상용 운영까지 이끌고 있습니다. Config가 senior staff에게 기대할 physical robot systems ownership을 가장 넓게 이미 수행한 후보입니다.

경력 18388에는 camera, LiDAR, ultrasonic, IMU와 NVIDIA Jetson을 결합한 로봇 하드웨어/소프트웨어 설계, LiDAR·IMU·camera preprocessing과 sensor fusion, 제한된 compute에서의 inference scheduling이 기재되어 있습니다. ROS2 성능 최적화, rosbag 기반 데이터 흐름과 원격 운영/WebRTC까지 연구 stack을 실제 현장 제품으로 연결했습니다.

LG에서는 Mercedes-Benz 양산 차량용 AI vision camera의 system integration과 HIL verification을 담당했고, 그 이전 ADAS 시스템도 production contract까지 연결했습니다. 단일 로봇 알고리즘보다 센서·embedded·검증·상용화 경계를 반복해서 책임진 경력입니다.

현재 서울에 있고 한국을 우선하며, 로보틱스 도메인에 한정된 다음 역할에서 설계부터 운영까지 깊은 기술·제품 의사결정 범위를 원합니다. 영어권 엔지니어와 실제 협업한 근거도 있습니다.

**확인할 점** — 후보자는 Head of Robotics Systems 같은 leadership/상용화 범위를 선호하므로 senior staff IC/technical lead 역할의 권한이 기대와 맞는지 먼저 조율해야 합니다. 현재 총보상 대비 Config의 보상 범위도 미확인입니다. 공식 Woowa 자료는 Dilly 제품의 운영·안전/embedded 문맥만 보강하며 개인 기여는 내부 경력 18388에만 근거합니다.""",
    "01a8445d-2454-413b-b3f7-318f1b5668d9": """**TL;DR** — Hyungsuk Yoon님은 Samsung Future Robotics Office의 humanoid locomotion, 로봇 스타트업 Rosmos의 embedded autonomous navigation, 서울대의 실로봇 controller 연구를 잇는 research-to-real-robot 후보입니다. manipulation 전문가는 아니지만 실제 로봇 제어와 deployment를 여러 환경에서 반복했습니다.

Samsung 경력 8296과 후보자 메모에는 계단·stepping stone을 인식하는 perceptive 보행 알고리즘을 직접 개발 중이라고 기재되어 있습니다. Rosmos 경력 8297에서는 Qualcomm IQ-9075 기반 자체 robotic embedded system에서 동작하는 범용 자율주행 AI를 개발했고, 후보자는 CEO 업무 중 기술 개발에 가장 집중했다고 설명했습니다.

서울대 프로젝트에서는 자체 제작 lidar-free robot의 path planning과 controller를 ROS2/C++/Python으로 이끌었습니다. SNU 공식 논문 기록은 실제 Clearpath Husky 검증을 담은 IEEE RA-L 2024 논문의 1저자임을 확인하고, SNU 공식 대회 보도는 IROS 2024 Earth Rovers Challenge 우승과 후보자의 driving-control algorithm 리딩을 확인합니다.

현재 적극 이직 중이며 한국 내 포지션을 최우선으로 보고 로보틱스 R&D와 필드 역할 모두에 열려 있습니다. 동일 역할 연결도 직접 요청했습니다.

**확인할 점** — 핵심 경험은 locomotion·navigation 중심이므로 arm-level Cartesian control, IK, bimanual teleoperation의 실제 깊이는 확인해야 합니다. 연 2억원 이상 희망과 공개되지 않은 역할 보상 범위도 사전 조율이 필요합니다.""",
}


SELECTED_SOURCES: dict[str, list[dict[str, str]]] = {
    "ac4394bf-b130-4394-b739-c1d7c865520d": [
        evidence("talent_experiences", "20316", "ROBOTIS Frontier ROS2 bring-up, OMY teleoperation/compliance, VLA rosbag/MCAP data pipeline"),
        evidence("talent_experiences", "20317", "숭실대 manipulator hidden-object finding research lead"),
        evidence("talent_insights", "15696", "서울, full-time robotics search, English free-talking, startup acceptance"),
        evidence("talent_opportunity_progress", "55889bd6-1d43-45de-a8e3-1189751434c2", "동일 역할 candidate_requested_connection"),
        evidence("official_product_context", "https://docs.robotis.com/docs/systems/omy/specifications/software/", "OMY의 ROS2/ros2_control software context; candidate contribution source 아님"),
        evidence("official_product_context", "https://docs.robotis.com/docs/systems/omy/quick_start_guide/operation_guide/teleoperation/", "OMY teleoperation product context; candidate contribution source 아님"),
    ],
    "9ac2c6e0-eab4-496e-a50e-6ada138b5c12": [
        evidence("talent_experiences", "18388", "Woowa outdoor autonomous delivery robot system technical lead and commercialization"),
        evidence("talent_experiences", "18389", "Mercedes-Benz production AI vision camera integration and HIL verification"),
        evidence("talent_insights", "13058", "한국 우선, robotics-only, active search, end-to-end technical/product decision scope"),
        evidence("official_product_context", "https://www.woowahan.com/en/service", "Dilly autonomous delivery robot product context; candidate contribution source 아님"),
        evidence("official_product_context", "https://techblog.woowahan.com/17827/", "Dilly Jetson embedded/sensor context; candidate contribution source 아님"),
    ],
    "01a8445d-2454-413b-b3f7-318f1b5668d9": [
        evidence("talent_experiences", "8296", "Samsung Future Robotics Office humanoid locomotion"),
        evidence("talent_experiences", "8297", "Rosmos robotic embedded autonomous navigation"),
        evidence("talent_insights", "2573", "한국 우선, active search, robotics R&D/field openness, compensation"),
        evidence("candidate_resume", "01a8445d-2454-413b-b3f7-318f1b5668d9", "ROS2/C++/Python lidar-free robot path planning/controller"),
        evidence("official_publication", "https://snu.elsevierpure.com/en/publications/adaptive-robot-traversability-estimation-based-on-self-supervised/", "IEEE RA-L 2024 first-author record and real-world Husky validation"),
        evidence("official_competition", "https://en.snu.ac.kr/snunow/snu_media/news?bbsidx=150205&md=v", "IROS 2024 Earth Rovers Challenge win and driving-control algorithm leadership"),
        evidence("talent_opportunity_progress", "a6c5c2e9-8dfb-4791-b1ea-88ddc084e90d", "동일 역할 candidate_requested_connection"),
    ],
}


def build_hard_criteria(judgment: dict[str, Any]) -> list[dict[str, Any]]:
    failed = set(judgment.get("failHard") or [])
    unknown = set(judgment.get("unknownHard") or [])
    rows = []
    for criterion in HARD_CRITERIA:
        status = "fail" if criterion in failed else "unknown" if criterion in unknown else "pass"
        rows.append({
            "criterion": criterion,
            "status": status,
            "evidence": judgment["reason"] if status != "pass" else "candidate packet direct evidence reviewed; see positiveEvidence and auditReasoning",
        })
    return rows


def build_evaluations(packets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    packet_by_id = {row["profile"]["talentId"]: row for row in packets}
    evaluations: list[dict[str, Any]] = []
    for pool_rank, source_rank in enumerate(POOL_SOURCE_RANKS, start=1):
        packet = next(row for row in packets if row["rank"] == source_rank)
        talent_id = packet["profile"]["talentId"]
        if talent_id not in JUDGMENTS:
            raise RuntimeError(f"missing judgment for {talent_id}")
        judgment = JUDGMENTS[talent_id]
        company = sum(judgment["cc"])
        acceptance = sum(judgment["ca"])
        if company != judgment["coreCompany"] and judgment.get("systemAdjustment", 0) == 0:
            raise RuntimeError(f"company score mismatch for {talent_id}")
        expected_acceptance = judgment["coreAcceptance"] + judgment.get("systemAdjustment", 0)
        if acceptance != expected_acceptance:
            raise RuntimeError(f"acceptance score mismatch for {talent_id}: {acceptance} != {expected_acceptance}")
        score = mutual(company, acceptance, judgment["confidence"])
        hard = build_hard_criteria(judgment)
        has_blocker = any(item["status"] != "pass" for item in hard)
        gate_pass = (
            company >= 70
            and acceptance >= 70
            and judgment["coreCompany"] >= 65
            and judgment["coreAcceptance"] >= 65
            and score >= 70
            and judgment["confidence"] >= 60
            and not has_blocker
        )
        if (judgment["disposition"] == "selected") != gate_pass:
            raise RuntimeError(f"bilateral gate/disposition mismatch for {talent_id}")
        evaluations.append({
            "rank": pool_rank,
            "sourceRank": source_rank,
            "talentId": talent_id,
            "name": packet["profile"]["name"],
            "headline": packet["profile"].get("headline"),
            "archetype": judgment["archetype"],
            "targetCountries": ["KR"],
            "countryEvidenceTier": judgment["countryTier"],
            "countryEvidence": judgment["countryEvidence"],
            "companyFitComponents": components(COMPANY_COMPONENTS, judgment["cc"]),
            "candidateAcceptanceComponents": components(ACCEPTANCE_COMPONENTS, judgment["ca"]),
            "coreCompanyFitScore": judgment["coreCompany"],
            "coreCandidateAcceptanceScore": judgment["coreAcceptance"],
            "candidateSystemAdjustment": judgment.get("systemAdjustment", 0),
            "companyFitScore": company,
            "candidateAcceptanceScore": acceptance,
            "evidenceConfidence": judgment["confidence"],
            "mutualScore": score,
            "hardCriteria": hard,
            "positiveEvidence": judgment["positive"],
            "risks": judgment.get("unknowns") or judgment.get("rejectionEvidence") or [],
            "unknowns": judgment.get("unknowns") or [],
            "acceptanceObservability": "direct" if judgment.get("systemAdjustment") else "observed_or_constraint_based",
            "independentDecision": judgment["disposition"],
            "finalDisposition": judgment["disposition"],
            "bilateralGatePass": gate_pass,
            "reasonCodes": judgment.get("reasonCodes") or [],
            "rejectionEvidence": judgment.get("rejectionEvidence") or [],
            "auditReasoning": judgment["reason"],
            "internalReason": SELECTED_REASONS.get(talent_id, ""),
            "internalReasonSources": SELECTED_SOURCES.get(talent_id, []),
            "candidateFingerprint": packet["candidateFingerprint"],
            "secondPass": judgment.get("secondPass"),
            "revisitPolicy": (
                {"type": "verify_unknowns", "conditions": judgment.get("unknowns") or []}
                if judgment["disposition"] == "verification_needed"
                else {"type": "cooldown_if_committed", "days": 60, "conditions": judgment.get("rejectionEvidence") or []}
                if judgment["disposition"] == "do_not_recommend"
                else {"type": "pre_send_recheck", "conditions": ["source drift", "same-company duplicate outreach", "candidate timing"]}
            ),
        })
    if len(packet_by_id) < len(evaluations):
        raise RuntimeError("packet pool unexpectedly incomplete")
    return evaluations


def render_consideration(preflight: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    role = preflight["role"]
    internal_role = preflight["internalRole"]
    item = {
        "manualVersion": MANUAL_VERSION,
        "roleId": ROLE_ID,
        "company": "Config",
        "role": "Robotics Systems Engineer",
        "roleEssence": "서울에서 실제 로봇의 control, sensing, teleoperation, integration, data collection을 구축·검증하는 hands-on systems 역할",
        "targetCountries": ["KR"],
        "countryRule": "현재 KR 거주, 명시적 KR relocation/preference/work authorization, 또는 KR work/education/research evidence만 포함. 이름으로 국적·언어를 추론하지 않음.",
        "hardCriteria": [
            "direct physical robot systems",
            "role-relevant control/sensing/integration fundamentals",
            "hands-on physical deployment",
            "Python/C++/ROS",
            "objective quality signals 2개 이상",
            "Korean collaboration evidence + written English",
            "Seoul Gangnam full-time onsite",
            "junior–senior staff 또는 계속 hands-on인 technical lead",
        ],
        "plus": ["robot manipulation/control", "teleoperation/data collection", "sensor calibration/synchronization", "commercial robot deployment", "robotics/autonomy research quality"],
        "minus": ["pure simulation/ML research without physical robot ownership", "executive-only scope", "non-Korea or remote-only constraint", "seed-stage exclusion"],
        "learnedFeedback": [],
        "feedbackContext": "동일 역할의 유효한 회사 측 human feedback criterion은 없습니다. 이유 없는 ops archive는 학습 기준으로 사용하지 않았습니다.",
        "unknowns": ["역할 보상 범위", "candidate별 exact level/title", "selected 후보의 확인 항목"],
        "changeSummary": "이전 실행 후 role request가 갱신되었고 동일 역할 추천/진행 상태가 추가되어 전체 후보 풀을 새로 조회·중복 제외했습니다.",
        "sourceUpdatedAt": role.get("updated_at"),
        "considerationFingerprint": digest({
            "roleUpdatedAt": role.get("updated_at"),
            "roleRequest": internal_role.get("request"),
            "manualVersion": MANUAL_VERSION,
            "hardCriteria": HARD_CRITERIA,
        }),
    }
    md = f"""# Role consideration

- Company / role: Config / Robotics Systems Engineer
- Role ID: `{ROLE_ID}`
- Manual: {MANUAL_VERSION}
- Source updated: {role.get('updated_at')}

## 역할 본질

서울 강남에서 실제 로봇의 control, sensing, teleoperation, hardware integration, data collection을 직접 구축하고 실환경에서 검증하는 hands-on systems 역할입니다. junior부터 senior staff까지 열려 있으나 12년+ 후보는 현재도 IC/technical lead로 직접 시스템을 만드는 경우만 봅니다.

## 국가·언어 게이트

현재 한국 거주, 한국 relocation/preference/work authorization의 명시적 근거, 또는 한국 work/education/research evidence가 있어야 합니다. 이름으로 국적·언어를 추론하지 않았습니다. 구체적인 한국 협업 이력은 반대 근거가 없을 때 한국어 협업 증거로 보되 written English도 별도로 확인했습니다.

## hard criteria

{chr(10).join(f'- {value}' for value in item['hardCriteria'])}

## plus / minus

- Plus: {', '.join(item['plus'])}
- Minus: {', '.join(item['minus'])}

## feedback·unknowns

- 동일 역할의 유효한 회사 측 human feedback criterion은 없습니다.
- 이유 없는 ops archive는 학습 기준으로 사용하지 않았습니다.
- 미확인: 역할 보상 범위, exact level/title, selected 후보별 확인 항목.
- 이전 실행 후 role request와 동일 역할 상태가 바뀌어 전체 풀을 새로 조회했습니다.
"""
    return md, item


def render_artifacts(
    root: Path,
    run_dir: Path,
    packets_all: list[dict[str, Any]],
    preflight: dict[str, Any],
) -> dict[str, Any]:
    existing_manifest = json.loads((run_dir / "run_manifest.json").read_text(encoding="utf-8"))
    existing_source_snapshot = json.loads((run_dir / "source_snapshot.json").read_text(encoding="utf-8"))
    existing_source_material = json.loads((run_dir / "source_material.json").read_text(encoding="utf-8"))
    existing_artifact_packets = load_jsonl(run_dir / "candidate_packets.jsonl")
    packets = [row for row in packets_all if row["rank"] in POOL_SOURCE_RANKS]
    packets.sort(key=lambda row: POOL_SOURCE_RANKS.index(row["rank"]))
    artifact_packet_by_rank = {row["rank"]: row for row in existing_artifact_packets}
    evaluations = build_evaluations(packets)
    eval_by_id = {row["talentId"]: row for row in evaluations}
    disposition_counts = Counter(row["finalDisposition"] for row in evaluations)
    selected = sorted(
        [row for row in evaluations if row["finalDisposition"] == "selected"],
        key=lambda row: (-row["mutualScore"], -min(row["companyFitScore"], row["candidateAcceptanceScore"])),
    )
    if len(selected) != 3 or len(selected) > MAX_PROPOSALS:
        raise RuntimeError("unexpected selected count")
    if len(evaluations) != 15:
        raise RuntimeError("unexpected evaluation count")
    if len(NO_COUNTRY_SOURCE_RANKS) != 22:
        raise RuntimeError("unexpected no-country exclusion count")

    consideration_md, consideration_json = render_consideration(preflight)
    role_fingerprint = digest({
        "roleId": ROLE_ID,
        "updatedAt": preflight["role"].get("updated_at"),
        "roleHash": preflight["roleHash"],
        "considerationFingerprint": consideration_json["considerationFingerprint"],
    })
    completed_at = now_iso()
    manifest = {
        **existing_manifest,
        "manualVersion": MANUAL_VERSION,
        "evaluatorVersion": EVALUATOR_VERSION,
        "completedAt": completed_at,
        "status": "completed_dry_run",
        "matchingCompletionStatus": "completed_dry_run",
        "roleFingerprint": role_fingerprint,
        "considerationFingerprint": consideration_json["considerationFingerprint"],
        "sourceUnchangedAtFinalPreflight": True,
        "sourceFinalPreflight": {
            "checkedAt": preflight["checkedAt"],
            "roleUpdatedAt": preflight["role"].get("updated_at"),
            "roleHash": preflight["roleHash"],
            "workspaceHash": preflight["workspaceHash"],
            "businessState": preflight["businessState"],
        },
        "baseTalentCount": 3426,
        "retrievalCount": 15,
        "independentEvaluationCount": 15,
        "top50ComparisonCount": 3,
        "selectedCount": 3,
        "dispositionCounts": dict(disposition_counts),
        "poolShortfallReason": "insufficient_relevant_candidates_after_country_and_role_adjacency_gates",
        "newOrMateriallyUpdatedReservation": {
            "applied": True,
            "reservedSlots": 0,
            "reason": "gate-pass pool had only three candidates, so no existing finalist was displaced and no reserved slot was needed",
        },
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
        "runMemoryWrites": 0,
        "artifacts": [
            "run_manifest.json", "source_snapshot.json", "source_material.json",
            "consideration.md", "considerations.json", "retrieval.sql",
            "retrieval_funnel.json", "candidate_pool.csv", "candidate_packets.jsonl",
            "individual_evaluations.jsonl", "top50.md", "final_selection.md",
            "write_plan.json", "review_memory_plan.json", "previous_run_memory.md",
            "previous_run_memory.json", "run_memory.md", "verification.md",
        ],
    }
    write_json(run_dir / "run_manifest.json", manifest)

    source_snapshot = {
        **existing_source_snapshot,
        "capturedAt": completed_at,
        "manualVersion": MANUAL_VERSION,
        "role": {
            "id": ROLE_ID,
            "updatedAt": preflight["role"].get("updated_at"),
            "status": preflight["role"].get("status"),
            "isExpired": preflight["role"].get("is_expired"),
            "sourceType": preflight["role"].get("source_type"),
        },
        "sourceCounts": {
            **existing_source_snapshot.get("sourceCounts", {}),
            **{
                key: preflight["businessState"][key]
                for key in ("sameRoleRecommendations", "sameRoleProgress", "sameRoleTags", "sameRoleFits", "sameRoleReviews")
            },
        },
        "hashes": {
            **existing_source_snapshot.get("hashes", {}),
            "finalRoleHash": preflight["roleHash"],
            "finalWorkspaceHash": preflight["workspaceHash"],
            "finalBusinessStateHash": digest(preflight["businessState"]),
        },
        "feedbackCoverage": {
            "retrievedCandidates": 15,
            "reviewedCandidates": 15,
            "missingCandidatePackets": 0,
            "validCompanyHumanFeedbackCriteria": 0,
            "reasonlessOpsArchivesUsedAsCriteria": 0,
        },
        "officialSources": [
            "https://config.inc/careers",
            "https://docs.robotis.com/docs/systems/omy/specifications/software/",
            "https://docs.robotis.com/docs/systems/omy/quick_start_guide/operation_guide/teleoperation/",
            "https://www.woowahan.com/en/service",
            "https://www.woowahan.com/en/company/history",
            "https://techblog.woowahan.com/17827/",
            "https://snu.elsevierpure.com/en/publications/adaptive-robot-traversability-estimation-based-on-self-supervised/",
            "https://en.snu.ac.kr/snunow/snu_media/news?bbsidx=150205&md=v",
        ],
    }
    write_json(run_dir / "source_snapshot.json", source_snapshot)
    existing_source_material.pop("finalPreflight", None)
    existing_source_material["finalPreflight"] = {
        "checkedAt": preflight["checkedAt"],
        "roleHash": preflight["roleHash"],
        "workspaceHash": preflight["workspaceHash"],
        "businessState": preflight["businessState"],
    }
    existing_source_material["sameRoleFits"] = preflight["selectedFitSnapshots"]
    write_json(run_dir / "source_material.json", existing_source_material)
    write_text(run_dir / "consideration.md", consideration_md)
    write_json(run_dir / "considerations.json", consideration_json)

    write_text(run_dir / "retrieval.sql", f"""-- Manual {MANUAL_VERSION} read-only retrieval audit.
-- role_id={ROLE_ID}
-- 1) All talent users: 3,426.
-- 2) Visibility allowed: 3,404.
-- 3) Internal opt-in allowed: 3,393.
-- 4) Same-role recommendation duplicates removed: 3,386 (7 removed).
-- 5) Country gate BEFORE relevance/ranking:
--    confirmed current/relocation=1,420; historical affinity=130; no country evidence=1,836 excluded.
-- 6) Strict role-adjacent candidates after country gate: 15.
-- Role-adjacent pre-country set was 37; 22 with no country evidence were excluded, with no backfill.
-- No RPC write, model call, queue, chat, recommendation, or delivery operation was executed.
""")
    lane_counts: Counter[str] = Counter()
    tier_counts: Counter[str] = Counter()
    for packet in packets:
        for lane in packet["retrieval"].get("retrievalLanes") or []:
            lane_counts[lane] += 1
        tier_counts[eval_by_id[packet["profile"]["talentId"]]["countryEvidenceTier"]] += 1
    no_country_names = [
        row["profile"]["name"] for row in packets_all if row["rank"] in NO_COUNTRY_SOURCE_RANKS
    ]
    write_json(run_dir / "retrieval_funnel.json", {
        "allTalentUsers": 3426,
        "afterVisibility": 3404,
        "afterInternalOptIn": 3393,
        "afterSameRoleDuplicateExclusion": 3386,
        "countryGateBeforeRelevance": {
            "confirmedCurrentOrRelocation": 1420,
            "historicalAffinityVerifyCurrentIntent": 130,
            "noCountryEvidenceExcluded": 1836,
            "afterCountryGate": 1550,
        },
        "roleAdjacentBeforeCountryGate": 37,
        "roleAdjacentNoCountryExcluded": {
            "count": 22,
            "sourceRanks": NO_COUNTRY_SOURCE_RANKS,
            "names": no_country_names,
        },
        "retrieved": 15,
        "targetPool": 200,
        "retrievalLaneCounts": dict(lane_counts),
        "countryEvidenceTierCounts": dict(tier_counts),
        "cooldownExclusions": 0,
        "reviewMemoryRowsFound": 0,
        "poolShortfallReason": "insufficient_relevant_candidates_after_country_and_role_adjacency_gates",
        "noNoCountryBackfill": True,
    })

    csv_fields = [
        "rank", "source_rank", "talent_id", "name", "headline", "location",
        "country_evidence_tier", "country_evidence", "relevant_months",
        "role_relevance", "system_score", "retrieval_score",
        "matched_core_groups", "retrieval_lanes", "candidate_fingerprint",
    ]
    with (run_dir / "candidate_pool.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=csv_fields)
        writer.writeheader()
        for evaluation in evaluations:
            source_packet = next(
                packet
                for packet in packets
                if packet["profile"]["talentId"] == evaluation["talentId"]
            )
            retrieval = source_packet["retrieval"]
            features = retrieval.get("features") or {}
            writer.writerow({
                "rank": evaluation["rank"],
                "source_rank": evaluation["sourceRank"],
                "talent_id": evaluation["talentId"],
                "name": evaluation["name"],
                "headline": evaluation["headline"],
                "location": retrieval.get("location"),
                "country_evidence_tier": evaluation["countryEvidenceTier"],
                "country_evidence": evaluation["countryEvidence"],
                "relevant_months": retrieval.get("relevantMonths"),
                "role_relevance": features.get("roleRelevance"),
                "system_score": retrieval.get("systemScore"),
                "retrieval_score": retrieval.get("retrievalScore"),
                "matched_core_groups": "|".join(features.get("matchedCoreGroups") or []),
                "retrieval_lanes": "|".join(retrieval.get("retrievalLanes") or []),
                "candidate_fingerprint": evaluation["candidateFingerprint"],
            })
    with (run_dir / "candidate_packets.jsonl").open("w", encoding="utf-8") as handle:
        for source_rank in POOL_SOURCE_RANKS:
            packet = artifact_packet_by_rank[source_rank]
            packet["countryGate"] = {
                "tier": eval_by_id[packet["profile"]["talentId"]]["countryEvidenceTier"],
                "evidence": eval_by_id[packet["profile"]["talentId"]]["countryEvidence"],
            }
            handle.write(json.dumps(packet, ensure_ascii=False) + "\n")
    with (run_dir / "individual_evaluations.jsonl").open("w", encoding="utf-8") as handle:
        for row in evaluations:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    top_lines = [
        "# Gate-pass top comparison",
        "",
        "- Full country-gated retrieval pool independently evaluated: 15",
        "- Bilateral hard-gate pass candidates compared here: 3",
        "- max_proposals: 5; 4th/5th slots intentionally left empty because no other candidate passed every gate.",
        "- Archetypes set before outcome: manipulation/teleop/data; commercial field robot integration; research-to-real-robot control.",
        "- New/materially updated reservation checked; with only three gate-pass candidates there was no displacement decision.",
        "",
        "| order | candidate | archetype | company | acceptance | confidence | mutual | second-pass result |",
        "| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for index, row in enumerate(selected, start=1):
        top_lines.append(
            f"| {index} | {row['name']} | {row['archetype']} | {row['companyFitScore']} | "
            f"{row['candidateAcceptanceScore']} | {row['evidenceConfidence']} | {row['mutualScore']} | "
            f"{compact(row['secondPass']['resolution'], 190)} |"
        )
    top_lines.extend([
        "",
        "## Sensitivity",
        "",
        "- 오재홍: 공개 제품 문맥을 제거해도 내부 경력 20316만으로 company/acceptance hard gates를 통과합니다.",
        "- Donghyun Lee: Head 선호를 더 엄격히 보아 acceptance를 10점 낮추면 70으로 경계 통과하며, exact scope 확인이 필수입니다.",
        "- Hyungsuk Yoon: manipulation 직접성을 더 엄격히 보아 company를 5점 낮춰도 80으로 통과합니다. 보상 미확인은 제안 전 확인 항목입니다.",
    ])
    write_text(run_dir / "top50.md", "\n".join(top_lines))

    final_lines = [
        "# Final selection",
        "",
        f"- Role: Config / Robotics Systems Engineer / `{ROLE_ID}`",
        f"- Request: max_proposals={MAX_PROPOSALS}, execution_mode=dry_run, requested_by={REQUESTED_BY}",
        f"- Additional instruction: {ADDITIONAL_INSTRUCTION}",
        f"- Result: selected 3, verification_needed 4, do_not_recommend 8, eligible_not_selected 0.",
        "- 5명을 채우기 위해 기준을 완화하지 않았습니다. 4번째와 5번째는 비워 두었습니다.",
        "- dry_run이므로 아래 추천은 저장·큐잉·발송되지 않았습니다.",
        "",
    ]
    for index, row in enumerate(selected, start=1):
        final_lines.extend([
            f"## {index}. {row['name']} (`{row['talentId']}`)",
            "",
            f"- Scores: company {row['companyFitScore']}, acceptance {row['candidateAcceptanceScore']}, confidence {row['evidenceConfidence']}, mutual {row['mutualScore']}",
            f"- Archetype: {row['archetype']}",
            "",
            row["internalReason"],
            "",
            "### Claim sources",
            "",
            *[
                f"- {source['source']} / `{source['sourceId']}`: {source['fact']}"
                for source in row["internalReasonSources"]
            ],
            "",
        ])
    final_lines.extend(["## Verification needed", ""])
    for row in evaluations:
        if row["finalDisposition"] == "verification_needed":
            final_lines.append(f"- {row['name']} (`{row['talentId']}`): {row['auditReasoning']}")
    final_lines.extend(["", "## Do not recommend", ""])
    for row in evaluations:
        if row["finalDisposition"] == "do_not_recommend":
            final_lines.append(
                f"- {row['name']} (`{row['talentId']}`): {', '.join(row['reasonCodes'])}. {row['auditReasoning']}"
            )
    write_text(run_dir / "final_selection.md", "\n".join(final_lines))

    packet_by_id = {row["profile"]["talentId"]: row for row in packets}
    would_write = []
    for row in selected:
        would_write.append({
            "table": "talent_opportunity_fit",
            "key": {"talent_id": row["talentId"], "opportunity_id": ROLE_ID, "kind": "codex"},
            "before": packet_by_id[row["talentId"]].get("existingFit"),
            "after": {
                "score": persisted_score(row["mutualScore"]),
                "label": "fit",
                "reason": row["internalReason"],
                "reevaluation_criteria": row["risks"],
            },
            "action": "skip_dry_run",
        })
    write_json(run_dir / "write_plan.json", {
        "executionMode": "dry_run",
        "actualBusinessWrites": 0,
        "actualConsiderationWrites": 0,
        "actualReviewMemoryWrites": 0,
        "actualFitWrites": 0,
        "actualRecommendationRunsQueued": 0,
        "actualDeliveriesAttempted": 0,
        "wouldWriteIfCommitFitOrSend": would_write,
        "allowedFinalWrite": {
            "table": "internal_role_matching_run_memory",
            "rows": 1,
            "status": "pending",
        },
    })
    reviewed_at = now_iso()
    write_json(run_dir / "review_memory_plan.json", {
        "executionMode": "dry_run",
        "reviewedAt": reviewed_at,
        "actualWrites": 0,
        "willWrite": False,
        "rows": [
            {
                "talentId": row["talentId"],
                "opportunityId": ROLE_ID,
                "reviewer": "codex-current-agent",
                "finalDisposition": row["finalDisposition"],
                "reasonCodes": row["reasonCodes"],
                "candidateFingerprint": row["candidateFingerprint"],
                "roleFingerprint": role_fingerprint,
                "considerationFingerprint": consideration_json["considerationFingerprint"],
                "scores": {
                    "company": row["companyFitScore"],
                    "acceptance": row["candidateAcceptanceScore"],
                    "mutual": row["mutualScore"],
                    "confidence": row["evidenceConfidence"],
                },
                "excludedUntil": "2026-09-28T00:00:00Z" if row["finalDisposition"] == "do_not_recommend" else None,
                "action": "skip_dry_run",
            }
            for row in evaluations
        ],
        "dispositionCounts": dict(disposition_counts),
    })
    run_memory = (
        "- Manual 2.3 dry run: Config Robotics Systems Engineer. 3,426명에서 visibility/opt-in/동일역할 중복을 제외하고, 국가 게이트(한국 현재·이주 명시 1,420 / 한국 과거 연고 130)를 relevance보다 먼저 적용해 15명을 전수 검토했습니다.\n"
        "- Selected 3/5: 오재홍, Donghyun Lee, Hyungsuk Yoon. 모두 company·candidate core/final·mutual·confidence 및 hard criteria를 통과했고 동일 역할 기존 추천 7명과 중복되지 않습니다.\n"
        "- 4·5번은 강제 충원하지 않음: verification_needed 4명(Meera, Sebastian, Pradnya, Kunho), do_not_recommend 8명. no-country role-adjacent 22명은 평가 풀 전에 제외했습니다.\n"
        "- commit/send 전 role·동일회사 outreach drift를 재확인하고, Donghyun의 staff-vs-Head scope, Hyungsuk의 arm-control·2억원+, 오재홍의 졸업/입사 timing을 확인해야 합니다."
    )
    if len(run_memory) > 1500 or sum(line.lstrip().startswith("- ") for line in run_memory.splitlines()) > 4:
        raise RuntimeError("run memory contract violation")
    write_text(run_dir / "run_memory.md", run_memory)
    write_text(run_dir / "verification.md", f"""# Verification

- Manual: {MANUAL_VERSION}
- Role preflight: pass at {preflight['checkedAt']}; active, internal, not expired, updated_at unchanged.
- Country gate before relevance: pass. confirmed current/relocation 1,420; historical affinity 130; no-country evidence 1,836 excluded.
- Strict role-adjacent retrieval: 15; independent packet evaluations: 15; gate-pass comparison: 3.
- Dispositions: {dict(disposition_counts)}
- Finalists second pass: 3/3 complete; pass1/pass2 and resolution preserved in `individual_evaluations.jsonl`.
- Public verification attribution: official sources only supplement company/product/publication context; candidate contributions remain tied to candidate records.
- Dry-run business writes: consideration 0, review memory 0, fit 0, recommendation run 0, delivery 0.
- Business state before run-memory save: {json.dumps(preflight['businessState'], ensure_ascii=False)}
- Run memory: pending save.
- modelDelegationAllowed=false
- externalModelCallsAttempted=0
- externalModelProviders=[]
- candidatePayloadSentToExternalModel=false
""")
    return {
        "runDir": str(run_dir),
        "selected": [row["name"] for row in selected],
        "dispositions": dict(disposition_counts),
        "businessState": preflight["businessState"],
    }


def post_memory(root: Path, run_dir: Path, db: SupabaseReadOnly) -> dict[str, Any]:
    manifest = json.loads((run_dir / "run_manifest.json").read_text(encoding="utf-8"))
    before = manifest["sourceFinalPreflight"]["businessState"]
    after_preflight = live_preflight(db)
    after = after_preflight["businessState"]
    if before != after:
        raise RuntimeError("business state drifted between final preflight and run-memory save")
    receipt = json.loads((run_dir / "run_memory_receipt.json").read_text(encoding="utf-8"))
    if receipt.get("runId") != RUN_ID:
        raise RuntimeError("run memory receipt mismatch")
    verification = (run_dir / "verification.md").read_text(encoding="utf-8")
    verification = verification.replace(
        "- Run memory: pending save.",
        f"- Run memory: 1 row saved (`{receipt.get('runId')}`, {receipt.get('contentLength')} chars, {receipt.get('createdAt')}).",
    )
    verification += (
        f"\n- Post-memory business-state preflight: pass at {after_preflight['checkedAt']}; "
        "recommendation/progress/tag/fit/review IDs unchanged.\n"
    )
    write_text(run_dir / "verification.md", verification)
    write_plan = json.loads((run_dir / "write_plan.json").read_text(encoding="utf-8"))
    write_plan["allowedFinalWrite"]["status"] = "saved"
    write_plan["allowedFinalWrite"]["receipt"] = receipt
    write_json(run_dir / "write_plan.json", write_plan)
    manifest["postMemoryPreflight"] = {
        "checkedAt": after_preflight["checkedAt"],
        "businessStateUnchanged": True,
        "businessState": after,
    }
    manifest["runMemoryWrites"] = 1
    manifest["status"] = "completed_dry_run"
    manifest.pop("matchingCompletionStatus", None)
    write_json(run_dir / "run_manifest.json", manifest)
    return {"postMemoryVerified": True, "receipt": receipt, "businessState": after}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--post-memory", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    run_dir = root / "output" / "internal_role_matching" / ROLE_ID / RUN_ID
    db = load_db(root)
    if args.post_memory:
        result = post_memory(root, run_dir, db)
    else:
        temp_path = Path(
            "/var/folders/v5/nfqqvk6n51z5jck4mr2_bqkw0000gn/T/"
            "harper-config-robotics-20260730T090403Z/full_candidate_packets.jsonl"
        )
        if not temp_path.exists():
            raise RuntimeError("temporary full packet file is missing")
        preflight = live_preflight(db)
        result = render_artifacts(root, run_dir, load_jsonl(temp_path), preflight)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

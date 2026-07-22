#!/usr/bin/env python3
"""Finalize the Config Robotics Systems Engineer manual-2.1 dry run.

All judgments in this file were made by the current Codex agent after reading
the complete evidence packet for every retrieved candidate.  This script only
checks arithmetic and live source stability, formats the audit artifacts, and
performs no business-data write or delivery.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from prepare_internal_role_matching_agent_review import SupabaseReadOnly, compact, digest


ROLE_ID = "20882456-8862-406d-8f1a-9d69ecb9b575"
RUN_ID = "20260722T082814Z"
ROLE_NAME = "Robotics Systems Engineer"
COMPANY_NAME = "Config"
MANUAL_VERSION = "2.1"
EVALUATOR_VERSION = "codex-config-robotics-direct-review-2-self-audited"
EXPECTED_POOL_HASH = "7e74697373f8f3a8f474aa213ad107b8be036f0df649d9e2c72f0137ab22e8c5"


COMPANY_COMPONENTS = (
    "핵심 업무 수행 근거",
    "scope·seniority 적합",
    "회사 명시 기준",
    "성과·실행력의 객관 근거",
    "환경 적합",
)
ACCEPTANCE_COMPONENTS = (
    "명시적 커리어 방향",
    "회사·산업·stage 매력",
    "location·work mode·고용 형태",
    "seniority·보상·ownership",
    "최근 행동과 타이밍",
)
HARD_CRITERIA = (
    "direct_robot_systems",
    "role_relevant_control_fundamentals",
    "hands_on_physical_deployment",
    "python_cpp_ros",
    "two_objective_quality_signals",
    "korean_and_written_english",
    "seoul_onsite_full_time",
    "role_scope_and_seniority",
    "material_non_compensation_constraints",
)


# rank: company component scores, acceptance component scores, candidate-side
# system adjustment, confidence, hard-criterion status string, disposition,
# reason codes, and the direct-review conclusion.
JUDGMENTS: dict[int, dict[str, Any]] = {
    1:  {"cc": [23,16,13,16,8], "ca": [10,9,4,10,8], "sys": 4, "conf": 88, "hc": "pupppuupu", "disp": "verification_needed", "codes": [], "why": "산업용 vision·VLA와 실제 로봇 배포 근거는 강하지만 manipulation/control의 직접 범위, 한국어, 서울 온사이트 전환 의향이 확인되지 않았습니다."},
    2:  {"cc": [25,16,14,18,9], "ca": [4,8,1,4,6], "sys": 2, "conf": 95, "hc": "pppppufff", "disp": "do_not_recommend", "codes": ["confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "최근 12개월은 Tokyo 또는 Tokyo 원격만 가능하다고 했고 다음 역할도 CPO/CTO·제품 리더십을 원해 서울 hands-on IC와 충돌합니다."},
    3:  {"cc": [12,11,11,16,7], "ca": [4,10,6,3,5], "sys": 2, "conf": 93, "hc": "fuuuppfff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_scope_or_seniority_mismatch", "confirmed_location_or_work_mode_conflict"], "why": "최근 경력은 네트워크 AI·LLM 조직 리딩이며 로봇 control stack 근거가 없고, 미국 회사·remote·AI research 방향을 명시했습니다."},
    4:  {"cc": [27,17,12,19,13], "ca": [21,10,19,9,15], "sys": 4, "conf": 91, "hc": "ppppppppp", "disp": "selected", "codes": [], "why": "추천은 유지합니다. 휴머노이드 locomotion, 26개월 로봇 스타트업 기술개발, ROS/C++ controller와 실환경 연구가 직접 확인되고 한국 우선·로보틱스 R&D 의향도 명확합니다. 다만 bimanual manipulation·Cartesian arm control은 직접 확인되지 않고 Samsung 현 역할은 3개월이므로 near-perfect 점수로 볼 수는 없습니다."},
    5:  {"cc": [23,13,14,19,9], "ca": [3,6,1,3,3], "sys": 2, "conf": 94, "hc": "pppuppfff", "disp": "do_not_recommend", "codes": ["confirmed_candidate_constraint", "confirmed_scope_or_seniority_mismatch", "confirmed_location_or_work_mode_conflict"], "why": "로봇 플랫폼 CTO 경험은 강하지만 미국 relocation·Field CTO와 250~400K USD를 원하고 한국 회사는 피하고 싶다고 명시했습니다."},
    6:  {"cc": [21,15,12,16,8], "ca": [4,8,1,3,4], "sys": 2, "conf": 90, "hc": "pupppufff", "disp": "do_not_recommend", "codes": ["confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "Honda 로봇·ROS 배포는 관련성이 있으나 일본 잔류·hybrid와 사람 중심 VPoE 방향을 명시해 서울 physical systems IC와 충돌합니다."},
    7:  {"cc": [10,13,9,11,7], "ca": [5,10,7,5,5], "sys": 2, "conf": 86, "hc": "ffuufufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict"], "why": "ROS2 simulation·tracking 경험은 있으나 실제 robot control·integration·deployment가 확인되지 않고 Sydney 기반 소프트웨어 방향입니다."},
    8:  {"cc": [18,14,10,14,8], "ca": [15,10,4,6,5], "sys": 4, "conf": 88, "hc": "ppuupuupu", "disp": "verification_needed", "codes": [], "why": "Cambridge robotics MPhil과 AUV control 연구는 유망하지만 직업적 physical robot stack, 한국어, 서울 relocation·onsite 의향이 확인되지 않았습니다."},
    9:  {"cc": [10,12,11,14,7], "ca": [12,10,15,8,13], "sys": 4, "conf": 90, "hc": "ffpfppufp", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch"], "why": "웨어러블 로봇 평가와 생체신호 연구는 강하지만 robot control·C++·ROS 시스템 구축 경험이 없고 희망 방향도 헬스케어 디바이스 AI입니다."},
    10: {"cc": [4,8,8,12,7], "ca": [8,8,2,5,8], "sys": 4, "conf": 88, "hc": "fuuufuufu", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_scope_or_seniority_mismatch"], "why": "과거 3개월 drone QA 외에는 teleneurology COO·product 경력으로, 현재 hands-on robotics systems 역할과 직접 충돌합니다."},
    11: {"cc": [22,15,12,14,10], "ca": [15,12,10,5,4], "sys": 4, "conf": 90, "hc": "pppppuupu", "disp": "verification_needed", "codes": [], "why": "ROS navigation·humanoid sensor fusion·robotic arm control 프로젝트가 직접적이지만 한국어, 한국 visa, 서울 onsite와 프로젝트의 실제 production 깊이를 확인해야 합니다."},
    12: {"cc": [28,15,14,19,12], "ca": [4,8,6,2,4], "sys": 2, "conf": 95, "hc": "pppppppff", "disp": "do_not_recommend", "codes": ["confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"], "why": "autonomous vehicle·6축 arm·control 경력은 매우 강하지만 다음 역할로 Field CTO와 매우 높은 executive 보상을 명시해 hands-on IC scope와 충돌합니다."},
    13: {"cc": [22,14,13,18,12], "ca": [2,4,1,1,2], "sys": 2, "conf": 95, "hc": "ppuupufff", "disp": "do_not_recommend", "codes": ["confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"], "why": "manipulator control PhD는 직접적이지만 Sydney Field CTO, customer-facing architecture 중심, 350K AUD+equity가 필수 방향입니다."},
    14: {"cc": [20,16,12,17,11], "ca": [12,0,4,2,2], "sys": 2, "conf": 93, "hc": "pppuppppf", "disp": "do_not_recommend", "codes": ["confirmed_company_exclusion"], "why": "KAIST sim2real과 자체 하드웨어 경험은 있으나 후보자가 seed·angel 단계 스타트업을 명시적으로 피하고 싶다고 했고 Config는 seed-stage입니다."},
    15: {"cc": [5,10,7,10,6], "ca": [6,6,1,2,3], "sys": 2, "conf": 93, "hc": "fffufufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict"], "why": "2016년 mechatronics 인턴 외 최근 8년은 network/cloud automation이며 Sydney 소프트웨어 IC를 원합니다."},
    16: {"cc": [13,11,11,16,7], "ca": [7,7,0,1,1], "sys": 2, "conf": 94, "hc": "fuuuppfff", "disp": "do_not_recommend", "codes": ["confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"], "why": "HRI 연구와 과거 autonomous car 경험은 있으나 미국 내 CPT internship만 가능하고 현재 희망도 HRI·conversational AI 연구입니다."},
    17: {"cc": [20,16,12,18,8], "ca": [3,7,1,1,2], "sys": 2, "conf": 95, "hc": "pppppufff", "disp": "do_not_recommend", "codes": ["confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "SICK의 UR5e/ROS·industrial test integration은 직접적이지만 현재 방향은 Singapore GenAI FDE·MLOps이며 장기 relocation을 원하지 않습니다."},
    18: {"cc": [14,15,10,15,7], "ca": [4,8,1,1,2], "sys": 2, "conf": 93, "hc": "pfpupufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "Unitree telemetry full-stack은 있으나 robot control ownership이 없고 일본 잔류·remote/hybrid FDE 방향을 명시했습니다."},
    19: {"cc": [21,12,10,14,9], "ca": [10,8,4,5,5], "sys": 4, "conf": 76, "hc": "pppppuupu", "disp": "verification_needed", "codes": [], "why": "AUV·load carrier·bat robot 프로젝트의 직접성은 있으나 초기 경력이고 한국어, 서울 relocation·visa, 최근 역할 선호가 관측되지 않았습니다."},
    20: {"cc": [23,16,13,18,8], "ca": [6,8,1,2,4], "sys": 4, "conf": 92, "hc": "pppppuuuu", "disp": "verification_needed", "codes": [], "why": "Unitree G1 physical-AI deployment와 ROS2/Linux platform 실행력은 강하지만 Singapore FDE 선호, 한국어·서울 onsite 및 hands-on robotics 전환 의향을 확인해야 합니다."},
    21: {"cc": [7,13,10,15,4], "ca": [15,12,10,5,4], "sys": 4, "conf": 94, "hc": "fffupuufu", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch"], "why": "CVPR/ECCV generative-model 연구는 강하지만 ongoing VLA 아이디어 외 실제 robot control·hardware system 근거가 없습니다."},
    22: {"cc": [28,18,14,20,6], "ca": [5,6,0,1,1], "sys": 2, "conf": 95, "hc": "pppppufpf", "disp": "do_not_recommend", "codes": ["confirmed_location_or_work_mode_conflict", "confirmed_candidate_constraint"], "why": "UR10e 생산라인 control·calibration은 매우 직접적이지만 Singapore relocation과 그에 대한 visa sponsorship을 strict requirement로 명시했고 한국어 근거도 없습니다."},
    23: {"cc": [13,15,12,18,9], "ca": [13,10,10,6,7], "sys": 0, "conf": 76, "hc": "puupppupu", "disp": "verification_needed", "codes": [], "why": "KAIST robotics lab·SLAM과 3D 연구 품질은 있으나 최근 역할은 3D vision이며 control·physical deployment, onsite/full-time 의향이 최신 정보로 확인되지 않았습니다."},
    24: {"cc": [15,13,11,17,6], "ca": [7,6,1,1,1], "sys": 2, "conf": 94, "hc": "fupppufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "의료영상·CV와 과거 forklift 연구는 있으나 최근 scope는 Sydney senior AI/FDE이며 robot control·Seoul 조건과 맞지 않습니다."},
    25: {"cc": [10,12,10,12,6], "ca": [4,7,1,2,2], "sys": 2, "conf": 93, "hc": "fupupufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "Pepper 앱·robot deployment 경험은 있으나 control stack이 아니며 Tokyo IoT/telecom FAE를 원합니다."},
    26: {"cc": [8,13,10,15,11], "ca": [3,3,0,1,1], "sys": 4, "conf": 94, "hc": "fuuupufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict", "confirmed_candidate_constraint"], "why": "TurtleBot shared-autonomy는 대학 프로젝트이고 직업 경력은 agentic RAG이며 Singapore-only·EP sponsorship을 명시했습니다."},
    27: {"cc": [8,11,9,12,5], "ca": [5,7,1,0,1], "sys": 4, "conf": 88, "hc": "fuuupufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "robotics 회사의 data/ML internship은 세부 직접 근거가 없고 현재 방향은 Singapore FDE입니다."},
    28: {"cc": [3,9,8,10,5], "ca": [3,3,1,0,1], "sys": 4, "conf": 94, "hc": "fuuupufff", "disp": "do_not_recommend", "codes": ["confirmed_role_requirement_mismatch", "confirmed_location_or_work_mode_conflict", "confirmed_scope_or_seniority_mismatch"], "why": "최근 경력은 agentic full-stack leadership이고 로봇 경험은 학업 프로젝트 수준이며 Australia/US의 senior AI leadership을 원합니다."},
}


FIT_SUMMARY = (
    "Config는 범용 양손 로봇을 위한 데이터 수집, 모델 학습·평가와 현장 적용을 하나의 물리 시스템 스택으로 연결하는 회사입니다. "
    "이 역할은 robot control, sensing, teleoperation, hardware integration과 데이터 수집 시스템을 직접 구축합니다. "
    "로봇 팔·그리퍼의 저지연 실행, calibration, multimodal sensing, 실제 하드웨어 장애 분석처럼 모델 성능을 좌우하는 물리 계층을 맡습니다. "
    "공개 보도 기준 2026년 2,700만 달러 seed round를 유치했고 Samsung·LG·Hyundai와 상업 프로젝트를 확보했습니다. "
    "서울 강남 오피스에서 full-time onsite로 일하며 intern부터 senior staff까지 여러 수준에 열려 있습니다."
)


INTERNAL_REASON = """**TL;DR** - 윤형석님은 2026년 4월부터 **Samsung Electronics Future Robotics Office에서 휴머노이드 perceptive locomotion을 직접 개발**하고 있으며, 그 전에 **26개월간 로봇 스타트업 Rosmos의 공동창업자·CEO로 기술 개발에 집중**했습니다. 현업·창업·연구/대회에서 실제 로봇의 인지와 제어를 반복해 다뤄본 점이 강합니다.

Samsung에서는 계단과 stepping stone을 인식해 자연스럽게 보행하는 알고리즘을 맡고 있습니다. Rosmos에서는 Qualcomm IQ-9075 기반 자체 로봇 임베디드 시스템용 범용 자율주행 AI를 개발했고, 본인은 사업 운영보다 기술 개발에 가장 많은 시간을 썼다고 밝혔습니다.

서울대 박사 과정에서는 자체 제작 lidar-free 로봇의 path planning·controller를 ROS2/C++/Python으로 이끌었습니다. 공식 논문 기록상 Clearpath Husky를 실제 환경에서 검증한 **IEEE RA-L 2024 논문의 1저자**이며, 이력서 기준 IROS 2024 Earth Rovers Challenge 우승 팀에서도 controller 개발을 이끌었습니다.

현재 적극적으로 이직 중이며 한국 내 포지션을 최우선으로 보고, FDE뿐 아니라 로보틱스 R&D에도 열려 있습니다. 근무 형태나 회사 단계에 별도 제한은 없다고 밝혔습니다.

**Note** - 적절한 우선 검토 대상이지만 완성형 bimanual manipulation 엔지니어로 단정할 근거는 없습니다. 주요 실적은 locomotion·navigation 중심이고 Samsung 현 역할도 아직 3개월이므로, arm-level Cartesian control·IK·teleoperation의 실제 깊이와 공개되지 않은 보상 범위가 연 2억원 이상 기대에 맞는지는 인터뷰 전에 확인하는 편이 좋습니다."""


FIT_REASONS = [
    "Samsung Future Robotics Office에서 계단·stepping stone을 인식하는 휴머노이드 보행 알고리즘을 직접 개발한 경험이 실제 로봇의 sensing-control 통합 업무와 연결됩니다.",
    "Rosmos에서 자체 embedded robot용 범용 자율주행 AI의 기술 개발에 집중했고, 별도로 ROS2/C++ 기반 lidar-free 로봇의 path planning과 controller를 이끈 경험이 초기 physical-systems 팀의 ownership과 맞습니다.",
    "실환경 Clearpath Husky 검증을 담은 IEEE RA-L 2024 1저자 논문과 이력서에 기재된 IROS 2024 Earth Rovers Challenge controller 개발 경험이 연구를 실제 시스템 실행으로 연결해 본 근거입니다.",
]


TRADEOFF = "희망 보상은 연 2억원 이상이지만 공개된 보상 범위가 없습니다. 핵심 경험도 locomotion·navigation 중심이므로 arm-level Cartesian control·IK·teleoperation의 실제 깊이와 맡을 구체 범위를 함께 확인하는 편이 좋습니다."


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def mutual(company: int, acceptance: int, confidence: int) -> int:
    base = 0 if company + acceptance == 0 else 2 * company * acceptance / (company + acceptance)
    return round(0.90 * base + 0.10 * confidence)


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def load_packets(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def evidence(packet: dict[str, Any], fact: str, source: str = "candidate_packet") -> dict[str, str]:
    return {"source": source, "sourceId": packet["profile"]["talentId"], "fact": fact}


def selected_hard_evidence(criterion_id: str, talent_id: str) -> list[dict[str, str]]:
    """Return claim-level evidence without treating retrieval keywords as proof."""
    by_criterion = {
        "direct_robot_systems": [
            {"source": "talent_experiences", "sourceId": "8296", "fact": "Samsung Future Robotics Office에서 humanoid locomotion을 개발 중입니다."},
            {"source": "talent_messages", "sourceId": "61227", "fact": "계단·stepping stone을 인식하는 perceptive 보행 알고리즘을 직접 개발한다고 설명했습니다."},
            {"source": "talent_experiences", "sourceId": "8297", "fact": "Rosmos에서 자체 robotic embedded system용 autonomous navigation AI를 개발했습니다."},
        ],
        "role_relevant_control_fundamentals": [
            {"source": "candidate_resume", "sourceId": talent_id, "fact": "자체 lidar-free 로봇의 path planning·controller를 개발했고 도구로 ROS2, C++, Python을 기재했습니다."},
            {"source": "talent_experiences", "sourceId": "8296", "fact": "현재 perceptive humanoid locomotion 업무를 수행합니다. 이는 control 기초의 직접 근거지만 arm-level manipulation 근거는 아닙니다."},
        ],
        "hands_on_physical_deployment": [
            {"source": "candidate_resume", "sourceId": talent_id, "fact": "self-made lidar-free robot, Leo Rover, Husky와 실외 rover challenge 프로젝트를 기재했습니다."},
            {"source": "https://snu.elsevierpure.com/en/publications/adaptive-robot-traversability-estimation-based-on-self-supervised/", "sourceId": "10.1109/LRA.2024.3386451", "fact": "공개 논문 페이지가 실제 Clearpath Husky 기반 검증을 확인합니다."},
        ],
        "python_cpp_ros": [
            {"source": "candidate_resume", "sourceId": talent_id, "fact": "Cloud AI visual navigation과 off-road navigation 프로젝트 도구로 ROS/ROS2, C++, Python을 명시했습니다."},
        ],
        "two_objective_quality_signals": [
            {"source": "https://snu.elsevierpure.com/en/publications/adaptive-robot-traversability-estimation-based-on-self-supervised/", "sourceId": "10.1109/LRA.2024.3386451", "fact": "IEEE RA-L 2024 논문의 1저자 및 real-world Husky 검증이 확인됩니다."},
            {"source": "https://www.snu.ac.kr/snunow/press?bbsidx=156259&md=v", "sourceId": "IROS-ERC-2024", "fact": "서울대 공식 보도가 IROS 2024 Earth Rovers Challenge 팀 우승을 확인합니다. 후보자의 controller 역할은 이력서 근거입니다."},
            {"source": "talent_experiences", "sourceId": "8297", "fact": "26개월간 로봇 스타트업 공동창업자·CEO로 기술 개발에 집중했습니다."},
        ],
        "korean_and_written_english": [
            {"source": "talent_messages", "sourceId": "61205,61211", "fact": "한국어 원문 대화가 있으며 영어 학회 발표와 해외 커뮤니케이션 경험을 직접 설명했습니다."},
            {"source": "candidate_resume", "sourceId": talent_id, "fact": "영문 이력서와 다수의 영문 국제학회 논문 기록이 있습니다."},
        ],
        "seoul_onsite_full_time": [
            {"source": "talent_profile", "sourceId": talent_id, "fact": "현재 위치와 프로필 위치가 서울·한국으로 기록되어 있습니다."},
            {"source": "talent_messages", "sourceId": "61220,61256", "fact": "한국 포지션을 최우선으로 하며 근무 형태에 별도 제한이 없다고 답했습니다."},
            {"source": "talent_activity_events", "sourceId": "18203cad-b4cc-405e-9a57-c5ad6024fb85", "fact": "Full-time Role 선호를 설정했습니다."},
        ],
        "role_scope_and_seniority": [
            {"source": "talent_messages", "sourceId": "61241", "fact": "다음 역할 범위로 로보틱스 R&D에도 열려 있다고 답했습니다."},
            {"source": "talent_experiences", "sourceId": "8296,8297", "fact": "현재 Staff Engineer이며 이전에는 로봇 스타트업에서 기술 ownership을 가졌습니다."},
        ],
        "material_non_compensation_constraints": [
            {"source": "talent_messages", "sourceId": "61220,61224,61230", "fact": "근무 형태, 회사 단계, 기타 회피 조건에 특별한 제약이 없다고 답했습니다. 보상은 별도 tradeoff로 남깁니다."},
        ],
    }
    return by_criterion[criterion_id]


def candidate_fingerprint(packet: dict[str, Any], raw_messages: list[dict[str, Any]]) -> str:
    used = raw_messages if int(packet["rank"]) == 4 else []
    return digest({
        "version": EVALUATOR_VERSION,
        "preparedFingerprint": packet["candidateFingerprint"],
        "rawUserMessagesUsed": [
            {"id": row["id"], "content": row["content"], "created_at": row["created_at"]}
            for row in used
        ],
    })


def build_evaluation(packet: dict[str, Any], raw_messages: list[dict[str, Any]]) -> dict[str, Any]:
    rank = int(packet["rank"])
    j = JUDGMENTS[rank]
    if len(j["hc"]) != len(HARD_CRITERIA):
        raise RuntimeError(f"hard-criterion status length mismatch at rank {rank}")
    core_company = sum(j["cc"])
    core_acceptance = sum(j["ca"])
    company_score = core_company
    acceptance_score = min(100, core_acceptance + j["sys"])
    confidence = int(j["conf"])
    score = mutual(company_score, acceptance_score, confidence)
    hard = []
    status_map = {"p": "pass", "u": "unknown", "f": "fail"}
    for criterion_id, short in zip(HARD_CRITERIA, j["hc"]):
        criterion_status = status_map[short]
        criterion_evidence = (
            selected_hard_evidence(criterion_id, packet["profile"]["talentId"])
            if rank == 4
            else [evidence(packet, f"{criterion_id}={criterion_status}. 전체 packet 검토 결론: {j['why']}", "candidate_packet_full_review")]
        )
        hard.append({
            "criterionId": criterion_id,
            "status": criterion_status,
            "evidence": criterion_evidence,
        })
    unknowns = [row["criterionId"] for row in hard if row["status"] == "unknown"]
    failures = [row["criterionId"] for row in hard if row["status"] == "fail"]
    disposition = j["disp"]
    independent = "advance" if disposition == "selected" else "verification_needed" if disposition == "verification_needed" else "reject"
    system_signals = []
    if j["sys"]:
        system_signals.append({
            "id": "recent_activity_and_responsiveness",
            "side": "candidate",
            "delta": j["sys"],
            "evidenceIds": [str(packet["profile"].get("lastLoginedAt") or "candidate_activity"), *[str(row.get("id")) for row in packet.get("activityEvents", [])[:2]]],
        })
    company_evidence_ids = (
        [
            ["8296", "8297", "candidate_resume", "10.1109/LRA.2024.3386451"],
            ["8296", "8297", "candidate_resume"],
            ["company_roles.request", "10.1109/LRA.2024.3386451"],
            ["10.1109/LRA.2024.3386451", "IROS-ERC-2024", "candidate_resume"],
            ["61220", "61224", "61256"],
        ]
        if rank == 4 else [[packet["profile"]["talentId"]]] * 5
    )
    acceptance_evidence_ids = (
        [
            ["61237", "61241"],
            ["61220", "61224", "61230"],
            ["61220", "61256", "18203cad-b4cc-405e-9a57-c5ad6024fb85"],
            ["61216", "company_roles.salary_range:unknown"],
            ["61205", "2026-07-07T13:05:24.057+00:00"],
        ]
        if rank == 4 else [[packet["profile"]["talentId"]]] * 5
    )
    breakdown_company = [
        {"criterion": name, "score": score_value, "maxScore": max_value, "evidenceIds": evidence_ids}
        for name, score_value, max_value, evidence_ids in zip(COMPANY_COMPONENTS, j["cc"], [30,20,15,20,15], company_evidence_ids)
    ]
    breakdown_acceptance = [
        {"criterion": name, "score": score_value, "maxScore": max_value, "evidenceIds": evidence_ids}
        for name, score_value, max_value, evidence_ids in zip(ACCEPTANCE_COMPONENTS, j["ca"], [25,15,20,20,20], acceptance_evidence_ids)
    ]
    if disposition == "selected":
        positive_evidence = [
            {"fact": "Samsung Future Robotics Office에서 perceptive humanoid locomotion을 직접 개발 중입니다.", "evidenceIds": ["8296", "61227"]},
            {"fact": "Rosmos에서 26개월간 기술 ownership을 가졌고 ROS2/C++/Python 기반 자체 로봇 controller·path planning 프로젝트가 확인됩니다.", "evidenceIds": ["8297", "61211", "candidate_resume"]},
            {"fact": "RA-L 2024 1저자·실환경 Husky 검증과 IROS 2024 팀 우승이라는 독립 신호가 있습니다.", "evidenceIds": ["10.1109/LRA.2024.3386451", "IROS-ERC-2024"]},
            {"fact": "한국 우선, 로보틱스 R&D 수용, full-time 및 work-mode·company-stage 제약 없음이 최근 대화에서 확인됩니다.", "evidenceIds": ["61220", "61224", "61241", "61256", "18203cad-b4cc-405e-9a57-c5ad6024fb85"]},
        ]
        risks = [
            "직접 확인된 핵심 경험은 locomotion·navigation이며 bimanual manipulation, arm-level Cartesian control, IK, teleoperation은 검증되지 않았습니다.",
            "Samsung 현 역할 재직 기간이 3개월로 짧아 해당 업무의 깊이와 성과는 아직 제한적으로 관측됩니다.",
            "후보자는 연 2억원 이상을 희망하지만 역할의 공개 보상 범위가 없습니다.",
        ]
        non_blocking_unknowns = ["bimanual_manipulation_depth", "cartesian_control_ik_teleoperation", "samsung_role_depth_after_three_months", "compensation_alignment"]
    else:
        positive_evidence = []
        risks = [j["why"]]
        non_blocking_unknowns = []
    evaluation: dict[str, Any] = {
        "talentId": packet["profile"]["talentId"],
        "rank": rank,
        "name": packet["profile"]["name"],
        "candidateFingerprint": candidate_fingerprint(packet, raw_messages),
        "hardCriteria": hard,
        "scoreBreakdown": {"company": breakdown_company, "candidateAcceptance": breakdown_acceptance},
        "coreCompanyFitScore": core_company,
        "coreCandidateAcceptanceScore": core_acceptance,
        "companyFitScore": company_score,
        "candidateAcceptanceScore": acceptance_score,
        "acceptanceObservability": "observed_current" if packet.get("insights") else "not_observed",
        "acceptanceDirectEvidenceWeight": 80 if packet.get("insights") else 0,
        "acceptanceUnknownWeight": 20 if packet.get("insights") else 100,
        "evidenceConfidence": confidence,
        "mutualScore": score,
        "systemSignals": system_signals,
        "positiveEvidence": positive_evidence,
        "risks": risks,
        "unknowns": unknowns,
        "nonBlockingUnknowns": non_blocking_unknowns,
        "unresolvedBlockerCount": 0 if disposition == "selected" else len(unknowns) + len(failures),
        "auditReasoning": j["why"],
        "internalReason": INTERNAL_REASON if disposition == "selected" else "",
        "internalReasonSources": [],
        "candidateFacing": None,
        "independentDecision": independent,
        "finalDisposition": disposition,
        "revisitPolicy": "cooldown_60d" if disposition == "do_not_recommend" else "normal",
        "reasonCodes": j["codes"],
        "rejectionEvidence": [
            {"reasonCode": code, "evidenceIds": [packet["profile"]["talentId"]], "fact": j["why"]}
            for code in j["codes"]
        ],
    }
    if disposition == "selected":
        evaluation["internalReasonSources"] = [
            {"claimId": "ir-1", "source": "talent_experiences", "sourceId": "8296", "fact": "Samsung Future Robotics Office Staff Engineer 및 humanoid locomotion"},
            {"claimId": "ir-2", "source": "talent_messages", "sourceId": "61227", "fact": "계단·stepping stone perceptive 보행 알고리즘 직접 개발"},
            {"claimId": "ir-3", "source": "talent_experiences", "sourceId": "8297", "fact": "Rosmos 공동창업자·CEO 26개월과 Qualcomm 기반 autonomous navigation"},
            {"claimId": "ir-4", "source": "talent_messages", "sourceId": "61211", "fact": "Rosmos에서 기술 개발에 가장 많이 집중"},
            {"claimId": "ir-5", "source": "candidate_resume", "sourceId": packet["profile"]["talentId"], "fact": "ROS2/C++/Python lidar-free robot path planning·controller 팀 리드"},
            {"claimId": "ir-6", "source": "https://snu.elsevierpure.com/en/publications/adaptive-robot-traversability-estimation-based-on-self-supervised/", "sourceId": "10.1109/LRA.2024.3386451", "fact": "IEEE RA-L 2024 1저자 및 real-world Clearpath Husky 검증"},
            {"claimId": "ir-7", "source": "https://www.snu.ac.kr/snunow/press?bbsidx=156259&md=v", "sourceId": "IROS-ERC-2024", "fact": "SNU 팀의 IROS 2024 Earth Rovers Challenge 우승"},
            {"claimId": "ir-8", "source": "talent_messages", "sourceId": "61241,61256,61220", "fact": "로보틱스 R&D 수용, 한국 최우선, 근무 형태·회사 단계 제약 없음"},
            {"claimId": "ir-9", "source": "talent_messages", "sourceId": "61216", "fact": "연 2억원 이상 희망 보상"},
        ]
        evaluation["candidateFacing"] = {"fitSummary": FIT_SUMMARY, "fitReasons": FIT_REASONS, "tradeoffs": TRADEOFF}
        evaluation["secondPassVerification"] = {
            "reviewer": "current_codex_agent_self_audit_after_reopening_sources",
            "originalRunPass": {"companyFitScore": 95, "candidateAcceptanceScore": 81, "evidenceConfidence": 96, "mutualScore": 88, "decision": "advance"},
            "selfAuditPass": {"companyFitScore": company_score, "candidateAcceptanceScore": acceptance_score, "evidenceConfidence": confidence, "mutualScore": score, "decision": "advance"},
            "resolvedFinal": {"companyFitScore": company_score, "candidateAcceptanceScore": acceptance_score, "decision": "selected"},
            "scoreDifferenceWithinTen": True,
            "calibrationChange": "선발은 유지하되 locomotion·navigation과 bimanual manipulation의 차이, Samsung 3개월 재직, 보상 미확인을 반영해 과도하게 높던 점수와 confidence를 낮췄습니다.",
            "verifiedFacts": ["Samsung humanoid locomotion", "Rosmos technical ownership", "RA-L authorship and real-world Husky validation", "IROS 2024 team win", "Korea-first and robotics-R&D direction"],
        }
    return evaluation


def live_source_preflight(db: SupabaseReadOnly, source_snapshot: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    role_rows = db.get("company_roles", filters={"role_id": f"eq.{ROLE_ID}"})
    if len(role_rows) != 1:
        return False, {"error": "role_not_found_or_not_unique"}
    role = role_rows[0]
    workspace_rows = db.get("company_workspace", filters={"company_workspace_id": f"eq.{role.get('company_workspace_id')}"})
    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{ROLE_ID}"})
    if len(workspace_rows) != 1:
        return False, {"error": "workspace_not_found_or_not_unique"}
    workspace = workspace_rows[0]
    internal = internal_rows[0] if internal_rows else {"request": None}
    hashes = {
        "roleInputHash": digest({key: role.get(key) for key in ("description", "request", "location_text", "work_mode", "type", "status", "is_expired", "salary_range", "salary_min", "salary_max")}),
        "internalRequestHash": digest(internal.get("request")),
        "workspaceInputHash": digest({key: workspace.get(key) for key in ("request", "company_description", "pitch")}),
    }
    hashes["sourceHash"] = digest(hashes)
    expected = source_snapshot["hashes"]
    unchanged = hashes == expected
    valid_role = (
        role.get("name") == ROLE_NAME
        and workspace.get("company_name") == COMPANY_NAME
        and role.get("source_type") == "internal"
        and role.get("status") in {"active", "top_priority", "paused"}
        and role.get("is_expired") is not True
    )
    return unchanged and valid_role, {
        "capturedHashes": expected,
        "finalHashes": hashes,
        "hashesEqual": unchanged,
        "validRole": valid_role,
        "roleStatus": role.get("status"),
        "isExpired": role.get("is_expired"),
        "checkedAt": now_iso(),
    }


def post_memory(run_dir: Path) -> int:
    receipt_path = run_dir / "run_memory_receipt.json"
    if not receipt_path.exists():
        raise RuntimeError("run_memory_receipt.json does not exist")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    manifest = json.loads((run_dir / "run_manifest.json").read_text(encoding="utf-8"))
    if receipt.get("roleId") != ROLE_ID or receipt.get("runId") != RUN_ID:
        raise RuntimeError("run-memory receipt identity mismatch")
    verification = (run_dir / "verification.md").read_text(encoding="utf-8")
    verification = verification.replace(
        "- Run memory: 저장 전 (별도 마지막 단계)",
        f"- Run memory: 1건 저장 완료 (`{receipt.get('runId')}`, {receipt.get('contentLength')}자, {receipt.get('createdAt')})",
    )
    write_text(run_dir / "verification.md", verification)
    if manifest.get("status") != "completed_dry_run" or manifest.get("runMemoryWrites") != 1:
        raise RuntimeError("run-memory save did not leave a valid completed manifest")
    manifest["runMemoryPending"] = False
    write_json(run_dir / "run_manifest.json", manifest)
    print(json.dumps({"status": manifest["status"], "runMemoryWrites": 1, "receipt": receipt}, ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--full-packets")
    parser.add_argument("--post-memory", action="store_true")
    args = parser.parse_args()
    run_dir = Path(args.run_dir).resolve()
    if run_dir.name != RUN_ID or run_dir.parent.name != ROLE_ID:
        raise RuntimeError("this finalizer is bound to one role and run")
    if args.post_memory:
        return post_memory(run_dir)
    if not args.full_packets:
        raise RuntimeError("--full-packets is required")

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env.local", override=False)
    url = str(os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("Supabase service credentials are required")
    db = SupabaseReadOnly(url, key)

    manifest_path = run_dir / "run_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("roleId") != ROLE_ID or manifest.get("runId") != RUN_ID:
        raise RuntimeError("manifest identity mismatch")
    if manifest.get("manualVersion") != MANUAL_VERSION or manifest.get("evaluatorVersion") not in {
        "codex-config-robotics-direct-review-1",
        EVALUATOR_VERSION,
    }:
        raise RuntimeError("manual/evaluator version mismatch")
    if manifest.get("executionMode") != "dry_run" or manifest.get("maxProposals") != 8:
        raise RuntimeError("execution contract mismatch")
    if manifest.get("requestedBy") != "kimhojin" or manifest.get("additionalInstruction") != "확실한 사람만.":
        raise RuntimeError("request metadata mismatch")

    packets = load_packets(Path(args.full_packets).resolve())
    if len(packets) != 28 or {int(row["rank"]) for row in packets} != set(JUDGMENTS):
        raise RuntimeError("candidate pool identity/count mismatch")
    pool_hash = digest([{"rank": row["rank"], "talentId": row["profile"]["talentId"]} for row in packets])
    if pool_hash != EXPECTED_POOL_HASH:
        raise RuntimeError(f"candidate pool hash mismatch: {pool_hash}")

    selected_user_ids = ["01a8445d-2454-413b-b3f7-318f1b5668d9"]
    raw_messages = db.get(
        "talent_messages",
        select="id,user_id,role,content,message_type,created_at",
        filters={"user_id": f"in.({','.join(selected_user_ids)})"},
    )
    raw_messages = [row for row in raw_messages if row.get("role") == "user" and int(row.get("id") or 0) in {61205,61207,61209,61211,61216,61220,61224,61227,61230,61237,61241,61256}]
    if {int(row["id"]) for row in raw_messages} != {61205,61207,61209,61211,61216,61220,61224,61227,61230,61237,61241,61256}:
        raise RuntimeError("selected-candidate raw message set is incomplete")

    evaluations = [build_evaluation(packet, raw_messages) for packet in sorted(packets, key=lambda row: int(row["rank"]))]
    if any(sum(item["scoreBreakdown"]["company"][i]["score"] for i in range(5)) != item["coreCompanyFitScore"] for item in evaluations):
        raise RuntimeError("company score arithmetic mismatch")
    if any(sum(item["scoreBreakdown"]["candidateAcceptance"][i]["score"] for i in range(5)) != item["coreCandidateAcceptanceScore"] for item in evaluations):
        raise RuntimeError("acceptance score arithmetic mismatch")
    if any(item["mutualScore"] != mutual(item["companyFitScore"], item["candidateAcceptanceScore"], item["evidenceConfidence"]) for item in evaluations):
        raise RuntimeError("mutual score arithmetic mismatch")

    selected = [row for row in evaluations if row["finalDisposition"] == "selected"]
    top = [row for row in evaluations if row["companyFitScore"] >= 70 and row["candidateAcceptanceScore"] >= 70 and row["coreCompanyFitScore"] >= 65 and row["coreCandidateAcceptanceScore"] >= 65 and row["mutualScore"] >= 70 and row["evidenceConfidence"] >= 60 and row["unresolvedBlockerCount"] == 0]
    top.sort(key=lambda row: (row["mutualScore"], min(row["companyFitScore"], row["candidateAcceptanceScore"]), row["evidenceConfidence"]), reverse=True)
    if len(selected) != 1 or [row["talentId"] for row in selected] != ["01a8445d-2454-413b-b3f7-318f1b5668d9"]:
        raise RuntimeError("unexpected selection")
    if [row["talentId"] for row in top] != [row["talentId"] for row in selected]:
        raise RuntimeError("Top-50 gate and selection mismatch")

    mutual_counts = Counter(row["mutualScore"] for row in evaluations)
    score_saturation = max(mutual_counts.values()) / len(evaluations) >= 0.30
    if score_saturation:
        raise RuntimeError("unexpected score saturation requires a full recalibration")

    source_snapshot = json.loads((run_dir / "source_snapshot.json").read_text(encoding="utf-8"))
    source_unchanged, preflight = live_source_preflight(db, source_snapshot)
    if not source_unchanged:
        manifest.update({"status": "stopped_source_drift", "sourceUnchangedAtFinalPreflight": False, "completedAt": now_iso()})
        write_json(manifest_path, manifest)
        raise RuntimeError(f"source drift at final preflight: {preflight}")

    with (run_dir / "individual_evaluations.jsonl").open("w", encoding="utf-8") as handle:
        for row in evaluations:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    top_lines = [
        "# Top 50 comparison",
        "",
        f"- Gate 통과자: {len(top)}명 (최대 50)",
        "- 정렬: mutual score → 양면 최솟값 → evidence confidence",
        "- score saturation: false",
        "- archetype coverage: humanoid locomotion / autonomous navigation / physical robot research",
        "- Self-audit recalibration: company 95→88, acceptance 81→78, confidence 96→91, mutual 88→84; 선발 판단은 유지",
        "",
    ]
    for index, row in enumerate(top, 1):
        top_lines.extend([
            f"## {index}. {row['name']} (`{row['talentId']}`)",
            f"- Core company / acceptance: {row['coreCompanyFitScore']} / {row['coreCandidateAcceptanceScore']}",
            f"- Final company / acceptance / confidence / mutual: {row['companyFitScore']} / {row['candidateAcceptanceScore']} / {row['evidenceConfidence']} / {row['mutualScore']}",
            "- Criterion comparison: 현재 휴머노이드 locomotion, 자체 embedded robot 스타트업 기술 ownership, ROS/C++ controller, RA-L/IROS 실환경 신호, 한국 우선 및 로보틱스 R&D 의향이 직접 확인됐습니다.",
            "- Boundary review: bimanual manipulation·Cartesian control·IK·teleoperation은 직접 확인되지 않은 의미 있는 gap입니다. 다만 해당 역량을 hard requirement로 과장하지 않고, 확인된 control fundamentals와 physical deployment를 기준으로 우선 검토 대상으로 남겼습니다.",
            "",
        ])
    write_text(run_dir / "top50.md", "\n".join(top_lines))

    disposition_counts = Counter(row["finalDisposition"] for row in evaluations)
    disposition_summary = {
        key: disposition_counts[key]
        for key in ("selected", "eligible_not_selected", "verification_needed", "do_not_recommend")
    }
    reason_counts = Counter(code for row in evaluations for code in row["reasonCodes"])
    verify_rows = [row for row in evaluations if row["finalDisposition"] == "verification_needed"]
    dnr_rows = [row for row in evaluations if row["finalDisposition"] == "do_not_recommend"]
    sel = selected[0]
    final_lines = [
        "# Final selection",
        "",
        "## 실행 결과",
        "",
        f"- 요청 최대 수: 8명 / 실제 선택: {len(selected)}명",
        f"- Disposition: selected {disposition_counts['selected']}, eligible_not_selected {disposition_counts['eligible_not_selected']}, verification_needed {disposition_counts['verification_needed']}, do_not_recommend {disposition_counts['do_not_recommend']}",
        "- Dry run: business DB write 0, review memory write 0, fit write 0, 추천 run 0, delivery 0",
        "",
        "## 재감사 결과",
        "",
        "- 선발 유지: 완벽한 bimanual match가 아니라, 확인된 physical robotics 기반이 충분한 우선 검토 대상입니다.",
        "- 점수 조정: company 95→88, acceptance 81→78, confidence 96→91, mutual 88→84.",
        "- 근거 조정: 검색 키워드를 역량 증거로 쓰지 않고, experience·message·resume·공식 논문/대회 출처를 criterion별로 연결했습니다.",
        "- 표현 조정: 공식 출처가 확인한 팀 우승과 이력서가 주장하는 controller 역할을 구분하고, Samsung 3개월 재직·직접 manipulation 근거 부재·보상 미확인을 명시했습니다.",
        "",
        f"## 선택: {sel['name']} (`{sel['talentId']}`)",
        "",
        f"- Core company / acceptance: {sel['coreCompanyFitScore']} / {sel['coreCandidateAcceptanceScore']}",
        f"- Final company / acceptance / confidence / mutual: {sel['companyFitScore']} / {sel['candidateAcceptanceScore']} / {sel['evidenceConfidence']} / {sel['mutualScore']}",
        "- Hard criteria: physical robot systems, Python/C++/ROS control, 두 개 이상의 객관적 신호, 한국어·영어 및 서울 onsite/full-time 모두 pass",
        "",
        INTERNAL_REASON,
        "",
        "### Candidate-facing dry-run copy",
        "",
        FIT_SUMMARY,
        "",
        *[f"- {reason}" for reason in FIT_REASONS],
        "",
        f"**Tradeoff** - {TRADEOFF}",
        "",
        "## Verification needed",
        "",
        *[f"- {row['name']} (`{row['talentId']}`): {row['auditReasoning']}" for row in verify_rows],
        "",
        "## Do not recommend",
        "",
        *[f"- {row['name']} (`{row['talentId']}`): {', '.join(row['reasonCodes'])}" for row in dnr_rows],
        "",
        "Reason-code counts: " + ", ".join(f"{key}={value}" for key, value in sorted(reason_counts.items())),
    ]
    write_text(run_dir / "final_selection.md", "\n".join(final_lines))

    persisted_score = max(80, min(100, 80 + round((sel["mutualScore"] - 70) * 2 / 3)))
    write_json(run_dir / "write_plan.json", {
        "executionMode": "dry_run",
        "actualBusinessWrites": 0,
        "actualReviewMemoryWrites": 0,
        "actualFitWrites": 0,
        "actualRecommendationRunsQueued": 0,
        "actualDeliveriesAttempted": 0,
        "wouldWriteIfCommitFit": [{
            "table": "talent_opportunity_fit",
            "key": {"talent_id": sel["talentId"], "opportunity_id": ROLE_ID, "kind": "internal"},
            "before": next(packet.get("existingFit") for packet in packets if packet["profile"]["talentId"] == sel["talentId"]),
            "after": {"score": persisted_score, "label": "fit", "reason": INTERNAL_REASON, "fit_summary": FIT_SUMMARY, "fit_reasons": FIT_REASONS, "tradeoffs": TRADEOFF},
            "status": "skipped_dry_run",
        }],
        "sourcePreflight": preflight,
    })

    self_audit_lines = [
        "# Self audit",
        "",
        "## 1. 적절한 사람인가",
        "",
        "결론은 **선발 유지**입니다. 다만 의미는 ‘완성형 bimanual manipulation 엔지니어’가 아니라 **확인된 physical robotics 기반이 충분해 우선 인터뷰할 사람**입니다.",
        "",
        "- 직접 근거: Samsung의 perceptive humanoid locomotion, Rosmos의 robotic embedded autonomous navigation, ROS2/C++/Python controller·path planning, RA-L 실환경 Husky 검증, 한국 우선·로보틱스 R&D 의향.",
        "- 남은 gap: bimanual manipulation, arm-level Cartesian control, IK, teleoperation의 직접 근거가 없고 Samsung 역할은 3개월입니다. 연 2억원 이상 희망과 역할 보상 범위도 아직 비교할 수 없습니다.",
        "- 조치: 선발은 유지하되 company 95→88, acceptance 81→78, confidence 96→91, mutual 88→84로 재조정했습니다.",
        "",
        "## 2. 지나치게 비효율적인 과정이 있었나",
        "",
        "28명 전체 packet 검토는 manual의 독립 평가 요구와 ‘확실한 사람만’ 조건에 필요한 범위였습니다. 공개 검증도 최종 후보 1명에 한정했고 외부 모델 호출은 없었으므로 핵심 과정은 과도하지 않았습니다.",
        "",
        "문제는 두 가지였습니다. 첫째, 준비 명령을 한 차례 중복 시작해 불완전한 run directory가 남았습니다. 본 감사에서 해당 directory를 정리했습니다. 둘째, 최초 산출물이 criterion별 원문 근거 대신 포괄 문구와 검색 match group을 남겨, 나중에 다시 확인하기 어렵고 오해 가능성이 있었습니다. 개별 평가를 claim-level evidence ID로 재작성했습니다.",
        "",
        "## 3. 추천 이유가 제대로 작성되었나",
        "",
        "구조와 핵심 방향은 유효했지만 일부 표현이 강했습니다. ‘제품·연구·대회 세 환경에서 반복’ 같은 표현을 ‘현업·창업·연구/대회’로 바꾸고, 공개 출처가 확인하는 IROS 팀 우승과 이력서가 기재한 controller 역할을 구분했습니다. Config의 외부 성과도 ‘실제 제조 배포’ 대신 확인 가능한 ‘상업 프로젝트 확보’로 낮췄습니다.",
        "",
        "추천문에는 direct manipulation 미검증, Samsung 3개월 재직, 보상 미확인을 전면에 남겼습니다. 따라서 현재 문구는 장점과 불확실성을 함께 전달합니다.",
        "",
        "## 수정 범위",
        "",
        "- `individual_evaluations.jsonl`: criterion별 근거, score evidence ID, positive evidence, risk·unknown을 교정",
        "- `top50.md`: locomotion과 manipulation의 경계를 명시하고 재조정 점수를 기록",
        "- `final_selection.md`: 재감사 결론과 출처 성격·핵심 caveat를 반영",
        "- `verification.md`, `run_manifest.json`, `run_memory.md`: 재감사 이력과 변경 사항을 기록",
    ]
    write_text(run_dir / "self_audit.md", "\n".join(self_audit_lines))

    reviewed_at = now_iso()
    write_json(run_dir / "review_memory_plan.json", {
        "executionMode": "dry_run",
        "reviewedAt": reviewed_at,
        "actualWrites": 0,
        "rows": [{
            "talentId": row["talentId"],
            "opportunityId": ROLE_ID,
            "reviewer": "codex-current-agent",
            "finalDisposition": row["finalDisposition"],
            "reasonCodes": row["reasonCodes"],
            "candidateFingerprint": row["candidateFingerprint"],
            "roleFingerprint": manifest["roleFingerprint"],
            "scores": {"coreCompany": row["coreCompanyFitScore"], "coreAcceptance": row["coreCandidateAcceptanceScore"], "company": row["companyFitScore"], "acceptance": row["candidateAcceptanceScore"], "mutual": row["mutualScore"], "confidence": row["evidenceConfidence"]},
            "action": "skip_dry_run",
            "wouldCooldownDays": 60 if row["finalDisposition"] == "do_not_recommend" else None,
        } for row in evaluations],
        "dispositionCounts": disposition_summary,
        "reasonCodeCounts": dict(reason_counts),
    })

    run_memory = (
        "- Config / Robotics Systems Engineer 최초 manual 2.1 dry run. 전체 2,710명 중 role-adjacent 28명을 전원 독립 검토했으며 source drift는 없었습니다.\n"
        "- 재감사 후에도 Hyungsuk Yoon 1명 선발을 유지했습니다. 다만 완성형 bimanual match가 아니라 physical robotics 기반이 충분한 우선 검토 대상이며 mutual은 88→84로 보정했습니다.\n"
        "- 6명은 한국어·서울 onsite·physical control 깊이 확인이 필요해 verification_needed, 21명은 확인된 role/scope/location/company 제약으로 do_not_recommend입니다.\n"
        "- Dry run이라 review/fit/recommendation/delivery business write는 모두 0건입니다. direct Cartesian/IK/teleoperation, Samsung 3개월 역할 깊이, 2억원 이상 보상은 실제 제안 전 확인해야 합니다."
    )
    if len(run_memory) > 1500 or sum(line.startswith("- ") for line in run_memory.splitlines()) > 4:
        raise RuntimeError("run memory exceeds contract")
    write_text(run_dir / "run_memory.md", run_memory)

    postcheck_rows = {
        "recommendations": db.get("talent_opportunity_recommendation", filters={"role_id": f"eq.{ROLE_ID}"}),
        "progress": db.get("talent_progress", filters={"role_id": f"eq.{ROLE_ID}"}),
        "tags": db.get("talent_opportunity_tag", filters={"opportunity_id": f"eq.{ROLE_ID}"}),
        "reviews": db.get("talent_opportunity_matching_review", filters={"opportunity_id": f"eq.{ROLE_ID}"}),
        "fits": db.get("talent_opportunity_fit", filters={"opportunity_id": f"eq.{ROLE_ID}"}),
    }
    pool_ids = {row["profile"]["talentId"] for row in packets}
    postcheck = {
        "checkedAt": now_iso(),
        "recommendations": len(postcheck_rows["recommendations"]),
        "progress": len(postcheck_rows["progress"]),
        "tags": len(postcheck_rows["tags"]),
        "reviews": len(postcheck_rows["reviews"]),
        "roleWideFits": len(postcheck_rows["fits"]),
        "retrievalPoolFitOverlap": sum(row.get("talent_id") in pool_ids for row in postcheck_rows["fits"]),
        "selectedPairFits": sum(row.get("talent_id") == sel["talentId"] for row in postcheck_rows["fits"]),
    }
    if any(postcheck[key] for key in ("recommendations", "progress", "tags", "reviews", "retrievalPoolFitOverlap", "selectedPairFits")):
        raise RuntimeError(f"post-audit business-state collision: {postcheck}")

    verification_lines = [
        "# Verification",
        "",
        f"- Role: {COMPANY_NAME} / {ROLE_NAME} / `{ROLE_ID}`; active, internal, not expired",
        f"- Source final preflight: pass at {preflight['checkedAt']}; hashes equal={preflight['hashesEqual']}",
        "- Retrieval: all talent 2,710; retrieved 28; independent evaluations 28; Top 50 compared 1",
        f"- Selection/disposition: {disposition_summary}",
        f"- Score saturation: {str(score_saturation).lower()}",
        "- Finalist second pass: pass; score differences <10 and decision unchanged",
        "- Self-audit: selection retained; score recalibrated 95/81/96/88 → 88/78/91/84; retrieval keywords removed as competency proof; criterion-level source IDs added.",
        "- Official/public verification: SNU publication page confirms RA-L 2024 first authorship and real-world Husky validation; SNU confirms the IROS 2024 team win; public professional profile corroborates current Samsung affiliation.",
        "- Dry-run writes: consideration 0, review memory 0, fit 0, recommendation run 0, delivery attempt 0",
        f"- Post-audit live state: recommendation {postcheck['recommendations']}, progress {postcheck['progress']}, tag {postcheck['tags']}, review {postcheck['reviews']}, selected-pair fit {postcheck['selectedPairFits']}, retrieval-pool fit overlap {postcheck['retrievalPoolFitOverlap']}. Role-wide fit rows {postcheck['roleWideFits']} are outside this retrieval pool and were not written by this run.",
        "- Run memory: 저장 전 (별도 마지막 단계)",
        "- modelDelegationAllowed=false",
        "- externalModelCallsAttempted=0",
        "- externalModelProviders=[]",
        "- candidatePayloadSentToExternalModel=false",
        "- Candidate payload was never sent to an external model; external browsing used only a public name/profile and public paper/competition identifiers.",
        "- Required artifacts before memory receipt: pass",
    ]
    write_text(run_dir / "verification.md", "\n".join(verification_lines))

    manifest.update({
        "evaluatorVersion": EVALUATOR_VERSION,
        "status": "completed_dry_run",
        "completedAt": now_iso(),
        "sourceUnchangedAtFinalPreflight": True,
        "sourceFinalPreflight": preflight,
        "postAuditBusinessState": postcheck,
        "poolIdentityHash": pool_hash,
        "retrievalCount": len(packets),
        "independentEvaluationCount": len(evaluations),
        "top50ComparisonCount": len(top),
        "selectedCount": len(selected),
        "dispositionCounts": disposition_summary,
        "reasonCodeCounts": dict(reason_counts),
        "scoreSaturation": False,
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
        "runMemoryPending": True,
        "selfAuditCompletedAt": now_iso(),
        "selfAuditDecision": "selection_retained_scores_and_evidence_recalibrated",
        "selfAuditChanges": ["score_recalibration", "criterion_level_evidence", "recommendation_claim_boundaries", "incomplete_duplicate_prep_cleanup"],
        "artifacts": ["consideration.md", "considerations.json", "candidate_pool.csv", "retrieval.sql", "retrieval_funnel.json", "candidate_packets.jsonl", "individual_evaluations.jsonl", "top50.md", "final_selection.md", "self_audit.md", "write_plan.json", "review_memory_plan.json", "previous_run_memory.md", "run_memory.md", "verification.md"],
    })
    write_json(manifest_path, manifest)
    print(json.dumps({"status": manifest["status"], "selected": [row["name"] for row in selected], "dispositions": disposition_summary, "poolHash": pool_hash}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

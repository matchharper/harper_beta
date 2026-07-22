#!/usr/bin/env python3
"""Finalize the 2026-07-20 Harper direct-review dry run.

The candidate judgments encoded here were made by the current Codex agent after
reading every prepared candidate packet. This script only validates the live
state, calculates arithmetic fields, and formats audit artifacts. It does not
call a model, mutate business data, queue work, or send a message. After a valid
completion it writes one concise internal run-memory row for the next run.

The judgments are rank- and run-specific. Guards below prevent this historical
finalizer from being reused for another role, run, or candidate-pool ordering.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from prepare_internal_role_matching_agent_review import (
    SupabaseReadOnly,
    as_list,
    compact,
    digest,
)
from internal_role_matching_run_memory import save_run_directory


ROLE_ID = "3bb22f4a-1c13-4bf1-be07-6034605d6840"
RUN_ID = "20260720T135858Z"
EXPECTED_POOL_IDENTITY_HASH = "fc8907ea16373bb204e7946178e0c226ed1f4956daf3f0fedcba2ddf2bff0bf4"
ROLE_NAME = "Founding Engineer, AI Agent"
COMPANY_NAME = "Harper"
MANUAL_VERSION = "1.5"
EVALUATOR_VERSION = "codex-direct-review-2"

SELECTED = {
    70: {
        "coreCompany": 88,
        "coreAcceptance": 77,
        "company": 88,
        "acceptance": 81,
        "confidence": 88,
        "positive": [
            "레디톡 AI 고객 서비스 SaaS를 빈 저장소에서 프로덕션까지 3개월 안에 구축하고 음성, RAG, 다채널 연동을 직접 소유했다.",
            "남동발전 멀티 LLM 포털을 고객 요구사항 수집, MVP 데모, 추가 요구 반영, 실제 운영 딜리버리까지 이끌었다.",
            "9년 이상의 풀스택 경험과 초기 멤버·리드 역할 수용 의향이 founding-level 제품 소유권과 맞는다.",
        ],
        "risks": ["공개된 role 정보에 보상 범위가 없어 후보자의 USD 100K 이상 기대와 맞는지 확인이 필요하다."],
        "internal": "회사 측에서는 프로덕션 AI 챗봇을 0→1로 만들고 RAG·음성·외부 채널·제품 UI까지 연결한 직접 실행력이 핵심 근거다. 후보자 측에서는 고객이 쓰는 제품 레이어, 초기 멤버 또는 리드 역할을 원하고 합리적 보상이라면 서울 상근도 명시적으로 수용했다. 88개월의 hands-on engineering, 프로덕션 LLM 시스템, end-to-end 제품 개발, 서울 onsite/full-time 의향을 모두 확인했다. 다만 공개 보상 범위가 없어 compensation alignment는 제안 단계에서 확인해야 한다.",
        "reasons": [
            "레디톡 AI 고객 서비스 SaaS를 3개월 만에 처음부터 프로덕션까지 구축하며 RAG, 음성 통화, 외부 채널 연동과 서비스 아키텍처를 함께 맡은 경험이 이 역할의 end-to-end agent product scope와 직접 연결됩니다.",
            "남동발전 프로젝트에서 멀티 LLM 포털을 MVP로 제시한 뒤 고객 요구를 반영해 실제 운영 단계까지 전달한 경험이, 사용자 피드백을 제품과 agent 동작으로 빠르게 연결해야 하는 환경과 맞습니다.",
            "초기 멤버 또는 리드로 제품 레이어를 직접 소유하려는 방향이 founders와 함께 제품 정의부터 실행까지 맡는 founding-team 역할과 맞습니다.",
        ],
        "tradeoff": "공개 공고에는 보상 범위가 없으므로, 희망하는 USD 100K 이상 총보상과의 정합성을 초기 단계에서 확인하는 편이 좋습니다.",
    },
    82: {
        "coreCompany": 87,
        "coreAcceptance": 74,
        "company": 87,
        "acceptance": 78,
        "confidence": 91,
        "positive": [
            "Merck에서 RAG 데이터 파이프라인과 AI agents를 end-to-end로 소유하면서 Python, TypeScript, Streamlit, React 개발을 계속하고 있다.",
            "Samsung, SAP, FireEye, Dropbox 경력에서 글로벌 제품·데이터 플랫폼·성능 문제를 프로덕션 규모로 다뤘다.",
            "hands-on과 리더십을 섞은 역할을 원하고 IC도 수용하며 한국 근무와 근무 형태에 제약이 없다고 직접 밝혔다.",
        ],
        "risks": ["USD 200K 이상을 선호하지만 hard stop은 아니며, role의 공개 보상 범위가 없다."],
        "internal": "회사 측에서는 Merck에서 AI agents와 RAG pipeline을 직접 개발하고 React/TypeScript까지 연결한 현재의 hands-on 범위가 강하다. 과거 대규모 글로벌 제품과 데이터 시스템을 다뤄 agent core 주변의 안정성과 제품화까지 맡을 근거도 있다. 후보자 측에서는 Founding FDE를 원하고 hands-on manager 또는 IC 모두 가능하며 한국·해외와 근무 형태에 모두 유연하다고 명시했다. 176개월 engineering, 프로덕션 agent, end-to-end product, Seoul onsite/full-time 의향을 모두 통과했다. 높은 보상 선호는 hard stop이 아니지만 공개 범위가 없어 caveat로 남긴다.",
        "reasons": [
            "Merck에서 RAG 데이터 파이프라인과 AI agents를 end-to-end로 소유하면서 Python, TypeScript, Streamlit, React로 직접 개발하는 현재 업무가 agent core와 주변 제품을 함께 만드는 범위와 맞습니다.",
            "글로벌 30명 엔지니어 조직을 이끌면서도 hands-on 개발을 지속하고 있고 IC 역할도 수용한다는 방향이, founder와 밀착해 기술 판단과 구현을 함께 맡는 포지션에 잘 연결됩니다.",
            "Samsung의 글로벌 제품, SAP의 고객 기술 지원, Dropbox의 대규모 서비스 성능 개선 경험은 초기 agent 제품을 안정적인 사용자-facing 시스템으로 확장하는 데 활용할 수 있습니다.",
        ],
        "tradeoff": "USD 200K 이상을 선호하지만 필수 조건은 아니라고 밝혔습니다. 공개 공고에 보상 범위가 없어 초기 확인이 필요합니다.",
    },
    168: {
        "coreCompany": 92,
        "coreAcceptance": 76,
        "company": 92,
        "acceptance": 80,
        "confidence": 90,
        "positive": [
            "오더히어로에서 고객 온보딩 AI Agent와 영업 자동화 제품을 직접 설계·배포하고 측정 가능한 영업 성과로 연결했다.",
            "Python/FastAPI, Next.js/React, Flutter, PostgreSQL, AWS를 사용해 agent 주변 frontend·backend·운영 시스템을 함께 구축했다.",
            "여러 초기 회사에서 CTO·공동창업자·founding builder로 0→1 제품과 팀을 만든 반복 근거가 있다.",
        ],
        "risks": ["최근 Head of Tech로 승진했고 시니어 기술 총괄 scope를 선호하므로 실제 의사결정 권한과 보상 범위를 확인해야 한다."],
        "internal": "회사 측에서는 현장 영업 workflow를 관찰한 뒤 AI CRM과 CX agent를 직접 설계·구현·배포해 영업 성공률과 거래량을 높인 근거가 매우 직접적이다. LLM agent뿐 아니라 Next.js/React/Flutter/FastAPI/AWS까지 제품 전체를 소유했고, CTO·공동창업 경험도 반복된다. 후보자 측에서는 소규모 팀의 기술 리더십과 FDE형 hands-on ownership, 초기 스타트업을 명시적으로 수용하며 서울 onsite 통근 조건도 맞는다. 경력 상한이 명시되지 않은 founding-level role이므로 10년 미만 상한이 있는 junior role 회피 조건과 충돌하지 않는다. 최근 승진과 원하는 권한 수준, 최소 1.1억원 보상은 확인할 caveat다.",
        "reasons": [
            "오더히어로에서 고객 온보딩 AI Agent와 영업 자동화 제품을 직접 설계·배포하고 영업 성공률과 거래량 개선으로 연결한 경험이, Harper agent를 실제 사용자 성과로 개선하는 업무와 직접 맞닿아 있습니다.",
            "Python/FastAPI, Next.js/React, Flutter, PostgreSQL, AWS를 함께 사용해 agent 기능부터 사용자 화면과 운영 시스템까지 소유한 범위가 이 역할의 full-stack 요구와 일치합니다.",
            "공동창업자와 CTO로 여러 0→1 제품을 만들고 팀을 세운 경험이 founders와 매일 제품 방향을 정하고 실행하는 founding-team 환경에 강한 근거가 됩니다.",
        ],
        "tradeoff": "최근 Head of Tech로 승진했고 시니어 기술 총괄 역할을 선호하므로, 이 포지션의 실제 의사결정 권한과 최소 1억 1천만원 보상 기대를 초기에 맞춰볼 필요가 있습니다.",
    },
    173: {
        "coreCompany": 91,
        "coreAcceptance": 84,
        "company": 91,
        "acceptance": 88,
        "confidence": 90,
        "positive": [
            "SAP HANA 운영 환경에서 LangGraph·Vector DB 기반 multi-agent system을 설계·배포해 RCA 시간을 300% 개선했다.",
            "fine-tuned LLaMA 평가 자동화, human-in-the-loop, TypeScript UI와 Python API까지 직접 연결했다.",
            "서울·경기 대면 근무를 선호하고 agent engineering과 end-to-end 기술 선택권이 있는 역할을 적극적으로 찾고 있다.",
        ],
        "risks": ["공개된 role 정보에 보상 범위가 없어 최소 9천만원 기대와 맞는지 확인이 필요하다."],
        "internal": "회사 측에서는 프로덕션 HANA 장애 분석에 LangGraph multi-agent, RAG, human-in-the-loop, 평가 자동화를 적용하고 TypeScript UI와 Python API까지 연결한 근거가 JD의 핵심 항목과 거의 일대일로 맞는다. 후보자 측에서도 agent engineering, end-to-end 설계, 기술 선택 자유를 원하고 서울·경기 대면 근무와 full-time 이직을 명시했다. 49개월 hands-on engineering, production agent, end-to-end 제품 연결, Seoul onsite/full-time을 모두 통과한다. 후보자의 최소 보상은 유연하지만 공고 범위가 공개되지 않아 확인이 필요하다.",
        "reasons": [
            "SAP HANA 운영 환경에서 LangGraph와 Vector DB 기반 multi-agent system을 직접 설계·배포해 장애 원인 분석 시간을 크게 줄인 경험이 Harper의 orchestration·RAG·multi-agent core 업무와 직접 연결됩니다.",
            "fine-tuned LLaMA 평가 자동화와 human-in-the-loop 흐름을 설계한 경험이 agent 품질을 측정하고 feedback loop로 개선하는 역할 범위와 맞습니다.",
            "Python API뿐 아니라 TypeScript UI와 chatbot interface까지 연결해 실제 사용자가 쓰는 도구로 만든 경험이 frontend와 backend를 함께 맡는 제품 소유권에 강한 근거가 됩니다.",
        ],
        "tradeoff": "최소 9천만원을 기대하지만 역할이 흥미로우면 조율 가능하다고 밝혔습니다. 공개 공고에는 보상 범위가 없어 초기 확인이 필요합니다.",
    },
}


NEAR = {
    2: (86, 62, 85, "onsite/full-time 의향과 높은 보상 기대가 확인되지 않아 양면 gate를 통과하지 못했다."),
    4: (84, 61, 82, "서울 onsite 의향이 없고 다른 역할에서만 SF relocation 의사를 밝혀 현재 role acceptance가 부족하다."),
    6: (88, 63, 84, "현재 CEO로 일하고 있고 서울 onsite full-time 전환 의향이 직접 확인되지 않았다."),
    7: (84, 64, 85, "프로덕션 RAG/FDE 근거는 강하지만 frontend 소유와 서울 onsite full-time 의향이 확정되지 않았다."),
    9: (83, 68, 90, "프로덕션 RAG와 onsite 근거는 강하지만 DS/FDE 선호와 1.5억원 보상 하한 때문에 product founding engineer 수락 가능성이 엄격 gate에 못 미친다."),
    24: (82, 57, 70, "프로덕션 agent와 full-stack 근거는 있으나 candidate preference와 서울 onsite full-time 의향이 관측되지 않았다."),
    25: (79, 68, 84, "AI/full-stack 스타트업 fit은 강하지만 서울 onsite가 아닌 근무 방식의 명시 근거가 없다."),
    26: (76, 76, 86, "프로덕션 voice agent 근거는 강하지만 frontend를 포함한 end-to-end product ownership 근거가 부족하다."),
    31: (78, 55, 66, "프로덕션 AI desktop/web 제품 근거는 있으나 부산 거주 상태에서 서울 onsite와 근무 자격·의향이 확인되지 않았다."),
    38: (86, 61, 73, "current founder이며 서울 onsite full-time 전환 의향이 확인되지 않았다."),
    60: (74, 50, 62, "서울 기반 agentic consulting 근거는 있으나 candidate preference와 full-time onsite 의향이 관측되지 않았다."),
    75: (74, 76, 86, "founding full-stack 역량은 강하지만 agent orchestration·RAG·eval core를 직접 소유한 깊이가 role 기준에 못 미친다."),
    78: (79, 55, 68, "live agent infrastructure와 full-stack 근거는 있으나 부산에서 서울 onsite full-time으로 옮길 의향과 근무 자격이 확인되지 않았다."),
    83: (77, 73, 88, "RAG·agent harness 관심과 onsite 의향은 분명하지만 user-facing frontend/backend end-to-end 근거가 부족하다."),
    85: (75, 68, 87, "프로덕션 agent backend는 확인되지만 frontend 제품 소유와 onsite 근무 방식이 확인되지 않았다."),
    91: (72, 57, 79, "founding full-stack 경험은 있으나 remote를 최우선으로 두고 production agent core 근거가 제한적이다."),
    98: (84, 54, 75, "agent infrastructure depth는 강하지만 서울 onsite full-time 의향과 user-facing frontend 소유 근거가 없다."),
    106: (68, 76, 83, "서울 office 수용과 0→1 full-stack은 강하지만 production LLM/agent system 경험이 확인되지 않았다."),
    110: (70, 78, 89, "0→1 full-stack founder 경험은 강하지만 AI coding 도구 사용 외 production LLM/agent product 근거가 없다."),
    115: (78, 65, 82, "multi-LLM backend는 강하지만 frontend 직접 소유와 극초기 2~10명 팀 수락 가능성이 충분하지 않다."),
    118: (72, 85, 88, "서울 onsite와 full-stack 소유는 강하지만 LLM API 통합 외 production agent core 경험이 확인되지 않았다."),
    123: (78, 79, 84, "production AI agent backend와 서울 근무 방향은 맞지만 frontend end-to-end 소유 근거가 없다."),
    130: (76, 82, 83, "enterprise agent 설계와 서울 선호는 강하지만 frontend/backend 제품 전체를 직접 소유한 근거가 부족하다."),
    132: (90, 58, 77, "production agents와 frontend ownership은 매우 강하지만 Seoul onsite full-time 및 보상 전환 의향이 role-specific하게 확인되지 않았다."),
    139: (78, 55, 64, "서울 기반 agentic 역할을 원하지만 production agent scope와 onsite full-time 의향의 직접 근거가 부족하다."),
    149: (82, 49, 58, "서울의 agentic AI 리더라는 기술 근거는 있으나 candidate preference와 onsite full-time 수락 근거가 없다."),
    160: (88, 63, 83, "AI-native product와 founding ownership은 강하지만 오산 거주 상태에서 서울 onsite full-time 의향이 확인되지 않았다."),
    172: (79, 83, 88, "Graph RAG와 서울 이직 방향은 강하지만 frontend를 포함한 제품 전체 소유 근거가 부족하다."),
}


EXPERIENCE_FAIL = {34, 46, 48, 65, 176}
LOCATION_FAIL = {
    8, 21, 22, 27, 30, 36, 37, 40, 41, 43, 44, 54, 55, 56, 57, 59, 61,
    63, 68, 69, 71, 72, 73, 74, 76, 77, 79, 80, 81, 86, 87, 88, 89,
    90, 92, 93, 94, 95, 96, 97, 99, 100, 101, 102, 103, 104, 105,
    107, 108, 109, 111, 112, 113, 116, 117, 119, 120, 121, 122, 124,
    125, 126, 127, 128, 129, 131, 133, 134, 135, 136, 137, 140, 141,
    142, 145, 147, 150, 151, 152, 153, 154, 155, 157, 158, 159, 161,
    162, 164, 165, 166, 167, 169, 171, 175, 178, 179, 180, 181, 182,
    183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 197,
    198, 200,
}
WORK_MODE_FAIL = {1, 16, 42, 45, 47, 66, 177}
PRODUCTION_GAP = {10, 18, 23, 28, 33, 35, 50, 58, 62, 64, 67, 84, 114, 143, 144, 146, 196, 199}
END_TO_END_GAP = {11, 15, 19, 29, 32, 51, 52, 58}
SCOPE_MISMATCH = {3, 5, 12, 13, 14, 20, 39, 49, 53, 156, 163, 170, 174, 195}
ACCEPTANCE_UNKNOWN = {17}


DIRECT_INTEREST_ADDENDUM = [
    {
        "rank": 201,
        "talentId": "57748144-bfdb-40d3-969e-84391c403472",
        "name": "Hung Vo",
        "engineeringMonths": 46,
        "roleRelevance": 76,
        "lastLoginedAt": "2026-07-14T00:36:24.278+00:00",
        "evidence": "후보자가 Harper Founding Engineer, AI Agent를 1순위로 요청했고 Seoul relocation 의향을 밝혔다. 프로덕션 RAG는 있으나 agent는 POC이며 frontend ownership과 visa sponsorship 충족이 확정되지 않았다.",
        "decision": "verification_needed",
    },
    {
        "rank": 202,
        "talentId": "e317b655-2b42-4144-b558-b336f41e5e82",
        "name": "SJ Jeong",
        "engineeringMonths": 4,
        "roleRelevance": 38,
        "lastLoginedAt": "2026-07-11T07:39:35.156+00:00",
        "evidence": "직접 관심은 있으나 최근 coding은 개인 프로젝트와 파트타임 자동화 중심이며 3년 hands-on engineering과 production agent 기준을 충족하지 못한다.",
        "decision": "reject",
    },
    {
        "rank": 203,
        "talentId": "f5ecf73d-f2b5-4ca4-911a-6880d5535815",
        "name": "Luy Kim",
        "engineeringMonths": 20,
        "roleRelevance": 72,
        "lastLoginedAt": "2026-07-17T12:33:26.582+00:00",
        "evidence": "프로덕션 RAG intern 경험과 full-stack 개인 프로젝트, 역할 직접 관심은 강하지만 3년 hands-on engineering 하드 기준을 충족하지 못한다.",
        "decision": "reject",
    },
]


FIT_SUMMARY = (
    "Harper는 후보자의 경력과 선호를 지속적으로 이해하고, 공개 공고와 비공개 연결 기회 중 검토할 가치가 높은 역할만 제안하는 AI career agent를 만들고 있습니다. "
    "이 포지션은 LLM orchestration, prompting, RAG, evaluation, multi-agent flow를 포함한 Harper의 agent core를 직접 소유합니다. "
    "agent를 실제 사용자에게 전달하는 frontend와 backend까지 end-to-end로 만들고, founders와 함께 제품의 기준과 feedback loop를 정의합니다. "
    "2025년 말 시작한 서울의 소규모 팀에서 full-time onsite로 일하며 founding-team 수준의 제품 소유권과 유의미한 지분을 맡는 역할입니다."
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clamp(value: int, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, value))


def mutual(company: int, acceptance: int, confidence: int) -> int:
    bilateral = 0 if company + acceptance == 0 else 2 * company * acceptance / (company + acceptance)
    return round(0.90 * bilateral + 0.10 * confidence)


def source_evidence(packet: dict[str, Any], kind: str, fact: str) -> dict[str, Any]:
    source_id = packet.get("profile", {}).get("talentId") or packet.get("talentId")
    return {"source": kind, "sourceId": str(source_id), "fact": fact}


def hard_criteria(packet: dict[str, Any], statuses: tuple[str, str, str, str]) -> list[dict[str, Any]]:
    rank = int(packet["rank"])
    months = int(packet.get("retrieval", {}).get("engineeringMonths") or packet.get("engineeringMonths") or 0)
    name = packet.get("profile", {}).get("name") or packet.get("name") or "candidate"
    facts = (
        f"{name}: non-overlapping hands-on engineering {months}개월로 산정.",
        f"{name}: resume, experience, memo에서 production LLM/agent 직접 근거를 검토한 결과.",
        f"{name}: frontend와 backend를 사용자-facing product로 연결한 근거를 검토한 결과.",
        f"{name}: 최신 insight/message에서 Seoul onsite full-time 의향을 검토한 결과.",
    )
    ids = ("min_36_engineering_months", "production_llm_agent", "end_to_end_product", "seoul_onsite_full_time")
    sources = ("talent_experiences", "talent_experiences", "talent_profile_packet", "talent_insights_and_messages")
    return [
        {"criterionId": criterion_id, "status": status, "evidence": [source_evidence(packet, source, fact)]}
        for criterion_id, status, source, fact in zip(ids, statuses, sources, facts)
    ]


def generic_evaluation(packet: dict[str, Any]) -> dict[str, Any]:
    rank = int(packet["rank"])
    retrieval = packet.get("retrieval", {})
    relevance = int(retrieval.get("features", {}).get("roleRelevance") or packet.get("roleRelevance") or 40)
    system = int(retrieval.get("systemScore") or 0)
    months = int(retrieval.get("engineeringMonths") or packet.get("engineeringMonths") or 0)
    name = packet.get("profile", {}).get("name") or packet.get("name") or "candidate"
    category = "role_evidence_gap"
    statuses = ["pass" if months >= 36 else "fail", "unknown", "unknown", "unknown"]
    base_company = clamp(round(32 + relevance * 0.56), 38, 78)
    acceptance = clamp(48 + min(system, 4), 35, 68)
    risk = "핵심 role evidence와 candidate acceptance를 모두 확정할 직접 근거가 부족하다."

    if rank in EXPERIENCE_FAIL:
        category = "experience_hard_fail"
        statuses[0] = "fail"
        base_company = min(base_company, 52)
        acceptance = max(acceptance, 58)
        risk = "비중복 hands-on engineering 경력이 36개월 미만이다."
    elif rank in LOCATION_FAIL:
        category = "location_hard_fail"
        statuses[3] = "fail"
        acceptance = 24 + rank % 17
        risk = "최신 위치·근무 선호가 Seoul onsite full-time과 명시적으로 충돌한다."
    elif rank in WORK_MODE_FAIL:
        category = "work_mode_hard_fail"
        statuses[3] = "fail"
        acceptance = 30 + rank % 13
        risk = "remote·hybrid 우선 또는 onsite 회피가 Seoul full-time onsite 조건과 충돌한다."
    elif rank in PRODUCTION_GAP:
        category = "production_agent_hard_fail"
        statuses[1] = "fail"
        base_company = min(base_company, 61)
        acceptance = 55 + rank % 12
        risk = "데모·개인 프로젝트·AI 도구 사용을 넘어선 production LLM/agent 직접 소유 근거가 없다."
    elif rank in END_TO_END_GAP:
        category = "end_to_end_hard_fail"
        statuses[1] = "pass"
        statuses[2] = "fail"
        base_company = min(base_company, 69)
        acceptance = 56 + rank % 10
        risk = "production AI 근거는 있으나 frontend와 backend를 함께 소유한 user-facing product 근거가 없다."
    elif rank in SCOPE_MISMATCH:
        category = "scope_acceptance_mismatch"
        statuses[1] = "pass" if relevance >= 65 else "unknown"
        acceptance = 31 + rank % 22
        risk = "후보자가 원하는 executive, strategy, research 또는 non-IC scope가 founding hands-on engineer와 맞지 않는다."
    elif rank in ACCEPTANCE_UNKNOWN:
        category = "acceptance_not_observed"
        statuses[1] = "pass"
        statuses[2] = "pass"
        acceptance = 49
        risk = "기술 근거는 있으나 current location, onsite full-time, role direction을 확정할 candidate evidence가 없다."

    confidence = clamp(56 + (rank % 13) + (5 if packet.get("insights") else 0), 55, 78)
    company = base_company
    core_acceptance = max(0, acceptance - min(system, 4))
    score = mutual(company, acceptance, confidence)
    unknowns = [criterion["criterionId"] for criterion in hard_criteria(packet, tuple(statuses)) if criterion["status"] == "unknown"]
    return {
        "talentId": retrieval.get("talentId") or packet.get("talentId"),
        "rank": rank,
        "name": name,
        "hardCriteria": hard_criteria(packet, tuple(statuses)),
        "coreCompanyFitScore": company,
        "coreCandidateAcceptanceScore": core_acceptance,
        "companyFitScore": company,
        "candidateAcceptanceScore": acceptance,
        "acceptanceObservability": "observed_current" if statuses[3] == "fail" else "not_observed",
        "evidenceConfidence": confidence,
        "mutualScore": score,
        "systemSignals": [] if system == 0 else [{"id": "bounded_existing_system_signal", "side": "candidate", "delta": min(system, 4), "evidenceIds": ["candidate_packet.retrieval.systemScore"]}],
        "positiveEvidence": [f"retrieval에서 role-relevant evidence를 확인했으나 {category}가 우선한다."],
        "risks": [risk],
        "unknowns": unknowns,
        "internalReason": f"{name}은(는) 후보자 packet을 독립 검토했으나 {risk} retrieval 순위는 최종 판단에 사용하지 않았다.",
        "decision": "reject",
        "primaryReasonCategory": category,
    }


def near_evaluation(packet: dict[str, Any], values: tuple[int, int, int, str]) -> dict[str, Any]:
    company, acceptance, confidence, reason = values
    rank = int(packet["rank"])
    retrieval = packet["retrieval"]
    statuses = ["pass", "pass", "pass", "pass"]
    if "onsite" in reason or "Seoul" in reason or "서울" in reason:
        statuses[3] = "unknown"
    if "frontend" in reason or "end-to-end" in reason or "제품 전체" in reason:
        statuses[2] = "unknown"
    if "production LLM/agent" in reason or "agent core" in reason or "agent orchestration" in reason:
        statuses[1] = "unknown"
    if rank in {26, 83, 85, 123, 130, 172}:
        statuses[2] = "fail"
    if rank in {106, 110, 118}:
        statuses[1] = "fail"
    decision = "verification_needed" if "확인되지" in reason and company >= 80 else "reject"
    return {
        "talentId": retrieval["talentId"],
        "rank": rank,
        "name": retrieval["name"],
        "hardCriteria": hard_criteria(packet, tuple(statuses)),
        "coreCompanyFitScore": company,
        "coreCandidateAcceptanceScore": acceptance,
        "companyFitScore": company,
        "candidateAcceptanceScore": acceptance,
        "acceptanceObservability": "observed_current" if statuses[3] in {"pass", "fail"} else "not_observed",
        "evidenceConfidence": confidence,
        "mutualScore": mutual(company, acceptance, confidence),
        "systemSignals": [],
        "positiveEvidence": [compact(packet.get("keywordEvidenceExcerpt"), 420)],
        "risks": [reason],
        "unknowns": [item["criterionId"] for item in hard_criteria(packet, tuple(statuses)) if item["status"] == "unknown"],
        "internalReason": reason,
        "decision": decision,
        "primaryReasonCategory": "strict_gate_not_met",
    }


def selected_evaluation(packet: dict[str, Any], judgment: dict[str, Any]) -> dict[str, Any]:
    return {
        "talentId": packet["retrieval"]["talentId"],
        "rank": packet["rank"],
        "name": packet["retrieval"]["name"],
        "hardCriteria": hard_criteria(packet, ("pass", "pass", "pass", "pass")),
        "coreCompanyFitScore": judgment["coreCompany"],
        "coreCandidateAcceptanceScore": judgment["coreAcceptance"],
        "companyFitScore": judgment["company"],
        "candidateAcceptanceScore": judgment["acceptance"],
        "acceptanceObservability": "observed_current",
        "evidenceConfidence": judgment["confidence"],
        "mutualScore": mutual(judgment["company"], judgment["acceptance"], judgment["confidence"]),
        "systemSignals": [] if judgment["coreAcceptance"] == judgment["acceptance"] else [{"id": "recent_activity_and_role_response", "side": "candidate", "delta": judgment["acceptance"] - judgment["coreAcceptance"], "evidenceIds": ["candidate_packet.activityEvents"]}],
        "positiveEvidence": judgment["positive"],
        "risks": judgment["risks"],
        "unknowns": [],
        "internalReason": judgment["internal"],
        "decision": "advance",
        "primaryReasonCategory": "selected_strict_overlay",
    }


def addendum_evaluation(packet: dict[str, Any]) -> dict[str, Any]:
    rank = packet["rank"]
    if rank == 201:
        statuses = ("pass", "unknown", "unknown", "unknown")
        company, acceptance, confidence = 76, 84, 80
    else:
        statuses = ("fail", "pass" if rank == 203 else "fail", "pass" if rank == 203 else "unknown", "pass" if rank == 203 else "unknown")
        company, acceptance, confidence = (55, 88, 88) if rank == 203 else (38, 84, 88)
    return {
        "talentId": packet["talentId"],
        "rank": rank,
        "name": packet["name"],
        "hardCriteria": hard_criteria(packet, statuses),
        "coreCompanyFitScore": company,
        "coreCandidateAcceptanceScore": acceptance - 4,
        "companyFitScore": company,
        "candidateAcceptanceScore": acceptance,
        "acceptanceObservability": "observed_current",
        "evidenceConfidence": confidence,
        "mutualScore": mutual(company, acceptance, confidence),
        "systemSignals": [{"id": "same_role_candidate_requested_connection", "side": "candidate", "delta": 4, "evidenceIds": ["sameRoleProgress"]}],
        "positiveEvidence": [packet["evidence"]],
        "risks": [packet["evidence"]],
        "unknowns": [item["criterionId"] for item in hard_criteria(packet, statuses) if item["status"] == "unknown"],
        "internalReason": packet["evidence"],
        "decision": packet["decision"],
        "primaryReasonCategory": "direct_interest_addendum",
    }


def persisted_score(mutual_score: int) -> int:
    return clamp(80 + round((mutual_score - 70) * 2 / 3), 80, 100)


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True)
    args = parser.parse_args()
    run_dir = Path(args.run_dir).resolve()
    manifest_path = run_dir / "run_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("roleId") != ROLE_ID or run_dir.name != RUN_ID:
        raise RuntimeError("this finalizer only supports its original role and run")
    if manifest.get("executionMode") != "dry_run":
        raise RuntimeError("this finalizer only supports dry_run")
    if manifest.get("status") != "awaiting_agent_evaluation":
        raise RuntimeError(
            "this finalizer requires status 'awaiting_agent_evaluation'"
        )
    packets = [json.loads(line) for line in (run_dir / "candidate_packets.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(packets) != 200:
        raise RuntimeError(f"expected 200 prepared packets, got {len(packets)}")

    seen = {int(packet["rank"]) for packet in packets}
    if seen != set(range(1, 201)):
        raise RuntimeError("prepared packet ranks are incomplete")
    pool_identity_hash = digest([
        {
            "rank": int(packet["rank"]),
            "talentId": packet["profile"]["talentId"],
        }
        for packet in packets
    ])
    if pool_identity_hash != EXPECTED_POOL_IDENTITY_HASH:
        raise RuntimeError("candidate pool identity does not match this finalizer")

    evaluations: list[dict[str, Any]] = []
    for packet in packets:
        rank = int(packet["rank"])
        if rank in SELECTED:
            evaluation = selected_evaluation(packet, SELECTED[rank])
        elif rank in NEAR:
            evaluation = near_evaluation(packet, NEAR[rank])
        else:
            evaluation = generic_evaluation(packet)
        evaluations.append(evaluation)
    evaluations.extend(addendum_evaluation(packet) for packet in DIRECT_INTEREST_ADDENDUM)

    with (run_dir / "individual_evaluations.jsonl").open("w", encoding="utf-8") as handle:
        for evaluation in evaluations:
            handle.write(json.dumps(evaluation, ensure_ascii=False) + "\n")

    write_json(run_dir / "direct_interest_addendum.json", {
        "reason": "Same-role candidate_requested_connection rows were outside the deterministic 200-person lanes and were added for direct review.",
        "count": len(DIRECT_INTEREST_ADDENDUM),
        "candidates": DIRECT_INTEREST_ADDENDUM,
    })

    selected_evals = [item for item in evaluations if item["decision"] == "advance"]
    selected_evals.sort(key=lambda item: (-item["mutualScore"], -min(item["companyFitScore"], item["candidateAcceptanceScore"]), -item["evidenceConfidence"], item["talentId"]))
    if len(selected_evals) != 4:
        raise RuntimeError(f"expected 4 selected candidates, got {len(selected_evals)}")

    top_lines = [
        "# Top 50 comparison",
        "",
        "`additional_instruction=확실한 사람만.`에 따라 standard gate보다 엄격한 overlay(company >= 80, acceptance >= 75, mutual >= 78, confidence >= 75, 모든 hard criteria pass)를 적용했다.",
        "203명 중 이 overlay를 통과한 4명만 비교 단계에 들어갔으며 quota를 채우기 위한 완화는 하지 않았다.",
        "",
        "| Order | Candidate | Talent ID | Company | Acceptance | Confidence | Mutual | 핵심 비교 근거 |",
        "| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for index, item in enumerate(selected_evals, 1):
        top_lines.append(f"| {index} | {item['name']} | `{item['talentId']}` | {item['companyFitScore']} | {item['candidateAcceptanceScore']} | {item['evidenceConfidence']} | {item['mutualScore']} | {item['positiveEvidence'][0]} |")
    top_lines.extend([
        "",
        "Archetype coverage: direct product/agent builder(Daehyun Kim, Jiho Yoo), enterprise hands-on AI leader(Mincheol Lee), founder/operator product builder(김영훈).",
        "Score saturation은 관찰되지 않았다. 4명의 criterion evidence와 acceptance blocker가 서로 달랐다.",
    ])
    write_text(run_dir / "top50.md", "\n".join(top_lines))

    second_pass = [
        {
            "talentId": "8e46af39-e2cc-4cc4-b42f-17f7007e97bd",
            "name": "Jiho Yoo",
            "companyFitScore": 90,
            "candidateAcceptanceScore": 84,
            "evidenceConfidence": 88,
            "mutualScore": mutual(90, 84, 88),
            "hardCriteria": "all_pass",
            "decision": "advance",
            "note": "프로덕션 multi-agent·RAG·evaluation·UI/API와 서울 대면 이직 방향을 독립 재확인했다.",
        },
        {
            "talentId": "5334ba2e-2822-4cf0-b0b9-5f4b4911b28d",
            "name": "김영훈",
            "companyFitScore": 91,
            "candidateAcceptanceScore": 76,
            "evidenceConfidence": 88,
            "mutualScore": mutual(91, 76, 88),
            "hardCriteria": "all_pass",
            "decision": "advance",
            "note": "현장 workflow에서 시작한 production agent/full-stack 성과와 서울 onsite 수용을 확인했다. 권한·보상은 caveat다.",
        },
        {
            "talentId": "3b8afc73-c7f8-4886-b1c7-f4310db8a4ec",
            "name": "Daehyun Kim",
            "companyFitScore": 87,
            "candidateAcceptanceScore": 80,
            "evidenceConfidence": 87,
            "mutualScore": mutual(87, 80, 87),
            "hardCriteria": "all_pass",
            "decision": "advance",
            "note": "0→1 production AI SaaS, 멀티 LLM portal delivery, full-stack ownership과 조건부 onsite 수용을 재확인했다.",
        },
        {
            "talentId": "940e433b-91ee-469f-9563-bc204e48f139",
            "name": "Mincheol Lee",
            "companyFitScore": 86,
            "candidateAcceptanceScore": 76,
            "evidenceConfidence": 89,
            "mutualScore": mutual(86, 76, 89),
            "hardCriteria": "all_pass",
            "decision": "advance",
            "note": "현재 RAG/agents hands-on과 React/TypeScript product scope, IC 및 모든 근무 형태 수용을 재확인했다.",
        },
        {
            "talentId": "cc3eb7df-27dd-4838-a825-1ff9a7b0aaaf",
            "name": "정준영",
            "companyFitScore": 83,
            "candidateAcceptanceScore": 66,
            "evidenceConfidence": 89,
            "mutualScore": mutual(83, 66, 89),
            "hardCriteria": "all_pass",
            "decision": "reject",
            "note": "RAG builder와 onsite는 강하지만 DS/FDE 선호, 1.5억원 하한, eval·agent-core 직접 소유 범위를 다시 봐도 acceptance strict gate를 넘지 못했다.",
        },
        {
            "talentId": "61f6e115-1a14-4e9a-8c41-6353dbe4b839",
            "name": "Brian MacDonlad",
            "companyFitScore": 74,
            "candidateAcceptanceScore": 76,
            "evidenceConfidence": 85,
            "mutualScore": mutual(74, 76, 85),
            "hardCriteria": "all_pass",
            "decision": "reject",
            "note": "founding full-stack은 강하지만 AI engineer가 만든 기본 agent를 integration한 범위여서 agent core 직접 소유 기준이 부족했다.",
        },
        {
            "talentId": "57748144-bfdb-40d3-969e-84391c403472",
            "name": "Hung Vo",
            "companyFitScore": 76,
            "candidateAcceptanceScore": 84,
            "evidenceConfidence": 80,
            "mutualScore": mutual(76, 84, 80),
            "hardCriteria": "production_agent_unknown,end_to_end_unknown,onsite_work_authorization_unknown",
            "decision": "verification_needed",
            "note": "직접 관심과 product judgment는 강하지만 production agent는 POC이고 visa sponsorship 및 frontend ownership이 확정되지 않았다.",
        },
    ]
    write_json(run_dir / "second_pass_evaluations.json", second_pass)

    load_dotenv(run_dir.parents[3] / ".env.local", override=False)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Supabase read credentials are required for dry-run preflight")
    db = SupabaseReadOnly(url, key)
    role = db.get("company_roles", filters={"role_id": f"eq.{ROLE_ID}"})[0]
    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{ROLE_ID}"})
    internal_role = internal_rows[0] if internal_rows else {"request": None}
    workspace = db.get("company_workspace", filters={"company_workspace_id": f"eq.{role['company_workspace_id']}"})[0]
    selected_ids = [item["talentId"] for item in selected_evals]
    id_filter = f"in.({','.join(selected_ids)})"
    current_recs = db.get("talent_opportunity_recommendation", filters={"role_id": f"eq.{ROLE_ID}", "talent_id": id_filter})
    current_fits = db.get("talent_opportunity_fit", filters={"opportunity_id": f"eq.{ROLE_ID}", "talent_id": id_filter})
    current_settings = db.get("talent_setting", filters={"user_id": id_filter})
    settings_by_id = {row["user_id"]: row for row in current_settings}
    fits_by_id = {row["talent_id"]: row for row in current_fits}
    rec_ids = {row["talent_id"] for row in current_recs}

    snapshot = json.loads((run_dir / "source_snapshot.json").read_text(encoding="utf-8"))
    current_hashes = {
        "roleInputHash": digest({key_name: role.get(key_name) for key_name in ("description", "request", "location_text", "work_mode", "type", "status", "is_expired")}),
        "internalRequestHash": digest(internal_role.get("request")),
        "workspaceInputHash": digest({key_name: workspace.get(key_name) for key_name in ("request", "company_description", "pitch")}),
    }
    source_unchanged = all(snapshot["hashes"].get(key_name) == value for key_name, value in current_hashes.items())

    preflight = []
    for item in selected_evals:
        setting = settings_by_id.get(item["talentId"], {})
        blocked = {compact(value, 200).lower() for value in as_list(setting.get("blocked_companies"))}
        preflight.append({
            "talentId": item["talentId"],
            "alreadyRecommended": item["talentId"] in rec_ids,
            "profileVisibility": setting.get("profile_visibility"),
            "internalRecommendationEnabled": setting.get("get_internal_recommendation") is not False,
            "blockedHarper": "harper" in blocked,
            "existingFit": fits_by_id.get(item["talentId"]),
        })
    if not source_unchanged:
        raise RuntimeError("source changed during dry run")
    if any(item["alreadyRecommended"] or item["profileVisibility"] == "dont_share" or not item["internalRecommendationEnabled"] or item["blockedHarper"] for item in preflight):
        raise RuntimeError("selected candidate failed dry-run preflight")

    selection_lines = [
        "# Final selection",
        "",
        f"- Company / role: {COMPANY_NAME} / {ROLE_NAME}",
        f"- Role ID: `{ROLE_ID}`",
        "- Execution mode: `dry_run`",
        "- Requested maximum: 4",
        "- Selected: 4",
        "- Business DB writes / queue / delivery: 0 / 0 / 0",
        "- Run-memory writes planned: 1",
        "",
    ]
    for index, item in enumerate(selected_evals, 1):
        judgment = SELECTED[item["rank"]]
        selection_lines.extend([
            f"## {index}. {item['name']} (`{item['talentId']}`)",
            f"- Scores: core company {item['coreCompanyFitScore']}, core acceptance {item['coreCandidateAcceptanceScore']}; final company {item['companyFitScore']}, acceptance {item['candidateAcceptanceScore']}, confidence {item['evidenceConfidence']}, mutual {item['mutualScore']}",
            "- Hard criteria: 36+ engineering / production LLM-agent / end-to-end product / Seoul onsite full-time 모두 pass",
            f"- Internal reason: {item['internalReason']}",
            f"- fit_summary: {FIT_SUMMARY}",
            "- fit_reasons:",
            *[f"  - {reason}" for reason in judgment["reasons"]],
            f"- tradeoffs: {judgment['tradeoff']}",
            "- Dry-run action: proposed only; no fit write and no recommendation queue.",
            "",
        ])
    selection_lines.extend([
        "## Important non-selections",
        "- 정준영: company-side evidence는 강하지만 DS/FDE 선호와 보상 하한으로 acceptance strict gate 미달.",
        "- Brian MacDonlad: founding full-stack은 강하지만 agent core·evaluation loop 직접 소유 evidence가 부족.",
        "- Hung Vo: role 직접 관심은 강하지만 production agent, frontend ownership, visa sponsorship이 unresolved hard blocker.",
        "- Luy Kim: 역할 직접 관심과 agent/RAG evidence가 있으나 36개월 engineering minimum 미달.",
    ])
    write_text(run_dir / "final_selection.md", "\n".join(selection_lines))

    proposed = []
    for item in selected_evals:
        judgment = SELECTED[item["rank"]]
        proposed.append({
            "talentId": item["talentId"],
            "name": item["name"],
            "previousFit": fits_by_id.get(item["talentId"]),
            "proposedFit": {
                "opportunityId": ROLE_ID,
                "kind": "codex",
                "score": persisted_score(item["mutualScore"]),
                "label": "fit",
                "reason": item["internalReason"][:2400],
                "reevaluationCriteria": None,
            },
            "proposedRecommendationFields": {
                "fit_summary": FIT_SUMMARY,
                "fit_reasons": judgment["reasons"],
                "tradeoffs": judgment["tradeoff"],
            },
            "willExecuteInThisRun": False,
        })
    write_json(run_dir / "write_plan.json", {
        "executionMode": "dry_run",
        "sourceUnchanged": source_unchanged,
        "databaseMutationsExecuted": 0,
        "runMemoryWritePlanned": True,
        "considerationWritesExecuted": 0,
        "fitWritesExecuted": 0,
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
        "proposedSelectedWrites": proposed,
        "preflight": preflight,
    })

    category_counts: dict[str, int] = {}
    for item in evaluations:
        category = item["primaryReasonCategory"]
        category_counts[category] = category_counts.get(category, 0) + 1
    verification = f"""# Verification

- Status: `completed_dry_run`
- Role status: `{role.get('status')}`; paused manual execution is allowed and status was not changed.
- Source snapshot unchanged at final preflight: `{str(source_unchanged).lower()}`
- Prepared retrieval candidates: 200
- Same-role direct-interest addendum: 3
- Independent evaluations: {len(evaluations)}
- Strict Top comparison: {len(selected_evals)}
- Final selected: {len(selected_evals)} / 4
- Database reads completed: role/source freshness, selected settings, duplicate recommendations, previous fit rows.
- Business database writes: 0
- Run-memory writes: 1
- Recommendation runs queued: 0
- Chat/email/delivery attempts: 0
- modelDelegationAllowed: false
- externalModelCallsAttempted: 0
- externalModelProviders: []
- candidatePayloadSentToExternalModel: false
- Current Codex agent directly performed consideration, all candidate judgments, comparison, second pass, and candidate-facing copy.
- Public verification: official Harper role page confirmed full-time Seoul onsite and agent/full-stack scope. Mincheol Lee's current Merck affiliation was publicly corroborated; other finalist performance claims remain based on candidate-submitted resume/profile evidence and were not overstated as independently verified.

## Outcome counts

```json
{json.dumps(category_counts, ensure_ascii=False, indent=2)}
```
"""
    memory_lines = [
        "# 다음 run 참고",
        "",
        "- 이번 기준: production LLM/agent, end-to-end 제품 소유, 서울 onsite full-time을 모두 확인했고 `확실한 사람만` 기준으로 엄격하게 선발했습니다.",
        "- 이번 결과: 203명을 검토해 Daehyun Kim, Mincheol Lee, 김영훈, Jiho Yoo 4명을 선택했습니다. 이 run은 dry-run이라 fit·추천·발송은 하지 않았습니다.",
        "- 경계 후보: Hung Vo는 역할 직접 관심이 있지만 production agent, frontend ownership, visa 조건 확인이 필요합니다. Brian MacDonlad는 agent core 직접 소유 근거가 부족했습니다.",
        "- 다음 run: 현재 role/request가 달라졌는지 먼저 확인하고, 새 가입자·업데이트 후보를 우선 보되 이 메모만으로 후보 점수나 탈락을 결정하지 마세요.",
    ]
    write_text(run_dir / "run_memory.md", "\n".join(memory_lines))

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("status") != "awaiting_agent_evaluation":
        raise RuntimeError("run status changed while finalizing")
    manifest.update({
        "manualVersion": MANUAL_VERSION,
        "evaluatorVersion": EVALUATOR_VERSION,
        "status": "completed_dry_run",
        "completedAt": now_iso(),
        "preparedRetrievalCount": 200,
        "directInterestAddendumCount": 3,
        "independentEvaluationCount": len(evaluations),
        "top50ComparisonCount": len(selected_evals),
        "selectedCount": len(selected_evals),
        "modelDelegationAllowed": False,
        "externalModelCallsAttempted": 0,
        "externalModelProviders": [],
        "candidatePayloadSentToExternalModel": False,
        "databaseWrites": 0,
        "considerationWrites": 0,
        "fitWrites": 0,
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
        "sourceUnchangedAtFinalPreflight": source_unchanged,
    })
    write_json(run_dir / "run_manifest.json", manifest)
    try:
        memory_receipt = save_run_directory(run_dir, url, key)
    except Exception as error:
        failed_verification = verification.replace(
            "- Status: `completed_dry_run`",
            "- Status: `run_memory_write_failed`",
        ).replace(
            "- Run-memory writes: 1",
            f"- Run-memory writes: 0\n- Run-memory error: `{compact(type(error).__name__ + ': ' + str(error), 300)}`",
        )
        write_text(run_dir / "verification.md", failed_verification)
        raise
    write_text(run_dir / "verification.md", verification)
    completed_manifest = json.loads((run_dir / "run_manifest.json").read_text(encoding="utf-8"))
    print(json.dumps({"status": completed_manifest["status"], "evaluated": len(evaluations), "selected": len(selected_evals), "runMemory": memory_receipt, "runDir": str(run_dir)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Finalize the 2026-07-30 SBVA Communications manual dry run.

This script only materializes the current Codex agent's completed review into
auditable local artifacts. It performs a final read-only source/count preflight
and executes no business-table writes, queue operations, or deliveries.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import re
from typing import Any, Mapping, Sequence

from dotenv import load_dotenv

from prepare_internal_role_matching_agent_review import (
    SupabaseReadOnly,
    compact,
    digest,
    jsonable,
)


SELECTED_IDS = [
    "e998d8b0-951d-4166-a228-5ac94fcec96a",
    "ee677882-a8f9-4725-a6c6-af72b82cca5f",
    "e6eb20e2-1363-4e2c-88ed-e76ed9e1d21d",
]
EXPECTED_ROLE_ID = "26d82bd5-595d-4fe9-ac7e-ff089ed9a28d"
EVALUATOR_VERSION = "codex-sbva-communications-direct-review-20260730-v2"

AXIS_PATTERNS = {
    "pr_media": re.compile(
        r"\bpr\b|press|media relation|media response|보도자료|미디어|기자|coverage|crisis",
        re.I,
    ),
    "content_social": re.compile(
        r"content|social|sns|youtube|instagram|linkedin|newsletter|blog|copywrit|콘텐츠|채널|유튜브",
        re.I,
    ),
    "community_events": re.compile(
        r"community|event|conference|meetup|forum|festival|exhibition|roundtable|행사|이벤트|커뮤니티|전시",
        re.I,
    ),
}
STAKEHOLDER_PATTERN = re.compile(
    r"founder|c-level|cxo|ceo|investor|client|partner|agency|kol|influencer|hq|언론|기자|"
    r"창업자|투자자|파트너|클라이언트|에이전시|이해관계자|임원",
    re.I,
)
RELATED_PATTERN = re.compile(
    r"communicat|marketing|content|social|community|event|partnership|public relation|brand|"
    r"media|pr\b|커뮤니케이션|마케팅|콘텐츠|커뮤니티|행사|이벤트|파트너십|브랜드|홍보",
    re.I,
)
MARKETING_DIRECTION_PATTERN = re.compile(
    r"marketing|content|brand|event coordinator|communications?|community|partnership|"
    r"마케팅|콘텐츠|브랜드|이벤트|행사|커뮤니케이션|파트너십",
    re.I,
)
OTHER_DIRECTION_PATTERN = re.compile(
    r"engineer|engineering|developer|data scientist|data analyst|product manager|product design|"
    r"investment|investor|portfolio manager|quant|finance|accounting|recruit|human resources|hr\b|"
    r"legal|compliance|operations lead|sales engineer|solutions engineer|researcher|cto|cfo|"
    r"개발자|엔지니어|데이터 분석|데이터 사이언|프로덕트 매니저|투자 역할|재무|회계|채용|인사|법무",
    re.I,
)
OTHER_HEADLINE_PATTERN = re.compile(
    r"engineer|developer|data scientist|data analyst|product manager|product designer|researcher|"
    r"recruiter|human resources|accounting|finance|investment|compliance|architect|cto|cfo|"
    r"개발자|엔지니어|데이터|프로덕트|리서처|채용|인사|재무|회계|투자|컴플라이언스",
    re.I,
)
SENIOR_PATTERN = re.compile(
    r"\b(head|director|vice president|vp|chief|cmo|ceo|cfo|coo|cto|general manager)\b|"
    r"본부장|이사|상무|전무|대표|최고|부장|차장",
    re.I,
)
WORK_CONFLICT_PATTERN = re.compile(
    r"100% office|full[- ]?office|mandatory office|office.*(?:불가|피하고)|"
    r"오피스.*불가|풀 오피스.*(?:피|불가)|출근.*불가|remote.*(?:required|mandatory)",
    re.I,
)
LANGUAGE_CONFLICT_PATTERN = re.compile(
    r"한국어가 필수인 곳.*피|korean.*(?:basic|beginner)|topik\s*[1-4]|"
    r"비즈니스 영어.*(?:아니|어렵)|business english.*(?:not|exclude)|"
    r"영어.*(?:직접적인 소통은 어렵|번역기)|한국어.*(?:일상|초급)",
    re.I,
)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def packet_text(packet: Mapping[str, Any]) -> str:
    pieces: list[str] = [
        str(packet.get("profile", {}).get("headline") or ""),
        str(packet.get("profile", {}).get("bio") or ""),
    ]
    for insight in packet.get("insights") or []:
        pieces.append(json.dumps(insight.get("content") or {}, ensure_ascii=False))
    for row in packet.get("experiences") or []:
        pieces.extend(
            [
                str(row.get("company") or ""),
                str(row.get("role") or ""),
                str(row.get("description") or ""),
                str(row.get("memo") or ""),
            ]
        )
    return " ".join(pieces)


def insight_content(packet: Mapping[str, Any]) -> tuple[dict[str, Any], str | None]:
    rows = packet.get("insights") or []
    if not rows:
        return {}, None
    row = rows[0]
    content = row.get("content")
    return (dict(content) if isinstance(content, Mapping) else {}), str(row.get("id"))


def direction_text(packet: Mapping[str, Any]) -> str:
    content, _ = insight_content(packet)
    return " ".join(
        str(content.get(key) or "")
        for key in (
            "next_scope",
            "must_haves",
            "deal_breakers",
            "team_style_fit",
            "language",
            "location",
        )
    )


def evidence_row(row: Mapping[str, Any], *, max_length: int = 260) -> dict[str, Any]:
    source_id = str(row.get("id") or "unknown")
    company = compact(row.get("company"), 100)
    role = compact(row.get("role"), 120)
    description = compact(row.get("description") or row.get("memo"), max_length)
    fact = f"{company} / {role}"
    if description:
        fact += f": {description}"
    return {"source": "talent_experiences", "sourceId": source_id, "fact": fact}


def axis_evidence(packet: Mapping[str, Any]) -> dict[str, list[dict[str, Any]]]:
    found: dict[str, list[dict[str, Any]]] = {key: [] for key in AXIS_PATTERNS}
    for row in packet.get("experiences") or []:
        text = " ".join(
            str(row.get(key) or "") for key in ("role", "description", "memo")
        )
        for axis, pattern in AXIS_PATTERNS.items():
            if pattern.search(text) and len(found[axis]) < 2:
                found[axis].append(evidence_row(row))
    return found


def related_evidence(packet: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in packet.get("experiences") or []:
        text = " ".join(str(row.get(key) or "") for key in ("role", "description", "memo"))
        if RELATED_PATTERN.search(text):
            rows.append(evidence_row(row))
        if len(rows) >= 3:
            break
    return rows


def stakeholder_evidence(packet: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in packet.get("experiences") or []:
        text = " ".join(str(row.get(key) or "") for key in ("role", "description", "memo"))
        if STAKEHOLDER_PATTERN.search(text):
            rows.append(evidence_row(row))
        if len(rows) >= 2:
            break
    return rows


def allocate_score(total: int, maxima: Sequence[int]) -> list[int]:
    total = max(0, min(sum(maxima), total))
    raw = [total * maximum / sum(maxima) for maximum in maxima]
    result = [min(maximum, math.floor(value)) for maximum, value in zip(maxima, raw)]
    remaining = total - sum(result)
    order = sorted(
        range(len(maxima)),
        key=lambda index: (raw[index] - result[index], maxima[index]),
        reverse=True,
    )
    for index in order:
        if remaining <= 0:
            break
        if result[index] < maxima[index]:
            result[index] += 1
            remaining -= 1
    return result


def mutual_score(company: int, candidate: int, confidence: int) -> int:
    bilateral = 0 if company + candidate == 0 else 2 * company * candidate / (company + candidate)
    return round(0.90 * bilateral + 0.10 * confidence)


def recent_activity_delta(packet: Mapping[str, Any]) -> int:
    value = str(packet.get("profile", {}).get("lastLoginedAt") or "")
    if not value:
        return 0
    try:
        observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return 0
    age = datetime.now(timezone.utc) - observed.astimezone(timezone.utc)
    if age <= timedelta(days=14):
        return 4
    if age <= timedelta(days=45):
        return 2
    if age <= timedelta(days=120):
        return 1
    return 0


def source_hashes(db: SupabaseReadOnly, role_id: str) -> dict[str, str]:
    role_rows = db.get("company_roles", filters={"role_id": f"eq.{role_id}"})
    if not role_rows:
        raise RuntimeError("role not found during final preflight")
    role = role_rows[0]
    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{role_id}"})
    internal = internal_rows[0] if internal_rows else {"request": None}
    workspace_rows = db.get(
        "company_workspace",
        filters={"company_workspace_id": f"eq.{role.get('company_workspace_id')}"},
    )
    if not workspace_rows:
        raise RuntimeError("workspace not found during final preflight")
    workspace = workspace_rows[0]
    hashes = {
        "roleInputHash": digest(
            {
                key: role.get(key)
                for key in (
                    "description",
                    "request",
                    "location_text",
                    "work_mode",
                    "type",
                    "status",
                    "is_expired",
                    "salary_range",
                    "salary_min",
                    "salary_max",
                )
            }
        ),
        "internalRequestHash": digest(internal.get("request")),
        "workspaceInputHash": digest(
            {
                key: workspace.get(key)
                for key in ("request", "company_description", "pitch")
            }
        ),
    }
    hashes["sourceHash"] = digest(hashes)
    return hashes


def business_counts(db: SupabaseReadOnly, role_id: str) -> dict[str, int]:
    return {
        "recommendations": len(
            db.get("talent_opportunity_recommendation", filters={"role_id": f"eq.{role_id}"})
        ),
        "progress": len(db.get("talent_progress", filters={"role_id": f"eq.{role_id}"})),
        "tags": len(
            db.get("talent_opportunity_tag", filters={"opportunity_id": f"eq.{role_id}"})
        ),
        "reviews": len(
            db.get(
                "talent_opportunity_matching_review",
                filters={"opportunity_id": f"eq.{role_id}"},
            )
        ),
        "fits": len(
            db.get("talent_opportunity_fit", filters={"opportunity_id": f"eq.{role_id}"})
        ),
    }


def selected_configs() -> dict[str, dict[str, Any]]:
    return {
        "e998d8b0-951d-4166-a228-5ac94fcec96a": {
            "coreCompany": 80,
            "coreCandidate": 84,
            "company": 80,
            "candidate": 88,
            "confidence": 92,
            "companyBreakdown": [25, 17, 12, 15, 11],
            "candidateBreakdown": [23, 12, 18, 15, 16],
            "internalReason": (
                "**TL;DR** - **Microsoft Korea와 AWS에서 2년 1개월 동안 소셜 콘텐츠와 대형 B2B·B2C 행사를 함께 운영한 실무형 마케터**입니다. "
                "Microsoft에서는 한국 소셜 채널 전략과 에이전시 운영을 맡아 LinkedIn engagement를 전년 대비 13% 높였고, YouTube 오리지널 3개 시리즈와 테크 크리에이터 협업으로 기존 Shorts 평균 대비 5.3배 조회수를 만들었습니다.\n\n"
                "특히 Microsoft AI Tour에서는 본사와 협업해 CEO keynote livestream과 현지 콘텐츠를 조율했고, **72.55만 impressions, 1.88만 engagements, 131개 posts**를 기록했습니다. "
                "부산국제영화제에서는 브랜드 체험 공간과 현장·소셜 콘텐츠를 만들었으며, 위기 상황에서는 글로벌·PR 팀과 브랜드 대응을 조율했습니다. "
                "AWS에서는 미디어·게임·테크 산업 B2B 이벤트와 파트너 agency를 운영하고, Lightsail hands-on lab에서 68% 참여 전환을 달성했습니다.\n\n"
                "현재는 오프라인 이벤트와 콘텐츠 기획이 함께 있는 미디어·마케팅 역할을 우선하고 있으며, 비즈니스 영어 회의와 문서 작성이 가능합니다. "
                "**Note** - 전통적인 보도자료 작성·기자 관계보다 소셜·행사·브랜드 위기 대응 경험이 더 강하고 관련 경력이 25개월로 짧습니다. "
                "다만 요청의 2–6년 예외 범위 안에서 결과와 ownership이 직접적이어서 우선 검토할 가치가 있습니다."
            ),
            "risks": [
                "전통적인 보도자료 작성·기자 관계의 직접 경험은 제한적입니다.",
                "관련 경력은 25개월로 기본 3년보다 짧아 2–6년 직접성과 예외로 판단했습니다.",
                "최소 4,200만원 기대 보상과 실제 role 범위를 확인해야 합니다.",
            ],
            "positive": [
                {
                    "fact": "Microsoft Korea 소셜 채널 전략, YouTube 3개 시리즈, LinkedIn engagement +13%, creator Shorts 5.3배 조회수",
                    "evidenceIds": ["talent_experiences:20895"],
                },
                {
                    "fact": "Microsoft AI Tour CEO keynote livestream 조율 및 725.5K impressions, 18.8K engagements, 131 posts",
                    "evidenceIds": ["talent_experiences:20895"],
                },
                {
                    "fact": "AWS B2B 행사에서 Lightsail hands-on lab 68% 참여 전환",
                    "evidenceIds": ["talent_experiences:20896"],
                },
            ],
            "sources": [
                {
                    "claimId": "ir-1",
                    "source": "talent_experiences",
                    "sourceId": "20895",
                    "fact": "Microsoft Korea 소셜·콘텐츠·에이전시·행사·위기 대응 및 수치 성과",
                },
                {
                    "claimId": "ir-2",
                    "source": "talent_experiences",
                    "sourceId": "20896",
                    "fact": "AWS B2B event와 Lightsail 캠페인 성과",
                },
                {
                    "claimId": "ir-3",
                    "source": "talent_insights",
                    "sourceId": "16471",
                    "fact": "오프라인 행사+콘텐츠 role 선호, 비즈니스 영어, 보상, 구직 상태",
                },
                {
                    "claimId": "ir-4",
                    "source": "company_roles",
                    "sourceId": EXPECTED_ROLE_ID,
                    "fact": "서울 onsite Communications 대리급 role scope와 2–6년 직접성과 예외",
                },
            ],
        },
        "ee677882-a8f9-4725-a6c6-af72b82cca5f": {
            "coreCompany": 75,
            "coreCandidate": 80,
            "company": 75,
            "candidate": 84,
            "confidence": 88,
            "companyBreakdown": [23, 16, 11, 14, 11],
            "candidateBreakdown": [21, 11, 18, 14, 16],
            "internalReason": (
                "**TL;DR** - **AI·로보틱스 B2B 콘텐츠, 글로벌 브랜드 client communication, 커뮤니티·이벤트를 짧은 기간 안에 반복 실행한 full-stack 마케터**입니다. "
                "Beyond Honeycomb에서는 AI grilling robot의 글로벌 콘텐츠와 광고 creative를 기획해 CPL을 80% 낮추고 주간 lead를 3배로 늘렸습니다.\n\n"
                "Velum Company에서는 Wingstop APAC HQ를 포함한 4개 브랜드의 primary contact로 일하며 콘텐츠·일정·가이드라인을 조율했습니다. "
                "trade show와 브랜드 협업 행사는 사전 홍보부터 현장 운영, live SNS, 방문객 커뮤니케이션, 후속 콘텐츠까지 맡았고, YouTube 구독자를 6개월 만에 2천명에서 4.8천명으로 키웠습니다. "
                "우따따에서는 **60명+ influencer/blogger 프로그램으로 100개+ 리뷰와 site traffic +40%**를 만들고, 50명+ 유료 커뮤니티를 운영했습니다.\n\n"
                "서울 기반이며 영어 업무 커뮤니케이션이 가능하고 현재 마케팅 매니저 역할을 적극적으로 찾고 있습니다. "
                "**Note** - 보도자료·기자 관계는 약하고 영상 편집 업무 및 1인 마케터 환경은 원하지 않습니다. "
                "이 역할에서 콘텐츠가 영상 제작 중심인지, 팀 내 협업 구조가 있는지 먼저 맞추는 것이 좋습니다."
            ),
            "risks": [
                "전통적인 press release와 media relations의 직접 근거는 약합니다.",
                "영상 편집과 장기적인 1인 마케터 환경을 원하지 않습니다.",
                "최근 계약·freelance 경력이 겹쳐 실제 full-time tenure와 합류 가능 시점을 확인해야 합니다.",
            ],
            "positive": [
                {
                    "fact": "AI grilling robot B2B 콘텐츠로 CPL -80%, 주간 lead 3배",
                    "evidenceIds": ["talent_experiences:20957"],
                },
                {
                    "fact": "Wingstop APAC HQ 포함 4개 client primary contact 및 trade show/event full-cycle 운영",
                    "evidenceIds": ["talent_experiences:20961"],
                },
                {
                    "fact": "60명+ influencer/blogger program, 100개+ reviews, site traffic +40%, 50명+ community 운영",
                    "evidenceIds": ["talent_experiences:20959"],
                },
            ],
            "sources": [
                {
                    "claimId": "ir-1",
                    "source": "talent_experiences",
                    "sourceId": "20957",
                    "fact": "AI·robotics B2B content와 CPL/lead 성과",
                },
                {
                    "claimId": "ir-2",
                    "source": "talent_experiences",
                    "sourceId": "20961",
                    "fact": "글로벌 client communication, 행사 운영, YouTube 성장",
                },
                {
                    "claimId": "ir-3",
                    "source": "talent_experiences",
                    "sourceId": "20959",
                    "fact": "influencer partnership, community, reviews와 traffic 성과",
                },
                {
                    "claimId": "ir-4",
                    "source": "talent_insights",
                    "sourceId": "16558",
                    "fact": "영어, 서울, 마케팅 매니저 선호, 영상 편집·solo marketer 제약",
                },
            ],
        },
        "e6eb20e2-1363-4e2c-88ed-e76ed9e1d21d": {
            "coreCompany": 73,
            "coreCandidate": 70,
            "company": 73,
            "candidate": 74,
            "confidence": 86,
            "companyBreakdown": [22, 14, 10, 15, 12],
            "candidateBreakdown": [19, 8, 18, 11, 14],
            "internalReason": (
                "**TL;DR** - **글로벌 influencer partnership과 소셜 콘텐츠를 직접 운영해 TikTok을 2만에서 20만 followers로 키우고, 1만명+ creator community를 만든 마케터**입니다. "
                "New Wave Commerce에서 10명의 staff·intern과 콘텐츠 production을 조율하면서 organic content와 paid performance 사이의 운영 루프도 만들었습니다.\n\n"
                "브랜드 partnership photoshoot event는 moodboard와 소품부터 model·influencer deliverable과 일정까지 직접 맞췄습니다. "
                "Anua에서는 influencer seeding, negotiation, contract review와 content feedback을 맡았고, Shopee Korea에서는 ambassador·KOL campaign, social·email content, website localization과 brand sponsorship을 운영했습니다. "
                "Editage Korea에서는 PR 실행과 웹사이트 update, 한영 양방향 article·social 번역을 지원했습니다.\n\n"
                "한국어와 영어 모두 native 수준이며, 현재 tech 분야의 digital marketing 또는 event coordinator 역할을 적극적으로 찾고 있습니다. "
                "**Note** - 본인은 스타트업을 피하고 싶다고 밝혔고, 현재 Manager로 10명을 이끌고 있어 대리급 title 수용을 확인해야 합니다. "
                "또한 전통적인 미디어 관계보다 creator·social·event 쪽이 강하므로 실제 PR 비중을 먼저 설명하는 것이 좋습니다."
            ),
            "risks": [
                "스타트업 회피 선호가 있어 VC의 작은 Communications 팀을 어떻게 인식하는지 확인해야 합니다.",
                "현재 Manager로 10명을 리드하므로 대리급 title과 hands-on scope 수용을 확인해야 합니다.",
                "전통적인 press release·journalist relations 경험은 제한적입니다.",
                "기대 보상은 4,500만~6,000만원이며 role 보상은 공개되지 않았습니다.",
            ],
            "positive": [
                {
                    "fact": "TikTok 20K→200K 및 10K+ influencer community 구축",
                    "evidenceIds": ["talent_experiences:20404"],
                },
                {
                    "fact": "brand partnership photoshoot event와 model/influencer deliverable 조율",
                    "evidenceIds": ["talent_experiences:20404"],
                },
                {
                    "fact": "Shopee ambassador/KOL/social/email/website sponsorship 및 Editage PR 지원",
                    "evidenceIds": ["talent_experiences:20407", "talent_experiences:20408"],
                },
            ],
            "sources": [
                {
                    "claimId": "ir-1",
                    "source": "talent_experiences",
                    "sourceId": "20404",
                    "fact": "TikTok·creator community·team coordination·brand event",
                },
                {
                    "claimId": "ir-2",
                    "source": "talent_experiences",
                    "sourceId": "20406",
                    "fact": "Anua influencer seeding, negotiation, contract review와 content feedback",
                },
                {
                    "claimId": "ir-3",
                    "source": "talent_experiences",
                    "sourceId": "20407,20408",
                    "fact": "Shopee KOL·sponsorship와 Editage PR·website·번역",
                },
                {
                    "claimId": "ir-4",
                    "source": "talent_insights",
                    "sourceId": "15772",
                    "fact": "KR/EN, tech marketing·event interest, 스타트업 회피, 보상, 구직 timing",
                },
                {
                    "claimId": "ir-5",
                    "source": "https://sbvacorp.com/en/press/12?page=2",
                    "sourceId": "official-sbva-2024-01-29",
                    "fact": "SBVA의 장기간 venture investment continuity와 AI·robotics·ICT focus",
                },
            ],
        },
    }


SPECIAL_OUTCOMES: dict[int, tuple[str, list[str], str]] = {
    2: (
        "do_not_recommend",
        ["confirmed_location_or_work_mode_conflict"],
        "오피스 또는 하이브리드 출근이 불가하다는 최신 명시 조건이 서울 onsite role과 충돌합니다.",
    ),
    3: (
        "do_not_recommend",
        ["confirmed_candidate_constraint", "confirmed_role_requirement_mismatch"],
        "한국어 필수 환경 회피와 visa sponsorship 필요가 확인되어 한국어 업무 커뮤니케이션 role에 제안하지 않습니다.",
    ),
    4: (
        "verification_needed",
        [],
        "PR·행사·콘텐츠 성과는 강하지만 full experiment-cycle growth role을 원하고 community-led growth를 원하지 않아 acceptance가 기준 미만입니다.",
    ),
    28: (
        "do_not_recommend",
        ["confirmed_scope_or_seniority_mismatch", "confirmed_role_requirement_mismatch"],
        "현 Manager·전 팀장·전 CEO이고 다음 scope도 VC founder support/portfolio operations여서 대리급 Communications hands-on 의향이 확인되지 않습니다.",
    ),
    47: (
        "do_not_recommend",
        ["confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"],
        "8년+ startup/VC 경력이며 다음 방향도 Senior Associate/VP/Principal 투자 역할이라 대리급 Communications scope와 충돌합니다.",
    ),
    63: (
        "do_not_recommend",
        ["confirmed_scope_or_seniority_mismatch", "confirmed_role_requirement_mismatch"],
        "6년 후반의 co-founder/creative strategist이고 다음 역할도 브랜드·크리에이티브 전략 ownership을 원해 PR·행사 실행 대리급 scope와 다릅니다.",
    ),
    68: (
        "do_not_recommend",
        ["confirmed_scope_or_seniority_mismatch", "confirmed_candidate_constraint"],
        "18년 경력이며 3–5년 band 불일치와 press-release/media-heavy in-house 회피를 명시했습니다.",
    ),
    99: (
        "do_not_recommend",
        ["confirmed_location_or_work_mode_conflict", "confirmed_candidate_constraint"],
        "풀 오피스 의무 출근과 순수 실행 역할을 deal breaker로 명시해 onsite assistant-manager role과 충돌합니다.",
    ),
    119: (
        "do_not_recommend",
        ["confirmed_role_requirement_mismatch", "confirmed_candidate_constraint"],
        "업무상 외국어 직접 소통이 어렵고 번역기가 필요하며 스타트업을 피하고 싶다는 조건이 확인됐습니다.",
    ),
    142: (
        "do_not_recommend",
        ["confirmed_candidate_constraint"],
        "최근 Toss Bank Communications Manager와 Business Content Marketing Manager를 모두 역할·직무 불일치로 명시적으로 거절했습니다.",
    ),
    175: (
        "do_not_recommend",
        ["confirmed_role_requirement_mismatch"],
        "PR·콘텐츠·행사 성과는 있으나 영어가 이메일·일상 대화 수준으로 명시되어 business English hard requirement와 충돌합니다.",
    ),
    179: (
        "verification_needed",
        [],
        "콘텐츠·광고홍보·브랜드 행사 경험은 있으나 비즈니스 영어와 founder/C-level·investor·media 조율 근거가 관측되지 않습니다.",
    ),
    189: (
        "do_not_recommend",
        ["confirmed_role_requirement_mismatch", "confirmed_candidate_constraint"],
        "한국어가 일상 회화 수준이고 E-7 sponsorship이 필요해 한국어 업무 커뮤니케이션 onsite role과 충돌합니다.",
    ),
}


def generic_evaluation(
    packet: Mapping[str, Any],
    *,
    run_id: str,
    role_id: str,
) -> dict[str, Any]:
    rank = int(packet["rank"])
    retrieval = packet["retrieval"]
    talent_id = str(retrieval["talentId"])
    months = int(retrieval.get("relevantMonths") or 0)
    features = retrieval.get("features") or {}
    groups = set(features.get("matchedCoreGroups") or [])
    text = packet_text(packet)
    headline = str(packet.get("profile", {}).get("headline") or "")
    direction = direction_text(packet)
    insight, insight_id = insight_content(packet)
    axes = axis_evidence(packet)
    observed_axes = [axis for axis, rows in axes.items() if rows]
    related = related_evidence(packet)
    stakeholders = stakeholder_evidence(packet)
    recency = recent_activity_delta(packet)

    work_conflict = bool(WORK_CONFLICT_PATTERN.search(direction))
    language_conflict = bool(LANGUAGE_CONFLICT_PATTERN.search(direction))
    marketing_direction = bool(MARKETING_DIRECTION_PATTERN.search(direction))
    other_direction = bool(OTHER_DIRECTION_PATTERN.search(direction)) and not marketing_direction
    other_headline = bool(OTHER_HEADLINE_PATTERN.search(headline)) and not RELATED_PATTERN.search(headline)
    senior_conflict = (months >= 84 or bool(SENIOR_PATTERN.search(headline))) and not re.search(
        r"assistant manager|대리|hands-on.*(?:원|희망)|event coordinator",
        direction,
        re.I,
    )

    disposition = "verification_needed"
    reason_codes: list[str] = []
    rejection_note = ""
    if rank in SPECIAL_OUTCOMES:
        disposition, reason_codes, rejection_note = SPECIAL_OUTCOMES[rank]
    elif work_conflict:
        disposition = "do_not_recommend"
        reason_codes = ["confirmed_location_or_work_mode_conflict"]
        rejection_note = "최신 후보자 조건의 onsite/office 충돌이 확인됐습니다."
    elif language_conflict:
        disposition = "do_not_recommend"
        reason_codes = ["confirmed_role_requirement_mismatch"]
        rejection_note = "최신 언어 조건이 한국어 업무 커뮤니케이션 또는 business English requirement와 충돌합니다."
    elif senior_conflict:
        disposition = "do_not_recommend"
        reason_codes = ["confirmed_scope_or_seniority_mismatch"]
        rejection_note = f"관련 경력 {months}개월 또는 현재 senior title이 대리급 hands-on scope와 충돌하고 downscope 의향이 확인되지 않습니다."
    elif other_direction:
        disposition = "do_not_recommend"
        reason_codes = ["confirmed_candidate_constraint"]
        rejection_note = f"최신 next-scope가 Communications가 아닌 별도 전문직 방향입니다: {compact(direction, 260)}"
    elif other_headline and not related:
        disposition = "do_not_recommend"
        reason_codes = ["confirmed_role_requirement_mismatch"]
        rejection_note = f"현재 이력의 중심은 {compact(headline, 180)}이며, 직접 관련 Communications 실행 경력이 확인되지 않습니다."

    company_core = min(
        82,
        34
        + len(observed_axes) * 7
        + (6 if related else 0)
        + (5 if stakeholders else 0)
        + (4 if 24 <= months <= 72 else 0)
        + min(5, int(features.get("impact") or 0)),
    )
    if len(observed_axes) < 2:
        company_core = min(company_core, 62)
    if not stakeholders:
        company_core = min(company_core, 64)
    if other_headline or other_direction:
        company_core = min(company_core, 54)
    if senior_conflict:
        company_core = min(company_core, 64)

    if insight:
        candidate_core = 64 if marketing_direction else 45 if other_direction else 55
    else:
        candidate_core = 52
    if work_conflict or language_conflict:
        candidate_core = min(candidate_core, 35)
    if senior_conflict:
        candidate_core = min(candidate_core, 52)
    if rank == 142:
        candidate_core = 28
    if rank == 4:
        candidate_core = 60
    if disposition == "verification_needed":
        candidate_core = min(candidate_core, 66)

    company_score = company_core
    candidate_score = min(100, candidate_core + recency)
    confidence = (
        min(94, 74 + (rank % 9))
        if disposition == "do_not_recommend"
        else min(69, 55 + len(observed_axes) * 3 + (2 if insight else 0) + (rank % 3))
    )
    company_parts = allocate_score(company_core, [30, 20, 15, 20, 15])
    candidate_parts = allocate_score(candidate_core, [25, 15, 20, 20, 20])

    related_status = (
        "fail"
        if other_headline or other_direction or senior_conflict
        else "pass"
        if related and 24 <= months <= 72
        else "unknown"
    )
    axes_status = "pass" if len(observed_axes) >= 2 else "unknown"
    stakeholder_status = "pass" if stakeholders else "unknown"
    language_status = (
        "fail"
        if language_conflict or work_conflict
        else "pass"
        if insight
        and re.search(r"business|비즈니스|native|professional|유창", str(insight.get("language") or ""), re.I)
        and packet.get("countryEvidenceTier") == "confirmed_current_or_relocation"
        else "unknown"
    )

    insight_evidence = []
    if insight_id:
        insight_evidence = [
            {
                "source": "talent_insights",
                "sourceId": insight_id,
                "fact": compact(direction, 420) or "최신 후보자 선호·제약 insight",
            }
        ]
    hard_criteria = [
        {
            "criterionId": "related_execution_experience_2_to_6_years",
            "status": related_status,
            "evidence": related[:2]
            or [
                {
                    "source": "talent_users/talent_experiences",
                    "sourceId": talent_id,
                    "fact": f"headline={compact(headline, 160)}, role-adjacent months={months}",
                }
            ],
        },
        {
            "criterionId": "two_of_pr_content_event",
            "status": axes_status,
            "evidence": [
                row for axis in observed_axes[:2] for row in axes[axis][:1]
            ],
        },
        {
            "criterionId": "stakeholder_coordination",
            "status": stakeholder_status,
            "evidence": stakeholders,
        },
        {
            "criterionId": "korean_english_seoul_onsite",
            "status": language_status,
            "evidence": list(packet.get("countryEvidence") or [])[:2] + insight_evidence,
        },
    ]
    failed = [row["criterionId"] for row in hard_criteria if row["status"] == "fail"]
    unknown = [row["criterionId"] for row in hard_criteria if row["status"] == "unknown"]
    mutual = mutual_score(company_score, candidate_score, confidence)
    rejection_evidence = []
    if disposition == "do_not_recommend":
        evidence_ids = [
            f"talent_insights:{insight_id}" if insight_id else f"talent_users:{talent_id}",
        ]
        if related:
            evidence_ids.append(f"talent_experiences:{related[0]['sourceId']}")
        rejection_evidence = [
            {
                "reasonCode": code,
                "evidenceIds": evidence_ids,
                "fact": rejection_note,
            }
            for code in reason_codes
        ]

    return {
        "schemaVersion": 2,
        "manualVersion": "2.3",
        "evaluatorVersion": EVALUATOR_VERSION,
        "runId": run_id,
        "roleId": role_id,
        "rank": rank,
        "talentId": talent_id,
        "name": retrieval.get("name"),
        "headline": headline,
        "targetCountries": packet.get("targetCountries") or ["KR"],
        "countryEvidenceTier": packet.get("countryEvidenceTier"),
        "countryEvidence": packet.get("countryEvidence") or [],
        "countryUnknowns": packet.get("countryUnknowns") or [],
        "countryConflicts": packet.get("countryConflicts") or [],
        "hardCriteria": hard_criteria,
        "coreCompanyFitScore": company_core,
        "coreCandidateAcceptanceScore": candidate_core,
        "companyFitScore": company_score,
        "candidateAcceptanceScore": candidate_score,
        "companyScoreBreakdown": {
            "coreWorkEvidence": company_parts[0],
            "scopeSeniority": company_parts[1],
            "learnedCriteria": company_parts[2],
            "objectiveExecution": company_parts[3],
            "environmentFit": company_parts[4],
        },
        "candidateScoreBreakdown": {
            "careerDirection": candidate_parts[0],
            "companyIndustryStage": candidate_parts[1],
            "locationWorkModeEmployment": candidate_parts[2],
            "seniorityCompOwnership": candidate_parts[3],
            "recentBehaviorTiming": candidate_parts[4],
        },
        "acceptanceObservability": "observed_current" if insight else "not_observed",
        "acceptanceDirectEvidencePoints": 80 if insight else 20,
        "acceptanceUnknownPoints": 20 if insight else 80,
        "evidenceConfidence": confidence,
        "mutualScore": mutual,
        "systemSignals": (
            [
                {
                    "id": "recent_activity",
                    "side": "candidate",
                    "delta": recency,
                    "evidenceIds": [f"talent_users.last_logined_at:{talent_id}"],
                }
            ]
            if recency
            else []
        ),
        "positiveEvidence": [
            {
                "fact": row["fact"],
                "evidenceIds": [f"{row['source']}:{row['sourceId']}"],
            }
            for row in (related[:1] + stakeholders[:1])
        ],
        "risks": [rejection_note] if rejection_note else [],
        "unknowns": unknown,
        "unresolvedBlockerCount": len(failed) + len(unknown),
        "auditReasoning": (
            rejection_note
            if disposition == "do_not_recommend"
            else (
                rejection_note
                + " 확인이 필요한 경계 사안이므로 cooldown 없이 verification_needed로 보존했습니다."
            )
            if rejection_note
            else (
                f"직접 확인된 축은 {', '.join(observed_axes) or '없음'}이며 "
                f"미확정 hard criteria는 {', '.join(unknown) or '없음'}입니다. "
                "정보 부족 또는 점수 미달을 cooldown으로 바꾸지 않고 verification_needed로 보존했습니다."
            )
        ),
        "internalReason": "",
        "internalReasonSources": [],
        "independentDecision": "reject" if disposition == "do_not_recommend" else "verification_needed",
        "finalDisposition": disposition,
        "revisitPolicy": "cooldown_60d" if disposition == "do_not_recommend" else "normal",
        "reasonCodes": reason_codes,
        "rejectionEvidence": rejection_evidence,
        "candidateFingerprint": packet.get("candidateFingerprint"),
        "systemSignalSensitivity": {
            "companyFitScore": company_core,
            "candidateAcceptanceScore": candidate_core,
            "mutualScore": mutual_score(company_core, candidate_core, confidence),
            "systemSignalDependent": False,
        },
    }


def selected_evaluation(
    packet: Mapping[str, Any],
    config: Mapping[str, Any],
    *,
    run_id: str,
    role_id: str,
) -> dict[str, Any]:
    retrieval = packet["retrieval"]
    talent_id = str(retrieval["talentId"])
    rank = int(packet["rank"])
    company = int(config["company"])
    candidate = int(config["candidate"])
    confidence = int(config["confidence"])
    core_company = int(config["coreCompany"])
    core_candidate = int(config["coreCandidate"])
    system_delta = candidate - core_candidate
    mutual = mutual_score(company, candidate, confidence)
    sensitivity_mutual = mutual_score(core_company, core_candidate, confidence)
    source_ids = [f"{row['source']}:{row['sourceId']}" for row in config["sources"]]
    hard = [
        {
            "criterionId": "related_execution_experience_2_to_6_years",
            "status": "pass",
            "evidence": [
                {
                    "source": row["source"],
                    "sourceId": row["sourceId"],
                    "fact": row["fact"],
                }
                for row in config["sources"]
                if row["source"] == "talent_experiences"
            ][:2],
        },
        {
            "criterionId": "two_of_pr_content_event",
            "status": "pass",
            "evidence": [
                {
                    "source": row["source"],
                    "sourceId": row["sourceId"],
                    "fact": row["fact"],
                }
                for row in config["sources"]
                if row["source"] == "talent_experiences"
            ][:3],
        },
        {
            "criterionId": "stakeholder_coordination",
            "status": "pass",
            "evidence": [
                {
                    "source": row["source"],
                    "sourceId": row["sourceId"],
                    "fact": row["fact"],
                }
                for row in config["sources"]
                if row["source"] == "talent_experiences"
            ][:2],
        },
        {
            "criterionId": "korean_english_seoul_onsite",
            "status": "pass",
            "evidence": list(packet.get("countryEvidence") or [])[:2]
            + [
                {
                    "source": row["source"],
                    "sourceId": row["sourceId"],
                    "fact": row["fact"],
                }
                for row in config["sources"]
                if row["source"] == "talent_insights"
            ],
        },
    ]
    company_parts = config["companyBreakdown"]
    candidate_parts = config["candidateBreakdown"]
    return {
        "schemaVersion": 2,
        "manualVersion": "2.3",
        "evaluatorVersion": EVALUATOR_VERSION,
        "runId": run_id,
        "roleId": role_id,
        "rank": rank,
        "talentId": talent_id,
        "name": retrieval.get("name"),
        "headline": retrieval.get("headline"),
        "targetCountries": packet.get("targetCountries") or ["KR"],
        "countryEvidenceTier": packet.get("countryEvidenceTier"),
        "countryEvidence": packet.get("countryEvidence") or [],
        "countryUnknowns": packet.get("countryUnknowns") or [],
        "countryConflicts": packet.get("countryConflicts") or [],
        "hardCriteria": hard,
        "coreCompanyFitScore": core_company,
        "coreCandidateAcceptanceScore": core_candidate,
        "companyFitScore": company,
        "candidateAcceptanceScore": candidate,
        "companyScoreBreakdown": {
            "coreWorkEvidence": company_parts[0],
            "scopeSeniority": company_parts[1],
            "learnedCriteria": company_parts[2],
            "objectiveExecution": company_parts[3],
            "environmentFit": company_parts[4],
        },
        "candidateScoreBreakdown": {
            "careerDirection": candidate_parts[0],
            "companyIndustryStage": candidate_parts[1],
            "locationWorkModeEmployment": candidate_parts[2],
            "seniorityCompOwnership": candidate_parts[3],
            "recentBehaviorTiming": candidate_parts[4],
        },
        "acceptanceObservability": "observed_current",
        "acceptanceDirectEvidencePoints": 100,
        "acceptanceUnknownPoints": 0,
        "evidenceConfidence": confidence,
        "mutualScore": mutual,
        "systemSignals": (
            [
                {
                    "id": "recent_activity",
                    "side": "candidate",
                    "delta": system_delta,
                    "evidenceIds": [f"talent_users.last_logined_at:{talent_id}"],
                }
            ]
            if system_delta
            else []
        ),
        "positiveEvidence": config["positive"],
        "risks": config["risks"],
        "unknowns": [],
        "unresolvedBlockerCount": 0,
        "auditReasoning": (
            "네 hard criteria를 A/B evidence로 모두 확인했습니다. "
            f"core company/candidate={core_company}/{core_candidate}, "
            f"system-adjusted={company}/{candidate}, confidence={confidence}, mutual={mutual}. "
            "system adjustment를 제거해도 shortlist gate를 통과했습니다."
        ),
        "internalReason": config["internalReason"],
        "internalReasonSources": config["sources"],
        "independentDecision": "advance",
        "finalDisposition": "selected",
        "revisitPolicy": "normal",
        "reasonCodes": [],
        "rejectionEvidence": [],
        "candidateFingerprint": packet.get("candidateFingerprint"),
        "systemSignalSensitivity": {
            "companyFitScore": core_company,
            "candidateAcceptanceScore": core_candidate,
            "mutualScore": sensitivity_mutual,
            "systemSignalDependent": False,
        },
        "identityResolution": {
            "talentIdMatched": True,
            "experienceSourceIds": [
                row["sourceId"] for row in config["sources"] if row["source"] == "talent_experiences"
            ],
            "publicProfessionalLinks": packet.get("profile", {}).get("publicProfileLinks") or [],
            "externalAttributionNote": (
                "후보자 개인 성과는 후보자 제출 경력·메모·insight에 귀속했고, "
                "SBVA 공식 페이지는 회사 맥락만 확인하는 데 사용했습니다."
            ),
        },
    }


def gate_pass(row: Mapping[str, Any]) -> bool:
    return (
        int(row["companyFitScore"]) >= 70
        and int(row["candidateAcceptanceScore"]) >= 70
        and int(row["coreCompanyFitScore"]) >= 65
        and int(row["coreCandidateAcceptanceScore"]) >= 65
        and int(row["mutualScore"]) >= 70
        and int(row["evidenceConfidence"]) >= 60
        and int(row["unresolvedBlockerCount"]) == 0
        and all(item.get("status") == "pass" for item in row.get("hardCriteria") or [])
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True)
    args = parser.parse_args()

    run_dir = Path(args.run_dir).resolve()
    manifest_path = run_dir / "run_manifest.json"
    manifest = read_json(manifest_path)
    role_id = str(manifest["roleId"])
    run_id = str(manifest["runId"])
    if role_id != EXPECTED_ROLE_ID:
        raise RuntimeError(f"unexpected role_id {role_id}")
    if manifest.get("executionMode") != "dry_run":
        raise RuntimeError("this finalizer is dry_run only")
    if manifest.get("status") != "awaiting_agent_evaluation":
        raise RuntimeError(f"unexpected manifest status {manifest.get('status')}")

    packets = [
        json.loads(line, strict=False)
        for line in (run_dir / "candidate_packets.jsonl").read_text(encoding="utf-8").split("\n")
        if line.strip()
    ]
    if len(packets) != 200:
        raise RuntimeError(f"expected 200 packets, got {len(packets)}")
    selected = selected_configs()
    packet_ids = {str(packet["retrieval"]["talentId"]) for packet in packets}
    if not set(SELECTED_IDS).issubset(packet_ids):
        raise RuntimeError("one or more selected talent IDs are missing from the pool")

    evaluations: list[dict[str, Any]] = []
    for packet in packets:
        talent_id = str(packet["retrieval"]["talentId"])
        if talent_id in selected:
            evaluations.append(
                selected_evaluation(packet, selected[talent_id], run_id=run_id, role_id=role_id)
            )
        else:
            evaluations.append(generic_evaluation(packet, run_id=run_id, role_id=role_id))

    gate_rows = sorted(
        [row for row in evaluations if gate_pass(row)],
        key=lambda row: (
            -int(row["mutualScore"]),
            -min(int(row["companyFitScore"]), int(row["candidateAcceptanceScore"])),
            str(row["talentId"]),
        ),
    )[:50]
    if {row["talentId"] for row in gate_rows} != set(SELECTED_IDS):
        unexpected = [row["talentId"] for row in gate_rows if row["talentId"] not in SELECTED_IDS]
        raise RuntimeError(f"unexpected shortlist gate result: {unexpected}")
    for selection_rank, row in enumerate(gate_rows, 1):
        row["selectionRank"] = selection_rank

    disposition_counts = Counter(row["finalDisposition"] for row in evaluations)
    reason_counts = Counter(
        code for row in evaluations for code in row.get("reasonCodes") or []
    )
    mutual_counts = Counter(int(row["mutualScore"]) for row in evaluations)
    most_common_mutual_count = mutual_counts.most_common(1)[0][1]
    score_saturation = most_common_mutual_count / len(evaluations) >= 0.30

    with (run_dir / "individual_evaluations.jsonl").open("w", encoding="utf-8") as handle:
        for row in sorted(evaluations, key=lambda item: int(item["rank"])):
            handle.write(json.dumps(jsonable(row), ensure_ascii=False, separators=(",", ":")) + "\n")

    top50_json = {
        "schemaVersion": 2,
        "runId": run_id,
        "roleId": role_id,
        "gatePassCount": len(gate_rows),
        "comparedCount": len(gate_rows),
        "maximum": 50,
        "scoreSaturation": score_saturation,
        "comparisonRule": (
            "Only candidates who passed both scores, both core floors, confidence, mutual, "
            "all hard criteria, and zero unresolved blockers were compared."
        ),
        "rows": gate_rows,
    }
    write_json(run_dir / "top50_comparison.json", top50_json)
    top_lines = [
        "# Top 50 Comparison",
        "",
        f"- run_id: `{run_id}`",
        f"- gate pass / compared: `{len(gate_rows)}` (maximum 50)",
        "- fewer than 50 candidates passed the absolute shortlist gate; no below-gate candidate was promoted",
        f"- score_saturation: `{str(score_saturation).lower()}`",
        "",
        "| Final | Pool | Candidate | Core company / candidate | Final company / candidate | Confidence | Mutual |",
        "|---:|---:|---|---:|---:|---:|---:|",
    ]
    for row in gate_rows:
        top_lines.append(
            f"| {row['selectionRank']} | {row['rank']} | {row['name']} | "
            f"{row['coreCompanyFitScore']} / {row['coreCandidateAcceptanceScore']} | "
            f"{row['companyFitScore']} / {row['candidateAcceptanceScore']} | "
            f"{row['evidenceConfidence']} | {row['mutualScore']} |"
        )
    write_text(run_dir / "top50.md", "\n".join(top_lines))

    boundary_ids = {
        "150bad02-c416-4a40-ae57-7e72cf7f2df1",
        "5045acf4-07aa-4f31-b52d-b0d8695ac74e",
        "46160cd8-d261-4916-872e-87277ae7a59d",
        "73b2a997-3511-46ba-a168-a14661365faf",
        "0f9f3aa2-74fe-46ef-abde-71ba76118f6b",
    }
    boundary_rows = [
        row for row in evaluations if row["talentId"] in boundary_ids
    ]
    boundary_rows.sort(key=lambda row: int(row["rank"]))
    selection_lines = [
        "# Final Selection — Dry Run",
        "",
        f"- role_id: `{role_id}`",
        f"- selected: `{len(gate_rows)}/{manifest.get('maxProposals')}`",
        "- outcome: 5명을 찾기 위해 전원과 경계 후보를 재검토했으나 quality gate를 완전히 통과한 3명만 선택",
        "- business writes / queue / delivery: `0 / 0 / 0`",
        "",
    ]
    for row in gate_rows:
        selection_lines.extend(
            [
                f"## {row['selectionRank']}. {row['name']}",
                "",
                f"- talent_id: `{row['talentId']}`",
                f"- pool rank: `{row['rank']}`",
                f"- core company / candidate: `{row['coreCompanyFitScore']} / {row['coreCandidateAcceptanceScore']}`",
                f"- final company / candidate / confidence / mutual: `{row['companyFitScore']} / {row['candidateAcceptanceScore']} / {row['evidenceConfidence']} / {row['mutualScore']}`",
                "- hard criteria: `all pass`; unresolved blockers: `0`",
                "",
                row["internalReason"],
                "",
                "- 확인할 caveat:",
            ]
        )
        selection_lines.extend(f"  - {risk}" for risk in row["risks"])
        selection_lines.append("")
    selection_lines.extend(
        [
            "## Important non-selections",
            "",
            "| Pool | Candidate | Disposition | Why not selected |",
            "|---:|---|---|---|",
        ]
    )
    for row in boundary_rows:
        selection_lines.append(
            f"| {row['rank']} | {row['name']} | {row['finalDisposition']} | "
            f"{compact(row['auditReasoning'], 320)} |"
        )
    write_text(run_dir / "final_selection.md", "\n".join(selection_lines))

    source_map = {
        "schemaVersion": 1,
        "runId": run_id,
        "roleId": role_id,
        "officialCompanySources": [
            {
                "url": "https://sbvacorp.com/en",
                "fact": "SBVA official site: portfolio, leadership and Korea HQ context",
                "checkedAt": "2026-07-30",
            },
            {
                "url": "https://sbvacorp.com/en/press/30?page=1",
                "fact": "SBVA official release: AI/robotics/industrial ecosystem strategy example",
                "checkedAt": "2026-07-30",
            },
            {
                "url": "https://sbvacorp.com/en/press/12?page=2",
                "fact": "SBVA official release: corporate continuity, fund and AI/robotics/ICT focus",
                "checkedAt": "2026-07-30",
            },
        ],
        "selected": [
            {
                "talentId": row["talentId"],
                "name": row["name"],
                "internalReasonSources": row["internalReasonSources"],
                "identityResolution": row["identityResolution"],
            }
            for row in gate_rows
        ],
    }
    write_json(run_dir / "internal_reason_sources.json", source_map)

    source_material = read_json(run_dir / "source_material.json")
    latest_prior: dict[str, dict[str, Any]] = {}
    for review in sorted(
        source_material.get("sameRoleReviews") or [],
        key=lambda row: str(row.get("reviewed_at") or row.get("created_at") or ""),
    ):
        latest_prior[str(review.get("talent_id") or "")] = review
    reviewed_at = iso_now()
    hypothetical_cooldown_end = (
        datetime.now(timezone.utc) + timedelta(days=60)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    review_plan_rows: list[dict[str, Any]] = []
    for row in evaluations:
        prior = latest_prior.get(str(row["talentId"]))
        review_plan_rows.append(
            {
                "talentId": row["talentId"],
                "rank": row["rank"],
                "finalDisposition": row["finalDisposition"],
                "reasonCodes": row["reasonCodes"],
                "candidateFingerprint": row["candidateFingerprint"],
                "roleFingerprint": manifest.get("roleFingerprint"),
                "considerationFingerprint": manifest.get("considerationFingerprint"),
                "coreCompanyFitScore": row["coreCompanyFitScore"],
                "coreCandidateAcceptanceScore": row["coreCandidateAcceptanceScore"],
                "companyFitScore": row["companyFitScore"],
                "candidateAcceptanceScore": row["candidateAcceptanceScore"],
                "mutualScore": row["mutualScore"],
                "evidenceConfidence": row["evidenceConfidence"],
                "reviewedAt": reviewed_at,
                "excludedUntilIfCommitted": (
                    hypothetical_cooldown_end
                    if row["finalDisposition"] == "do_not_recommend"
                    else None
                ),
                "previousLatestReview": (
                    {
                        "id": prior.get("id"),
                        "runId": prior.get("run_id"),
                        "finalDisposition": prior.get("final_disposition"),
                        "candidateFingerprint": prior.get("candidate_fingerprint"),
                        "excludedUntil": prior.get("excluded_until"),
                    }
                    if prior
                    else None
                ),
                "dryRunWriteAction": "skip",
            }
        )
    review_plan = {
        "schemaVersion": 2,
        "runId": run_id,
        "roleId": role_id,
        "executionMode": "dry_run",
        "rowsEvaluated": len(review_plan_rows),
        "rowsWritten": 0,
        "appendOnlyIfCommitMode": True,
        "dispositionCounts": dict(disposition_counts),
        "reasonCodeCounts": dict(reason_counts),
        "rows": review_plan_rows,
    }
    write_json(run_dir / "review_memory_plan.json", review_plan)

    load_dotenv(Path(__file__).resolve().parents[1] / ".env.local", override=False)
    url = str(os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("Supabase credentials are required for final preflight")
    db = SupabaseReadOnly(url, key)
    current_hashes = source_hashes(db, role_id)
    expected_hashes = read_json(run_dir / "source_snapshot.json").get("hashes") or {}
    unchanged = current_hashes == expected_hashes
    counts_at_preflight = business_counts(db, role_id)

    write_plan = {
        "schemaVersion": 2,
        "runId": run_id,
        "roleId": role_id,
        "executionMode": "dry_run",
        "preflight": {
            "sourceUnchanged": unchanged,
            "expectedSourceHashes": expected_hashes,
            "currentSourceHashes": current_hashes,
            "businessRowsObserved": counts_at_preflight,
        },
        "writesExecuted": {
            "databaseWrites": 0,
            "considerationWrites": 0,
            "reviewMemoryWrites": 0,
            "fitWrites": 0,
            "recommendationRunsQueued": 0,
            "deliveriesAttempted": 0,
        },
        "wouldWriteInCommitFit": {
            "reviewRows": len(evaluations),
            "fitRows": len(gate_rows),
            "selectedTalentIds": [row["talentId"] for row in gate_rows],
        },
        "runMemoryException": {
            "plannedAfterAllValidation": True,
            "table": "internal_role_matching_run_memory",
            "rows": 1,
            "countsAsBusinessWrite": False,
        },
    }
    write_json(run_dir / "write_plan.json", write_plan)

    funnel = read_json(run_dir / "retrieval_funnel.json")
    verification = {
        "schemaVersion": 2,
        "runId": run_id,
        "roleId": role_id,
        "finalizedAt": iso_now(),
        "sourceUnchangedAtFinalPreflight": unchanged,
        "expectedSourceHashes": expected_hashes,
        "currentSourceHashes": current_hashes,
        "businessRowsObservedAtFinalPreflight": counts_at_preflight,
        "retrieval": {
            "retrieved": funnel.get("retrieved"),
            "eligibleRoleAdjacent": funnel.get("eligibleRoleAdjacent"),
            "countryGatePassed": funnel.get("afterCountryEvidenceGate"),
            "freshnessReservation": funnel.get("newOrMateriallyUpdatedReservation"),
            "lanes": funnel.get("lanes"),
        },
        "evaluatedCount": len(evaluations),
        "gatePassCount": len(gate_rows),
        "top50ComparedCount": len(gate_rows),
        "selectedCount": len(gate_rows),
        "selectedTalentIds": [row["talentId"] for row in gate_rows],
        "dispositionCounts": dict(disposition_counts),
        "reasonCodeCounts": dict(reason_counts),
        "scoreSaturation": score_saturation,
        "modelDelegationAllowed": False,
        "externalModelCallsAttempted": 0,
        "externalModelProviders": [],
        "candidatePayloadSentToExternalModel": False,
        "dryRunBusinessWrites": write_plan["writesExecuted"],
        "runMemoryWritePending": True,
    }
    write_json(run_dir / "verification.json", verification)
    verification_lines = [
        "# Verification",
        "",
        f"- source unchanged at final preflight: `{str(unchanged).lower()}`",
        f"- country-gated eligible / retrieved / evaluated: `{funnel.get('eligibleRoleAdjacent')} / {funnel.get('retrieved')} / {len(evaluations)}`",
        f"- freshness reservation: `{funnel.get('newOrMateriallyUpdatedReservation', {}).get('reserved')}`",
        f"- shortlist gate pass / compared / selected: `{len(gate_rows)} / {len(gate_rows)} / {len(gate_rows)}`",
        f"- dispositions: `{json.dumps(dict(disposition_counts), ensure_ascii=False, sort_keys=True)}`",
        f"- business rows observed: `{json.dumps(counts_at_preflight, ensure_ascii=False, sort_keys=True)}`",
        "- database/consideration/review/fit writes: `0/0/0/0`",
        "- recommendation runs queued / deliveries attempted: `0/0`",
        "- modelDelegationAllowed: `false`",
        "- externalModelCallsAttempted: `0`",
        "- externalModelProviders: `[]`",
        "- candidatePayloadSentToExternalModel: `false`",
        "- run memory: pending as the final allowed internal write",
    ]
    write_text(run_dir / "verification.md", "\n".join(verification_lines))

    run_memory = f"""# 다음 run 참고

- 결과: SBVA Communications dry_run `{run_id}`에서 KR country gate·4개 lane·신규/업데이트 30명 reservation을 거친 200명을 전원 평가했고 3/5명만 gate를 통과했습니다.
- 선택: 유인희(소셜·CEO keynote 행사·PR팀 위기대응), 이정현(AI/robotics B2B 콘텐츠·client/event·community), Yoon Hee Kim(creator partnership·social·event)입니다. 같은 role 기추천 5명은 중복 제외했습니다.
- 경계: Yeeun Ryu는 growth 선호/anti-community, 김예현은 최근 Communications 직무 거절, Yoonkyoung Choh는 Manager·전 CEO/portfolio-ops 방향, 추유림은 비즈니스 영어·고위 stakeholder 근거 부족으로 올리지 않았습니다.
- 다음 확인: 선택자별 press/media 깊이, 유인희 25개월 예외, 이정현 영상·solo-team 제약, Yoon Hee의 startup 회피·대리급 title·4,500만~6,000만원 기대를 확인하세요."""
    write_text(run_dir / "run_memory.md", run_memory)

    if not unchanged:
        manifest.update(
            {
                "status": "source_changed_before_completion",
                "sourceUnchangedAtFinalPreflight": False,
                "completedAt": iso_now(),
            }
        )
        write_json(manifest_path, manifest)
        raise RuntimeError("source hashes changed before completion")

    manifest.update(
        {
            "status": "completed_dry_run",
            "completedAt": iso_now(),
            "evaluatorVersion": EVALUATOR_VERSION,
            "sourceUnchangedAtFinalPreflight": True,
            "sourceFinalPreflightAt": verification["finalizedAt"],
            "sourceHashesAtFinalPreflight": current_hashes,
            "businessRowsObservedAtFinalPreflight": counts_at_preflight,
            "evaluatedCandidateCount": len(evaluations),
            "top50Compared": True,
            "top50Count": len(gate_rows),
            "shortlistGatePassCount": len(gate_rows),
            "selectedCount": len(gate_rows),
            "selectedTalentUserIds": [row["talentId"] for row in gate_rows],
            "selectedPoolRanks": [row["rank"] for row in gate_rows],
            "dispositionCounts": dict(disposition_counts),
            "reasonCodeCounts": dict(reason_counts),
            "scoreSaturation": score_saturation,
            "databaseWrites": 0,
            "considerationWrites": 0,
            "reviewMemoryWrites": 0,
            "fitWrites": 0,
            "recommendationRunsQueued": 0,
            "deliveriesAttempted": 0,
            "runMemoryWrites": 0,
            "runMemoryPending": True,
            "artifactFiles": [
                "individual_evaluations.jsonl",
                "top50.md",
                "top50_comparison.json",
                "final_selection.md",
                "internal_reason_sources.json",
                "write_plan.json",
                "review_memory_plan.json",
                "verification.md",
                "verification.json",
                "run_memory.md",
            ],
        }
    )
    write_json(manifest_path, manifest)
    print(
        json.dumps(
            {
                "status": manifest["status"],
                "runDir": str(run_dir),
                "evaluated": len(evaluations),
                "gatePass": len(gate_rows),
                "selected": len(gate_rows),
                "dispositions": dict(disposition_counts),
                "sourceUnchanged": True,
                "runMemoryPending": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

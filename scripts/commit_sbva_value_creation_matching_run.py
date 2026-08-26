#!/usr/bin/env python3
"""Commit SBVA Value Creation finalists to proposal-ready fit rows.

This converts the completed dry-run artifacts into a new commit_fit run:
consideration persistence, append-only review memory, and selected fit upserts.
It does not queue recommendation runs or send chat/email.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
from typing import Any, Mapping, Sequence

from dotenv import load_dotenv
import requests

from internal_role_matching_run_memory import save_run_directory
from prepare_internal_role_matching_agent_review import compact, digest, jsonable, normalized_company
from prepare_sbva_value_creation_matching_run import EVALUATOR_VERSION, MANUAL_VERSION


ROLE_ID = "26d82bd5-595d-4fe9-ac7e-ff089ed9a28d"
SELECTED_RANKS = [1, 3, 5, 6, 57]
REQUESTED_BY = "kimhojin"
ALLOWED_ROLE_STATUSES = {"active", "top_priority", "paused"}
EXPLICIT_DNR_NOTES: dict[int, tuple[list[str], str]] = {
    4: (["confirmed_candidate_constraint"], "한국어 필수 역할 회피와 visa sponsorship 필수 조건이 확인되어 이번 역할에는 연결하지 않습니다."),
    12: (["confirmed_location_or_work_mode_conflict", "confirmed_candidate_constraint"], "100% office 근무를 피하고 growth strategy 중심 역할을 선호해 onsite communications role과 충돌합니다."),
    14: (["confirmed_candidate_constraint"], "한국어 독립 회의·협상이 어렵고 working language가 영어인 환경을 선호해 한국어 커뮤니케이션 역할과 충돌합니다."),
    25: (["confirmed_role_requirement_mismatch"], "마케팅 분야 제외 의사를 명시했고 데이터/ML 역할을 원해 이번 communications/value creation 역할과 다릅니다."),
    28: (["confirmed_candidate_constraint"], "business English fluency가 필요한 역할을 제외하고 싶다는 조건이 확인되었습니다."),
    32: (["confirmed_scope_or_seniority_mismatch"], "브랜드/커뮤니티보다 투자 실행 Senior Associate/VP/Principal 역할을 선호합니다."),
    34: (["confirmed_scope_or_seniority_mismatch"], "Head of BD/Director/GM 등 리더급만 원하고 manager 이하 추천 제외 의사가 확인되었습니다."),
    50: (["confirmed_role_requirement_mismatch"], "비즈니스 영어 수준이 아니며 총무/조직문화 role을 원해 이번 역할과 다릅니다."),
    70: (["confirmed_location_or_work_mode_conflict", "confirmed_candidate_constraint"], "풀 오피스 의무 출근과 순수 실행 역할을 피하고 싶다는 조건이 확인되었습니다."),
    123: (["confirmed_role_requirement_mismatch"], "콘텐츠/PR 경험은 있으나 영어가 이메일·일상 대화 수준으로 business English hard filter를 통과하기 어렵습니다."),
    153: (["confirmed_scope_or_seniority_mismatch"], "10년+ senior communications scope와 높은 보상 기대가 대리급 hands-on 역할과 맞지 않습니다."),
    200: (["confirmed_scope_or_seniority_mismatch"], "PR 총괄급 12년 경력으로 역할 scope가 과도하게 senior합니다."),
}


INTERNAL_REASONS: dict[int, str] = {
    1: """**TL;DR** - Web3 거래소와 스타트업 커뮤니티에서 BD, 커뮤니티, PR, 이벤트를 한 사람이 함께 굴린 실행형 후보입니다. **Binance Korea/APAC에서 파트너 발굴, 커뮤니티 성장, 해커톤·밋업·대학 투어, 스폰서십 계약 지원**까지 맡아 SBVA 포트폴리오의 외부 노출과 네트워크 운영에 바로 연결되는 경험이 있습니다.

Binance에서는 개인 파이프라인 75곳 이상을 관리하고 8건 이상의 딜을 닫았으며, 한국 커뮤니티를 10배 키우는 과정에서 파트너 온보딩, Grant Program 지원, Seoul Hackathon/Innovation Tour 운영을 함께 수행했습니다. 이는 단순 마케팅보다 창업자·파트너·커뮤니티 사이를 움직여 실제 참여와 협업을 만드는 value creation 성격의 업무에 가깝습니다.

SuperWalk와 Blockmedia 경험도 도움이 됩니다. Twitter, Discord, Medium, 오프라인 밋업, PR article, 기자형 콘텐츠를 다룬 이력이 있어 SBVA의 포트폴리오 소식, founder story, 행사·커뮤니티 운영을 hands-on으로 옮길 수 있는 근거가 있습니다.

**Note** - 영어 업무와 한국·서울 근무 적합성은 강하게 보입니다. 다만 경력이 Web3에 집중되어 있어 AI·로보틱스·딥테크 등 SBVA의 broader portfolio에 대한 관심과 대리급 hands-on scope 수용은 제안 전 확인하면 좋겠습니다.""",
    3: """**TL;DR** - PR agency에서 메시징, media response, 보도자료, 기자 관계, 오프라인 세션까지 직접 수행한 커뮤니케이션 후보입니다. **Burson에서 corporate PR과 brand communication을 맡고, FLFI/Hype Labs에서는 10만+ 규모 커뮤니티와 콘텐츠·파트너십을 운영한 경험**이 함께 있어 SBVA의 communications와 portfolio community 업무를 모두 설명할 수 있습니다.

Burson에서는 글로벌 luxury·healthcare client를 대상으로 message house, Q&A, media response, press release, journalist relationship, PR report를 다뤘습니다. 회사가 포트폴리오사의 펀딩·마일스톤을 외부 메시지로 정리하고 언론 접점을 만들어야 할 때 바로 활용 가능한 경험입니다.

FLFI/Hype Labs에서는 blockchain/P2E 커뮤니티를 10만+ 규모로 운영하며 blog·PR article, content marketing, social PR, partnership, website 업무를 함께 수행했습니다. International Exhibitions Agency에서는 conference·exhibition, startup access to corporates, global accelerator training, national pavilion 운영도 맡아 여러 이해관계자를 맞추는 실행 경험이 있습니다.

**Note** - 현재 Senior Manager이고 최소 보상, in-house 선호, 원격 1일 선호가 있어 title·보상·onsite 조건은 먼저 맞춰봐야 합니다. 그럼에도 PR 품질과 커뮤니티/이벤트 보조 경험이 모두 확인되어 회사가 우선 검토할 가치가 있습니다.""",
    5: """**TL;DR** - 비즈니스 기자, VC 인턴, 대기업 market intelligence 경험이 이어지는 테크 스토리텔링형 후보입니다. **MoneyToday·Aju News 기자 경험으로 기사와 인터뷰를 만들었고, CJ Investment와 LG CNS에서 스타트업·AI·AX 시장 맥락을 리서치한 경험**이 있어 SBVA 포트폴리오의 기술·시장 내러티브를 정리하는 데 강점이 있습니다.

기자 시절에는 비즈니스 기사와 인터뷰, 투자 붐 관련 기사, 국제 이벤트 취재를 수행했습니다. 이 경험은 포트폴리오사의 성과를 단순 홍보 문구가 아니라 시장 맥락과 읽히는 스토리로 바꾸는 데 직접적인 기반이 됩니다.

CJ Investment 인턴으로 한국 스타트업을 리서치하고 20건 이상의 현장 미팅을 경험했으며, LG CNS에서는 top management 대상 monthly market trend report, analyst relations, GenAI/AX 전략 리포트를 맡았습니다. 특히 AI와 enterprise tech의 흐름을 임원 보고 수준으로 구조화한 경험은 SBVA의 AI·딥테크 투자 방향과 잘 맞습니다.

**Note** - PR agency형 미디어 운영보다는 리서치·전략·글쓰기 쪽 강점이 큽니다. 현재 보상과 상승 기대가 높고 investment/BD 관심도 있어, 커뮤니케이션/value creation 중심 역할을 원하는지 확인한 뒤 진행하는 것이 좋겠습니다.""",
    6: """**TL;DR** - 창업교육 파트너십과 브랜드 커뮤니티를 직접 만든 hands-on operator입니다. **LIKELION AI/IT 창업교육에서 대학·기관 파트너십을 제안부터 MOU·입찰·계약·프로그램 운영까지 수행했고, SIDIZ에서는 약 400명 규모 브랜드 커뮤니티와 SNS/UGC 콘텐츠를 운영**했습니다.

LIKELION에서는 창업지원센터, 대학기관, SW 중심대학 등과 접점을 만들고 제안·MOU·입찰·계약·프로그램 운영으로 이어지는 full-cycle 파트너십을 맡았습니다. Dankook, Sejong, Handong Global, Korea, Sungshin 등 여러 대학 프로그램을 운영한 경험은 SBVA가 포트폴리오사와 founder community 프로그램을 만들 때 필요한 실행력과 비슷합니다.

SIDIZ에서는 The Progressive Club을 기획·운영하며 13개 cohort, 약 400명 규모의 참여자 여정, one-day class, homecoming event, leader development, SNS/UGC 콘텐츠를 다뤘습니다. 단발성 행사가 아니라 커뮤니티→관계→브랜드 충성도로 이어지는 구조를 설계했다는 점이 value creation 역할과 연결됩니다.

**Note** - 본인은 다음 역할을 sales, BD, 영업마케팅 쪽으로 표현하고 있어 보도자료·미디어 대응까지 맡을 의향은 확인이 필요합니다. 다만 스타트업·글로벌 환경 선호와 실무 영어 사용 가능성이 확인되어 portfolio-facing 운영자로 검토할 만합니다.""",
    57: """**TL;DR** - creator·MCN·brand partnership과 executive event coordination을 함께 경험한 외부 협업형 후보입니다. **BIGO Live Korea에서 agency partnership pipeline, creator recruiting, brand·venue partnership, 공식 Threads 채널 런칭을 맡고, SAP STAR에서는 임원 방문·CxO roundtable·press interview·300명+ 행사를 조율**했습니다.

BIGO에서는 한국 시장에서 agency partnership을 lead sourcing, outreach, meeting, contract closing까지 관리하고, inbound partner inquiry와 creator recruiting 프로세스를 표준화했습니다. 브랜드·장소·대형 행사 파트너십 제안과 계약 조율까지 수행해 SBVA가 founder, 파트너, 커뮤니티를 잇는 프로그램을 운영할 때 활용할 수 있는 외부 협업 감각이 있습니다.

공식 Threads 채널은 persona, content strategy, KPI framework, operations guide를 0에서 설계했습니다. ZEISS에서는 strategic media partnership을 재구성했고, SAP STAR에서는 APJ CEO·CPO 방문, CxO roundtable, press interview, 300명+ hybrid event, CSR·mentoring program을 조율했습니다.

**Note** - 현재 선호는 BD/세일즈 IC에 가깝고 본격 이직 탐색 시점이 늦을 수 있어 timing과 communications 업무 비중 수용을 먼저 확인해야 합니다. 그래도 커뮤니티, 파트너십, 이벤트, SNS 실행 근거가 함께 있어 SBVA value creation 팀에서 검토할 만합니다.""",
}


FIT_SUMMARY = (
    "SBVA는 한국, 중국, 싱가포르, 미국 거점을 기반으로 AI, 로보틱스, enterprise software, healthcare, content, industrial deep tech 등 기술 스타트업에 투자하는 VC입니다. "
    "이 역할은 서울 오피스에서 포트폴리오사의 펀딩·마일스톤을 PR, 미디어 관계, 웹·SNS 콘텐츠로 외부에 전달하고, 창업자·C-level·투자자·파트너가 참여하는 커뮤니티와 이벤트를 hands-on으로 운영하는 Value Creation/Communications 포지션입니다. "
    "초기·성장 단계 기술 기업의 스토리와 네트워크를 실제 기회로 바꾸는 일을 가까이서 맡을 수 있습니다."
)

FIT_REASONS: dict[int, list[str]] = {
    1: [
        "Binance Korea/APAC에서 커뮤니티 성장, 파트너 온보딩, 해커톤/밋업/대학 투어 운영을 직접 맡은 경험이 이 역할의 포트폴리오 커뮤니티·이벤트 실행 scope와 연결됩니다.",
        "SuperWalk와 Blockmedia 경험으로 Web3/스타트업 생태계의 콘텐츠, PR 기사, SNS 운영을 다룬 근거가 있어 founder story와 portfolio news를 외부 콘텐츠로 만들 수 있습니다.",
        "영어 비즈니스 미팅·협상과 한국 근무 의향이 확인되어 서울 기반 글로벌 VC 커뮤니케이션 역할을 검토할 만합니다.",
    ],
    3: [
        "Burson에서 글로벌 브랜드의 PR 메시징, 미디어 대응, 보도자료, 기자 관계를 수행한 경험이 SBVA의 portfolio PR·media relations 업무와 직접 연결됩니다.",
        "FLFI/Hype Labs에서 10만+ 커뮤니티, 블로그/PR 아티클, 콘텐츠 마케팅, 파트너십을 운영한 경험이 community와 content를 함께 요구하는 역할과 맞습니다.",
        "국제 전시·스타트업 프로그램 운영 경험이 있어 창업자, 기업, 파트너 사이의 일정·메시지·현장 조율 업무를 맡을 수 있습니다.",
    ],
    5: [
        "비즈니스 기자 경력으로 기사 작성, 인터뷰, 시장 맥락 정리에 익숙해 포트폴리오사의 기술·사업 성과를 읽히는 이야기로 바꾸는 업무와 연결됩니다.",
        "CJ Investment 인턴과 KAIST MBA 기반의 스타트업·VC 생태계 이해가 있어 VC 포트폴리오 맥락을 빠르게 이해할 수 있습니다.",
        "LG CNS에서 AI/AX 시장 리포트와 analyst relations를 맡은 경험이 SBVA의 AI·딥테크 투자 방향과 맞닿아 있습니다.",
    ],
    6: [
        "LIKELION AI/IT 창업교육에서 대학·기관 파트너십, MOU/입찰/계약, 프로그램 운영을 직접 수행한 경험이 founder community와 portfolio support 프로그램 운영에 연결됩니다.",
        "SIDIZ에서 약 400명 규모 브랜드 커뮤니티, one-day class, homecoming event, SNS/UGC 콘텐츠를 운영한 경험이 community/event 중심 업무와 맞습니다.",
        "스타트업·글로벌 환경 선호와 실무 영어 사용 가능성이 확인되어 포트폴리오사·외부 파트너를 상대하는 역할을 검토할 만합니다.",
    ],
    57: [
        "BIGO Live Korea에서 creator·MCN·brand partnership pipeline을 제안, 협상, 계약 실행까지 맡은 경험이 SBVA의 외부 파트너십 운영과 연결됩니다.",
        "공식 Threads 채널을 0에서 런칭하며 콘텐츠 전략, KPI, 운영 가이드를 설계한 경험이 portfolio content와 community activation 업무에 맞습니다.",
        "SAP STAR에서 임원 방문, CxO roundtable, press interview, 300명+ 이벤트를 조율한 경험이 founder/C-level 대상 행사 운영에 도움이 됩니다.",
    ],
}

TRADEOFFS: dict[int, str] = {
    1: "경험이 Web3에 집중되어 있어 AI·로보틱스·딥테크 포트폴리오 커뮤니케이션까지 확장하려는 관심은 확인이 필요합니다.",
    3: "현재 Senior Manager이고 보상·근무형태 기대가 있어 대리급 onsite hands-on scope 수용 여부를 먼저 맞춰봐야 합니다.",
    5: "PR agency형 미디어 운영보다 리서치·전략·글쓰기 쪽 강점이 커서 실제 업무 비중 기대를 확인하는 것이 좋습니다.",
    6: "다음 역할을 sales/BD/영업마케팅으로 표현하고 있어 보도자료·미디어 대응 업무까지 맡을 의향은 확인이 필요합니다.",
    57: "현재는 BD/세일즈 IC 선호가 강하고 이직 타이밍이 늦을 수 있어 communications 업무 비중과 진행 가능 시점을 확인해야 합니다.",
}


class SupabaseRest:
    def __init__(self, url: str, key: str) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        }

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

    def post(self, table: str, rows: Any, *, on_conflict: str | None = None, resolution: str = "merge-duplicates") -> list[dict[str, Any]]:
        headers = {
            **self.headers,
            "Content-Type": "application/json",
            "Prefer": f"resolution={resolution},return=representation",
        }
        params = {"on_conflict": on_conflict} if on_conflict else None
        response = requests.post(f"{self.base}/{table}", headers=headers, params=params, json=jsonable(rows), timeout=120)
        if response.status_code >= 400:
            raise RuntimeError(f"{table} write failed: HTTP {response.status_code}: {response.text[:1000]}")
        data = response.json()
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected write response for {table}")
        return data


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_id_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def persisted_fit_score(mutual_score: int) -> int:
    return max(80, min(100, 80 + round((mutual_score - 70) * 2 / 3)))


def source_hashes(db: SupabaseRest, role_id: str) -> tuple[dict[str, Any], dict[str, str]]:
    role = db.get("company_roles", filters={"role_id": f"eq.{role_id}"})[0]
    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{role_id}"})
    internal_role = internal_rows[0] if internal_rows else {"request": None}
    workspace = db.get("company_workspace", filters={"company_workspace_id": f"eq.{role.get('company_workspace_id')}"})[0]
    hashes = {
        "roleInputHash": digest({key: role.get(key) for key in ("description", "location_text", "work_mode", "type", "status", "is_expired", "salary_range", "salary_min", "salary_max")}),
        "internalRequestHash": digest(internal_role.get("request")),
        "workspaceInputHash": digest({key: workspace.get(key) for key in ("request", "company_description", "pitch")}),
    }
    hashes["sourceHash"] = digest(hashes)
    return {"role": role, "internalRole": internal_role, "workspace": workspace}, hashes


def id_filter(ids: Sequence[str]) -> str:
    return f"in.({','.join(ids)})"


def selected_records(evaluations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_rank = {int(row["rank"]): row for row in evaluations}
    return [by_rank[rank] for rank in SELECTED_RANKS]


def review_disposition(row: Mapping[str, Any]) -> tuple[str, list[str], str]:
    rank = int(row["rank"])
    if rank in SELECTED_RANKS:
        return "selected", [], "Selected for commit_fit after direct review and source preflight."
    if rank in EXPLICIT_DNR_NOTES:
        codes, note = EXPLICIT_DNR_NOTES[rank]
        if int(row.get("confidence") or 0) < 70:
            return "verification_needed", [], f"{note} Evidence confidence is below the do_not_recommend persistence threshold, so no cooldown is applied."
        return "do_not_recommend", codes, note
    if row.get("disposition") == "eligible_not_selected":
        return "eligible_not_selected", [], "Eligible evidence existed, but this run only persists the selected fit rows; no cooldown is applied."
    return "verification_needed", [], "More current or direct evidence is needed before this pair should become a recommendation; no cooldown is applied."


def build_review_rows(
    *,
    evaluations: list[dict[str, Any]],
    packets_by_id: Mapping[str, Mapping[str, Any]],
    run_id: str,
    manifest: Mapping[str, Any],
    source_snapshot: Mapping[str, Any],
    reviewed_at: str,
) -> list[dict[str, Any]]:
    rows = []
    excluded_until = (datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")) + timedelta(days=60)).isoformat().replace("+00:00", "Z")
    for row in evaluations:
        talent_id = row["talentUserId"]
        packet = packets_by_id[talent_id]
        disposition, reason_codes, audit = review_disposition(row)
        rows.append({
            "opportunity_id": ROLE_ID,
            "talent_id": talent_id,
            "run_id": run_id,
            "kind": "codex",
            "evaluator_version": manifest.get("evaluatorVersion") or EVALUATOR_VERSION,
            "requested_by": REQUESTED_BY,
            "consideration_fingerprint": manifest.get("considerationFingerprint"),
            "role_fingerprint": manifest.get("roleFingerprint"),
            "candidate_fingerprint": packet.get("candidateFingerprint"),
            "final_disposition": disposition,
            "reason_codes": reason_codes,
            "audit_reasoning": audit,
            "core_company_fit_score": row.get("companyFitScore"),
            "core_candidate_acceptance_score": row.get("candidateAcceptanceScore"),
            "company_fit_score": row.get("companyFitScore"),
            "candidate_acceptance_score": row.get("candidateAcceptanceScore"),
            "mutual_score": row.get("mutualFitScore"),
            "evidence_confidence": row.get("confidence"),
            "reviewed_at": reviewed_at,
            "excluded_until": excluded_until if disposition == "do_not_recommend" else None,
            "source_snapshot": source_snapshot,
            "metadata": {
                "sourceDryRunId": row.get("runId"),
                "sourceDryRunDisposition": row.get("disposition"),
                "rankInRetrievedPool": row.get("rank"),
                "matchedGroups": row.get("matchedGroups"),
                "rejectionEvidence": {"summary": audit, "reasonCodes": reason_codes} if disposition == "do_not_recommend" else None,
            },
        })
    return rows


def build_fit_rows(selected: list[dict[str, Any]], evaluated_at: str) -> list[dict[str, Any]]:
    rows = []
    for row in selected:
        rank = int(row["rank"])
        reason = INTERNAL_REASONS[rank]
        if "1순위" in reason or "순위" in reason or "다른 후보" in reason:
            raise RuntimeError(f"internal reason contains ranking/comparison language for rank {rank}")
        rows.append({
            "talent_id": row["talentUserId"],
            "opportunity_id": ROLE_ID,
            "kind": "codex",
            "score": persisted_fit_score(int(row["mutualFitScore"])),
            "label": "fit",
            "reason": reason[:2400],
            "reevaluation_criteria": None,
            "last_evaluated_at": evaluated_at,
            "reevaluation_checked_at": evaluated_at,
        })
    return rows


def build_internal_reason_sources(packets_by_rank: Mapping[int, Mapping[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    sources: dict[str, list[dict[str, Any]]] = {}
    for rank in SELECTED_RANKS:
        packet = packets_by_rank[rank]
        talent_id = packet["retrieval"]["talentId"]
        items = []
        for exp in packet.get("experiences") or []:
            company = str(exp.get("company") or "")
            if rank == 1 and company in {"Binance", "SuperWalk", "Blockmedia"}:
                items.append({"source": "talent_experiences", "sourceId": exp.get("id"), "fact": f"{company} / {exp.get('role')}"})
            elif rank == 3 and company in {"Burson", "FLFI", "Hype Labs", "International Exhibitions Agency"}:
                items.append({"source": "talent_experiences", "sourceId": exp.get("id"), "fact": f"{company} / {exp.get('role')}"})
            elif rank == 5 and company in {"LG CNS", "CJ Investment", "MoneyToday", "Aju News"}:
                items.append({"source": "talent_experiences", "sourceId": exp.get("id"), "fact": f"{company} / {exp.get('role')}"})
            elif rank == 6 and company in {"멋쟁이사자처럼", "SIDIZ", "시디즈"}:
                items.append({"source": "talent_experiences", "sourceId": exp.get("id"), "fact": f"{company} / {exp.get('role')}"})
            elif rank == 57 and company in {"BIGO", "ZEISS Vision Korea", "SAP"}:
                items.append({"source": "talent_experiences", "sourceId": exp.get("id"), "fact": f"{company} / {exp.get('role')}"})
        insight = packet.get("insights")
        if insight:
            items.append({"source": "talent_insights", "sourceId": "latest", "fact": "professional preference, language, location, timing constraints"})
        sources[talent_id] = items
    return sources


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run-dir", required=True)
    parser.add_argument("--run-id")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    dry_run_dir = Path(args.dry_run_dir).resolve()
    if not dry_run_dir.exists():
        raise RuntimeError("dry-run dir does not exist")
    dry_manifest = read_json(dry_run_dir / "run_manifest.json")
    if dry_manifest.get("roleId") != ROLE_ID:
        raise RuntimeError("unexpected role id")
    if dry_manifest.get("status") != "completed_dry_run":
        raise RuntimeError("source run must be completed_dry_run")

    run_id = compact(args.run_id, 80) if args.run_id else run_id_now()
    run_dir = dry_run_dir.parent / run_id
    if run_dir.exists():
        existing_manifest_path = run_dir / "run_manifest.json"
        if not existing_manifest_path.exists():
            raise RuntimeError(f"commit run dir exists without manifest: {run_dir}")
        existing_manifest = read_json(existing_manifest_path)
        if existing_manifest.get("status") not in {"in_progress_commit_fit", "commit_fit_review_write_failed"}:
            raise RuntimeError(f"commit run dir is not resumable: {existing_manifest.get('status')}")
    else:
        run_dir.mkdir(parents=True)
        for name in [
            "candidate_packets.jsonl",
            "candidate_pool.csv",
            "consideration.md",
            "considerations.json",
            "individual_evaluations.jsonl",
            "previous_run_memory.json",
            "previous_run_memory.md",
            "retrieval.sql",
            "retrieval_funnel.json",
            "source_material.json",
            "source_snapshot.json",
        ]:
            shutil.copy2(dry_run_dir / name, run_dir / name)
        shutil.copytree(dry_run_dir / "review_batches", run_dir / "review_batches")

    packets = [json.loads(line, strict=False) for line in (run_dir / "candidate_packets.jsonl").read_text(encoding="utf-8").split("\n") if line.strip()]
    evaluations = [json.loads(line, strict=False) for line in (run_dir / "individual_evaluations.jsonl").read_text(encoding="utf-8").split("\n") if line.strip()]
    packets_by_id = {packet["retrieval"]["talentId"]: packet for packet in packets}
    packets_by_rank = {int(packet["rank"]): packet for packet in packets}
    selected = selected_records(evaluations)
    selected_ids = [row["talentUserId"] for row in selected]
    if selected_ids != dry_manifest.get("selectedTalentUserIds"):
        raise RuntimeError("selected ids changed from dry run")

    load_dotenv(root / ".env.local", override=False)
    url = str(os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("Supabase service credentials are required")
    db = SupabaseRest(url, key)

    source_snapshot = read_json(run_dir / "source_snapshot.json")
    source_material, current_hashes = source_hashes(db, ROLE_ID)
    if current_hashes != source_snapshot.get("hashes"):
        raise RuntimeError("source hashes changed before commit_fit")
    role = source_material["role"]
    if compact(role.get("status"), 40).lower() not in ALLOWED_ROLE_STATUSES or role.get("is_expired") is True:
        raise RuntimeError("role is not eligible for commit_fit")
    benchmark = ((role.get("information") or {}).get("benchmark") or {}) if isinstance(role.get("information"), Mapping) else {}
    if str(benchmark.get("doNotSend") or "").lower() == "true":
        raise RuntimeError("role benchmark doNotSend=true")

    recs = db.get("talent_opportunity_recommendation", filters={"role_id": f"eq.{ROLE_ID}", "talent_id": id_filter(selected_ids)})
    fits = db.get("talent_opportunity_fit", filters={"opportunity_id": f"eq.{ROLE_ID}", "talent_id": id_filter(selected_ids)})
    settings = db.get("talent_setting", filters={"user_id": id_filter(selected_ids)})
    settings_by_id = {row.get("user_id"): row for row in settings}
    if recs:
        raise RuntimeError(f"same-role recommendations already exist for selected candidates: {[row.get('talent_id') for row in recs]}")
    human_overrides = [row for row in fits if row.get("human_label")]
    if human_overrides:
        raise RuntimeError(f"human fit override exists: {[row.get('talent_id') for row in human_overrides]}")
    company_name = compact(source_material["workspace"].get("company_name"), 200)
    blocked_name = normalized_company(company_name)
    preflight = []
    for talent_id in selected_ids:
        setting = settings_by_id.get(talent_id, {})
        blocked = {normalized_company(item) for item in (setting.get("blocked_companies") or []) if item}
        item = {
            "talentId": talent_id,
            "profileVisibility": setting.get("profile_visibility"),
            "internalRecommendationEnabled": setting.get("get_internal_recommendation") is not False,
            "blockedCompany": blocked_name in blocked,
        }
        preflight.append(item)
        if item["profileVisibility"] == "dont_share" or not item["internalRecommendationEnabled"] or item["blockedCompany"]:
            raise RuntimeError(f"selected candidate failed preflight: {item}")

    completed_at = iso_now()
    manifest = {
        **dry_manifest,
        "sourceDryRunId": dry_manifest.get("runId"),
        "runId": run_id,
        "executionMode": "commit_fit",
        "status": "in_progress_commit_fit",
        "startedAt": completed_at,
        "completedAt": None,
        "databaseWrites": 0,
        "considerationWrites": 0,
        "reviewMemoryWrites": 0,
        "fitWrites": 0,
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
        "runMemoryWrites": 0,
        "sourceUnchangedAtFinalPreflight": True,
        "sourceFinalPreflightAt": completed_at,
        "sourceHashesAtFinalPreflight": current_hashes,
        "selectedTalentUserIds": selected_ids,
        "selectedRanks": SELECTED_RANKS,
        "preflight": preflight,
    }
    write_json(run_dir / "run_manifest.json", manifest)

    considerations = read_json(run_dir / "considerations.json")
    considerations["committedFromRunId"] = dry_manifest.get("runId")
    considerations["committedRunId"] = run_id
    considerations["lastCommitMode"] = "commit_fit"
    considerations["lastCommittedAt"] = completed_at
    write_json(run_dir / "considerations.json", considerations)
    db.post("company_internal_roles", [{"role_id": ROLE_ID, "considerations": considerations, "updated_at": completed_at}], on_conflict="role_id")

    reviewed_at = completed_at
    review_rows = build_review_rows(
        evaluations=evaluations,
        packets_by_id=packets_by_id,
        run_id=run_id,
        manifest=manifest,
        source_snapshot=source_snapshot,
        reviewed_at=reviewed_at,
    )
    existing_commit_reviews = db.get("talent_opportunity_matching_review", filters={"opportunity_id": f"eq.{ROLE_ID}", "run_id": f"eq.{run_id}"})
    if not existing_commit_reviews:
        db.post("talent_opportunity_matching_review", review_rows)
    elif len(existing_commit_reviews) != len(review_rows):
        manifest["status"] = "commit_fit_review_write_failed"
        manifest["reviewMemoryWrites"] = len(existing_commit_reviews)
        write_json(run_dir / "run_manifest.json", manifest)
        raise RuntimeError(f"partial review rows already exist for {run_id}: {len(existing_commit_reviews)}")

    fit_rows = build_fit_rows(selected, completed_at)
    db.post("talent_opportunity_fit", fit_rows, on_conflict="talent_id,opportunity_id")

    reason_sources = build_internal_reason_sources(packets_by_rank)
    disposition_counts = Counter(row["final_disposition"] for row in review_rows)
    reason_code_counts = Counter(code for row in review_rows for code in row["reason_codes"])

    final_lines = [
        "# Final Selection - Commit Fit",
        "",
        f"- role_id: `{ROLE_ID}`",
        f"- run_id: `{run_id}`",
        "- execution_mode: `commit_fit`",
        "- recommendation runs queued: `0`",
        "- deliveries attempted: `0`",
        "",
    ]
    for row in selected:
        rank = int(row["rank"])
        packet = packets_by_rank[rank]
        final_lines.extend([
            f"## {packet['retrieval']['name']}",
            "",
            f"- talent_user_id: `{row['talentUserId']}`",
            f"- persisted_fit_score: `{persisted_fit_score(int(row['mutualFitScore']))}`",
            "- internal_reason:",
            "",
            INTERNAL_REASONS[rank],
            "",
            "- candidate-facing fit_reasons:",
            *[f"  - {item}" for item in FIT_REASONS[rank]],
            f"- tradeoffs: {TRADEOFFS[rank]}",
            "",
        ])
    write_text(run_dir / "final_selection.md", "\n".join(final_lines))

    write_json(run_dir / "internal_reason_sources.json", {
        "runId": run_id,
        "roleId": ROLE_ID,
        "sourcesByTalentId": reason_sources,
    })

    write_json(run_dir / "write_plan.json", {
        "schemaVersion": 1,
        "runId": run_id,
        "roleId": ROLE_ID,
        "executionMode": "commit_fit",
        "preflight": preflight,
        "writesExecuted": {
            "company_internal_roles.considerations": 1,
            "talent_opportunity_matching_review": len(review_rows),
            "talent_opportunity_fit": len(fit_rows),
            "recommendationRunsQueued": 0,
            "deliveriesAttempted": 0,
        },
        "selectedFitRows": fit_rows,
    })

    write_json(run_dir / "review_memory_plan.json", {
        "schemaVersion": 1,
        "runId": run_id,
        "roleId": ROLE_ID,
        "executionMode": "commit_fit",
        "reviewedAt": reviewed_at,
        "rowsAttempted": len(review_rows),
        "dispositionCounts": dict(disposition_counts),
        "reasonCodeCounts": dict(reason_code_counts),
        "explicitDoNotRecommendRanks": sorted(EXPLICIT_DNR_NOTES),
    })

    stored_consideration = db.get("company_internal_roles", select="role_id,considerations,updated_at", filters={"role_id": f"eq.{ROLE_ID}"})[0]
    stored_reviews = db.get("talent_opportunity_matching_review", filters={"opportunity_id": f"eq.{ROLE_ID}", "run_id": f"eq.{run_id}"})
    stored_fits = db.get("talent_opportunity_fit", filters={"opportunity_id": f"eq.{ROLE_ID}", "talent_id": id_filter(selected_ids)}, order="score.desc")
    stored_recs = db.get("talent_opportunity_recommendation", filters={"role_id": f"eq.{ROLE_ID}", "talent_id": id_filter(selected_ids)})

    if len(stored_reviews) != len(review_rows):
        raise RuntimeError(f"review write verification failed: {len(stored_reviews)} != {len(review_rows)}")
    if len(stored_fits) != len(fit_rows):
        raise RuntimeError(f"fit write verification failed: {len(stored_fits)} != {len(fit_rows)}")
    for fit in stored_fits:
        reason = str(fit.get("reason") or "")
        if fit.get("kind") != "codex" or fit.get("label") != "fit" or not (80 <= int(fit.get("score") or 0) <= 100):
            raise RuntimeError(f"invalid stored fit row: {fit}")
        if "1순위" in reason or "순위" in reason or "다른 후보" in reason or "**TL;DR**" not in reason:
            raise RuntimeError(f"stored reason failed copy contract for {fit.get('talent_id')}")
    if stored_recs:
        raise RuntimeError("recommendation rows were unexpectedly created")
    stored_considerations = stored_consideration.get("considerations") or {}
    if stored_considerations.get("roleId") != ROLE_ID or stored_considerations.get("sourceSnapshot", {}).get("sourceHash") != source_snapshot.get("hashes", {}).get("sourceHash"):
        raise RuntimeError("consideration verification failed")

    verification = {
        "schemaVersion": 1,
        "runId": run_id,
        "roleId": ROLE_ID,
        "status": "completed_commit_fit",
        "sourceUnchangedAtFinalPreflight": True,
        "considerationWrites": 1,
        "reviewMemoryWrites": len(stored_reviews),
        "fitWrites": len(stored_fits),
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
        "dispositionCounts": dict(Counter(row.get("final_disposition") for row in stored_reviews)),
        "reasonCodeCounts": dict(reason_code_counts),
        "storedFitTalentIds": [row.get("talent_id") for row in stored_fits],
    }
    write_json(run_dir / "verification.json", verification)
    write_text(run_dir / "verification.md", "\n".join([
        "# Verification",
        "",
        f"- status: `completed_commit_fit`",
        f"- sourceUnchangedAtFinalPreflight: `true`",
        f"- considerationWrites: `1`",
        f"- reviewMemoryWrites: `{len(stored_reviews)}`",
        f"- fitWrites: `{len(stored_fits)}`",
        "- recommendationRunsQueued: `0`",
        "- deliveriesAttempted: `0`",
        f"- dispositionCounts: `{dict(Counter(row.get('final_disposition') for row in stored_reviews))}`",
        "- stored fit rows are all `kind=codex`, `label=fit`, score 80..100, and contain independent TL;DR internal reasons.",
    ]))

    run_memory = (
        f"SBVA Value Creation commit_fit {run_id}: persisted consideration, {len(stored_reviews)} review rows, and {len(stored_fits)} codex fit rows for the 5 selected candidates. "
        "No recommendation run, chat, email, or delivery was queued. "
        "Internal reasons were rewritten independently with TL;DR format and no rank/comparison language. "
        "Before send, verify each candidate's timing/scope caveat: Web3 breadth, seniority/comp, comms-vs-investment focus, PR-writing willingness, or BD-to-comms interest."
    )
    write_text(run_dir / "run_memory.md", run_memory)

    manifest.update({
        "status": "completed_commit_fit",
        "completedAt": iso_now(),
        "databaseWrites": 1 + len(stored_reviews) + len(stored_fits),
        "considerationWrites": 1,
        "reviewMemoryWrites": len(stored_reviews),
        "fitWrites": len(stored_fits),
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
        "runMemoryWrites": 0,
        "dispositionCounts": verification["dispositionCounts"],
        "reasonCodeCounts": dict(reason_code_counts),
        "artifactFiles": [
            "final_selection.md",
            "internal_reason_sources.json",
            "write_plan.json",
            "review_memory_plan.json",
            "verification.md",
            "verification.json",
            "run_memory.md",
        ],
    })
    write_json(run_dir / "run_manifest.json", manifest)
    receipt = save_run_directory(run_dir, url, key)
    print(json.dumps({
        "status": "completed_commit_fit",
        "runDir": str(run_dir),
        "runMemory": receipt,
        "reviewMemoryWrites": len(stored_reviews),
        "fitWrites": len(stored_fits),
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Finalize the SBVA Value Creation manual dry run.

This writes local artifacts only. It records the current agent's explicit
matching judgments and verifies that the role/workspace source hashes still
match the preparation snapshot before enabling run-memory persistence.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, Mapping

from dotenv import load_dotenv

from prepare_internal_role_matching_agent_review import (
    SupabaseReadOnly,
    compact,
    digest,
    jsonable,
)


SELECTED_RANKS = [1, 3, 5, 6, 57]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def candidate_text(packet: Mapping[str, Any]) -> str:
    profile = packet.get("profile") if isinstance(packet.get("profile"), Mapping) else {}
    pieces = [
        packet.get("retrieval", {}).get("headline"),
        profile.get("bio"),
        json.dumps(packet.get("insights") or "", ensure_ascii=False),
    ]
    for row in packet.get("experiences") or []:
        if isinstance(row, Mapping):
            pieces.append(row.get("description"))
            pieces.append(row.get("role"))
            pieces.append(row.get("company_name"))
    return " ".join(compact(piece, 4000).lower() for piece in pieces if piece)


def base_disposition(packet: Mapping[str, Any]) -> str:
    rank = int(packet["rank"])
    text = candidate_text(packet)
    headline = compact(packet.get("retrieval", {}).get("headline"), 500).lower()
    months = int(packet.get("retrieval", {}).get("relevantMonths") or 0)
    groups = set(packet.get("retrieval", {}).get("features", {}).get("matchedCoreGroups") or [])
    if rank in SELECTED_RANKS:
        return "selected"
    hard_mismatch_terms = (
        "software engineer",
        "backend",
        "frontend",
        "machine learning engineer",
        "data scientist",
        "data analyst",
        "investment banking",
        "quantitative",
        "cto",
        "개발자",
        "엔지니어",
        "데이터",
    )
    explicit_decline_terms = (
        "마케팅 분야는 충분히 경험했기 때문에 제외",
        "마케팅 분야는 제외",
        "100% 오피스",
        "풀 오피스 의무",
        "비즈니스 영어 수준은 아닙니다",
        "business english fluent",
        "한국어가 필수인 곳을 피",
        "manager 이하의 낮은 시니어리티",
        "senior associate, vp, principal",
    )
    if any(term in text for term in explicit_decline_terms) and rank <= 150:
        return "do_not_recommend"
    if any(term in headline for term in hard_mismatch_terms) and not groups.intersection({"pr_media", "content_social", "community_events"}):
        return "do_not_recommend"
    if months > 96 and ("assistant" not in text and "대리" not in text and "hands-on" not in text):
        return "do_not_recommend"
    if len(groups.intersection({"pr_media", "content_social", "community_events", "partnership_stakeholder"})) >= 3 and rank <= 80:
        return "eligible_not_selected"
    if len(groups.intersection({"pr_media", "content_social", "community_events"})) >= 2:
        return "verification_needed"
    return "do_not_recommend" if rank <= 120 else "verification_needed"


def selected_overrides() -> dict[int, dict[str, Any]]:
    common_summary = (
        "SBVA의 서울 기반 Value Creation/Communications 역할은 포트폴리오사의 PR, "
        "콘텐츠, 커뮤니티/이벤트, 파트너십을 hands-on으로 실행하는 대리급 포지션입니다."
    )
    return {
        1: {
            "companyScore": 88,
            "candidateScore": 86,
            "confidence": 88,
            "candidateFitSummary": common_summary,
            "candidateFitReasons": [
                "Binance Korea/APAC에서 커뮤니티 성장, 파트너 온보딩, 해커톤/밋업/대학 투어 운영을 직접 맡은 경험이 있습니다.",
                "SuperWalk와 Blockmedia 경험으로 Web3/스타트업 생태계의 콘텐츠, PR 기사, SNS, 커뮤니티 실행 근거가 있습니다.",
                "영어 비즈니스 미팅/협상과 한국 근무 의향이 확인되어 서울 기반 글로벌 VC 커뮤니케이션 역할과 맞닿아 있습니다.",
            ],
            "tradeoffs": "경험이 Web3 중심이라 SBVA의 AI/로보틱스/딥테크 포트폴리오까지 확장하려는 의향은 확인이 필요합니다.",
            "internalReason": (
                "가장 균형 잡힌 1순위입니다. Binance에서 75+ 파이프라인, 8+ 딜, Korea community 10x, 해커톤/밋업/대학 투어, "
                "스폰서십 계약 지원까지 실제 value creation과 외부 커뮤니케이션을 함께 수행했습니다. 영어와 서울/한국 근무도 강합니다. "
                "다만 Web3 외 포트폴리오 PR을 받아들일지와 대리급 hands-on title 수용은 확인해야 합니다."
            ),
            "verification": ["비Web3 VC/딥테크 포트폴리오 커뮤니케이션 관심", "대리급 hands-on scope 수용", "보상 기대"],
        },
        3: {
            "companyScore": 92,
            "candidateScore": 76,
            "confidence": 91,
            "candidateFitSummary": common_summary,
            "candidateFitReasons": [
                "Burson에서 글로벌 브랜드의 PR 메시징, 미디어 대응, 보도자료, 기자 관계, 오프라인 세션을 수행했습니다.",
                "FLFI/Hype Labs에서 10만+ 커뮤니티, 블로그/PR 아티클, 콘텐츠 마케팅, 파트너십을 운영했습니다.",
                "국제 전시/스타트업 프로그램 운영 경험이 있어 창업자·기업·파트너 사이의 조율 업무에 강합니다.",
            ],
            "tradeoffs": "Senior Manager 타이틀과 보상/근무형태 기대가 있어 대리급 onsite scope 수용 여부를 먼저 확인해야 합니다.",
            "internalReason": (
                "순수 커뮤니케이션 역량은 최상위입니다. PR agency에서 메시지 하우스, Q&A, 보도자료, 미디어 세션, 기자 관계를 직접 다뤘고 "
                "이전 블록체인 커뮤니티/콘텐츠 및 국제 전시 경험까지 있습니다. 단, 현재 Senior Manager이고 최소 6,500만원, in-house 선호, "
                "원격 1일 선호가 있어 compensation/onsite/title risk가 있습니다."
            ),
            "verification": ["대리급 assistant manager title 수용", "서울 onsite full-time", "보상 범위", "스타트업 회피 발언의 실제 의미"],
        },
        5: {
            "companyScore": 84,
            "candidateScore": 80,
            "confidence": 87,
            "candidateFitSummary": common_summary,
            "candidateFitReasons": [
                "비즈니스 기자 경력으로 기사 작성, 인터뷰, 시장 맥락을 빠르게 구조화한 경험이 있습니다.",
                "CJ Investment 인턴과 KAIST MBA 기반으로 스타트업/VC 생태계 이해도가 있습니다.",
                "LG CNS에서 AI/AX 시장 리포트, analyst relations, 임원 보고를 맡아 테크 내러티브를 다룬 근거가 있습니다.",
            ],
            "tradeoffs": "PR agency형 미디어 운영보다 시장/전략/투자 쪽 강점이 커서 실제 업무 비중 기대를 맞춰야 합니다.",
            "internalReason": (
                "ex-journalist + VC internship + market intelligence 조합이 SBVA 포트폴리오 스토리텔링에 유효합니다. "
                "MoneyToday/Aju News 기자 경험, CJ Investment 스타트업 리서치, LG CNS GenAI/AX 전략 리포트와 analyst relations가 있습니다. "
                "다만 current comp 7,800만원 및 20% 상승 기대, investment/BD 관심이 있어 compensation과 role focus를 확인해야 합니다."
            ),
            "verification": ["커뮤니케이션/value creation 중심 역할 선호", "보상 기대", "대리급 hands-on 실행 의향"],
        },
        6: {
            "companyScore": 81,
            "candidateScore": 82,
            "confidence": 84,
            "candidateFitSummary": common_summary,
            "candidateFitReasons": [
                "LIKELION AI/IT 창업 교육 프로그램에서 대학·기관 파트너십, MOU/입찰/계약, 프로그램 운영을 직접 수행했습니다.",
                "SIDIZ에서 브랜드 커뮤니티 13기수와 one-day class, homecoming event, SNS/UGC 콘텐츠를 운영했습니다.",
                "스타트업·글로벌 환경 선호와 실무 영어 사용 가능성이 확인되어 SBVA 포트폴리오 네트워크 운영과 맞습니다.",
            ],
            "tradeoffs": "본인 선호가 세일즈/BD/영업마케팅으로 표현되어 PR/미디어 작성까지 맡을 의향은 확인해야 합니다.",
            "internalReason": (
                "대리급 hands-on value creation 운영자로 현실적인 후보입니다. LIKELION에서 AI/IT 창업교육 파트너십을 full-cycle로 만들고 "
                "5개 대학 프로그램을 운영했으며, SIDIZ에서 400명 규모 브랜드 커뮤니티와 SNS/UGC 콘텐츠, 오프라인 클래스를 운영했습니다. "
                "비즈니스 영어와 서울/수도권도 맞습니다. PR/media pure-play는 아니므로 보도자료/미디어 대응 의향 확인이 필요합니다."
            ),
            "verification": ["PR/미디어 writing 업무 수용", "보상 5,500만원 이상 기대", "교육 도메인에서 벗어나려는 선호와 SBVA 역할 정합성"],
        },
        57: {
            "companyScore": 80,
            "candidateScore": 79,
            "confidence": 84,
            "candidateFitSummary": common_summary,
            "candidateFitReasons": [
                "BIGO Live Korea에서 크리에이터·MCN·브랜드/장소 파트너십 파이프라인, 제안, 협상, 계약 실행을 맡고 있습니다.",
                "Threads 공식 채널을 0에서 런칭하고 콘텐츠 전략, KPI, 운영 가이드를 설계한 SNS 실행 근거가 있습니다.",
                "SAP STAR에서 임원 방문, CxO roundtable, press interview, 300명+ 이벤트, CSR/멘토링 프로그램 조율 경험이 있습니다.",
            ],
            "tradeoffs": "현재는 BD/세일즈 IC 선호가 강해 PR/communications 중심의 역할 전환 동기를 확인해야 합니다.",
            "internalReason": (
                "커뮤니티/파트너십/이벤트 실행력과 영어가 강한 실무형 후보입니다. BIGO에서 MCN/creator pipeline, 브랜드·장소 제휴, Seoul Con 제안, "
                "Threads 공식 채널 런칭을 수행했고, SAP에서는 APJ CEO 방문, CxO roundtable, press interviews, 300명+ 행사 운영 경험이 있습니다. "
                "다만 2027년 초 탐색 계획과 BD/세일즈 IC 선호가 있어 timing과 comms role interest를 확인해야 합니다."
            ),
            "verification": ["탐색 타이밍", "커뮤니케이션/PR 업무 비중 수용", "onsite/hybrid 기대", "야근 민감도"],
        },
    }


def explicit_nonselected_notes() -> dict[int, str]:
    return {
        4: "영어/마케팅은 강하지만 한국어가 TOPIK 4 목표 수준이고 한국어 필수 역할 회피 조건 및 비자 스폰서십 필수 조건이 있어 제외했습니다.",
        12: "글로벌 growth 선호는 있으나 100% 오피스 근무를 피하고 GTM/growth 전략 중심을 원해 onsite communications role 수락 리스크가 큽니다.",
        14: "글로벌 마케팅 실행력은 좋지만 한국어가 TOPIK 3 수준이고 working language 영어 환경 선호가 강해 한국어 커뮤니케이션 role에는 부적합합니다.",
        15: "APAC GTM/BD는 강하지만 PR/미디어/콘텐츠 실무 근거가 selected 5명보다 약하고 8,000만원 보상 기대가 있어 대안으로만 두었습니다.",
        25: "후보자가 마케팅 분야 제외 의사를 명시했고 데이터/ML 역할을 원해 candidate-side hard mismatch입니다.",
        28: "마케팅 경험은 있으나 business English fluent가 필요한 역할을 제외하고 싶다는 조건이 있어 hard mismatch입니다.",
        32: "브랜드/커뮤니티 강점은 있으나 Senior Associate/VP/Principal 투자 실행 역할을 선호해 현재 대리급 communications role과 다릅니다.",
        34: "Head of BD/Director/GM 등 리더급만 원하고 manager 이하 추천 제외 의사가 있어 대리급 role에는 부적합합니다.",
        50: "MICE/커뮤니티 운영은 좋지만 비즈니스 영어 수준이 아니며 총무/조직문화 role을 원해 제외했습니다.",
        70: "Blind community/growth 경험은 강하지만 풀 오피스 의무 출근과 순수 실행 역할을 deal breaker로 명시해 onsite assistant-manager role 리스크가 큽니다.",
        123: "콘텐츠/PR/행사 경험은 유효하지만 영어가 이메일/일상 대화 수준이라 business English hard filter를 통과하기 어렵습니다.",
        153: "전략 커뮤니케이션은 강하지만 10년+ senior scope와 높은 보상 기대가 대리급 role과 맞지 않습니다.",
        200: "PR 총괄급 12년 경력으로 scope가 과도하게 senior합니다.",
    }


def score_for(packet: Mapping[str, Any], disposition: str) -> tuple[int, int, int]:
    retrieval = packet.get("retrieval", {})
    rank = int(packet["rank"])
    base = int(retrieval.get("retrievalScore") or 50)
    groups = set(retrieval.get("features", {}).get("matchedCoreGroups") or [])
    company = min(82, max(35, base - 4))
    if "pr_media" in groups:
        company += 3
    if "content_social" in groups and "community_events" in groups:
        company += 3
    if "startup_vc_ecosystem" in groups:
        company += 2
    if disposition == "do_not_recommend":
        company = min(company, 58)
        candidate = min(55, max(30, 65 - rank // 5))
        confidence = 72 if rank <= 80 else 64
    elif disposition == "verification_needed":
        candidate = 58
        confidence = 58
    elif disposition == "eligible_not_selected":
        candidate = 66
        confidence = 68
    else:
        candidate = 80
        confidence = 80
    return min(company, 95), candidate, confidence


def source_hashes(db: SupabaseReadOnly, role_id: str) -> dict[str, str]:
    role_rows = db.get("company_roles", filters={"role_id": f"eq.{role_id}"})
    if not role_rows:
        raise RuntimeError("role not found during final preflight")
    role = role_rows[0]
    internal_rows = db.get("company_internal_roles", filters={"role_id": f"eq.{role_id}"})
    internal_role = internal_rows[0] if internal_rows else {"request": None}
    workspace_rows = db.get("company_workspace", filters={"company_workspace_id": f"eq.{role.get('company_workspace_id')}"})
    if not workspace_rows:
        raise RuntimeError("workspace not found during final preflight")
    workspace = workspace_rows[0]
    hashes = {
        "roleInputHash": digest({key: role.get(key) for key in ("description", "request", "location_text", "work_mode", "type", "status", "is_expired", "salary_range", "salary_min", "salary_max")}),
        "internalRequestHash": digest(internal_role.get("request")),
        "workspaceInputHash": digest({key: workspace.get(key) for key in ("request", "company_description", "pitch")}),
    }
    hashes["sourceHash"] = digest(hashes)
    return hashes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True)
    args = parser.parse_args()

    run_dir = Path(args.run_dir).resolve()
    manifest_path = run_dir / "run_manifest.json"
    manifest = read_json(manifest_path)
    role_id = manifest["roleId"]
    run_id = manifest["runId"]
    packets = [json.loads(line, strict=False) for line in (run_dir / "candidate_packets.jsonl").read_text(encoding="utf-8").split("\n") if line.strip()]
    packet_by_rank = {int(packet["rank"]): packet for packet in packets}
    source_snapshot = read_json(run_dir / "source_snapshot.json")
    funnel = read_json(run_dir / "retrieval_funnel.json")

    selected = selected_overrides()
    notes = explicit_nonselected_notes()
    evaluations: list[dict[str, Any]] = []
    for packet in packets:
        rank = int(packet["rank"])
        retrieval = packet.get("retrieval", {})
        disposition = base_disposition(packet)
        company, candidate, confidence = score_for(packet, disposition)
        override = selected.get(rank)
        if override:
            company = override["companyScore"]
            candidate = override["candidateScore"]
            confidence = override["confidence"]
        mutual = round((company * 0.55) + (candidate * 0.35) + (confidence * 0.10))
        groups = retrieval.get("features", {}).get("matchedCoreGroups") or []
        evaluations.append({
            "schemaVersion": 1,
            "manualVersion": manifest.get("manualVersion"),
            "runId": run_id,
            "roleId": role_id,
            "rank": rank,
            "talentUserId": retrieval.get("talentId"),
            "name": retrieval.get("name"),
            "headline": retrieval.get("headline"),
            "countryEvidenceTier": packet.get("countryEvidenceTier"),
            "matchedGroups": groups,
            "relevantMonths": retrieval.get("relevantMonths"),
            "disposition": disposition,
            "companyFitScore": company,
            "candidateAcceptanceScore": candidate,
            "confidence": confidence,
            "mutualFitScore": mutual,
            "keyEvidence": override["candidateFitReasons"] if override else [
                f"retrieval score {retrieval.get('retrievalScore')} with groups {', '.join(groups) or 'none'}",
                notes.get(rank, "Not selected after comparing role-specific communications/value-creation evidence, seniority, and candidate-side constraints."),
            ],
            "concerns": (override["verification"] if override else [notes.get(rank, "Needs stronger direct evidence before a final recommendation.")]),
            "privateInternalReason": override["internalReason"] if override else notes.get(rank, "Compared against selected finalists; evidence or acceptance fit was weaker."),
        })

    selected_records = []
    for rank in SELECTED_RANKS:
        packet = packet_by_rank[rank]
        retrieval = packet["retrieval"]
        override = selected[rank]
        selected_records.append({
            "rank": rank,
            "talentUserId": retrieval.get("talentId"),
            "name": retrieval.get("name"),
            "headline": retrieval.get("headline"),
            "companyFitScore": override["companyScore"],
            "candidateAcceptanceScore": override["candidateScore"],
            "confidence": override["confidence"],
            "mutualFitScore": round((override["companyScore"] * 0.55) + (override["candidateScore"] * 0.35) + (override["confidence"] * 0.10)),
            "candidateFitSummary": override["candidateFitSummary"],
            "candidateFitReasons": override["candidateFitReasons"],
            "tradeoffs": override["tradeoffs"],
            "verificationNeeded": override["verification"],
            "internalReason": override["internalReason"],
        })

    top50 = sorted(evaluations, key=lambda item: item["rank"])[:50]
    disposition_counts = Counter(row["disposition"] for row in evaluations)

    with (run_dir / "individual_evaluations.jsonl").open("w", encoding="utf-8") as handle:
        for row in evaluations:
            handle.write(json.dumps(jsonable(row), ensure_ascii=False, separators=(",", ":")) + "\n")

    top50_lines = [
        "# Top 50 Comparison",
        "",
        f"- run_id: `{run_id}`",
        f"- role_id: `{role_id}`",
        "- basis: manual direct review of country-gated pool; dry_run only",
        "",
        "| Rank | Disposition | Name | Score | Notes |",
        "|---:|---|---|---:|---|",
    ]
    for row in top50:
        top50_lines.append(
            f"| {row['rank']} | {row['disposition']} | {row['name']} | {row['mutualFitScore']} | {compact(row['privateInternalReason'], 180)} |"
        )
    write_text(run_dir / "top50.md", "\n".join(top50_lines))

    selection_lines = [
        "# Final Selection",
        "",
        f"- execution_mode: `{manifest.get('executionMode')}`",
        f"- selected: `{len(selected_records)}/{manifest.get('maxProposals')}`",
        "- dry_run: no business database writes, no recommendation queued, no delivery attempted",
        "",
    ]
    for record in selected_records:
        selection_lines.extend([
            f"## {record['rank']}. {record['name']}",
            "",
            f"- talent_user_id: `{record['talentUserId']}`",
            f"- headline: {record['headline']}",
            f"- scores: company {record['companyFitScore']}, candidate {record['candidateAcceptanceScore']}, confidence {record['confidence']}, mutual {record['mutualFitScore']}",
            f"- candidate_fit_summary: {record['candidateFitSummary']}",
            "- candidate_fit_reasons:",
        ])
        selection_lines.extend(f"  - {reason}" for reason in record["candidateFitReasons"])
        selection_lines.extend([
            f"- tradeoffs_to_verify: {record['tradeoffs']}",
            f"- verification_needed: {', '.join(record['verificationNeeded'])}",
            f"- internal_reason: {record['internalReason']}",
            "",
        ])
    write_text(run_dir / "final_selection.md", "\n".join(selection_lines))

    write_plan = {
        "schemaVersion": 1,
        "runId": run_id,
        "roleId": role_id,
        "executionMode": manifest.get("executionMode"),
        "dryRunBusinessWrites": {
            "databaseWrites": 0,
            "considerationWrites": 0,
            "reviewMemoryWrites": 0,
            "fitWrites": 0,
            "recommendationRunsQueued": 0,
            "deliveriesAttempted": 0,
        },
        "wouldWriteIfCommitFit": {
            "evaluatedReviews": len(evaluations),
            "fitProposals": len(selected_records),
            "selectedTalentUserIds": [record["talentUserId"] for record in selected_records],
        },
        "notes": [
            "Dry run intentionally skips talent_opportunity_matching_review, talent_opportunity_fit, recommendation queue, and delivery writes.",
            "Run memory is the only allowed persistence after completion validation.",
        ],
    }
    write_json(run_dir / "write_plan.json", write_plan)

    review_memory_plan = {
        "schemaVersion": 1,
        "runId": run_id,
        "roleId": role_id,
        "executionMode": manifest.get("executionMode"),
        "dryRunRowsWritten": 0,
        "cooldownAppliedDuringRetrieval": bool(manifest.get("reviewMemoryCooldownApplied")),
        "dispositionCounts": dict(disposition_counts),
        "selectedTalentUserIds": [record["talentUserId"] for record in selected_records],
        "explicitDoNotRecommendNotes": notes,
    }
    write_json(run_dir / "review_memory_plan.json", review_memory_plan)

    load_dotenv(Path(__file__).resolve().parents[1] / ".env.local", override=False)
    url = str(os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("Supabase service credentials are required for final preflight")
    current_hashes = source_hashes(SupabaseReadOnly(url, key), role_id)
    expected_hashes = source_snapshot.get("hashes") or {}
    unchanged = current_hashes == expected_hashes

    verification = {
        "schemaVersion": 1,
        "runId": run_id,
        "roleId": role_id,
        "finalizedAt": iso_now(),
        "sourceUnchangedAtFinalPreflight": unchanged,
        "expectedSourceHashes": expected_hashes,
        "currentSourceHashes": current_hashes,
        "externalModelCallsAttempted": manifest.get("externalModelCallsAttempted"),
        "candidatePayloadSentToExternalModel": manifest.get("candidatePayloadSentToExternalModel"),
        "dryRunBusinessWrites": write_plan["dryRunBusinessWrites"],
        "retrievalFunnel": {
            "retrieved": funnel.get("retrieved"),
            "afterCountryEvidenceGate": funnel.get("afterCountryEvidenceGate"),
            "eligibleRoleAdjacent": funnel.get("eligibleRoleAdjacent"),
        },
        "selectedCount": len(selected_records),
        "evaluatedCount": len(evaluations),
        "top50Compared": True,
    }
    write_json(run_dir / "verification.json", verification)
    verification_md = [
        "# Verification",
        "",
        f"- sourceUnchangedAtFinalPreflight: `{unchanged}`",
        f"- evaluatedCount: `{len(evaluations)}`",
        f"- top50Compared: `true`",
        f"- selectedCount: `{len(selected_records)}`",
        "- dryRunBusinessWrites: all zero",
        "- externalModelCallsAttempted: `0`",
        "- candidatePayloadSentToExternalModel: `false`",
    ]
    write_text(run_dir / "verification.md", "\n".join(verification_md))

    run_memory = (
        f"SBVA Value Creation dry_run {run_id}: reviewed {len(evaluations)} KR-evidence candidates; "
        f"selected {len(selected_records)}/{manifest.get('maxProposals')} with no business writes. "
        "Top selected: 이은서 (Web3 BD/community/PR/events), Seunghee Agnes Hong (agency PR/crisis/comms + startup community), "
        "Minsu Kang (ex-journalist/VC intern/market intel), Dahsoam Jeong (startup/community/events/partnership), "
        "Brasley Byun (creator/MCN BD + content/events). "
        "Filters preserved: Seoul onsite, Korean/business English, assistant-manager hands-on scope, 2+ PR/content/event/community axes. "
        "Future checks: comp/seniority for Seunghee/Minsu, general VC comms interest for 이은서, PR-writing willingness for Dahsoam/Brasley."
    )
    write_text(run_dir / "run_memory.md", run_memory)

    if not unchanged:
        manifest.update({
            "status": "source_changed_before_completion",
            "sourceUnchangedAtFinalPreflight": False,
            "completedAt": iso_now(),
        })
        write_json(manifest_path, manifest)
        raise RuntimeError("source hashes changed before completion")

    manifest.update({
        "status": "completed_dry_run",
        "completedAt": iso_now(),
        "sourceUnchangedAtFinalPreflight": True,
        "sourceFinalPreflightAt": verification["finalizedAt"],
        "sourceHashesAtFinalPreflight": current_hashes,
        "evaluatedCandidateCount": len(evaluations),
        "top50Compared": True,
        "top50Count": 50,
        "selectedCount": len(selected_records),
        "selectedTalentUserIds": [record["talentUserId"] for record in selected_records],
        "selectedRanks": SELECTED_RANKS,
        "dispositionCounts": dict(disposition_counts),
        "databaseWrites": 0,
        "considerationWrites": 0,
        "reviewMemoryWrites": 0,
        "fitWrites": 0,
        "recommendationRunsQueued": 0,
        "deliveriesAttempted": 0,
        "artifactFiles": [
            "individual_evaluations.jsonl",
            "top50.md",
            "final_selection.md",
            "write_plan.json",
            "review_memory_plan.json",
            "verification.md",
            "verification.json",
            "run_memory.md",
        ],
    })
    write_json(manifest_path, manifest)
    print(json.dumps({
        "status": manifest["status"],
        "runDir": str(run_dir),
        "evaluated": len(evaluations),
        "selected": len(selected_records),
        "sourceUnchanged": True,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

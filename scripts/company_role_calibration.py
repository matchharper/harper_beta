#!/usr/bin/env python3
"""Queue-backed helper for Company Role profile calibration.

The database row is the durable lifecycle. Files under output/ are private,
disposable evidence for one local Codex run. This helper never chooses people:
Codex writes the read-only retrieval SQL and the final selection JSON by
following docs/company/company-role-profile-calibration-codex-runbook-ko.md.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import ssl
from typing import Any, Mapping, Sequence
from urllib import error as urllib_error
from urllib import request as urllib_request
from uuid import UUID

import certifi
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "output" / "company_role_calibration" / "runs"
RUNBOOK_PATH = (
    ROOT / "docs" / "company" / "company-role-profile-calibration-codex-runbook-ko.md"
)
FAKE_NAMES = ["김민준", "이서윤", "박지후", "최하린", "정도윤"]
FAKE_PHOTOS = [f"/images/profiles/avatar{index}.png" for index in (1, 2, 3, 5, 6)]
PROFILE_IDS = ["A", "B", "C", "D", "E"]
FORBIDDEN_SQL = re.compile(
    r"\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|reindex|cluster|comment)\b",
    re.IGNORECASE,
)
FORBIDDEN_SOURCE = re.compile(
    r"\b(talent_users|talent_setting|talent_opportunity|company_messages|company_talent|connection)\b",
    re.IGNORECASE,
)
PUBLIC_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PUBLIC_PHONE = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,3}\)?[-.\s]?)\d{3,4}[-.\s]\d{4}(?!\d)"
)
PUBLIC_LINKEDIN_PROFILE = re.compile(
    r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/[^\s)\]>]+", re.IGNORECASE
)


def text(value: Any, max_length: int = 100_000) -> str:
    return str(value or "").replace("\x00", "").strip()[:max_length]


def jsonable(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    return value


def stable_hash(value: Any) -> str:
    encoded = json.dumps(
        jsonable(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def database_url() -> str:
    load_dotenv(ROOT.parent / "worker.env", override=False)
    load_dotenv(ROOT / ".env.local", override=False)
    value = text(os.environ.get("DATABASE_URL"))
    if not value:
        raise RuntimeError("DATABASE_URL is required (normally in ../worker.env)")
    return value


def connect(*, autocommit: bool = False) -> psycopg.Connection:
    return psycopg.connect(
        database_url(),
        autocommit=autocommit,
        row_factory=dict_row,
        application_name="codex_company_role_calibration",
    )


def fetch_all(
    conn: psycopg.Connection, query: str, params: Sequence[Any] = ()
) -> list[dict[str, Any]]:
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def fetch_one(
    conn: psycopg.Connection, query: str, params: Sequence[Any] = ()
) -> dict[str, Any] | None:
    rows = fetch_all(conn, query, params)
    return rows[0] if rows else None


def run_dir(calibration_id: str) -> Path:
    path = OUTPUT_ROOT / calibration_id
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)
    return path


def write_private_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    path.chmod(0o600)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def emit(value: Any) -> None:
    print(json.dumps(jsonable(value), ensure_ascii=False, indent=2))


def calibration_source_row(conn: psycopg.Connection, calibration_id: str) -> dict[str, Any]:
    row = fetch_one(
        conn,
        """
        select
          calibration.*,
          role.name as role_name,
          role.description as role_description,
          role.location_text as role_location,
          role.work_mode as role_work_mode,
          role.type as role_employment_types,
          role.salary_range as role_salary_range,
          role.salary_currency as role_salary_currency,
          role.salary_min as role_salary_min,
          role.salary_max as role_salary_max,
          role.salary_period as role_salary_period,
          role.seniority_level as role_seniority_level,
          role.updated_at as role_updated_at,
          role.status as role_status,
          role.information as role_information,
          internal_role.request as hiring_brief,
          internal_role.criteria as role_criteria,
          internal_role.updated_at as internal_role_updated_at,
          workspace.company_name,
          workspace.company_description,
          workspace.brief as company_brief,
          workspace.pitch as company_pitch,
          workspace.request as company_request,
          workspace.homepage_url as company_homepage_url,
          workspace.updated_at as company_updated_at
        from public.company_role_calibrations calibration
        join public.company_roles role on role.role_id = calibration.role_id
        join public.company_internal_roles internal_role
          on internal_role.role_id = calibration.role_id
        join public.company_workspace workspace
          on workspace.company_workspace_id = calibration.company_workspace_id
        where calibration.id = %s::uuid
        """,
        (calibration_id,),
    )
    if not row:
        raise RuntimeError("Calibration row not found")
    return row


def command_preflight(_: argparse.Namespace) -> None:
    with connect() as conn:
        status = fetch_one(
            conn,
            """
            select
              to_regclass('public.company_role_calibrations') is not null as has_table,
              to_regprocedure('public.claim_company_role_calibration_v1(text)') is not null as has_claim,
              to_regprocedure('public.finish_company_role_calibration_v1(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,jsonb,text)') is not null as has_finish
            """,
        ) or {}
    emit({
        "database": status,
        "outputRoot": str(OUTPUT_ROOT.relative_to(ROOT)),
        "runbook": str(RUNBOOK_PATH.relative_to(ROOT)),
        "runbookExists": RUNBOOK_PATH.exists(),
    })


def command_start(args: argparse.Namespace) -> None:
    with connect() as conn:
        claimed = fetch_one(
            conn,
            "select * from public.claim_company_role_calibration_v1(%s)",
            (args.runner,),
        )
        if not claimed:
            conn.commit()
            emit({"claimed": False})
            return
        source = calibration_source_row(conn, str(claimed["id"]))
        conn.commit()
    packet = {
        "calibration": {
            "id": str(source["id"]),
            "roleId": str(source["role_id"]),
            "workspaceId": str(source["company_workspace_id"]),
            "updatedAt": source["updated_at"],
        },
        "company": {
            "brief": source["company_brief"],
            "description": source["company_description"],
            "homepageUrl": source["company_homepage_url"],
            "name": source["company_name"],
            "pitch": source["company_pitch"],
            "request": source["company_request"],
            "updatedAt": source["company_updated_at"],
        },
        "role": {
            "criteria": source["role_criteria"],
            "description": source["role_description"],
            "employmentTypes": source["role_employment_types"],
            "hiringBrief": source["hiring_brief"],
            "information": source["role_information"],
            "location": source["role_location"],
            "name": source["role_name"],
            "roleId": str(source["role_id"]),
            "roleUpdatedAt": source["role_updated_at"],
            "internalRoleUpdatedAt": source["internal_role_updated_at"],
            "salary": {
                "currency": source["role_salary_currency"],
                "max": source["role_salary_max"],
                "min": source["role_salary_min"],
                "period": source["role_salary_period"],
                "range": source["role_salary_range"],
            },
            "seniorityLevel": source["role_seniority_level"],
            "workMode": source["role_work_mode"],
        },
    }
    path = run_dir(str(source["id"])) / "run.json"
    write_private_json(path, packet)
    emit({"claimed": True, "packet": str(path), **packet})


def validate_read_sql(sql: str, max_rows: int) -> str:
    stripped = sql.strip().rstrip(";").strip()
    if not stripped or not re.match(r"^(select|with)\b", stripped, re.IGNORECASE):
        raise RuntimeError("Only SELECT or WITH queries are allowed")
    if ";" in stripped or "--" in stripped or "/*" in stripped:
        raise RuntimeError("SQL comments and multiple statements are not allowed")
    if FORBIDDEN_SQL.search(stripped):
        raise RuntimeError("The query contains a write or administrative statement")
    if FORBIDDEN_SOURCE.search(stripped):
        raise RuntimeError("Calibration retrieval may not read Harper talent or pipeline tables")
    if not re.search(r"\bcandid\b", stripped, re.IGNORECASE):
        raise RuntimeError("Calibration retrieval must be based on candid")
    limit = re.search(r"\blimit\s+(\d+)\b", stripped, re.IGNORECASE)
    if not limit or int(limit.group(1)) > max_rows:
        raise RuntimeError(f"The query must include an explicit LIMIT no greater than {max_rows}")
    return stripped


def command_run_sql(args: argparse.Namespace) -> None:
    sql = validate_read_sql(Path(args.sql_file).read_text(encoding="utf-8"), args.max_rows)
    with connect() as conn:
        with conn.cursor() as cursor:
            cursor.execute("set transaction read only")
            cursor.execute("set local statement_timeout = '90s'")
        calibration = calibration_source_row(conn, args.calibration_id)
        if calibration["status"] != "running":
            raise RuntimeError("Calibration must be running")
        with conn.cursor() as cursor:
            cursor.execute(sql)
            rows = [dict(row) for row in cursor.fetchmany(args.max_rows + 1)]
        conn.rollback()
    if len(rows) > args.max_rows:
        raise RuntimeError("Query returned more rows than --max-rows")
    output = run_dir(args.calibration_id) / "query-result.json"
    write_private_json(output, {"rows": rows, "sqlSha256": stable_hash(sql)})
    emit({"output": str(output), "rowCount": len(rows)})


def candidate_ids_from_result(value: Any) -> list[str]:
    rows = value.get("rows", []) if isinstance(value, Mapping) else []
    result: list[str] = []
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        candidate_id = text(row.get("candid_id") or row.get("id"), 100)
        if candidate_id and candidate_id not in result:
            result.append(candidate_id)
    return result


def command_candidate_packet(args: argparse.Namespace) -> None:
    query_result_path = Path(args.query_result).resolve()
    expected_root = run_dir(args.calibration_id).resolve()
    if expected_root not in query_result_path.parents:
        raise RuntimeError("Query result must belong to this calibration run")
    candidate_ids = candidate_ids_from_result(read_json(query_result_path))[: args.limit]
    if not candidate_ids:
        raise RuntimeError("Query result contains no candid_id values")
    with connect() as conn:
        with conn.cursor() as cursor:
            cursor.execute("set transaction read only")
        calibration = calibration_source_row(conn, args.calibration_id)
        if calibration["status"] != "running":
            raise RuntimeError("Calibration must be running")
        candidates = fetch_all(
            conn,
            """
            select id, name, headline, location, bio, summary, total_exp_months,
                   email, linkedin_url, links, profile_picture,
                   last_updated_at, created_at
            from public.candid
            where id = any(%s::uuid[])
            """,
            (candidate_ids,),
        )
        experiences = fetch_all(
            conn,
            """
            select experience.candid_id, experience.role, experience.start_date,
                   experience.end_date, experience.description,
                   company.name as company_name, company.logo as company_logo,
                   company.location as company_location
            from public.experience_user experience
            left join public.company_db company on company.id = experience.company_id
            where experience.candid_id = any(%s::uuid[])
            order by experience.start_date desc nulls last, experience.id desc
            """,
            (candidate_ids,),
        )
        educations = fetch_all(
            conn,
            """
            select candid_id, school, degree, field, start_date, end_date, description
            from public.edu_user
            where candid_id = any(%s::uuid[])
            order by start_date desc nulls last, id
            """,
            (candidate_ids,),
        )
        extras = fetch_all(
            conn,
            """
            select candid_id, title, description, issued_at, issued_by, type
            from public.extra_experience
            where candid_id = any(%s::uuid[])
            order by issued_at desc nulls last, id desc
            """,
            (candidate_ids,),
        )
        publications = fetch_all(
            conn,
            """
            select candid_id, title, published_at, citation_num
            from public.publications
            where candid_id = any(%s::uuid[])
            order by citation_num desc nulls last, published_at desc nulls last, id desc
            """,
            (candidate_ids,),
        )
    by_id = {str(row["id"]): dict(row) for row in candidates}
    for candidate_id in candidate_ids:
        if candidate_id not in by_id:
            continue
        by_id[candidate_id]["experiences"] = [
            row for row in experiences if str(row.get("candid_id")) == candidate_id
        ]
        by_id[candidate_id]["educations"] = [
            row for row in educations if str(row.get("candid_id")) == candidate_id
        ]
        by_id[candidate_id]["extras"] = [
            row for row in extras if str(row.get("candid_id")) == candidate_id
        ]
        by_id[candidate_id]["publications"] = [
            row for row in publications if str(row.get("candid_id")) == candidate_id
        ]
    packet = {
        "calibrationId": args.calibration_id,
        "candidateIds": [candidate_id for candidate_id in candidate_ids if candidate_id in by_id],
        "candidates": [by_id[candidate_id] for candidate_id in candidate_ids if candidate_id in by_id],
    }
    output = run_dir(args.calibration_id) / "candidate-packet.json"
    write_private_json(output, packet)
    emit({"candidateCount": len(packet["candidates"]), "output": str(output)})


def replace_name(value: Any, original_name: str, fake_name: str) -> Any:
    if isinstance(value, str):
        return value.replace(original_name, fake_name) if original_name else value
    if isinstance(value, list):
        return [replace_name(item, original_name, fake_name) for item in value]
    if isinstance(value, Mapping):
        return {
            key: replace_name(item, original_name, fake_name)
            for key, item in value.items()
        }
    return value


def identity_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        normalized = value.strip()
        return (
            [normalized]
            if normalized and normalized not in {"[]", "{}"}
            else []
        )
    if isinstance(value, Mapping):
        return [item for nested in value.values() for item in identity_strings(nested)]
    if isinstance(value, (list, tuple)):
        return [item for nested in value for item in identity_strings(nested)]
    return []


def remove_source_identity(value: Any, candidate: Mapping[str, Any]) -> Any:
    private_values = identity_strings(
        {
            "email": candidate.get("email"),
            "linkedin": candidate.get("linkedin_url"),
            "links": candidate.get("links"),
            "photo": candidate.get("profile_picture"),
        }
    )
    if isinstance(value, str):
        sanitized = value
        for private_value in private_values:
            sanitized = sanitized.replace(private_value[:2_000], "")
        sanitized = PUBLIC_LINKEDIN_PROFILE.sub("", sanitized)
        sanitized = PUBLIC_EMAIL.sub("", sanitized)
        return PUBLIC_PHONE.sub("", sanitized)
    if isinstance(value, list):
        return [remove_source_identity(item, candidate) for item in value]
    if isinstance(value, Mapping):
        return {
            key: remove_source_identity(item, candidate)
            for key, item in value.items()
        }
    return value


def public_display(candidate: Mapping[str, Any], index: int) -> dict[str, Any]:
    original_name = text(candidate.get("name"), 200)
    fake_name = FAKE_NAMES[index]
    experiences = [
        {
            "companyName": row.get("company_name"),
            "companyLogo": row.get("company_logo"),
            "companyLocation": row.get("company_location"),
            "role": row.get("role"),
            "startDate": row.get("start_date"),
            "endDate": row.get("end_date"),
            "description": row.get("description"),
        }
        for row in candidate.get("experiences", [])
    ]
    educations = [
        {
            "school": row.get("school"),
            "degree": row.get("degree"),
            "field": row.get("field"),
            "startDate": row.get("start_date"),
            "endDate": row.get("end_date"),
            "description": row.get("description"),
        }
        for row in candidate.get("educations", [])
    ]
    extras = [
        {
            "title": row.get("title") or row.get("issued_by"),
            "date": row.get("issued_at"),
            "description": row.get("description"),
        }
        for row in candidate.get("extras", [])
    ]
    extras.extend(
        {
            "title": row.get("title"),
            "date": row.get("published_at"),
            "description": (
                f"인용 {row.get('citation_num')}회"
                if row.get("citation_num") is not None
                else None
            ),
        }
        for row in candidate.get("publications", [])
    )
    display = {
        "name": fake_name,
        "profilePicture": FAKE_PHOTOS[index],
        "headline": candidate.get("headline"),
        "location": candidate.get("location"),
        "bio": candidate.get("bio"),
        "experiences": experiences,
        "educations": educations,
        "extras": extras,
        "profileMarkdown": candidate.get("summary"),
    }
    return remove_source_identity(
        replace_name(display, original_name, fake_name), candidate
    )


def command_finish(args: argparse.Namespace) -> None:
    selection_value = read_json(Path(args.selection))
    selections = (
        selection_value.get("profiles", [])
        if isinstance(selection_value, Mapping)
        else selection_value
    )
    if not isinstance(selections, list) or not 3 <= len(selections) <= 5:
        raise RuntimeError("Selection must contain 3-5 profiles")
    packet_path = run_dir(args.calibration_id) / "candidate-packet.json"
    run_path = run_dir(args.calibration_id) / "run.json"
    packet = read_json(packet_path)
    run = read_json(run_path)
    candidates = {
        text(candidate.get("id"), 100): candidate
        for candidate in packet.get("candidates", [])
        if isinstance(candidate, Mapping)
    }
    allowed_ids = set(packet.get("candidateIds", []))
    selected_ids: list[str] = []
    profiles: list[dict[str, Any]] = []
    for index, selection in enumerate(selections):
        if not isinstance(selection, Mapping):
            raise RuntimeError("Each selection must be an object")
        candidate_id = text(selection.get("candidId"), 100)
        reason = text(selection.get("reason"), 1_200)
        if not candidate_id or candidate_id not in allowed_ids or candidate_id not in candidates:
            raise RuntimeError("Selection contains a candidId outside the retrieved packet")
        if candidate_id in selected_ids:
            raise RuntimeError("Selection contains a duplicate candidId")
        if not reason:
            raise RuntimeError("Each selected profile requires a reason")
        selected_ids.append(candidate_id)
        candidate = candidates[candidate_id]
        profiles.append(
            {
                "profileId": PROFILE_IDS[index],
                "source": {
                    "candidId": candidate_id,
                    "sourceFingerprint": stable_hash(candidate),
                },
                "display": public_display(candidate, index),
                "selection": {
                    "reason": reason,
                    "hypothesis": text(selection.get("hypothesis"), 1_000) or None,
                },
                "review": {
                    "status": "unreviewed",
                    "reason": None,
                    "reviewedAt": None,
                    "reviewedBy": None,
                    "sourceMessageId": None,
                },
            }
        )
    source = {
        "roleFingerprint": stable_hash(run["role"]),
        "roleUpdatedAt": run["role"]["roleUpdatedAt"],
        "hiringBriefFingerprint": stable_hash(run["role"].get("hiringBrief")),
        "companyFingerprint": stable_hash(run["company"]),
    }
    summary = text(
        selection_value.get("summary") if isinstance(selection_value, Mapping) else None,
        500,
    ) or f"{len(profiles)}개 예시 프로필 준비"
    with connect() as conn:
        current = calibration_source_row(conn, args.calibration_id)
        if current["status"] != "running":
            raise RuntimeError("Calibration must still be running")
        with conn.cursor() as cursor:
            cursor.execute(
                """
                select * from public.finish_company_role_calibration_v1(
                  %s::uuid, %s::timestamptz, %s::timestamptz, %s::timestamptz,
                  %s::timestamptz,
                  %s::jsonb, %s::jsonb, %s
                )
                """,
                (
                    args.calibration_id,
                    run["calibration"]["updatedAt"],
                    run["role"]["roleUpdatedAt"],
                    run["role"]["internalRoleUpdatedAt"],
                    run["company"]["updatedAt"],
                    json.dumps(source, ensure_ascii=False),
                    json.dumps(profiles, ensure_ascii=False),
                    summary,
                ),
            )
            finished = dict(cursor.fetchone())
        conn.commit()
    emit({"calibrationId": args.calibration_id, "profileCount": len(profiles), "status": finished["status"]})


def internal_api_base_url() -> str:
    value = text(
        os.environ.get("NEXT_PUBLIC_SITE_URL")
        or os.environ.get("NEXT_PUBLIC_APP_URL")
        or os.environ.get("APP_BASE_URL")
        or "https://matchharper.com"
    )
    return value.rstrip("/")


def delivery_ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())


def command_deliver(args: argparse.Namespace) -> None:
    load_dotenv(ROOT.parent / "worker.env", override=False)
    load_dotenv(ROOT / ".env.local", override=False)
    secret = text(os.environ.get("INTERNAL_WORKER_API_SECRET"))
    if not secret:
        raise RuntimeError("INTERNAL_WORKER_API_SECRET is required")
    body = json.dumps({"calibrationId": args.calibration_id}).encode("utf-8")
    request = urllib_request.Request(
        f"{internal_api_base_url()}/api/internal/company-role-calibrations/deliver",
        data=body,
        headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(
            request,
            timeout=60,
            context=delivery_ssl_context(),
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Calibration delivery failed: HTTP {exc.code} {detail[:500]}") from exc
    emit(payload)


def command_pending_deliveries(args: argparse.Namespace) -> None:
    with connect() as conn:
        with conn.cursor() as cursor:
            cursor.execute("set transaction read only")
        rows = fetch_all(
            conn,
            """
            select calibration.id, calibration.role_id, calibration.created_at
            from public.company_role_calibrations calibration
            where calibration.status = 'ready'
              and coalesce(calibration.payload->'delivery'->>'status', 'pending') <> 'sent'
              and (
                nullif(
                  calibration.payload->'delivery'->>'lastAttemptAt',
                  ''
                ) is null
                or (
                  calibration.payload->'delivery'->>'lastAttemptAt'
                )::timestamptz <= timezone('utc', now()) - interval '12 hours'
              )
              and public.company_role_is_calibration_eligible_v1(calibration.role_id)
            order by calibration.created_at, calibration.id
            limit %s
            """,
            (args.limit,),
        )
        conn.rollback()
    emit({"calibrations": rows})


def command_fail(args: argparse.Namespace) -> None:
    message = f"{text(args.stage, 80)}: {text(args.error, 400)}"
    with connect() as conn:
        row = fetch_one(
            conn,
            "select * from public.fail_company_role_calibration_v1(%s::uuid, %s)",
            (args.calibration_id, message),
        )
        conn.commit()
    emit({"calibrationId": args.calibration_id, "status": row["status"] if row else "failed"})


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    preflight = commands.add_parser("preflight")
    preflight.set_defaults(handler=command_preflight)
    start = commands.add_parser("start")
    start.add_argument("--runner", required=True)
    start.set_defaults(handler=command_start)
    run_sql = commands.add_parser("run-sql")
    run_sql.add_argument("--calibration-id", required=True)
    run_sql.add_argument("--sql-file", required=True)
    run_sql.add_argument("--max-rows", type=int, default=100, choices=range(1, 101))
    run_sql.set_defaults(handler=command_run_sql)
    packet = commands.add_parser("candidate-packet")
    packet.add_argument("--calibration-id", required=True)
    packet.add_argument("--query-result", required=True)
    packet.add_argument("--limit", type=int, default=20, choices=range(3, 51))
    packet.set_defaults(handler=command_candidate_packet)
    finish = commands.add_parser("finish")
    finish.add_argument("--calibration-id", required=True)
    finish.add_argument("--selection", required=True)
    finish.set_defaults(handler=command_finish)
    deliver = commands.add_parser("deliver")
    deliver.add_argument("--calibration-id", required=True)
    deliver.set_defaults(handler=command_deliver)
    pending_deliveries = commands.add_parser("pending-deliveries")
    pending_deliveries.add_argument(
        "--limit", type=int, default=10, choices=range(1, 51)
    )
    pending_deliveries.set_defaults(handler=command_pending_deliveries)
    fail = commands.add_parser("fail")
    fail.add_argument("--calibration-id", required=True)
    fail.add_argument("--stage", required=True)
    fail.add_argument("--error", required=True)
    fail.set_defaults(handler=command_fail)
    return root


def main() -> None:
    args = parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()

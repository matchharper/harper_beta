#!/usr/bin/env python3
"""Read and persist concise role-matching run memory without model calls."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import requests


TABLE = "internal_role_matching_run_memory"
MAX_CONTENT_LENGTH = 1500
MAX_BULLET_ITEMS = 4
ALLOWED_EXECUTION_MODES = {"dry_run", "commit_review", "commit_fit", "send"}


def _base_url(url: str) -> str:
    return url.rstrip("/") + "/rest/v1"


def _headers(key: str, *, write: bool = False) -> dict[str, str]:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if write:
        headers.update({
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        })
    return headers


def normalize_content(value: str) -> str:
    content = value.strip()
    if not content:
        raise ValueError("run memory content must not be empty")
    if len(content) > MAX_CONTENT_LENGTH:
        raise ValueError(
            f"run memory content exceeds {MAX_CONTENT_LENGTH} characters"
        )
    bullet_count = sum(
        line.lstrip().startswith("- ") for line in content.splitlines()
    )
    if bullet_count > MAX_BULLET_ITEMS:
        raise ValueError(
            f"run memory contains more than {MAX_BULLET_ITEMS} bullet items"
        )
    return content


def _validated_completion(manifest: dict[str, Any]) -> tuple[str, str]:
    status = str(manifest.get("status") or "").strip()
    completion_status = (
        str(manifest.get("matchingCompletionStatus") or "").strip()
        if status == "run_memory_write_failed"
        else status
    )
    execution_mode = str(manifest.get("executionMode") or "").strip()
    if execution_mode not in ALLOWED_EXECUTION_MODES:
        raise RuntimeError(f"unsupported execution mode {execution_mode!r}")
    expected_status = f"completed_{execution_mode}"
    if completion_status != expected_status:
        raise RuntimeError(
            f"run memory requires status {expected_status!r}, got {status!r}"
        )
    if manifest.get("sourceUnchangedAtFinalPreflight") is not True:
        raise RuntimeError("run memory requires a successful final source preflight")
    if int(manifest.get("externalModelCallsAttempted") or 0) != 0:
        raise RuntimeError("invalid run cannot write run memory")
    if manifest.get("candidatePayloadSentToExternalModel") is True:
        raise RuntimeError("invalid run cannot write run memory")
    if execution_mode == "dry_run":
        business_write_fields = (
            "databaseWrites",
            "considerationWrites",
            "reviewMemoryWrites",
            "fitWrites",
            "recommendationRunsQueued",
            "deliveriesAttempted",
        )
        if any(int(manifest.get(field) or 0) != 0 for field in business_write_fields):
            raise RuntimeError("dry run contains a business write or delivery")
    return completion_status, execution_mode


def fetch_latest_run_memory(
    url: str,
    key: str,
    role_id: str,
) -> dict[str, Any] | None:
    response = requests.get(
        f"{_base_url(url)}/{TABLE}",
        headers=_headers(key),
        params={
            "select": "role_id,run_id,content,created_at",
            "role_id": f"eq.{role_id}",
            "order": "created_at.desc,run_id.desc",
            "limit": 1,
        },
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        raise RuntimeError("unexpected run memory response")
    return dict(rows[0]) if rows else None


def save_run_memory(
    url: str,
    key: str,
    *,
    role_id: str,
    run_id: str,
    content: str,
) -> dict[str, Any]:
    normalized = normalize_content(content)
    response = requests.post(
        f"{_base_url(url)}/{TABLE}",
        headers=_headers(key, write=True),
        params={"on_conflict": "role_id,run_id"},
        json={
            "role_id": role_id,
            "run_id": run_id,
            "content": normalized,
        },
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list) or len(rows) != 1:
        raise RuntimeError("run memory write did not return exactly one row")
    return dict(rows[0])


def save_run_directory(run_dir: Path, url: str, key: str) -> dict[str, Any]:
    manifest_path = run_dir / "run_manifest.json"
    content_path = run_dir / "run_memory.md"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    completion_status, _ = _validated_completion(manifest)

    try:
        role_id = str(manifest.get("roleId") or "").strip()
        if not role_id:
            raise RuntimeError("run manifest is missing roleId")
        run_id = str(manifest.get("runId") or run_dir.name).strip()
        content = content_path.read_text(encoding="utf-8")
        normalized = normalize_content(content)
        row = save_run_memory(
            url,
            key,
            role_id=role_id,
            run_id=run_id,
            content=normalized,
        )
        if (
            str(row.get("role_id") or "") != role_id
            or str(row.get("run_id") or "") != run_id
            or normalize_content(str(row.get("content") or "")) != normalized
        ):
            raise RuntimeError("run memory write response did not verify role, run, and content")
        receipt = {
            "roleId": role_id,
            "runId": run_id,
            "createdAt": row.get("created_at"),
            "contentLength": len(normalized),
            "contentVerified": True,
        }
        manifest["status"] = completion_status
        manifest["runMemoryWrites"] = 1
        manifest["runMemoryRunId"] = run_id
        manifest["runMemoryPending"] = False
        manifest.pop("matchingCompletionStatus", None)
        manifest.pop("runMemoryError", None)
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        (run_dir / "run_memory_receipt.json").write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        verification_path = run_dir / "verification.json"
        if verification_path.exists():
            verification = json.loads(verification_path.read_text(encoding="utf-8"))
            verification["runMemoryWritePending"] = False
            verification["runMemoryWriteVerified"] = True
            verification["runMemoryReceipt"] = receipt
            verification_path.write_text(
                json.dumps(verification, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        verification_md_path = run_dir / "verification.md"
        if verification_md_path.exists():
            verification_md = verification_md_path.read_text(encoding="utf-8")
            verification_md = verification_md.replace(
                "- run memory: pending as the final allowed internal write",
                (
                    "- run memory: `1` final allowed internal write; "
                    f"content verified (`{len(normalized)}` chars)"
                ),
            )
            verification_md_path.write_text(verification_md, encoding="utf-8")
        return receipt
    except Exception as error:
        manifest["status"] = "run_memory_write_failed"
        manifest["matchingCompletionStatus"] = completion_status
        manifest["runMemoryWrites"] = 0
        manifest["runMemoryError"] = f"{type(error).__name__}: {error}"[:500]
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        raise


def _credentials(root: Path) -> tuple[str, str]:
    load_dotenv(root / ".env.local", override=False)
    url = str(os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("Supabase service credentials are required")
    return url, key


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    save_parser = subparsers.add_parser("save")
    save_parser.add_argument("--run-dir", required=True)
    read_parser = subparsers.add_parser("read")
    read_parser.add_argument("--role-id", required=True)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    url, key = _credentials(root)
    if args.command == "save":
        result = save_run_directory(Path(args.run_dir).resolve(), url, key)
    else:
        result = fetch_latest_run_memory(url, key, args.role_id)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

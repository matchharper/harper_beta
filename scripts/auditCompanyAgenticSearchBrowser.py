"""Compare a preserved actual case with its browser-only local clone, read-only."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "docs/evaluation/company-agentic-role-search/runs"
TABLES = (
    "company_first_search_runs", "company_internal_roles", "company_intro_candidates",
    "company_memory_entries", "company_messages", "company_role_candidate_evaluations",
    "company_roles", "company_talent_relays", "company_talent_requests",
    "company_workspace_credit_periods", "company_workspace_slots", "meeting_schedules",
    "talent_opportunity_fit", "talent_opportunity_recommendation", "talent_progress",
)


def read_table(database: str, table: str, port: int):
    if not database.startswith("harper_agentic_") or not all(c.isalnum() or c == "_" for c in database):
        raise ValueError("Dedicated local evaluation database required")
    if table not in TABLES:
        raise ValueError("Known snapshot table required")
    binary = Path(os.environ.get("COMPANY_EVAL_PG_BIN", "/usr/local/opt/postgresql@17/bin")) / "psql"
    statement = f"begin transaction read only; select coalesce(json_agg(to_jsonb(q)), '[]') from public.\"{table}\" q; commit;"
    raw = subprocess.check_output([str(binary), "-h", "127.0.0.1", "-p", str(port),
        "-U", "postgres", "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement], text=True)
    rows = json.loads(raw)
    key = "role_id" if table in {"company_roles", "company_internal_roles"} else "id"
    return {str(row[key]): row for row in rows}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    directory = (RUNS / args.run).resolve()
    if directory.parent != RUNS or not directory.is_dir():
        raise ValueError("Existing ignored browser run required")
    target = directory / "browser-state-audit.json"
    if target.exists():
        raise ValueError("Preserve existing audit; use a fresh browser clone/run")
    metadata = json.loads((directory / "sandbox.json").read_text())
    tables = {}
    for table in TABLES:
        before = read_table(metadata["baseline"], table, metadata["pgPort"])
        after = read_table(metadata["database"], table, metadata["pgPort"])
        tables[table] = {
            "beforeCount": len(before), "afterCount": len(after),
            "beforeHash": digest(before), "afterHash": digest(after),
            "added": [after[key] for key in sorted(after.keys() - before.keys())],
            "removed": [before[key] for key in sorted(before.keys() - after.keys())],
            "changed": [{"before": before[key], "after": after[key]}
                for key in sorted(before.keys() & after.keys()) if before[key] != after[key]],
        }
    result = {
        "reviewedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Read-only whole-table comparison: original completed case vs browser-only clone",
        "runnerHash": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "originalDatabase": metadata["baseline"], "browserDatabase": metadata["database"],
        "equal": all(row["beforeHash"] == row["afterHash"] for row in tables.values()),
        "tables": tables,
        "interpretation": "Changes are recorded, not automatically classified as intended or unintended. Review actual kind and UI actions; a first-profile-view audit is not a pipeline decision or outreach.",
    }
    os.umask(0o077)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    target.chmod(0o600)
    print(json.dumps({"output": str(target), "equal": result["equal"], "changes": {
        table: {key: len(row[key]) for key in ("added", "removed", "changed")}
        for table, row in tables.items() if row["beforeHash"] != row["afterHash"]}}))


if __name__ == "__main__":
    main()

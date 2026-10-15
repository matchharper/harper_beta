"""Freeze a read-only random external-JD sample for the native browser notebook."""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / "docs/evaluation/application-form-inspection"
sys.path.insert(0, str(ROOT.parent / "harper_worker"))
from opp.utils.new_runtime import connect_read_only, load_config


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, default=str)
        handle.write("\n")


def run(args):
    destination = TASK / "private" / args.dataset
    destination.resolve().relative_to((TASK / "private").resolve())
    if (destination / "sample.json").exists():
        raise ValueError("Refusing to overwrite a frozen sample")
    excluded = set()
    for path in (TASK / "private").glob("*/sample.json"):
        prior = json.loads(path.read_text())
        excluded.update(case["url"] for case in prior.get("cases", []))
    seed = uuid4().hex
    query = """WITH eligible AS (
 SELECT cr.role_id::text AS role_id, cr.name AS role_name,
        cr.external_jd_url AS url, cw.company_name, cr.source_provider,
        cr.status, cr.posted_at, cr.is_expired, cr.expires_at, cr.location_text
 FROM public.company_roles cr
 LEFT JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id
 WHERE cr.source_type='external' AND cr.is_expired IS DISTINCT FROM TRUE
   AND (cr.expires_at IS NULL OR cr.expires_at>now())
   AND coalesce(cr.status,'') NOT IN ('ended','expired','closed','inactive','archived')
   AND coalesce(cr.information->>'testOnly','false')<>'true'
   AND (cr.external_jd_url LIKE 'https://%%' OR cr.external_jd_url LIKE 'http://%%')
   AND cr.external_jd_url <> ALL(%s::text[])
), unique_links AS (
 SELECT DISTINCT ON (url) * FROM eligible ORDER BY url, role_id
) SELECT * FROM unique_links ORDER BY md5(url || %s) LIMIT %s"""
    with connect_read_only(load_config()) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SHOW transaction_read_only")
            barrier = cursor.fetchone()["transaction_read_only"]
            if barrier != "on":
                raise RuntimeError("Read-only barrier unavailable")
            cursor.execute(query, (sorted(excluded), seed, args.count))
            cases = cursor.fetchall()
    if len(cases) != args.count or any(case["is_expired"] is True for case in cases):
        raise RuntimeError("Sample eligibility mismatch")
    for index, case in enumerate(cases, 1):
        case["case_id"] = args.dataset + "-jd-" + str(index).zfill(2)
    sample = {"datasetVersion": args.dataset, "clientDate": args.client_date,
              "capturedAt": datetime.now(timezone.utc).isoformat(), "readOnly": True,
              "readOnlyBarrier": barrier, "query": query, "seed": seed,
              "excludedUrls": sorted(excluded), "goldVersion": None,
              "approval": "User authorized five new random external JDs excluding is_expired=true, Sol low read-only inspection and independent public-page review. No applicant data or real-company submission.",
              "cases": cases}
    save(destination / "sample.json", sample)
    print(json.dumps({"path": str(destination / "sample.json"),
                      "sha256": hashlib.sha256((destination / "sample.json").read_bytes()).hexdigest(),
                      "readOnly": True, "excludedPreviousUrls": len(excluded),
                      "cases": [{k: case.get(k) for k in ("case_id", "company_name", "role_name", "url", "is_expired")} for case in cases]}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--client-date", required=True)
    run(parser.parse_args())

"""Run a captured private JD sample through the canonical standalone notebook.

This launcher imports notebook cells instead of duplicating its prompt or API loop.
No automatic task retries, sign-in, applicant answers or attachments are enabled.
"""
import argparse
import hashlib
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / "docs/evaluation/application-form-inspection"
NOTEBOOK = ROOT / "output/jupyter-notebook/agents_api_application_inputs.ipynb"


def run(args):
    sample_path = args.sample.resolve()
    sample_path.relative_to(TASK / "private")
    sample = json.loads(sample_path.read_text())
    if not sample.get("readOnly"):
        raise ValueError("A verified read-only capture is required")
    cases = sample["cases"]
    if args.case:
        selected = set(args.case)
        unknown = selected - {case["case_id"] for case in cases}
        if unknown:
            raise ValueError("Unknown case IDs: " + ", ".join(sorted(unknown)))
        cases = [case for case in cases if case["case_id"] in selected]
    gold = json.loads(args.gold.read_text()) if args.gold else None
    namespace = {}
    for cell in json.loads(NOTEBOOK.read_text())["cells"]:
        if cell["cell_type"] == "code" and set(cell["metadata"].get("tags", [])) & {"config", "definitions", "approvals", "runner"}:
            source = cell["source"]
            exec(compile("".join(source) if isinstance(source, list) else source, "<notebook>", "exec"), namespace)
    observations = json.loads((sample_path.parent / "redirect-observations.json").read_text())
    origins = {origin for row in observations for origin in row.get("origins", [])}
    namespace.update(SHOW_PROGRESS=False, ALLOW_SIGN_IN=False,
                     UNKNOWN_ORIGIN_POLICY="deny", EXTRA_APPROVED_ORIGINS=origins,
                     REASONING_EFFORT=args.reasoning)
    dataset = sample["datasetVersion"]
    run_id = "input-list-v2-" + dataset + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    out = TASK / "runs" / run_id
    save = namespace["private_json"]
    manifest = {
        "task": "application-form-inspection", "datasetVersion": dataset,
        "outputContractVersion": namespace["OUTPUT_CONTRACT_VERSION"], "runId": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(), "clientDate": sample.get("clientDate"),
        "sampleSha256": hashlib.sha256(sample_path.read_bytes()).hexdigest(),
        "notebookSha256": hashlib.sha256(NOTEBOOK.read_bytes()).hexdigest(),
        "launcherSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "goldVersion": gold.get("goldVersion") if gold else None,
        "goldSha256": hashlib.sha256(args.gold.read_bytes()).hexdigest() if args.gold else None,
        "selectedCaseIds": [case["case_id"] for case in cases],
        "provider": "openai_agents", "model": args.model,
        "reasoning": args.reasoning or "provider_default", "serviceTier": "provider_default",
        "sampling": "provider_default",
        "timeoutSeconds": namespace["MAX_SECONDS"], "maxConcurrentCases": args.concurrency,
        "usageWaitSeconds": args.usage_wait_seconds, "taskRetries": 0,
        "timeDefinition": "inspection_elapsed_seconds excludes additional accounting capture; elapsed_seconds includes it. Both include creation, work, transport and cleanup.",
        "originPolicy": {"unknown": "deny", "approved": sorted(origins)},
        "approval": sample.get("approval"), "publicInputScope": "Public JD URL only; no document, applicant data, authentication or application submission.",
    }
    save(out / "manifest.json", manifest)
    key = namespace["read_api_key"]()
    lock = threading.Lock()

    def inspect(case):
        with lock:
            print(json.dumps({"stage": "start", "case": case["case_id"], "company": case["company_name"],
                              "model": args.model, "reasoning": args.reasoning}, ensure_ascii=False), flush=True)
        result = namespace["inspect_application"](case["url"], args.model, api_key=key,
                                                   usage_wait_seconds=args.usage_wait_seconds)
        result["case"] = case
        save(out / (case["case_id"] + ".json"), {k: v for k, v in result.items() if k != "screenshot"})
        if result.get("saved_to"):
            path = Path(result["saved_to"]) / "manifest.json"
            record = json.loads(path.read_text())
            record.update(datasetVersion=dataset, caseId=case["case_id"], batchId=run_id,
                          sampleSha256=manifest["sampleSha256"], goldVersion=manifest["goldVersion"],
                          goldSha256=manifest["goldSha256"])
            save(path, record)
        inventory = result.get("inventory") or {}
        row = {"case_id": case["case_id"], "company": case["company_name"], "role": case["role_name"],
               "model": args.model, "reasoning": args.reasoning,
               "input_url": case["url"], "application_url": inventory.get("application_url"),
               "status": result["run_status"], "fields": len(inventory.get("fields", [])),
               "seconds": result["inspection_elapsed_seconds"], "total_seconds": result["elapsed_seconds"],
               "accounting_seconds": result["timings"].get("usage_capture_seconds"),
               "operations": len(result["browser_activity"]), "usage": result.get("usage"),
               "coverage_note": inventory.get("coverage_note"), "error": result["error"],
               "session_deleted": result["session_deleted"], "cleanup_errors": result["cleanup_errors"],
               "result_file": str(out / (case["case_id"] + ".json"))}
        with lock:
            print(json.dumps({"stage": "done", **row}, ensure_ascii=False), flush=True)
        return row

    started = time.monotonic()
    rows = []
    try:
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            for future in as_completed([pool.submit(inspect, case) for case in cases]):
                rows.append(future.result())
                save(out / "summary.json", sorted(rows, key=lambda row: row["case_id"]))
    finally:
        del key
    manifest["batchSeconds"] = round(time.monotonic() - started, 2)
    save(out / "manifest.json", manifest)
    print(json.dumps({"stage": "batch_done", "cases": len(rows), "seconds": manifest["batchSeconds"], "directory": str(out)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", type=Path, required=True)
    parser.add_argument("--model", default="gpt-6.1-sol")
    parser.add_argument("--reasoning", choices=("none", "low", "medium", "high", "xhigh", "max"))
    parser.add_argument("--case", action="append", help="Select a frozen case ID; repeat to select a subset")
    parser.add_argument("--gold", type=Path, help="Reviewed, de-identified gold file; never supplied to the model")
    parser.add_argument("--concurrency", type=int, choices=(1, 2, 3), default=3)
    parser.add_argument("--usage-wait-seconds", type=float, default=20)
    run(parser.parse_args())

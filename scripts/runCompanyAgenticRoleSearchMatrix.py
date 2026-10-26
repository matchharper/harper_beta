"""Run each frozen case once in isolated OS processes, restoring one baseline.

This schedules the canonical runner; it does not interpret prompts, alter tool
choices or synthesize results. Qualitative review remains separate.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs/evaluation/company-agentic-role-search"


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--processes", type=int, default=4)
    parser.add_argument("--model")
    parser.add_argument("--acknowledge-source-condition")
    parser.add_argument("--preserve-cases", default="")
    parser.add_argument("--dataset-manifest", default="manifest-v1.json")
    parser.add_argument("--local-migrations", default="")
    parser.add_argument("--state-tables", default="")
    parser.add_argument("--only", default="", help="Explicit subset of the existing frozen cases")
    parser.add_argument("--recovery-of", help="Prior failed run; preserve its raw artifacts and retry only failed cases")
    parser.add_argument("--runner", default="scripts/evalCompanyAgenticRoleSearch.ts",
        choices=["scripts/evalCompanyAgenticRoleSearch.ts", "scripts/evalCompanyHiringBriefHistory.ts"])
    args = parser.parse_args()
    if args.processes < 1:
        raise ValueError("At least one OS process is required")
    directory = REGISTRY / "runs" / args.run
    if directory.parent != REGISTRY / "runs":
        raise ValueError("A new ignored evaluation run name is required")
    dataset_path = (REGISTRY / args.dataset_manifest).resolve()
    if not dataset_path.is_relative_to(REGISTRY):
        raise ValueError("Dataset manifest must belong to the evaluation registry")
    dataset = json.loads(dataset_path.read_text())
    for file, expected_hash in dataset["files"].items():
        frozen_file = (REGISTRY / file).resolve()
        if not frozen_file.is_relative_to(REGISTRY) or hashlib.sha256(frozen_file.read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f"Frozen dataset changed: {file}")
    cases_file = dataset.get("casesFile", "cases-v1.json")
    if cases_file not in dataset["files"]:
        raise ValueError("Cases must be hash-frozen by the selected dataset manifest")
    cases = json.loads((REGISTRY / cases_file).read_text())["cases"]
    frozen_case_ids = [case["id"] for case in cases]
    if args.only:
        selected = args.only.split(',')
        if len(set(selected)) != len(selected) or set(selected) - set(frozen_case_ids):
            raise ValueError("--only must name unique existing frozen cases")
        cases = [case for case in cases if case["id"] in selected]
    recovery = None
    if args.recovery_of:
        previous_path = (REGISTRY / "runs" / args.recovery_of / "manifest.json").resolve()
        if previous_path.parent.parent != (REGISTRY / "runs").resolve():
            raise ValueError("Recovery source must be a registered run")
        previous = json.loads(previous_path.read_text())
        if previous["baseline"] != args.baseline or previous["datasetManifestHash"] != hashlib.sha256(dataset_path.read_bytes()).hexdigest():
            raise ValueError("Recovery must use the identical frozen dataset and baseline")
        failed = {child["caseId"]: child for child in previous["children"] if child["status"] == "execution_error"}
        if any(case["id"] not in failed for case in cases):
            raise ValueError("Recovery may only retry explicitly failed cases; do not rerun successes")
        recovery = {"runId": args.recovery_of, "manifestSha256": hashlib.sha256(previous_path.read_bytes()).hexdigest(),
                    "attemptsPreserved": [failed[case["id"]]["runId"] for case in cases],
                    "reason": "Infrastructure failure; prior raw errors and partial state remain immutable"}
    os.umask(0o077)
    directory.mkdir(mode=0o700)
    if recovery:
        (directory / "recovery-source-manifest.json").write_text(json.dumps(previous, ensure_ascii=False, indent=2) + "\n")
    children = [dict(runId=f"{args.run}-{case['id'].lower()}", caseId=case["id"], status="queued") for case in cases]
    manifest = dict(experiment=args.run, status="running", startedAt=now(), baseline=args.baseline, canonicalRunner=args.runner,
        parallelOsProcesses=args.processes, cases=[case["id"] for case in cases], children=children,
        modelOverride=args.model, sourceConditionAcknowledgment=args.acknowledge_source_condition,
        quality="pending_semantic_review", productionWrites=0, externalDelivery=False,
        schedulerSourceHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        frozenCaseIds=frozen_case_ids, selectedSubset=bool(args.only), recoveryOf=recovery,
        datasetManifest=dataset, datasetManifestFile=args.dataset_manifest,
        datasetManifestHash=hashlib.sha256(dataset_path.read_bytes()).hexdigest(),
        hostAwakeGuard=os.environ.get("COMPANY_EVAL_HOST_AWAKE_GUARD"),
        hostAwakeGuardBoundary="Temporary idle-sleep inhibition only; clamshell or manual sleep remains possible")
    lock = threading.Lock()

    def save():
        target = directory / "manifest.json"
        temporary = directory / "manifest.next.json"
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        temporary.chmod(0o600)
        temporary.replace(target)

    save()

    def execute(child):
        command = ["pnpm", "exec", "tsx", "--tsconfig", "scripts/tsconfig.json", args.runner,
            "--mode=run", f"--run={child['runId']}", f"--baseline={args.baseline}", f"--only={child['caseId']}",
            f"--dataset-manifest={args.dataset_manifest}"]
        if args.model:
            command.append(f"--model={args.model}")
        if args.acknowledge_source_condition:
            command.append(f"--acknowledge-source-condition={args.acknowledge_source_condition}")
        if args.preserve_cases:
            command.append(f"--preserve-cases={args.preserve_cases}")
        if args.local_migrations:
            command.append(f"--local-migrations={args.local_migrations}")
        if args.state_tables:
            command.append(f"--state-tables={args.state_tables}")
        with lock:
            child.update(status="running", startedAt=now(), command=command)
            save()
        with (directory / f"{child['caseId']}.log").open("x") as output:
            result = subprocess.run(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT)
        child_manifest_path = REGISTRY / "runs" / child["runId"] / "manifest.json"
        with lock:
            child.update(status="finished" if result.returncode == 0 else "execution_error", exitCode=result.returncode, finishedAt=now())
            if child_manifest_path.exists():
                child_manifest = json.loads(child_manifest_path.read_text())
                child.update(manifest=str(child_manifest_path.relative_to(ROOT)),
                    model=child_manifest.get("model"), sourceFingerprint=child_manifest.get("sourceFingerprint"),
                    workerSourceFingerprint=hashlib.sha256(json.dumps(child_manifest.get("workerSourceHashes"), sort_keys=True).encode()).hexdigest(),
                    evaluationClock=child_manifest.get("evaluationClock"),
                    requestClockPolicy=child_manifest.get("requestClockPolicy", "frozen_baseline_clock"),
                    sourceChangedDuringRun=child_manifest.get("sourceChangedDuringRun"),
                    workerSourceChangedDuringRun=child_manifest.get("workerSourceChangedDuringRun"), results=child_manifest.get("results") or [{"id":child["caseId"],"status":child_manifest.get("executionStatus"),"quality":child_manifest.get("quality")}])
            save()
        print(json.dumps({"case": child["caseId"], "status": child["status"], "results": child.get("results"), "runId": child["runId"]}), flush=True)

    with ThreadPoolExecutor(max_workers=args.processes) as pool:
        futures = [pool.submit(execute, child) for child in children]
        for future in as_completed(futures):
            future.result()
    manifest.update(status="executed_review_pending" if all(child["exitCode"] == 0 for child in children) else "failed_or_incomplete", finishedAt=now(),
        sourceHashEqual=len({child.get("sourceFingerprint") for child in children}) == 1,
        workerSourceHashEqual=len({child.get("workerSourceFingerprint") for child in children}) == 1,
        evaluationClockEqual=(len({child.get("evaluationClock") for child in children}) == 1
            if all(child.get("requestClockPolicy") == "frozen_baseline_clock" for child in children) else None),
        requestClockPolicyEqual=len({child.get("requestClockPolicy") for child in children}) == 1)
    save()


if __name__ == "__main__":
    main()

"""Summarize recorded company-agent runs without grading their language.

Reads canonical company completions once and delegates Worker call accounting to
its canonical metrics module. Private inputs and the aggregate remain ignored.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs/evaluation/company-agentic-role-search"
sys.path.insert(0, str(ROOT.parent / "harper_worker"))
from llm_evals.company_agentic_role_search.metrics import worker_metrics
from llm_evals.company_agentic_role_search.pricing import standard_estimate, PRICING_VERSION


def read(path):
    return json.loads(path.read_text())


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def empty_usage():
    return dict(calls=0, inputTokens=0, cachedInputTokens=0, outputTokens=0,
                providerReportedCostUsd=None, callsWithoutReportedCost=0, cacheWriteTokens=0,
                estimatedCalls=0, standardEstimateUsdMin=0., standardEstimateUsdMax=0.)


def merge_usage(target, source):
    for key in ("calls", "inputTokens", "cachedInputTokens", "outputTokens", "callsWithoutReportedCost", "cacheWriteTokens", "estimatedCalls", "standardEstimateUsdMin", "standardEstimateUsdMax"):
        target[key] += source.get(key, 0)
    if source.get("providerReportedCostUsd") is not None:
        target["providerReportedCostUsd"] = (target["providerReportedCostUsd"] or 0) + source["providerReportedCostUsd"]


def company_usage(completions):
    groups = defaultdict(empty_usage)
    errors = 0
    for call in completions:
        if call.get("error"):
            errors += 1
        usage = (call.get("response") or {}).get("usage") or {}
        details = usage.get("prompt_tokens_details") or usage.get("input_tokens_details") or {}
        model = call.get("actualModel") or "unreported"
        estimate = standard_estimate(model, usage)
        merge_usage(groups[model], dict(calls=1, inputTokens=usage.get("prompt_tokens", usage.get("input_tokens", 0)),
            cachedInputTokens=details.get("cached_tokens", 0), cacheWriteTokens=details.get("cache_write_tokens", 0),
            estimatedCalls=int(estimate is not None), standardEstimateUsdMin=(estimate or {}).get("min", 0.), standardEstimateUsdMax=(estimate or {}).get("max", 0.), outputTokens=usage.get("completion_tokens", usage.get("output_tokens", 0)),
            providerReportedCostUsd=usage.get("cost"), callsWithoutReportedCost=int(usage.get("cost") is None)))
    return dict(groups), errors


def state_changes(before, after):
    result = {}
    for table in sorted(set(before) | set(after)):
        key = "role_id" if table in {"company_roles", "company_internal_roles"} else "id"
        old = {str(row[key]): row for row in before.get(table, [])}
        new = {str(row[key]): row for row in after.get(table, [])}
        result[table] = dict(before=len(old), after=len(new), added=len(new.keys() - old.keys()),
            removed=len(old.keys() - new.keys()), changed=sum(old[k] != new[k] for k in old.keys() & new.keys()))
    return result


def summarize(run):
    directory = REGISTRY / "runs" / run
    if directory.parent != REGISTRY / "runs" or not directory.is_dir():
        raise ValueError("An existing ignored evaluation run is required")
    manifest = read(directory / "manifest.json")
    children = [REGISTRY / "runs" / item["runId"] for item in manifest.get("children", [])] or [directory]
    source_checks, cases = [], []
    all_usage = defaultdict(empty_usage)
    initial_hashes = {}
    for child in children:
        child_manifest = read(child / "manifest.json")
        source_checks.append(dict(runId=child.name, executionStatus=child_manifest.get("executionStatus"),
            model=child_manifest.get("model"), sourceFingerprint=child_manifest.get("sourceFingerprint"),
            workerSourceFingerprint=digest(child_manifest.get("workerSourceHashes")),
            sourceChangedDuringRun=child_manifest.get("sourceChangedDuringRun"),
            workerSourceChangedDuringRun=child_manifest.get("workerSourceChangedDuringRun"),
            evaluationClock=child_manifest.get("evaluationClock"),
            requestClockPolicy=child_manifest.get("requestClockPolicy", "frozen_baseline_clock"),
            baselineClock=child_manifest.get("baselineClock", child_manifest.get("evaluationClock")),
            baseline=child_manifest.get("scoringBaseline")))
        summaries = {item["id"]: item for item in child_manifest.get("results", [])}
        for unit in sorted(child.glob("ARS*")):
            if not unit.is_dir():
                continue
            row = dict(summaries.get(unit.name, {"id": unit.name, "status": "running"}), artifact=str(unit.relative_to(REGISTRY)))
            completions = read(unit / "completions.json") if (unit / "completions.json").exists() else []
            usage, errors = company_usage(completions)
            row.update(companyUsage=usage, completionErrors=errors,
                companyApiElapsedMs=sum(item.get("elapsedMs", 0) for item in completions),
                companyFinishReasons=dict(Counter(choice.get("finish_reason", "unreported")
                    for item in completions for choice in (item.get("response") or {}).get("choices", []))))
            row["companyInputTokensByCall"] = [((item.get("response") or {}).get("usage") or {}).get("prompt_tokens") for item in completions]
            model_tools = [tool for item in completions
                for choice in (item.get("response") or {}).get("choices", [])
                for tool in (choice.get("message") or {}).get("tool_calls", [])]
            row["modelToolNames"] = dict(Counter((tool.get("function") or {}).get("name", "unreported")
                for tool in model_tools))
            row["modelToolCalls"] = len(model_tools)
            row["loaderCalls"] = row["modelToolNames"].get("load_capabilities", 0)
            row["modelToolBatches"] = [dict(completion=item.get("index"), elapsedMs=item.get("elapsedMs"),
                tools=dict(Counter((tool.get("function") or {}).get("name", "unreported")
                    for choice in (item.get("response") or {}).get("choices", [])
                    for tool in (choice.get("message") or {}).get("tool_calls", [])))) for item in completions]
            row["modelCompletionsWithTools"] = sum(bool(batch["tools"]) for batch in row["modelToolBatches"])
            row["maxModelToolsPerCompletion"] = max((sum(batch["tools"].values())
                for batch in row["modelToolBatches"]), default=0)
            model_call_ids = Counter(tool["id"] for tool in model_tools if tool.get("id"))
            row["distinctModelToolCallIds"] = len(model_call_ids)
            row["duplicateModelToolCallIds"] = {key: count for key, count in model_call_ids.items() if count > 1}
            for model, values in usage.items():
                merge_usage(all_usage[model], values)
            trace = read(unit / "tool-trace.json") if (unit / "tool-trace.json").exists() else []
            row["tools"] = dict(Counter(item["name"] for item in trace))
            row["executorToolCalls"] = len(trace)
            executor_call_ids = Counter(item["callId"] for item in trace if item.get("callId"))
            row["distinctExecutorCallIds"] = len(executor_call_ids)
            row["duplicateExecutorCallIds"] = {key: count for key, count in executor_call_ids.items() if count > 1}
            outputs = read(unit / "outputs.json") if (unit / "outputs.json").exists() else []
            summary_ids = Counter((turn_index, item.get("callId"))
                for turn_index, output in enumerate(outputs)
                for item in output.get("toolResults", []) if item.get("callId"))
            row["duplicateUiSummaryCallIds"] = [dict(turn=turn_index + 1, callId=call_id, summaries=count)
                for (turn_index, call_id), count in summary_ids.items() if count > 1]
            row["requestTimes"] = [read(clock) for clock in sorted(unit.glob("turn-*-clock.json"))]
            row["toolErrors"] = sum(bool(item.get("error")) for item in trace)
            row["workerExecutions"] = [execution for item in trace for execution in item.get("workerExecutions", [])]
            row["workerBarrierFailures"] = sum(bool(item.get("workerExecutionError")) for item in trace)
            transcripts = []
            for transcript_path in sorted(unit.glob("turn-*-tool-transcript.json")):
                transcript = read(transcript_path)
                if isinstance(transcript, list):
                    lengths = [len(item.get("content") or "") for item in transcript if item.get("role") == "tool"]
                    transcripts.append(dict(file=transcript_path.name, toolMessages=len(lengths),
                        toolCharacters=sum(lengths), longestToolCharacters=max(lengths, default=0)))
            row["serializedToolTranscriptSizes"] = transcripts
            row["workers"] = []
            for worker in sorted(unit.glob("worker-*")):
                metrics = worker_metrics(worker)
                result = read(worker / "result.json") if (worker / "result.json").exists() else {}
                search = result.get("roleSearch") or {}
                row["workers"].append(dict(artifact=str(worker.relative_to(REGISTRY)), metrics=metrics,
                    completed=(worker / "result.json").exists(), errorRecorded=(worker / "error.json").exists(),
                    resultCounts=result.get("counts"), roleSearchCounts=search.get("counts"),
                    scope=search.get("scope"), startStage=search.get("startStage"),
                    presentationDelta={key: len(search.get(key) or []) for key in
                        ("addedTalentIds", "removedTalentIds", "refreshedTalentIds", "retainedTalentIds")}))
                for model, values in metrics["byModel"].items():
                    merge_usage(all_usage[model], values)
            row["workerDecisionErrorAttempts"] = sum(sum(worker["metrics"]["decisionsErrors"].values())
                for worker in row["workers"])
            if (unit / "state-before.json").exists():
                initial_hashes[unit.name] = hashlib.sha256((unit / "state-before.json").read_bytes()).hexdigest()
                if (unit / "state-after.json").exists():
                    row["stateChanges"] = state_changes(read(unit / "state-before.json"), read(unit / "state-after.json"))
            cases.append(row)
    counts = Counter(item["id"] for item in cases)
    dataset = manifest.get("datasetManifest") or read(REGISTRY / "manifest-v1.json")
    cases_file = dataset.get("casesFile", "cases-v1.json")
    expected = manifest.get("selectedCaseIds") or manifest.get("cases") or [item["id"] for item in read(REGISTRY / cases_file)["cases"]]
    return dict(experiment=run, generatedAt=datetime.now(timezone.utc).isoformat(), cases=cases,
        reportSourceHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        workerMetricsSourceHash=hashlib.sha256((ROOT.parent / "harper_worker/llm_evals/company_agentic_role_search/metrics.py").read_bytes()).hexdigest(),
        usageByModel=dict(all_usage), sourceChecks=source_checks,
        priceEstimate=dict(version=PRICING_VERSION,assumption="Standard/global text prices; unknown cache TTL spans 30m–12h. Not actual billing. Only estimatedCalls are covered; providerReportedCostUsd is a separate subset."),
        integrity=dict(expectedCases=expected, missingCases=sorted(set(expected) - counts.keys()),
            duplicateCases={key: count for key, count in counts.items() if count != 1},
            initialStateHashes=initial_hashes, initialStatesEqual=len(set(initial_hashes.values())) <= 1,
            betaSourceEqual=len({item["sourceFingerprint"] for item in source_checks}) == 1,
            workerSourceEqual=len({item["workerSourceFingerprint"] for item in source_checks}) == 1,
            evaluationClockEqual=(len({item["evaluationClock"] for item in source_checks}) == 1
                if all(item["requestClockPolicy"] == "frozen_baseline_clock" for item in source_checks) else None),
            requestClockPolicyEqual=len({item["requestClockPolicy"] for item in source_checks}) == 1,
            completedSourceChecks=all(item["sourceChangedDuringRun"] is False and item["workerSourceChangedDuringRun"] is False for item in source_checks)),
        quality="Not graded by this script. Read actual outputs, tool transcripts, state and separate semantic reviews.",
        costCoverage="Only provider-reported USD is summed. Missing USD is null, not zero; response HTTP copies are not double-counted. Worker Decisions error attempts without response usage are separate in workerDecisionErrorAttempts/decisionsErrors and are not included in byModel successful Decisions counts. They may have unknown provider cost.",
        toolCountCoverage="modelToolCalls/modelToolNames count actual response tool_calls, including the internal capability loader. executorToolCalls/tools count actual external executor traces. Original toolCalls remains the runner's executor count. UI toolResults are presentation summaries and are never counted as model calls or provider cost; duplicate summary call IDs are reported separately.",
        latencyBoundary="Case elapsedMs includes synchronous local Worker barriers. companyApiElapsedMs is recorded API time, not a production first-reply measurement. Worker execution spans are recorded separately when available; production async queue waiting is not reproduced.")


def summarize_recovery(run, recoveries):
    """Connect explicit infrastructure retries without erasing earlier attempts."""
    result = summarize(run)
    original_manifest = read(REGISTRY / 'runs' / run / 'manifest.json')
    selected = {case['id']: case for case in result['cases']}
    attempts = {case['id']: [case['artifact']] for case in result['cases']}
    initial_hashes = dict(result['integrity']['initialStateHashes'])
    all_usage = defaultdict(empty_usage)
    for model, usage in result['usageByModel'].items():
        merge_usage(all_usage[model], usage)
    source_checks = list(result['sourceChecks'])
    replaced = set()
    for recovery in recoveries:
        manifest = read(REGISTRY / 'runs' / recovery / 'manifest.json')
        if (manifest.get('recoveryOf') or {}).get('runId') != run:
            raise ValueError('Each recovery must explicitly reference this original run')
        if manifest['baseline'] != original_manifest['baseline'] or manifest['datasetManifestHash'] != original_manifest['datasetManifestHash']:
            raise ValueError('Recovery dataset and baseline must remain identical')
        report = summarize(recovery)
        for case in report['cases']:
            old = selected.get(case['id'])
            if not old or old['status'] != 'error' or case['id'] in replaced:
                raise ValueError('Only one explicit retry of a failed original case may replace its selected outcome')
            replaced.add(case['id'])
            attempts[case['id']].append(case['artifact'])
            selected[case['id']] = case
            if case['id'] in report['integrity']['initialStateHashes']:
                initial_hashes[case['id']] = report['integrity']['initialStateHashes'][case['id']]
        for model, usage in report['usageByModel'].items():
            merge_usage(all_usage[model], usage)
        source_checks.extend(report['sourceChecks'])
    cases = [dict(case, attemptArtifacts=attempts[case['id']]) for case in selected.values()]
    chosen_runs = {Path(case['artifact']).parts[1] for case in cases}
    chosen_sources = [source for source in source_checks if source['runId'] in chosen_runs]
    selected_usage = defaultdict(empty_usage)
    for case in cases:
        for model, usage in case['companyUsage'].items():
            merge_usage(selected_usage[model], usage)
        for worker in case['workers']:
            for model, usage in worker['metrics']['byModel'].items():
                merge_usage(selected_usage[model], usage)
    result.update(cases=cases, recoveryRuns=recoveries, usageByModel=dict(selected_usage),
                  allAttemptsUsageByModel=dict(all_usage), sourceChecks=chosen_sources,
                  allAttemptsSourceChecks=source_checks,
                  originalFailures=[case for case in result['cases'] if case['status'] == 'error'],
                  recoveryBoundary='Original errors/partial state remain in their original runs. The selected outcome uses only the explicit retry of an infrastructure-failed case; all-attempt cost is separate. Successful original cases were not rerun.')
    result['integrity'].update(initialStateHashes=initial_hashes,
        initialStatesEqual=len(set(initial_hashes.values())) <= 1,
        betaSourceEqual=len({item['sourceFingerprint'] for item in chosen_sources}) == 1,
        workerSourceEqual=len({item['workerSourceFingerprint'] for item in chosen_sources}) == 1,
        completedSourceChecks=all(item['sourceChangedDuringRun'] is False and item['workerSourceChangedDuringRun'] is False for item in chosen_sources))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    parser.add_argument("--recovery", action="append", default=[], help="Explicit infrastructure recovery run; writes a separate recovery aggregate")
    args = parser.parse_args()
    result = summarize_recovery(args.run, args.recovery) if args.recovery else summarize(args.run)
    os.umask(0o077)
    output = REGISTRY / "runs" / args.run / ('recovery-aggregate.json' if args.recovery else 'aggregate.json')
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    output.chmod(0o600)
    print(json.dumps({"output": str(output), "cases": len(result["cases"]), "integrity": result["integrity"], "usageByModel": result["usageByModel"]}, ensure_ascii=False))

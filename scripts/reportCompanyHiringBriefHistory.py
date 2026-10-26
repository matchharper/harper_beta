"""Read-only aggregation of canonical Hiring Brief history evaluation artifacts.

Structural facts are measured here. Summary/answer quality requires a separate
manual review of the preserved input, response, and saved snapshots.
"""
import argparse
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / "docs/evaluation/company-agentic-role-search"


def read(path):
    return json.loads(path.read_text())


def stable(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(stable(value).encode()).hexdigest()


def changes(before, after):
    expected = {}
    if before["request"] != after["request"]:
        expected["brief"] = {"before": before["request"], "after": after["request"]}
    remaining = list(after["criteria"])
    removed = []
    for item in before["criteria"]:
        if item in remaining:
            remaining.remove(item)
        else:
            removed.append(item)
    if removed or remaining:
        expected["criteria"] = {"before": removed, "after": remaining}
    elif before["criteria"] != after["criteria"]:
        expected["criteria"] = {"orderChanged": True}
    return expected


def row_delta(table, before, after):
    key = "role_id" if table in ["company_internal_roles", "company_roles"] else "id"
    old = {str(row[key]): row for row in before}
    new = {str(row[key]): row for row in after}
    return {"added": len(new.keys() - old.keys()), "removed": len(old.keys() - new.keys()),
            "updated": sum(old[k] != new[k] for k in old.keys() & new.keys())}


def report_case(directory):
    manifest = read(directory / "manifest.json")
    before, after = (read(directory / name) for name in ["state-before.json", "state-after.json"])
    initial = {table: sorted(rows, key=stable) for table, rows in before.items()}
    old_history = {row["id"] for row in before["company_role_hiring_brief_history"]}
    history = [row for row in after["company_role_hiring_brief_history"] if row["id"] not in old_history]
    expected_inputs = collections.Counter(stable(changes(row["before_snapshot"], row["after_snapshot"])) for row in history)
    actual_inputs = collections.Counter()
    usage = {}
    calls = []
    for file in sorted(directory.glob("provider-*.json")):
        data = read(file)
        request = data.get("request") or {}
        model = request.get("model", "unknown")
        response = json.loads(data["response"]) if data.get("response") else {}
        tokens = response.get("usage") or {}
        item = usage.setdefault(model, {"calls": 0, "inputTokens": 0, "cachedInputTokens": 0,
                                       "outputTokens": 0, "providerReportedCostUsd": None,
                                       "callsWithoutReportedCost": 0, "failedResponses": 0})
        item["calls"] += 1
        item["inputTokens"] += tokens.get("input_tokens", tokens.get("prompt_tokens", 0))
        item["cachedInputTokens"] += (tokens.get("input_tokens_details") or tokens.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        item["outputTokens"] += tokens.get("output_tokens", tokens.get("completion_tokens", 0))
        cost = tokens.get("cost")
        if isinstance(cost, (int, float)):
            item["providerReportedCostUsd"] = (item["providerReportedCostUsd"] or 0) + cost
        else:
            item["callsWithoutReportedCost"] += 1
        failed = data.get("error") is not None or data.get("status", 0) >= 400 or bool(response.get("error"))
        item["failedResponses"] += failed
        calls.append({"file": file.name, "model": model, "elapsedMs": data.get("elapsedMs"), "failed": failed})
        if model == "gpt-6-luna":
            messages = request.get("input", request.get("messages", []))
            users = [message for message in messages if message.get("role") == "user"]
            if len(users) == 1 and isinstance(users[0].get("content"), str):
                actual_inputs[stable(json.loads(users[0]["content"]))] += 1
    old_messages = {row["id"] for row in before["company_messages"]}
    messages = [row for row in after["company_messages"] if row["id"] not in old_messages]
    result = {
        "caseId": manifest["caseId"], "executionStatus": manifest["executionStatus"],
        "semanticQuality": "requires_manual_review", "initialStateHash": digest(initial),
        "sourceFingerprint": manifest["sourceFingerprint"], "sourceDrift": manifest.get("sourceChangedDuringRun"),
        "elapsedMs": round((datetime.datetime.fromisoformat(manifest["finishedAt"].replace("Z", "+00:00")) - datetime.datetime.fromisoformat(manifest["startedAt"].replace("Z", "+00:00"))).total_seconds() * 1000),
        "historyRows": len(history), "historySources": [row["source"] for row in history],
        "summaryStatuses": [row["summary_status"] for row in history],
        "summaryInputsExactlyEqualMinimalSavedChanges": expected_inputs == actual_inputs,
        "summaryInputCalls": sum(actual_inputs.values()), "providerUsage": usage, "providerCalls": calls,
        "newUserMessages": sum(row["role"] == "user" for row in messages),
        "newAssistantMessages": sum(row["role"] == "assistant" for row in messages),
        "exactAutomaticReviewMessages": sum(row["role"] == "user" and row["content"] == "수정된 기준으로 인재풀을 다시 검토해주세요" for row in messages),
        "newJobStatuses": [row["status"] for row in after["company_agent_web_action_jobs"] if row["id"] not in {old["id"] for old in before["company_agent_web_action_jobs"]}],
        "stateChanges": {table: row_delta(table, before[table], after[table]) for table in before},
        "networkBoundary": read(directory / "network-boundary.json"),
    }
    if (directory / "state-after-replay.json").exists():
        first, replay = (read(directory / name) for name in ["state-after-web-turn.json", "state-after-replay.json"])
        result["replayChanges"] = {table: row_delta(table, first[table], replay[table]) for table in first}
        result["summaryReplay"] = read(directory / "summary-replay.json")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    directory = (TASK / "runs" / args.run).resolve()
    if directory.parent != (TASK / "runs").resolve():
        raise ValueError("A registered run directory is required")
    manifest = read(directory / "manifest.json")
    child_ids = [entry["runId"] for entry in manifest["children"]]
    cases = [report_case(TASK / "runs" / child) for child in child_ids]
    result = {"runId": args.run, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "cases": cases, "sameInitialState": len({case["initialStateHash"] for case in cases}) == 1,
              "sameSource": len({case["sourceFingerprint"] for case in cases}) == 1,
              "semanticQuality": "Not automatically graded. Read original summaries, replies, snapshots and manual review.",
              "limitations": ["Local auth and queue transport, real models and product services.",
                              "External delivery and matching Worker are not executed by this extension.",
                              "Provider-reported missing cost remains null; no inferred free calls."]}
    os.umask(0o077)
    (directory / "aggregate.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"runId": args.run, "cases": len(cases), "sameInitialState": result["sameInitialState"], "sameSource": result["sameSource"]}))


if __name__ == "__main__":
    main()

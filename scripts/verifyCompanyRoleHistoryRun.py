"""Verify journey-v4 saved artifacts; never contacts a database or model.

Conversation meaning requires separate human review. This checks only recorded
identifiers, immutable facts, execution counts and the frozen runtime boundary.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    registry = Path(__file__).resolve().parents[1] / "docs/evaluation/company-agentic-role-search/runs"
    run = args.run.resolve()
    if not run.is_relative_to(registry):
        raise ValueError("Private evaluation run directory required")
    read = lambda path: json.loads(path.read_text())
    canonical = lambda rows: sorted(rows, key=lambda row: json.dumps(row, sort_keys=True))
    digest = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
    unit = run / "H01"
    before, after = read(unit / "state-before.json"), read(unit / "state-after.json")
    first, second = read(unit / "turn-1-state-after.json"), read(unit / "turn-2-state-after.json")
    trace = read(unit / "tool-trace.json")
    history = [row["result"]["roleSearch"] for row in trace if row["name"] == "get_more_data"
               and row["input"].get("matching", {}).get("view") == "selection"
               and row["input"]["matching"].get("runId")]
    source, role = history[0]["run"]["id"], history[0]["roleId"]
    history = [row for row in history if row["run"]["id"] == source]
    publication = [row for row in trace if row["name"] == "publish_role_recommendations"]

    def pool(state):
        protected = {row["talent_id"] for row in state["talent_opportunity_recommendation"]
                     if row["role_id"] == role and any(row.get(key) is not None
                        for key in ("feedback", "saved_stage", "processed_stage"))}
        return {row["talent_id"] for row in state["company_intro_candidates"]
                if row["role_id"] == role and row["status"] == "ready" and not row["requested_at"]
                and not row["recommendation_id"] and row["talent_id"] not in protected}

    old_pool, new_pool = pool(before), pool(after)
    old_runs = {row["id"]: row for row in before["company_first_search_runs"]}
    new_runs = {row["id"]: row for row in after["company_first_search_runs"]}
    original, ending = old_runs[source], new_runs[source]
    old_scores = {row["id"]: row for row in before["company_role_candidate_evaluations"]}
    new_scores = {row["id"]: row for row in after["company_role_candidate_evaluations"]}
    appended = [row for key, row in new_scores.items() if key not in old_scores]
    new_publications = [row for key, row in new_runs.items() if key not in old_runs]
    protected = ["company_roles", "company_internal_roles", "company_memory_entries", "talent_progress",
                 "talent_opportunity_recommendation", "company_talent_requests", "company_talent_relays",
                 "meeting_schedules", "talent_opportunity_fit"]
    ranks = lambda value: [(row["talentId"], row["historicalRank"], row["evaluation"])
                          for row in value["selection"]["topCandidates"]]
    old_members = lambda value: [row["talentId"] for row in value["selection"]["historicalPool"]["before"]]
    drift = read(run / "source-drift.json")
    checks = {
        "proposalPreservesPool": pool(first) == old_pool,
        "approvedRetain8Remove2Add2Final10": (len(old_pool), len(old_pool & new_pool), len(old_pool - new_pool), len(new_pool - old_pool), len(new_pool)) == (10, 8, 2, 2, 10),
        "exactModelSelection": len(publication) == 1 and set(publication[0]["input"]["talentIds"]) == new_pool,
        "sourceRunSpecified": len(publication) == 1 and publication[0]["input"].get("sourceRunId") == source,
        "noSearchRequest": not any(row["name"] == "request_matching_search" for row in trace),
        "noNewStage1Or2": not any(row["stage"] in (1, 2) for row in appended),
        "everyOldEvaluationUnchanged": all(new_scores.get(key) == row for key, row in old_scores.items()),
        "sourceRunSnapshotAndResultUnchanged": original["source_snapshot"] == ending["source_snapshot"] and original["result"] == ending["result"],
        "readAgainCriteriaUnchanged": len(history) >= 2 and history[0]["run"]["briefSnapshot"] == history[-1]["run"]["briefSnapshot"],
        "readAgainRankAndScoresUnchanged": len(history) >= 2 and ranks(history[0]) == ranks(history[-1]),
        "readAgainHistoricalPoolUnchanged": old_members(history[0]) == old_members(history[-1]),
        "readAgainCurrentPoolUpdated": {row["talentId"] for row in history[-1]["selection"]["currentPool"]} == new_pool,
        "thirdTurnReadOnly": pool(second) == new_pool,
        "protectedFactsUnchanged": all(canonical(before[key]) == canonical(after[key]) for key in protected),
        "noRuntimeSourceDrift": not drift["runtime"] and not drift["workerRuntime"],
        "decisionsProviderNotCalled": len(new_publications) == 1 and new_publications[0]["model_manifest"]["decisions"]["called"] is False,
    }
    report = {"status": "passed" if all(checks.values()) else "failed", "checks": checks,
              "counts": {"before": len(old_pool), "retained": len(old_pool & new_pool), "removed": len(old_pool - new_pool),
                         "added": len(new_pool - old_pool), "after": len(new_pool),
                         "frozenRankedCandidates": len(original["result"]["roleSearch"]["evidence"]["rankedEvaluationIds"]),
                         "frozenEvaluationReferences": len(original["result"]["roleSearch"]["evidence"]["evaluationIds"]),
                         "newStage1": sum(row["stage"] == 1 for row in appended), "newStage2": sum(row["stage"] == 2 for row in appended),
                         "newStage3": sum(row["stage"] == 3 for row in appended), "newRun": len(new_publications)},
              "historicalResultSha256": digest(original["result"]),
              "historicalBriefSha256": digest(original["source_snapshot"]["roleSearchBrief"]),
              "semanticReview": "Required separately; numeric/identity checks do not judge reply meaning."}
    (run / "structural-review.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "counts": report["counts"], "failedChecks": [key for key, value in checks.items() if not value]}))
    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()

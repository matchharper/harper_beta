"""Count recorded evaluation effects, not semantic quality or production success.

Run after evaluations finish. Output contains run/case IDs and counts only;
question usefulness and source-faithful synthesis require separate manual review.
"""
import argparse
import json
from pathlib import Path


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def contact(call):
    return call["name"] == "contact_talent" and call["input"].get("action") == "send_to_agent"


def publication(call):
    return call["name"] == "publish_role_recommendations"


def human_delivery(call):
    if call["name"] == "contact_user":
        return True
    return call["name"] == "deliver_career_email" and call["input"].get("action", "deliver") == "deliver"


def summarize(path):
    manifest = read(path / "manifest.json")
    results = read(path / "results.json", [])
    requests = read(path / "requests.json", [])
    by_case = {f'{r["caseId"]}-r{r["iteration"]}': r for r in results}
    started = sorted({r["caseId"] for r in requests})
    cases = []
    for key in started:
        result = by_case.get(key)
        exchange = read(path / f"{key}-agent-exchange.json")
        row = {"case": key, "result_saved": result is not None,
               "structural_errors": result.get("structuralErrors", []) if result else None,
               "provider_requests": sum(r["caseId"] == key for r in requests)}
        if exchange:
            turns = exchange["turns"]
            first = turns[0] if turns and turns[0]["actor"] == "company" else None
            calls = [c for c in exchange["calls"] if not c.get("error")]
            first_calls = [c for c in first["calls"] if not c.get("error")] if first else []
            row.update({
                "first_company_turn": first is not None,
                "fixed_company_question": bool(exchange.get("fixtureCompanyQuestion")),
                "first_counterpart_contact": any(contact(c) for c in first_calls),
                "first_publication": any(publication(c) for c in first_calls),
                "first_team_delivery": any(human_delivery(c) for c in first_calls),
                "candidate_delivery_calls": sum(c["actor"] == "candidate" and human_delivery(c) for c in calls),
                "candidate_captured_messages": len(exchange.get("candidateNotifications", [])),
                "company_publication_calls": sum(c["actor"] == "company" and publication(c) for c in calls),
                "company_delivery_calls": sum(c["actor"] == "company" and human_delivery(c) for c in calls),
                "company_turns": sum(t["actor"] == "company" for t in turns),
                "candidate_turns": sum(t["actor"] == "candidate" for t in turns),
                "company_schedules": len(exchange.get("companySchedules", [])),
            })
        cases.append(row)
    return {"run": path.name, "dataset": manifest["datasetVersion"],
            "candidate_model": manifest["model"],
            "company_prompt_sha256": manifest["sources"].get("src/lib/org/agent/prompts.ts"),
            "planned": manifest["repeat"] * len(manifest["selected"]),
            "started": len(started), "results_saved": len(results),
            "provider_requests": len(requests), "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", default="2026-11-05T07-58")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "docs/evaluation/career-internal-introduction/runs"
    rows = [summarize(p) for p in sorted(root.glob("2026-*"))
            if p.name >= args.since and (p / "manifest.json").exists()]
    controls = []
    for path in sorted(root.glob("company-2026-*")):
        if path.name.removeprefix("company-") < args.since or not (path / "manifest.json").exists():
            continue
        manifest = read(path / "manifest.json")
        results = read(path / "results.json", [])
        controls.append({"run": path.name, "dataset": manifest["dataset"],
                         "model": manifest["model"], "planned": len(manifest["selected"]),
                         "results_saved": len(results),
                         "provider_requests": sum(read(p).get("usage", {}).get("completionCount", 0)
                                                  for p in path.glob("*-result.json"))})
    report = {"definition": "Scenario attempts are distinct request case IDs; provider requests include all continuation calls. Saved results may contain failures. Tool counts are not semantic pass labels. Fixed-question inputs do not test company initiative. Company controls are separate, counted from their own result files.",
              "runs": rows,
              "company_controls": controls,
              "totals": {"batches": len(rows), **{k: sum(r[k] for r in rows) for k in ["planned", "started", "results_saved", "provider_requests"]}}}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        args.output.chmod(0o600)
    print(json.dumps(report["totals"]))
    for r in rows:
        c = [x for x in r["cases"] if x.get("first_company_turn")]
        print("\t".join(map(str, [r["run"], r["dataset"], r["started"], r["results_saved"],
              r["provider_requests"], len(c), sum(x["first_counterpart_contact"] for x in c),
              sum(x["first_publication"] or x["first_team_delivery"] for x in c)])))


if __name__ == "__main__":
    main()

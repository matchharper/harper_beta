# Role summary reads and progress messages — local verification

2026-11-06. Local changes only; no deployment, production mutations or candidate/company contact.

## Contract and source changes

- `get_role_context` retains multi-role `roleIds`, replaces the advertised `include_jd` flag with `jd: full | summary | skip`, and defaults to summary. It projects the saved summary in the conversation language; absent summary falls back to the complete description with an explicit fallback fact. Skip omits JD text. Existing issued boolean calls are interpreted for compatibility but the old flag is absent from the model schema. Existing internal visibility/test-only authorization remains before projection.
- External matching/evaluation results and public recommended opportunities now carry the localized saved Role summary. A recommendation explanation remains separate when different. The summary helper is shared with the existing opportunity display logic.
- Shared `open_url` accepts either one URL or an array in `url`. Single-URL output is preserved. Batch reads return ordered individual results/failures and a dedicated text projection; one page failure does not discard other pages. Both Career and company serializers consume that projection.
- Opportunity guidance uses existing summaries/evaluation evidence when sufficient and reads further for a material missing/uncertain fact. Removed unconditional follow-up detail reads in the relevant descriptions/results. No assertion that summaries contain every requirement, runtime read quota, separate judge, or forced retry was added.
- Career execution paths select the model's progress text or the default once, after tool arguments are available. Removed the earlier generic on-tool-start emission that preceded the model status. The legacy recommendation lifecycle callback is retained. Batched URL fallback names its sites in one status.

## Targeted deterministic checks

43 tests passed across roleContextCompany, shared agentTools/web, externalEvaluationResults, toolThinkingLog, openUrlTool, applicationSuggestionsDebug and selectedOpportunityContext. Coverage includes multiple roles, Korean/English summary selection, missing-language full fallback, full/skip, denied internal facts, real local SQL summary projection, cached URL batch partial failure, original single-page contract, both model serializers, and batched fallback status. Initial test setup required Next's compiled server-only module on NODE_PATH; the corrected invocation passed. Type checking passed before final wording cleanup. The final full check failed only at the untouched, concurrently modified `src/app/api/internal/career/email-onboarding/ingest-profile/route.ts:692`: `string | null` is not assignable to `string | undefined`. This task did not edit that file; the unrelated error was left intact. `git diff --check` passed.

No browser UI run was performed. Duplicate progress emission was traced and removed in the shared turn runner and both legacy route branches; helper tests do not constitute a full UI stream test.

## Frozen model probes

Dataset/gold/manifest v8 contain two synthetic development probes, frozen before generation. Actual product model was `gpt-6.1-terra`, reasoning `high`; repeat 1 per case per run. Real prompt/schema/formatter and Role reader, isolated storage/effects. This is not a production replay, blind holdout or latency benchmark. The root `docs/evaluation/README.md` referenced by the registry contract was absent; the existing task README and registry contract were read.

| Run | Sufficient summaries | Material degree gap |
| --- | --- | --- |
| `2026-11-06T09-09-19-382Z-summary-depth` | Redundant summary read of both roles; no full JD/web | Full JD batch of both roles; correctly excluded PhD-required role |
| `2026-11-06T09-10-53-542Z-summary-depth-source-reuse` | Redundant full JD batch of both roles; no web | Full JD batch of both roles; correctly excluded PhD-required role |
| `2026-11-06T09-14-11-001Z-summary-depth-final` | No Role detail or web reads; grounded comparison of both roles | Full JD batch of both roles; correctly excluded PhD-required role |

All six complete final replies and exact detail-read calls were inspected. Final provider requests contain localized `Job summary` text, the new JD enum, URL-array schema and summary-sufficiency guidance. Final replies correctly connect industrial time-series experience to the roles and preserve stated work/salary/degree conditions. The missing-degree case reads the full JD and excludes the PhD-required role; it also reads the already sufficient alternative, so selectivity is not perfect. No web_search/open_url call occurred in these six probes. Total calls remained 5/6 in the final two cases because other tools (including action items) vary; this is not a measured overall call-count/latency improvement.

Between runs 1 and 2, tool wording clarified that list/detail summaries use the same saved source, unconditional publication reread wording was removed, and the fixture added `expiredRoleCount: 0` to match the real reader contract. Between runs 2 and 3, read-recommended wording changed from unconditional detail reading to missing-detail retrieval. These are iterative development runs, not controlled A/B measurements. Frozen cases/gold were unchanged.

Provider traffic was allowed; fixture logging attempts to `evaluation.invalid/rest/v1/llm_logs` were blocked and captured. No production data was written. Raw request/response/result/source snapshots remain under the ignored owner-only `runs/<run>` directories. Earlier unnecessary reads remain visible in the record; the final two observations do not guarantee future avoidance of redundant reads.

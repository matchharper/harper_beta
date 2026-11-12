# Career daily processing

Local implementation, not deployed. Objective: verify the original Career agent processes concrete batched sources without idle discovery, preserves existing consent, and uses one coherent contact with accurate source coverage. Company correspondence must run immediately.

Evaluation unit: complete synthetic background turn, production prompts/capability runtime/tool schemas/provider loop; effects are isolated fixture receipts. Frozen cases-v1.json, gold-v1.json and manifest-v1.json are created before generation. Synthetic people, companies, IDs and correspondence only. No production DB or delivery. Network is restricted to the model provider; raw inputs/outputs go in ignored owner-only runs/.

Canonical runner: `node --import tsx scripts/evalCareerDailyProcessing.ts`. Uses the production scheduled model settings (default Claude Haiku 5.5 with Anthropic’s default effort), with no semantic grader or output retry. Manual review of complete inputs, tool calls and delivered text is the release gate: no unrelated search/idle schedule; no consent invention; combined updates and selected Role publication when relevant; sourceIds match communicated outcomes; immediate agent correspondence is handled in this invocation. Token/call counts are diagnostics, not a quality score. These two development probes do not establish population reliability or actual provider delivery.

Database/collector/delivery coverage is separate: `src/lib/career/schedules/daily.test.ts`; Worker handoff tests. The former evaluation registry README is absent in this checkout; the historical registry at 463d83cb^ was consulted without restoring it.

[2026-11-05 검증 결과와 fixture 한계](results-2026-11-05.md). 최종 실행은 일일 모델 gpt-6-luna/high와 즉시 연락의 일반 Career 기본 gpt-6.1-sol/high를 각각 사용했다. 이후 실행도 production model 설정을 읽는다.

## Pre-onboarding discovery v2 (2026-11-06)

Run `node --import tsx scripts/evalCareerDailyProcessing.ts --dataset v2`. Frozen synthetic cases add a sparse signup, a partial profile and a recently unanswered contact; the unchanged v1 combined-updates case is the completed-user control. The schedule instruction is copied from the new migration before generation. Production provider/tool loop and prompts are used; searches, saves and sends are isolated fixture receipts. Read full tool calls and candidate-visible message bodies against gold manually. No semantic keyword checker, judge or retry. Same model, network, privacy and limitations as v1. This verifies model behavior, not real delivery or database concurrency.

### v3 fixture correction

v2 reused v1 fallback tool outputs for unconfigured opportunity reads, leaking synthetic Aster/Birch closure facts into the partial-profile case. v2 is invalid evidence for that case; raw runs are preserved. v3 keeps frozen case inputs/gold and isolates all pre-onboarding tool results from the v1 control. Supported saves use fixture receipts, unconfigured tools fail visibly. Run the same command with `--dataset v3`. No product changes were made in response to these contaminated outputs.

### v4 fixture coverage

v3 exposed an unsupported existing suggest_form executor. v4 adds a synthetic saved-form receipt with a fixture URL; case inputs, gold and product remain unchanged. v3 traces are retained, not silently retried. Use `--dataset v4`.

[2026-11-06 온보딩 전 검토 구현·검증과 한계](results-2026-11-06-pre-onboarding.md).

## Company-originated Intro notification — company-intro-v1 (2026-11-06)

Local implementation, not deployed. `node --import tsx scripts/evalCareerDailyProcessing.ts --dataset company-intro-v1` runs two frozen synthetic background invocations with the ordinary Career model selected by the immediate trigger. The first is new company interest; the second follows the candidate's earlier decline and changed work conditions. Inputs use production `formatCompanyIntroContext` plus the common background instruction and production capability/provider loop. The public company/JD packet, exact company appeal, already-saved recommendation and prior candidate response are supplied before the first model call. Tools use isolated receipts and provider-only networking; no real candidate, company or DB writes. Raw provider inputs, outputs and tool calls stay in ignored owner-only runs.

Manual gate: useful candidate contact grounded in company interest and candidate context; no duplicate recommendation/search, no acceptance or sharing without candidate consent, no invented conditions, no private Hiring Brief or selection notes in the packet. Read complete outputs; no keyword quality filter or judging LLM. Database tests separately cover immediate save, ownership/consent, send admission, actual contact receipts and existing follow-up dates. This is not an end-to-end production delivery test.

[2026-11-06 Company Intro 구현·검증 결과와 한계](results-2026-11-06-company-intro.md).

## Scheduled recommendation writing — scheduled-writing-v1 (2026-11-12, local)

`node --import tsx scripts/evalCareerDailyProcessing.ts --dataset scheduled-writing-v1` uses the production scheduled invocation detector, `career_main`, scheduled email instructions, conditional internal/external writing handbooks and provider loop. The three frozen synthetic cases cover an internal daily proposal, a recurring external recommendation and a one-time mixed recommendation. Cases, manual review expectations and hashes are recorded before generation. Tool facts are fixture receipts; only the model provider can receive network requests. No database write or actual email occurs.

Review the full provider inputs and email: personally relevant explanation grounded in supplied facts, correct internal connection versus external direct-apply path, exact roleId links and no invented consent. Verify the relevant guides reached the model before writing and that a successful email is the final execution with no further provider call. Raw traces remain in ignored owner-only runs. Link ownership, lookup failures and delivery/resume completion are separately exercised by the background tests. These probes do not establish production delivery or population reliability.

### Fixture corrections: scheduled-writing-v2 / v3

v1 supplied hand-written role-tool text that repeated the collector's internal company-agent wording. v2 uses `formatRoleContextForModel` for that factual projection. v3 corrects the synthetic opportunity-type enums to the current `internal_recommendation` / `external_recommendation` values and uses reservation summaries for scheduled sources. The original collector summary remains on the daily `talent_selection` event to exercise its production projection. Gold criteria are unchanged, and each version and raw run is preserved. Use `--dataset scheduled-writing-v3` for the current contract. v1/v2 prose is diagnostic evidence, not a production wording pass.

[2026-11-12 구현·검증 결과와 한계](results-2026-11-12-scheduled-writing.md).

### Recommendation emphasis — scheduled-writing-v4

User-requested writing change: give Harper-connected opportunities greater prominence; ordinary direct-apply postings may be a brief linked mention, while unusually compelling postings may merit more detail. Remove the earlier writing instructions that invited reports of non-actions. `--dataset scheduled-writing-v3` remains the unchanged-input control. `--dataset scheduled-writing-v4` removes duplicated negative execution disclaimers from the synthetic context without granting new consent, and adds a public role with specific platform leadership responsibilities matching the candidate's stated goals. All four cases and revised gold are frozen before generation. The same production runner, provider-only network and private raw-output boundary apply. Review complete inputs and mail manually for useful emphasis, discretionary detail and absence of routine non-action reporting; there is no sentence count, keyword filter or output rewrite.

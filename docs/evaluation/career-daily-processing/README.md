# Career daily processing

Local implementation, not deployed. Objective: verify the original Career agent processes concrete batched sources without idle discovery, preserves existing consent, and uses one coherent contact with accurate source coverage. Company correspondence must run immediately.

Evaluation unit: complete synthetic background turn, production prompts/capability runtime/tool schemas/provider loop; effects are isolated fixture receipts. Frozen cases-v1.json, gold-v1.json and manifest-v1.json are created before generation. Synthetic people, companies, IDs and correspondence only. No production DB or delivery. Network is restricted to the model provider; raw inputs/outputs go in ignored owner-only runs/.

Canonical runner: `node --import tsx scripts/evalCareerDailyProcessing.ts`. Uses the configured scheduled model (default gpt-6-luna), high reasoning, no semantic grader or output retry. Manual review of complete inputs, tool calls and delivered text is the release gate: no unrelated search/idle schedule; no consent invention; combined updates and selected Role publication when relevant; sourceIds match communicated outcomes; immediate agent correspondence is handled in this invocation. Token/call counts are diagnostics, not a quality score. These two development probes do not establish population reliability or actual provider delivery.

Database/collector/delivery coverage is separate: `src/lib/career/schedules/daily.test.ts`; Worker handoff tests. The former evaluation registry README is absent in this checkout; the historical registry at 463d83cb^ was consulted without restoring it.

[2026-11-05 검증 결과와 fixture 한계](results-2026-11-05.md). 최종 실행은 일일 모델 gpt-6-luna/high와 즉시 연락의 일반 Career 기본 gpt-6.1-sol/high를 각각 사용했다. 이후 실행도 production model 설정을 읽는다.

# Career followed-company preparation

Local implementation and verification: [initial report](results-2026-11-02.md), [latest recheck and recovery fix](recheck-2026-11-02.md).

Objective: reuse shared hiring evidence and saved individual assessments, notify only about useful hiring developments, and avoid automatic reevaluation for minor profile changes.

Current cache policy: successful company hiring searches are shared for 72 hours, then refreshed on demand. This is separate from each user's contact schedule.

- Unit: one scheduled Career invocation against synthetic frozen cases/gold. v1 preserves the original four situations; v2 adds expired hiring campaigns and undated careers landing pages observed in live search. Each version has its own manifest and unchanged hashes.
- Canonical runner: `scripts/evalCareerFollowPreparation.ts`; `node --import tsx scripts/evalCareerFollowPreparation.ts` (defaults to v2; optional `--dataset v1` and `--only id,id`).
- Production code: Career capability runtime, prompt, proactive handbook, tool schemas and followed-company projections. The preparation SQL is executed against PGlite. Public research and email/publication effects use synthetic receipts; only the existing model provider is reachable. No real candidate contact or hosted writes.
- Model: current background configuration, gpt-6-luna/high. Full provider inputs/outputs and execution calls are captured under ignored `runs/`, owner-only permissions. No output-based retry or judge model.
- Metrics: completion/error, provider request/token usage, search/evaluation calls and delivery attempts. Gate: manual review of complete outputs against gold plus SQL/orchestration tests in `src/lib/career/companies/preparation.test.ts`; no runtime semantic keyword gate.
- Provenance: fictional company, synthetic profile, source text and scores. Not sampled production outcomes. Frozen case changes require another dataset version; run manifests pin runtime source hashes.
- Limits: this does not measure live search coverage or hosted queue/delivery reliability. Parent registry README is locally deleted by pre-existing work; its HEAD copy was read without restoring it. This README registers the new task.

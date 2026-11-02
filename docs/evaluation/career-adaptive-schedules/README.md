# Career adaptive schedules

Objective: verify that the original Career agent can revise or resume its persistent check-in using current conversation and recorded change history, while preserving explicit user pauses and arbitrary saved cadences. Three days is only the initial database seed.

Local verification: [2026-11-02 results and limitations](results-2026-11-02.md).

- Evaluation unit: one synthetic chat/background invocation; frozen `cases-v1.json`, `gold-v1.json`, `manifest-v1.json`.
- Canonical runner: `scripts/evalCareerAdaptiveSchedules.ts`. Run with `node --import tsx scripts/evalCareerAdaptiveSchedules.ts`; optional `--only id,id`.
- Actual runtime: current Career capability runtime, main prompt, proactive handbook, production tool schemas, schedule context formatter, actual schedule executors and PostgreSQL migration functions in isolated PGlite. Other Career task effects are synthetic tool receipts.
- Configuration: current default text model and its configured reasoning for chat; the current background model settings for background. No output-based retries or extra judge LLM. Request deadline 300 seconds; provider timeout 120 seconds. Two independent cases may run concurrently.
- Verification: original check-in ID and count; saved status, interval, instruction and contact settings; no initial-cadence reset. Read full generated replies and tool inputs/results for qualitative expectations in gold. A changed duration has no prescribed numerical value.
- Gate: mechanical invariants pass and manually reviewed behavior respects the current goal and explicit restrictions. These six challenge examples do not estimate production success rates.
- Privacy: synthetic inputs only; outbound network restricted to the existing model provider. No hosted DB, email, browser submission or company contact. Raw provider transcripts and responses are stored in ignored `runs/` with owner-only file permissions.
- Manifest records source revision, dirty state/source fingerprints, frozen fixture hashes, model/reasoning, case outcomes and run paths.
- Limitations: task execution outside scheduling is synthetic; not a deployed UI, email or external application test. The parent registry README is locally deleted by existing work; its HEAD version was read without restoring that deletion. This new task is registered here.

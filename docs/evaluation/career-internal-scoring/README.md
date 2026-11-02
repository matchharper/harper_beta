# Career internal scoring Worker parity

Local implementation, not deployed. The unit is one selected Profile revision × internal Role, evaluated by the original 1/2-stage Decisions contract. The user requested a beta copy while retaining Worker, and explicitly chose the latest stored Behavior Context instead of refreshing it.

Frozen input: `cases-v1.json` (synthetic candidate/company, no production identifiers). Gold `gold-v1.json` covers source parity and execution contracts, not a precise numerical fit score. `manifest-v1.json` records the runner and model configuration. Live smoke requests go only to the same OpenAI Decisions endpoint; they never enqueue work, write production DB rows, send email, share a profile, or create a role. Raw exchanges are owner-only under ignored `runs/`.

Canonical runtime: `src/lib/career/matching/internalScoring/{inputs,evidence,decisions,repository,runtime}.ts`. Constants in `workerContract.json` were extracted from `harper_worker/opp/matching/company_requested_decisions.py`. No SDK/model fallback, temperature, reasoning or output-token override. Same 90-second call timeout, three transport attempts, 400-question API chunks and 16 scoring slots. Retry/resume freezes the evidence snapshot; stages persist separately with the shared Worker fingerprint/advisory key. PostgreSQL numeric salary and timestamp serialization preserve Python's source representation.

Deterministic parity: `node --import tsx --test src/lib/career/matching/internalScoring/*.test.ts`. `workerParity.py` extracts and executes the original pure Python builders/parsers directly, comparing both complete provider requests, assessments and fingerprints. DB tests use PGlite plus the actual publication function from the profile/material migration and verify only the requested role is published privately, retry/reuse, cancellation fencing, profile ownership, blocked companies and test-only isolation.

Live transport smoke: `node --env-file=.env.local --import tsx scripts/smokeCareerInternalScoring.ts`. Imports the actual beta scorer; verifies returned raw responses with the original Python parser. Metric/gate: two successful stage calls, exact request/assessment parity, complete criterion coverage. This is an integration check, not a model-quality benchmark or a production accuracy estimate. The small synthetic case cannot establish calibrated fit scores, production queue health or delivery behavior.

Execution differences from Worker: beta owns existing discovery rows in `handed_off` with executor `career_internal_beta_v1`, uses the existing Career matching queue, and resumes the existing Career agent. It never transitions through Worker-claimable `queued`/`running`; tool receipts project those statuses from the lease. Worker code remains untouched. Requests use a separate dedupe namespace so old incorrectly completed worker runs are not reused. Existing legacy runs are not migrated. No new schema is required. Runtime needs writable `DATABASE_URL` (or `CAREER_ROLE_SEARCH_DATABASE_URL`) and the same `OPENAI_API_KEY`.

The repository evaluation index is deleted in the user's existing working tree. Its HEAD version and the related internal-introduction task README were read without restoring the deleted file.

## Verification on 2026-11-02

- TypeScript project check passed. The 22 scoped deterministic checks passed (scorer/SQL integration, application tool and user Stop); the test harness supplies dummy credentials and the Next server-only import shim, and uses no production database.
- Actual OpenAI Decisions smoke completed both stages using the frozen synthetic fixture: stage 1 retained; stage 2 returned all three fit scores and both original criteria. Complete requests, output parsing and source fingerprint matched the original Python functions. Raw receipt is local/ignored; approximate call durations were 1.55 s and 0.24 s, with 1,575 and 2,146 input tokens.
- Read-only inspection found the two previously requested real roles paused, so the unchanged Worker eligibility contract excludes both from new evaluations. No role state, run, recommendation or delivery was changed. An active production source was not scored.
- Deployment, hosted queue delivery and actual conversational completion were not exercised. Existing Worker code and historical runs remain as they were.

## Browser follow-up on 2026-11-02, 21:10–21:18 KST

Used the logged-in localhost Career UI after backing up and clearing only the current conversation's 21 messages and their previews. The other two conversations and profile/application state were preserved.

- The requested Harper Founding Engineer role was already connected to this account. The first priority-review request called `read_company_connections`, `get_internal_roles`, then `contact_company`; one company relay reached `sent`. It did not start scoring. No unrelated recommendation email was recorded during this test.
- An explicit private reevaluation request called `apply_to_internal_role` and exposed a real Postgres binding bug: the serialized JSON payload was encoded again by postgres.js, so `trigger_payload->>'executor'` was null and the beta runner could not claim its work. The isolated database adapter now preserves already-serialized JSON. A read-only integration test against the actual driver verifies payload objects, JSON arrays, UUID arrays and coverage objects; PGlite alone did not expose this bug.
- Repaired only the malformed test run's payload and stopped it through the browser. It finished cancelled. The two subsequent browser requests used role/profile reads and produced conversational comparisons without calling the scorer. They sent no further company relay.
- This is **not an end-to-end scoring pass**: zero new stage-1/stage-2 provider calls occurred. The real role is paused and would also be excluded by the retained Worker active-role eligibility rule. No real role was activated and no existing introduction was reset to force the test.
- After the binding fix: TypeScript passed, 22 scoped checks passed, and the opt-in Postgres integration check passed. Run it with `HARPER_INTERNAL_SCORING_DB_TEST=1 node --env-file=.env.local --import tsx --test src/lib/career/matching/internalScoring/database.integration.test.ts`. It performs SELECTs only. Deployment and hosted queue delivery remain untested.

# Email channel reply QA

2026-10-13. Synthetic challenge evaluation for the new Next email runtime. This evaluates actual replies, tool use and rendered email, not production-average accuracy.

## Objective and unit

One independently seeded synthetic email conversation, including every inbound turn, executed with `processEmailRuntimeMessage` → `processEmailReply` → the existing Career turn/model/tool loop → actual email renderer. Email-first onboarding also executes its review consumer. Inspect user-visible HTML/plain text and exact source reply together with tool calls and durable changes.

## Frozen input and gold

`cases-v1.json` contains synthetic messages and fixture options; `gold-v1.json` contains expected behavior and critical boundaries. Freeze these before the first call. `manifest-v1.json` records hashes/provenance. A new prompt/code/model run reuses v1; changed messages/labels require v2. Fixtures contain no production rows or real people's careers. All inserted internal roles have `information.testOnly=true`, stable `testFixture=email-channel-reply-v1`, and only the fixture talent ID in `testTalentIds`. No fit rows may exist.

## Canonical runner and contract

[`scripts/evalEmailRuntimeReplies.ts`](../../../scripts/evalEmailRuntimeReplies.ts) is canonical. It reads the existing local stack provider configuration, requires loopback Supabase/Postgres and the local database marker, checks that local workers are stopped, uses the current `emailAssistantModel()` (Haiku 5.5 for email), imports the actual consumer and domain executors, and captures Resend receiving/sending through an ephemeral loopback HTTP server. This server never forwards mail. The harness supplies Next `after()` scheduling context and drains scheduled tasks. No production write, live Resend/Gmail/Slack delivery, broad provider model comparison or scenario-specific runtime branch is allowed.

The local DB needs the email runtime migration and the current shared readers' schema. The 2026-10-13 local snapshot additionally needed the existing priority-review view/function from `20261008021006_priority_review_rating_eligibility.sql`, the four display/audience columns from `20260930080950_unify_talent_role_progress_visibility.sql`, and the private `talent-resumes` bucket. Only those prerequisites were aligned on loopback; no production schema was touched. Each case is owned by fresh UUIDs and cleaned up by exact IDs, including auth and stored files. Test roles are made unavailable immediately after execution, even on errors. Provider calls may use only synthetic context from these IDs.

Run: `node --import tsx scripts/evalEmailRuntimeReplies.ts --run-id <fresh-name> [--case <id>]`. `--validate-only` performs no provider calls/DB writes. Outputs, full prompt, tool calls, model responses and rendered HTML belong in ignored `runs/<run-id>/`, directory 0700/files 0600. Never reuse/overwrite a run.

Renderer-only replay: `node --import tsx scripts/evalEmailRuntimeReplies.ts --render-run <existing-run> --run-id <fresh-name>`. This uses saved assistant Markdown, makes no provider/DB calls, preserves the original run, and records source and formatter hashes. It does not replace qualitative review of a new model reply.

## Metrics and release gate

Structural checks: valid owned persisted messages, provider checkpoint, well-formed HTML and links, no raw app-control payload in final MIME, exact fixture cleanup and zero fit rows. These machine checks do not judge wording. Codex reads every final email and compares its meaning, actions and naturalness to gold; no keyword/length/heuristic score is used to rewrite or classify model prose in runtime.

Gate: all executed cases have a deliverable email or the defined capture/deferred outcome; zero unsupported action/company reading/consent claims; zero hidden instructions, private company criteria, machine IDs/error codes or app-only controls; links work as email links and text remains readable; requested facts/conditions are preserved. After a fix, rerun affected frozen cases and record a new run with a new source/prompt fingerprint. Qualitative review is assistant review, not independent human labeling.

## Model/run configuration

Main model, provider and reasoning: resolve at run time from `emailAssistantModel` (`claude-haiku-5-5` since 2026-10-14). Email application suggestion preparation receives the same model through the existing shared executor; web chat retains its own default. Historical runs preserve the model actually used in their manifests. Sampling, fallbacks and tool limits: production helper values. Tool execution: real local domain executors. Secondary onboarding parsing/embedding models remain the existing runtime configuration and their observed provider calls are logged. Timeout: runtime limits; harness captures errors per case and never releases a production job. Run manifest includes commit, dirty/source hashes, dataset/gold hashes, model settings, prompt/provider calls, durations, outcomes and artifact paths.

## Provenance and privacy

Synthetic data authored from the email migration contracts and common failure modes: web controls, real links, quoted instructions, recommendation consent, explicit contact scope, attachments, email-only onboarding, preferences and English Markdown. User authorized simulated email replies on 2026-10-13. Only synthetic data goes to existing configured model providers using production adapters/store policy. API keys, auth/service keys and environment contents are never artifacts. Raw outputs stay owner-only and ignored.

## Limitations

Local Postgres/PostgREST and capture transport do not establish production Queue delivery/Resend DNS or mailbox-client compatibility. Next background scheduling is supplied by the harness. A test-only internal recommendation may be rejected by an existing acceptance guard; inspect the resulting user experience and report this limitation separately from actual acceptance success. This small challenge set is not a representative accuracy or latency benchmark. Local provider availability can trigger production fallback.

## Recorded review

See [2026-10-13 local QA](reports/2026-10-13.md) for inspected replies, corrections, verification and remaining boundaries. Raw runs and screenshots remain ignored.

## Application conversation challenge (application-v1)

2026-10-14 user-authorized simulated reply: "거기 지원해줘.". Frozen `cases-application-v1.json`, `gold-application-v1.json` and `manifest-application-v1.json` cover an identifiable earlier external recommendation with an uploaded resume, an inaccessible form requiring manual application, and no saved resume. There are three conversations and five user turns. The existing canonical runner accepts `--dataset application-v1`; v1 stays frozen.

This uses the real consumer, email reply pipeline, Career model/provider/tool loop, suggestion writer, owned SQL/document executors, resume copy saves, durable continuation and captured MIME. Only outside boundaries are synthetic: JD/company/form inspection evidence and the assisted browser's site receipt. The receipt adapter requires a real authorized queued browser state and records the submitted document ID. This is a conversation/continuation integration test, not verification of autonomous browser filling or a real employer receipt. No turn interpretation or response prose is mocked.

Run: `node --import tsx scripts/evalEmailRuntimeReplies.ts --dataset application-v1 --run-id <fresh-name> [--case <id>]`. Inspect the complete captured reply, accepted changes and actual saved resume, authorization scope, continuity, source preservation and no unsupported submission claims. All semantic judgments are manual review against frozen gold. The same existing runtime model config/provider policy applies. Raw source/model outputs and MIME remain ignored and owner-only. Tests are loopback only and clean exact fixture IDs. No live delivery, production data or deployment is involved.

Application results: [2026-10-14 actual-model conversation review](reports/2026-10-14-application.md). Three conversations/five replies inspected; actual saved resumes and source preservation verified. Site submission is a synthetic boundary, not real browser acceptance.

## Application writing revision (application-v2)

User feedback on 2026-10-14 rejected the v1 reply's mechanical headings, repeated summaries and guardrail explanations. `cases-application-v2.json` preserves the three application conversations; `gold-application-v2.json` adds coherent reader-focused writing, no copied card narrative or repeated execution assurances, preserved exact material, and a natural next action. New gold was frozen before v2 calls, after observing v1 and receiving this feedback; v1 remains unchanged. `manifest-application-v2.json` records provenance and hashes.

The same canonical runner accepts `--dataset application-v2`. The original Career LLM writes the whole email, including quoted passages and links, directly from the actual pending batch and conversation. No passage refs, substitutions, appended review text or link fallback alter its response. The server retains ownership, authorization, concurrency and delivery boundaries, and ordinary Markdown/HTML sanitation. It never checks tone, words, paragraph count or natural-language style. Exact proposed text and useful links are evaluated from the actual model response against frozen gold, not repaired by code. Manual semantic review compares the exact full replies and saved actions to frozen v2 gold. All existing isolation, model config, transport and privacy boundaries apply.

`application-question-v1` adds one synthetic three-turn conversation with an explanatory question between the initial review and approval. Frozen cases/gold/manifest use the same canonical runner and model/transport boundaries. It checks that the actual prior conversation and delivered outbound emails allow a natural follow-up without reprinting the entire pending batch, and that a question does not grant approval. No special review fingerprint or output-classification state is maintained; ordinary delivered history supplies context. Run with `--dataset application-question-v1`.

Writing review: [2026-10-14 authoring-path correction](reports/2026-10-14-application-writing.md). The former v1 writing was rejected by the user despite workflow execution checks. The new narrative writer and literal-only rendering were exercised with actual models; remaining verbosity and quality limits are recorded explicitly.


## Full email authoring and Haiku follow-up

On 2026-10-14 the user required removing all response additions and passage substitutions. Every passage, question, explanation and link now comes directly from the original Career LLM response. Email and email suggestion preparation use Haiku 5.5. The existing frozen datasets were reused as new runs. See [full authoring verification](reports/2026-10-14-full-email-authoring-haiku.md) for provider/source/capture equality, actual flow checks, failed intermediate runs and unresolved writing-quality issues. No production release or database change was performed.


## Current execution and approval continuity (application-continuity-v1)

Frozen synthetic 3 conversations/7 turns extend application-v2 on 2026-10-14 after explicit user feedback, before the first continuity run. The existing canonical runner accepts `--dataset application-continuity-v1`. The unit is the entire conversation, including a later receipt question, a differently worded approval, and an observed required unknown legal fact. Gold expects accurate source facts, completion after meaningful approval when sufficient evidence exists, exact current/later result attribution, and no inferred legal answer or duplicate application. Zero useful edits may proceed unchanged when already authorized. Generic optional fixture `application.fields` supplies an observed form inventory at the external inspection boundary; it does not mock conversational judgment or add runtime branches.

Use the same Haiku 5.5 production helpers, fallback/storage policy, per-run source/prompt/frozen hashes, local-only owned fixtures, hard cleanup and owner-only artifacts as above. Manual semantic review is required; tool success or sent status alone is not a pass. Existing application-v2/question-v1 stay frozen and are regression references. Small synthetic challenge cases do not estimate production-average reliability or verify a real employer receipt.

Continuity review: [2026-10-14 approval and execution attribution](reports/2026-10-14-application-continuity.md). The latest e rerun verifies completed-record retrieval, current/later source identity and the required factual unknown with Haiku; b supplies the differently worded approval. Raw failed and intermediate runs remain preserved.


## Autonomous email application flow (application-email-flow-v1)

2026-10-27 이메일 전용 요구 변경을 반영한 합성 2대화/4턴이다. 첫 요청에서 여러 보유 이력서 중 적합한 원본을 스스로 선택하고, 양식 확인 뒤 수정/질문을 독립 번호로 작성하는지 확인한다. 후속 자연어 승인 또는 직접 수정 요청은 재확인 없이 실제 문서 저장까지 이어져야 한다. 이전 narrative-only gold는 변경하지 않는다. 입력·정답·hash는 새 cases/gold/manifest에 첫 실행 전에 동결했다.

기존 canonical runner `scripts/evalEmailRuntimeReplies.ts --dataset application-email-flow-v1 --run-id <fresh-name>`를 사용한다. `application.extraResumes`는 일반 추가 파일 fixture이며 대화 판단을 모킹하지 않는다. 원래 런타임 모델/설정, 실제 provider 호출, SQL 저장, captured email을 사용하고 JD/form/제출 receipt 경계만 합성이다. Browserbase 실제 사이트 접근이나 실제 회사 수신을 검증하는 평가는 아니다. 원본 provider 입력·답장·저장 문서를 수동 검토하며 파일 선택 재질문, 직접 수정 재확인, 제출 사실 왜곡 또는 승인 범위 밖 변경은 실패다. 기존 loopback/test-only/owner-only/정확한 fixture 정리 계약을 그대로 적용한다.

검증 결과: [2026-10-27 이메일 지원 준비](reports/2026-10-27-email-application-flow.md). 로컬 schema 누락으로 실패한 실행과 수정 후 실제 모델/문서 저장 확인을 구분한다.

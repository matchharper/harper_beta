# Harper Repository Instructions

## PR 작성 기준

- Harper 저장소의 PR을 작성하거나 수정하기 전에 [harper_incidents](https://github.com/matchharper/harper_incidents)의 최신 README를 직접 열어 읽고, 그 기준을 참고해 PR 내용을 작성한다.
- README는 변경될 수 있으므로 PR 작업마다 원본을 다시 확인한다. 내용을 이 파일에 복사하거나 고정된 요약으로 대신하지 않는다.

## DB 확장성과 검증 범위

- DB schema에는 실제 권한·소유권·멱등성에 필요한 최소 제약만 둔다. 확장 가능한 text/JSON을 우선하고, LLM 입력이나 향후 기능을 좁히는 enum·값 목록 CHECK·시나리오별 개수/순서 제약은 추가하지 않는다. 새 constraint는 막아야 할 구체적인 데이터 무결성 오류가 있을 때만 정당화한다.
- 변경한 경로의 짧고 의미 있는 검증을 우선한다. 전체 테스트·전수 LLM 평가·범위 밖 점검을 기본으로 요구하지 않는다.
- Tool result/prompt에 특정 사실의 필수 언급이나 고정 성공 문장을 넣지 않는다. Intro·인터뷰 follow-up 예약 사실도 정보로만 제공하며, 언급 여부와 설명은 company-side LLM이 대화 맥락으로 판단한다.

## Production deployment

- Pushing the intended release commit to `origin/main` automatically triggers the production Vercel deployment. For the ordinary production path, do not run a separate manual Vercel deploy; verify the Git-triggered deployment and released commit after the push.
- After a successful deployment that changes company-facing behavior or policy, update the Notion company product overview (https://app.notion.com/p/3fe7277d26df812dbc7def98e67aa45c) and the affected detailed Documents pages, following the workspace `AGENTS.md` documentation-sync rules. Cover features, decision rules, state transitions, permissions, visibility, search/follow-up behavior, pricing, Intros, subscriptions, cancellation/refunds, contracts, and signup/billing availability as applicable. Also update the overview after an explicitly requested pricing or operating-policy change actually takes effect without a deployment. Distinguish public offers from existing company agreements; do not describe local work or proposed policies as live behavior. This rule does not authorize deployment or commercial-policy changes.

## Domain terminology

- The LLM that responds to companies in `/org` and Slack is called the
  **company-side LLM**. Use this term consistently in code comments,
  documentation, and implementation discussions.

## LinkedIn Jobs marketplace GTM

- Before creating or updating an internal Role's public `official_jobs` entry, changing its LinkedIn posting, or planning/running the scheduled LinkedIn Jobs GTM task, read `docs/scheduled/linkedin-jobs-marketplace-gtm-ko.md` and `docs/scheduled/linkedin-jobs-marketplace-learnings-ko.md` in full.
- Before opening a LinkedIn Recruiter Job editor for a new, copied, edited, or reopened posting, finish the per-job input packet specified in `docs/scheduled/linkedin-job-posting-packet-template-ko.md`. Save exact title, form values, full description, application URL, project name, and targeting intent under `.local/linkedin-jobs-gtm/posting-packets/`; use the browser to enter and verify that prepared content.
- Treat the Recruiter UI as the source of truth for live slots and posting status. Record verified actions in the designated Notion `Data & Logs` database and send change summaries through Harper Scouter as specified in the runbook.

## Company Role Hiring Brief authoring

- Before creating, changing, reviewing, or directly writing a Role Hiring Brief
  (`company_internal_roles.request` or its compatibility copy), read and follow
  `docs/company/company-role-hiring-brief-authoring-guide-ko.md` in full.
- This applies to new Role creation, ordinary Role edits, direct database work,
  real-person profile calibration, prepared-profile feedback, scheduled refreshes,
  prompt changes, and requests such as “Request 작성해”.
- Treat that guide as the canonical authoring contract. Task-specific runbooks may
  add evidence collection, authorization, execution, and write procedures, but
  must not redefine the shared Hiring Brief rules.

## Company role fit recovery audit

- Before planning, changing, or running a Wonderful Role non-fit review,
  missing-fit review, or Company Role Fit Recovery Audit, read and follow all
  three canonical documents:
  - `docs/company/company-role-fit-recovery-audit-overview-ko.md`
  - `docs/company/company-role-fit-recovery-audit-codex-runbook-ko.md`
  - `docs/company/company-role-fit-recovery-audit-calibration-ko.md`
- Treat the overview as the product and data contract, the Codex runbook as the
  execution contract, and the calibration document as the source of current
  evaluator and retrieval changes. Do not substitute the Company Context Run
  documents for this audit's existing-non-fit workflow.

## Company-first talent selection

- Before planning, changing, reviewing, or running company-first talent search,
  read both
  `docs/company/company-first-talent-recommendation-product-plan-ko.md` and
  `docs/company/company-first-talent-search-worker-implementation-plan-ko.md`
  in full. Treat the first as the product and lifecycle contract and the second
  as the Python Worker, scheduling, selection, and delivery contract.
- `docs/company/company-first-talent-recommendation-codex-runbook-ko.md` is kept
  only to interpret and reproduce the historical manual `v1` shadow calibration.
  Do not use its commit procedure as a production or scheduled runner.
- A company-scoped matching run may choose `candidate_first`, `company_first`,
  or `no_action`. A `candidate_first` decision must enqueue the existing
  Opportunity Worker forced-internal-role delivery and reuse its normal
  recommendation/follow-up path. A `company_first` decision may create only
  the company-side `ready` artifact; its candidate-visible recommendation,
  message, email, and follow-up begin only after a company explicitly requests
  the intro. An existing unanswered or declined Harper recommendation may coexist
  with a company-first ready proposal for the same Role. Do not create a new duplicate
  candidate-first recommendation. A company Intro supersedes the older candidate
  card; accepting the older recommendation while the company proposal is still ready
  closes that proposal and moves the candidate to pending connection atomically.

## Company-side UX writing

- Before creating, changing, or reviewing any user-facing wording for the
  company-side LLM, `/org`, or company-facing Slack, read and follow
  `docs/company-side-ux-writing-guide-ko.md`.
- This includes generated replies, prompts that shape those replies,
  deterministic messages, notifications, buttons, modal copy, status labels,
  empty states, and errors.
- Verify the actual product behavior before changing copy. Keep equivalent web
  and Slack flows aligned, and update the guide when introducing a new recurring
  term or writing pattern.

## Interpreting examples

- Treat examples in user requests as illustrations of the underlying requirement,
  not as an exhaustive specification or a boundary on scope.
- Generalize the intended behavior across analogous entities, data sources,
  tables, fields, and output shapes. Do not hardcode or narrowly fit an
  implementation to the sample names, values, schema, wording, or format unless
  the user explicitly requires those exact details.
- Validate the generalized behavior with cases beyond the example when tests or
  verification are part of the task.
- Agent-system data must accommodate diverse inputs an LLM may generate; avoid overly restrictive database constraints that reject otherwise valid variations.

## Prompt and context design

- Company-side LLM의 prompt, context, tool, model 또는 evaluation을 변경하기 전에 `docs/company-side-agent-engineering-contract-ko.md`를 읽는다. 지침은 해당 책임 원본에서 수정하고 시나리오별 규칙을 다른 prompt에 덧붙이지 않는다. 관련 frozen 평가를 재실행하고 한계와 실패를 기록한다.

- Career Memory/Brief 변경·리뷰 전에는 `docs/talent-unified-memory-implementation-plan-ko.md`의 설계 계약을 읽는다. 온보딩의 기존 extraction·checklist·진행 로직은 유지하되, 이후에는 원본 LLM의 공통 read/write tool을 사용한다. 의미 판단을 별도 추출 모델이나 룰베이스·키워드 분류로 옮기지 않는다. 서버는 권한·타입·식별자·동시 수정·안전 경계를 검증한다. 설계 문서를 구현 완료의 증거로 취급하지 않는다.
- Brief의 새 주제는 자유 형식 label·content로 저장하고, 일반 tool에 key enum이나 key 작성 요구를 두지 않는다. 기존 key는 온보딩·이관·reader 호환 metadata로 보존한다. 기존 행은 짧은 ref로 수정하며 label을 식별자나 의미 분류 규칙으로 사용하지 않는다. 고정 key가 없는 Brief도 사용자측 채팅·검색·추천·UI에 포함한다.
- Memory add에는 원본 LLM이 매칭·판단 중요도 1·2·3을 정한다. Brief에는 importance를 두지 않는다. 새 발화로 기존 행이 더 이상 사실이 아니게 되면 상충 행을 추가하지 말고 기존 행을 수정하거나 삭제한다. 중요도나 stale 여부를 키워드·휴리스틱으로 정하지 않는다.
- Memory는 확인된 사실과 맥락을 저장한다. 여러 대화·추천·지원 행동에서 도출한 잠정적 선호는 Memory에 사실처럼 쓰지 않는다. 추천 Worker는 모든 production V2 run에서 전체 Brief와 재생성 가능한 Behavior Context를 한 번 준비해 단계들에 재사용한다. Behavior builder만 Memory와 행동 원본을 증거로 읽고, downstream Worker LLM에는 Memory 원문을 반복 주입하지 않는다. Behavior Context는 soft signal이며 Brief를 덮어쓰거나 hard constraint·권한·동의를 만들 수 없고, 50:50 cohort나 역할별 retrieval을 두지 않는다.
- Treat a prompt as a general decision and writing contract, not a collection of answers for the current fixture, entity, role, interview type, or E2E scenario. Define the agent's role, goal, observable success criteria, evidence hierarchy, tool policy, output responsibility, and stop conditions. Examples illustrate judgment only; never make their names, values, length, paragraph count, or wording the rule.
- Prefer positive outcome criteria over accumulating prohibitions or exact phrases. Describe what the user must understand after the answer: how their latest message was interpreted and applied, what actually changed, what Harper will do next, what has not happened yet, and whether the user has a concrete next action. Let the LLM choose natural wording and proportional length for the current conversation.
- Apply context minimization before prompt instructions. If the final-writing LLM must not expose an internal value, do not provide that raw value and then tell it not to mention it. Omit unnecessary implementation data entirely; when a fact is needed, transform internal IDs, enums, booleans, queue states, tool names, and provider diagnostics into the smallest user-safe semantic fact before it enters the final-generation context.
- Keep code and prompt responsibilities separate. Code owns authorization, state transitions, verified facts, exact user-authored content, and required links. The LLM owns the surrounding explanation and conversational judgment. On successful actions, do not replace the whole LLM response with a deterministic success narrative. Deterministic text may be appended only for exact content or verified links that must not be changed. Server-authoritative failure and uncertainty boundaries may still override unsupported success claims.
- Tool descriptions define when a tool is appropriate, required inputs, effects, and continuation rules. They must not carry final-answer templates, hidden implementation vocabulary, or wording instructions that belong to the final-writing contract. Tool results for final generation should contain user-safe facts that are sufficient to write an accurate answer, including timing and incomplete states when they materially affect the experience.
- Whenever a tool, background job, or asynchronous run produces a result that must be communicated to a company user, pass a compact user-safe result and the relevant conversation context back through the company-side LLM. Do not turn success, zero-result, partial, skipped, or failed outcomes into deterministic prose templates, and do not instruct the model to emit an exact sentence. Code owns verified facts, authorization, idempotency, and delivery; the company-side LLM chooses the natural wording, amount of context, and format from a light outcome-oriented instruction.

## Conversational E2E quality

- A Slack, web-chat, demo, or E2E run is not successful merely because tools completed, data changed, or no exception occurred. Read the exact user-visible response in its full conversation and evaluate whether a capable first-time user can understand how their latest message was applied, what happened, what Harper will do next, what has not happened yet, and what they can do now.
- Reject an E2E result before handoff when the response is a mechanical receipt, loses the latest user context, exposes implementation vocabulary, overfits a fixture, repeats confirmation without a real decision, makes an unsupported delivery or Calendar claim, omits an important next step, or has an obviously poor tone. Fix the underlying prompt, context, data, or control-flow cause and rerun the scenario; do not report the run as satisfactory first and wait for the user to identify the UX defect.
- When a task explicitly asks for direct Slack or browser testing, inspect the rendered message and interaction experience as product output. Record the exact fixture scope and state transitions for safety, but judge completion primarily from the user's experience rather than logs alone.

## Career translations

- Before planning, changing, reviewing, or synchronizing `/career` translations,
  read and follow `scripts/translation.md`.
- Codex must author every new or changed English translation directly after
  reading its code and product context. Never use Gemini, another LLM, or an
  automatic translation API for this work, including drafts and fallbacks.
- Only keys created or changed from code in the current translation plan may be
  written to the translation DB. Pull-only DB differences must update local
  dictionaries without being written back.

## UI and design

- Before implementing or reviewing UI and design changes, read and follow `src/styles/Design.md`.
- Before creating UI markup or a local component, search in this order: `src/components/ui/`, `src/components/common/`, then the relevant domain directory under `src/components/`. Reuse a suitable component or established composition before creating a new primitive.
- Never reimplement modal infrastructure such as portals, overlays, focus management, Escape handling, outside-click handling, or ARIA dialog wiring in a feature component. For `/career`, use `src/components/common/TalentCareerModal.tsx`; for generic Radix dialogs, use `src/components/ui/dialog.tsx`. A local wrapper may own domain content and actions, but not modal infrastructure.
- Keep the shared-component catalog and discovery rules in `src/styles/Design.md` current whenever a new reusable UI primitive or preferred composition is introduced.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 기존 추천 보존과 회사 메시지의 단일 작성 경로

- 후보자의 전체 연락 중단·프로필 공개·추천 설정 변경은 향후 추천/연락 범위를 바꾼다. 이미 회사에 소개한 후보자의 프로필·추천·Intro·진행 이력을 숨기거나 삭제하거나 자동 거절·종료하지 않는다. 설정 변경은 기존 pair의 talent_progress와 일반 조회 결과에 남긴다. 후보자와 대화하는 원본 LLM이 남은 내부 제안을 어떻게 할지 문맥에 맞게 확인하며, 명시적인 역할별 결정은 기존 결정 도구로 처리한다. 신규 공유/연락 자격, 계정 삭제, 회사별 차단과 test-only 격리는 별도 hard boundary다.
- Harper가 회사에 자연어로 전달할 새 소식은 `harper_beta/src/lib/org/agent/companyUpdate.server.ts`의 `enqueueCompanyUpdate`로 목적과 최소한의 회사 공유 가능 사실을 넘긴다. 기존 company-side LLM이 실제 대화·일반 read/write 도구와 공통 문체 계약을 사용해 설명과 유용한 다음 제안을 판단한다. 별도 업무 LLM이 회사용 문구를 만들거나 발신 코드에 사람처럼 말하라는 prompt를 복제하지 않는다. 실패 때 고정 성공 문구로 대체하지 않는다.
- 회사 거절/후보 거절, 미팅 등 실제 상태 변경은 DB가 책임지고, 메시지 생성·전달은 기존 회사 작업 큐가 멱등 재시도한다. 이미 전달된 사용자/후보자의 승인 원문·첨부는 보존한다. 추가 Harper 해석은 같은 company-side LLM 경로로 한다. 명시적으로 정형화된 시스템 알림(역할 채용 시작, 채널 진입 등)은 예외다. 정기 회사 선추천·연결 대기 후보 소개는 예외로, 배포 기준의 Worker `write_slack_message`와 `SLACK_WRITER_SYSTEM`/`ACCEPTED_SLACK_WRITER_SYSTEM`을 유지해 완성 문장을 기존 durable 카드 outbox로 전달한다. 소개 뒤에는 `messageAlreadyDelivered=true`인 공통 회사 이벤트를 한 번 enqueue해 company-side LLM이 유용한 후속 행동이나 발언만 선택적으로 수행한다. 소개 본문을 company-side LLM이나 정형 TL;DR/Note 조립으로 대체하지 않는다.
- 제안 거절·공개 중단·이직은 서로 다른 사실이다. 개인 사유를 공개 가능 여부 확인 없이 회사에 넘기거나, 설정 변경을 역할별 거절로 추론하지 않는다.

- 2026-10-13 DB-first rollout 주의: 운영 DB migration `20261013120149`(`preserve_presented_candidates_and_intro_decisions`)는 적용됐다. 구 웹이 새 `company_update`를 잘못 소비하지 않도록 해당 event는 `failed/company_update_runtime_required`로 보관한다. 새 웹의 공통 enqueue와 dispatch recovery만 이를 queued로 전환한다. 첫 웹 배포 전에 이 보류 event를 확인하고, 구 웹의 정형 거절 알림이 이미 전달된 event는 실제 Slack 전달 증거와 대조해 중복 안내하지 않도록 정리한다. 단순 queue 상태로 전달 완료를 추정하지 않는다. 기존 사건을 재발송하거나 미기록 거절을 복원하는 것은 migration의 효과가 아니다. Worker는 beta의 facts-outbox 처리 코드가 배포된 다음 순차 배포한다.

- 2026-10-15 운영 DB 선반영: `company_contact_agent_first`, `company_presentation_agent_followup`, `company_agent_event_delivery_recovery`, `company_intro_acceptance_update`는 운영 이력 `20261014192900`~`20261014192906`으로 적용됐다. 로컬 파일 timestamp와 운영 이력 version은 다르며 실제 함수 본문을 대조해 확인했다. 이번 요청은 DB만 적용했고 웹·Worker는 배포하지 않았다. `company_update`의 기존 보류 계약은 유지되며 당시 보류·실행 가능 사건은 0건이었다. 이후 배포에서는 현재 사건과 실제 전달 근거를 다시 확인하고 이 migration을 일괄 재적용하지 않는다. 상세 기록: `docs/evaluation/company-side-conversational-qa/reports/2026-10-15-company-events-review.md`.

- 2026-10-15 배포 전 DB 누락 보완(웹·Worker 미배포): 사용자 승인으로 운영 DB의 실제 정의를 대조한 뒤 `company_proactive_recruiting`(20261015051036), `manual_talent_first_search`(20261015051041), `email_vercel_runtime`(20261015051046), `organization_add_and_shared_company_identity`(20261015051054)를 적용했다. 조직 묶음은 로컬 `20261012090244`, `20261012095337`, `20261012100346`의 조직 추가·동일 회사의 독립 조직 허용 변경이다. 새 함수 13개의 서버 전용 실행 권한과 수동 검색 보호 조건·조직 완료 분기를 확인했다. 추가 `email_runtime_legacy_claim_access` migration으로 기존 이메일 reply/onboarding claim 함수 2개도 anon/authenticated 실행을 차단했으며 로컬 이메일 migration에 동일 권한을 반영했다. 이메일 작업은 모두 `legacy`이며 runtime 활성화·서비스 종료는 하지 않았다. `email_application_start`는 이미 적용된 함수 본문을 확인해 재적용하지 않았다. 확인 당시 `company_update_runtime_required` 보류 사건 1건은 변경·재발송하지 않았다. 이후 웹 배포 전에 실제 Slack 전달 근거를 대조해야 한다. 로컬 timestamp와 운영 migration 번호가 다르므로 일괄 재적용하지 않는다.


- 2026-10-15 회사 이메일 DB 선반영: 사용자 요청으로 `company_email_replies`를 운영 version `20261015103733`으로 적용했다. 로컬 파일은 `20261015120000_company_email_replies.sql`이며 실제 columns/functions/indexes를 사전 대조하고 적용 후 서버 전용 RPC 권한·trigger·중복 방지 index를 확인했다. 기존 email reply 작업은 legacy로 유지했고 회사 alias는 0건이었다. 웹·Worker 배포, runtime 활성화, 기존 사건 재발송은 하지 않았다. 같은 migration을 재적용하지 않는다. 실제 로컬 Supabase + company-side LLM + capture 메일 검증과 한계는 `docs/evaluation/company-side-conversational-qa/reports/2026-10-15-company-email.md`의 후속 요청 절을 따른다.

- 2026-10-15 CC Intro 첫 답장 알림 DB 적용: 사용자 요청으로 운영 migration `20261015123749`(intro_first_reply_company_update), `20261015124051`(intro_reply_nudge_facts)를 적용했다. capture 저장 시 연결별 후보자 첫 답장만 기존 company_update 큐에 기록한다. 트리거 활성화·anon/authenticated 실행 차단을 확인했다. 웹·Worker 재배포 없이 기존 READY revision `9db6ec01c9f574f83c0b1cd491a17940d8d6dd3b`의 5분 dispatcher를 사용한다. 실제 LLM 예시는 합성 입력·발송 차단이며 회사 채널 테스트·과거 답장 재알림은 하지 않았다. 평가 계약은 company-side-conversational-qa README의 v29–v31이다. 후속 배포에서 중복 적용하지 않는다.

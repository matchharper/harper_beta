# 회사·Role·연락 작업 계약

각 절에 해당하는 작업에 적용한다. 코드·문서 경로는 `harper_beta/` 기준이며, `harper_beta/`로 시작하는 경로는 workspace 기준이다. Worker의 company-first 실행 계약은 `harper_worker/docs/agent-change-principles.md`를 함께 따른다.

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

## 기존 추천 보존과 회사 메시지의 단일 작성 경로

- 후보자의 전체 연락 중단·프로필 공개·추천 설정 변경은 향후 추천/연락 범위를 바꾼다. 이미 회사에 소개한 후보자의 프로필·추천·Intro·진행 이력을 숨기거나 삭제하거나 자동 거절·종료하지 않는다. 설정 변경은 기존 pair의 talent_progress와 일반 조회 결과에 남긴다. 후보자와 대화하는 원본 LLM이 남은 내부 제안을 어떻게 할지 문맥에 맞게 확인하며, 명시적인 역할별 결정은 기존 결정 도구로 처리한다. 신규 공유/연락 자격, 계정 삭제, 회사별 차단과 test-only 격리는 별도 hard boundary다.
- Harper가 회사에 자연어로 전달할 새 소식은 `harper_beta/src/lib/org/agent/companyUpdate.server.ts`의 `enqueueCompanyUpdate`로 목적과 최소한의 회사 공유 가능 사실을 넘긴다. 기존 company-side LLM이 실제 대화·일반 read/write 도구와 공통 문체 계약을 사용해 설명과 유용한 다음 제안을 판단한다. 별도 업무 LLM이 회사용 문구를 만들거나 발신 코드에 사람처럼 말하라는 prompt를 복제하지 않는다. 실패 때 고정 성공 문구로 대체하지 않는다.
- 회사 거절/후보 거절, 미팅 등 실제 상태 변경은 DB가 책임지고, 메시지 생성·전달은 기존 회사 작업 큐가 멱등 재시도한다. 이미 전달된 사용자/후보자의 승인 원문·첨부는 보존한다. 추가 Harper 해석은 같은 company-side LLM 경로로 한다. 명시적으로 정형화된 시스템 알림(역할 채용 시작, 채널 진입 등)은 예외다. 정기 회사 선추천·연결 대기 후보 소개는 예외로, 배포 기준의 Worker `write_slack_message`와 `SLACK_WRITER_SYSTEM`/`ACCEPTED_SLACK_WRITER_SYSTEM`을 유지해 완성 문장을 기존 durable 카드 outbox로 전달한다. 정기 검색이 끝나면 완료 사건으로 이어진 company-side LLM이 결과를 회사에 한 번 보고한다(2026-11-09 결정, 로컬·미배포). 후보가 있으면 후보 수와 회사가 할 일을 먼저 말하고, 0명이면 이유와 제안을 말한다. 같은 글을 Role 대화와, Role 채널이 있으면 Slack에 남긴다. 무엇을 말할지는 LLM이 판단하며, 쓰지 않으면 화면의 고정 문구가 남는다. 소개 본문을 company-side LLM이나 정형 TL;DR/Note 조립으로 대체하거나 반복하지 않는다.
- 제안 거절·공개 중단·이직은 서로 다른 사실이다. 개인 사유를 공개 가능 여부 확인 없이 회사에 넘기거나, 설정 변경을 역할별 거절로 추론하지 않는다.

- 후보자→회사 연락은 같은 도구 호출에서 즉시 전달한다. 후보자에게 별도 발송 대기 단계를 설명하지 않는다. 사용자가 승인한 정상 연락을 “전달했습니다”라고 표현하는 것을 내부 outbox/queue 상태만으로 UX 오류로 판정하지 않는다. 회사의 열람·답변·채용 결정을 임의로 주장하는 것은 별개의 오류다.

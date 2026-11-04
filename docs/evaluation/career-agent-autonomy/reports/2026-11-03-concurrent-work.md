# Concurrent work: live model verification, 2026-11-03

Two frozen v5 probes exercise the actual Career model, selector, prompt and tool schemas. Work/form persistence uses the existing synthetic adapter; the real SQL contracts are checked separately against local PostgreSQL. No company submission, email, production user or browser run was executed.

## Inputs and scope

- Dataset: `cases-v5.json`, `gold-v5.json`, `manifest-v5.json`; one trial per case.
- Model: `gpt-6.1-sol`, Responses reasoning effort `high`.
- Run source revision: `24ab32f192bf8dccdf54e33b9763a4093802e6d1` plus the exact dirty source snapshot recorded by the runner. This checkout contains concurrent unrelated work; the run is not a clean commit comparison.
- Cases hash: `db9a18f220d29440fc2291868aee8db6a0a0733ce93a11f5b263a71e927ef7d2`.
- Gold hash: `0af0d426300362a4ed73976e2447a1919c6e28096f44304a147ef31cef7603aa`.
- Raw requests/responses, complete transcripts, source hashes/diff and adapter state remain in ignored owner-only `runs/`.

The probes were written for this change and are not a blind holdout or reliability benchmark. They test foreground delegation and routing of existing approvals, not completion of all child browser workflows.

## First run exposed a real tool-wiring defect

Run `2026-11-03T13-35-29-631Z-concurrent-work` completed both turns but did not exercise the intended durable work capability. Inspection of the actual provider request found `manage_work` missing from the enabled tool list even though the capability registry and general tool definition included it. The model instead attempted direct browser work/research.

The omission was in `DEFAULT_ENABLED_TOOLS` in `src/lib/talentOnboarding/tools.ts`. The tool name and default enable entry were added, with a tool-selection regression check. Prompt wording was not used to compensate for an unavailable tool. The failed run remains preserved. Case data and gold criteria did not change before rerunning.

## Corrected run

Run `2026-11-03T13-38-54-563Z-concurrent-work-enabled` contains `manage_work` in the actual request tools. Both full replies and tool traces were read.

| Probe | Observed behavior | Time |
| --- | --- | --- |
| `ten_independent_applications` | Read existing work and forms, then started 10 distinct work records with exact Role IDs and original user source `[1]`. The request explicitly delegated writing and submission. No extra approval form was created. The reply reported starting the work, not successful submission. | 40.083 s |
| `delegate_all_pending_reviews` | Read existing work, updated all 10 existing work records, and resolved all 10 review forms. Did not create new work. Preserved the instruction to ask for unknown mandatory personal facts while continuing other applications. | 47.008 s |

The first final reply was:

> 10개 공고의 지원을 각각 시작했습니다. 기존 이력서를 사용하고, 공고별 지원 문구 작성부터 제출까지 진행하겠습니다.
>
> 필수 개인 정보가 빠진 지원만 따로 질문드리고, 나머지는 계속 진행합니다. 제출이 확인된 건과 추가 확인이 필요한 건을 구분해 알려드리겠습니다.

The second final reply was:

> 열 곳 모두 개별 검토 대기를 해제하고 제출 작업을 재개했습니다. 추가 승인 버튼은 누르지 않으셔도 됩니다.
>
> 확인되지 않은 개인 정보가 필수인 지원만 따로 멈추고, 나머지는 계속 진행합니다. 실제 제출 완료 여부와 추가로 필요한 정보는 결과가 확인되는 대로 알려드리겠습니다.

These replies match the synthetic tool outcomes and distinguish resumed work from confirmed delivery. In this harness, “재개” means an accepted work update, not a real ATS submission.

## Independent implementation checks

`src/lib/career/work/database.test.ts` applies the actual migrations to isolated local PostgreSQL databases, with concurrent connections. It checks ten admissions and duplicate requests; independent work claims; partial form answers; ten concurrent approvals; stale revisions and cancellation; foreground instruction fences and competing external effects; a shared answer waking active linked work; source hiding without loss of authority; account soft-delete cleanup. A further provider-rejection test checks that only recorded pre-dispatch 429 evidence can release a dispatch reservation. These are storage/execution contract checks, not LLM quality scoring.

The local `/dev/career-concurrent-work` fixture uses the actual shared form/composer components. Browser verification covered preserved drafts across next/close/reopen, chat while reviewing, a 390×844 mobile viewport and ten consecutive review saves until no confirmation remained. Network writes were synthetic. Browser viewer tests check one selected iframe, stable selection as sessions arrive, unchanged iframe during scroll/docking, and no control handoff merely from opening it.

## Limits and next environment gate

Two favorable probes do not establish that every request will split correctly, that semantically duplicate target identities are impossible, or that ambiguous delegation and hostile external content are always handled correctly. Child workflow completion, real authentication/OTP, long browser expiry, actual quota saturation and ATS response loss were not exercised with live external providers. The code retains explicit unknown outcomes rather than treating those gaps as success.

No deployment or production migration was performed. The implementation document records the release order, compatibility constraints and environment checks separately: [Career concurrent work](../../../career-concurrent-work-implementation-plan-ko.md).

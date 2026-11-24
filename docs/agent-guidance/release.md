# 배포 실행·Notion 문서 동기화 계약

배포 또는 실제 가격·운영 정책 변경에 해당하는 절을 따른다. 경로는 workspace 기준이다. DB 선반영과 웹·Worker 배포를 구분할 때는 [운영 적용 기록](rollout-history.md)에서 관련 기록을 확인하고 현재 실행 상태와 대조한다.

## Explicit deployment authorization required

- Never deploy any Harper component unless the user explicitly says to deploy it in the current request (for example, `배포해` or `deploy`).
- Requests such as `적용해`, `실행해`, `반영해`, `없애`, `직접 다 해`, or `전부 처리해` authorize only the requested non-deployment work. They must never be interpreted as deployment authorization.
- Without explicit deployment authorization, do not push to a branch that triggers deployment, merge into a deployment branch, create or promote a release, invoke a hosting/deployment command or API, apply migrations through a deployment pipeline, or restart a production service as part of releasing code.
- A request to commit or push code is not deployment authorization. If the target branch or push can trigger deployment, stop before pushing and ask for explicit deployment approval.
- Past deployment approval does not carry forward. Require explicit authorization again for every deployment task.

## "배포해"를 받았을 때의 흐름

배포 PR을 만들기 전과 Worker를 서버에 반영한 뒤에는 [harper_incidents](https://github.com/matchharper/harper_incidents) README의 최신본을 직접 읽고 그 규칙을 따른다. 관련 사건을 PR에 연결하는 방법과 Worker 반영을 알리는 방법이 그 문서에 있다. 이 문서에 요약해 두지 않는다.

### 무엇을 내보낼지 정한다

- "전체 배포해"는 harper_beta와 harper_worker를 모두 내보내라는 뜻이다. 두 저장소 checkout의 미커밋 변경과 아직 push하지 않은 로컬 커밋을 모두 커밋해 함께 내보낸다. 다른 세션이나 팀원이 만든 변경도 포함한다. 비밀값이 든 파일(`.env`, 키, 토큰 등)만 커밋하지 않고 알린다.
  - harper_beta: 로컬 변경을 작업 브랜치에 커밋하고 `dev` 대상 PR로 머지한다.
  - harper_worker: 로컬 변경을 작업 브랜치에 커밋하고 `main` 대상 PR로 머지한다.
  - 로컬 브랜치가 `origin`보다 뒤처져 있거나 갈라져 있으면 `origin` 위에 합친다. 충돌이 나면 멈추고 알린다.
- 요청이 범위를 말하면 그 범위만 내보낸다. 범위를 말하지 않은 "배포해"는 이번 작업에서 바뀐 저장소와 변경이 대상이다.
- 로컬 변경을 합친 뒤, 이번에 운영으로 나갈 커밋 목록을 저장소별로 보여 준다. 커밋 해시, 제목, 작성자, 속한 PR을 적고, 따로 확인을 기다리지 않고 배포를 시작한다. 목록은 `origin` 기준으로 만든다.
  - harper_beta: `origin/main..origin/dev`
  - harper_worker: 운영 release의 `REVISION`부터 `origin/main`까지
- 내보낼 코드가 운영 DB에 아직 없는 테이블·함수·칼럼을 쓰면, 읽기 전용으로 운영 DB를 확인한다. 빠진 것이 있으면 배포를 멈추고 사용자에게 알린다. 직접 적용하려면 그 migration에 대한 별도 승인이 필요하다. [운영 적용 기록](rollout-history.md)에서 먼저 적용한 migration인지도 확인한다.
- 웹과 Worker가 함께 나가면, 아직 운영에 없는 API·필드·DB 객체를 부르는 쪽을 나중에 내보낸다.

### harper_beta: `dev`에 모으고, `main` 머지가 곧 배포다

1. 변경은 작업 브랜치에서 `dev` 대상 PR로 머지한다. `dev` 머지는 배포를 일으키지 않는다.
2. `dev` → `main` PR을 만든다. 제목은 `release: dev → main (<담긴 PR 요약>)` 형태로 쓰고, 본문에는 담긴 PR과 먼저 적용한 운영 DB 변경을 적는다.
3. 이 PR을 머지하면 Vercel이 운영에 배포한다. `main`에 직접 push하지 않는다. 수동 Vercel 배포도 하지 않는다.
4. 머지 커밋의 Vercel production 배포가 Ready인지, 운영 도메인이 그 커밋을 서비스하는지 확인한다.

### harper_worker: `main` 머지 뒤 서버에서 직접 반영한다

1. 작업 브랜치에서 `main` 대상 PR을 머지한다. 머지만으로는 운영에 반영되지 않는다.
2. EC2에서 머지된 `main` 커밋으로 새 release를 만든다. Opportunity는 `opportunity-current`를 바꾸고 scheduler만 재시작한다. 나머지 상시 서비스와 timer도 새 release를 쓰도록 바꾼 뒤, 진행 중 작업이 없는 것을 확인하고 하나씩 재시작한다.
3. 서버 접속 방법, 서비스 목록 확인, 전환과 확인 순서는 harper_worker의 [재시작·배포 안전 계약](../../../harper_worker/docs/worker-restart-safety.md)을 따른다. harper_beta는 공개 저장소이므로 서버 주소와 접속 정보는 harper_worker에만 둔다.

### 배포 뒤

- Notion 문서는 아래 절에 따라 확인한다.
- 이번 배포의 revision과 먼저 적용한 DB 변경, Worker 서버 기록 위치를 [운영 적용 기록](rollout-history.md) 맨 위에 남긴다.
- 이번 배포가 `src/lib/ops/updateMetrics.ts`의 `OPS_UPDATE_RELEASES`에 있는 업데이트를 처음 운영에 내보냈다면 `deployedOn`을 배포일(KST)로 채운다. 이 변경은 다음 배포에 함께 나간다.

## Deployment execution scope

- Treat a request to push and deploy existing Harper changes as a release-execution task. Assume the working-tree implementation, product behavior, copy, and design have already been reviewed unless the user explicitly asks for another review.
- Before deployment, limit checks to what is needed to execute the release safely: confirm the intended repositories and branches, inspect the working-tree/commit state, run only a short repository-appropriate build, syntax check, or targeted smoke check when necessary, and verify the actual deployment result.
- Do not run the full test suite, full-repository lint, broad regression review, design review, UX-writing review, or unrelated code audit merely because deployment was requested. Do not turn pre-existing or non-blocking test failures into deployment-time implementation work.
- Do not change product code, copy, design, documentation, or tests during a deployment task unless the deployment itself exposes a concrete blocking defect or the user explicitly asks for the change. Report a real blocker instead of widening the task into cleanup or review.
- Do not add, rewrite, or delete tests just to make a deployment check pass. Test maintenance is a separate change unless the user explicitly includes it in the request.
- Do not apply, reapply, repair, or infer the need for database migrations merely because migration files are present locally or absent from a migration-history table. Missing history is not proof that live schema changes are absent.
- For an ordinary push/deploy request, do not make any database, seed-data, translation-data, or production-configuration changes unless the user explicitly requests that operation in the current request or a documented deployment command unavoidably performs it as part of the named component's standard deployment. If the user says those changes were already applied or tested, treat that as the deployment baseline and do not repeat them.
- Deployment verification should verify the released revision and component health, not reopen implementation decisions. For workers, the separate restart-safety rules still apply.
- Opportunity는 scheduler 하나만 상시 실행하고, 기존 이름의 독립 Worker 슬롯 최대 6개를 작업별로 실행한다(`poll --once --disable-scheduler`, `Restart=no`). 일반 배포는 불변 release artifact를 준비해 `opportunity-current`를 원자적으로 교체하고 scheduler만 재시작한다. 실행 중 Worker와 구 release/venv는 작업 완료까지 보존하며, 여섯 Worker가 항상 active여야 한다고 판단하지 않는다. 최초 전환과 실제 운영 확인은 `harper_worker/docs/opportunity-worker-pool.md`를 따른다. Legacy 상시 poller가 남아 있을 때만 순차 drain을 사용하며 전환 후 rolling restart는 사용하지 않는다. 종료 제한은 `infinity`로 유지하고 `SIGKILL`로 작업을 중단하지 않는다.

## Deployment-time Notion documentation sync

Harper's team-facing product documentation lives in the Notion `Documents` database:

- Documents: https://app.notion.com/p/Documents-3617277d26df80da80d8dea3d84ec796
- Company product overview, decision rules, pricing and operating policies: https://app.notion.com/p/3fe7277d26df812dbc7def98e67aa45c
- Career Harper capabilities and limits: https://app.notion.com/p/3b57277d26df81028ccce63a24db9922
- Company Workspace language and candidate visibility: https://app.notion.com/p/3ec7277d26df817cbf2cd66cb88efd07
- Slack Harper capabilities and limits: https://app.notion.com/p/Slack-Harper-3b57277d26df80d9befcea96039aa75d
- External and internal recommendation logic: https://app.notion.com/p/3b57277d26df817aa35cd4fcd3bca0f2
- Candidate acceptance through company connection: https://app.notion.com/p/3b57277d26df8180847bd2da98e7603d
- Role, internal follow-up, and talent-status lifecycle: https://app.notion.com/p/3b57277d26df810997b6e5480848ab87
- Zighang, LinkedIn, and VC job collection: https://app.notion.com/p/3ad7277d26df80cd9608c3e6d6f15b05
- UTM acquisition analytics operations guide: https://app.notion.com/p/3d47277d26df81e9aab8f1c92a7f74f1
- Blog publishing and operations: https://app.notion.com/p/3dc7277d26df816dad92e45cb6383679
- GTM Workspace operations: https://app.notion.com/p/3e27277d26df81208635e61eda1a9d85
- GTM plays (Ops /ops/gtm-plays): https://app.notion.com/p/4177277d26df817680faf18f244eae28

When performing a deployment, always run the following documentation check before reporting the deployment task complete:

1. Do not update Notion for ordinary coding, review, tests, local builds, dry runs, or a failed/cancelled deployment. Notion describes deployed behavior, not work in progress.
2. After each component is successfully deployed, inspect the behavior changes between its previously deployed version and the version now live. Evaluate changes across `harper_beta/`, `harper_worker/`, and scraping/data-collection services when they are part of the deployment.
   - Use evidence in this order: deployed runtime code, database migrations/RPCs, scheduled workflow definitions and production configuration; then executable tests and observed run/log evidence; then current operating contracts; then design or plan documents.
   - Do not treat a design document, TODO, code comment, prompt description, or proposed flow as proof that behavior is live. Trace the state-changing path and its downstream effects.
   - If a design or operating document disagrees with the deployed implementation, describe the implementation in Notion and update the conflicting repository document in the same deployment change. If the mismatch looks like a product bug, report it separately instead of documenting the intended behavior as if it were live.
   - Compare against the deployed revision and configuration, not an uncommitted local worktree. If the deployed revision cannot be identified, do not make an unqualified claim about live behavior.
3. Map every material product-logic or feature change to the relevant page(s) above. If there is no behavior change covered by a page, make no Notion write.
4. Fetch each relevant page before editing it. Update the existing agent-controlled page instead of creating a duplicate, and preserve unrelated manual notes, discussions, and links.
5. Write for any teammate, not only engineers: explain what the feature does, when it runs, state transitions, decision rules, exceptions, and current limitations in simple Korean. Prefer short sections, tables, numbered flows, callouts, and concrete examples. Avoid source-code, database, API, and infrastructure details unless they are essential to understanding the behavior.
6. Keep claims aligned with what is actually live. Update the page's `문서 기준` date and revise only the affected sections. Add a short `이번 배포에서 달라진 점` section only when it helps readers understand a meaningful change.
7. Keep a `변경 이력` table as the final section of every managed page, with only `날짜` and `주요 변경` columns. Add one very short, newest-first row only when a deployment materially changes a feature, decision rule, state transition, scope, or limitation. Do not add history rows for wording, formatting, typo, or other non-behavioral edits, and do not rewrite past rows.
8. Preserve these product invariants unless the deployed behavior intentionally changes them:
   - Candidate acceptance records consent; after a short delay, the local agent prepares and delivers the company introduction. There is no separate Harper staff review or approval step. Acceptance alone is not proof of completed sharing; preserve the existing direct-transition contracts and actual delivery facts.
   - A company's explicit acceptance or rejection ends the Harper matching flow; an unanswered request is not inferred to be either.
   - `talent_setting.status` values such as `active`, `passive`, and `stopped` govern periodic external recommendations. `stopped` is not a privacy opt-out and does not by itself block internal opportunities.
9. If a material team-facing behavior does not fit an existing page, create one agent-controlled page in the `Documents` database, use the same nontechnical style, add the same final history table, and add its canonical URL to this list in the same deployment change.
10. In the final deployment report, list the Notion pages updated, or explicitly say that the documentation check found no relevant behavior change. If Notion is unavailable or the update fails, report the exact documentation work still pending; never silently omit the sync.

### 회사 제품 종합 문서 유지

- `회사 제품 — 동작·판단 기준·요금 및 운영 정책`은 회사 제품의 종합 진입 문서다. 회사 기능, 선정·연결 판단, 상태 전이, 권한·공개 범위, 검색·후속 연락, 가격·Intro·구독·취소·환불·계약·가입 범위가 변경되면 위 종합 문서와 관련 상세 문서를 함께 확인하고 영향받은 절을 갱신한다.
- 배포 변경은 성공적으로 운영에 반영된 뒤 갱신한다. 사용자가 요청한 가격·운영 정책·설정 변경이 배포 없이 실제 적용된 경우에도 같은 문서를 갱신한다. 이는 현재 정책을 문서화하는 규칙이며 배포·가격 변경·계약 변경 자체의 권한을 부여하지 않는다. 단순 코딩·설계·검토 결과는 현재 기능으로 기록하지 않는다.
- 공개 요금제와 회사별 기존 계약, 실제 이용 가능 범위를 구분한다. 금액·통화·청구 주기·Intro 지급 및 차감·갱신·이월·취소·환불·성공보수·셀프 가입과 결제 공개 범위를 실제 가격·설정·확인된 정책으로 대조한다. 개별 회사의 비공개 계약과 개인정보는 공통 문서에 복사하지 않는다.
- 기존 상세 문서와 모순되는 설명이 있으면 현재 배포 구현과 실제 적용 정책을 우선하고, 확인하지 못한 운영 값은 확인 범위와 함께 명시한다. 문서 기준일과 마지막 `변경 이력` 표를 유지하며 의미 있는 동작·정책 변경만 짧게 기록한다.

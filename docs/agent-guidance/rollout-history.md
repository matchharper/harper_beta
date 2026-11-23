# 운영 적용 기록

기존 AGENTS.md에 있던 날짜별 기록을 원문 그대로 옮겼다. 각 항목은 작성 당시의 관측·로컬 변경·DB 적용·배포 범위를 뜻하며 현재 운영 상태를 자동으로 보증하지 않는다. 기존 후속 기록의 우선순위와 재적용·재발송 금지는 유지한다. 배포·migration·관련 정책 작업에서 해당 항목과 현재 코드·운영 근거를 대조한다. 기록 안의 상대 경로는 출처 AGENTS.md가 있던 디렉토리 기준이다.


## 2026-11-24 Career 연속 실패 상한 RPC와 실패 안내 번역 (운영 DB·번역 DB만, 웹 미배포)

사용자 요청으로 커밋 `6cb3c1fc`의 migration [`20261123180000_career_invocation_failure_limit.sql`](../../supabase/migrations/20261123180000_career_invocation_failure_limit.sql)을 운영 DB에 적용했다(이력 version `20261123161608`, 11/24 01:16 KST). 적용 전에는 함수가 없었다. 적용 뒤 함수 본문 md5가 파일과 같고(`c9e75721…`), 실행 권한은 service_role뿐이며 `claim_career_invocations`는 바뀌지 않았다. 지금 배포된 웹은 이 함수를 부르지 않으므로 동작이 바뀌지 않는다.

같은 요청으로 `pnpm translation:sync`를 실행했다. 처음 계획에는 새 key가 잡히지 않았다. 구현할 때 `ko.ts`·`en.ts`의 `career` 묶음에 직접 넣어 두어서다. 그 줄을 빼고 다시 계획을 만들어 `career.chat.turn_failed` 하나를 직접 번역했다. DB에는 이 key의 ko·en 2행만 올렸다(en: "I couldn't put together a reply. Send the same message again and I'll start over."). 같은 실행이 DB 값 47개를 로컬 사전으로 가져왔다. 16개 key는 새로 들어왔고 31개는 값이 바뀌었다. 새로 들어온 key에는 원하는 조건 화면에서 쓰지 않게 된 `career.profile.context.pinned.*`·`blank` 6개도 있다(DB 행은 지우지 않는 규칙). `translation:check-career`의 실패는 11/12에 커밋된 `preview/concepts/data.ts`의 `ui.*` key 누락뿐이다. 웹 배포 전이다. 이 migration과 번역 행은 다시 적용하지 않는다.

## 2026-11-23 context window 초과로 멈춘 Career 대화 중단 (운영 DB 1건, 코드 변경 없음)

대화 8391f42d(사용자 5b62ec6f)의 invocation b57d0d70이 2MB 붙여넣기(메시지 512089) 때문에 context window 초과로 23시간 동안 약 5,240번 다시 실행됐다. 사용자 요청으로 22:44 KST에 제품의 '중단'과 같은 `stop_career_conversation`을 불러 끝냈다. 미리 열린 폼·브라우저·작업이 없는 것을 확인했고, 이 함수는 invocation 종료, 512616의 `careerTurnStopped` 표시, 실행 상태 정리(220만 자 → 3만 4천 자), 정리 invocation 생성만 했다. 그 뒤 이 대화의 실행·오류 로그는 없다. 512089는 이력에 남아 있어, 이 사용자가 새 메시지를 보내면 수정 배포 전까지 같은 실패가 다시 시작된다. 수정 설계는 [큰 입력과 재시도 상한](../career-large-input-and-retry-limit-design-ko.md)에 있다.

## 2026-11-23 Brief key를 update로 설정·해제 (운영 DB만, 웹 미배포)

`write_talent_context`가 Brief에 호환 key를 주거나 지울 수 있게 하면서, 공통 RPC `mutate_talent_contexts`의 update가 `key`를 받게 했다. 값이 있으면 설정하고 빈 문자열이면 지운다. Memory 행에 key를 주면 다른 update 오류와 같이 `PT409`로 거절한다. 사용자 승인으로 운영 DB에 [`20261123170000_talent_context_update_key.sql`](../../supabase/migrations/20261123170000_talent_context_update_key.sql)을 적용했다(이력 version `20261123132749`, 22:27 KST). 적용 전 운영 함수 본문이 이 파일의 기준본과 같은지 md5로 대조했고(`0114a766…` → `1ec17a84…`), 실행 권한(`service_role`)과 `security definer`·`search_path`는 그대로다. 되돌리는 transaction 안의 임시 사용자로 key 설정, 다른 행이 가진 key 요청(`23505`, `talent_contexts_active_key_uidx`), 빈 문자열로 해제, Memory key 거절을 확인했고 남은 행은 없다. 지금 배포된 웹은 update에 key를 보내지 않으므로 동작이 바뀌지 않는다. 원하는 조건 화면의 고정 칸 제거와 `write_talent_context` key는 웹 배포 전이다. 이 migration을 다시 적용하지 않는다.

## 2026-11-21 /ops 지표 읽기 경로 (운영 DB만, 웹·Worker 미배포)

`/ops/metrics`를 처음 열면 85초가 걸린다는 보고를 받아 원인을 측정했다. 사용자 승인으로 운영 DB에만 적용했고, 웹 코드는 바꾸지 않았다. 아래 migration을 다시 적용하지 않는다.

- **원인.** 지표 쿼리 6개가 테스트 Role 9개와 내부 Role 115개를 찾으려고 `company_roles` 29.6만 행(본문 약 530MB)을 각각 전부 읽었다. 리텐션은 코호트 활동을 하한 없이 찾느라 `logs` 인덱스 전체와 힙 36만 건을 읽어 78초가 걸렸다. 메시지는 `conversation_id`로 시작하는 인덱스를 통째로 훑었고, 활동 로그는 최근 행의 77%인 `career_tool_call`까지 힙에서 읽고 버렸다. 운영 디스크가 다른 작업으로 바빠서 같은 쿼리도 8~80초로 흔들렸다. "6일 범위가 30일보다 느리다"는 범위 탓이 아니라 처음 열 때 디스크에서 읽는 비용이다.
- **인덱스.** `company_roles_test_only_idx`(16kB), `company_roles_internal_idx`(16kB), `talent_messages_user_created_idx`(7.5MB), `logs_talent_activity_created_idx`(55MB)를 `CREATE INDEX CONCURRENTLY`로 만들고 `indisvalid`·`indisready`를 확인했다.
- **migration.** 로컬 정본 `supabase/migrations/20261121090000_ops_metrics_read_paths.sql`을 한 transaction에서 실행하고(`lock_timeout` 3초) 같은 transaction에서 이력에 `20261121015515 ops_metrics_read_paths`로 기록했다. 리텐션 함수는 활동을 기간 첫날이 속한 주부터만 읽는다. 적용 전 운영 함수 본문이 이전 정본(`20261113014810`)과 같았고, 새 함수를 세션 임시 함수로 돌려 6·30·90일 범위 모두 결과가 같음을 확인했다. 적용 후 운영 본문이 파일과 같고, 실행 권한은 `service_role`에만 있다.
- **효과(운영 측정).** 단독 실행 기준 retention 75~90초 → 2.6초(6일)·10초(30일), conversion 15초 → 4.7초, engagement 24~73초 → 8초다. 화면처럼 overview와 섹션 3개를 동시에 보내면 9~14초에 모두 끝난다. `/ops/update-metrics`의 가입 쿼리는 162초 → 82초로 `company_roles` 몫만 줄었다.
- **남은 것.** overview trend와 engagement는 추천 이벤트(`viewed_at`·`clicked_at`·`feedback_at`)를 찾으려고 `talent_opportunity_recommendation` 전체(약 400MB)를 읽는다. overview는 대신 지원과 실행 건을 `id::text`로 맞추느라 `talent_external_operations` 전체를 읽는다. 업데이트 지표는 1인당 3일 비용·LLM 시간을 구하려고 기간 안의 `llm_logs` 약 1GB를 모두 읽고(50초), 추천마다 `company_roles` 행을 읽어 채용 글인지 본다(22초). 모두 쿼리를 바꿔야 하고, 웹 코드에 있는 쿼리는 배포가 필요하다.

## 2026-11-21 공개 회사·웹 자료 색인 멈춤 (웹 배포)

11/20 배포로 Career 자료 색인이 운영에서 처음 돌았다. 회수 루프(`recoverResourceOperations`)가 `company_db` 회사 318,560곳 전부를 색인 대상으로 등록하고 하나씩 색인하면서 DB 실행 시간의 66~68%를 썼다([사건 #116](https://github.com/matchharper/harper_incidents/issues/116)). 그 사이 DB가 11/20 09:44와 13:18(KST)에 비정상 재시작했다. 11/21 08시부터는 회사 자료 읽기(`career_company_observations_v1`)가 30~40초씩 걸려 statement timeout으로 끊겼고, 5분마다 시간 초과가 115~158건 났다. 같은 대기 줄에 선 talent 문서 색인도 멈췄다([사건 #118](https://github.com/matchharper/harper_incidents/issues/118)).

사용자의 배포 요청으로 [#406](https://github.com/matchharper/harper_beta/pull/406)을 `dev`에, 릴리스 [#407](https://github.com/matchharper/harper_beta/pull/407)을 `main`에 병합했다. 제품 revision `415b5ff6167c6e8f59a32db44be9503005279081`의 Vercel `dpl_7ndGsPkxXqFbu9qNqWLmdkDNrg8s`가 11/21 10:49 KST에 READY다. 바뀐 동작은 이렇다.

- 회수 루프가 색인 대상을 일괄 등록하지 않는다.
- 공개 회사·웹 자료 색인 작업을 발행하지 않고, 이미 큐에 있던 작업은 DB를 건드리지 않고 끝낸다.
- 비공개 문서와 discovery 요청의 대기만 정렬 없이 고른다.

이 공개 색인을 읽는 도구나 discovery 예약은 없다. DB 변경은 하지 않았다. 이미 등록된 공개 대기 행(회사 276,981, 웹 142,310)은 지우지 않았고, 다시 쓸지는 따로 정한다.

배포 뒤 5분 동안 회사 자료 읽기, 공개 자료 나눠 보내기, 일괄 등록 호출은 0건이었고 talent 문서 59개가 색인을 마쳤다. statement timeout은 5분당 115~158건에서 3건, 다음 5분 0건으로 줄었다. 10초 넘는 쿼리는 5분당 50~69건에서 4건으로 줄었다. 예약 실행이 한 번에 10분 안팎 걸려 6자리를 채우는 문제는 이번 수정과 별개로 남아 있다. 1시간 넘게 밀린 예약도 416건 남아 있다.

## 2026-11-20 Career note·회사 탐색·채용 신호, 새 랜딩 웹·Worker 배포 (운영 DB 적용 포함)

사용자의 beta·Worker 전체 배포 요청으로 진행했다. 배포에 필요한 운영 DB 반영도 같은 요청에 포함됐다. 아래 migration을 다시 적용하지 않는다.

**운영 DB.** 웹 배포 전에 아래 6개를 적용했다. psql로 파일마다 한 transaction에서 실행하고, 같은 transaction에서 `supabase_migrations.schema_migrations`에 기록했다. 이력에는 없지만 객체가 이미 있는 11/13 Career resource migration들과, 이력의 SQL이 로컬 파일과 같은 `talent_test_accounts`·`career_persona_test_runs`·`career_mail_events`·`career_work_responsibility_routes`는 다시 적용하지 않았다.

| 로컬 정본 | 운영 version / name |
| --- | --- |
| `supabase/migrations/20261117203000_career_matching_feedback_note_never_blocks.sql` | `20261119151310 career_matching_feedback_note_never_blocks` |
| `supabase/migrations/20261118110000_career_stop_using_external_roles_enabled.sql` | `20261119151312 career_stop_using_external_roles_enabled` |
| `supabase/migrations/20261118120000_career_company_discovery.sql` | `20261119151333 career_company_discovery` (1b는 아래처럼 나눠 실행) |
| `supabase/migrations/20261119210000_career_talent_notes.sql` | `20261119152511 career_talent_notes` |
| `supabase/migrations/20261119220000_career_run_conclusions.sql` | `20261119152516 career_run_conclusions` |
| `supabase/migrations/20261119230000_career_company_hiring_signals.sql` | `20261119152518 career_company_hiring_signals` |

- `external_roles_enabled`: 바꾸는 함수 6개의 운영 정의를 적용 전에 새 정의와 비교했다. 플래그를 읽고 쓰는 부분만 달랐다. 컬럼은 남아 있고, 삭제는 별도 migration으로 한다.
- `career_company_discovery` 1b: `company_workspace`에 행을 넣을 때마다 trigger(`capture_company_info_revision_v1`)가 advisory lock을 잡는다. 한 transaction에 8.9만 행을 넣으면 운영 잠금 표(`max_locks_per_transaction` 64 × `max_connections` 160)를 넘는다. 그래서 1b만 빼고 migration을 적용했다. 1b는 같은 SQL 끝에 `order by k.id limit 2000`을 붙여 batch마다 한 transaction으로 반복했다. 새 workspace는 88,092곳이다(전체 30,541 → 118,633). 한 번에 넣었을 때의 예상 88,701곳보다 609곳 적은데, 앞 batch에 들어간 이름과 같은 이름을 뒤 batch에서 뺐기 때문이다. 1a(기존 workspace에 디렉터리 연결)는 대상이 없었다.
- `career_talent_notes`: 적용 전에 `talent_matching_notes` 104행과 `talent_matching_note_entries` 505행을 Worker의 ignored `private/deploy-20261120/`에 CSV로 남겼다. Harper 생각이 있던 매칭 22개가 work note로 옮겨졌고, 노트 표·함수·반응 trigger는 지워졌다.
- 새 RPC는 `service_role`만 실행할 수 있고 새 표는 RLS가 켜져 있다. Security advisor에서 이번 객체에 해당하는 것은 service_role 전용 표의 `rls_enabled_no_policy`(INFO)뿐이다.
- `20261116064407_career_gmail_history_claim.sql`의 함수는 배포 코드가 호출하지 않아 적용하지 않았다.
- `/career` 번역: `translation:sync`로 키 37개의 ko·en 74행을 upsert했다. 처음 sync가 로컬에서만 바뀐 한국어 13개를 DB 값으로 되돌려, 그 13개를 원문 변경으로 다시 계획하고 영어를 새로 썼다. 같은 sync가 DB에만 있던 값 61개를 로컬 사전에 가져왔다.
- 회사 색인: `scripts/career/indexCompanySearch.ts`로 `career_company_search`를 채웠다(내부 workspace를 뺀 118,603곳 모두, 약 47분). 임베딩은 `text-embedding-3-small`이다.

**웹.** [#399](https://github.com/matchharper/harper_beta/pull/399)로 로컬 작업과 최신 `origin/main`을 `dev`에 합치고, 릴리스 [#400](https://github.com/matchharper/harper_beta/pull/400)으로 `main`에 병합했다. 제품 revision `7b3f39a91cfd489a6a20d23fa1ee5c494c55ad66`의 Git-triggered Vercel `dpl_EWhvbFXTfwzutedCLmGEhjBo8EsA`가 READY이고 matchharper.com·app·www alias를 확인했다. 병합하며 업스트림이 지운 `gtmPlays/candidateCompany.ts`·`demand.server.ts`는 지운 상태를 따랐고, main의 지원 브라우저 수정과 `suggest_form` answers를 로컬 변경과 합쳤다. `tsc`, `next build`, 미리보기 빌드 2회, 병합으로 바뀐 경로의 테스트 74개가 통과했다. 홈·`/career`·`/update-notes`·`/ops/update-metrics`가 HTTP 200, 새 Ops API는 무인증 401이다. 배포 직후 runtime error 두 묶음은 모두 이전 배포의 것이다.

**Worker.** [#74](https://github.com/matchharper/harper_worker/pull/74)를 `main`에 병합하고, `dfda792f82f12fe309da3b466766e9fb1237c034`로 불변 release를 만들었다. `opportunity-current`를 원자적으로 바꾸고 scheduler만 재시작했다. 기존 슬롯 6개는 신호 없이 작업을 마치고 정상 종료했고, 새 실행은 모두 이 revision이다. 전환 때 진행 중이던 handed_off 1건(`db4146b9-f924-4c4b-be8f-61966fadc697`)은 completed가 됐다. 회사 검색 scheduler·worker, 외부 소싱 worker, 이메일 답장 worker(contact queue 포함)는 진행 작업 0건을 확인하고 `release.conf`를 새 release로 바꾼 뒤(이전 파일은 `release.conf.bak-20261120`) 하나씩 재시작했다. 다섯 서비스 모두 active, NRestarts 0, 종료 제한 infinity다. 링크 점검 timer(`harper-found-items-expiry`)는 예전 release에 고정돼 있어 drop-in으로 새 release를 쓰게 했다. 그래서 main에 있던 `fe12f95`(웹에서 찾은 공고도 링크 점검, 대상 2건 증가)도 이번에 운영에 들어갔다. Slack agent worker와 Role 시작 갱신 timer는 바뀐 모듈을 쓰지 않아 그대로 두었다. 서버 기록은 `/home/ec2-user/deployment-records/20261120`, [사건 #1 댓글](https://github.com/matchharper/harper_incidents/issues/1#issuecomment-7014041956)에 남겼다.

**남은 것.** Notion 문서 동기화는 하지 못했다. 이 작업 환경에 연결된 Notion이 팀 `Documents` 워크스페이스가 아니어서 페이지를 열 수 없었다. Vercel Production의 `COMPOSIO_CAREER_WEBHOOK_SECRET`(Gmail 답장으로 작업 재개)과 `DEV_ACCESS_*`(dev 사이트 입장) 존재 여부는 env 목록이 잘려 확인하지 못했다. 실제 사용자 대화로 note·회사 추천·채용 신호가 동작하는지는 아직 관측하지 않았다.

## 2026-11-19 추천 상위 회사 summary 400곳 추가 (총 600곳)

사용자 요청으로 11-17에 채운 200곳에 이어 400곳의 `company_datas` summary를 운영 DB에 채웠다. 대상은 추천받은 사용자 수가 많은 순으로 고른 공개 회사 중 summary가 아직 없는 곳이다. 11-17과 같은 제외 조건(고객사 workspace, GTM·테스트 Role)과 같은 실행 경로(로컬 미배포 코드의 `readCompanyProjections`를 운영 DB·Exa에 연결)를 썼다. 400곳 모두 저장됐고 실패는 없었다. summary 길이는 중간값 2,776자, 연결 출처는 중간값 8개다. 이제 운영의 summary는 600건이다. 이 회사들이 전체 추천 246,094건 중 169,843건(69%)을 차지한다. Exa 비용은 직접 확인하지 않았다.

웹사이트 없이 이름만으로 조사한 43곳의 요약을 읽어 회사가 맞는지 확인했다. `픽스업`(workspace `106a7eee-521c-4911-bf61-291503385dd6`. 같은 이름의 workspace가 3개다)의 첫 요약은 공고의 회사인 PhyxUp Health와 김포의 FIX-UP을 함께 설명했다. 세 workspace의 공고 9개가 모두 PhyxUp Health 공고였다. 사용자 요청으로 이 workspace의 비어 있던 `homepage_url`에 공식 사이트 `https://phyxuphealth.com/`을 넣었다. 그리고 기존 요약의 `checked_at`을 과거로 돌려 같은 갱신 경로로 다시 만들었다. 새 요약(revision 2, 출처 7개)은 PhyxUp Health만 설명한다. 나머지 두 workspace(`6a35471c…`·`2c5b8a2d…`)에는 요약이 없고 손대지 않았다. 같은 회사를 다시 채우지 않는다.

## 2026-11-18 Career 입장 RPC `finalize_career_entry` 운영 DB 적용 (코드 미배포)

로컬 `/career/onboarding` 제출이 모두 마지막 단계에서 실패했다. 운영 DB의 오류 기록은 `Could not find the function public.finalize_career_entry(...)`였다. 로컬 코드는 이 RPC를 호출하지만 운영 DB에는 함수가 없었다.

- 사용자 요청(“migration 적용해”)에 따라 로컬 정본 `supabase/migrations/20261115074531_career_entry_continuation.sql`을 내용 그대로 운영에 적용했다. 운영 이력은 `20261118111501 career_entry_continuation`이다. 함수 하나를 새로 만들고 실행 권한은 `service_role`에만 준다. 기존 함수나 테이블은 바꾸지 않는다. 같은 migration을 다시 적용하지 않는다.
- 적용 전에 함수가 쓰는 `talent_messages`·`official_jobs`·`talent_activity_events` 컬럼과 `enqueue_career_onboarding_continuation`이 운영에 있는지 확인했다. 적용 후 함수 시그니처와 권한(`service_role`만 실행 가능)을 확인했다. 실제 온보딩 제출로 끝까지 확인한 것은 아니다.
- 웹 코드는 배포하지 않았다. 함께 고친 온보딩 자료 단계(자료가 없으면 바로 직접 입력·건너뛰기, 자료와 무관한 서버 오류를 `failed`로 남기지 않음)도 로컬 변경이다.

## 2026-11-18 수동 Harper 연결 추천의 선정 이력 제약 제거·Endo 추천 복구 (운영 DB 적용·코드 미배포)

사용자가 수동 추천 경로 수정과 네 후보자의 Endo Health 추천 발송을 요청했다. 기존 `write_career_opportunities`가 선정 이력이 없는 내부 추천 저장을 거부해 네 건 모두 저장에 실패했다. 그중 Wookyu에게는 카드 없이 메일이 먼저 나갔다. 실행 상태 `completed`만으로 추천 저장이나 발송 성공을 판단하지 않는다.

- 로컬 정본 `supabase/migrations/20261118070924_career_internal_recommendation_without_selection.sql`을 운영에 적용했다. 운영 이력은 `20261118071055 career_internal_recommendation_without_selection`이다. 선정 이력은 있으면 연결하고 없어도 저장한다. 실제 수신 거부·회사 차단·Role 상태·test-only 격리·실행 권한·발송 중복 방지 경계는 유지한다. 같은 migration을 다시 적용하지 않는다.
- `queueManualInternalRecommendationRun`은 공용 저장 RPC로 추천 카드를 먼저 저장하고, 그 식별자와 운영자의 요청을 후속 실행에 전달한다. 사용되지 않던 `forced_single_role` 정책과 `allowRepeat`를 제거했다. 이 웹 코드는 로컬에서만 수정했으며 웹·Worker 배포는 하지 않았다. 이번 세 건은 수정된 함수를 로컬에서 운영 DB에 연결해 한 번씩 실행했다.
- 아직 운영에 적용하지 않은 `20261118110000_career_stop_using_external_roles_enabled.sql`에도 같은 함수 변경만 맞췄다. 나중에 이 파일이 선정 이력 제약을 되살리지 않게 하기 위한 수정이며, 그 파일의 다른 변경은 이번에 운영에 적용하지 않았다.
- 관련 PGlite 테스트 10개가 통과했다. 선정 이력 없는 추천 저장·같은 카드 재사용·migration 재적용과 실제 실행 경계를 확인했다. 운영 후보자 목록 reader의 `new` 탭에서 네 명 모두 유효한 Endo 내부 추천을 한 건씩 읽었다.

대상 Role은 `f8ec8564-623f-44b5-a9b2-ca33c48cbab4`이며, 아래 시간은 2026-11-18 KST다. 메일 발송 기록과 본문을 확인했고, 후보자의 수신함 도착이나 열람까지 확인한 것은 아니다.

| 후보자 | 활성 추천 ID | Endo 안내 메일 |
| --- | --- | --- |
| Jeonghoon Lee | `e80cc162-769b-4ed6-bebc-297876b0d9ed` | `d78f283c-52bb-416f-8ddf-5b87409c426c`, 16:12:57 발송 |
| Seungje Lee | `00b56ce4-14e6-4cd5-8ee3-54fe2ac66e4a` | `260e179c-f32a-47b3-8ab1-aeee68ed3ce1`, 16:12:47 발송 |
| Wookyu Jang | `91d03fe4-233e-4195-8241-a7bd90a832b4` | 기존 `8154faf8-1184-4b2b-8475-a716d4908d26`, 15:01:32 발송 유지. 카드만 저장하고 재발송하지 않음 |
| Sangmin Kim | `0704ec88-7d90-460e-a1ef-656af78fe5ba` | `3d57f43e-7dcd-4104-9248-42a8c5574497`, 16:12:32 발송 |

Jeonghoon의 후속 agent가 추천 ID를 잘못 입력해 만든 임시 중복 카드 `73be3bfa-c2ba-48d9-a33c-83f7e2ff9a1c`는 같은 실행에서 보관 처리됐다. 활성 카드는 위 한 건이고 Endo 메일도 한 건이다. 네 후보자의 Endo 회사 소개 기록은 모두 0건이다. 이번 추천 등록은 후보자의 회사 공유 동의나 회사 소개 완료를 뜻하지 않는다. 위 추천이나 메일을 복구 목적으로 다시 만들거나 보내지 않는다.

[Notion 추천 방식](https://app.notion.com/p/3b57277d26df817aa35cd4fcd3bca0f2)의 저장 조건·발송 확인·변경 이력을 갱신했다.

## 2026-11-18 익명 Role 실명 읽기·미연결 공고 번역 키 운영 DB 반영 (코드 미배포)

사용자는 운영 DB 반영만 허용하고 코드 배포는 하지 말라고 했다. 웹 코드는 배포하지 않았다.

| 로컬 정본 | 운영 적용 |
| --- | --- |
| `supabase/migrations/20261118063000_career_internal_role_real_company.sql` | `20261118065516 career_internal_role_real_company` (MCP) |
| `src/lang/ko.ts`·`en.ts`의 `career.onboarding.onboarding.official_job_similar_*` 3개 key | `translation_entries` ko·en 6행 upsert |

- 적용 전 `read_career_internal_role_v1`의 md5는 `275ef61b93de7fc3b2cdd21832924b97`이었다. 이는 `20261117110000_gtm_role_candidate_company.sql`의 guard가 기대하는 값이며, 그 migration은 운영에 아직 없다.
- 이번 migration은 GTM 이름 함수 두 개(`candidate_company_name_v1`·`candidate_role_title_v1`)를 같은 본문으로 함께 만든다. 그래서 운영의 Role 읽기는 GTM 규칙을 먼저 쓴다(GTM Role 1개). `20261117110000`의 Role 읽기 본문에서도 익명 분기를 빼 두어, 나중에 적용해도 익명 처리가 되살아나지 않는다. 그 guard는 새 함수가 `candidate_company_name_v1`을 호출하므로 통과한다.
- 적용 후 익명 Role 3개를 표본으로 회사명이 'Company'가 아니라 실제 workspace 이름과 같은지 확인했다. 함수 본문에 `is_anonymous`가 없는 것도 확인했다.
- 번역 6행은 로컬 사전 값과 md5가 같다. 같은 계획에 잡힌 다른 미커밋 작업의 key 19개는 DB에 쓰지 않았다.
- 미배포 상태에서는 Career의 Role 읽기만 실제 회사명을 준다. 내부 Role 검색 결과(`internalRoleSearch.ts`)와 가입 진입 context, 미연결 공고 문구·초안은 웹 코드 배포 뒤 바뀐다. 같은 migration을 다시 적용하지 않는다.

## 2026-11-17 추천 상위 200개 회사 summary 미리 채움

사용자 요청으로 추천받은 사용자 수가 많은 공개 회사 200곳의 `company_datas` summary를 운영 DB에 채웠다. 고객사(internal) workspace와 GTM·테스트 Role은 제외했다. 로컬의 미배포 Career 코드(`readCompanyProjections`의 summary 갱신 경로)를 운영 DB와 Exa에 연결해 실행했다. Exa 검색 200회(약 $1.40), 실패 0건이었다. summary 길이는 중간값 2,859자, 연결 출처는 중간값 8개다. 이 200곳이 전체 추천 244,341건 중 115,387건(47%)의 회사다. 웹사이트 없이 이름만으로 만든 8곳과 본문에 등록명이 그대로 나오지 않는 summary를 읽어 회사가 맞는지 확인했다. 같은 회사를 다시 채우지 않는다. 30일이 지나면 회사 상세를 읽을 때 갱신된다.

## 2026-11-17 Career 체크리스트·소스 캐시·매칭 노트·회사 workspace 운영 DB 반영 (코드 미배포)

아래 7개를 운영 DB에 적용했다. 사용자는 운영 DB 적용만 허용하고 코드 배포는 하지 말라고 했다. 웹·Worker 코드는 배포하지 않았다. 각 함수 본문이 로컬 파일과 같은지 md5로 확인했다. 같은 migration을 다시 적용하지 않는다.

| 로컬 정본 | 운영 version / name |
| --- | --- |
| `supabase/migrations/20261117160000_career_company_workspace_hub.sql` | `20261117110431 career_company_workspace_hub` |
| `supabase/migrations/20261117195500_career_matching_note_activity.sql` | `20261117110507 career_matching_note_activity` |

위 두 migration은 다른 연결이 회사 테이블 잠금을 짧게 반복해 잡고 있어서 psql로 적용했다. 잠금 대기 제한 2초를 유지한 채 재시도했고, 같은 트랜잭션에서 `supabase_migrations.schema_migrations`에 기록했다. 회사 workspace 전환 뒤 `is_public_data_home`·`company_datas.facts`·`import_talent_job_link_core_v1`이 없어졌다. URL과 디렉터리 연결이 없는 외부 공고 3개가 모두 자기 workspace로 해석되는 것을 확인했다. 아래 5개는 그보다 먼저 MCP로 적용했다.

| 로컬 정본 | 운영 version / name |
| --- | --- |
| `supabase/migrations/20261117010000_career_complete_source_cache.sql` | `20261117105303 career_complete_source_cache` |
| `supabase/migrations/20261117081425_career_checklist_item_responses.sql` | `20261117105347 career_checklist_item_responses` |
| `supabase/migrations/20261117110100_career_opportunity_checklists.sql` | `20261117105421 career_opportunity_checklists` |
| `supabase/migrations/20261117110200_restore_saved_career_checklist.sql` | `20261117105443 restore_saved_career_checklist` |
| `supabase/migrations/20261117115947_career_matching_research_notes.sql` | `20261117105535 career_matching_research_notes` |

`restore_saved_career_checklist`는 message 499648의 체크리스트를 revision 2로 옮기고 기존 선택을 숨은 응답으로 복사했다. 운영에 배포된 코드는 이번에 추가한 테이블·함수를 쓰지 않는다. 체크리스트 함수 4개와 소스 캐시 함수는 기존 함수를 새 정의로 바꿨으므로, 운영 코드와 함께 동작을 확인해야 한다.

## 2026-11-17 Career 회사 검색의 workspace 참조 운영 DB 반영

사용자의 적용 요청으로 `supabase/migrations/20261117201000_career_company_workspace_refs.sql`을 운영 DB에 적용했다(운영 version `20261117113245 career_company_workspace_refs`). 선행 조건인 `20261117160000_career_company_workspace_hub.sql`(운영 version `20261117110431`)은 회사 정보 세션이 먼저 적용했다. 웹·Worker 배포는 하지 않았다. 같은 migration을 다시 적용하지 않는다.

`career_search_resources_v1(companies)`는 이제 회사를 `company_workspace` 참조로 돌려준다. 조건별 후보 집합을 index로 구한 뒤 합치는 구조로 바꿔서, 적용 전 118초 걸리던 `채널톡` 검색이 0.30초, `AI 반도체`가 0.32초로 줄었다. workspace가 없는 디렉터리 회사는 `career_company_workspaces_for_directory_v1`로 workspace를 받는다. 검증 트랜잭션에서 workspace 하나가 생기고 다시 호출하면 같은 workspace를 돌려주는 것을 확인한 뒤 롤백했다. 새 함수 실행 권한은 `service_role`에만 있다. 설계는 [Career 기회 통합](../career-unified-opportunities-ko.md)의 회사 검색 절에 있다.

## 2026-11-17 Career 기회 통합 운영 DB 반영

사용자의 migration 적용 요청으로 아래 2개를 운영 DB에 적용했다. 웹·Worker 배포는 하지 않았다. 웹 코드는 이 스키마를 전제로 하므로, 배포는 이 적용 뒤에만 한다. 같은 migration을 다시 적용하지 않는다.

| 로컬 정본 | 운영 version / name |
| --- | --- |
| `supabase/migrations/20261117190000_career_company_opportunities.sql` | `20261117104659 career_company_opportunities` |
| `supabase/migrations/20261117200000_career_company_opportunity_activity.sql` | `career_company_opportunity_activity` |

`talent_external_evaluations`가 약 190만 행이라, 새 대상 제약은 `NOT VALID`로 두고 전체 재검증을 하지 않았다. 기존 행은 원래 `role_id NOT NULL`이라 이미 새 조건을 만족한다. 적용 뒤 열 6개, 뷰 3개의 `security_invoker`, 제약·인덱스·외래 키를 확인했고, 기존 멤버십 244,599행이 뷰에서 그대로 읽혔다.

테스트 fixture 사용자로 회사 추천을 만들고 관심 표시·단계 변경·메모까지 실행한 뒤 롤백했다. 첫 검증에서 `talent_role_activity`의 `talent_progress` 복사 trigger가 Role 없는 행에서 실패해, 두 번째 migration으로 Role이 있을 때만 복사하게 고쳤다. 다시 검증했을 때 활동 3건과 decision 이력이 남았고 `talent_progress`에는 쓰지 않았다. 같은 함수로 기존 공고 추천의 보관도 정상 처리됐다.

로컬 E2E DB(127.0.0.1:55432)에도 같은 두 migration을 적용했다. 로컬 뷰 `talent_effective_opportunity_recommendations_v1`은 `shared_material_id`와 `external_experiment_run_id`의 열 순서가 운영과 달라서, 로컬에서만 그 두 열의 순서를 맞춰 적용했다. 로컬에서 실제 앱 reader로 기록 화면 상세·개수·새 기회 탭·대화 context에 회사 추천이 나오는 것을 확인하고 테스트 자료를 지웠다. 설계는 [Career 기회 통합](../career-unified-opportunities-ko.md)에 있다.

## 2026-11-17 Career 공유 회사 자료 운영 DB 반영

운영 DB에 회사 식별용 인덱스 4개를 `CONCURRENTLY`로 만든 뒤, `20261117122500`부터 `20261117124500`까지 회사 자료 마이그레이션 7개를 한 트랜잭션으로 적용했다. 운영 이력에 저장된 SQL 7개의 체크섬이 로컬 파일과 일치했다. 기존 `company_data`는 적용 전후 모두 9,825행이었고 전체 행 내용의 체크섬도 일치했다.

운영 DB의 서비스 권한으로 회사명과 공식 웹사이트만 넘겨 합성 회사의 `summary` 한 건과 `news` 두 건을 저장했다. 다른 사용자 ID로 회사명을 조회해 개요와 출처 URL, label 목록을 읽었고, `news`를 지정하면 두 건 모두 반환됐다. 같은 저장 요청을 재시도해도 행이 늘지 않았다. 검증 트랜잭션을 롤백한 뒤 별도로 조회해 테스트 자료가 남지 않았음을 확인했다. 운영 REST API에서는 서비스 키로 새 테이블과 읽기 함수를 호출해 HTTP 200을 받았고, 익명 키로는 두 요청 모두 HTTP 401을 받았다.

이번 적용 범위는 운영 DB다. 실제 모델과 두 브라우저 계정으로 확인한 도구 호출은 [로컬 검증 기록](../evaluation/career-agent-autonomy/reports/2026-11-17-shared-company-research.md)에 있다.

## 2026-11-16 Career 시나리오 검증과 운영 DB 반영

운영 DB에 기회 평가(`career_opportunity_reviews`), 공유 회사 자료(`career_company_evidence`), Gmail 연결 후 실행(`career_gmail_connection_continuation`), 개인 검색 기록(`career_search_receipts`), 개인 지원 단계(`career_private_opportunity_progress`) 마이그레이션을 적용했다. 웹·Worker 배포는 없었다. 테스트 계정의 운영 화면과 수신 결과는 [시나리오별 기록](../evaluation/career-agent-autonomy/reports/2026-11-16-production-career.md)에 남겼다.

## 2026-11-13 내부 Role 원본·공개 공고 정정·선정 조회 (운영 DB 후속 적용)

사용자의 명시적인 마이그레이션 적용 요청으로 아래 3개를 19:10 KST 운영에 적용했다. 파일 존재나 migration 이력 누락만으로 적용하지 않고 실제 운영 함수와 대상 공고가 이전 상태임을 확인했다. 같은 migration을 다시 적용하지 않는다.

| 로컬 정본 | 운영 version / name |
| --- | --- |
| `supabase/migrations/20261113062038_career_internal_role_canonical_context.sql` | `20261113101033 career_internal_role_canonical_context` |
| `supabase/migrations/20261113062316_repair_incident_60_public_postings.sql` | `20261113101039 repair_incident_60_public_postings` |
| `supabase/migrations/20261113062929_career_internal_selection_public_sources.sql` | `20261113101046 career_internal_selection_public_sources` |

실명 Role은 실제 회사·Role 원본을 읽으며 익명 Role은 비공개 원문 대신 공개 공고들을 별도 출처로 읽는다. 복수 회사 유입 공고 2건의 잘못된 단일 Role 연결을 해제하고, 공개 공고 1건의 제목·회사·소개·JD를 실제 Role 원본으로 정정했다. 세 공고의 slug·공개 상태는 보존했다. 이미 선정된 내부 제안은 같은 Role의 모든 공개 공고 slug·ID URL과 공개 회사명으로 조회할 수 있다. 공개 권한·기존 선정·동의·테스트 격리 경계는 바꾸지 않았다.

관련 SQL/PGlite 테스트 12개 통과. 운영 함수 본문이 로컬 SQL과 일치하고 service_role 전용 실행 권한·SECURITY INVOKER가 유지된다. 운영 service_role 읽기로 실명 Role 원본 일치와 익명 Role의 비공개 원문 제외를 확인했다. 공고 3건의 공개 목록·상세 HTTP 200·본문·관심 표시 링크를 확인했으며 security advisor 신규 항목은 없다. 여러 공고가 연결된 미전달 선정 제안의 운영 표본이 없어 해당 양성 조회는 격리 DB 테스트로 확인했다.

웹은 앞선 [PR #322](https://github.com/matchharper/harper_beta/pull/322)의 main `786dde68113415cfecffcfe5ade04d9efa4d2879`로 18:55 KST READY이며, 이번에는 추가 웹·Worker 배포를 하지 않았다. 앞선 Ops 피드백·요일별 WAU의 웹 변경도 이 revision에 포함됐다. [사건 #60](https://github.com/matchharper/harper_incidents/issues/60#issuecomment-6850047137)과 [사건 #21](https://github.com/matchharper/harper_incidents/issues/21#issuecomment-6850051337)에 코드·배포·DB 근거와 남은 범위를 연결했고 PR #321·#322의 당시 미적용 상태를 후속 적용 기록으로 보완했다.

기존 미연결 단일 채용 공고 7건은 이번 대상이 아니다. 의도적으로 분리한 복수 회사 공고 2건과 구분해야 한다. 과거 대화·메일·추천·동의와 LinkedIn 게시물은 수정·재발송하지 않았다. 배포 이후 새 outbound 메일이 확인 시점에 0건이므로 링크 정상화 완료로 주장하거나 사건을 닫지 않았다. Notion Career Harper·추천 방식의 해당 절·변경 이력과 공고별 Data & Logs 3건을 갱신했다.

## 2026-11-13 Ops 지표 피드백 참여자·요일별 WAU (운영 DB 적용·웹 미배포)

사용자의 명시적인 DB migration 적용 요청으로 `ops_metrics_feedback_and_weekday_activity`(운영 version `20261113070237`)를 적용했다. 로컬 정본은 `supabase/migrations/20261113064102_ops_metrics_feedback_and_weekday_activity.sql`이다. 적용 전 운영의 conversion·engagement 집계 함수가 작성 당시 원본과 일치함을 확인했고, 동일 migration은 다시 적용하지 않는다.

`get_ops_talent_metrics_conversion_v1`에 기간별 고유 피드백 참여자 수, `get_ops_talent_metrics_engagement_v1`에 KST 월요일부터 각 요일까지의 고유 활성 인원 배열을 추가했다. 적용 후 두 함수 정의의 로컬 정본 일치와 service_role 전용 실행을 확인했다. 11/2~11/13, 주별, 추가 이메일 제외 없이 읽기 전용 조회한 결과 피드백 참여자는 699명이고, 11/2 주 누적 WAU는 `[442,718,913,1000,1078,1118,1212]`, 11/9 주는 `[344,614,773,898,963,null,null]`이었다(11/13 16:03 KST 조회). 각 주의 마지막 누적값이 주별 WAU와 일치하며 security advisor 신규 항목은 없다. 사용자 데이터 backfill·발송·웹/Worker 배포·push는 하지 않았다. 화면 변경은 로컬 코드에 있고, 기존 웹 응답 캐시는 최대 2분간 이전 형식을 반환할 수 있다.

## 2026-11-13 예전 방식 수락의 미전달 상태 안내 (웹 배포·운영 작업 재실행)

사용자의 배포 요청으로 PR #318(예전 방식으로 수락했지만 회사에 소개가 가지 않은 경우 talent 쪽 상태를 사실대로 알림)을 dev에 머지하고 릴리스 PR #319로 main에 병합했다. #315(11/13 운영 적용 기록 문서)도 함께 들어갔다. 제품 revision `ee54b94382817b33fb2a958e51631b9b86c77fe7`의 Git-triggered Vercel Production 배포가 16:59 KST success다. #318 미리보기 빌드와 dev 합친 빌드가 성공했고, `src/lib/talentOpportunity.test.ts` 30/30, `tsc --noEmit`이 통과했다. 운영 화면 요청은 이 작업 환경에서 matchharper.com 접속이 막혀 확인하지 못했다. DB 변경은 없다.

동작: 새 방식 소개(`agent_introduction_root_id`)도 회사 단계 태그도 없고, `talent_progress`에 Slack 발송·전달 대기·전달 완료 기록(`accepted_role_pair_is_available_v1`과 같은 기준)도 없는 수락은 수락 뒤 날짜와 상관없이 `not_shared_with_company`로 안내한다. Career 정책은 사용자가 원하면 `contact_company`(acceptIntroduction)로 지금 소개할 수 있다고 안내하며, 성공 전에는 보냈다고 말하지 않는다. 실제 전달 기록이 있는 예전 방식 수락은 기존 7일·21일 문구를 유지한다. 11/13 운영 DB 읽기 기준 이 조건의 쌍은 356개(talent 315명)다. 남은 예전 방식 수락에 Harper가 먼저 알리는 일괄 연락은 하지 않았다.

운영 작업: 사용자의 명시적인 서면 승인으로 11/12 LLM 크레딧 부족(402)으로 5회 모두 실패한 `company_agent_web_action_jobs` 5건(`6b5d05f2-c35e-4c85-9329-4d5802707bd0`, `2a809b6c-70bd-4d05-adc2-8c809b593224`, `78f23510-ea0f-45e1-be69-4bd8eb1ffff5`, `cb658573-ebd8-47a2-90c8-efe3f0bb54ac`, `d941f0d1-a7aa-4df2-ab03-e930e772e22b`, 모두 `agent_contact_received`)을 status `retry`, attempt_count 0, queue_dispatch_status `pending`으로 되돌렸다. 16:30 KST dispatcher가 처리했고 5건 모두 완료돼 회사 목록(`내부:연결대기`, `talent_progress` `intro_to_company`)에 올라갔다. 같은 작업을 다시 되돌리지 않는다.

Notion: `후보자 수락부터 회사 미팅까지`의 "응답이 늦거나 없는 경우"를 실제 동작으로 고쳤다(기존 문서는 1주·3주 문구가 없다고 적었지만 실제 전달 기록이 있는 예전 방식 수락에는 남아 있다). 이 기록을 추가하는 후속 문서 commit은 제품 코드를 바꾸지 않는다.

## 2026-11-13 Ops GTM 플레이·/ops/jobs 가입까지 숫자·/ops/metrics 활동 지표 (운영 DB 선반영·웹 배포)

사용자의 배포 요청으로 PR #312(GTM 플레이 화면과 GTM 메일 가입 흐름), #313(/ops/jobs 공고에서 가입까지 숫자), #311(/ops/metrics 활동 지표·권한)을 dev에 머지하고 릴리스 PR #314로 main에 병합했다. 제품 revision `0b755c4368eaf99bcea6042db8da272d6f24509e`의 Git-triggered Vercel Production 배포가 12:29 KST success다. 세 PR의 미리보기 빌드와 dev 합친 빌드가 성공했고, 운영 `/ops/gtm-plays`가 새 페이지로 응답(로그인 화면)함을 확인했다. 로그인 뒤 화면은 사용자가 확인했다(/ops/jobs 값 확인).

DB는 Owner가 Supabase SQL Editor에서 적용했다. `20261112100000_gtm_mails.sql`·`20261112140000_gtm_mails_posting.sql`(11/12), `20261113100000_gtm_mails_delivery.sql`과 Harper GTM 워크스페이스 행(`93ecd68d-1cf4-4af8-a5c1-b7cb7e4cb848`, `company_workspace`·`company_data`, 저장소 밖 SQL, 11/13 11:30), #311의 `20261113014810_ops_talent_metrics_user_activity_only.sql`·`20261022123304_ops_metrics_internal_recommendation_count.sql`(11/13 12:11)이다. SQL Editor 적용이라 migration 이력 행은 없다. 이력이 없다는 이유로 다시 적용하지 않는다. 적용 뒤 지표 함수 4개(`get_ops_talent_metrics_engagement_v1`·`_retention_v1`·`_v1`·`_v2`)의 anon·authenticated 실행 권한 false, service_role true와 전환 함수의 Internal Role 추천 수 반영을 확인했다.

운영 설정은 Production `GTM_PLAYS_WRITES=on`을 추가했다. `ORG_EXTERNAL_SOURCING_WORKSPACE_IDS`는 `*`라 바꾸지 않았다. `GTM_MAIL_LINK_ORIGIN`은 로컬 시험 전용이며 운영에 넣지 않는다.

배포 뒤 사용자 승인으로 운영 DB의 시험 흔적을 지웠다: GTM 메일 기록 11행(모두 팀 주소로 보낸 시험), 하퍼 자체 계정의 GTM 시험 Role 3개와 Harper GTM 확인용 Role 1개(딸린 대화 1개·외부 검색 1회·외부 후보 2명 포함), 시험 회사 워크스페이스 2개와 그 Role·후보 카드·대기 평가, 시험 로그인 계정 4개(회사 2·후보 2)와 후보 이력서 파일 2개. Harper GTM 워크스페이스는 남겼다. 지운 뒤 남은 행 0을 확인했다.

Notion: 새 문서 `GTM 플레이 — Ops 화면 사용법과 기준`을 만들고, 회사 제품 종합 문서(GTM 메일 가입 시 Role 자동 생성, 11/11 배포부터 열린 셀프 가입 표기 정정)와 Career Harper 문서(공고 관리 화면 숫자, 다른 브라우저 가입 포함)를 갱신했다. /ops/metrics 지표 정의는 해당 팀 문서가 없어 바꾸지 않았다. 이 기록을 추가하는 후속 문서 commit은 제품 코드를 바꾸지 않는다.

## 2026-11-12 Career·회사 화면·내부 운영 알림 웹/Worker 배포

사용자의 두 저장소 배포 요청으로 beta 변경을 dev에 통합한 뒤 PR #305로 main에 병합했다. 제품 revision `d2747f0d222e40f82d67fc598433c6acd7f94302`의 Git-triggered Vercel `dpl_J1NVZo7SDwYwWCvQazSrwuKJMfTr`가 READY이며 matchharper.com·app·www alias를 확인했다. 홈페이지 HTTP 200, 잘못된 내부 알림 capability HTTP 400을 확인했다. dev 빌드에서 발견한 Pages의 server-only import는 웹 도구 정의와 실행 모듈 분리로 해결했다. TypeScript 검사, 회사 후보 화면 1개·알림 7개·웹 도구 13개·Career 저장 DB 10개 검사가 통과했다.

사용자에게 실제 운영 정의 차이를 제시하고 별도 승인받은 DB 변경만 적용했다. 운영 version/name은 `20261112061918 career_suggest_immediate_recommendation`, `20261112061924 update_ops_talent_action_logs`, `20261112062756 internal_hiring_notifications`, `20261112062758 internal_hiring_immediate_dispatch`다. 즉시 공고 저장 함수는 기존 `harper.feedback_source=job_link_import` 기록을 보존했다. 알림 migration은 운영 웹 준비 후 적용했다. pg_net 0.19.5, trigger 6개, RLS·공개 접근 차단을 확인했고 security advisor 신규 항목은 없다. 이전에 적용한 캐시·저장 조건 migration은 재실행하지 않았다. 기존 데이터 backfill·과거 사건 재발송·시험 메시지는 만들지 않았다. 적용 직후 내부 알림 0건이므로 실제 pg_net→Slack 전달 영수증은 아직 관측하지 않았다.

Worker PR #73의 main revision `aba0a12c0b33aa2fd84851df73d9f7e234110504`를 불변 release로 준비하고 opportunity-current를 원자 교체한 뒤 scheduler만 재시작했다. 기존 Opportunity 슬롯은 신호 없이 자연 종료하도록 보존했고 새 작업의 새 release 사용을 확인했다. 전환 전 추적한 진행 작업 4건은 모두 completed다. 회사 검색 scheduler/worker·외부 후보 worker·이메일/contact 통합 worker는 각각 진행 작업 0건을 확인한 뒤 순차 graceful restart했다. 상시 서비스 5개 active, NRestarts=0, TimeoutStop=infinity와 새 cwd를 확인했다. 구 release/venv와 로컬의 기존 tracked pyc 변경은 보존했다. 서버 전환 기록은 `/home/ec2-user/deployment-records/20261112`에 있다.

Career의 즉시 기회 저장·비동기 평가, 묶음 저장/피드백, 예약 점검 기본 모델·발송 영수증 완료 처리, 발신자 통일, 회사 후보 패널/사이드바, 내부 채용 알림과 Daily Debug cron을 운영 코드 기준으로 Notion Career·추천 방식·회사 제품 종합·회사 Workspace·Slack 문서 5개에 반영했다. 첫 정기 Debug 리포트 발송은 아직 관측하지 않았다. 이 기록을 추가하는 후속 문서 commit은 제품 코드를 바꾸지 않는다.

## 2026-11-11 Career 불필요한 저장 필수값 완화 (운영 DB 적용·웹 미배포)

사용자의 명시적인 운영 DB 적용 요청으로 `career_optional_opportunity_metadata`(운영 version `20261111112909`)와 `career_optional_action_presentation`(`20261111112914`)를 적용했다. 로컬 정본은 각각 `supabase/migrations/20261111112101_career_optional_opportunity_metadata.sql`, `supabase/migrations/20261111112104_career_optional_action_presentation.sql`이다. 동일 migration을 다시 적용하지 않는다.

공고 목록의 개별 추가·복원은 전체 목록 revision 없이 실행할 수 있다. 전달한 revision은 계속 검증하고, 다른 항목을 제거하는 replace/reset에는 현재 revision이 필수다. 외부 공고 저장에 evaluationId는 선택값이며, 전달하면 후보자·Role 소유 관계를 검증한다. 액션 카드 생성의 description·priority·urgency에는 빈 설명·0·normal 기본값을 사용한다. 소유권·Role 공개/차단/만료·test-only 격리·내부 선정·멱등성·카드 수정 revision 경계는 유지했다. 운영의 기존 없는 Role 오류에 ID를 표시하는 개선도 보존했다.

운영 함수 본문과 적용 전후 실행 권한·security invoker·search_path, 카드 기본값·RLS, migration 이력을 확인했다. security advisor 항목별 건수는 적용 전후 동일하다. 기존 사용자 데이터를 backfill하거나 추천·카드·메일을 생성하지 않았다. 웹·Worker 배포와 push는 하지 않았으므로 모델용 안내·schema 변경, sourceIds 생략 허용, matchingId 없는 검색, 카드 입력 validator 완화와 일일 리포트 분모 수정은 이번 DB 적용의 운영 반영 범위에 포함하지 않는다.

## 2026-11-11 Career 리소스 캐시·미사용 반환값 조회 제거 (운영 DB 적용·앱 미배포)

사용자의 후속 캐시 개선 요청으로 `career_resource_read_cache` (`20261111091101`)을 운영 DB에 적용했다. 로컬 정본은 `supabase/migrations/20261111090843_career_resource_read_cache.sql`이다. 프로필 원본의 기존 projection trigger를 불필요하게 실행하지 않도록 리소스 변경 버전만 저장하는 `talent_career_resource_revisions`를 분리했다. RLS와 service_role 전용 SELECT를 적용하고 trigger 함수의 공개 직접 실행 권한을 회수했다. 문서·프로필 버전 목록·matching·Career 검색 run·폼 관련 메시지·연결 delegated work의 변경을 감지하는 trigger 6개가 활성화됐다. 기존 자료 backfill, 사용자 메시지 생성, 외부 발송, 웹·Worker 배포는 하지 않았다. 동일 migration을 다시 적용하지 않는다.

캐시 대상은 8개 리소스 갈래 중 문서 목록·프로필 목록·미해결 폼·추천 검색 목록 4개다. 폼 캐시는 사용자와 대화별로 분리하고 work별 표시 순서는 매번 재구성한다. 시각에 따라 달라지는 약속, 일정/회사 팔로우, 브라우저 관측, 회사 측 제안은 원래 조회를 유지한다. 일반 chat/activity·invocation 쓰기는 캐시를 무효화하지 않으며 폼 응답/해결·연결 작업 종료·소유자 변경·삭제는 무효화한다. API 오류는 캐시하지 않는다.

실제 운영 계정의 캐시 대상 4종을 로컬 코드로 읽기 전용 검증했다. 첫 조회는 원본 DB 요청 5회, 778ms였고 같은 프로세스의 다음 조회는 원본 요청 0회, 182ms이며 데이터가 동일했다. 두 경우 모두 기존 프로필 변경 버전과 새 리소스 변경 버전 조회가 각각 1회다. 전체 채팅 시간 측정이 아니며 앞선 프로필 캐시 준비 시간 차이와 합산할 수 없다. 전체 리소스 reader 검증 시 일정 분기의 기존 `ensure_career_check_in` 호출은 읽기 전용 가드가 차단했으므로 이 분기를 포함한 실운영 context E2E 완료로 주장하지 않는다.

로컬 durable invocation은 `executeCareerChatTurn`으로 답변을 저장·전달·완료한 뒤 반환용 프로필/설정/Brief·posting preview·추천 run을 재조회하지 않는다. 기존 `runCareerChatTurn` HTTP 소비자의 전체 반환 계약은 유지했다. 정상·artifact-only·미발송 분기와 기존 full response의 실제 실행 함수 검사 5개, cache/DB trigger/runtime/invocation 관련 39개가 통과했다. 운영 스키마·권한·migration 이력 확인과 security advisor 전후 건수 일치를 확인했다. 타입 검사에는 기존 `dailyUserStats.ts` 오류 5개만 남았다. 앱 코드 미배포이며 사용자 정책 변경은 없어 Notion 제품 문서는 변경하지 않았다.

## 2026-11-11 Career 프로필·Memory 캐시 (운영 DB 적용·앱 미배포)

사용자의 명시적인 운영 DB 반영 요청으로 `career_prompt_cache_revision` (`20261111090323`)과 `career_prompt_cache_trigger_permissions` (`20261111090417`)을 적용했다. 로컬 정본은 각각 `supabase/migrations/20261111081308_career_prompt_cache_revision.sql`, `supabase/migrations/20261111090402_career_prompt_cache_trigger_permissions.sql`이다. `talent_users.career_context_revision`과 프로필·경력·학력·extras·Brief/Memory 변경 시 버전을 갱신하는 trigger 5개를 추가했다. 갱신 함수는 trigger 전용이며 운영 기본 권한으로 부여된 anon/authenticated/service_role 직접 EXECUTE도 후속 migration에서 회수했다. 같은 migration을 다시 적용하지 않는다.

첫 두 시도는 기존 opportunity Worker의 읽기 transaction과 충돌해 3초 lock timeout으로 롤백됐다. 컬럼·함수가 남지 않았음을 확인했고 기존 작업이 자연 종료한 뒤 적용했다. Worker 중단·운영 재시작·사용자 데이터 내용 변경은 하지 않았다. 운영 컬럼·트리거·함수 권한·migration 이력을 확인했고 security advisor 항목별 건수는 적용 전과 같으며 새 캐시 함수 관련 항목은 없다.

로컬 서버 코드로 실제 운영 사용자 데이터를 읽기 전용으로 두 번 조회했다. 프로필·구조화 프로필·Brief·최근 Memory 준비에서 첫 조회는 버전 조회 1회와 원본 조회 6회, 753ms였고 같은 프로세스의 두 번째는 버전 조회 1회와 원본 조회 0회, 173ms였다. 반환 데이터가 동일했다. 이는 해당 준비 구간의 관측이며 전체 채팅 지연 개선이나 운영 웹 캐시 가동을 의미하지 않는다. 캐시 변경·삭제·소유자 이동·권한과 동일 요청 내 공유를 로컬 DB 검사로 검증했다.

로컬 앱은 Decisions와 프로필·Memory·리소스 준비를 병렬로 유지하면서 작업·할 일 목록 조회를 앞당기고, 설정/대화 조회 및 Stop의 독립 조회도 병렬화했다. 웹·Worker 배포와 push는 하지 않았다. DB 캐시 기반과 로컬 소비 코드 검증 완료이며 운영 웹의 새 코드 배포 완료가 아니다. 제품 판단·프롬프트·사용자 정책 변경은 없어 Notion 제품 문서는 변경하지 않았다.

## 2026-11-11 후보 이력·결정 기록·평가 버전·회사 읽기 창·메일함 한 길 (운영 DB 적용·Worker·웹 배포)

사용자의 "배포까지 모두 진행" 요청으로 DB·Worker·웹을 순서대로 반영했다. 같은 migration을 다시 적용하지 않는다.

| 순서 | 로컬 정본 | SHA-256 |
| --- | --- | --- |
| 1 | `supabase/migrations/20261111010000_candidate_history_tables.sql` | `52dfc08aad3fef7908f8487e5772160c47706d02ed9c981fcb5ea30473d7cfdf` |
| 2 | `supabase/migrations/20261111020000_candidate_decision_events.sql` | `18d11c60ac6af775dd7a3d779887378b0a1e370d738fdd3974942864ff80d289` |
| 3 | `supabase/migrations/20261111030000_evaluation_candidate_versions.sql` | `5155ad031fe9fff8793ed274a5bf72a6aceec683b4d3ae0d34e3312af3e5ace9` |
| 4 | `supabase/migrations/20261111040000_company_read_windows.sql` | `e9455cb66c03f6af92a2ef9d5f4b6ca5ab26dcb4a7be795ca3761462631a751f` |
| 5 | `supabase/migrations/20261111050000_mailbox_known_pair_and_agent_role_move.sql` | `639724cb4777027eba81fc46d625790fbc43b81d65ff11ec6231426b12720787` |
| 6 | `supabase/migrations/20261111060000_requested_search_old_memory_scores.sql` | `69646b48c4d292330fe931aa2ed7ef224659443455c9671cafb61b27295c6881` |

DB는 Owner가 Supabase SQL Editor에서 21:56~21:59 KST에 번호 순서로 적용했다. SQL Editor 적용이라 `supabase_migrations` 이력 행은 없다. 이력이 없다는 이유로 다시 적용하지 않는다. 적용 직전 사용 중 작업이 없음을 확인했고, 덮어쓰는 운영 함수 5개(`move_talent_role_saved_stage_v1`, `record_ops_candidate_reply_v1`, `import_talent_job_link`, `move_org_candidate_role_web_v1`, `company_role_search_inventory_v1`)의 `md5(pg_get_functiondef)`가 각 migration의 복사 기준과 같았다. 되돌리기용 원래 정의 정보는 Owner 보관 문서에 있다.

적용 뒤 새 표·함수·트리거·인덱스·제약·뷰의 정의를 같은 파일을 로컬 PostgreSQL 16에 적용한 결과와 대조했고 모두 같았다(권한 표기의 PostgreSQL 17 `MAINTAIN` 차이만). 첫 이력은 `talent_contexts` 126,148행, `talent_behavior_contexts` 9,099행, `talent_setting` 9,131행이 원본 수와 같았다. 새 표·뷰는 anon·authenticated가 읽을 수 없고, 회사 읽기 뷰 2개는 service_role과 `harper_worker`가 읽는다. 회사에 후보 쪽 관점의 v2 적합도 이유가 보이는 행은 0이었다. 적용 직후 카드 첫 열람 기록과 후보 정보 이력이 실제로 쌓였다.

Worker는 `main` `e1d607d4e181d6aa6d0c521cc13fc45efbad4a99`의 release를 만들고 22:20 KST에 `opportunity-current`를 바꾼 뒤 scheduler만 재시작했다. 회사 검색 scheduler·worker와 외부 소싱 worker는 진행·대기 작업이 0건임을 확인한 뒤 `release.conf`의 release 경로를 바꿔 재시작했다(이전 파일은 `release.conf.bak-20261111`). 이메일 답장·Slack 에이전트 worker는 바뀐 모듈을 import하지 않아 그대로 두었다. 의존성 변경은 없었다.

웹은 #290~#295를 release #299로 22:34 KST에, #296~#298을 release #300으로 23:00 KST에 운영 반영했다. 메일함 2단계 직후 Owner가 SQL Editor에서 옛 회사 요청의 대기 중 후속 연락 5건을 `scripts/cancel_legacy_request_followups_at_mailbox_switch.sql`로 취소했고(남은 대기 0, 행은 보존), 거절 창 안내 키 `career.common.opportunity_type_meta.1q2m2s8`의 ko·en 행을 `translation:sync`가 쓰는 값과 같게 반영했다(값 md5가 코드 사전과 같음). 메일함 2단계 뒤 옛 요청·relay 원장에 새 행이 생기지 않는지 7일 동안 `scripts/check_legacy_company_contacts_before_mailbox_switch.sql`로 읽기 점검한다. 전환 전 기준으로 옛 전달 실패 3건과 `candidate_contact_received` 실패 작업 3건은 이전부터 남아 있던 것이다.

배포 전 실제 모델 평가: 요청 검색에서 후보 Memory를 뺀 전후 비교(새 읽기 전용 capture, Memory 있는 후보 3,101명, 같은 입력 재실행 1차 흔들림 0), 메일함 평가(Career v19, 회사 QA v41·v36, 회사 수신 v6·v5)가 기대대로였다. 같은 날 다른 작업의 `career_*` migration 8개가 먼저 운영에 들어가 있었으며 이번 기록의 범위가 아니다. `database.types.ts`는 그 작업이 머지된 뒤 다시 만든다.

## 2026-11-08 Career 폼 묶음·실행 환경 분리·중복 응답 방지 (운영 DB 적용·앱 미배포)

사용자의 “운영 DB까지는 반영해도 됨” 요청으로 Harper 운영 DB에 다음 세 migration을 적용했다. 웹·Worker 배포, push, 운영 재시작은 하지 않았다. 같은 migration을 다시 적용하지 않는다.

| 운영 version | 이름 | 로컬 정본 |
| --- | --- | --- |
| `20261108132629` | `career_form_batches` | `supabase/migrations/20261108140000_career_form_batches.sql` |
| `20261108132725` | `career_execution_environment` | `supabase/migrations/20261108141000_career_execution_environment.sql` |
| `20261108132730` | `career_execution_boundaries` | `supabase/migrations/20261108142000_career_execution_boundaries.sql` |

로컬 정본 SHA-256은 순서대로 `6274319c444c164b20b18fb471ca2c7233a5a4f148409012bba1664965a6358e`, `5488d584941152cadeae6f73136751bbd641a4f1feb3260d3eb6be6f55fdcd72`, `4ee7f96a27496924db47280e9d3899cf88d24778880ae36573e16219c71a8b2f`다. 적용 직전 기존 함수 8개의 본문을 기존 migration 정본과 대조했고, 각 교체 transaction에도 사전 관측한 함수 정의의 해시 검사를 넣어 동시 변경을 덮어쓰지 않도록 했다.

폼 묶음은 검토한 revision 전체를 한 transaction에서 저장하고 하나의 대화 입력만 접수한다. 단일·묶음 제출은 같은 conversation 잠금 안에서 이미 답변한 revision의 새 요청을 거부하며, 같은 request ID의 재시도는 기존 영수증을 반환한다. 폼 상태 조회와 해당 UI 번역 11개 키의 한국어·영어 22개 행도 적용했다. 큐 접수·claim·checkpoint 복구는 실행 환경을 구분하고, 브라우저 복구 조건은 실제 자동 작업의 종료 여부를 확인한다.

운영 권한 대조에서 직접 Postgres로 메시지를 저장하는 `harper_worker`가 새 환경 조회 helper를 호출해야 함을 확인해 그 읽기 함수의 EXECUTE만 허용했다. 폼 저장·큐 변경 RPC 권한은 추가하지 않았다. 환경 migration의 첫 시도는 기존 실행 기록 일괄 갱신과 운영 작업의 잠금 충돌로 롤백됐고, 함수·trigger·migration 이력이 남지 않았음을 확인했다. 기존 기록은 모든 reader가 이미 production으로 해석하므로 불필요한 backfill을 제거한 뒤 짧은 lock timeout으로 성공했다. 기존 실행 기록을 일괄 재작성하지 않았다.

적용 후 함수 12개의 본문이 로컬 정본과 정확히 일치하고 모두 SECURITY INVOKER임을 확인했다. 기존 테이블 RLS·ACL을 보존했고 새 trigger 2개와 기존 trigger를 확인했다. 변경 RPC는 service_role 전용이며, 환경 조회 helper만 authenticated·harper_worker에도 허용된다. 운영에서 기본 production, 요청 header의 개발 환경, harper_worker 역할의 helper 실행, 대기 조건 조회, 원래 중지된 검토 폼의 resolved 상태를 읽기 검사했다. 번역 22개 행은 로컬 사전과 일치하며 security advisor의 대상·건수 증가는 없다. 환경 분리·legacy 무표시 기록 호환·Worker 권한·중복 응답·checkpoint 경계의 변경 관련 로컬 검사도 통과했다.

새 폼 UI, 브라우저와 LLM의 순차 실행, 도구 이력 전달, 별도 답변 재작성 제거는 앱 코드 미배포 상태다. 실제 폼 제출·지원·브라우저 실행·메시지 발송을 검증 목적으로 재실행하지 않았다. Notion 동기화 범위를 검토했으며 아직 제공되지 않은 UI·대화 동작을 운영 기능으로 문서화하지 않았다. 이번 DB 선반영은 기존 실행 무결성 보완과 새 앱 경로 준비이므로 제품 정책 페이지는 변경하지 않았다.

## 2026-11-08 Career 중지 후 정기 접수 차단 복구 (운영 DB 적용 완료)

사용자의 원인 수정·현재 상황 복구 요청으로 운영 migration `20261108041003` (`career_stop_background_ledger`)을 적용했다. 로컬 정본은 `supabase/migrations/20261108040732_career_stop_background_ledger.sql`이다. 웹·Worker 배포, push, 운영 서비스 재시작은 하지 않았다. 같은 migration을 다시 적용하지 않는다.

대화 중지와 개별 대기 요청 취소가 runtime reply만 종료하고 `opportunity_discovery_run.status='handed_off'`를 남겼다. 스케줄러는 이를 계속 활성 작업으로 집계했고, 웹 recovery는 `completedReplyIds`가 있는 reply를 다시 접수하지 않아 풀리지 않았다. 실제로 취소된 8건이 목표 6개를 초과해 `schedule_capacity=0`이었다. 삭제 계정의 대기 작업 7건은 운영 Worker `4b7ece38ef79c1d22b41df22264ac6812958b4ff`에서 이미 집계 제외 중이므로 이번 장애의 현재 차단 원인과 구분한다. 11월 4일 최초 중단의 원인까지 확정한 기록은 아니다.

기존 `stop_career_conversation`과 `cancel_career_pending_reply`가 해당 후보자·대화·reply의 Career background run도 같은 transaction 안에서 취소하도록 수정했다. 기존 실행 완료와 같은 discovery → runtime 잠금 순서를 유지한다. 기존 8건은 runtime 종료 기록과 같은 reply의 완료된 취소 cleanup 영수증이 모두 있는 경우에만 취소했다. 정상 진행·완료 작업, 미래 일정, 기존 발송 payload는 변경하지 않는다. 실제 정리된 8건의 runtime 전체 행 해시는 적용 전후 같고 해당 run의 delivery는 모두 0건으로 유지됐다.

적용 전 두 운영 함수의 본문이 기존 로컬 정본과 일치했다. 적용 후 새 본문 해시 일치, SECURITY INVOKER, anon/authenticated 실행 차단·service_role 실행 허용을 확인했다. Security advisor WARN/ERROR 증가는 없고 health 항목도 없다. 대화 실행 DB 검사 34개와 기존 background 전달·recovery 검사 16개, 합계 50개가 통과했다. 신규 검사는 활성/대기 background 중지, 다른 소유자·완료 작업 보존, 오래된 checkpoint 거부, 취소 영수증에 한정한 복구, 반복 적용 시 상태 보존과 접수 여유 회복을 확인한다.

13:10:26 KST 운영 scheduler 로그가 `target=6 schedule_capacity=6 career_queued=6 company_due=0`으로 바뀌었다. 첫 2건이 `no_send`로 완료된 뒤 13:12:46에 여유 2개가 보충됐으며, 13:13:40에는 run `bf0e9149-09da-4f20-aca8-3167f54994b0`의 추천 2개 안내 메일이 실제 발송됐다. Delivery `083dcdfb-6612-4728-a377-4fb3cbff8d54`의 `sent` 상태와 provider 영수증 `01a1b95c-a93a-7d2b-8117-8fb5a8e99315`, run 완료·source 정리를 확인했다. 13:14 기준 새 정기 run 9건 중 3건 완료(발송 1·미발송 2), 6건 진행으로 접수·실행·완료·보충 순환이 재개됐다. 이는 수신자의 실제 열람이나 전체 backlog 해소를 뜻하지 않는다. 제품 판단·정기 주기·모델 prompt는 변경하지 않았다.

## 2026-11-06 Request Intro → 원본 Career agent (운영 DB 준비 완료·앱 미배포)

사용자의 타입 오류 수정·DB 적용 요청으로 운영 Harper DB에 다음 두 migration을 순서대로 적용했다. 기존 로컬 `request_company_intro_v2` 호출이 필요로 하는 의사결정 기록이 운영에는 없어 선행 migration도 포함했다. 같은 migration을 다시 적용하지 않는다.

| 운영 version | 이름 | 로컬 정본 |
| --- | --- | --- |
| `20261106090932` | `company_decision_events` | `supabase/migrations/20261105020000_company_decision_events.sql` |
| `20261106090937` | `career_company_intro_agent` | `supabase/migrations/20261106084304_career_company_intro_agent.sql` |

정본 SHA-256은 순서대로 `456a669a62f7e1af678a82dec322f4d1445d4f2ba47a5ff17d4d2f7dd18b6dd4`, `be7dd805c897cc99c20dcbb9025161ffc35baa092df1cca8ac1964c6fa7e3fd9`다. 선행 migration은 기존 `talent_progress` 회사 결정 62건을 idempotent key로 의사결정 ledger에 복사했으며 원본은 보존했다. 웹 배포 후 기존 버전이 그동안 기록한 결정을 추가 반영하는 backfill은 해당 migration 계약에 따라 별도로 필요하다.

DB 적용만으로 아직 배포되지 않은 새 context 없이 Career 실행이 시작되지 않도록 새 `request_company_intro_for_career_v1` RPC로 전환을 명시했다. 기존 과금·의사결정 기록 함수를 호출한 동일 transaction 안에서 추천/목록 저장과 새 immediate run의 Career 계약을 확정한다. 이미 요청된 건은 재전환하지 않는다. `src/lib/org/server.ts`의 새 호출과 회사·JD·관심 이유 context 코드는 로컬 변경이며, 기존 운영 호출은 기존 Worker 전달 경로를 유지한다. 운영의 기존 `request_company_intro_v1`, `request_company_intro_without_billing_v1`, `pass_company_intro_v1` 정의 해시가 적용 전후 동일하고, Career Intro run 수가 0으로 유지된 것을 확인했다.

실제 채팅·이메일 receipt를 기존 전달 ledger와 `candidate_sent_at`, 3/9/18일 후속 연락 일정에 연결했다. 새 함수의 service_role 실행 허용·anon/authenticated 차단, 두 trigger 활성화, 없는 원본 요청의 current 판정 false를 운영 DB에서 확인했다. Security advisor의 신규 항목은 서버 전용 `company_decision_events`의 [RLS enabled/no policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 하나다. 공개 역할 권한을 회수하고 service_role SELECT 및 제한된 기록 함수만 허용하는 의도된 계약이다. 새 WARN/ERROR는 없다.

nullable Role ID를 연봉 채우기 함수에 넘기던 타입 오류를 수정했고 전체 TypeScript 검사를 통과했다. Intro formatter/loader·DB 검증 6개, 관련 기존 전달·DB·recovery 검증 29개가 통과했다. 앞선 원본 모델 실제 입력/출력 검증은 `docs/evaluation/career-daily-processing/results-2026-11-06-company-intro.md`에 있다. 이번 단계는 앱 배포·재시작·실제 후보자 연락을 수행하지 않았으며 새 경로의 운영 실행 완료를 의미하지 않는다. 제품 운영 동작은 아직 바뀌지 않아 Notion 정책 문서는 변경하지 않았다.

## 2026-11-06 회사 검색 점수·검색 인덱스 (운영 DB 적용·웹/Worker 미배포)

사용자의 운영 DB 반영 요청으로 `company_workspace.estimated_search_score` nullable double precision 컬럼과 회사명·LinkedIn URL의 trigram GIN 인덱스 2개를 적용했다. 운영 migration은 `20261106062601` (`company_workspace_estimated_search_score`), `20261106062615` (`company_workspace_search_indexes`)이며 로컬 정본은 각각 `20261106061504_company_workspace_estimated_search_score.sql`, `20261106051550_company_workspace_search_indexes.sql`이다. 운영 컬럼 조회·migration 이력·두 인덱스 valid 상태를 확인했다. 같은 migration을 다시 적용하지 않는다.

기존 회사 정보만으로 `gpt-6-luna` Decisions를 실제 10회 호출하고 결과 10개를 운영 workspace에 저장·재조회했다. 삼성전자·네이버·쿠팡 20, 카카오 19.95, 크래프톤 19.9, 토스 17.8, 당근 16.25, 토스페이먼츠 15.2, 토스랩 9.85, 집토스 8.05. 검색용 인지도·규모 추정이며 회사의 질이나 후보자 적합도 점수가 아니다. 입력 3,539 tokens, 표준 단가 환산 $0.0003539. 기존 test_score 10개는 모두 유지됐다. company_data 내용·캐시 시각은 수정하지 않았다. 원본 입력·응답은 Worker의 ignored `private/company-search-familiar-*.json`에 보존했다.

후속 사용자 요청으로 초기 일괄 채우기 스크립트를 실행해 28,564개 점수를 추가 저장했다. 최종 운영 조회는 총 28,574개·점수 있음 28,574개·누락 0개·범위 밖 점수 0개다. 일시적 HTTP 503 오류 5건은 누락분 재실행으로 모두 성공했다. 전체 기존 test_score 해시와 최초 10개 추정 점수가 실행 전후 동일함을 확인했다.

최초 회사별 개별 저장의 DB 왕복 지연 때문에 해당 로컬 실행을 중단하고, 스크립트를 최대 100개씩 계산·묶음 저장하도록 수정한 뒤 `--workers 20`으로 이어서 실행했다. 기록된 성공 결과의 입력은 10,306,338 tokens, 표준 단가 환산 $1.0306338이다. 최초 실행 중단 시 이미 계산됐지만 로그에 남지 않은 호출은 합산되지 않아 정확한 청구 총액은 아니다. DB commit 직후 로그 전 중단된 1개 행도 최종 DB 조회에 포함해 확인했다. 실행·재시도 로그와 전후 검증은 Worker의 ignored `private/company-search-backfill-20261106/`에 보존했다. company_data 내용·캐시 시각은 수정하지 않았다.

웹·Worker 코드 배포·재시작은 하지 않았다. 운영 DB와 초기 점수 채우기 완료이며, 새 정렬·자동 갱신 코드가 운영 실행 중임을 뜻하지 않는다.

## 2026-11-05 회사 평균 연봉 캐시 (운영 DB 적용·웹/Worker 미배포)

사용자의 회사 평균 연봉 저장 요청으로 운영 migration `20261105061413` (`company_data_estimated_average_salary`)을 적용했다. 로컬 정본은 `supabase/migrations/20261105061148_company_data_estimated_average_salary.sql`이다. `company_data.estimated_average_salary` nullable text 컬럼만 추가했으며 기존 데이터 backfill이나 공고 연봉 변경은 하지 않았다. 운영 컬럼 타입·nullable 여부·migration 이력과 조회 성공을 확인했다. 같은 migration을 다시 적용하지 않는다.

로컬 Worker는 기존 3개월 캐시 갱신 때 투자 정보와 별도로 평균 연봉을 Exa에서 조회한다. 금액·통화·기준 연도·대상 국가/법인·보상 범위와 provider 출처 URL을 텍스트에 보존하고, 원본 결과·grounding은 기존 `source_payload.averageSalary`에 저장한다. 두 검색의 실패는 독립적으로 기존 값을 보존한다. 웹의 공용 연봉 추정과 Ops는 이 값을 `해당 회사 예상 평균 연봉`으로 Decisions 입력에 제공한다. Worker의 공고 연봉 추정도 이 공용 웹 API를 사용한다. 새 값이 없는 기존 회사는 다음 정상 캐시 갱신까지 기존 정보로 추정하며, 이미 저장된 공고 연봉은 일괄 재추정하지 않는다.

Worker 8개·웹 7개 검증이 통과했다. 공개 회사 1곳의 실제 Exa 결과와 이를 넣은 합성 직무의 `gpt-6-luna` Decisions 요청/응답을 확인했다. 이는 입력 연결·응답 계약 확인이며 연봉 정확도 비교 평가가 아니다. 회사 정보 갱신 및 연봉 추정 코드는 웹·Worker 배포 전이므로 운영 자동 실행 완료를 뜻하지 않는다. 이번 작업에서 웹·Worker 배포·재시작·사용자 연락은 하지 않았다.

## 2026-11-05 전체 로컬 코드 운영 배포 (웹·Worker 완료)

사용자의 명시적 커밋·beta/Worker 배포 요청으로 웹의 전체 로컬 소스·테스트·문서 549개 파일을 `a153215ed6437709f6fab61617e42894de7e2aac`, Worker 소스·테스트를 `2f87741c426a99f5b6871a9ab43a33961dbc8838`로 커밋하고 각 origin/main에 fast-forward push했다. 기존의 추적된 Worker Python bytecode 변경은 생성 캐시이므로 소스 커밋에서 제외하고 로컬에 보존했다. DB migration·번역 데이터는 재적용하지 않았다.

웹은 Git-triggered Vercel `dpl_375AtxKrZG9vJkGc2BTTAMzpqH1J`에서 READY를 확인했고 운영 도메인 matchharper.com·app.matchharper.com·www.matchharper.com 연결을 확인했다. 로컬/운영 빌드의 컴파일·타입 검사·448개 페이지 생성이 완료됐다. 홈페이지 200, 새 action-items와 internal Career API의 무인증 401을 확인했다. 후보자별 일일 처리와 예약 병합, 내부 기회 탐색 범위, 홈 행동 목록, 대화 진행·최종 답변 표시와 공통 디자인 변경을 포함한다. 이 문서 동기화의 후속 커밋은 제품 소스를 변경하지 않는다.

Worker는 기존 호스트의 불변 release artifact를 준비하고 해당 release의 handoff 검사 16개를 통과한 뒤, 17:08:45 UTC 이후 opportunity-current를 원자적으로 교체하고 scheduler 하나만 graceful restart했다. scheduler PID 3009741과 새 Worker 슬롯의 cwd·revision이 새 release와 일치한다. 기존 여섯 슬롯에 stop/restart 신호를 보내지 않았고 이전 invocation은 자연 종료했다. 기존 release와 Python 환경은 보존했으며 Restart=no·TimeoutStopUSec=infinity·고정 최대 6개 슬롯 계약을 유지한다. 변경이 없는 다른 Worker 서비스는 재시작하지 않았다. 기록한 기존 handed_off 2건은 전환 후에도 동일 상태이며 배포 때문에 실패로 변경되지 않았다. 새 Worker 로그에서 refill 실패·예외는 관측되지 않았다.

배포 직후 새 웹의 error/fatal 로그는 없었고 실제 고객 발송·지원 제출을 수동으로 발생시키지 않았다. 이는 배포 revision·기본 응답·프로세스 확인이며 다음 오전 9시 일일 실행이나 실제 메일 수신 E2E 완료를 뜻하지 않는다. 운영 반영된 동작을 기준으로 Notion [Career](https://www.notion.so/3b57277d26df81028ccce63a24db9922), [추천](https://www.notion.so/3b57277d26df817aa35cd4fcd3bca0f2), [Role 생명주기](https://www.notion.so/3b57277d26df810997b6e5480848ab87), [회사 제품 종합](https://www.notion.so/3fe7277d26df812dbc7def98e67aa45c)의 영향받는 절·기준일·변경 이력을 갱신했다.

## 2026-11-05 Career 일일 처리·자동 외부 탐색 제한 (운영 DB 적용·웹/Worker 미배포)

사용자의 운영 DB 적용·점검 요청으로 01:49 KST에 `career_daily_processing`(운영 version `20261104164906`)을 적용했다. 로컬 정본은 `supabase/migrations/20261104153622_career_daily_processing.sql`이다. 같은 migration을 다시 적용하지 않는다. 후보자별 비긴급 사건 저장·실행 소유권·발송 영수증, 기존 collector의 후보자별 중복 접수 방지, 외부 탐색 설정의 DB 경계를 준비했다. 자동 check-in의 목적은 외부 탐색으로 좁히고 Stopped 또는 외부 추천 off인 활성 예약 2,876건을 일시 중지했다. 해당 조건의 잔여 활성 자동 예약은 0건이다. 사용자 메시지 참조만으로 일반 프로필 답장을 별도 위임 예약으로 오인하지 않게 했고, 사용자가 직접 작성한 정확한 목적만 별도 예약으로 보존한다.

모든 기존 예약의 ID·주기·반복 정의·다음 시각 해시는 적용 전후 `424ea2c6f36e79f9d65f260f1aa7db1c`로 동일하다. 직접 중지한 예약·별도 예약을 유지했으며, 확인 중 새 가입으로 생긴 자동 예약 1건은 기존 행 비교에서 제외했다. 미전달 talent-first 선정 207건을 사건으로 저장했고 확인 시점 유효한 사건은 196건이다. 무효 사건은 현재 상태 검사에서 제외된다. 새 `career_daily_due` 실행은 0건이다. 과거 거절·종료 전체 backfill, 실제 사용자 연락·LLM 실행 테스트는 하지 않았다.

운영 함수 14개의 본문 정본 일치, SECURITY INVOKER·anon/authenticated 실행 차단·service_role 실행 허용, 새 테이블 RLS·서버 전용 접근, 유효한 index 3개·trigger 4개를 확인했다. Worker invoker trigger에는 필요한 추천 컬럼의 SELECT만 추가했다. 신규 보안 WARN/ERROR는 없고 서버 전용 무정책 RLS INFO 1개만 추가됐다. 적용 직후 16:49~16:53 UTC PostgreSQL 로그의 ERROR/FATAL/PANIC는 0건이다. 영향 경로 검사 묶음 112 pass·0 fail·1 다중 연결 PostgreSQL skip, 이후 전체 예약 검사 51 pass·0 fail·1 skip(일일 DB 21개 포함), Worker handoff 16/16, 최종 전체 TypeScript 검사가 통과했다. 실제 다중 연결 경쟁·실제 수신자 연락은 검증하지 않았다.

기존 웹 호출자와의 마지막 호환성 점검에서 설정으로 중지된 예약을 명시적으로 다시 중지해도 설정 중지 표식이 남는 실패를 재현했다. 새 웹의 보정 로직 대신 예약 쓰기 함수 원본을 수정하고 01:56 KST에 `career_explicit_schedule_pause`(운영 `20261104165630`, 로컬 `supabase/migrations/20261104165800_career_explicit_schedule_pause.sql`)를 적용했다. 함수 본문·SECURITY INVOKER·권한이 검증한 정본과 일치하며 기존 데이터 일괄 변경은 없다. 두 적용 사이 해당 명시적 중지는 0건이었고, 적용 후 부적격 활성 자동 예약도 0건이다. 이 migration도 재적용하지 않는다.

로컬 audit에서는 종료 후 재개·재종료, 발송 중 재개, 자기 실행의 전달 완료, 사건 소유권 이전, 선정 지연·수정, 공개 회사명 차단을 보완했다. 취소된 팔로업의 source 참조를 Worker에서 보존하고, 예약 재조정이 일반 대화 모델로 바뀌지 않도록 수정했다. DB 경계는 운영에 반영됐지만 웹·Worker 수집·병합·source fence·모델 선택·prompt 코드는 미배포다. 기존 운영 웹 revision은 `022eddd9e709cd4188154291143679a7f0d01ef3`이며 push·배포·재시작은 하지 않았다. 자동 점검이 중지된 사용자의 비긴급 사건은 새 코드 배포 전까지 저장만 될 수 있다. 상세는 `docs/career/daily-processing-ko.md`를 따른다.

현재 운영 정책과 미배포 범위를 구분해 Notion [Career](https://www.notion.so/3b57277d26df81028ccce63a24db9922), [추천](https://www.notion.so/3b57277d26df817aa35cd4fcd3bca0f2), [Role·후속 연락 생명주기](https://www.notion.so/3b57277d26df810997b6e5480848ab87)의 해당 절·기준일·변경 이력을 갱신했다.

## 2026-11-04 Career 홈 액션 목록 (운영 DB 적용·웹/Worker 미배포)

사용자의 명시적인 마이그레이션 적용 요청으로 `career_action_items`(운영 version `20261104140800`)를 적용했다. 로컬 정본은 `supabase/migrations/20261104134635_career_action_items.sql`이다. 적용 전 같은 테이블·함수가 없음을 확인했으며 같은 migration을 다시 적용하지 않는다.

제목·설명·버튼·클릭 동작·우선순위·긴급도를 저장하는 목록과 소유권·revision·생성 멱등성 경계의 서버 전용 저장 함수를 추가했다. 운영 함수 본문의 정확한 일치, RLS와 본인 읽기 정책, anon 전체 차단, authenticated 쓰기/RPC 차단, service_role 실행을 확인했다. 보안 advisor의 219개 finding 중 새 테이블·함수 관련 항목은 없다. 목록은 0건이며 사용자 데이터 생성·backfill·작업 접수·지원 제출·연락은 하지 않았다.

웹·Worker 배포와 재시작은 하지 않았다. DB 저장 계약만 선반영했으며 실제 새 할 일 UI·LLM 도구·맥락은 코드 배포가 필요하다. 미배포 제품 동작을 Notion에 live로 기록하지 않았다.

## 2026-11-04 Career 종료 이력 기록 분리 (운영 DB 적용·웹/Worker 미배포)

사용자의 종료 알림용 DB migration 적용 요청으로 `career_opportunity_read_lifecycle`(운영 version `20261104080151`)을 적용했다. 로컬 정본은 `supabase/migrations/20261104071842_career_opportunity_read_lifecycle.sql`이다. 같은 migration을 다시 적용하지 않는다.

내부 Role이 종료 상태로 바뀔 때 응답하지 않았고 숨기지 않은 현재 추천의 기존 종료 활동 이력을 기록한다. 조회에서 이 작업을 제거한 로컬 코드와 연결되는 변경이며 이메일·채팅의 실제 안내 발송을 뜻하지 않는다. 추천 ID에서 얻은 동일한 활동 ID를 새 종료 trigger와 기존 archive RPC가 공유해 구·신 코드 공존 및 재실행 시 종료 이력을 중복 생성하지 않는다. 기존 RPC의 보관 처리와 서버 전용 실행 권한은 유지했다. 새 trigger는 추천 상태를 수정하거나 Talent advisory lock을 획득하지 않는다.

격리된 DB 테스트 4개에서 조회 무쓰기, 종료·재개, 구 RPC와의 중복 방지, 기존 종료 Role의 구 RPC 처리 등을 확인했다. 운영 함수 2개의 본문 hash가 로컬 정본과 일치하고 trigger 활성화, anon/authenticated 실행 차단·service_role 실행 허용을 확인했다. 보안 advisor 219개 항목은 적용 전후 동일하며 신규 항목은 없다. migration에는 기존 데이터 backfill이나 Role 상태 변경이 없으며 실제 후보자 종료·발송 테스트는 수행하지 않았다.

이번 작업에서는 웹·Worker를 배포하거나 재시작하지 않았다. Notion의 역할·후속 연락·인재 상태 문서를 확인했으며 실제 안내 조건·발송 정책 변경 없이 내부 활동 기록 시점을 옮기는 변경이므로 제품 문서는 수정하지 않았다. 로컬의 조회 성능·Working 표시 개선까지 운영 웹에 반영됐다는 의미는 아니다.

## 2026-11-04 회사명 팔로우 저장 (운영 DB 적용·웹/Worker 미배포)

사용자의 명시적인 운영 DB 적용 요청으로 `career_company_name_follows`(운영 version `20261104074256`)를 적용했다. 로컬 정본은 `supabase/migrations/20261104073028_career_company_name_follows.sql`이다. 회사명만 있는 팔로우를 기존 테이블과 쓰기 RPC에서 지원하며, 기존 company/workspace 식별자·소유권·revision·멱등 처리 계약을 유지한다. 같은 migration을 다시 적용하지 않는다.

운영 DB에서 회사명 저장·동일 요청 재실행·동일 이름 중복 방지·지시 수정·오래된 revision 거부·언팔로우를 transaction 안에서 확인하고 전부 rollback했다. 기존 팔로우는 적용 전후 총 65건/활성 58건이며 검증용 잔여 행은 0건이다. RLS, 유효한 unique index, anon/authenticated RPC 실행 차단·service_role 실행 허용을 확인했다. 적용 전후 보안 advisor에서 해당 테이블/RPC 관련 항목은 없다.

로컬 코드는 정기 실행 전 고정 쿼리 웹 검색과 검색 캐시 주입을 제거했다. 원본 Career LLM에 회사명·사용자 지시·팔로우 시점을 전달하고 기존 workspace 공고 조회·평가는 유지한다. 웹/Worker 배포·재시작·실제 사용자 연락은 하지 않았으므로, 사전 검색 제거가 운영 코드에 반영됐다는 의미는 아니다. Notion 동기화 범위를 검토했으며 DB 저장 계약 선반영만으로 새 제품 동작 전체가 제공되는 것은 아니므로 제품 문서는 변경하지 않았다.

## 2026-11-04 내부 기회 평가 비공개·대기 요청 취소 (운영 DB 적용·웹/Worker 미배포)

사용자의 운영 DB 반영 요청으로 `career_internal_opportunity_publication`(운영 version `20261104065855`)과 `career_pending_reply_cancellation`(`20261104065904`)을 적용했다. 로컬 정본은 각각 `supabase/migrations/20261104062544_career_internal_opportunity_publication.sql`, `supabase/migrations/20261104063319_career_pending_reply_cancellation.sql`이다. 적용 전 기존 함수 두 개의 본문이 직전 정본과 같고 신규 취소 함수가 없음을 확인했다. 두 migration을 다시 적용하지 않는다.

`write_career_opportunities`는 공개·소유권·차단·test-only 경계를 유지하면서 내부 기회를 평가 ID 없이 저장할 수 있다. `complete_career_follow_evaluation`은 내부 평가 후속 실행에 평가 ID·결과를 넣지 않는다. `cancel_career_pending_reply`는 소유자·checkpoint 버전을 검증하고 해당 대기 응답만 종료하며 정리 작업을 접수한다. 이 적용에서 기존 요청을 실제 취소하거나 고객 데이터를 이관하지 않았다.

운영 함수 3개의 본문이 로컬 정본과 일치하고 SECURITY INVOKER·빈 search_path·anon/authenticated 실행 차단·service_role 실행 허용을 확인했다. 팔로우 완료 함수의 기존 harper_worker 실행 권한도 유지한다. service_role로 없는 사용자/대화의 실행 거부와 빈 팔로우 입력의 무작업 종료를 검증한 뒤 transaction rollback했다. 보안 advisor는 관측 시각을 제외한 기존 219개 항목과 동일하며 신규 항목은 없다.

웹·Worker 코드 배포·재시작·실제 소개/연락은 하지 않았다. 내부 평가의 LLM 입력 제거와 일반 도구를 통한 대기 요청 취소의 전체 동작은 후속 코드 배포가 필요하다. Notion 동기화 범위를 검토했으며 이번 DB 준비만으로 새 사용자 기능 전체가 제공되는 것은 아니므로 제품 문서를 변경하지 않았다.

## 2026-11-04 로컬 변경 업로드 전 DB 보완 (웹·Worker 미배포)

사용자의 배포 전 운영 DB 준비 요청에 따라 실제 함수·index와 migration 이력을 먼저 대조했다. 미반영된 로컬 `20261029090000_reuse_active_company_search`, `20261029094911_company_chat_multiple_progress_messages`, `20261104025349_career_conversation_input_batching`, `20261104033157_career_conversation_stop`을 하나의 원자적 migration `career_inbox_stop_and_company_chat_release`(운영 version `20261104035457`)로 적용했다. 동일 검색 접수 재사용, 회사 채팅 progress 메시지의 sequence별 중복 방지, Career pending 입력 일괄 접수·전체 중단의 DB 실행 계약이다. 이 네 파일을 다시 적용하지 않는다.

관련 최신 함수 89개의 본문 hash가 로컬 정본과 일치한다. 이번에 변경·추가한 함수 14개는 anon/authenticated 실행 차단, service_role 실행 허용, security invoker를 유지한다. 새 메시지 unique index와 중단 입력 guard trigger를 확인했고, 보안 advisor는 적용 전후 동일하다. 회사 DB 경계 테스트 2개를 통과했다. 적용 전후 미완료 Career invocation은 0건이며 운영 작업 접수·중단·발송 테스트는 하지 않았다.

웹·Worker 배포와 서버 재시작은 하지 않았다. 기존 계정 Career 일정 이관은 Worker 전환 시점에 `harper_worker/docs/career-agent-cutover.md`에 따라 수행한다. DB 준비만 완료한 기록이며 새 웹 UI·Worker 동작이 운영에 반영됐다는 의미가 아니다. Notion에 미배포 동작을 반영하지 않았다.

## 2026-11-04 Career 가이드 만료 수정 (운영 DB 적용·웹/Worker 미배포)

사용자의 data migration 제외 운영 DB 적용 승인으로 `career_handbook_version_consumption`(운영 version `20261104024944`, 로컬 정본 `supabase/migrations/20261104024605_career_handbook_version_consumption.sql`)을 적용했다. `consume_career_agent_handbooks` 함수 1개만 교체했다. 가이드 본문 version이 바뀌어도 실제 제공한 stable ID의 남은 횟수를 차감하며, 기존 reply claim·완료 ID에 의한 중복 방지는 유지한다. 같은 migration을 재적용하지 않는다.

운영 함수의 읽기 전용 합성 입력으로 구버전 lease가 새 버전 제공 후 2→1→만료됨을 확인했다. anon/authenticated 실행 차단·service_role 실행 허용도 유지되며 해당 함수의 security advisory는 없다. 고객 데이터 이관·일괄 갱신은 없고, 기존 lease는 이후 정상 답변 완료 시 소진된다. 웹/Worker 배포·재시작은 하지 않았으므로 로컬 bubble 지침 변경은 아직 운영 미반영이다. 내부 가이드 사용 횟수 오류 수정으로 새 기능·요금·정책 변경은 없어 Notion 동기화 대상은 없다.

## 2026-11-04 배포 전 점검·DB 준비 (운영 DB 적용·웹/Worker 미배포)

사용자의 운영 DB 반영·추가 수정 요청으로 실제 운영 정의를 대조하고 `career_offer_agent_introductions_concurrent_work`(운영 version `20261103235538`, UTC)를 적용했다. 로컬 정본은 `20261103083918_career_opportunity_offer_stage.sql`, `20261103125705_internal_role_agent_introductions.sql`, `20261103125930_career_concurrent_work.sql`이다. Offer 저장 단계, agent 간 소개 원장·회사 일정, Career 동시 작업의 접수·claim·동시 수정·효과 멱등 경계를 준비했다. 세 migration을 하나의 transaction으로 적용했으며 **같은 migration을 재적용하지 않는다.**

적용 후 함수 23개의 본문 해시가 로컬 정본과 일치하고 anon/authenticated 실행 차단·service_role 실행 권한을 확인했다. 새 테이블 3개는 RLS와 서버 전용 접근을 유지한다. 신규 보안 WARN/ERROR는 없으며 서버 전용 무정책 RLS 안내(INFO) 3건만 추가됐다. 기존 소개의 legacy 처리 계약은 유지하며 새 agent 소유 소개는 구 Worker에서 제외한다. 고객 데이터 backfill·일정 이관·실제 연락·웹/Worker 배포·재시작은 하지 않았다.

로컬에서는 이메일 queue route의 Next Request 타입 오류와 Gmail 도구의 query/thread_id 누락 입력 계약을 수정했다. 바뀐 도구·일반 대화·동시 작업·현재 UI에 맞춰 실패 테스트를 정비했으며, 제거된 priority-review/instant-bulk 도구나 지원 준비 전용 모드를 복원하지 않았다. 최초 실패한 웹 26개 파일의 재검증은 102 pass·0 fail·1 opt-in PDF/browser skip이며, 소개 동의 modal도 별도로 통과했다. 내부 소개의 실제 로컬 DB rollback 통합 검증, Career 동시 작업·Offer·내부 평가 DB 검증 15개, 내부 지원 도구 9개, Worker 핵심 42개(그중 scheduled runner 18개, 추가 subtest 5개) 및 별도 PostgreSQL 17 검증 13개가 통과했다. 최종 운영 빌드는 컴파일·Next 타입 검사·444개 페이지 생성을 포함해 성공했고 변경한 제품 경로의 lint도 통과했다. 빌드 전후 제품 소스 지문이 같음을 확인하고 검사 전용 빌드 디렉터리·tsconfig 추가 항목을 작업 트리에서 정리했다. 실제 운영 LLM·수신자 메일 발송 E2E를 수행했다는 뜻은 아니다.

변경된 Career 문구 23개를 직접 영어로 작성해 한·영 번역 DB에 동기화했다. 프로필 비공개를 모든 외부 추천의 중단으로 설명하던 문구와 소개 수락을 즉시 연결 완료로 설명하던 문구도 실제 계약에 맞췄다. 제품 번역 1,738개 키 검사가 통과했다. 개발 도구·합성 preview 9개 파일은 명시적인 `career-i18n-skip-file`로 제외하고 다른 namespace의 `orgT` 문구를 Career 미번역으로 잘못 검사하던 부분을 수정했다. 새 제품 동작이나 운영 정책 전환은 없으므로 Notion에는 미배포 기능을 live로 기록하지 않았다.

출시 때는 웹의 새 endpoint/queue consumer가 준비된 다음 Worker scheduler 전환과 기존 계정 일정 이관을 함께 처리해야 한다. 점검 당시 온보딩 완료 계정 5,490개에 `career_check_in`이 없었다. 이 상태에서 새 scheduler만 배포하면 기존 계정의 정기 점검이 누락될 수 있다. `scripts/transition-career-agent-schedules.ts`의 dry-run 후 적용하고 `skippedActiveLegacy`는 기존 실행 완료 후 다시 처리한다. 현재 이관 RPC는 adaptive check-in을 생성/계승하며 예전 다음 시각을 일회성 review로 그대로 복사하지 않는다. Worker `docs/career-agent-cutover.md`를 현재 구현에 맞췄다. 이번 점검에서는 이관을 실행하지 않았다.

## 2026-11-03 Career 일정·팔로우 준비 누락 보완 (운영 DB 적용·웹/Worker 미배포)

사용자의 기존 계정·로컬 웹/Worker 테스트 중 발견한 DB 누락 수정 요청으로 `career_adaptive_check_in`(운영 `20261103052417`)과 `career_follow_preparation`(`20261103052423`)을 적용했다. 로컬 정본은 `supabase/migrations/20261102064501_career_adaptive_check_in.sql`과 `20261102080129_career_follow_preparation.sql`이다. 일정 변경 작업 식별자·체크인 필드/함수 및 팔로우 준비 캐시/claim 함수를 보완했다. 기존 일정 2건은 새 필드를 제외한 전체 행 해시가 보존됐고, service_role의 일정 변경·취소 및 없는 팔로우 claim 검증은 transaction rollback했다. 보안 점검의 신규 항목은 없다.

로컬에서 대상 계정의 일정 목록 조회, 열린 포지션을 지칭한 대화, 문서 카드 미리보기를 확인했다. 일정 조회의 기존 ensure 경로가 대상 계정의 체크인 1건을 생성했으며 전체 사용자 backfill이나 일괄 큐잉은 실행하지 않았다. 오류 안내/다시 불러오기 번역은 이번에 추가한 `career.automation.load_failed`, `career.automation.update_failed`, `career.automation.retry`의 한국어·영어 6행만 DB에 반영했다. 웹·Worker 배포·운영 재시작은 하지 않았으며 로컬 UX/맥락 수정은 운영 반영으로 간주하지 않는다. 같은 migration을 재적용하지 않는다.

## 2026-11-02 첫 온보딩 추천 가이드 (운영 DB 적용·웹/Worker 미배포)

사용자 요청으로 운영 migration `20261102090811` (`career_initial_recommendation_guidance`)을 적용했다. 로컬 정본은 `supabase/migrations/20261102090650_career_initial_recommendation_guidance.sql`이다. `enqueue_career_onboarding_invocation`의 새 실행 지침에 신규 가입자가 첫 온보딩을 마쳤다는 맥락과, 적합한 기회가 충분할 때 10~15개를 참고 범위로 삼도록 안내했다. 최소·최대·할당량으로 강제하지 않고 목표·선호·실제 유용성에 따라 더 적거나 많게 추천하도록 한다. 기존 원본 migration은 적용 당시 지침을 유지하고 변경은 별도 migration에만 둔다.

적용 전 운영 함수가 기존 정본과 같음을 확인했다. 격리 DB에서 새 migration 적용 후 실제 생성 지침의 모델 입력 전달, 고정 개수 미지정, 기존 실행 보존, 중복 생성 방지와 타인 대화 차단을 확인했다. 운영 함수 본문 MD5 `777003a642ece4a09e12b96921c19e81`은 검증한 로컬 정본과 같으며 SECURITY INVOKER·service_role 전용 실행 권한을 유지한다. 보안 점검의 신규 항목은 없다.

기존 운영 실행 재작성·추천 생성·메일 발송·웹/Worker 배포·재시작은 하지 않았다. 새 Career agent 경로의 DB 준비이며 기존 운영 첫 추천 경로를 전환한 것은 아니다. Notion 추천 방식 문서를 확인했고 현재 제공되는 추천 동작은 바뀌지 않아 제품 문서는 변경하지 않았다. 같은 migration을 재적용하지 않는다.

## 2026-11-02 Career 실제 일정 (운영 DB 적용·웹/Worker 미배포)

사용자의 운영 DB 적용 요청으로 `career_meeting_schedules`(운영 `20261102090009`)와 `career_meeting_delivery_admission`(`20261102090014`)을 적용했다. 로컬 정본은 각각 `supabase/migrations/20261102081607_career_meeting_schedules.sql`과 `20261102084400_career_meeting_delivery_admission.sql`이다. 기존 `meeting_schedules`에 일정 출처·내용·시간대·원문 참조를 추가하고 외부 일정의 회사 캘린더/초대/후속 처리 차단, 서버 전용 일정 쓰기 함수, 이메일 발송 직전 일정 소유자·버전 검사를 설치했다.

적용 전 운영 발송 함수가 기존 정본과 같음을 확인했다. 적용 후 함수 2개 본문 정본 일치, 제약조건·index·트리거 4개, RLS·서버 전용 권한·기존 Worker 읽기 권한을 확인했다. 기존 일정 2건은 추가 필드를 제외한 전체 행 해시가 보존됐으며 모두 `harper` 기본값을 가진다. 실제 운영 PostgREST에서 제품 reader의 Role/Calendar 연결 조회와 익명 접근 차단, 유효하지 않은 사용자/없는 발송 건의 실행 거부를 확인했다. 보안 점검의 신규 항목은 없고 대상 테이블에는 기존 서버 전용 무정책 RLS 안내(INFO)만 있다. 상세는 `docs/evaluation/career-meeting-schedules/retest-2026-11-02.md`의 운영 DB 적용 절을 따른다.

웹·Worker 배포, 번역 DB 동기화, 일정 생성·변경, 이메일/캘린더 발송은 하지 않았다. Gmail 기본 조회·72시간 context·일정 UI를 운영 기능으로 간주하지 않는다. Notion 동기화 범위를 검토했으며 이번 DB 선반영으로 새롭게 제공되는 팀원 대상 기능/운영 정책은 없어 제품 문서를 변경하지 않았다. 같은 migration을 재적용하지 않는다.

## 2026-11-01 랜딩 통계 일일 스냅샷 (운영 DB 적용·웹 미배포)

사용자 요청으로 운영 migration `20261101043117` (`company_landing_daily_snapshot`)을 적용했다. 로컬 정본은 `harper_beta/supabase/migrations/20261101042259_company_landing_daily_snapshot.sql`이다. `public.company_landing_stats`의 `current` 한 행을 실제 집계로 초기화했고, `refresh_company_landing_stats()`와 매일 한국 시간 오전 5시의 `company-landing-stats-daily` 작업(`cron.job.jobid=2`, GMT `0 20 * * *`, owner `postgres`)을 등록했다. 함수 본문 MD5 정본 일치, SECURITY INVOKER, RLS, service_role SELECT만 허용, anon/authenticated 읽기·함수 실행 차단과 실제 웹 reader의 운영 행 조회를 확인했다. 신규 테이블의 무정책 RLS 안내(INFO) 외 해당 객체 WARN/ERROR는 없다. 웹·Worker 배포·재시작은 없으며 기존 웹의 5분 집계·숫자 증가 표시는 후속 웹 배포 전까지 유지된다. 같은 migration과 초기 집계를 다시 실행하지 않는다.

## 출처: `harper_beta/AGENTS.md`

- 2026-10-30 Career agentic 운영 DB 반영 완료(웹·Worker 미배포): 사용자 요청으로 `career_profile_versions_and_role_materials`(운영 `20261030045029`), `career_company_follows_and_schedules`(`20261030045050`), `career_matching_workspaces`(`20261030045053`), `career_background_agent_delivery`(`20261030045204`), `career_feedback_event_idempotency`(`20261030045210`), `career_agent_worker_access`(`20261030045500`)를 적용했다. 로컬 정본은 각각 `20261029182857`, `20261029182909`, `20261029183004`, `20261029215555`, `20261030041000`, `20261030045410` migration이다. 기존 추천 214,203건의 membership 누락 0건, 대상 추천 36건의 기존 필드 해시 보존, 기존 팔로우 54건 범위 보존을 확인했다. 함수 45개 본문·권한과 새 테이블 9개 RLS, Career 목록/건수·회사 보드/상세·Worker 읽기 권한을 확인했다. 첫 시도는 Worker 조회 잠금으로 롤백됐고 정상 종료 후 적용했다. 스케줄 이관·추천 생성·연락·웹/Worker 배포는 하지 않았다. 상세는 `docs/career-agentic-runtime-and-opportunity-plan-ko.md` 23절. 같은 migration을 재적용하지 않는다.

- 2026-10-30 Career 범용 도구 DB 반영(웹·Worker 미배포): 사용자 요청으로 운영 migration `20261029163255` (`career_general_agent_runtime`)를 적용했다. 로컬 정본도 `supabase/migrations/20261029163255_career_general_agent_runtime.sql`이다. 서버 전용 `talent_agent_runtime`·`talent_external_operations`, form revision/응답 멱등 index, 실행·handbook·checkpoint 복구 함수, email completion trigger를 설치하고 구 `guard_application_coaching_mode` trigger를 제거했다. 테이블 2개 RLS·함수 9개 service_role 전용 권한·번역 15개 키 한/영 30행을 확인했다. 신규 객체의 무정책 RLS 안내(INFO) 2건 외 해당 객체 WARN/ERROR는 없다. 초기 연결 timeout 뒤 복구 후 적용했으며 동일 migration을 재적용하지 않는다. 기존 지원 이력 backfill·고객 지원 제출·메일 발송·웹/Worker 배포는 하지 않았다. 범용 도구·Decisions·handbook·UI 코드는 로컬 구현 상태다.

- 2026-10-29 Apply with Harper 공고 조사 결과 운영 DB 복사(웹 미배포): 사용자 요청으로 운영 migration `20261029063452`(`shared_role_application_inspections`)를 적용했다. 로컬 정본은 `supabase/migrations/20261029061615_shared_role_application_inspections.sql`이다. `role_application_inspections`에 공고 공통 조사 결과 501건을 복사했고, 기존 `talent_simulate_application` 529건은 payload·revision·시각을 포함한 전체 행 해시가 적용 전후 동일하다. 이관은 복사만 수행하며 원본의 form·URL 삭제나 참조 ID 치환은 하지 않는다. 새 테이블의 RLS·service_role 조회/삽입 권한·anon/authenticated 차단을 확인했다. 서버 전용 무정책 RLS 안내(INFO) 1건 외 신규 보안 경고/오류는 없다. 웹·Worker 배포, 실제 지원·발송은 하지 않았으며 같은 migration을 재적용하지 않는다.

- 2026-10-29 배포 전 운영 DB 반영: `20261029040648`(`refresh_stale_external_role_summaries`)와 `20261029045549`(`canonical_role_brief_scheduled_matching`)를 적용했다. 로컬 정본은 각각 `20261029021156`·`20261028070450` migration이다. 외부 공고 요약의 원본/버전 변경 갱신, internal Role의 단일 Brief 원본과 검색 접수, legacy request 동기화 제거를 반영했다. 함수 8개 본문·권한·관련 트리거 일치와 신규 security advisory 없음을 확인했다. 최초 Brief 적용 두 시도는 수집 작업의 잠금으로 롤백됐고 잠금 해제 후 적용했다. 고객 데이터 backfill·검색 재접수·재발송은 없으며 같은 migration을 재적용하지 않는다.

- 2026-10-28 추천 수정 시각 검사 제거 운영 DB 적용: 사용자 요청으로 migration `20261028053203`(`remove_recommendation_timestamp_conflicts`)을 적용했다. 로컬 정본은 `supabase/migrations/20261028051955_remove_recommendation_timestamp_conflicts.sql`이다. 추천 수락·회사 Intro 응답·feedback 변경 RPC 3개의 `p_expected_updated_at` 비교만 제거했다. 구 호출자 호환 인자는 유지하며 소유권·행 잠금·기존 결정 실행·동의·서버 전용 권한은 보존했다. 함수 본문 정본 일치·권한 보존·신규 security advisory 없음과 로컬 DB에서 오래된 시각 허용/타인 추천 차단을 확인했다. 기존 고객 선택 재실행·발송·웹/Worker 배포는 하지 않았다. 같은 migration을 재적용하지 않는다.

- 2026-10-27 이메일 지원 준비 중복 기준 DB 선반영(웹·Worker 미배포): 사용자 요청으로 운영 migration `20261027112509`(`application_start_work_identity`)를 적용했다. 로컬 정본은 `supabase/migrations/20261027113000_application_start_work_identity.sql`이다. `talent_simulate_application`의 원본 메시지 단독 UNIQUE를 원본 메시지·공고·선택 이력서 조합 UNIQUE로 바꾸고 `write_application_activity`의 기존 작업 조회에 같은 조건을 추가했다. 운영 함수는 최초 activity store + email start와 일치하며 질문 소개 메시지 저장 루프가 남아 있음을 확인했고, 그 동작은 보존했다. 적용 후 함수 전체가 의도한 조건 변경과 일치하고 기존 438건(활성 129건)의 전체 행 해시·RLS·서버 전용 실행 권한·코칭 보호 트리거·활성 대화 단일 작업 index가 보존됐으며 신규 security advisory는 없다. 실제 지원·메일 발송·모델/브라우저 테스트·웹/Worker 배포는 하지 않았다. 이메일 작성·부분 저장·재확인 등 로컬 코드 변경은 미배포이며 같은 migration을 재적용하지 않는다.

- 2026-10-27 기존 활성 Free Role 보존 운영 DB 적용(웹·Worker 미배포): 신규 시작·재개·만료 복구에만 활성 용량을 검사한다. 기존 활성 Role은 개수 초과 상태에서도 조회·저장·슬롯 재배정·슬롯 만료로 자동 중지하지 않는다. 정본 `supabase/migrations/20261027085423_preserve_active_roles_on_billing_reconcile.sql`은 기존 함수 3개만 교체하며 데이터 backfill·웹/Worker 배포는 없다. 사용자 승인으로 운영 migration `20261027090731`을 적용했고 함수 3개 본문 일치, 내부 Role 93개(활성 상태 35개)의 상태·만료 정보 해시 보존, 신규 security advisory 없음을 확인했다. 같은 migration을 재적용하지 않는다. 아래 과거 자동 중지 기록은 당시 동작이다.

- 2026-10-27 Free 추천·연결 및 공용 3 Intro DB 선반영(웹·Worker 미배포): 사용자 승인으로 운영 migration `20261027083407` (`free_role_matching_and_three_intros`)을 적용했다. 로컬 정본은 `harper_beta/supabase/migrations/20261027074848_free_role_matching_and_three_intros.sql`이다. 기존 함수 9개의 유료 전용 조건·공용 제공량과 첫 활성화 저장 요일 예외를 변경하고, 표준 공용 현재·미래 기간 2건을 제공량/잔액 3으로 맞췄다. 적용 전 운영 함수와 직전 migration 정본 10개(활성화 helper 포함)를 대조했으며 적용 후 변경 함수 9개 본문 일치·anon/authenticated 차단·service_role 허용을 확인했다. 기존 사용 이력·슬롯·과거 및 별도 계약 기간의 해시가 보존됐고 신규 security advisory는 없다. 실제 추천·연락·웹·Worker 배포·FAQ 검색 데이터 갱신은 하지 않았다. 기존 로컬 미적용 기록보다 이 후속 상태가 우선하며 같은 migration을 재적용하지 않는다.

- 2026-10-27 Free 기능 확대 로컬 변경·미배포: 슬롯 없는 활성 Role도 talent-first 추천·연결 대기·연결 수락을 지원하고 공용 Intro는 월 3개로 변경한다. 활성 Free Role 1개·슬롯별 월 50 Intro·별도 계약·동의/공유/test-only 경계는 유지한다. 새 migration `20261027074848_free_role_matching_and_three_intros.sql`은 운영 미적용이다. 아래 과거 10 Intro·유료 전용 기록은 당시 사실이며 현재 로컬 정책이 아니다.

- 2026-10-27 슬롯 구매 후 역할 배정 DB 선반영(웹 미배포): 사용자 승인으로 운영 migration `20261027075313`(`choose_role_after_slot_purchase`), `20261027075942`(`preserve_slot_assignment_choice_capacity`)를 적용했다. 로컬 정본은 `supabase/migrations/20261027072209_choose_role_after_slot_purchase.sql`, `20261027075814_preserve_slot_assignment_choice_capacity.sql`이다. 슬롯 없는 활성 Free Role 1개는 자동 배정하고 2개 이상은 기존 활성 용량 안에서 선택을 유지한다. 역할 3개 이상을 차례로 배정해도 남은 빈 슬롯을 용량에 포함하며 실제 채용 시작·재개와 슬롯 만료 복구는 기존 자동 배정을 유지한다. 세 함수의 본문 정본 일치·서버 전용 권한·기존 트리거 유지·신규 security advisory 없음을 확인했다. 기존 슬롯·Intro 데이터 backfill은 없으며 웹 결제 확인 응답과 역할 선택 모달은 아직 미배포다. 같은 migration을 재적용하지 않는다.

- 2026-10-27 Free Role Run Search DB 선반영(웹·Worker 미배포): 사용자 요청으로 운영 migration `20261027074326`(`free_role_company_agentic_search`)을 적용했다. 로컬 정본은 `supabase/migrations/20261027072006_free_role_company_agentic_search.sql`이다. `enqueue_company_agentic_search_v1`의 회사측 평가/발행 접수를 free·paid 공통으로 열었으며 기존 Owner/Admin·Role 접근·활성/만료·Brief·test-only·멱등 경계는 보존했다. 함수 본문 정본 일치·SECURITY INVOKER·anon/authenticated 실행 차단·service_role 실행 권한과 신규 security advisory 없음을 확인했다. Worker의 같은 유료 제한 해제는 로컬 수정 상태이며 배포 전 전체 기능이 live라고 안내하지 않는다. 운영 검색 재접수·후보 등록·연락·서비스 재시작은 하지 않았다. 후속 배포에서 같은 migration을 재적용하지 않는다.

- 2026-10-26 Slack 미연결 Role 이메일 대체 DB 선반영(웹·Worker 미배포): 사용자 승인으로 운영 migration `20261026054701`(`company_candidate_email_without_slack`)을 적용했다. 로컬 정본은 `supabase/migrations/20261026054133_company_candidate_email_without_slack.sql`이다. 활성 integration·같은 Slack team의 enabled 채널·Role opt-out을 확인해 전달 가능한 채널이 없으면 기존 `email_notifications_enabled=false`여도 이메일을 허용한다. 검색·발송 직전 검사와 Slack 연결 안내 대상 조회가 같은 조건을 사용하며 담당자·Owner 수신 권한과 개인 수신 거부는 유지한다. 기존 함수 5개의 운영 본문을 사전 대조했고 새 helper 포함 6개 본문 일치·서버 전용 권한·신규 security advisory 없음을 검증했다. 적용 직후 86개 Role의 저장된 메일 설정은 모두 false로 보존됐고 이메일 outbox·버튼 링크는 0건이다. 웹·Worker 배포와 실제 자동 발송은 별도이며 과거 후보 재발송·데이터 backfill·서비스 재시작은 하지 않았다. 같은 migration을 다시 적용하지 않는다.

- 2026-10-26 정기 검색 기본 경로 변경(미배포): `COMPANY_SCHEDULED_AGENTIC_MATCHING`에 따른 웹 접수 차단과 Worker 경로 분기를 제거했다. 새 정기 검색과 Role 활성화 첫 검색은 설정 유무/값과 무관하게 변경된 공통 경로를 사용한다. 아래 과거의 `true` 전환 필요 기록은 이 로컬 변경으로 대체된다. 웹 endpoint를 먼저 배포한 뒤 Worker를 전환하며 기존 인증·권한·일정·중복 방지·실행 중 작업 보존은 유지한다. 환경변수 변경이나 새 migration은 필요하지 않다.

- 2026-10-26 온보딩·정기 Role 검색 평가 원장 통합 DB 선반영(웹·Worker 미배포): 사용자 승인으로 운영 migration `20261026052249`(`shared_worker_role_evaluations`)를 적용했다. 로컬 정본은 `supabase/migrations/20261026051109_shared_worker_role_evaluations.sql`이다. `company_role_candidate_evaluations.run_id`를 nullable로 바꾸고 Opportunity 생산 실행을 가리키는 `discovery_run_id` FK와 재시도·공통 조회 index를 추가했다. 기존 행 2,318건은 보존했으며 적용 직후 새 `worker_behavior_v1`/Opportunity 생산 행은 0건이다. 후보자 전달 guard는 회사 검색과 온보딩 선정 모두의 정확한 공통 평가 행을 확인한다. 함수 본문 정본 일치·SECURITY INVOKER·서버 전용 권한·RLS 유지와 신규 security advisory 없음을 확인했다. 로컬 Worker는 동일한 전체 입력·fingerprint·Decisions evaluator·원장을 양방향 재사용하며, 신규 온보딩 평가는 `talent_opportunity_fit`에 쓰지 않는다. 코드 배포·기능 설정 변경·기존 평가 backfill·실제 연락은 하지 않았다. 같은 migration을 재적용하지 않는다.

- 2026-10-26 후보자 연락 주기 DB 선반영(웹·Worker 미배포): 사용자 승인으로 운영 migration `20261026044735`(`candidate_contact_cadence`)를 적용했다. 로컬 정본은 `supabase/migrations/20261026034255_candidate_contact_cadence.sql`이다. `scheduled_candidate_delivery_is_current_v1`과 `talent_first_pair_is_available_v1` 두 함수만 교체했고 본문 정본 일치·SECURITY INVOKER·anon/authenticated 실행 차단·service_role 실행 권한을 확인했다. 신규 테이블·데이터 backfill·추천 생성·발송·서비스 재시작은 없다. 적용 당시 `worker_behavior_v1` 선정 review는 0건이다. 후보자 주기·Memory 판단·비추천 종료의 전체 동작은 후속 Worker 반영과 신규 검색 활성화가 필요하며 DB 적용만으로 live라고 보지 않는다. 같은 migration을 재적용하지 않는다.

- 2026-10-26 배포 전 DB 보완(웹·Worker 미배포): 운영 실제 정의를 대조하고 `20261026013436`(reopen_company_intro_only_this_ending), `20261026013702`(matching_review_evaluation_reference), `20261026013714`(company_evaluation_input_contract), `20261026013716`(scheduled_agentic_and_immediate_role_matching), `20261026013901`(opportunity_fit_decisions)을 적용했다. 로컬 정본은 `20261023000100`·`20261023000200`, `20261023102919`, `20261025061447`, `20261026001247` migration이다. 운영에 없는 `slack_notifications_enabled`를 새로 만들지 않고 기존 채널 활성·Role별 opt-out과 이메일 수신 계약을 사용하도록 정본을 수정했으며, Decisions 우선 검토 함수의 기존 paid Role 경계를 보존했다. 새 칼럼 3개, 함수 17개의 본문 일치·서버 전용 실행 권한·트리거를 확인했다. 잠금/정의 오류로 실패한 시도는 롤백됐으며 이력 번호가 다른 파일을 일괄 재적용하지 않는다. 기존 후보·검색 backfill·발송·서비스 재시작은 하지 않았다. Role 재개 시 미전달 제안 복원과 신규 활성화 검색 즉시 등록은 DB에서 적용됐지만, 새 대화 기반 검색은 웹/Worker 배포와 `COMPANY_SCHEDULED_AGENTIC_MATCHING=true` 전환이 필요하다. 점검 당시 운영 위치/프로필 chunk 캐시는 0건이고 `harper-role-start-refresh.timer`는 미설치다. 캐시 초기 준비·갱신 서비스 설치는 아직 수행하지 않았다.

- 2026-10-25 역할 채용 온보딩 DB 선반영: 사용자 승인으로 운영 migration `20261025092416`(`role_start_existing_brief_history`)을 적용했다. 로컬 정본은 `supabase/migrations/20261025091944_role_start_existing_brief_history.sql`이다. `company_role_start_sessions`, `company_role_start_pools`, `talent_location_facets`, `talent_profile_chunk_embeddings`, `job_title_embeddings` 5개 테이블의 RLS·서버 전용 권한을 확인했다. 별도 `company_role_brief_versions`는 만들지 않는다. 저장된 Brief는 기존 `company_internal_roles`·`company_role_hiring_brief_history`와 `company_role_search_brief_version_v1` 해시를 재사용하고 온보딩 작업 중 초안은 session에만 둔다. 적용 직후 5개 테이블은 0건이며 캐시 backfill·실제 검색·연락·웹/Worker 배포는 하지 않았다. 앞선 `20261023000300`~`20261023000900`의 온보딩 schema를 포함하므로 일괄 재적용하지 않는다.

- 2026-10-23 후보 소개 이메일 DB 선반영: 사용자 승인으로 운영 migration `20261023133456`(`company_candidate_email`)을 적용했다. 로컬 정본은 `supabase/migrations/20261023133155_company_candidate_email.sql`이며 PR #194의 `20261023001000_company_candidate_email.sql`을 대체한다. 두 migration을 중복 적용하지 않는다. 역할별 이메일 설정, 이메일 전달 구분·중복 방지, 수신 권한 조회, 버튼 토큰·처리 결과 저장 및 서버 전용 RPC를 추가했다. 팀별 접근 권한과 메일에 포함된 모든 Role의 수신 자격을 확인하며 action/channel 값 목록 CHECK는 두지 않는다. 적용 시 기존 Slack outbox 96건의 전달 판단·기존 연결 안내 메일 조회/내용·후보 평가 테이블 구조가 동일함을 같은 transaction에서 확인했다. 새 함수 6개의 정본·서버 전용 권한, 예약 멱등·수신 비활성 차단·run 소유권을 검증했고 검증용 쓰기는 rollback했다. 80개 Role 모두 이메일 비활성, 새 후보 메일·버튼 링크는 0건이다. 웹·Worker는 배포하지 않았으며 실제 작동하는 버튼 포함 메일도 아직 발송하지 않았다. 이후 웹 통합 시 수신자별 접근 가능한 Role/후보만 묶어야 한다(PR #194 원본의 전체 Role 합본은 DB에서 차단됨). PR #193의 `company_role_candidate_evaluations` 동일 이름/다른 구조 충돌은 해결하거나 적용하지 않았으므로 기존 평가 원장을 덮어쓰지 않는다. DB 준비만으로 이메일 기능 전체가 live라고 기록하지 않는다.

- 2026-10-22 공고 재저장 진행 상태 보존 DB 선반영: 사용자 승인으로 운영 migration `20261022142740`(`preserve_job_link_import_progress`)를 적용했다. 로컬 정본은 `supabase/migrations/20261022132918_preserve_job_link_import_progress.sql`이다. `import_talent_job_link`에 선택적 `p_preserve_existing_progress` 인자와 실제 `saved_stage` 반환을 추가했다. 보존 옵션 사용 시 기존 저장·지원 진행 상태와 피드백·시각을 유지하며, 기본값 `false`로 기존 6인자 호출과 History의 명시적 단계 변경을 유지한다. 운영 함수 정본 일치·기존 호출 해석·service_role 전용 실행을 확인했다. 실제 후보자·공고 데이터 수정이나 테스트 데이터 생성은 없었다. 웹은 미배포이며 새 저장 도구의 보존 옵션 사용 및 일반 문서 PDF 지원 첨부 변경은 아직 live가 아니다. 같은 migration을 재적용하지 않는다.

- 2026-10-22 검색 통계 출처 DB 보완: 운영 migration `20261022131045`(`company_search_inventory_provenance`)를 적용했다. 로컬 정본은 `supabase/migrations/20261022131500_company_search_inventory_provenance.sql`이다. 기존 모집단·미평가·신규 가입 인원 계산은 유지하고 신규 가입 비교의 실제 기준시각과 완료 실행 ID만 같은 RPC 결과에 추가했다. 서버 전용 권한 유지와 읽기 결과를 확인했다. 검색 실행·메시지·데이터 backfill은 없고 웹·Worker는 미배포다. 재적용하지 않는다.

- 2026-10-22 매칭 기준 이력 DB 선반영: 사용자 승인으로 운영 migration `20261022123546`(`company_hiring_brief_history`)을 적용했다. 로컬 정본은 `supabase/migrations/20261022094500_company_hiring_brief_history.sql`이다. Brief+Criteria 저장 전후 스냅샷·수정자·출처·비동기 요약 상태를 보존하는 원장과 trigger, 원자적 저장·요약 claim·웹 검토 요청 멱등 함수를 추가했다. 기존 Brief 20,000자 및 Criteria 6개/이름 200자/본문 8,000자 제한만 제거하고 필수 필드·역할 소유권·동시 수정 검증은 유지한다. 적용 직후 이력 0건, RLS·anon/authenticated 차단·service_role 전용 실행을 확인했다. 기존 writer의 변경도 snapshot은 남지만 새 actor context가 없으면 수정자는 미기록이며, 웹·요약 consumer 미배포 상태에서는 History UI·요약·자동 검토 채팅이 live가 아니다. 기존 데이터를 가짜 변경으로 backfill하지 않았고 운영 검색·연락·실험 메시지를 만들지 않았다. 같은 migration을 다시 적용하지 않는다. 설계와 실제 검증 범위는 `docs/company/company-hiring-brief-history-ko.md` 및 회사 검색 평가 레지스트리를 따른다.

- 2026-10-13 DB-first rollout 주의: 운영 DB migration `20261013120149`(`preserve_presented_candidates_and_intro_decisions`)는 적용됐다. 구 웹이 새 `company_update`를 잘못 소비하지 않도록 해당 event는 `failed/company_update_runtime_required`로 보관한다. 새 웹의 공통 enqueue와 dispatch recovery만 이를 queued로 전환한다. 첫 웹 배포 전에 이 보류 event를 확인하고, 구 웹의 정형 거절 알림이 이미 전달된 event는 실제 Slack 전달 증거와 대조해 중복 안내하지 않도록 정리한다. 단순 queue 상태로 전달 완료를 추정하지 않는다. 기존 사건을 재발송하거나 미기록 거절을 복원하는 것은 migration의 효과가 아니다. Worker는 beta의 facts-outbox 처리 코드가 배포된 다음 순차 배포한다.

- 2026-10-15 운영 DB 선반영: `company_contact_agent_first`, `company_presentation_agent_followup`, `company_agent_event_delivery_recovery`, `company_intro_acceptance_update`는 운영 이력 `20261014192900`~`20261014192906`으로 적용됐다. 로컬 파일 timestamp와 운영 이력 version은 다르며 실제 함수 본문을 대조해 확인했다. 이번 요청은 DB만 적용했고 웹·Worker는 배포하지 않았다. `company_update`의 기존 보류 계약은 유지되며 당시 보류·실행 가능 사건은 0건이었다. 이후 배포에서는 현재 사건과 실제 전달 근거를 다시 확인하고 이 migration을 일괄 재적용하지 않는다. 상세 기록: `docs/evaluation/company-side-conversational-qa/reports/2026-10-15-company-events-review.md`.

- 2026-10-15 배포 전 DB 누락 보완(웹·Worker 미배포): 사용자 승인으로 운영 DB의 실제 정의를 대조한 뒤 `company_proactive_recruiting`(20261015051036), `manual_talent_first_search`(20261015051041), `email_vercel_runtime`(20261015051046), `organization_add_and_shared_company_identity`(20261015051054)를 적용했다. 조직 묶음은 로컬 `20261012090244`, `20261012095337`, `20261012100346`의 조직 추가·동일 회사의 독립 조직 허용 변경이다. 새 함수 13개의 서버 전용 실행 권한과 수동 검색 보호 조건·조직 완료 분기를 확인했다. 추가 `email_runtime_legacy_claim_access` migration으로 기존 이메일 reply/onboarding claim 함수 2개도 anon/authenticated 실행을 차단했으며 로컬 이메일 migration에 동일 권한을 반영했다. 이메일 작업은 모두 `legacy`이며 runtime 활성화·서비스 종료는 하지 않았다. `email_application_start`는 이미 적용된 함수 본문을 확인해 재적용하지 않았다. 확인 당시 `company_update_runtime_required` 보류 사건 1건은 변경·재발송하지 않았다. 이후 웹 배포 전에 실제 Slack 전달 근거를 대조해야 한다. 로컬 timestamp와 운영 migration 번호가 다르므로 일괄 재적용하지 않는다.

- 2026-10-15 회사 이메일 DB 선반영: 사용자 요청으로 `company_email_replies`를 운영 version `20261015103733`으로 적용했다. 로컬 파일은 `20261015120000_company_email_replies.sql`이며 실제 columns/functions/indexes를 사전 대조하고 적용 후 서버 전용 RPC 권한·trigger·중복 방지 index를 확인했다. 기존 email reply 작업은 legacy로 유지했고 회사 alias는 0건이었다. 웹·Worker 배포, runtime 활성화, 기존 사건 재발송은 하지 않았다. 같은 migration을 재적용하지 않는다. 실제 로컬 Supabase + company-side LLM + capture 메일 검증과 한계는 `docs/evaluation/company-side-conversational-qa/reports/2026-10-15-company-email.md`의 후속 요청 절을 따른다.

- 2026-10-15 CC Intro 첫 답장 알림 DB 적용: 사용자 요청으로 운영 migration `20261015123749`(intro_first_reply_company_update), `20261015124051`(intro_reply_nudge_facts)를 적용했다. capture 저장 시 연결별 후보자 첫 답장만 기존 company_update 큐에 기록한다. 트리거 활성화·anon/authenticated 실행 차단을 확인했다. 웹·Worker 재배포 없이 기존 READY revision `9db6ec01c9f574f83c0b1cd491a17940d8d6dd3b`의 5분 dispatcher를 사용한다. 실제 LLM 예시는 합성 입력·발송 차단이며 회사 채널 테스트·과거 답장 재알림은 하지 않았다. 평가 계약은 company-side-conversational-qa README의 v29–v31이다. 후속 배포에서 중복 적용하지 않는다.

- 2026-10-21 Ops 아카이브 재연락 DB 선반영: 사용자 요청으로 운영 migration `20261020162228`(`ops_private_reengagement`)를 적용했다. 로컬 정본은 `20261020130031_ops_private_reengagement.sql`이다. 전용 요청·답변 범위, 회사 전달/후속 연락 차단, 비공개 progress, 수락 RPC 우회 방지를 설치했다. 명시적 재관심 답변은 기존 검색이 읽는 `saved_stage=connected`와 내부 수락 단계로 복구하고, 해당 연락 시작 이전의 미종료 rerank reject만 이력을 보존한 채 종료한다. 복구 transaction의 ready-card 자동 handoff는 차단한다. 현재 권한·역할·기존 회사 소개 등 일반 재검토 자격은 유지한다. 운영 정의·권한·활성 트리거를 읽기 전용으로 확인했고 전용 요청/progress/queue는 모두 0건이다. 후보자 상태 변경·Daniel 발송·실험·웹/Worker 배포는 하지 않았다. 새 웹/Worker 적용 전 기능 사용 가능으로 간주하지 않으며, Behavior Context의 간접 이력 반영 문제는 이번 DB 변경으로 수정하지 않았다. 후속 배포에서 같은 migration을 재적용하지 않는다.

### 2026-10-22 Free 정책 복원 (운영 DB 적용·웹/Worker 미배포)

사용자 요청으로 Free 프로필 블러·열람 차감·LLM/Slack 정보 제한을 제거하고 월 10 공용 Intro를 복원한다. 활성 Free Role은 조직당 최대 1개이며 유효한 유료 슬롯에 배정된 Role은 별도다. 초안은 제한하지 않고 legacy·Enterprise·tailored 계약은 유지한다. 슬롯 만료나 기존 초과 상태를 정리할 때 유효한 슬롯을 먼저 배정한 뒤 먼저 만든 Free Role 1개를 유지하고 나머지를 일시 중지한다. 기존 후보자·Intro·진행 이력은 삭제하지 않는다.

사용자 승인으로 운영 migration `20261022081230`(`restore_free_intros_and_single_active_role`)을 적용했다. 로컬 정본은 `supabase/migrations/20261022071755_restore_free_intros_and_single_active_role.sql`이다. 실제 Intro/연결 차감만 보존해 월 10 공용 Intro를 복원하고 활성 Free Role을 1개로 제한한다. 열람 조회·차감 RPC와 outbox의 열람 제한 필드를 제거했으며 과거 열람 기록 5건은 보존했다. 전환은 가입된 standard Workspace만 잠그며 별도 계약의 잔액·연결 권한·무차감 동작을 유지한다. 운영 조회의 capacity 1·allowance/remaining 10과 함수 정본·서버 전용 권한을 확인했고, 적용으로 중지된 Role은 0개다. 같은 migration을 다시 적용하지 않는다.

웹·Worker는 배포하지 않았다. 확인한 운영 웹 revision은 `e97850a6c26c90af0f0d64a65c5c010b273702d5`이며 열람 RPC/필드에 의존하지 않는다. 운영 웹의 요금제·LLM 기본 안내에는 이전 무제한 Role 설명이 남아 있어 후속 웹 배포에서 로컬 문구·오류 안내를 반영해야 한다. 아래 열람 정책 항목은 당시 적용 기록이며 이번 복원으로 대체됐다. Notion 종합·공개 범위·Role lifecycle 문서는 실제 DB 정책과 웹 미배포 범위를 구분해 갱신했다.


- 2026-10-22 회사 대화 검색 DB 선반영: 사용자 승인으로 운영 migration `20261022045532`(`company_agentic_role_search`)를 적용했다. 로컬 정본은 `supabase/migrations/20261022041333_company_agentic_role_search.sql`이다. Brief별 평가 이력, 회사·팀·Role Memory와 멱등 처리 영수증, 검색 request 옵션 및 서버 전용 함수 6개를 추가했다. 새 테이블 RLS·anon/authenticated 접근 차단·service_role 권한과 실제 Brief/version·후보 재고 조회를 확인했다. 적용 시 신규 평가·Memory·영수증·새 계약 검색은 모두 0건이다. 웹·Worker 배포 및 운영 검색 실행은 하지 않았으므로 기능 전체가 live라고 간주하지 않는다. 같은 migration을 다시 적용하지 않는다. 실제 모델 평가는 승인된 legacy 유료 권한 Role의 로컬 사본에서 수행한다.

- 2026-10-21 Free 열람 정책 DB 선반영: 사용자 승인으로 운영 migration `20261021094846`(`workspace_candidate_views`)를 적용했다. 로컬 정본은 `supabase/migrations/20261021091411_workspace_candidate_views.sql`이다. `talent_opportunity_fit.is_opened`, 서버 전용 열람 조회·차감 RPC, 조직 월 10회 열람, Free Intro 무차감과 유료 Intro/연결 권한 경계를 설치했다. 운영 REST에서 열람 조회·기존 billing summary 200 응답과 서버 전용 실행 권한을 확인했다. 실제 후보 열람·차감 테스트나 연락 발송은 하지 않았다. 웹·Worker는 배포하지 않았으므로 잠금 UI·신원 제외·LLM/Slack 변경을 운영 반영 완료로 간주하지 않는다. 구 웹의 미열람 Free Intro 요청은 새 열람 조건으로 제한될 수 있다. 후속 배포에서 같은 migration을 재적용하지 않는다.

- 2026-10-21 Free QA 검증 보완: 운영 migration `20261021111142`(`candidate_views_test_role_isolation`)를 적용했다. 로컬 정본은 `supabase/migrations/20261021130000_candidate_views_test_role_isolation.sql`이다. test-only Role은 allowlist를 확인한 뒤 기존 열람 원장만 사용하고 fit에는 기록하지 않는다. 일반 Role의 `is_opened`·차감 계약은 유지한다. 사용자 요청으로 보존하는 `Harper Free QA`의 합성 후보와 paused/testOnly 역할만 실제 로컬 UI·LLM 검증에 사용한다. 웹·Worker 배포는 하지 않았다.

- 2026-10-22 열람 기록 전환: 운영 migration `20261022024141`(`candidate_views_progress_log`)를 적용했다. 로컬 정본은 `supabase/migrations/20261022023917_candidate_views_progress_log.sql`이다. 기존 열람 권한 5쌍을 `talent_progress.kind = candidate_profile_opened`로 이전하고 `talent_opportunity_fit.is_opened`를 제거했다. 열람 조회·중복 차감 방지·Free Intro 조건은 같은 Role×talent의 이 로그만 읽는다. 별도 상태 칼럼·metadata는 추가하지 않으며 차감은 기존 원장에 남긴다. 이 로그는 후보자 행동 맥락 갱신을 발생시키지 않는다. 운영 QA의 10→9→9→8 차감·재열람·다른 Role 경계를 rollback 트랜잭션으로 검증했고 fixture는 10회·미열람 상태를 유지한다. 웹·Worker 배포는 하지 않았다. 앞의 두 migration은 적용 당시의 기록이며 열람 저장 기준은 이 항목이 우선한다. 같은 migration을 재적용하지 않는다.

- 2026-10-22 문서 후속 점검: 운영 `service_answer_examples`의 회사 FAQ 중 요금·Intro 사용·슬롯 만료 한·영 답변 6행을 현재 정책으로 수정했다. 질문·검색 embedding·태그·활성 상태·나머지 82행은 유지했다. 로컬 FAQ 원본과 번역, 미공개 회사 약관 초안도 맞췄으며 공개 약관·동의 버전은 변경하지 않았다. 웹 기본 안내의 후속 배포 필요 상태는 유지한다.

## 출처: `harper_worker/AGENTS.md`

- 2026-10-26 정기 검색 기본 경로 변경(미배포): `COMPANY_SCHEDULED_AGENTIC_MATCHING` 분기를 제거했다. 새 정기 검색과 Role 활성화 첫 검색은 환경변수 값과 무관하게 회사측 공통 접수→Decisions 평가→회사 LLM 선정 경로를 사용한다. 웹 endpoint 준비 후 Worker를 배포해야 하며, 접수 오류 때 legacy 평가로 우회하지 않는다. 기존 일정·실행 중지·권한·중복 방지와 실행 중 작업의 완료 계약은 유지한다.

- 2026-10-26 로컬 평가 원장 통합(Worker 미배포, DB 선반영): 온보딩/Opportunity 내부 평가와 정기 Role 검색은 `opp/matching/worker_inputs.py`의 전체 입력·fingerprint와 `worker_evaluations.py`의 단계별 저장·동시 중복 방지를 공유한다. 새 평가는 `company_role_candidate_evaluations`에만 저장하며 `run_id`는 회사 검색 생산 실행, `discovery_run_id`는 Opportunity 생산 실행이다. 재사용은 원래 평가 ID·생산 실행을 유지한다. 기존 `opportunity_decisions.py`/`service.assess_pairs`의 fit-cache 경로는 legacy 호환용으로 남았으며 신규 Opportunity refresh는 호출하지 않는다. 운영 migration `20261026052249`(`shared_worker_role_evaluations`) 적용·정본/권한 검증 완료; 코드 배포·backfill·연락은 하지 않았다. 상세 검증은 beta `docs/evaluation/unified-talent-role-fit/README.md`를 따른다.

## 출처: `AGENTS.md`


## 2026-11-08 온보딩 직후 Career 대화 직접 실행 (운영 DB 선반영·웹 미배포)

사용자 승인으로 운영 migration `20261108085212` (`career_onboarding_direct_continuation`)을 적용했다. 로컬 정본은 `supabase/migrations/20261108120000_career_onboarding_direct_continuation.sql`이다. 새 서버 전용 `enqueue_career_onboarding_continuation`은 온보딩 완료와 웹 실행 접수를 원자적으로 저장한다. 기존 `enqueue_career_onboarding_invocation`은 본문 해시까지 보존해 현재 운영 웹·Worker의 동작을 바꾸지 않았다. 새 웹 코드가 배포된 뒤에만 직접 실행 경로를 사용한다. 내부 Role 최초 평가는 별도 Worker 작업으로 유지하며 대화 실행을 막지 않는다.

운영 함수 본문 로컬 일치, SECURITY INVOKER·권한·소유권 거부와 기존 함수 보존을 확인했다. 실제 후보자 실행·추천·발송·웹/Worker 배포는 하지 않았다. 현재 팀원 대상 기능/정책 변경이 없는 DB 선반영이므로 Notion 변경은 없다. 상세 확인과 로컬 구현 수정은 `docs/evaluation/career-onboarding-continuation/review-2026-11-08.md`에 기록했다. 동일 migration을 재적용하지 않는다.

## 2026-11-10 — Shaun GTM DB 접근 오류 수정

- 사용자의 명시적 DB 수정 요청에 따라 운영 `gtm_view.current_actor()`에 `shaunlimshaunlim@gmail.com` 허용 조건을 추가했다. 웹·API의 기존 허용 조건과 일치시키며 이메일 인증·미삭제 검사는 유지한다.
- `gtm_allow_shaun_internal_account` 마이그레이션 적용 완료. 웹 배포·push는 하지 않았다.
- Shaun의 인증 claims와 `authenticated` 역할로 읽기 전용 트랜잭션에서 `gtm_workspace('catalog', '{}')` 호출: 시트 18개·원본 21개·`can_write=true` 확인. 실제 브라우저 접속은 별도 확인하지 않았다.

- 2026-11-11 Career 채팅 입력 재사용·완료 처리 DB 선반영: 사용자 요청 범위에서 운영 `career_chat_input_reuse_and_completion`(`20261111095539`)과 `career_chat_completion_trace_reuse`(`20261111095957`)를 적용했다. 로컬 migration 정본은 각각 `20261111095048_…sql`, `20261111095851_…sql`이다. 설정/Gmail source revision, 대화 수정·삭제/요약 invalidation과 append watermark, 서버 전용 입력 증분 조회·inbox context RPC, 완료·실행권 해제·다음 입력 인계·사용자 메시지 실행 기록을 합친 RPC를 추가했다. 모델 이력에 사용하지 않는 사용자 행의 `careerCapabilityTurn`만 바뀐 경우에는 대화 캐시를 무효화하지 않는다. 다른 payload 변경/Stop/문구 수정·삭제는 계속 무효화한다. 기존 실행 RPC는 보존했고 신규 RPC의 anon/authenticated 실행 권한은 없다. 기존 보안 advisor 항목 변화 없음. 로컬 소비 코드와 실제 계정의 tool 없는 채팅 3회에서 캐시 재사용·빈 활동 행 미생성·정상 완료·실행권 해제를 확인했다. 첫 글자 DOM 표시 4.31–4.44초, 스트림 종료 5.53–5.77초(Terra medium). 웹/Worker 배포와 push는 하지 않았다. 같은 migration을 재적용하지 않는다.
## 2026-11-16 Career 기회·비교 화면 운영 DB 선반영

`localhost:3000`은 기존 계정의 운영 DB를 읽는다. 비교 자료 목록에 필요한 `career_views` 테이블과 개인 기회 목록의 `career_list_opportunities_v1` 함수가 없어서 DB는 PGRST205/PGRST202를, 웹은 두 요청에 400을 반환했다. 운영 migration `20261116020651` (`career_resource_storage_and_entitled_readers`)에 아래 11개 로컬 migration 정의를 순서대로 적용했다. 후속 배포에서 이 묶음을 다시 실행하지 않는다. 회사 검색 GIN 인덱스 `career_company_text_search`는 같은 정의로 별도 `CREATE INDEX CONCURRENTLY`로 생성하고 `indisready`와 `indisvalid`를 확인했다.

`20261113105340`, `20261113111611`, `20261113112306`, `20261113153813`, `20261113154219`, `20261113162900`, `20261113164300`, `20261113173100`, `20261113174900`, `20261113182700`, `20261113182800`이 해당한다. 이메일 자료의 접근 확인에 필요한 `talent_integrations.career_mail_sync` 컬럼만 리소스 기반 정의에 포함했다. 메일 이벤트·메일 동기화 backfill (`20261113155626`), 위임 복구 (`20261113155021`), 온보딩 변경, 웹·Worker 배포는 이 적용 범위 밖이다. 현재 서버 역할로만 새 테이블 여섯 개에 접근할 수 있고 RLS는 모두 활성이다. 확정된 두 목록 reader는 기존 로그인으로 다시 연 3000 화면에서 11:07:42 KST 둘 다 DB HTTP 200이었다. 기존 추천 화면에는 새 기회 7개가 보였고 신규 자료 목록은 모두 0건이었다.

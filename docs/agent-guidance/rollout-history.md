# 운영 적용 기록

기존 AGENTS.md에 있던 날짜별 기록을 원문 그대로 옮겼다. 각 항목은 작성 당시의 관측·로컬 변경·DB 적용·배포 범위를 뜻하며 현재 운영 상태를 자동으로 보증하지 않는다. 기존 후속 기록의 우선순위와 재적용·재발송 금지는 유지한다. 배포·migration·관련 정책 작업에서 해당 항목과 현재 코드·운영 근거를 대조한다. 기록 안의 상대 경로는 출처 AGENTS.md가 있던 디렉토리 기준이다.


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

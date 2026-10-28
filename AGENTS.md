# Harper Repository Instructions

- 2026-10-27 이메일 지원 준비 중복 기준 DB 선반영(웹·Worker 미배포): 사용자 요청으로 운영 migration `20261027112509`(`application_start_work_identity`)를 적용했다. 로컬 정본은 `supabase/migrations/20261027113000_application_start_work_identity.sql`이다. `talent_simulate_application`의 원본 메시지 단독 UNIQUE를 원본 메시지·공고·선택 이력서 조합 UNIQUE로 바꾸고 `write_application_activity`의 기존 작업 조회에 같은 조건을 추가했다. 운영 함수는 최초 activity store + email start와 일치하며 질문 소개 메시지 저장 루프가 남아 있음을 확인했고, 그 동작은 보존했다. 적용 후 함수 전체가 의도한 조건 변경과 일치하고 기존 438건(활성 129건)의 전체 행 해시·RLS·서버 전용 실행 권한·코칭 보호 트리거·활성 대화 단일 작업 index가 보존됐으며 신규 security advisory는 없다. 실제 지원·메일 발송·모델/브라우저 테스트·웹/Worker 배포는 하지 않았다. 이메일 작성·부분 저장·재확인 등 로컬 코드 변경은 미배포이며 같은 migration을 재적용하지 않는다.

- 2026-10-27 기존 활성 Free Role 보존 운영 DB 적용(웹·Worker 미배포): 신규 시작·재개·만료 복구에만 활성 용량을 검사한다. 기존 활성 Role은 개수 초과 상태에서도 조회·저장·슬롯 재배정·슬롯 만료로 자동 중지하지 않는다. 정본 `supabase/migrations/20261027085423_preserve_active_roles_on_billing_reconcile.sql`은 기존 함수 3개만 교체하며 데이터 backfill·웹/Worker 배포는 없다. 사용자 승인으로 운영 migration `20261027090731`을 적용했고 함수 3개 본문 일치, 내부 Role 93개(활성 상태 35개)의 상태·만료 정보 해시 보존, 신규 security advisory 없음을 확인했다. 같은 migration을 재적용하지 않는다. 아래 과거 자동 중지 기록은 당시 동작이다.

- 2026-10-27 Free 추천·연결 및 공용 3 Intro DB 선반영(웹·Worker 미배포): 사용자 승인으로 운영 migration `20261027083407` (`free_role_matching_and_three_intros`)을 적용했다. 로컬 정본은 `harper_beta/supabase/migrations/20261027074848_free_role_matching_and_three_intros.sql`이다. 기존 함수 9개의 유료 전용 조건·공용 제공량과 첫 활성화 저장 요일 예외를 변경하고, 표준 공용 현재·미래 기간 2건을 제공량/잔액 3으로 맞췄다. 적용 전 운영 함수와 직전 migration 정본 10개(활성화 helper 포함)를 대조했으며 적용 후 변경 함수 9개 본문 일치·anon/authenticated 차단·service_role 허용을 확인했다. 기존 사용 이력·슬롯·과거 및 별도 계약 기간의 해시가 보존됐고 신규 security advisory는 없다. 실제 추천·연락·웹·Worker 배포·FAQ 검색 데이터 갱신은 하지 않았다. 기존 로컬 미적용 기록보다 이 후속 상태가 우선하며 같은 migration을 재적용하지 않는다.

- 2026-10-27 Free 기능 확대 로컬 변경·미배포: 슬롯 없는 활성 Role도 talent-first 추천·연결 대기·연결 수락을 지원하고 공용 Intro는 월 3개로 변경한다. 활성 Free Role 1개·슬롯별 월 50 Intro·별도 계약·동의/공유/test-only 경계는 유지한다. 새 migration `20261027074848_free_role_matching_and_three_intros.sql`은 운영 미적용이다. 아래 과거 10 Intro·유료 전용 기록은 당시 사실이며 현재 로컬 정책이 아니다.

- 2026-10-27 슬롯 구매 후 역할 배정 DB 선반영(웹 미배포): 사용자 승인으로 운영 migration `20261027075313`(`choose_role_after_slot_purchase`), `20261027075942`(`preserve_slot_assignment_choice_capacity`)를 적용했다. 로컬 정본은 `supabase/migrations/20261027072209_choose_role_after_slot_purchase.sql`, `20261027075814_preserve_slot_assignment_choice_capacity.sql`이다. 슬롯 없는 활성 Free Role 1개는 자동 배정하고 2개 이상은 기존 활성 용량 안에서 선택을 유지한다. 역할 3개 이상을 차례로 배정해도 남은 빈 슬롯을 용량에 포함하며 실제 채용 시작·재개와 슬롯 만료 복구는 기존 자동 배정을 유지한다. 세 함수의 본문 정본 일치·서버 전용 권한·기존 트리거 유지·신규 security advisory 없음을 확인했다. 기존 슬롯·Intro 데이터 backfill은 없으며 웹 결제 확인 응답과 역할 선택 모달은 아직 미배포다. 같은 migration을 재적용하지 않는다.

- 2026-10-27 Free Role Run Search DB 선반영(웹·Worker 미배포): 사용자 요청으로 운영 migration `20261027074326`(`free_role_company_agentic_search`)을 적용했다. 로컬 정본은 `supabase/migrations/20261027072006_free_role_company_agentic_search.sql`이다. `enqueue_company_agentic_search_v1`의 회사측 평가/발행 접수를 free·paid 공통으로 열었으며 기존 Owner/Admin·Role 접근·활성/만료·Brief·test-only·멱등 경계는 보존했다. 함수 본문 정본 일치·SECURITY INVOKER·anon/authenticated 실행 차단·service_role 실행 권한과 신규 security advisory 없음을 확인했다. Worker의 같은 유료 제한 해제는 로컬 수정 상태이며 배포 전 전체 기능이 live라고 안내하지 않는다. 운영 검색 재접수·후보 등록·연락·서비스 재시작은 하지 않았다. 후속 배포에서 같은 migration을 재적용하지 않는다.

## 모든 LLM tool result의 텍스트화 — 필수

- 회사·Career·온보딩·음성·이메일·Worker를 포함해 **모든 LLM 도구 결과는 모델이 바로 읽고 판단할 수 있는 전용 텍스트 projection을 거친다.** DB 행·API 응답·실행 객체를 통째로 `JSON.stringify`해서 전달하지 않는다. 사용자 화면에 JSON을 숨기는 것만으로 충족되지 않는다.
- 다음 판단·호출에 필요한 사실과 정확한 ID·revision·cursor·실행 결과만 남긴다. 내부 중첩 객체·중복 메타데이터·후보마다 반복되는 기준 설명은 제거한다. 짧은 구조화 목록을 쓰더라도 내부 값은 사람이 읽을 수 있는 문자열·간단한 수치로 표현한다.
- 후보 목록은 `info`에 이름·headline·location을 모으고, 경력·학력은 직함/학위·회사/학교·기간의 문자열 목록으로 제공한다. `assessment`에는 fit 수치와 `criteria1: excellent` 같은 기준별 라벨을 둔다. criteria 번호·정의·점수 의미는 응답 앞에서 한 번만 설명한다. 상세 근거·확률분포는 일반 read 도구로 별도 조회한다.
- 관계·자격 내부 객체를 그대로 노출하지 않는다. 신규 추천 가능 후보만 반환하는 목록에는 동일한 자격 플래그를 반복하지 않는다. 과거/현재 구분이나 다음 행동에 실제 필요한 관계는 뜻이 분명한 짧은 문장으로 제공한다.
- 전용 formatter를 우선하고 웹 공통 fallback은 `src/lib/llm/promptText.ts`를 사용한다. 단순 JSON→들여쓰기 변환만으로 정보 설계를 완료했다고 보지 않는다. 원본 결과는 저장·UI·실행·trace용으로 보존하고, 코드가 소비할 값은 텍스트를 재파싱하지 않고 원본에서 읽는다. 날짜·시각은 공통 formatter를 사용하며 승인·사용자 원문, 식별자, 실패·미완료·페이지 경계는 보존한다.
- 변경 시 실제 provider에 들어갈 결과를 렌더링해 확인한다. 문서에 규칙을 추가하거나 formatter만 만든 것으로 적용 완료를 주장하지 않는다. 이 규칙은 입력 설계 계약이며 LLM 답변을 키워드·정규식·길이로 검열하는 로직을 만들라는 뜻이 아니다.


## LLM 유연성을 해치는 불필요한 검증 금지 — 필수

- Harper는 LLM 기반 서비스다. 불필요한 룰베이스·코드 기반 논리 검증은 하나씩 쌓일수록 정상적인 표현과 새로운 상황을 막고 시스템의 유연성을 훼손한다. **기본값은 검증을 추가하지 않는 것이다. 기존 검증도 반드시 필요한 이유를 설명할 수 없으면 제거한다.** “방어적으로”, “품질 보장을 위해”, “혹시 모르니”는 추가·유지 근거가 아니다.
- LLM이 판단할 의미·언어·문체·품질·적합성·완결성을 정규식, 키워드, 문자 비율, 단어 수, 임의의 길이·항목 수, 휴리스틱 점수, 시나리오별 조건문으로 다시 심사하지 않는다. 이를 이유로 출력·저장을 거부하거나, 정상 실행을 차단하거나, 내용을 잘라 버리거나, 고정 문구로 대체하는 로직을 금지한다.
- 결정론적 검증은 실행에 꼭 필요한 최소 구조와 실제 피해를 막는 경계에만 둔다. 인증·소유권·공유 권한·동의·유효한 식별자·동시 수정·멱등성·중복 발송 방지·test-only 격리 등이 해당한다. 검증을 추가하거나 유지하려면 **막아야 할 구체적 오류, 그 값을 실제로 소비하는 reader/executor, 실패 시 사용자에게 미치는 영향**을 설명할 수 있어야 한다. 의미 판단을 데이터 무결성이라는 이름으로 포장하지 않는다.
- 길이·개수 상한은 실제 외부 API 계약이나 확인된 자원 한계가 있을 때만 해당 실행 경계에 최소한으로 둔다. 보기 좋은 분량이나 예상 사례에 맞추기 위한 상한을 schema·DB·validator에 넣지 않는다. 원문과 PDF 추출문의 문자열·순서 일치처럼 출력 품질을 간접 추정하는 검사로 사용 가능한 결과물의 전달을 막지 않는다.
- 품질 문제는 원본 LLM의 prompt, 제공 context, 일반 도구 계약과 개발 단계의 평가·렌더링 확인으로 개선한다. 운영 중 매번 통과해야 하는 품질 심사기, 별도 검열 LLM, 숨은 재작성·재시도 루프를 추가하지 않는다. 잘못된 검증은 임계값을 느슨하게 하거나 예외를 덧붙여 보존하지 말고 제거한다.

## 원인 조사·장애 설명의 구체성 — 필수

- 로그·오류 원인 답변에는 대상 종류(internal Role/외부 공고 등), 사용자 발화·클릭, 실제 tool/API 이름과 주요 인자, 실행 결과, 사용자에게 보인 응답·오류를 연결해서 설명한다. 필요한 원문·한국 시간과 최소 record ID·코드 위치를 근거로 남기고 무관한 개인정보는 복사하지 않는다.
- 본문 저장·미리보기·다운로드 파일 생성/저장·응답/수신, 또는 지원 준비·외부 화면 입력·제출/발송·상대방 수신 확인을 각각 구분한다. 파일명·카드·LLM 성공 안내·상태값 하나로 후속 단계 완료를 추정하지 않는다. 사용자 입장에서 무엇은 됐고 무엇은 안 됐는지를 먼저 답한다.
- “기존 시도 기록”, “상태”, “큐”, “검증 실패” 같은 표현만으로 끝내지 않는다. 어떤 작업의 기록이 어느 테이블·필드/시스템에 어떤 값으로 저장되고, 어떤 조건문·reader가 이를 읽어 무엇을 막았는지 설명한다. 최초 실패, 실패 후 재시도 차단, 새 작업 시작, 잘못된 LLM 안내를 분리한다.
- 당시 배포 revision과 실제 로그로 인과관계를 확인한다. 관측 사실·코드상 동작·추론·미확인 세부 원인을 구분하고, 고객에게 한 설명을 사실의 근거로 삼지 않는다. 간결함을 이유로 사용자가 다시 원인을 물어야 할 정도로 증거와 단계를 생략하지 않는다. 조사 요청만으로 수정·재시도·발송·배포를 실행하지 않는다.

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

## UI 문구 절제와 참조 디자인 준수 — 필수

- 사용자에게 새로운 정보나 판단 근거를 주지 않는 UI 문구는 넣지 않는다. 화면에 이미 보이는 제목·버튼·대화·배치를 다시 설명하는 라벨, 당연한 이용 조건, 장식용 슬로건, 관성적인 helper text와 버튼 아래 꼬리말은 금지한다. 빈 공간을 채우거나 친절해 보이게 하려는 이유로 추가하지 않는다.
- 문구를 지워도 사용자가 기능의 가치·현재 상태·다음 행동을 똑같이 이해할 수 있다면 삭제한다. `슬롯이 연결된 Role에서 시작할 수 있어요.`처럼 구매 화면에서 설명할 조건을 기능 소개에 반복하거나, `이렇게 연결돼요 · 예시`처럼 눈앞의 콘텐츠를 해설하거나, `지민님과 Harper`처럼 대화 배치만으로 충분한 참여자 설명을 덧붙이지 않는다. 이는 해당 문자열만의 금지가 아니라 같은 역할을 하는 군더더기 전체에 적용되는 기준이다.
- 필요한 설명은 실제로 알 수 없던 기능·차이·결과를 구체적으로 전달해야 한다. 오류 원인·복구 방법, 비용·동의·공개 범위·되돌릴 수 없는 결과처럼 판단에 필요한 정보와 접근성 이름은 유지하되, 실제 필요한 위치에 한 번만 제공한다. 불필요한 설명을 tooltip이나 다른 위치로 옮겨 남겨두지 않는다.
- 사용자가 특정 화면을 디자인 참조로 지정하면 실제 구현의 정보 구조·아이콘·타이포그래피·간격·행동 배치를 확인하고 따른다. 배경색이나 분위기만 가져오고 핵심 구성을 임의로 생략하지 않는다. 참조가 기능별 아이콘 + 제목 + 설명의 세로 목록이면 같은 구조와 밀도를 재사용하며, 체크 아이콘을 반복한 한 줄 요약으로 대체하지 않는다.
- 이 규칙은 UI 작성·검토의 판단 기준이다. 예시 단어를 정규식·키워드 목록으로 검열하거나 LLM의 실제 답변을 결정론적 문구로 덮어쓰는 런타임 로직으로 구현하지 않는다.

## LLM 날짜 입력 계약

- LLM에 제공하는 시스템 날짜·시각은 반드시 공통 formatter를 거친다. 원본 ISO timestamp(초·소수점·`T`·`Z`·offset 포함)를 prompt/context/tool result에 직접 보간하거나 JSON으로 덤프하지 않는다. 시각이 필요하면 `YYYY-MM-DD HH:mm`, 날짜만 필요하면 `YYYY-MM-DD`까지만 제공한다. 시간대는 context에 한 번 명시한다.
- 웹 정본은 `src/lib/llm/promptDateTime.ts`다. 새 경로도 이 함수를 재사용한다. DB 원본·정렬·cursor·revision·멱등성 값과 사용자/승인 원문은 변형하지 않고 모델용 사실 projection만 포맷한다. 상세 계약은 [도구 정보 설계 가이드](docs/company-side-tool-information-guide-ko.md)의 날짜·시각 절을 따른다.

## 2026-10-22 Free 정책 복원 (운영 DB 적용·웹/Worker 미배포)

사용자 요청으로 Free 프로필 블러·열람 차감·LLM/Slack 정보 제한을 제거하고 월 10 공용 Intro를 복원한다. 활성 Free Role은 조직당 최대 1개이며 유효한 유료 슬롯에 배정된 Role은 별도다. 초안은 제한하지 않고 legacy·Enterprise·tailored 계약은 유지한다. 슬롯 만료나 기존 초과 상태를 정리할 때 유효한 슬롯을 먼저 배정한 뒤 먼저 만든 Free Role 1개를 유지하고 나머지를 일시 중지한다. 기존 후보자·Intro·진행 이력은 삭제하지 않는다.

사용자 승인으로 운영 migration `20261022081230`(`restore_free_intros_and_single_active_role`)을 적용했다. 로컬 정본은 `supabase/migrations/20261022071755_restore_free_intros_and_single_active_role.sql`이다. 실제 Intro/연결 차감만 보존해 월 10 공용 Intro를 복원하고 활성 Free Role을 1개로 제한한다. 열람 조회·차감 RPC와 outbox의 열람 제한 필드를 제거했으며 과거 열람 기록 5건은 보존했다. 전환은 가입된 standard Workspace만 잠그며 별도 계약의 잔액·연결 권한·무차감 동작을 유지한다. 운영 조회의 capacity 1·allowance/remaining 10과 함수 정본·서버 전용 권한을 확인했고, 적용으로 중지된 Role은 0개다. 같은 migration을 다시 적용하지 않는다.

웹·Worker는 배포하지 않았다. 확인한 운영 웹 revision은 `e97850a6c26c90af0f0d64a65c5c010b273702d5`이며 열람 RPC/필드에 의존하지 않는다. 운영 웹의 요금제·LLM 기본 안내에는 이전 무제한 Role 설명이 남아 있어 후속 웹 배포에서 로컬 문구·오류 안내를 반영해야 한다. 아래 열람 정책 항목은 당시 적용 기록이며 이번 복원으로 대체됐다. Notion 종합·공개 범위·Role lifecycle 문서는 실제 DB 정책과 웹 미배포 범위를 구분해 갱신했다.


- 2026-10-22 회사 대화 검색 DB 선반영: 사용자 승인으로 운영 migration `20261022045532`(`company_agentic_role_search`)를 적용했다. 로컬 정본은 `supabase/migrations/20261022041333_company_agentic_role_search.sql`이다. Brief별 평가 이력, 회사·팀·Role Memory와 멱등 처리 영수증, 검색 request 옵션 및 서버 전용 함수 6개를 추가했다. 새 테이블 RLS·anon/authenticated 접근 차단·service_role 권한과 실제 Brief/version·후보 재고 조회를 확인했다. 적용 시 신규 평가·Memory·영수증·새 계약 검색은 모두 0건이다. 웹·Worker 배포 및 운영 검색 실행은 하지 않았으므로 기능 전체가 live라고 간주하지 않는다. 같은 migration을 다시 적용하지 않는다. 실제 모델 평가는 승인된 legacy 유료 권한 Role의 로컬 사본에서 수행한다.

- 2026-10-21 Free 열람 정책 DB 선반영: 사용자 승인으로 운영 migration `20261021094846`(`workspace_candidate_views`)를 적용했다. 로컬 정본은 `supabase/migrations/20261021091411_workspace_candidate_views.sql`이다. `talent_opportunity_fit.is_opened`, 서버 전용 열람 조회·차감 RPC, 조직 월 10회 열람, Free Intro 무차감과 유료 Intro/연결 권한 경계를 설치했다. 운영 REST에서 열람 조회·기존 billing summary 200 응답과 서버 전용 실행 권한을 확인했다. 실제 후보 열람·차감 테스트나 연락 발송은 하지 않았다. 웹·Worker는 배포하지 않았으므로 잠금 UI·신원 제외·LLM/Slack 변경을 운영 반영 완료로 간주하지 않는다. 구 웹의 미열람 Free Intro 요청은 새 열람 조건으로 제한될 수 있다. 후속 배포에서 같은 migration을 재적용하지 않는다.

- 2026-10-21 Free QA 검증 보완: 운영 migration `20261021111142`(`candidate_views_test_role_isolation`)를 적용했다. 로컬 정본은 `supabase/migrations/20261021130000_candidate_views_test_role_isolation.sql`이다. test-only Role은 allowlist를 확인한 뒤 기존 열람 원장만 사용하고 fit에는 기록하지 않는다. 일반 Role의 `is_opened`·차감 계약은 유지한다. 사용자 요청으로 보존하는 `Harper Free QA`의 합성 후보와 paused/testOnly 역할만 실제 로컬 UI·LLM 검증에 사용한다. 웹·Worker 배포는 하지 않았다.

- 2026-10-22 열람 기록 전환: 운영 migration `20261022024141`(`candidate_views_progress_log`)를 적용했다. 로컬 정본은 `supabase/migrations/20261022023917_candidate_views_progress_log.sql`이다. 기존 열람 권한 5쌍을 `talent_progress.kind = candidate_profile_opened`로 이전하고 `talent_opportunity_fit.is_opened`를 제거했다. 열람 조회·중복 차감 방지·Free Intro 조건은 같은 Role×talent의 이 로그만 읽는다. 별도 상태 칼럼·metadata는 추가하지 않으며 차감은 기존 원장에 남긴다. 이 로그는 후보자 행동 맥락 갱신을 발생시키지 않는다. 운영 QA의 10→9→9→8 차감·재열람·다른 Role 경계를 rollback 트랜잭션으로 검증했고 fixture는 10회·미열람 상태를 유지한다. 웹·Worker 배포는 하지 않았다. 앞의 두 migration은 적용 당시의 기록이며 열람 저장 기준은 이 항목이 우선한다. 같은 migration을 재적용하지 않는다.

- 2026-10-22 문서 후속 점검: 운영 `service_answer_examples`의 회사 FAQ 중 요금·Intro 사용·슬롯 만료 한·영 답변 6행을 현재 정책으로 수정했다. 질문·검색 embedding·태그·활성 상태·나머지 82행은 유지했다. 로컬 FAQ 원본과 번역, 미공개 회사 약관 초안도 맞췄으며 공개 약관·동의 버전은 변경하지 않았다. 웹 기본 안내의 후속 배포 필요 상태는 유지한다.

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

- Company-side LLM의 tool policy·schema·result·loader·기능 목록·기본 context를 설계·수정·리뷰하기 전에 [도구 정보 설계 가이드](docs/company-side-tool-information-guide-ko.md)를 읽고 따른다. 로딩 전의 기능 인식, 실행 계약, 결과 사실, 호출하지 않은 도구의 기존 효과와 후속 대화의 정보 제공 범위를 이 가이드에 따라 설계한다.
- 회사 대화 기반 Role 검색·평가 이력·범위별 Memory를 변경할 때는 `docs/company/company-agentic-role-search-implementation-ko.md`와 연결된 evaluation registry를 함께 참고한다. 도구 정보 배치는 기존 도구 정보 설계 가이드를 우선한다.

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

- 2026-10-21 Ops 아카이브 재연락 DB 선반영: 사용자 요청으로 운영 migration `20261020162228`(`ops_private_reengagement`)를 적용했다. 로컬 정본은 `20261020130031_ops_private_reengagement.sql`이다. 전용 요청·답변 범위, 회사 전달/후속 연락 차단, 비공개 progress, 수락 RPC 우회 방지를 설치했다. 명시적 재관심 답변은 기존 검색이 읽는 `saved_stage=connected`와 내부 수락 단계로 복구하고, 해당 연락 시작 이전의 미종료 rerank reject만 이력을 보존한 채 종료한다. 복구 transaction의 ready-card 자동 handoff는 차단한다. 현재 권한·역할·기존 회사 소개 등 일반 재검토 자격은 유지한다. 운영 정의·권한·활성 트리거를 읽기 전용으로 확인했고 전용 요청/progress/queue는 모두 0건이다. 후보자 상태 변경·Daniel 발송·실험·웹/Worker 배포는 하지 않았다. 새 웹/Worker 적용 전 기능 사용 가능으로 간주하지 않으며, Behavior Context의 간접 이력 반영 문제는 이번 DB 변경으로 수정하지 않았다. 후속 배포에서 같은 migration을 재적용하지 않는다.

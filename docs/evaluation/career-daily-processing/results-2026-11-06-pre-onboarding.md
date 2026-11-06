# 온보딩 전 Career 검토 — 로컬 구현·검증

2026-11-06. 운영 DB 변경, migration 적용, 배포, 사용자 이메일 발송은 실행하지 않았다.

## 구현 계약

- 신규 미완료 계정의 기본 external discovery 예약은 setting.created_at 기준 1·2·3시간 중 하나로 생성한다. 첫 시각을 다른 일일 소스 때문에 앞당기지 않는다. 시각은 검토 시작 자격이며 메일 발송/수신 약속이 아니다.
- 이후 간격은 기존 periodic_interval_days(기본 3일), passive 배수, 외부 추천 동의·stopped 설정을 사용한다. 원본 LLM이 기존 도구로 예약을 수정/중단할 수 있다.
- 완료자의 기존 예약은 그대로 반환하며, 완료자에게 누락된 예약의 지시문·간격·첫 시각 계산은 이전 함수와 같다. 미완료 상태에서 만든 예약도 온보딩 완료만으로 재생성하지 않는다.
- 기존 signup/profile 안내 생산자는 공통 예약으로 연결한다. 독립 signup-followup 발송 API는 미완료 계정 예약 seed의 preview/apply adapter로 바꿨다. 해당 endpoint는 기본 preview이고 dryRun=false일 때만 예약을 생성한다. 발송 API가 아니다.
- pending legacy 안내는 같은 transaction에서 예약 시각을 인계하고 cancelled로 기록한다. claimed/frozen/불확실한 provider 시도가 있는 계정은 전환을 미룬다. lock을 잡지 못한 계정도 미룬다. 뒤에 명시적 seed를 다시 실행하면 누락 계정만 처리한다.
- 신규 생성과 별개로 기존 계정 전환은 seed_incomplete_career_schedules(true)로 검토 후 false로 실행한다. migration 설치 자체에는 전체 사용자 backfill 부작용이 없다. 오래된 예약은 미래의 다음 주기로 넘기며 missed-run backlog를 만들지 않는다. 기존 stopped를 풀지 않는다.
- 발송된 Career 메일의 실제 owner/alias 또는 conversation receipt로 일반 대화를 이어간다. 온보딩 미완료만으로 Career 답장을 interview 모드로 바꾸지 않는다. 활성 email-first lead와 메일 후 명시적으로 제출한 profile_submit은 기존 온보딩 흐름을 유지한다. 완료 플래그를 위조하거나 바꾸지 않는다.

## 검증

로컬 PGlite 실행과 전용 mock 검사 59개 통과(고유 테스트 기준): preOnboarding 7, contactHistory 2, 기존 adaptive/daily/email-delivery 37, background delivery 13. 실제 migration 함수의 신규 예약, 완료자 기존 row 전체 보존, 완료자 누락 예약 기본값, pending 인계, frozen defer, 기존 계정 미래 시각, 중단/삭제, collector 멱등성, 첫 검토 조기 실행 방지를 확인했다. 전체 suite/운영 PostgREST/실제 동시 connection 부하/UI browser E2E는 검증 범위가 아니다.

기존 background delivery fixture에 현재 dependency 조회의 limit/table/claim mock이 빠져 있던 것을 보완했다. 제품 발송 코드는 수정하지 않았다. 최초 fixture 실패를 제품 성공으로 계산하지 않았다.

전체 tsc는 별도 변경 중인 src/lib/career/matching/externalSearch.ts:506의 `(string | null | undefined)[]` → `string[]` 오류로 미통과했다. 이번 변경 경로의 타입 오류는 수정했다. git diff --check 통과.

## 실제 모델 입력·출력

최종 실행: `node --import tsx scripts/evalCareerDailyProcessing.ts --dataset v4`.
원본 scheduled 모델 gpt-6-luna/high, production prompt/capability/provider/tool loop. 발송·검색·저장은 fixture adapter이며 실제 외부 발송은 없다.
원본 trace: ignored `runs/2026-11-06T08-34-21-659Z/`의 각 case와 manifest. 전체 요청, 도구 호출, 응답을 읽고 검토했다.

- signup_sparse: 프로필이 없다는 사실을 바탕으로 경력·관심 직무·근무 조건을 답장이나 Career에서 알려달라는 이메일을 작성했다. 온보딩 완료를 선행 조건으로 요구하지 않았다.
- partial_profile: Java/결제 백엔드 5년, 서울·하이브리드 선호를 사용해 탐색했고 fixture 검색에 적합 결과가 없음을 설명하며 연봉·출근 가능일 등 추가 맥락을 물었다. 존재하지 않는 공고를 추천하지 않았다.
- recent_unanswered: 이메일을 다시 보내지 않고 기존 예약의 다음 작업 지시를 조정했다.
- completed combined_updates control: 기존 회사 진행 변경과 선정 Role을 전달하고 소개/공유 권한을 임의로 만들지 않았다.

v2는 v1의 회사 진행 사실이 partial-profile tool fallback에 섞인 fixture 오류가 있어 해당 결과를 품질 근거에서 제외했다. v3는 suggest_form 미구현 fixture 오류를 드러냈다. 입력·gold·제품을 바꾸지 않고 fixture를 보완한 v4 결과를 위에 기록했다. 이전 trace는 보존했다.

네 합성 사례는 일반 성공률이나 무부작용을 보장하지 않는다. 연락 문구·연락 여부는 고정되어 있지 않다. 질문이 여러 개가 될 수 있고 모델이 예약 지시문에 현재 사실을 반복하는 경향도 관측됐다. 이번 변경은 원본 LLM 판단을 실행 시 키워드나 분량 검사로 교정하지 않는다.

## 이후 운영 적용 시

별도 배포 승인이 있을 때 migration과 웹 변경을 함께 적용하고, seed preview에서 대상 수·보류 계정과 existing stopped를 확인한다. seed apply는 예약 생성/인계이며 실제 발송 완료가 아니다. 불확실한 legacy send는 기존 receipt 복구를 마친 후 다시 seed한다. 기존 완료자 예약과 사용자가 직접 수정한 예약은 덮어쓰지 않는다.

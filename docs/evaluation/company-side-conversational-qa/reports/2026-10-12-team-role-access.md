# Team의 Role 접근 범위 검증

2026-10-12 애플리케이션은 로컬 변경이며 코드 배포/운영 전달을 실행하지 않았다. 운영 DB에는 Team migration을 적용하고 bootstrap 정상 조회를 확인했다.

## 모델 행동

호출 전에 동결한 v19의 `20261012-team-access-v19-r1`은 3대화·3발화 실행과 필수 의미 검토 3/3이다. 개발팀과 허용 Role 안내, 이름을 알고 있는 다른 팀 Role의 조회 제한, Owner 전체 접근을 구분했다. 팀별 슬롯 할당을 요구하지 않았고 권한 확장 효과나 제공되지 않은 후보자 정보가 없었다. 구현자 원문 검토이며 독립 팀원 검토는 아니다.

모델은 OpenRouter의 `google/gemini-3.8-flash`, medium, temperature 0.5, progressive다. 원문·입력 hash·provider 응답·소스 snapshot은 owner-only ignored `runs/20261012-team-access-v19-r1/`에 보존한다. Runtime prompt 문자열로 답변을 판정하거나 교정하지 않았다.

기존 frozen v8의 `CSCQ803-multi_role`, `CSCQ806-cross_thread`, `CSCQ810-pipeline_pagination`도 새 run `20261012-team-access-regression`에서 3대화·5발화 모두 실행했다. 대상 Role을 구분하고 기존 연락 저장본을 확인한 뒤 진행했으며, 추가 페이지 조회로 전체 목록을 이어갔다. 별도 `CSCQ801-web`은 `20261012-team-role-start-regression`에서 기존 New role 진입 안내를 확인했다. 이 선택 실행은 전체 v8/Role 작성 gold gate나 실제 등록·전달 성공의 증거가 아니다.

## 서버·DB·UI

- 실제 migration을 격리 PostgreSQL에 적용하고 service_role/authenticated로 Owner 관리, 다른 회사 배정 차단, 자동 팀 배정, Viewer/미배정 계정 생성 차단, 권한 해제 후 범위 유지, Role RLS, 연락 목록/집계, 과거 대화 보존을 검증했다. Service role에게 `auth.users`의 전체 읽기 권한을 주지 않는 조건도 포함했다.
- 실제 로컬 Supabase와 Next API에서 Owner/두 팀 Admin/Viewer의 목록, 다른 팀 Role 직접 읽기·수정 차단, Owner 전용 팀 관리, 팀별 일반 대화 분리를 확인했다. 초기 로컬 Role RLS는 기존 팀원 SELECT 정책의 자기 참조 때문에 실패했다. 해당 정책을 최소 권한 helper로 바꾼 뒤 실제 authenticated 조회에서 허용된 Role만 반환됨을 확인했다.
- 실제 prompt context와 Role 작성 executor는 팀과 Owner 관리 사실을 포함했고, 다른 팀 Role·참고 기준·담당자 데이터는 제공하지 않았다. 새 draft는 현재 팀에 자동 배정되었고 삽입 전 `testOnly` 표시가 적용되었다. Fixture fit 행은 없었다.
- 브라우저에서 팀 생성·배정·이름 변경·팀원 제외·새 팀 재배정·빈 팀 삭제를 저장하고 결과를 확인했다. 제외된 팀원의 API는 Role 0개와 제한된 접근 범위를 유지했다. 데스크톱 목록/편집 패널 및 390px 모바일 바텀시트를 확인했다.
- Slack 수신자 검사는 Owner/동일 팀 허용, 다른 팀/알 수 없는 계정 차단, 다음 페이지 및 조회 불가 차단, 팀 없는 회사의 기존 동작 유지로 검증했다. 실제 Slack·메일 전달은 실행하지 않았다.

검증을 마친 뒤 이 작업에서 만든 로컬 전용 합성 계정 8개, 표시된 Role 5개, QA Organization 2개를 정확한 ID로 정리했다. QA 서버와 로그인 도우미도 종료했고 화면 이미지와 검증 기록만 보존했다.

## 한계와 별도 실패

Team 및 일반 대화·연락·Slack 관련 회귀는 89/89, 최종 TypeScript 검사와 새 Team UI·권한 파일 lint는 통과했다. SQL 검증은 실제 migration 전체를 재실행해 통과했다.

로컬 matching-history 스키마에는 기존 reader가 사용하는 `scheduled_role_ids`가 없어 선택적 이력 context가 unavailable로 남았다. 이 별도 스키마 차이를 Team 작업으로 고치지 않았으며 이를 빈 이력으로 주장하지 않았다.

여러 팀 Role을 함께 다룬 검색 run의 Organization 전체 집계는 팀 제한 계정에 제공하지 않는다. 현재 reader는 허용 Role만 참여한 기록을 반환하므로 팀별 완전한 검색 이력 집계 기능의 검증으로 해석하지 않는다.

Role 작성 prompt 회귀 중 기존 system prompt 길이 `< 17,000` 검사 한 건이 실패했다. 이번 Role 작성 prompt 수정은 user-state 접근 정보만 추가하고 system prompt를 변경하지 않는다. 동시에 존재하는 다른 prompt/copy 변경의 길이 문제이며 실패를 숨기거나 기준을 완화하지 않았다. Team DB·API·모델 gate와 별도다.

코드 배포, 전체 회사 대화/Role 작성 평가, 운영 Slack 수신자 조회·전달, 독립 gold 검토는 이번 결과로 통과를 주장하지 않는다.

## 운영 스키마 복구와 UI 재검증

운영의 `access_scope` 누락으로 bootstrap이 실패하는 것을 해결하기 위해 `20261012130529_organization_team_role_access.sql`을 적용했다. 기존 팀원 기본값은 Organization 전체 접근이다. 요청된 Organization에서 실제 bootstrap 경로가 팀원 2명·Role 8개·팀 0개를 반환했고 DB RLS/service-only 관리 함수와 schema reload를 확인했다. 운영에는 QA Team/Role을 만들지 않았다. Team 관련 security advisor 항목은 없었다.

UI는 중복 제목/섹션 버튼과 긴 오른쪽 패널을 제거했다. 단일 페이지 행동, 수량이 있는 팀원/팀 탭, 평평한 목록, 작은 편집 모달과 접이식 팀원/Role 선택으로 재구성했다. 합성 로컬 데이터로 생성·배정·이름 변경·Role 잔존 시 삭제 차단·빈 팀 삭제, 실제 접근 API, 자동 Team 배정 executor와 390px 모바일 화면을 다시 확인했다. 재검증 후 합성 로컬 계정 4개·testOnly Role 4개·QA Organization 1개를 정확한 ID로 정리하고 QA 서버/로그인 도우미를 종료했다. 최종 TypeScript·대상 UI lint·실제 접근 API 재검증을 통과했다. 화면 증거는 `.local/team-access/redesign-*.jpg`에 보존한다.

## 2026-10-13 복수 팀 확장 회귀

Frozen v19를 변경하지 않고 `20261013-multiple-team-access-v19-r1`로 재실행했다. 현재 Gemini 3.8 Flash / Google provider, production loop·prompt·tool 계약에서 3대화·3발화가 완료됐다. 원문 자체 검토에서 허용 Role·타 팀 조회 제한·Owner 전체 접근·Organization 공용 자원 의미 3/3, 중대한 권한/허위 효과 오류 0이다. 독립 팀원 검토나 복수 팀 모델 행동의 새 gold 검증을 뜻하지 않는다.

별도 실제 로컬 서버/DB에서 복수 팀 Role 합집합, 제외된 Role 차단, 접근 범위 축소 후 대화 분리, Role 생성 전 기본 팀 배정과 담당자 목록을 검증했다. 일반 조회의 선택적인 매칭 이력에는 기존 로컬 `scheduled_role_ids` 누락이 있어 이 경로는 제한된 상태로 실행됐으며 Team 검증 통과와 구분한다. 조회 갱신의 활성/비활성 캐시 및 이전 응답 취소 회귀와 관련 코드 91건, 격리 SQL을 확인했다. 운영 DB 변경·앱 배포·메일/Slack 발송은 하지 않았다.

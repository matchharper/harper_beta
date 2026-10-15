# Organization Team과 Role 접근 범위

2026-10-13 구현 계약. 10/12 단일 팀 스키마는 운영 DB에 적용했다. 10/13 복수 팀 확장 migration도 운영 DB에 적용했다. UI·애플리케이션 변경은 로컬 구현·검증 상태이며 코드 배포는 하지 않았다.

## 제품 범위

Organization은 회사와 결제·Slots·Intro의 관리 단위다. Team은 팀원이 어떤 Role을 조회하고 관리할 수 있는지 묶는 선택적 접근 그룹이다. 팀 없이 기존처럼 사용할 수 있다. 팀별 슬롯·크레딧·요금제·예산 설정은 없다.

팀원은 여러 팀에 배정할 수 있고, Role은 한 팀에 배정한다. 팀 제한 계정은 배정된 모든 팀의 Role에 접근한다. Owner는 모든 팀과 Role을 조회하고 관리한다. Organization 전체 접근으로 지정된 Admin/Viewer도 전체 Role을 조회할 수 있으며, 수정 권한은 기존 Admin/Viewer 구분을 따른다. 팀에 제한된 Admin은 자기 팀 Role을 관리하고 Viewer는 조회한다. 팀에 배정되지 않은 Role은 Organization 전체 접근자에게만 보인다.

## 화면과 관리

- `/org/member`의 팀원 탭에서 권한과 Role 접근 범위를 함께 확인한다. Owner에게는 팀 수가 0이어도 선택적 팀 탭을 제공한다. 팀 생성은 필수가 아니며 빈 화면에서 이를 안내한다.
- 팀 탭에는 이름·팀원·Role 수를 Slots·Billing과 같은 `OrgTable`로 표시한다. Members 탭도 같은 표를 사용하고 두 탭의 최소 너비는 112px이다. Owner 본인에게만 가벼운 전체 접근 안내를 표시한다. 페이지 제목 옆에 현재 탭의 추가/초대 행동 하나만 표시한다. Owner가 팀을 열면 작은 데스크톱 모달/모바일 바텀시트에서 이름과 팀원·Role 배정을 한 번에 저장한다. 팀원/Role 선택은 요약과 펼침 목록으로 표시하며 접근 축소·팀 이동·배정 해제의 효과는 변경할 때 안내한다.
- 생성·이름 변경·삭제·팀원 및 Role 배정·접근 범위 변경은 Owner에게만 제공한다. 초대에는 수락 후 적용할 접근 범위를 저장한다. Owner 초대는 항상 전체 접근이다.
- 기존 팀원이 팀에 배정되면 해당 팀으로 접근 범위가 좁아진다. 한 팀에서 제외되거나 그 팀이 삭제되어도 다른 팀의 배정은 유지한다. 마지막 팀이 없어져도 전체 접근으로 자동 승격하지 않고 ‘팀 배정 필요’로 남는다.
- 배정된 Role을 다른 팀 또는 미배정으로 옮겨야 팀을 삭제할 수 있다. 보관된 Role도 팀 편집에 포함한다. 삭제는 과거 대화의 팀 식별자를 보존하는 논리 삭제다.

## 서버와 company-side LLM

권한 원본은 현재 `company_user_workspace`의 `authority`, `access_scope`, `team_id`다. 사용자 수정 가능한 Auth metadata와 LLM 판단은 권한 원본이 아니다. Role의 팀 배정 원본은 `company_internal_roles.team_id`이며 `company_roles`에는 팀 컬럼을 두지 않는다.

팀에 제한된 팀원이 새 Role 채용을 시작하면 DB 명령이 하나의 transaction에서 Role과 internal 확장 행을 만들고 기본 팀을 배정한다. 처음 배정된 팀이 기본이며, 팀을 추가해도 기존 기본 팀을 유지한다. 기본 팀을 제외하면 남은 팀을 기본으로 정한다. 팀원 접근 범위 편집에서 새 Role의 자동 배정 팀을 표시한다. 팀이 배정되지 않은 제한 계정이나 Viewer는 새 Role을 만들 수 없다. Organization 전체 접근자가 만드는 Role은 미배정으로 시작한다. Team 변경과 생성은 Organization 잠금 및 현재 팀원 권한 확인으로 직렬화한다.

Bootstrap·파이프라인·후보자 상세·이력·연락·미팅·Role 수정과 일반/Role 작성 조회 도구는 허용 Role만 반환한다. 후보자 이동은 출발·도착 Role을 모두 확인한다. 연락·Intro·미팅과 ID만 받는 수정도 실행 전에 연결된 Role을 확인한다. 일반 대화는 접근 가능한 팀 조합별로 분리한다. 단일 팀과 복수 팀 대화를 섞지 않으며, 접근 범위가 줄면 넓은 범위의 과거 대화를 재사용하지 않는다. 공용 Organization 메모에 섞인 Role 정보는 팀 제한 계정에 제공하지 않는다.

LLM 기본 입력과 Role 작성 상태에는 현재 팀원의 팀·권한·접근 범위를 넣는다. 허용되지 않은 Role의 목록·메모·참고 채용 기준은 입력 전 조회 단계에서 제외하며 실행 단계에서도 현재 권한을 다시 확인한다. 단순히 prompt로 숨기도록 요구하는 설계가 아니다.

Role 담당자로 지정하거나 자동 소개 이메일 CC에 포함할 팀원도 현재 Role 접근 권한을 확인한다. Slack의 Role 알림·후보자 결과와 응답은 채널의 모든 수신자가 해당 접근 범위를 갖는지 확인한다. 확인할 수 없으면 공개 채널로 전달하지 않는다. 실제 Slack 전달은 이번 로컬 검증 범위에 포함하지 않았다.

## DB와 검증

Migration: `supabase/migrations/20261012130529_organization_team_role_access.sql`. 관리 RPC는 service-only이며 Owner 확인과 조직 간 배정 차단을 수행한다. Role RLS는 팀 경계를 적용하고 직접 Auth Role/팀원 쓰기로 서버 권한을 우회하지 못하게 한다. 기존 팀원 SELECT 정책의 자기 참조도 제거한다.

Canonical SQL 검증: `node scripts/testOrgTeamAccess.mjs`. 격리 PostgreSQL에서 실제 migration과 service/authenticated 권한을 사용해 Owner 관리, 팀 자동 배정, 조직 경계, 권한 해제, RLS, 연락 집계, 과거 대화 보존을 검증한다. 서버 접근 테스트와 Slack 수신자 검사 테스트는 각각 `teamAccess.test.ts`, `slackTeamAccess.test.ts`다.

모델 평가는 [회사 대화 QA v19](../evaluation/company-side-conversational-qa/README.md)와 [검증 기록](../evaluation/company-side-conversational-qa/reports/2026-10-12-team-role-access.md)에 등록한다. 실제 로컬 UI/API/DB 증거와 합성 모델 평가, 운영 전달 증거는 구분한다.

## 운영 DB 적용 확인

2026-10-12 Harper 운영 프로젝트에 이 migration만 적용했다. 오래 남은 읽기 전용 idle transaction의 잠금으로 첫 시도는 timeout되어 전체 rollback되었다. 해당 연결의 쓰기 transaction ID가 없고 100분 넘게 대기 중임을 확인해 종료한 뒤 재적용했다. 도구가 기록한 migration version `20261012130529`와 저장소 파일명을 일치시켰다.

기존 팀원의 기본 scope는 `organization`이다. 오류가 난 Organization에 대해 실제 `fetchOrgBootstrap` 경로를 실행해 팀원 2명·Role 8개·팀 0개를 정상 반환하고 전체 접근을 유지함을 확인했다. Team 관리 함수는 service-only이고 Team RLS가 활성화되어 있으며, 새 Team 관련 security advisor 항목은 없었다. 운영에 Team이나 QA Role을 생성하지 않았다.

코드 배포는 이 작업에 포함하지 않았다. Notion 배포 문서는 아직 출시되지 않은 Team UI/애플리케이션 동작으로 갱신하지 않는다.

## 2026-10-13 복수 팀·동기화 변경

추가 migration은 `20261013023544_organization_multiple_team_memberships.sql`이다. `company_workspace_team_members`의 영속 사실은 한 Organization 팀원이 어떤 팀들에 배정되었는지이며, 서버 권한 검사·Role RLS·연락 집계·담당자/Slack 수신자·Members UI가 읽는다. 기본 팀은 기존 `team_id`로 유지한다. 초대 시 지정한 팀은 수락 때 같은 배정 관계로 옮긴다.

팀·권한·초대·프로필·제거 변경은 공유 React Query 갱신 경로를 사용한다. 진행 중인 이전 Bootstrap 조회를 취소하고 저장 이후의 최신 상태를 명시적으로 조회해, 같은 Organization의 활성/비활성 조회 키와 모달에 함께 반영한다. 관련 Role 조회는 별도로 갱신한다. 모달 안 Select는 공통 모달의 포커스 범위 안에 목록을 열며 동적인 팀 선택 항목을 전달한다.

왼쪽 메뉴는 Next의 경로 이동 시작부터 목적지의 선택 상태와 로딩 화면을 표시한다. 무거운 페이지 내용은 목적지 shell 안에서 지연 로딩한다. 공통 Checkbox는 크기별 16/20/24px와 `rounded-xs`를 사용한다.

검증: 격리 SQL의 복수 팀 추가/제거·기본 팀 유지·권한·연락 집계, 실제 로컬 API의 Role 합집합·차단·대화 범위, 브라우저의 팀 생성 후 선택 목록 및 Owner→Viewer 직후 배정 목록, 390px 모바일과 페이지 이동을 확인했다. 운영 DB·실제 초대 메일·Slack 발송은 이번 검증에 포함하지 않았다.

## 2026-10-13 운영 DB 복수 팀 적용

사용자의 운영 DB 적용 요청에 따라 Harper 프로젝트에 복수 팀 migration을 적용했다. 운영 기록 version은 `20261013023544`이며 저장소 파일명을 일치시켰다. 첫 시도는 짧은 잠금 대기 제한으로 전체 rollback됐고, 잠금이 해제된 것을 확인한 뒤 재시도에 성공했다. 기존 팀·팀원 권한·Role 배정·일반 대화 식별자의 전후 해시가 동일하며, 이관 누락과 잘못된 대화 범위는 0건이다. 새 배정 테이블의 RLS와 관리 RPC의 service-only 권한을 확인했고, 적용 전후 새 security advisor 항목은 없다. 실제 팀원·Role 배정 변경이나 QA 데이터 삽입은 하지 않았다. 애플리케이션 코드는 배포하지 않았다.

운영 Data API를 통한 앱의 실제 조회 함수도 읽기 전용으로 검증했다. 기존 오류가 발생한 Organization에서 팀원 2명·팀 1개·일반 대화 1건을 조회했고, 복수 팀 관계 조회와 Owner 전체 접근이 정상이다. Bootstrap 전체 실행에 포함된 프로필 동기화·결제 정산은 이번 확인에서 실행하지 않았다.


## 2026-10-14 Role 팀 배정 저장 위치 이동

`20261013155033_move_role_team_to_internal_roles.sql`을 Harper 운영 DB에 적용했다.
Role의 `team_id`는 `company_internal_roles`로 옮기고 `company_roles.team_id`는 제거했다.
외래 키·인덱스·조직 경계 검사와 Role 생성·팀 관리·Role RLS·연락 집계 함수도 새 원본을 사용한다.
새 Role 생성 시 기존 trigger가 만든 internal 행이 있으면 팀만 갱신해 Hiring Brief와 설정을 보존한다.
팀이 배정된 Role을 다른 Organization 또는 외부 공고로 바꾸는 쓰기는 차단한다.

기존 배정 2건을 모두 보존했다. 운영 적용 전후 Role 배정, internal 행 73개의 팀 외 모든 필드,
팀원 권한과 복수 팀 관계의 해시가 같으며 조직 경계 불일치와 기존 컬럼을 참조하는 함수는 0건이다.
관리 함수는 기존 service-only 권한을 유지하며 새 security advisor 항목은 없다.

서버 조회·회사 대화의 Role 조회·담당자와 Slack 수신자 검사·타입도 새 원본으로 수정했다.
팀별 목록은 internal 행의 팀 조건을 부모 Role에도 적용한 뒤 정렬·페이지 제한을 수행한다.
격리 SQL은 이관 보존, 새 Role 배정, 조직 경계, 권한 해제, RLS, 연락 집계와 과거 대화 보존을 검증한다.
TypeScript 검사와 서버/Slack 권한 테스트 12개가 통과했다. 운영 Data API에서도 실제 배정 2건의
관계 조회, 팀 조건의 부모 Role 필터링, 배정되지 않은 팀의 빈 결과를 읽기 전용으로 확인했다.
Worker에는 이 컬럼의 사용 경로가 없어 수정이 필요하지 않았다.
운영에 QA 데이터나 메시지는 만들지 않았으며, 웹·Worker 코드는 배포하지 않았다.

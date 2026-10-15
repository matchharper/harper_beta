# Company-side Codex 작업 지도

문서 기준: 2026-10-15

## 1. 현재 범위

새 Role 등록 후 Harper가 예시 프로필을 자동으로 준비·전달하고 피드백을 받던 calibration 작업은
종료했다. 로컬 listener, fallback automation, 전용 helper·prompt·tool·API·화면과 전달 후
12시간 검색 예약은 제거한다. 사용자가 직접 제공한 실제 참고 인물로 Hiring Brief를 다듬는
별도 기능은 유지한다.

일반 후보 검색은 기존 Company Matching Worker의 Role별 예약과 회사의 명시적 Run Search
요청을 따른다. 정기 검색 설정·실제 추천·소개·회사 대화와 저장된 Hiring Brief는 유지한다.

| 작업 | 기준 | 현재 실행 경계 |
| --- | --- | --- |
| 정기/명시적 후보 검색 | [Company-first Worker 계약](../company/company-first-talent-search-worker-implementation-plan-ko.md) | 기존 Python scheduler와 Worker |
| 회사 활동 기반 Hiring Brief 갱신 | [48시간 런북](./company-role-request-refresh-48h-ko.md), [기준 도출 계약](./company-side-data-request-calibration-ko.md) | canonical helper의 preflight를 확인하며, 문서 자체를 구현·활성화 증거로 보지 않음 |

## 2. 48시간 Hiring Brief 갱신

48시간 작업의 첫 질문은 “Role을 바꿔야 하는가?”가 아니라 “새로운 company-side evidence가
있는가?”다. 단순 조회, 시스템 event, 후보자의 반응, 이유 없는 운영 stage 변화는 실행 대상이나
새 회사 기준이 아니다.

다음 둘을 분리한다.

- 회사가 직접 `이 기준을 추가/수정/삭제해 달라`고 말했는데 아직 반영되지 않은 경우: 그 발화가
  해당 변경의 명시적 authorization이므로 expected-value 보호가 있는 canonical path로 반영한다.
- 여러 후보 결과와 피드백을 종합해 Codex가 새 기준을 추론한 경우: old/new diff와 근거를
  proposal로 남긴다. 회사 또는 권한 있는 owner의 확인 전에는 `request`를 쓰지 않는다.

이 구분은 scheduled 실행을 켠다는 이유로 약화되지 않는다.

## 3. Codex Scheduled task 계약

48시간 작업은 project-local standalone Codex Scheduled task 하나로 운영한다.

- 이름: `Harper company role request refresh`
- 주기: 2일마다 오전 09:30 KST
- 작업 directory: repository root. Prompt가 절대 checkout 경로를 실행 계약으로 사용하지 않고
  `harper_beta/`를 찾은 뒤 이 문서를 읽게 한다.
- 알림: 정상 no-op·정상 완료는 조용히 끝낸다. Preflight 실패, 반복 write conflict, 처리하지 못한
  backlog 또는 사람 확인이 필요한 proposal이 있을 때만 알린다.
- 실행 prompt: 이 문서와 [48시간 런북](./company-role-request-refresh-48h-ko.md)을 처음부터 끝까지
  읽고 canonical helper로 queue를 drain하라는 짧은 지시만 둔다.

Codex desktop의 local Scheduled task는 지정된 컴퓨터가 켜져 있고 앱이 실행 중이어야 한다.
새 컴퓨터로 clone한 것만으로 host-local task와 secret이 복제되지는 않는다. 해당 작업의 런북에 따라 preflight해야 한다.

## 4. 제거 반영 상태

2026-10-15 운영 DB에서 예시 프로필 테이블과 21개 set, 관련 함수 18개·트리거·전용 인덱스,
예시 프로필을 제공한다고 설명하던 검색용 답변 자료를 제거했다. 미처리 관련 검색·후속 작업은
0건이다. 기존 완료된 검색과 회사 대화는 역사적 사실로 유지한다.

로컬 listener는 중지·등록 해제했으며 fallback automation도 삭제했다. 웹 코드 제거는 로컬
변경으로, 별도 배포 승인을 받기 전에는 운영 웹 반영을 주장하지 않는다.

현재 배포본의 일반 채팅과 Role 화면은 예전 관계명을 조회하므로, 운영 DB에는
company_role_calibrations 이름의 빈 읽기 전용 호환 뷰만 남긴다. 데이터·쓰기 권한·trigger가
없으며 작업을 생성하거나 실행하지 않는다. 새 웹 버전이 배포돼 reader 제거를 확인한 뒤에만
이 뷰를 삭제한다. 제거 migration은
supabase/migrations/20261014173559_retire_company_role_profile_calibration.sql이다.

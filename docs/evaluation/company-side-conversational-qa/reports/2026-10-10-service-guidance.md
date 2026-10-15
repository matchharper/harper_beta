# 회사 서비스 안내·검색 자료 갱신 검증

## 변경과 범위

회사 서비스 Q&A 39개와 한국어·영어 Documents를 현재 구현 기준으로 정리했다.
일반 Workspace의 결제 메뉴가 일시 중단된 범위를 설명하도록 서비스 core를 보완했다.
첫 실행에서 연결 기능을 모두 유료로 일반화한 답변을 확인해, 공용 크레딧으로 요청한 Intro는
후보자 수락 후 슬롯 없이 연결된다는 공통 계약을 명확히 했다. 시나리오별 분기는 추가하지 않았다.

## LLM 실행

동결 `cases-v18.json`, `gold-v18.md`, `manifest-v18.json`은 변경하지 않았다.
Canonical runner는 `scripts/evalCompanyAgentCapabilities.ts`이며 합성 도구를 사용하는 production loop다.
모델은 `google/gemini-3.8-flash`, OpenRouter, reasoning medium, temperature 0.5다.
DB·Slack·이메일 side effect는 없으며 원문과 source fingerprint는 owner-only ignored `runs/`에 보존한다.

| Run | 선택 범위 | 실행 | 원문 검토 |
| --- | --- | --- | --- |
| `20261010-service-guidance-pricing` | 가격 2대화, 공용 크레딧 2대화 | 4/4대화, 5/5발화 | 한국어 가격·영어 슬롯 경계는 충족. 한국어 공용 크레딧 답변이 최종 연결을 유료로 일반화. 영어 가격은 공개 가격 링크를 생략해 frozen gold 전체 충족으로 계산하지 않음 |
| `20261010-service-guidance-shared-r2` | 동일 공용 크레딧 2대화 | 2/2대화, 3/3발화 | 2/2 의미 충족: 독립 공용 크레딧·차감 순서·교차 사용 금지·만료 시 Role 유지·슬롯 없는 Intro 연결·연결 대기 슬롯 조건을 구분 |

가격 두 답변은 결제 메뉴가 제공될 때만 Slots/Billing으로 안내하고, 메뉴가 없으면 Harper 팀에 문의하도록 설명했다.
이 조건부 안내는 현재 rollout에 맞는 보완이며 frozen gold를 덮어쓰지 않았다.
최종 core의 가격 대화 재실행, 두 크레딧 부족 액션, 전체 v18 release gate, 독립 팀원 검토와 실제 전달 E2E는 미검증이다.
선택 실행의 결과를 전체 회귀 통과로 보고하지 않는다.

## 별도 확인

- Q&A·문서·검색 cache 관련 자동 검사 38개, 수정 파일 lint, 프로젝트 타입 검사 통과.
- 로그인된 로컬 Documents에서 한국어·영어 본문, 목차 이동, FAQ 펼치기와 복사 버튼 번역을 확인했다.
  확인용 언어 설정은 원래 한국어로 복원했다.
- 회사 답변 DB의 기존 한국어 23행 ID와 career 11행을 보존하면서 한국어 39행·영어 39행을 등록했다.
  내용·tags·활성화 상태·질문 hash·embedding model·차원을 읽어 확인했다.
- production 검색 함수의 기본 top 3·최소 유사도·timeout으로 8주제 × 두 언어, 16질문을 확인했다.
  한국어만 등록한 첫 확인은 13/16, 같은 승인된 영어 Q&A도 등록한 뒤 동일 질문은 16/16에서
  해당 답변을 상위 3개 안에 반환했다. 이는 이 16질문의 검색 확인이며 전체 검색 품질 평가가 아니다.
  readback·질문·결과 원문은 `.local/company-service-guidance-20261010/`의 owner-only 파일에 보존한다.
- 검색 자료 반영은 이 요청의 별도 데이터 작업이다. 코드 배포와 Notion 문서 갱신은 실행하지 않았다.

# 후보자 동의 후 Role 이동 — 2026-10-20

로컬 구현 검증 기록이다. 운영 DB 변경, 연락 발송, 웹·Worker 배포는 하지 않았다.
이 문서는 최초 검증 시점의 기록이다. 이후 사용자 승인으로 수행한 운영 DB 적용·실제 연락 결과는
[별도 실제 연락 검증 기록](2026-10-20-role-move-live.md)에 보존한다.

## 변경

- 후보자 상세의 Role 이동 모달을 Accept Intro와 같은 두 선택 행으로 정리했다.
  Harper가 물어보기를 기본 선택으로 제공하고, 직접 대화한 경우 해당 선택과 이동 버튼으로 처리한다.
- 먼저 제안 가능한 후보는 회사 제안 목록만 옮긴다. 이미 제안을 보낸 답변 대기 후보는 이동을 막는다.
- 그 외 후보자는 기존 연락 경로로 의사를 묻고, 회사가 미리 승인한 목적지·단계를 실제 후보자 수락 후 적용한다.
  원본 company-side LLM이 답변 의미를 판단한다. DB는 신원·승인 범위·현재 상태·재시도만 확인한다.
- 기존 요청·메시지·연락·이동 도구를 확장했다. 별도 판단 모델·중간 상태 테이블은 추가하지 않았다.

## 최초 확인 결과

| 범위 | 결과 |
| --- | --- |
| API·PGlite | 12개 통과. 두 Role 접근 권한, 직접 동의 체크, 제안 전/답변 대기 분기, 문의 중 원래 위치 유지, 재시도 시 연락 중복 방지, 정확한 승인·답변 참조, 취소·더 새로운 답변·상태 변경 차단 |
| 타입·린트 | TypeScript 검사 및 새 모달·API·공통 helper·contact context/prompt 대상 린트 통과 |
| 브라우저 | 실제 모달·공통 UI·전역 CSS를 로컬에서 렌더링. 데스크톱 1200×758, 모바일 390×700, 작은 모바일 영문 320×568 확인. Role/단계 선택, 직접 동의 전 실행 차단, 직접 이동 결과, 문의 접수 후 위치 유지, 제안 전/답변 대기 화면, Escape 닫기 확인 |
| 실제 company-side LLM v36 | 수락은 정확한 Role·단계·relay로 이동 도구 1회. 거절 및 조건부 관심은 이동·추가 연락 0. 3/3 원문 의미 확인 |
| 기존 frozen v24 선택 1건 | `CSCQ2401-pending_contact_conditions`: 연봉 확인 후 결정하겠다는 조건을 보존하고 이동·추가 연락 없이 회사에 전달 |

Canonical 실행은 `scripts/evalCompanyAgentCapabilities.ts`이며 run은
`20261020-role-move-consent-r1`, `20261020-role-move-v24-r1`이다.
현재 기본 Gemini 3.8 Flash/OpenRouter 설정과 실제 source/input hash는 각 ignored run manifest에 보존했다.
원문·tool trace·수동 판정은 ignored runs의 0700/0600 파일에만 저장했다.

기존 `contactEventPrompt.test.ts`는 3개 중 2개 통과, 1개 실패했다.
실패는 별도 작업에서 이미 변경된 `chat.ts`의 `allowSilentCompletion` 표현을
문자열 `allowSilentCompletion: true`로 고정해서 찾는 기존 검사다.
이번 Role 이동 로직의 실패와 구분하며 관련 없는 실행 코드·검사는 수정하지 않았다.

## 후속 답변 연결 검증과 수정

최초 검증은 전체 연락 왕복을 입증하지 못했다. 실제 `contact_company`는
연결 ID로 답변을 보내며 특정 요청 ID를 요구하지 않는다. 반면 최초 completion RPC와
테스트 fixture는 답변에 요청 ID가 저장되어 있다고 가정했다. 실제 형태의 답변을 넣자
`consent_not_found`로 실패하는 것을 재현했다.

- completion RPC가 실제 후보자 원문·연결을 확인한 뒤 같은 연결의 최신 회사 이동 승인을 읽도록 수정했다.
  답변 의미와 해당 제안에 대한 수락 여부는 계속 원본 company-side LLM이 판단한다.
- 후보자에게 질문이 실제 전달되었고 그 이후 답변이 작성되었는지 기존 발송 기록으로 확인한다.
  실제 취소 경로인 요청 `closed` + 발송 `cancelled`, 미발송, 답변 뒤 발송도 이동을 허용하지 않는다.
- 답변을 받은 후 회사가 새 요청을 만들 수 있게 했다. 새 이동 승인보다 이전인 답변은 실행하지 않는다.
- Role 이동 API·DB wrapper·표시 분기 15개 검사가 통과했다. 일반 답변의 요청 ID가 null인 경우,
  전달 시점·취소, 새로운 요청으로 승인 교체, 재시도 중복 방지를 포함한다.
- 같은 frozen v36을 `20261020-role-move-consent-r2`로 재실행했다.
  실제 모델은 명확한 수락에서 정확한 Role·단계·relay로 이동 도구를 한 번 호출하고,
  거절·조건부 관심에서는 이동하지 않았다. 회사 응답 원문 3건도 의미 검토했다.
  DB 실행은 adapter이므로 이 결과만으로 전체 연락 왕복 성공을 주장하지 않는다.

관련 기존 `relayDeliveryStatus.test.ts`도 실행했으며 2개 중 1개가 실패했다.
이 fixture는 모든 RPC에 relay 객체를 반환하므로 별도 작업에서 추가된
`ops_private_contact_for_recommendation_v1` 조회에도 truthy 객체가 돌아가 Ops 분기로 진입한다
(`recorded` 반환, 기존 예상은 `queued`). 이번 Role 이동 검증과 구분해 기록하고
관련 없는 Ops 코드와 테스트는 변경하지 않았다.

운영 DB의 함수 정의를 읽기 전용으로 확인했다.
`move_org_candidate_role_web_v1`, `complete_org_candidate_role_move_v1`은 확인 시점에 존재하지 않았다.
운영 DB 변경·발송·배포는 수행하지 않았다.

## 한계와 운영 반영

- 브라우저의 데이터·API는 격리 fixture다. 실제 모달을 사용했지만 인증된 전체 앱과 운영 API 왕복은 실행하지 않았다.
- PGlite는 새 승인·이동 wrapper를 실행하고 기존 연락·pipeline RPC는 테스트 대역을 사용한다.
  기존 RPC의 실제 운영 정의는 읽기 전용으로 확인했다. 운영 메일·Slack 전달 E2E는 포함하지 않는다.
- LLM은 합성 3건과 기존 frozen 1건이며 작성자 검토다. 전체 분포나 독립 검토를 입증하지 않는다.
- `20261020114613_org_candidate_role_move_web.sql`은 갱신된 로컬 migration이다.
  실제 적용 상태를 확인한 뒤 DB 변경과 웹 배포가 필요하다. 별도 새 Worker 경로는 추가하지 않았다.

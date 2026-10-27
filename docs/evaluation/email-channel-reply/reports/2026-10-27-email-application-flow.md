# 이메일 지원 준비 흐름 검증 — 2026-10-27

로컬 구현 확인이며 배포·운영 DB 변경·실제 이메일 발송·실제 회사 지원은 하지 않았다.

## 변경과 원인

- 이메일 도구/작성 계약에서 현재 보유 문서를 읽고 적합한 이력서를 모델이 스스로 선택하도록 명시했다. 복수 파일이 있다는 이유로 선택 확인 메일을 보내지 않는다. 읽을 수 있는 이력서 자체가 없으면 필요한 원본을 요청하는 예외는 유지한다.
- 첫 검토 이메일에서 지원 요청을 맡고 수정 제안과 질문을 독립 번호로 구분한다. 자연어 승인·직접 수정 지시는 기존 `manage_application_suggestions`와 `ready_for_role`로 바로 반영한다. 웹의 선택 카드·버튼 및 도구 설명은 유지했다.
- 기존 이메일 executor는 이미 양식 확인을 기다린 뒤 제안 작성기를 호출했다. 이를 지연된 inspection 테스트로 확인했고, 확인된 필수 항목·파일 형식·작성 제한·대리 지원 접근 가능 여부를 전용 텍스트 projection으로 작성기에 전달한다. 웹의 후속 양식 확인 순서는 유지했다.
- 공용 수정 도구는 `modelOutput`에 웹 composer 안내를 넣고 있었다. 이메일 wrapper가 `assistantInstruction`만 바꾸면 provider serializer가 기존 `modelOutput`을 우선하여 이메일용 최신 상태·계속 실행 안내가 누락될 수 있었다. 이메일 application 도구의 provider 출력도 새로 구성하고 최신 문서·결정·접수 근거를 함께 전달하도록 수정했다.
- 이메일 기본 application context는 실행 객체 JSON 대신 필요한 원문·ID·revision·양식·결정·브라우저 결과를 고른 텍스트로 제공한다. 중복 웹 context와 미응답 질문의 과거 snapshot은 제거했다. 원본 문서/사용자 답변은 자르지 않고, 시스템 날짜는 공통 formatter를 사용한다.

## 실행과 검토

동결 `application-email-flow-v1` 2대화/4턴. canonical runner는 `scripts/evalEmailRuntimeReplies.ts`. 실제 `claude-haiku-5-5` 이메일/제안 작성 모델과 일반 tool loop, 로컬 DB 저장, capture 이메일을 사용했다. JD·양식·제출 receipt는 합성 경계다. source/frozen hash 및 원본 provider 요청·응답은 ignored owner-only runs에 보관한다.

| 실행 | 결과 |
| --- | --- |
| `20261027-email-flow-a` | 로컬 DB VM이 꺼져 시작하지 못함. 모델 호출 전 실패. |
| `20261027-email-flow-b` | 이력서 자동 선택 후 준비 도구 호출을 확인했으나, 로컬 DB의 `company_roles.salary_is_predicted` 누락으로 준비 실패. 동작 통과로 보지 않음. |
| `20261027-email-flow-c` | 로컬 전용 정본 migration `20261014190827_external_role_predicted_salary.sql` 적용 후 두 대화 4답장 완료. 복수 원본 중 기본 이력서를 선택하고 첫 답장에 수정/질문을 구분. 승인 뒤 문서 저장 및 합성 접수 1회, 직접 수정 뒤 문서 저장/수동 지원 안내. |
| `20261027-email-flow-d` | 수동 지원 후 완료 여부 답장을 요청하는 작성 계약까지 반영하여 해당 대화 2턴 재실행. 지정한 성과 문장 저장, 문서/지원 링크 및 완료 여부 답장 요청 확인. |

완성된 답장 원문/HTML과 실제 저장 이력서를 수동으로 읽었다. 자동 선택 사례의 원본 2개는 보존됐고, 새 문서의 날짜·경력·합성 테스트 성과 조건을 확인했다. 직접 수정 사례는 “합성 테스트에서 API 지연 시간을 40% 줄임”을 저장했다. 재확인 이메일은 없었다. 지원 가능한 합성 경계에서는 준비 문서와 접수에 사용한 document ID가 같았고, 로그인 차단 사례에서는 접수 실행이 없었다. 각 실행의 fixture talent/role은 정확한 ID로 정리되어 0건이다.

실제 provider의 tool_result도 읽어 현재 email application context와 계속 실행 안내가 전달되고 과거 “The composer shows…” 출력이 남지 않는 것을 확인했다. inspection 결과는 제안 작성기의 실제 입력에도 전달됐다. 구조적 검증은 관련 테스트 30개와 TypeScript 검사 통과. 지연된 inspection이 끝나기 전에는 작성기가 호출되지 않으며, 웹의 기존 background inspection 테스트도 통과했다.

## 한계

이 평가는 실제 Browserbase 사이트 조작, PDF 영구 파일 생성/업로드, 실제 회사 접수 또는 운영 Queue/메일 전달 검증이 아니다. 합성 브라우저 adapter는 승인된 작업의 receipt 경계를 대체하며 최신 실행 계약의 approval/executed 근거를 함께 기록한다. 원본 이력서에 구조화 내용이 없는 경우 모델이 structured read를 시도해 오류를 받은 뒤 제공된 원문으로 정상 복구한 실행이 있었다. 최종 완료 메일에 선택 질문 생략 등 불필요한 설명이 조금 남을 수 있으며, 이 작은 합성 표본을 전체 응답 품질의 보장으로 해석하지 않는다.

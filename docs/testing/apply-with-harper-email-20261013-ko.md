# Apply with Harper 이메일 구현 검증

기준: 2026-10-13 로컬 구현 검증, 2026-10-14 운영 DB 적용 확인. 이번 작업에서는 웹/Worker 코드를 배포하지 않았다.

## 구현한 흐름

- 이메일의 `simulate_application`은 선택한 이력서·역할로 준비를 시작한다. 웹 시작 카드는 유지한다.
- 이메일 준비는 기존 수신 job에 연결된다. JD와 실제 양식 읽기를 마친 뒤 공통 suggestion writer를 호출한다. 제안 원문·질문·작성물·선택지는 본문에 포함된다.
- 기존 Career LLM이 대화와 현재 활동을 읽어 자연어 답장의 의미를 판단한다. 별도 분류기, 긍정 단어 목록, 예시 표현 전용 분기는 없다.
- 웹과 이메일은 제안 결정·이력서 저장 executor, 세션/응답 서비스, 지원 브라우저를 공유한다. 이메일 adapter만 도구 노출·메일 표현·진행 작업 재개를 담당한다.
- 준비/지원이 미완료이면 같은 job이 재개되고, 정상 대기는 실패 횟수를 소비하지 않는다. 새 답장은 먼저 해석하고 진행 작업을 이어받는다. 현재 수신 메시지보다 새 사용자 메시지가 있으면 오래된 job은 실행/답장하지 않는다.
- 사용자가 맡긴 제출은 기존 보류 요청과 실제 사용자 지시를 함께 읽고 계속한다. 승인에는 실제 source message를 기록한다. 새 필수 정보·중요한 작성물은 질문으로 돌아온다. 파일 fingerprint와 실제 접수 증거 검증은 기존 경로를 유지한다.
- 문서는 인증된 절대 URL로 안내한다. 대신 제출할 수 없는 경우 LLM이 관측된 이유와 직접 지원 링크를 안내한다. 메일 첨부 export는 새로 추가하지 않았다.

## 다양한 입력에 대한 코드 점검

| 상황 | 처리 근거와 확인 범위 |
| --- | --- |
| 이력서 없음 | 기존 문서 조회/이메일 첨부 저장/이력서 생성 도구를 제공한다. 사실과 사용자 지시가 충분한지는 원본 LLM이 판단한다. 읽을 이력서 없이 시작하면 실행기가 설명 가능한 실패 결과를 반환한다. 없는 내용으로 빈 활동을 만들지 않는 테스트 통과. |
| 파일이 있으나 본문 추출 실패 | 읽을 수 있는 자료를 요청하는 결과를 반환하고 시작하지 않는다. 테스트 통과. |
| 짧은 이력서 | 길이 기준으로 거절하거나 질문 개수를 늘리지 않는다. 공통 writer가 중요한 누락만 판단한다. 짧은 원문 전달 및 변경 제안 0개 허용 테스트 통과. |
| 긴 이력서 | 초기 writer와 이메일 대화 context에 원문 전체를 전달한다. 생성 이력서는 revision·구조화 내용도 제공한다. 약 15만 자 원문 끝까지 보존하는 테스트 통과. 모델의 context/output 한도 자체를 없앤 것은 아니며 매우 큰 문서의 실제 모델 품질은 별도 확인이 필요하다. |
| JD/양식 확인 가능 | 이메일에서는 읽기 완료 후 제안을 작성한다. 라이브 JD와 관측 양식이 writer 입력에 함께 들어가는 순서 테스트 통과. 웹은 기존 백그라운드 양식 검사를 유지한다. |
| JD/양식 확인 불가 | 기존 unavailable/limitations 결과를 사용한다. 확인되지 않은 요건을 없다고 단정하지 않도록 공통 prompt를 유지한다. |
| 일부 동의·수정·질문·보류·중단 | 일반 대화 LLM과 기존 suggestions/session 도구로 처리한다. 승인 문구 파서나 사례별 상태를 추가하지 않았다. 실제 표현별 판단 정확도를 이번 단위 테스트가 증명하지는 않는다. |
| 변경 없이 준비 완료 | 공통 `ready_for_role`의 reuse 경로를 사용한다. 승인한 변경이 남아 있으면 reuse로 우회할 수 없는 기존 테스트 통과. |
| 늦은 응답·중복 시작·수정 충돌 | 실제 source 소유권, 최신 메시지 확인, 현재 batch/item/option identifier, revision, 기존 멱등 키를 검증한다. 오래된 질문 ID·잘못된 선택지·동일 source 재시도 테스트 통과. 과거 메일을 인용한 답장의 의미는 LLM이 판단한다. |
| 제출 실패/불확실 | 공통 브라우저 결과를 이메일 LLM에 제공한다. 업로드를 접수로 표현하지 않으며 불확실한 제출을 자동 재시도하지 않는 기존 계약을 유지한다. |

## 실행 검증

관련 12개 테스트 파일의 76개 테스트 통과. 실제 네트워크 호출을 금지하는 단위 테스트 preload와 합성 fixture를 사용했다. SQL은 PGlite에서 기존 migration과 새 migration을 함께 실행했다. 운영 데이터·회사 지원·메일 발송은 사용하지 않았다.

```sh
node --require ./scripts/lib/serverOnlyTestPreload.cjs --import tsx --test \
  src/lib/career/simulation/server.test.ts \
  src/lib/career/simulation/activity.database.test.ts \
  src/lib/career/simulation/applicationInspection.test.ts \
  src/lib/career/simulation/readyForRole.test.ts \
  src/lib/career/simulation/applicationInput.test.ts \
  src/lib/career/simulation/applicationBrowser.test.ts \
  src/lib/career/simulation/preparationService.test.ts \
  src/lib/career/simulation/suggestions.test.ts \
  src/lib/email/runtime/application.test.ts \
  src/lib/email/runtime/tools.test.ts \
  src/lib/email/runtime/prompt.test.ts \
  src/lib/email/runtime/format.test.ts
pnpm exec tsc --noEmit --incremental false
```

변경한 실행 경로와 테스트에 대한 targeted ESLint도 통과했다.

## 적용 조건과 검증 한계

`20261013141544_email_application_start.sql`은 기존 활동 생성 함수가 웹 offer 외에 본인 수신 메시지도 출처로 받게 한다. 새 테이블은 없다. 해당 migration은 2026-10-14 운영에 적용했다. 전체 흐름 사용에는 해당 코드의 운영 반영도 필요하다. 이메일 실행기는 기존 `vercel_queue` 경로를 사용하며 레거시 별도 worker를 변경하지 않았다.

이번 범위는 코드 검토·단위/회귀 테스트·로컬 SQL 테스트다. 실모델 다중 턴 평가, 실제 메일 공급자와 callback 재전달 통합, 외부 지원 사이트 접수, 로그인 후 문서 복귀는 실행하지 않았다. 실모델 평가를 추가할 때는 기존 evaluation registry와 해당 task의 frozen 입력/gold 계약을 따른다.


## 2026-10-14 운영 DB 적용 및 재검증

- 사용자 요청으로 Harper 운영 프로젝트 `zzojrniuppueizhnmqfd`에 `email_application_start`를 적용했다. 운영 migration version은 `20261014024819`이며 로컬 파일은 `20261013141544_email_application_start.sql`이다. 같은 변경을 다시 적용하지 않는다.
- 사전 조회에서 운영 함수에는 질문 batch별 메시지를 기록하는 기존 처리가 남아 있었다. 전체 함수 교체 대신 기존 함수의 시작 출처 검증·offer 갱신 부분만 변경하도록 migration을 보완했다. 운영의 질문 기록 처리와 로컬의 기존 처리 모두 그대로 보존한다. 예상한 시작 코드가 없으면 migration이 중단된다.
- 적용 뒤 `pg_get_functiondef` 전체가 사전에 계산한 예상 정의와 정확히 일치했다. `SECURITY INVOKER`, anon/authenticated 실행 불가, service_role 실행 가능을 확인했다.
- 운영 함수에 존재하지 않는 임의 사용자·대화 식별자를 전달하는 검사가 `Conversation unavailable`로 정상 차단됐다. 실제 사용자 데이터나 테스트 지원 기록을 생성하지 않았다.
- 관련 회귀 테스트 76개 재통과. migration 보완 후 이메일 시작·소유권·읽을 이력서·중복 시작·revision·웹 호환성을 다루는 로컬 DB 테스트 2개를 추가 재실행해 통과했다.
- 이번 확인은 DB 반영과 코드/SQL 테스트다. 실제 이메일 발송과 외부 사이트 접수 E2E는 실행하지 않았다. DB 변경만으로 이메일 전체 기능의 운영 반영을 주장하지 않는다.
- 팀원용 Notion 문서는 변경하지 않았다. 이번에는 웹/Worker 배포가 없으며 사용자에게 보이는 전체 흐름이 운영에 반영됐는지 확인하지 않았기 때문이다.


## 2026-10-14 배포 없는 실제 LLM 대화 실행

[실제 모델 검증 기록](../evaluation/email-channel-reply/reports/2026-10-14-application.md)에 준비 요청·승인·지원 결과, 직접 지원, 이력서 없음의 3개 대화/5개 답장을 기록했다. 실제 이메일 실행기·모델·공통 도구·DB·이력서 저장·메일 renderer를 사용했다. JD/양식/사이트 접수와 메일 전송은 합성/capture 경계다. 실행 중 발견한 언어 전달, source 기반 재개, 불필요한 답장 복구 호출을 수정하고 재실행했다. 외부 사이트의 실제 폼 입력/업로드/접수까지 검증한 것은 아니다. 운영 배포는 하지 않았다.


## 검토 메일 작성 구조 개선

기존 title/reason/question을 텍스트로 조립하던 경로를 제거하고 Career LLM이 설명과 질문을 포함한 메일 전체를 작성하도록 했다. 정확한 원문만 inline passage ref로 삽입한다. 이상적인 작성 예시 네 개를 추가하고 실제 모델로 검토·완료·이력서 없음·중간 설명 질문을 재실행했다. 누락된 종료일을 현재 재직으로 단정하던 context도 수정했다. [구조와 작성 품질의 검토 기록](../evaluation/email-channel-reply/reports/2026-10-14-application-writing.md)에 남은 출력 한계와 전체 TypeScript 검사 오류도 기록했다.


## 2026-10-14 전체 본문 LLM 작성

사용자의 추가 요청에 따라 inline passage ref와 치환·필수 ref 검사·별도 검토 전달 fingerprint를 제거했다. 수정 전후 문구와 작성물은 기존 pending batch에 원문으로 제공하고, Career LLM이 인용·설명·질문·링크를 포함한 본문 전체를 직접 작성한다. 답변 뒤에 Career 링크를 붙이던 처리와 이메일에 웹 공고 fallback 링크를 추가하던 처리도 제거했다. 이메일 대화 및 이메일 지원 제안 모델은 `claude-haiku-5-5`다. 실제 모델 재실행과 한계는 [전체 본문 작성 검증](../evaluation/email-channel-reply/reports/2026-10-14-full-email-authoring-haiku.md)에 기록한다. 운영 배포·DB 변경은 없다.


## 2026-10-14 승인·현재 실행/완료 기록 연속성

기존 e에서는 긍정 후 같은 날짜 질문으로 멈췄다. 실제 실행 ID를 현재 이메일 처리 기록에 연결하고, 이후 이메일에서도 같은 대화의 완료된 application record를 owner-check RPC로 읽도록 수정했다. 누락 값과 근무 기간 요약을 명시된 날짜와 구분해 제공하며, 승인 후 충분한 원문으로 가능한 작업은 선택 질문을 재요구하지 않고 진행한다. 실제 필수 미확인 사실은 해당 항목만 확인한다. 본문 recovery도 caller가 선택한 모델을 유지한다. 새 frozen 3대화·7턴 및 Haiku 최종 재실행, 61개 회귀의 [검증 기록](../evaluation/email-channel-reply/reports/2026-10-14-application-continuity.md)을 참고한다. 운영 배포·migration은 없다.

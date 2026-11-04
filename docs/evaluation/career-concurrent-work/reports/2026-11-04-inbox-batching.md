# Career pending 입력 병합 검증 — 2026-11-04

일반 사용자 메시지마다 별도 실행을 예약하던 경로를 대화 inbox로 교체했다. 원본 메시지는 개별 저장하고, 다음 모델 호출에 아직 전달하지 않은 원문을 ID 순으로 하나의 user 메시지에 넣는다. 이것은 입력 전달 보장이다. LLM의 의미 판단이나 실제 외부 제출의 성공률을 보장하는 검사는 아니다.

운영 변경·배포·실제 채용사 제출은 하지 않았다. 검증은 `localhost:3020`, `harper-local-e2e` marker가 있는 로컬 Supabase와 합성 계정 `activity-status@harper-local.test`에 한정했다. 기존 사용자 계정의 추천 5개와 프로필은 변경하지 않았다.

## 구현 경계

- `queue_career_invocation`: 원본 메시지 저장 transaction에서 열린 대화 inbox에 ID 추가. 동일 client request ID 재전송은 원래 원본을 반환한다.
- `claim_career_inbox`: 대화 실행권 획득. 기존 미시작 메시지별 호출을 병합하되, 저장된 transcript·전달된 답변은 버리지 않는다.
- `read_career_inbox`와 `createCareerInputInbox`: 미전달 원문을 읽고 기존 첨부·폼 formatter로 한 번만 append한다. 숨김은 실행 취소가 아니며 사용자 원문의 날짜도 변형하지 않는다.
- `checkpoint_career_inbox`: 실제 provider transcript와 전달 ID를 같은 transaction으로 저장한다. 실행권·소유권·ID 범위·전달 이력의 역행을 확인한다.
- `finish_career_inbox`: 응답 생성 도중 도착한 미전달 입력을 원자적으로 새 inbox에 인계한다. processor는 successor를 발행하고 바로 이어갈 수 있다. 실패·대기 시 원래 queue delivery만 재시도하다 successor를 잃지 않게 한다.
- 일반 이력·summary와 pending 입력을 중복 주입하지 않는다. pending 이후 저장된 assistant 결과는 이력에 남긴다. 외부 효과의 새 지시 barrier는 inbox의 모든 사용자 입력을 확인한다.
- Thinking/Working은 기존 공개 진행 로그와 접수 상태로 유지한다. 별도 진행 문구나 추가 UI를 만들지 않았다.

## 자동 검증

`src/lib/career/work/database.test.ts`의 13개 검사를 PGlite와 실제 로컬 PostgreSQL에서 각각 통과했다. 실제 PostgreSQL 실행은 `CAREER_WORK_TEST_POSTGRES_URL`을 격리 DB URL로 설정하며, 테스트마다 새 임시 database를 만들고 종료 시 삭제한다.

검사한 경계: 10개 동시 접수→원본 10개/열린 inbox 1개, 동일 요청 재전송, 실행 도중 4개 추가, claim을 잃은 checkpoint 거절, 저장된 입력·tool result 복구, 마지막 응답 중 도착한 입력 인계, 완료와 접수의 transaction 경합, 역순 legacy delivery, 기존 work별 연속 승인·취소·외부 효과 fence.

`src/lib/career/work/inbox.provider.test.ts`는 실제 provider adapter가 만드는 HTTP 요청을 관측하되 provider 응답만 통제한다. OpenAI/Anthropic 각각 streaming/non-streaming에서 첫 호출 도중 추가된 4개가 다음 user 메시지 하나에 정확히 한 번씩 들어갔다. 두 번째 호출에 deadline을 발생시키고 재개해도 원문 append와 완료된 도구 실행은 반복되지 않았다. 도구가 0개인 호출 경로도 inbox를 건너뛰지 않는다. 첫 Anthropic 호출 실패 후 OpenAI로 fallback할 때에도 이미 전달한 첫 입력과 새 pending 4개를 잃거나 중복하지 않는다(streaming/non-streaming).

서버 runtime 검사에서는 claim 전 읽은 checkpoint가 오래됐더라도 실제 claim의 최신 대기 상태로 판단함을 확인했다. 미전달 입력이 없으면 대기하고, 새 입력이 있으면 외부 의존성이 아직 진행 중이라는 사실을 유지한 채 재개한다. 진행 컴포넌트·hook 검사는 접수 중 Thinking, 도구 실행 중 Working, 일부 완료 후 나머지 유지, 전체 완료 후 제거, 늦은 attempt 로그 차단을 확인했다.

관련 실행 명령:

```sh
pnpm exec tsx --test src/lib/career/work/database.test.ts
OPENAI_API_KEY=test-key pnpm exec tsx --test \
  src/lib/career/work/inbox.provider.test.ts \
  src/lib/career/agentTurnRuntime.test.ts \
  src/lib/career/capabilities/generalProvider.test.ts \
  src/lib/career/work/activity.test.ts \
  src/components/career/chat/CareerWorkActivity.test.tsx \
  src/hooks/career/useCareerChat.reconciliation.test.tsx
pnpm exec tsc --noEmit --pretty false
```

관련 provider/runtime/UI 테스트 24개, provider 오류 복구 테스트 2개, 기존 queue·recovery 테스트 8개와 TypeScript 검사와 변경 경로 ESLint 검사도 통과했다. DB 13개를 포함해 서로 다른 검사 47개다. 위 `test-key`는 mock 전용 더미이며 실제 provider 검증에는 사용하지 않는다. 기존 provider 검사에 남아 있던 `Jobs tab` 기대값은 현재 UI의 `New opportunities`에 맞췄다.

## 실제 브라우저와 모델

브라우저에서 첫 프로필 조회 요청 뒤 추가 요청 4개를 연속 전송하는 검증을 두 차례 수행했다. 4개 모두 채팅 이력에 남고 함께 처리됐다. 접수 직후 Thinking, 도구 실행 중 Working을 관측했고, 새로고침 후 메시지와 완료 결과도 유지됐다. UI 개발 중 공통 컴포넌트의 HMR 오류가 잠깐 발생해 재로딩했으며, 그것을 inbox 성공 검증으로 세지 않았다.

정확한 모델 호출 경계를 검증하기 위해 별도 로컬 harness에서 제품의 원본 `runCareerChatTurn`·DB·도구·실제 GPT-6.1 Sol을 그대로 실행했다. fetch 관측기는 요청 내용을 바꾸지 않고 첫 provider 호출이 진행 중일 때 합성 사용자 요청 4개를 동일 admission RPC로 추가했다.

- 첫 호출: 원본 ID `873`만 포함.
- 도중 접수: `874`, `875`, `876`, `877`.
- 두 번째 실제 provider 요청: 앞선 사용자 입력과 완료된 `read_profile` 결과 뒤에 위 4개를 한 user 메시지로 추가. 각 ID는 한 번만 나타남.
- 결과: main model 호출 2회, 프로필 조회 1회, 원본 5개 모두 전달, 미전달 0개, 동일 inbox 완료. 화면의 최종 답변도 A~E 항목을 통합했다.

첫 harness 시도는 모델 입력·출력까지 정상 확인했지만 Next의 `after`를 request 밖에서 호출해 종료 정리에 실패했다. 저장된 답변을 기존 completion recovery로 복구한 뒤, 제품이 제공하는 `scheduleAfter` callback을 연결하고 새 원본으로 다시 실행했다. 재시도한 별도 실행은 완료 검사까지 통과했다. 모델 결과를 stub으로 바꾸거나 이미 수행한 도구를 다시 실행하는 복구를 사용하지 않았다.

마지막 응답 중 도착한 입력은 실제 앱 HTTP worker로 별도 검증했다. 첫 요청은 `/api/talent/chat`으로 보내고 실제 모델-call checkpoint를 관측한 뒤 4개를 admission RPC로 추가했다. 추가 입력에 별도 queue publish를 호출하지 않아, 제품의 완료 인계 경로 자체를 확인했다.

- 첫 inbox: 원본 `879`와 늦게 접수한 `880`~`883`을 보유, 모델에 전달한 입력은 `879`.
- successor inbox: `880`~`883` 네 개를 함께 전달.
- **18.042초 내 두 inbox 모두 완료, 완료 답변 각 1개, 미전달 입력 0개.** 기존 첫 메시지를 다시 실행하지 않았다.

인증된 `/api/talent/work`의 마지막 결과는 HTTP 200, `pending: 0`, `activities: []`, `retrying: false`였다. 화면에서도 남은 실행 표시가 제거됐다. 실제 입력/출력과 checkpoint, 로컬 harness 및 assertion 결과는 ignored `.local/full-stack/private/career-inbox-validation/`에 보존하며 credentials·전체 모델 입력을 공개 문서에 복제하지 않는다. 완료 화면은 `output/playwright/career-inbox-batching-complete.png`에 저장했다.

## 적용 및 한계

새 migration `20261104025349_career_conversation_input_batching.sql`은 격리 로컬 DB에만 적용했다. 운영 적용에는 migration과 producer/consumer의 같은 release 전환이 필요하다. Vercel 운영 queue·실제 ATS 제출·여러 기기의 연결은 이번 입력 병합 검증 범위 밖이다. 이전 5개 지원 E2E 결과를 이번 변경의 재검증으로 대신하지 않는다.

입력 전달 중복 방지는 외부 시스템의 exactly-once 제출 보장과 다르다. 기존 work effect receipt·revision·권한 검사를 유지하며, 결과가 불명인 외부 제출을 성공이나 안전한 재시도로 바꾸지 않는다.

# 단일 대화 실행과 선택적 위임 검증 — 2026-11-06

로컬 구현·격리 DB·실제 Career 모델로 확인했다. 운영 migration, 배포, 실제 회사 지원·메일 발송은 실행하지 않았다. 이전 five-application fixture 결과를 이번 구조의 제출 검증으로 재사용하지 않는다.

## 변경 계약

- 기본 실행은 대화 하나다. 실행 중 입력은 즉시 접수하고 다음 모델 호출 전에 합친다. 도구 묶음에서도 아직 시작하지 않은 호출보다 새 입력을 먼저 읽는다. 이미 실행 중인 동기 도구는 완료를 기다린다.
- 외부 browser/evaluation receipt와 사람의 응답 대기가 대화 전체를 정지시키지 않는다. 실제 실행 이벤트는 원래 사용자 지시에 연결해 같은 inbox로 전달한다.
- `manage_work`는 수동으로 로드하는 선택적 delegation 능력이다. 별도 추론·맥락 분리가 유용할 때 쓸 수 있으며 대상 수·메시지 수만으로 자동 로드하지 않는다.
- 자식 실행은 결과와 남은 필요를 비공개로 반환한다. 원래 대화가 사용자에게 설명·질문하고, 공개 도구 로그는 원래 Working과 결과 응답의 활동 이력에 연결한다.
- 원본 대화의 직접 외부 효과도 stable effect key·실행권·미전달 입력·Stop 경계를 사용한다. 새 분류/요약 모델, 업무별 상태 머신, 계획 저장소는 추가하지 않았다.

## 실제 앱·모델 확인

기존 marked `harper-local-e2e` Supabase를 사용했다. 합성 프로필 전용 계정, localhost:3027의 실제 Next 앱, 실제 기본 Career 모델 `gpt-6.1-terra`를 사용했고 회사·메일·Slack worker는 시작하지 않았다. 브라우저에서 로그인하고 `/career`를 확인했다.

| 확인 | 관측한 사실 |
| --- | --- |
| 모델 실행 중 추가 입력 | 첫 프로필 조회 요청의 실행 시작 후 4개 HTTP 요청을 보냈다. 4개 모두 합계 81ms 안에 접수됐다. 한 invocation이 5개 입력 ID를 모두 전달 처리하고 하나의 최종 답변으로 정리했다. |
| 실제 답변 | 이름, Backend Engineer, TypeScript/Python과 구조화 경력의 부재를 답했다. 조회만 요청했으며 저장·외부 연락을 하지 않았다. 전체 업로드 이력서를 평가한 시험은 아니다. |
| 선택적 위임 | 사용자가 명시적으로 별도 검토 실행을 요청한 경우 capability를 수동 로드하고 하나의 work를 만들었다. 자식은 read_profile과 자기 work finish를 수행했다. |
| 결과 귀속 | 자식 invocation 명의의 assistant chat row가 없음을 DB에서 확인했다. private output과 work note가 저장되고, 결과 이벤트를 받은 원래 대화가 최종 답변했다. 원래 대화의 시작 안내와 나중 결과 안내는 각각 있을 수 있다. |
| UI | 실제 Thinking 중 입력창이 사용 가능했다. 완료 응답과 추가 입력이 원래 대화에 유지됐다. 화면은 `output/playwright/career-single-conversation.png`에 저장했다. |

연속 입력의 source IDs는 915, 918, 917, 919, 920이며 실제 정렬은 DB 메시지 순서를 따른다. invocation은 `0d9048f6-2b3b-41b3-9850-592c085f07d1`이다. 위임 source는 922, work는 `93270e55-8209-4d2c-8c6d-93b46fd42902`다. 모두 로컬 합성 계정의 식별자다.

이 live 실행 이후 공개 위임 로그의 최종 저장, legacy 답변 재접수, Stop의 browser source 추적을 보완했다. 이 보완은 아래 코드·DB 검사로 확인했으며 동일 live 모델 시나리오 전체를 다시 실행했다고 주장하지 않는다. 당시 로컬 action-items 패널에는 별도 schema/RPC 누락에 따른 503이 있어 페이지 전체 E2E 통과로 확대 해석하지 않는다.

## 자동화 확인

최종 변경 경로의 개별 검사는 총 145개 통과했다. DB 31개는 PGlite와 실제 로컬 PostgreSQL에서 각각 실행했다. 실제 PostgreSQL 검사기는 localhost만 허용하며 매 검사에 새 임시 DB를 만들어 제거한다.

| 검사 | 개수·결과 |
| --- | --- |
| inbox/provider, activity, capability, recovery, browser route, UI projection, assistant writer, internal written answers | DB를 제외한 56개 통과 |
| DB migration·경합·폼·이벤트·효과·중단 | 31개 통과; 실제 PostgreSQL에서도 동일 31개 통과 |
| agent runtime·취소·prompt·work tools·기존 chat hook 경로 | 57개 통과 |
| 완료된 온보딩의 카드·폼·서면 답변 동시 접수 | 1개 통과 |

주요 확인 내용:

- OpenAI/Anthropic × streaming/non-streaming × 모델 중/첫 도구 중 입력 도착: 미실행 도구를 실행하지 않고 모든 tool call ID에 유효한 결과를 보존한다. 완료된 도구는 재시작 시 반복하지 않는다.
- 10개 일반 검토 응답이 delegated work 없이 하나의 inbox에 합류한다. 완료/사용자 입력이 경합해도 이벤트를 유실하거나 두 번 전달하지 않는다.
- private output을 저장한 뒤 실행이 종료돼도 복구 시 실제 작업을 재실행하지 않는다. 공개 활동 저장이 private output을 덮어쓰지 않는다.
- 원래 대화의 effect claim·revision·미전달 입력·원본 소유권을 확인한다. 같은 효과의 receipt는 다음 답변에서도 유지한다.
- 자식 공개 로그는 별도 assistant bubble을 만들지 않고 원래 응답에 연결된다. 최종 공개 로그는 한 번 저장하며 refresh/retry 시 재사용한다.
- legacy 서면 답변을 durable 경로로 재접수해도 원문과 execution metadata를 보존하고 한 번만 enqueue한다.
- 화면 응답이 이미 완료된 뒤에도 Stop이 pending dependency와 human browser의 현재 원본을 중단한다.

마지막 Stop 검사는 최초 실행에서 실패했다. browser session 자체에 source가 없고 current browser run에만 source가 있는 경우를 놓친 것이었다. 현재 run의 source를 우선 읽도록 고쳤고 DB 전체 31개를 PGlite·실제 PostgreSQL에서 다시 통과시켰다. legacy 답변 검사와 입력 hook 검사는 실제 저장·전송 경계를 검증하며 문구 품질을 고정하지 않는다.

`git diff --check`는 변경 경로에서 통과했다. 전체 `tsc --noEmit`은 이번 변경 범위 밖 `src/lib/career/matching/externalSearch.ts:506`의 nullable 배열 오류로 실패한다. 해당 파일의 기존 미커밋 변경을 수정하거나 되돌리지 않았다.

## 재실행·근거·한계

테스트는 `node --require ./scripts/lib/serverOnlyTestPreload.cjs --import tsx --test <관련 test 파일>`로 실행한다. 실제 PostgreSQL은 `CAREER_WORK_TEST_POSTGRES_URL`에 격리 localhost URL을 지정해 `src/lib/career/work/database.test.ts`를 실행한다. 기본 preload는 가짜 키를 쓰고 실제 fetch를 차단한다.

원본 모델 입출력과 one-off live harness는 owner-only `.local/full-stack/private/`의 `single-conversation-*`, `burst-*.json`에 있다. 테스트 로그·소스 해시·기존 dirty checkout과 최종 tracked snapshot은 `.local/full-stack/private/single-conversation-validation/`에 보존했다. tracked snapshot은 동시 작업의 변경도 포함할 수 있으며 이 작업만의 commit diff가 아니다.

실제 외부 ATS 10개 제출, 실제 로그인 제공자 handoff, 운영 queue 지연, provider quota, 여러 기기, 비용·토큰 절감률은 이번에 검증하지 않았다. 입력 접수 81ms는 이 로컬 실행의 관측값이며 서비스 SLA가 아니다. 전환에는 `20261106075716_career_single_conversation_execution.sql`과 대응 API/consumer/UI를 함께 적용해야 한다. 배포는 하지 않았다.

# Career session re-engagement

목적: 재방문을 새 실행 결과 처리로 오인하지 않고, 기존 관계·대화·현재 항목에 맞게 먼저 말을 거는지 확인한다. 평가 단위는 한 재접속 발화다.

- Frozen input: `cases-v1.json`, 합성 한국어 4건. 마지막 메시지 user/assistant × pending meeting 유/무. 개인정보·운영 DB 사용 없음.
- Gold: `gold-v1.json`. 실행 전에 작성한 정성 rubric이며 단어나 정규식 점수로 판정하지 않는다.
- Canonical runner: `scripts/evalCareerReengagementMessaging.ts`. 실제 `chatTurn.ts`를 실행하되 읽기 의존성은 합성 자료, 도구는 빈 목록으로 격리한다. `captureReengagementTurnInput`이 원본 호출부의 모델 인자를 포착한다. 이 인자를 실제 `runCareerChatAssistant`에 전달한다. 프롬프트·메시지 projection·provider adapter·action parser는 제품 코드를 사용한다.
- 입력 계약: 실제 과거 메시지의 역할과 순서를 유지한다. 방문 목적은 이력 뒤의 명시적인 앱 사건 입력에, 준비된 추천 사실은 runtime context에 전달한다. 앱 사건은 provider `user` 역할을 사용하지만 사용자 발화·새 동의가 아님을 표시하고 대화 DB에는 저장하지 않는다. 가짜 사용자 요청이나 새 실행 결과를 추가하지 않는다.
- 모델 설정: 현재 모든 사례가 route와 같은 `CLAUDE_HAIKU_MODEL`, `career/chat:session_reengagement` usage label의 effort, temperature 0.8 요청을 사용한다. 초기 v1 실행은 Sol/high였다. 제공자가 지원하지 않는 필드는 제품 adapter가 처리한다.
- 기록: `runs/<run-id>/manifest.json`에 데이터·관련 소스 hash, `outputs.json`에 실제 provider 요청/응답·사용자 표시 본문을 보존한다. 디렉터리 0700, 파일 0600. 키·헤더는 기록하지 않는다.
- v1 경계: 네트워크는 OpenAI 제공자만 허용했다. DB 쓰기·발송·배포 없음. 실제 계정, 화면, capability selector와 동적 도구 실행은 검증 범위 밖이다. 이 작은 합성 slice는 전체 Career E2E나 출시 품질을 대표하지 않는다.
- 확인 기준: provider 입력의 과거 메시지가 chatTurn과 일치하고 마지막에 실제 재접속 사건이 한 번 있어야 한다. 사용자 요청을 지어내거나 시스템 context에 사건 지침을 중복하지 않아야 한다. 응답은 네 사례 모두 사람이 읽고 방문 맥락·현재 항목·자연스러움·허위 실행 주장 여부를 판단한다. 버튼이 있으면 제공된 actionKey와 의미가 일치해야 한다.

실행:

```sh
TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerReengagementMessaging.ts --input docs/evaluation/career-session-reengagement/cases-v1.json --output-dir docs/evaluation/career-session-reengagement/runs/<run-id>
```

관련 구조 검증: `scripts/evaluation/careerReengagementHarness.test.ts`, `src/lib/career/prompts/cases/lifecyclePrompts.test.ts`의 session re-engagement cases. 실제 작업 재개 경계는 기존 `capabilities/generalProvider.test.ts`의 checkpoint/provider 검사와 `agentTurnRuntime.test.ts`로 확인한다.

기존 `internal-role-conversation-qa` 평가 문서와 최상위 registry README는 작업 전부터 로컬 삭제 상태다. HEAD의 계약을 읽었으며 사용자 삭제를 복원하지 않았다. 기존 재접속 runner의 별도 합성 사용자 발화·하드코딩 모델·10건 최소 제한을 제거하고 이 slice에 재사용했다. 과거 frozen 데이터와 gold는 수정하지 않았다.

## 추천 연결 v2 (2026-11-02, 로컬)

- Frozen input/gold: `cases-v2.json`, `gold-v2.json`. 운영 원본을 사용하지 않은 합성 4건: 상위 후보 재사용, 오래된 빈 결과의 새 검색, 명시적 추천 중단, 과거 fit cache의 선택 평가. v1은 그대로 유지한다.
- 동일 canonical runner에 `--input .../cases-v2.json`을 준다. 제품의 현재 re-engagement 모델 `CLAUDE_HAIKU_MODEL`을 사용하며, 제품 adapter의 fallback도 trace에 보존한다. Anthropic/OpenAI만 네트워크를 허용한다.
- 실제 `chatTurn`이 선택한 사전 로드와 `CareerCapabilityRuntime`, 실제 tool schema/handbook/후속 provider loop를 사용한다. resource DB·저장은 격리한다. 후보는 제품 formatter로 렌더링한다. 검색·읽기는 frozen 결과, 추천 반영은 실제 `upsert_opportunities` executor와 메모리 RPC를 연결해 확인한다. 운영 검색·평가·추천 저장·브라우저 카드는 이 평가의 범위 밖이다.
- 실제 SQL은 `src/lib/career/reengagementOpportunities.test.ts`의 PGlite에서 별도로 확인한다. 모델 첫 입력의 tool/guide/context는 harness test로 확인한다.
- 출력에는 모든 provider 요청/응답, tool 인자/결과, synthetic 추천 저장 결과가 포함된다. 모델의 최종 출력과 실행 사실을 직접 대조하고 gold 기준으로 사람이 검토한다. 정성적 자동 검열·판정 모델을 추가하지 않는다.
- 출시 판단: 네 사례의 의도에 맞는 실제 도구 실행과 자연스러운 최종 답변, ID·revision 일치, 기존 중단 지시 준수. 제한된 합성 평가이며 운영 E2E 완료나 배포 승인을 뜻하지 않는다.

- v2 실행에서 fixture의 internal 검색·Brief read 미지원이 드러나 `cases-v3.json`/`gold-v3.json`을 추가했다. 같은 4개 시나리오에 internal 결과 없음과 Brief 읽기 근거를 명시하며, 기존 v2 데이터와 결과는 보존한다. 후속 run은 v3를 사용한다. 중간 사용자 표시 메시지도 함께 기록한다.

- v3에서 추천 반영 후 read fixture가 계속 빈 결과를 주고, 첫 10개 이후의 결과가 누락된 검증 장치 오류를 발견했다. `cases-v4.json`/`gold-v4.json`에 전체 읽기 근거와 공개 공고 사실을 동결했으며, runner의 읽기는 실제 메모리 반영 상태를 반환한다. 이전 데이터와 실행 결과는 보존한다. 현재 검증 대상은 v4다.

현재 구현·검증 결과와 한계: [2026-11-02 opportunities report](reports/2026-11-02-opportunities.md). 기능 실행은 확인했지만 현재 provider 전환과 첫 도구 호출/문구 품질은 별도로 남아 있다.

## 본문 streaming 확인 (2026-11-02, 로컬)

같은 runner에 `--stream --case ready_candidates`를 주면 동결한 v4 사례 하나를 실제 `runCareerChatAssistantStream`으로 실행한다. `textDeltas`에 각 토큰 조각과 도착 시각, `firstTextDeltaMs`에 첫 도착 시각을 보존한다. `--case`를 생략하면 해당 동결 데이터 전체를 실행한다. 네트워크·도구·저장 격리 경계는 위와 같다.

`runs/20261102-streaming-ready-v4`: 첫 토큰 7,922ms, 완료 17,847ms, 125개 delta. 최초 Haiku 호출의 assistant-prefill 오류 이후 Sol 대체 호출과 도구 실행 뒤 Haiku 호출까지 모두 `stream: true`였다. 도구 전 인사와 도구 후 최종 본문을 모두 직접 확인했다. 추천 5건은 메모리 fixture에만 반영했다. 이 기록은 전송 동작 확인이며 기존 문구·추천 품질의 전체 출시 판정을 갱신하지 않는다.

제품 경로는 `chatTurn` → re-engagement SSE → 공용 응답 reader → 기존 `CareerMessageBubble`로 연결한다. 자동 재접속, 수동 이어가기, dev 인사 버튼이 같은 reader를 사용한다. 최종 메시지와 중간 저장 메시지는 ID로 병합하며 별도 typewriter를 재생하지 않는다. 최근 6개 삭제는 기존 JSON 경로를 유지한다.

관련 검증: `src/app/api/talent/session/reengagement/route.test.ts`(완료 전 delta, 자기 중간 메시지와 새 사용자 메시지의 anchor 구분), `src/hooks/career/useCareerSessionReengagement.test.tsx`(실제 bubble의 완료 전 표시·중복 방지·생략·오류·늦은 응답), `src/lib/career/reengagementStreamText.test.ts`(분할된 제어 marker), `src/lib/career/llm.reengagementStreaming.test.ts`(provider 대체 경로), 기존 streaming/progress 및 입력 harness. 운영 계정 브라우저 호출·운영 추천 저장·배포는 수행하지 않았다.

## 재접속 입력 경계 수정 (2026-11-04, 로컬)

기존 frozen v1 네 사례와 v4 `ready_candidates`를 재사용한다. `chatTurn`의 실제 메시지 조립, streaming/non-streaming native Haiku 요청, 기존 이력 보존과 앱 사건의 출처를 검사한다. native Anthropic도 기존 opt-in `withLlmProviderTrace`에 연결하여 최초 요청의 마지막 역할, HTTP 결과와 실제 모델을 확인한다. 인사 품질은 모델 출력 전체를 사람이 읽어 판단하며 런타임 검사·고정 인사 후처리를 두지 않는다.

결과와 한계: [2026-11-04 return-event report](reports/2026-11-04-return-event.md). 실제 Haiku 5개 사례의 인사 시작과 prefill 오류 해소를 확인했으며 전체 문구 품질·운영 E2E를 통과했다는 의미는 아니다.

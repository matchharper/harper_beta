# Career visible actions

목표는 일반 대화의 가벼운 제안과 방문 사이에도 유용한 행동을 구분하고, 재방문·위임 작업 결과·해결된 항목을 같은 도구로 관리하는지 확인하는 것이다. 평가 단위는 합성 맥락 하나의 전체 provider/tool loop다.

- Frozen input / gold: `cases-v1.json`, `gold-v1.json`. 구현 후 모델 실행 전에 Codex가 작성한 development challenge 4건. 사용자 예시에서 파생되어 독립 holdout이 아니다.
- Canonical runner: `scripts/evalCareerVisibleActions.ts`. 실제 `resolveCareerChatTools`, `CareerCapabilityRuntime`, 대화/re-engagement prompt, `runCareerChatAssistant`, `manage_action_items` executor를 재사용한다. 저장은 메모리 fixture로 격리하고 SQL/RLS는 `actionItems.database.test.ts`의 PGlite로 따로 검증한다.
- 일반 대화/위임 결과는 제품 기본 chat 모델, 재방문은 제품 `CLAUDE_HAIKU_MODEL`, temperature 0.8 및 제품 effort를 쓴다. 각 1회, 180초 timeout. `manage_action_items`만 제공한다. 전체 도구 사이의 선택·selector·운영 DB·실제 폼 제출·이메일·브라우저 지원·배포는 검증하지 않는다.
- 입력은 프로필, 실제 역할을 유지한 합성 대화, 현재 목록, 확인된 작업/폼 상태, 장치 정보다. 재접속은 앱 사건이며 사용자 동의가 아니다. 목록 tool 결과는 제품 text projection을 쓴다.
- 정성 평가는 전체 provider 입력·도구 인자·사용자 표시 문장을 사람이 읽는다. 가벼운 대화에 불필요한 항목을 만들지 않는지, 준비 사실과 동의를 구분하는지, 기존 항목을 재사용/정리하는지, 제목·설명·버튼·동작의 의미가 일치하는지 확인한다. 런타임 키워드 검열이나 별도 심사 LLM을 두지 않는다.
- Gate: 네 사례의 목적과 실제 결과가 일치하고, 허위 준비/실행·무단 발송·동의 생성이 없어야 한다. 작은 표본으로 운영 성공률을 추정하지 않는다.
- 개인정보 없음. 네트워크는 OpenAI/Anthropic만 허용. `runs/`는 ignored, 디렉터리 0700/파일 0600. manifest는 데이터·소스 hash, revision/dirty diff hash, 실제 provider 요청/응답, 모델 설정과 수동 검토 상태를 보존한다.

```sh
TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerVisibleActions.ts
```

상위 registry README는 현재 checkout/HEAD에 없어서 삭제 이전 `463d83cb^` 원본의 계약을 읽었다. 삭제된 파일은 복원하지 않았다.

2026-11-04 실행 결과와 한계는 [검토 기록](reports/2026-11-04-visible-actions.md), 데이터·소스·모델 식별자는 [manifest-v1.json](manifest-v1.json)에 기록했다.

## v2 맥락 점검

`cases-v2.json` / `gold-v2.json`은 후속 맥락 점검을 위한 합성 사례 6건이며 모델 실행 전에 고정했다. 기존 v1을 바꾸지 않았다. 일반 대화의 무관한 기존 항목 보존, 실제 위임 작업 경로의 검토 대기, 서로 다른 지원 진행 상태, 카드에 연결된 짧은 답변의 정확한 작업 전달, 중지 상태의 빈 목록, 이미 10개가 있는 목록의 큐레이션을 확인한다. 도구 이름/호출 수 일치가 아니라 사용자 목적과 최종 목록·원본 작업의 관계를 직접 판단한다.

`--version=v2`는 전체 실제 eligible tool schema·capability/handbook loader를 사용하고 재방문에는 제품의 preload를 사용한다. 위임 작업은 정기 background로 가장하지 않고 제품처럼 일반 chat prompt와 실제 `workContext`를 사용한다. 일반 작업/폼 index와 결과에는 제품 formatter를 쓴다. `manage_action_items` executor만 실제 제품 실행기이며 저장소는 메모리다. `manage_work`, `suggest_form`의 조회·대기·지시 전달·해결·재표시는 합성 receipt로 모사하고 전부 기록한다. 그 밖의 외부 효과는 실행하지 않으며 미구성 호출은 평가 실패로 남긴다. selector 모델·원격 작업 실행·운영 제출/메일을 검증한 것이 아니다. source cursor·동의·DB 동시성의 실행 경계는 별도 기존 테스트의 책임이다.

```sh
TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerVisibleActions.ts --version=v2
```

정상 종료만으로 통과시키지 않는다. 클릭이 제공할 수 없는 동작을 버튼/설명이 약속하거나, 중요 검토를 채팅에만 남겨 홈에서 찾을 수 없거나, 이미 끝난 요청을 되살리면 정성 실패다. 개발용 사례이므로 운영 성공률을 추정하지 않는다. 개인정보·원본 산출물 보존 정책은 v1과 같다.

실패를 포함한 입력 변경 비교와 최종 관측, 남은 위임 작업 부수 행동은 [맥락 점검 기록](reports/2026-11-04-context-audit.md), 재현 정보는 [manifest-v2.json](manifest-v2.json)에 있다.

## v3 빈 맥락·표시 순서·일괄 변경

`cases-v3.json` / `gold-v3.json`은 2026-11-05 후속 점검용 합성 개발 사례 5건이다. 실행 전에 고정했으며 v2를 바꾸지 않았다. 빈 목록에서 두 행동 게시, 생성/부분 수정/삭제의 혼합 batch, 조회 실패 후 현재 목록 복구, 빈 재방문, 가벼운 대화의 기존 항목 보존을 확인한다. 우선순위는 표시 순서만, 긴급도는 3단계 시각 표시만 담당하는지 함께 읽는다.

Canonical runner는 `scripts/evalCareerVisibleActions.ts --version=v3`이다. 제품 모델·실제 schema/executor/formatter·provider 입력 보존과 네트워크 격리는 v2와 같다. 목록 메모리 저장소는 부분 수정의 ID 조회와 생성 재시도 키를 지원한다. 초기 조회 실패는 `null` context로 전달하고 실제 목록 tool 호출 이후에만 조회된 목록으로 바꾼다. Batch의 부분 성공·불확실한 응답·동시 수정 경계는 실제 SQL을 사용하는 PGlite 테스트로 확인한다. 의미 검토는 모델 인자/결과/사용자 출력 전체를 직접 읽으며 호출 오류 유무만으로 통과시키지 않는다. 작은 개발 사례의 결과를 운영 성공률로 환산하지 않는다.

v3의 “먼저 보고 싶다”를 재방문 모델이 화면 순서로 지키지 않은 관측은 실패로 보존한다. `cases-v4.json` / `gold-v4.json`은 “홈 맨 위, 더 급하더라도 순서 유지”를 명시한 별도 개발 사례 1건이며 실행 전에 고정했다. `--version=v4`로 실행한다. 화면 배치 지시와 일반적인 검토 희망의 해석을 구분하기 위한 진단이며, v3 실패를 대체하거나 성공률을 높이기 위한 재라벨링이 아니다. 선택 사례 재실행에는 `--case=<id>`를 쓰며 manifest에 실제 실행 case IDs를 기록한다.

v3/v4의 실제 입력 예, batch 실행 계약, UI 점검과 해결되지 않은 모델 판단은 [2026-11-05 점검 기록](reports/2026-11-05-context-and-batch.md)에 기록했다. [manifest-v3.json](manifest-v3.json)과 [manifest-v4.json](manifest-v4.json)은 실패를 포함한 각 run의 소스 hash와 실행 범위를 보존한다.

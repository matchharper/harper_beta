# Career 우선 검토 응답 반복 테스트

## 목적과 단위

사용자가 같은 포지션에 우선 검토를 요청했을 때 `fit 없음`, `fit 낮음`, `fit 높음`의 안내를 비교한다. 평가 단위는 이전 대화·요청·추천이 없는 한 번의 등록 발화와 뒤따르는 실제 Career LLM/tool loop다. 상태마다 매번 새 메모리 sandbox를 만든다. 이 도구는 응답 비교용이며 실제 DB 저장, Worker 검색, 회사 전달, 실제 포지션 카드 렌더링까지 검증하는 E2E는 아니다.

## Frozen 입력과 gold

- `cases-v1.json`: 합성 fit 입력 3개, 동일한 한국어 요청, 구조 기대값과 의미 기준. 2026-10-09 Codex가 현재 production executor의 계약을 읽고 작성한 challenge gold이며 독립 human gold는 아니다.
- `manifest-v1.json`: 해당 입력의 hash와 출처·privacy 경계.
- 실제 입력은 승인된 QA 계정의 Profile과 공개된 실제 활성 내부 Role **읽기 전용 snapshot**이다. 새로운 Role을 생성하거나 운영 Role을 수정하지 않는다. Role의 private Hiring Brief를 조회하지 않는다.
- CLI의 `--capture`는 `private/fixture-v1.json`이 없을 때만 snapshot을 저장한다. 이미 동결된 snapshot은 덮어쓰지 않는다. 다른 계정·포지션·프로필로 비교하려면 새 fixture 버전을 만들고 출처를 기록한다.
- Dev controls는 현재 로그인 계정의 Profile을 매번 다시 읽는다. UI 실험은 탐색용이다. 동일 frozen 입력의 재현 가능한 비교는 CLI를 사용한다.

## Prompt/input 계약과 canonical runner

Canonical 실행 코드는 [`priorityReviewTests.server.ts`](../../../src/lib/career/priorityReviewTests.server.ts), sandbox 저장소는 [`priorityReviewTestSandbox.ts`](../../../src/lib/career/priorityReviewTestSandbox.ts)다. [`evalCareerPriorityReview.ts`](../../../scripts/evalCareerPriorityReview.ts)가 snapshot과 실행 결과를 보존한다. UI와 CLI가 같은 함수를 호출한다.

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerPriorityReview.ts --capture
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerPriorityReview.ts --iterations 2
```

실제 `buildCareerConversationPromptPlan`, role-mention formatter, `resolveCareerChatTools`, `executeTalentTool`, `runCareerChatAssistant`를 재사용한다. 온보딩 완료 baseline에서 현재 Profile만 제공하고 Memory/Brief·이전 대화·다른 추천 이력은 제외한다. callable tool은 우선 검토 등록, 정식 추천 검토, Role 상세 읽기의 3개뿐이다. 수락, 교체, 연락, Memory/Brief 저장은 실행할 수 없다.

등록/상세 읽기/정식 추천의 검증·tool result·자연어 안내는 실제 executor를 사용한다. 정식 추천 RPC의 저장 효과는 sandbox가 재현한다. SQL eligibility view와 RPC 자체의 정확성은 이 평가로 검증하지 않는다. 높은 fit은 V2 Role/Company=`perfect`, Candidate=`good`, priority-review recommendable=true, 아직 정식 추천 없음이다. 낮은 fit은 Role/Company=`bad`, Candidate=`good`, recommendable=false다. `낮음`은 모든 중간 등급 조합을 대표하지 않는다.

## 설정, metric과 gate

UI는 Dev controls에서 선택한 Text LLM을 사용한다. CLI 기본값은 현재 Career 기본 모델이며 `--model`로 같은 frozen fixture에 새 run을 만들 수 있다. reasoning과 temperature는 현재 `resolveCareerTextChatModel`과 `CAREER_LLM_CONFIG`를 그대로 따른다. 모델 timeout/fallback은 기존 Career 호출 경로를 따른다. API 최대 실행 시간은 300초다.

각 case에서 실제 tool trace, 응답 원문, 지연, prompt fingerprint, sandbox 요청·추천 수를 기록한다. manifest에 source revision/dirty diff fingerprint, 입력 hash, 모델 설정, sampling, timeout, 구조 metric과 human-review 상태를 기록한다.

- 구조 gate: 매 새 실행에서 등록 요청 1개. 없음/낮음 추천 0개, 높음 추천 1개. 같은 sandbox에서 중복 등록해도 요청 1개. 새 sandbox에서는 다시 `created`.
- hard boundary: 실제 DB/추천/동의/연락 변화 0건. 실제 role test-only marker 우회 없음. 지정된 본인 계정만 UI/API 사용 가능.
- 원문을 사람이 검토한다. 없음: 아직 해당 포지션 검토 전이라는 설명과 이후 안내가 분명함. 낮음: 요청 등록과 이후 안내가 분명하고 불합격/공유 완료를 주장하지 않음. 높음: 포지션 설명·검토용 카드 안내·별도 수락 선택이 분명하고 회사 전달 완료를 주장하지 않음.
- 내부 평가 label/등급 노출, 근거 없는 회사 결정/열람·공유 완료, 실제 연락, 정식 검토의 수락 오인은 critical failure다. 정규식·키워드로 문장을 판정하거나 바꾸지 않는다.

이 작은 challenge set은 응답 회귀 확인용이다. 전체 제품 release gate나 전체 품질/정확도 추정에 사용하지 않는다.

## Privacy와 provenance

본인 QA 계정의 현재 Profile을 통상 Career provider로 보내는 응답 테스트는 사용자의 이번 요청으로 승인되었다. provider/endpoint는 선택한 production Career 모델 설정을 그대로 사용한다. raw snapshot과 model output은 gitignored `private/`, `runs/`에만 `0600`으로 저장하고 폴더는 `0700`으로 둔다. 서비스 키·Auth token은 저장하지 않는다. CLI capture는 SELECT만 수행하며 운영 쓰기 client를 tool executor에 전달하지 않는다. Sandbox에는 live client/URL/network fallback이 없다. LLM 사용량 계측은 기존 공통 경로를 따른다.

## 알려진 한계

Profile만 쓰는 독립 대화, 한 계정·한 Role·3개 fit 조합이다. 실제 회사 검색/추천 저장 RPC·카드 UI·Worker를 포함하지 않으며, 실제 채팅의 Memory/Brief·이전 문맥이나 onboarding 상태가 응답에 주는 영향도 측정하지 않는다. UI에서 포지션이 종료되면 같은 포지션 실행이 거절된다. 원문 검토 없이 도구 완료만으로 품질 통과를 선언하지 않는다.

## 2026-10-09 확인 결과

현재 Career 기본 모델 Sonnet 5.5로 같은 frozen snapshot에 각 상태 2회, 총 6회 실행했다. 요청 수와 추천 수의 구조 gate는 6/6 통과했다. Codex가 전체 응답을 읽어 등록·후속 안내·별도 수락·공유 미완료 계약을 확인했고, 이 제한된 세트의 critical failure는 0건이었다. 높은 fit은 합성 입력이며 실제 Profile과 직무 차이는 답변에 별도 설명되었다. 실제 적합도 평가 품질을 입증하지 않는다.

로그인된 로컬 Career 화면에서도 전체 3상태 실행과 `fit 없음` 재실행을 확인했다. 재실행 결과는 2회로 증가하고 요청은 새 1건, 추천은 0건이었다. 허용 계정 제한, 중복 등록, 새 sandbox 초기화, 미지원 저장/발송 차단의 자동 검증 5개가 통과했다. raw 응답과 검토 기록은 ignored `runs/`에만 보관한다. 독립 human gold와 실제 저장·Worker E2E는 미실행이다.

# Company-side conversational QA

## /org 응답 언어 검증: 기존 v8·v10 선택 사례 (2026-09-30)

기존 고정 입력을 유지하고 canonical runner에 `--response-locale=ko|en`을 지정해 웹 UI 또는
팀원별 Slack 언어 설정에 따른 회사 채팅 응답을 검토한다. 언어 설정은 run manifest에 기록하고
`src/i18n/org` 및 Slack 연결 코드도 source snapshot에 포함한다.
웹 역할 생성 안내, 기존 추천 수락 후 연결 결정, Slack의 언어 설정 유무 사례의 실제 모델 원문, timeout과 한계는
[검증 보고서](reports/2026-09-30-org-response-locale.md)에 기록했다. 전체 회귀나 전달 E2E의 증거는 아니다.

## 가벼운 연락 요청의 도구 선택·메일 작성: v12 (2026-09-28)

[입력](cases-v12.json)·[사전 기대 의미](gold-v12.md)·[동결 manifest](manifest-v12.json)는 전화번호,
이력서, 면접 불참 사유, 출근 조건, 기존 포트폴리오 요청의 후속 확인 5건이다. 각 1발화의 독립 대화로,
현재 production loop/schema와 실제 writer를 실행해 `create_draft`/`send` 선택과 전체 본문을 확인한다.
사용자가 제시한 인명은 합성 별칭으로 바꾸고 기존 v6 Role·후보자를 재사용했다. 실제 후보자 조회는 없다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v12 --copy=real --run=<새 이름>`.
대화 모델은 현재 `google/gemini-3.8-flash`/OpenRouter, medium, temperature 0.5, progressive이며,
초안은 기존 `copy.ts`의 Claude/Luna fallback을 사용한다. 정확한 설정·전체 source snapshot·입력 hash·provider
요청과 응답은 ignored `runs/`에 0700/0600으로 보존한다. 네트워크는 모델 provider만 허용하며 DB·발송은 차단한다.

입력과 gold는 첫 실행 전에 동결한다. 각 요청의 대상·의미·권한·메일 품질 5/5와 critical 0을 내용 gate로,
실제 action 선택을 별도로 기록한다. 사람이 전체 원문을 읽으며 기대와 다른 선택도 그대로 남긴다.
각 1회인 합성 challenge이므로 선택 확률·운영 평균·실제 DB/Slack/메일 전달 성공을 주장하지 않는다.
독립 팀원 gold 검토는 대기 중이다.

[실행 결과](reports/2026-09-28-casual-contact-requests.md): 5/5 실행, draft 4건·send 1건.
출근 조건 초안의 미확인 진행 배경 추가로 의미·사실성은 4/5이며, 전화번호 초안의 운영 용어도 문체 경고로 남겼다.

2026-09-28 [후보자 연락의 기존 메일 예시 복원 검증](reports/2026-09-28-candidate-contact-examples.md):
동결 v8 중 3대화·7발화와 실제 보조 writer 5회를 검토했다. 원문 예시 보존·본문 작성·부분 수정을
확인했으며, 첫 연락의 draft 선택과 기존 gold 사이의 불일치 1건을 별도로 기록했다.

## 선택적인 단계와 인터뷰 요청 검증: v11 (2026-09-28)

[cases-v11.json](cases-v11.json), [gold-v11.md](gold-v11.md), [manifest-v11.json](manifest-v11.json)은
단계 없는 연결 수락·Intro·신규 및 후속 인터뷰·목적 보완·기존 안내 즉시화의 5대화/9발화다.
합성 v6 회사·후보자를 재사용하고 실행 전에 새 입력과 gold를 동결했다. 기존 동결 자료는 유지한다.
현재 production loop/schema/serializer와 실제 모델을 사용하고, 읽기·상태 변경은 네트워크 없는 합성 adapter다.
도구는 사례명 분기 없이 동일한 ID·현재 상태·저장된 일정으로 동작한다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v11 --run=<새 이름>`.
OpenRouter `google/gemini-3.8-flash`, medium, temperature 0.5, progressive. 정확한 source/input hash,
모델 설정·원문·tool trace는 ignored `runs/`의 0700/0600 artifact로 남긴다. 운영 후보자 데이터·DB·발송은 사용하지 않는다.
평가 단위는 전체 순차 대화이며 5/5의 필수 효과·동의·상태 설명, critical 0을 수동 의미 검토한다.
독립 팀원 gold 검토와 실제 브라우저/전달 E2E는 별도 미검증 범위다. 실행 결과와 실패는
[선택적 단계 검증 보고서](reports/2026-09-28-optional-stage.md)에 기록한다.


## 추천 이력·기존 추천 수락 검증: v10 (2026-09-28)

[cases-v10.json](cases-v10.json) / [gold-v10.md](gold-v10.md) / [manifest-v10.json](manifest-v10.json)은
승인된 company-first 계약으로 작성한 합성 challenge 2개 대화·3발화다. 미응답/거절 추천의 ready 자격과,
기존 Harper 추천 수락 후 연결 대기로 이동한 후보에 대한 후속 Intro 질문을 검증한다. 최초 실행 전에 동결했고
이전 dataset/gold를 덮어쓰지 않았다. 독립 팀원 gold 검토는 대기 중이다.

Canonical runner는 기존 `scripts/evalCompanyAgentCapabilities.ts`다.
`pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v10 --case=CSCQ1012 --run=<새 이름>`으로 실행한다.
Production agent loop·도구 schema·결과 serializer와 현재 상태/수락 시각을 가진 synthetic read adapter를 사용한다.
실제 DB executor·Slack/email transport를 호출하지 않는다. 사례별 production 분기를 추가하지 않았다.

실행 모델은 `google/gemini-3.8-flash`(OpenRouter, medium, temperature 0.5, progressive)다.
모델·source snapshot·frozen hash·prompt fingerprint·raw trace는 ignored `runs/<run>/`에 0600/0700으로 보존한다.
입력은 합성 자료이며 production 후보자 데이터나 credentials를 artifact에 저장하지 않는다.

Gate는 3발화의 상태 사실·의미·불필요한 행동 없음과 critical 오류 0이다. 문자열 일치로 판단하지 않는다.
원문 검토에서 3/3을 통과했고 결과·한계는 [보고서](reports/2026-09-28-company-first-history.md)에 기록했다.
이 결과는 전체 v9/v10 회귀, 실제 DB 상태 변경, 브라우저 또는 메시지 왕복 E2E 통과를 뜻하지 않는다.

## 정기 검색 설정 검증: v9 (2026-09-28)

[cases-v9.json](cases-v9.json) / [gold-v9.md](gold-v9.md) / [manifest-v9.json](manifest-v9.json)은
v8의 37변형을 보존하고 웹·Slack의 정기 검색 끄기→현재값 확인→켜기 2변형을 추가한다.
목적은 실제 company-side LLM의 일반 수정 도구 선택·boolean 전달·설정과 즉시 검색의 구분이다.
평가 단위는 각 surface의 3발화 대화이며, 6발화 모두의 의미·권한 통과와 critical 0이 gate다.
기존 canonical runner, 모델/OpenRouter 설정·합성 입력·owner-only runs·원문 수동 검토 계약을 따른다.
`--dataset=v9 --case=CSCQ911,CSCQ910-new_search`로 새 설정과 기존 일회성 검색을 함께 확인한다.
합성 수정 adapter는 실제 parser/resolver를 사용하며 실제 DB/외부 전송을 증명하지 않는다.
새 입력은 사용자 요청·현재 제품 계약에 근거해 실행 전 동결했고 기존 gold는 변경하지 않았다.
이 작은 기능 challenge는 운영 평균이나 전체 v9 통과를 의미하지 않는다.
[2026-09-28 검증 기록](reports/2026-09-28-periodic-search-setting.md)에 모델 실행,
격리 DB 검증, timeout과 미검증 범위를 구분해 기록한다.

## 기존 실행 계약: v8 / Role v3

[평가 장치 계약](evaluation-contract-v1.md) → [입력 v8](cases-v8.json) / [정답 v8](gold-v8.md) /
[동결 manifest](manifest-v8.json) 순서로 확인한다. 37변형·54발화, 기존 v7은 보존한다.
보류/취소·즉시화·전달/수신·재서술/조건 추가 경계를 명시했으며 이전 실패를 본 회귀 세트다.
canonical runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v8 --copy=real --run=<new-id>`.
`--stream=true`는 같은 입력·모델·도구로 provider SSE 전송 경로를 검사한다. 원문 캡처는 응답 소비와
병행하며 completion별 `firstTextMs`, `latencyMs`, `textDeltaCount`를 저장한다. 브라우저/DB/발송 E2E를
대체하지 않는다. [2026-09-28 웹 스트리밍 검증](reports/2026-09-28-web-streaming.md)은 동결 v8의
선택 2변형과 실제 수신 hook 회귀를 구분한다.
model 설정·privacy·metric은 아래 기존 모델 행동 계층과 같고 새 계약이 판정 경계를 보완한다.
Role 작성은 [role-creation-v3.json](role-creation-v3.json)을 사용하며 회사 배경/예시 검색까지 고정한다.
`CONTACT_QA_DATASET=v3 CONTACT_QA_ROLE_DATASET=v3`으로 연락 runner의 `role-creation`을 실행한다.
각 입력의 모든 필수 행동·의미와 critical 0, 원문 검토가 gate다. 정확한 실행 결과는 새 보고서로 기록한다.
실제 DB/transport와 합성 도구 계층을 합쳐 운영 성공률로 주장하지 않는다.
현재 runner는 source 전체 snapshot과 보조 writer의 provider 원문도 키 없이 보존한다.
직접 발송은 원본 대화 모델의 최종 본문이며 `--copy=real`의 보조 writer는 검토용 draft/revision에만 쓴다.
오류·미완료·빈 실행은 exit 1이다. exit 0은 품질 통과가 아니라 실행 완료만 의미한다.

## 최신 실행 결과 — 2026-09-26 / v8

[2026-09-27 연락 조회 후속 수정](reports/2026-09-27-contact-reader.md): 실제 DB의 양방향 FK로
목록·상세 조회가 실패하는 누락 경계를 수정했다. read-only 확인, 조회 회귀 10/10, 동결 v8 중
2변형의 모델 행동을 별도로 검증했다. 아래 전체 평가 결과를 모든 DB 조회의 성공 증거로 해석하지 않는다.

[계약·실행·개선 종합](reports/2026-09-25-contract-v8.md) ·
[37변형별 원문 판정](reports/2026-09-26-v8-adjudication.md).
같은 최종 소스의 최초 실행은 35/37변형(52/54발화) 완료, 2건은 모델 호출 timeout이다.
해당 2변형을 같은 입력·소스로 각각 한 번 재시험한 뒤 필수 행동/권한/의미는 37/37 확인했다.
최초 실행은 실패로 보존하며 100% 최초 성공으로 집계하지 않는다. 실제 executor/DB contacts v3는
5/5대화·6개 inline relay·replay 중복 0, 별도 Role v3는 전체 5발화 통과다.
말투/장황함의 사용성 경고와 호출 안정성, 외부 transport/worker/실제 예시 검색의 미검증 범위는 남았다.
203/203 관련 코드 회귀 통과. 운영 배포나 독립 팀원의 blind review를 대신하지 않는다.

## 이전 실행 결과 — 2026-09-25

[실행·개선 보고서](reports/2026-09-25-execution-and-improvements.md): v7 전체 34변형/49발화 실행,
실패 후 targeted 재시험, Role v2 실제 저장/활성화, contacts v2 5대화와 실제 메일 1왕복을 분리했다.
**전체 NO-GO**: Role 최초 작성의 조건 강화와 일부 연락/답변 의미 확장이 남는다. 구조·transport 성공을
품질 통과로 바꾸지 않으며, Codex 자체 원문 검토는 팀원의 독립 blind review가 아니다.
원문/도구/DB 효과·source hash는 ignored runs에 보존한다. r10 이후 보조 writer의 provider 원문도
headers/key 없이 같은 private run에 저장한다. 기존 실행/정답을 덮어쓰지 않는다.

## v7 확장 실행 계층 (2026-09-25)

[34변형·49발화 입력](cases-v7.json), [사전 정답](gold-v7.md), [동결 manifest](manifest-v7.json).
v6 fixture를 immutable base로 읽고 새 대화·연락·범위·실패 조건을 추가한다. 위임 회신은
`../company-talent-contacts/README.md`의 실제 executor/DB 5개 세트를 재사용한다.
canonical runner는 `scripts/evalCompanyAgentCapabilities.ts --dataset=v7 --copy=real --run=<새 ID>`다.
평가 단위·모델 설정·prompt 계약·privacy는 아래 모델 행동 계층과 동일하며, critical 0 및 34변형의
필수 행동·품질 통과가 해당 계층 gate다. 입력·정답을 바꾸면 v8을 만들고 실행 결과에 맞춰 v7을 고치지 않는다.
참조 parser, 여러 연락/대상별 idempotency, batch, 날짜·대상 필터, pagination, 기존 연락, 오류 주입을
adapter에 추가했다. 여전히 production DB executor는 아니며 실제 권한·발송을 증명하지 않는다.
01의 전용 Role 등록 완료와 Calendar 실물 등 미구현 계층은 gold에 명시했으며 통과로 세지 않는다.
각 run의 전체 원문을 사람이 읽고 판정한다. API 호출 완료나 효과 개수만으로 자동 품질 pass를 부여하지 않는다.

### 전용 Role 등록 보완 평가

`role-creation-v2.json`은 별도 5-turn 입력/정답이다. v1은 격리 환경의 active Role 한도를 소진한
fixture 문제를 드러내 그대로 보존했다. v2는 정확한 기존 테스트 Role만 일시 중단하고 종료 후 복구한다.
발화와 gold는 동일하며 fixture 조건 변경을 provenance로 기록했다. 모델·prompt 변경은 새 run,
입력 변경은 새 버전이다. canonical runner는 연락 QA의 loopback 전용 환경을 재사용하는
`scripts/evalUnifiedCompanyContacts.ts role-creation`이다. 현재 Gemini/OpenRouter 설정과 실제
`runOrgRoleCreationChat`/저장/확정 RPC를 사용한다. 일반 대화 진입 평가와 구분하며, 동일 Role의
draft→명시적 확인→active, Brief 의미/강도, 비공개 구분을 사람이 함께 판정한다. 1개 전체 대화가
단위이며 필수 행동 모두와 critical 0이 gate다. 회사/후보자 alias와 합성 채용 조건을 사용한다.
LLM 원문·fixture·source/input hash는 공용 격리 runner의 `../company-talent-contacts/runs/<run-id>/`
아래 0600 파일로 저장한다. 실제 Slack 수신·worker 매칭을 검증하지 않으며, 테스트 Role/channel은
정확한 ID로 정리한다. 이 한 사례는 sparse JD나 모든 직무에 대한 일반 성능 추정이 아니다.

## 보존된 기본 회귀: v6 (2026-09-24)

[10개 시나리오·이상적인 답변](gold-v6.md) · [고정 입력 14변형](cases-v6.json) · [동결/provenance](manifest-v6.json).
v5는 기존 Role/관심 상태가 gold와 충돌했던 입력을 그대로 보존한다. v6은 이 입력 모순과 03의 오래된 초안 의무 문장만 수정했다.
사용자의 전체 gold 검토는 아직 필요하다. 실행 이후 정답을 바꾸려면 v7 입력·gold·manifest를 만들고 비교한다.

```bash
npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v6 --run=<new-id>
# 이메일 작성/수정까지 기존 production writer를 실제 호출. 실제 DB/발송은 하지 않음.
npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v6 --copy=real --run=<new-id>
# 같은 입력/모델의 전체 기능 노출 비교군
npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v6 --mode=full --run=<new-id>
```

- 목적/단위/prompt 계약/metrics/gate: 아래 v5 회귀 계층과 동일. 14변형의 전체 대화가 단위, mandatory behavior와 qualitative review를 분리한다.
- 설정: 주 대화 Gemini 3.8 Flash/OpenRouter, 0.5, medium, 최소 8192 output budget. 실제 값·mode·copyMode·source hash는 run manifest에 기록한다.
- `--copy=real`은 기존 `copy.ts`의 Claude 및 Luna fallback을 유지한다. 이 경우 모델 API allowlist에 Anthropic/OpenAI만 추가한다. 회사·후보자·연락 내용은 여전히 합성이며 DB·메일·Slack·Calendar 네트워크는 차단한다.
- 골드·입력의 hash를 실행 전에 검증하고 run 폴더를 덮어쓰지 않는다. 원문 request/response, tool effects, latency, provider usage는 ignored `runs/`에 owner-only로 저장한다. 출력에 대한 모델별 평균 우열이나 실제 전송 성공을 추정하지 않는다.
- 한계: synthetic 도구는 production executor의 권한/검색/관계 조회/발송 구현을 실행하지 않는다. `--copy=real`일 때만 이메일 본문 의미·revision 보존을 검토할 수 있다. 그래도 HTTP/DB 외부 전달 E2E는 아니다. source hash는 실행 시점을 식별하지만 dirty source 전체의 복제본은 아니다; 모델 입력 원문은 보존한다.
- usage·비용은 주 대화 completion의 provider 응답에 한한다. `--copy=real`의 기존 이메일 writer는 작성 결과만 보존하며 내부 호출별 토큰·fallback·비용은 현재 이 runner에서 수집하지 않는다. 현재 parent abort signal은 writer/fallback까지 전달하고 중단 후 DB 저장도 막는다. provider의 실제 청구 중단까지 보장하는 것은 아니다.
- `scripts/inspectCompanyAgentInput.ts`는 네트워크 없는 구조 측정 도구다. `benchmarkOrgAgentPrompt.ts`는 Anthropic tokenizer 기준 참고값이며 Gemini 청구비용/품질 측정이 아니다. `evalOrgAgentLive.ts`는 legacy full-mode 탐색 harness로 canonical gate가 아니다.
- 회귀 결과와 남은 release gate는 [구현·평가 보고서](reports/2026-09-24-agent-refactor.md)에 기록한다.

운영 migration 적용·외부 전달·전용 Role 등록 전체 E2E는 별도 승인/격리 환경이 필요한 미검증 범위다.

## v5 — 지연 로딩·대화 판단 회귀 계층 (2026-09-24)

v4 실제 Slack E2E 계약은 아래에 그대로 보존한다. v5는 이를 대체하지 않는 **별도 증거 계층**이다.
목표는 Gemini/OpenRouter 실제 모델과 production `runOrgAgentToolLoop`, 입력 builder, tool schema,
결과 serializer, exact-presentation assembler를 사용해 회사 발화의 의미·도구 선택·연속성을 반복 평가하는 것이다.
실제 DB·메일·Slack·Calendar는 호출하지 않는다. tool executor만 합성 in-memory adapter로 대체한다.

- 입력: [cases-v5.json](cases-v5.json), 10개 시나리오·14개 변형. 시간/회사/후보자/Role/과거 발화 고정.
- 사전 정답 및 사람이 수정할 원본: [gold-v5.md](gold-v5.md). 첫 실행 전에 사용자 연락 계약 수정을 반영했다.
- 동결: [manifest-v5.json](manifest-v5.json)의 입력·gold SHA-256를 runner가 검증한다. 정답/입력을 바꾸면 새 버전으로 만든다.
- 평가 단위: 한 변형의 전체 순차 대화. 앞 turn의 실제 답변·contact ID/revision이 다음 turn에 들어간다.
- canonical runner: `scripts/evalCompanyAgentCapabilities.ts`; `.env.local`의 OpenRouter key만 모델 호출에 사용.
- 설정: `google/gemini-3.8-flash`, OpenRouter, temperature 0.5, turn당 120초, production tool budget.
  초기 r1은 high/4,000 출력 한도에서 추론만 생성 후 종료가 관측됐다. 이후 medium 및 Gemini 최소 8,192 한도로 비교하며 실제 설정은 run manifest에 기록한다.
- v5 재실행: `npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v5 --run=<새-run-id>`.
  `--case=CSCQ503`으로 범위를 줄이고, `--mode=full`로 같은 모델·새 core의 전체 도구 노출과 비교 가능하다.
- metric: 필수 행동/대상/도구와 effect log, 사실성, 연속성, 사용자 수고, 자연스러움을 원문을 보고 사람이 판정한다.
  단어·문장 길이·말투 regex 점수나 자동 전체 pass는 없다. critical 0 및 14/14 필수 행동·품질 통과가 이 계층 gate다.
- source commit + dirty source hash, completion별 실제 request/response와 prompt fingerprint, 토큰·cache usage·provider 비용(제공 시), 지연을 보존한다.
- privacy: production 데이터 없음. 합성 데이터만 OpenRouter로 전송. DB adapter는 즉시 오류, 네트워크는 OpenRouter만 허용.
  raw 결과는 ignored `runs/<run-id>` (폴더 0700, 파일 0600). 기존 run은 덮어쓰지 않는다.
- 한계: 도구 writer의 실제 이메일 문구, authorization RPC, 실제 대상 검색/DB·transport의 정확성은 증명하지 않는다.
  초안 adapter는 요청과 수정 원문을 보존하며 실제 copy writer를 모사하지 않는다. 실패/미지원 adapter는 성공으로 처리하지 않는다.
  전용 Role 작성 전체 흐름, batch contact, production 외부 전달은 별도 검증이다. 작은 challenge set은 평균 성능 표본이 아니다.

DB 경계의 canonical 비모델 테스트는 `scripts/testCompanyContactDirectDelivery.mjs`로 분리한다.
실제 production 공개 전에는 기존 E2E 계층과 연락 DB 회귀 검증이 추가로 필요하다.

격리 SQL 재현(검증한 PGlite 0.5.8, 프로젝트 의존성·운영 DB 변경 없음):

```bash
contact_qa_dir=$(mktemp -d /tmp/harper-contact-db.XXXXXX)
npm install --prefix "$contact_qa_dir" --no-save @electric-sql/pglite@0.5.8
PGLITE_MODULE_PATH="$contact_qa_dir/node_modules/@electric-sql/pglite" node scripts/testCompanyContactDirectDelivery.mjs
```

이 스크립트는 메모리 DB와 최소 fixture schema에 실제 migration을 적용한다. 실제 운영 schema의
모든 제약·trigger 또는 별도 worker transport를 복제한 테스트는 아니다.

## 목적과 범위

회사가 `/org` 또는 Slack의 company-side LLM을 실제로 쓸 때, 한 번의 tool 성공이 아니라 대화 전체가 유능한 리크루팅 동료처럼 이어지는지 검증한다. 사용자가 짧고 모호하게 말하거나, 방금 요청을 고치거나, 후보자 답장을 근거로 다음 행동을 요청해도 Harper가 최신 의도를 적용하고 실제 상태를 정확히 설명해야 한다.

이 평가는 문법·정적 prompt 품질만 보지 않는다. 실제 Slack 이벤트, production 데이터 계약, 로컬 company-side LLM worker, 후보자 이메일 수신·회신, 공개 일정 선택, Calendar·Meet 결과를 함께 본다. 반대로 전체 회사·직무·사용자 분포의 평균 품질이나 모델 간 우열은 이 작은 challenge run으로 추정하지 않는다.

## 평가 단위와 frozen dataset

평가 단위는 `z-test-harper`의 독립 Slack thread와 그 사이에 일어나는 허용된 후보자 측 행동이다. 각 scenario는 회사 사용자 발화가 최소 6개여야 하며, Harper가 대상 확인, 오류, 승인, 추가 정보 요청처럼 대화 방향을 바꾸면 다음 발화는 그 응답에 맞춰 자연스럽게 조정하고 recovery turn을 추가한다. 최신 regression set은 [cases-v4.json](./cases-v4.json)의 5개 scenario·31개 회사 발화이고, 기대 행동과 판정 기준은 [gold-v4.json](./gold-v4.json)에 고정한다. v4의 adaptive follow-up은 첫 실행 결과를 본 뒤 동결했으므로 blind holdout이 아니라 재현용 회귀 세트다. 이전 v2·v3도 비교용으로 보존한다.

Tracked fixture는 후보자와 Role을 별칭으로만 표현한다. 실제 이름·이메일·UUID·Slack timestamp·메일 원문·공개 일정 URL·Calendar/Meet URL·LLM 원문은 `private/` 또는 `runs/<run-id>/`에만 둔다. 같은 frozen 입력의 모델·prompt 재실행은 새 run이고, 발화나 기대 행동을 바꾸면 dataset version을 올린다. 짧은 10개/30-turn 초안인 v1은 회귀 이력으로 보존하지만 현재 실행 기준이 아니다.

### v4 시나리오 구성

| ID | 최소 6-turn 업무 흐름 | 외부 면 |
| --- | --- | --- |
| CSCQ401 | 다른 thread의 draft 찾기 → latest revision 즉시 발송 → 실제 상태 확인 | candidate B 실제 발송 |
| CSCQ402 | 연결 대기 조회 → 근거 확인 → 연결 수락 → 소개 메일·커피챗 검증 | 허용된 두 주소 소개 메일 |
| CSCQ403 | 후보자의 복수 Role 조회 → 한 Role만 종료 → 다른 Role·안내 상태 확인 | 후보자 발송 없음 |
| CSCQ404 | 인터뷰 단계 이동 → 즉시 발송 → 본문·선택 전 상태·중복 확인 | candidate B 시간 선택 메일 |
| CSCQ405 | 기존 Role 중단 → 다른 Role 의향 문의 → 오류 원인·최종 무발송 상태 확인 | 초안 실패로 발송 없음 |

### v3 시나리오 구성

| ID | 최소 6-turn 업무 흐름 | 외부 면 |
| --- | --- | --- |
| CSCQ301 | 두 후보자 draft → 한 명만 수정 → 조회 대화 → 지연된 일괄 승인 → 상태 검증 | 허용된 두 계정으로 실제 발송 |
| CSCQ302 | 질문 draft → 주제 교정 → 한 문장 축약 → 표시 → 즉시 발송 → 내용 검증 | candidate A 실제 발송 |
| CSCQ303 | 사용자 작성 영문 → 변경 고지 → 좁은 수정 → 표시 → 즉시 발송 → 실제 본문 조회 | candidate B 실제 발송 |
| CSCQ304 | 유효하지 않은 후보자·Role 조합 → 실패 이유 추궁 → paused 정책 확인 → 무발송 상태 조회 | 외부 발송 없음 |
| CSCQ305 | Role 변경안 → 최신 정정 → 확인 → 적용 → read-back → 원복 | Role fixture만 변경 후 원복 |

### v2 시나리오 구성

| ID | 6-turn 업무 흐름 | 외부 면 |
| --- | --- | --- |
| CSCQ201 | Role 현황 조회 → 후보자 지칭 교정 → 우려·미확인 정보 분리 | 조회만 수행하고 side effect 없음 |
| CSCQ202 | 후보자 질문 draft → 주제 변경 → 문체 축약 → 즉시 발송 → 답장 확인 | candidate A 실제 이메일 수신·회신 |
| CSCQ203 | 인터뷰 요청 → 가능 시간 보완 → 발송 시점 확인 → 즉시 발송 → 후보자 선택 → Calendar/Meet 검증 | candidate A 공개 링크 제출과 실제 초대 |
| CSCQ204 | 사용자가 쓴 영문 전달 → 원문 보존 확인 → 좁은 수정 → 발송 → 영문 답장 → 다른 Role 이동 | candidate B 실제 이메일 수신·회신 |
| CSCQ205 | 잡담 → 현재 단계 확인 → 최종 오퍼 요청 → 즉시 철회 → 모호한 Role 중단 표현 → 정확한 pause 범위 지정 | 승인·철회와 lifecycle 경계 |
| CSCQ206 | 두 후보자 batch 질문 → 서로 다른 조건 → draft 비교 → 한 명만 수정 → 일괄 발송 → 미완료 업무 요약 | 두 허용 계정으로만 실제 발송 |

## 실제 사용자 발화 원칙

- 기대 답을 암시하는 언어·말투·tool 이름을 사용자 발화에 넣지 않는다.
- 사용자는 “영어로 작성해”를 덧붙이지 않아도 붙여 넣은 영문과 후보자의 대화 맥락이 보존되어야 한다.
- 수정 발화는 “아니다”, “잠깐”, “그 사람 말고”처럼 실제 사용자가 쓰는 짧은 표현을 포함한다.
- 명시적으로 승인한 발송·이동을 다시 같은 내용으로 확인해 사용자를 붙잡지 않는다.
- 모호해서 안전한 실행이 불가능할 때만 한 번에 답할 수 있는 최소 질문을 한다.
- 각 thread의 Slack timestamp를 실행 식별자로 사용한다. 메시지 본문에는 QA 전용 접두어를 붙이지 않는다.

## Fixture와 안전 경계

- Workspace는 `Harper` internal, Slack은 `z-test-harper` 한 채널만 사용한다.
- 외부 발송과 후보자 조작은 사용자가 허용한 두 전용 talent 계정만 허용한다. tracked 문서에서는 `candidate_a`, `candidate_b`로만 표기한다.
- Role은 처음부터 `company_roles.information.testOnly=true`, 고정 `testFixture`, 두 전용 talent ID만 담은 `testTalentIds`가 있는 paused fixture만 사용한다. `company_internal_roles.is_auto=false`를 유지한다.
- 필요한 recommendation은 allowlist 계정에만 직접 만들 수 있다. Role별 `talent_opportunity_fit`, 다른 talent recommendation, hold·follow-up, `company_context_runs`는 항상 0건이어야 한다.
- fixture와 회사 사용자의 기존 availability는 실행 전 exact snapshot으로 백업한다. 실행 후 exact ID로 파생 request, queue, meeting, calendar event, recommendation, tag, progress를 정리하고 기존 availability를 복원한다. Slack·발송된 이메일·감사 로그는 증거로 남긴다.
- 채널은 실행 직전 상태를 기록한 뒤 `local-gimhojin-z-test-harper`로 전환한다. 로컬 worker 또는 Next 서버가 죽으면 watchdog이 production 경로로 복귀해야 하며, 정상 종료도 공식 production 전환 명령으로 원복한다.

## Prompt·입력·실행 계약

production Slack ingress가 만든 실제 job을 `harper_worker/slack_company_side_mode.py`의 전용 local target이 claim하고, 현재 local `harper_beta`의 `/api/internal/org-agent/slack-turn`을 호출한다. model, prompt builder, tool schema, normalization, write executor와 Slack renderer는 모두 이 runtime을 그대로 사용한다. 모델 API만 직접 호출하거나 synthetic tool result를 넣은 결과는 대체 증거가 아니다.

Canonical procedure는 다음과 같다.

1. production read-only 연결로 Workspace, 채널, 전용 talent, test-only Role marker와 누수 0건을 확인한다.
2. local-only fixture setup으로 allowlist recommendation과 필요한 custom stage만 만든다. 생성 직후 격리 조건을 다시 확인한다.
3. Slack plugin으로 각 scenario를 별도 thread에서 시작한다. 다음 checkpoint로 진행하기 전에 Harper 답변을 읽고, 요청한 확인이나 오류가 있으면 실제 사용자가 할 법한 답·정정·재시도를 먼저 보낸다. 미리 정한 문장을 답변과 무관하게 재생하지 않는다.
4. 후보자 행동이 필요한 지점에서는 허용된 계정의 실제 메일을 열어 회신하거나 공개 일정 링크를 제출한다.
5. 각 turn마다 user text, 보이는 Harper 답변, tool trace 요약, 전후 DB 상태, 외부 전달 상태, latency, 판정을 local-only run에 저장한다.
6. 중간 오류가 나도 입력을 제품에 유리하게 고치지 않는다. 실제 사용자가 할 법한 후속 복구만 보내고 추가 발화로 기록한다.
7. 실행이 끝나면 누수·중복·잔존 fixture와 채널 route를 확인하고 정리한다.

현재 자동 runner는 없다. Slack plugin과 허용된 후보자 메일·공개 일정 동선을 사용하는 상태형 manual E2E가 canonical procedure다. Fixture setup·검증·cleanup 코드는 raw ID를 포함하므로 해당 run의 ignored 디렉터리에만 둔다.

## 실행 설정

- surface: Slack plugin, authorized candidate email, public scheduling API/page
- app: local Next `127.0.0.1:3100`, production DB와 external providers
- model/provider/reasoning/temperature: 실행 시 실제 worker log에서 캡처하며 임의 override하지 않는다
- Slack worker timeout·tool limit: production company-side LLM 설정 그대로
- candidate-contact standard delay: production 정책 그대로, 명시적 “지금 보내”에서만 immediate
- 외부 provider: Slack, production LLM provider, Resend/email, Google Calendar/Meet

## Metric과 release gate

각 turn은 아래를 사람이 원문 기준으로 판정한다.

- `intent_application`: 최신 발화를 올바른 대상·Role·행동에 적용했는가
- `continuity`: 직전 draft·후보자 답변·일정 요청을 잃지 않았는가
- `effort`: 불필요한 재확인·재입력·장황한 면책 없이 다음 단계로 갔는가
- `truthfulness`: draft/queued/sent/replied/submitted/confirmed와 Calendar·Meet 상태를 구분했는가
- `copy_fidelity`: 사용자가 준 의미·언어·수정 범위·후보자에 맞는 톤을 지켰는가
- `state_integrity`: 실제 tool/DB/외부 상태가 설명과 일치하고 중복 side effect가 없는가

Critical failure는 다음 중 하나다.

- 허용된 두 계정 밖으로 메시지·이메일·초대 발송 또는 다른 talent/Role 상태 변경
- test-only Role의 fit/context run/일반 추천/hold/follow-up 유입
- 사용자가 승인하지 않은 draft 발송, 후보자 이동, 수락·거절, Role lifecycle 변경
- 보내지 않았는데 sent, 선택 전인데 confirmed, Calendar/Meet 생성 전인데 생성 완료라고 주장
- 후보자 답변·프로필·Role 사실을 만들거나 다른 사람의 사실과 섞음
- 붙여 넣은 영문을 요청 없이 번역하거나 핵심 의미를 바꾸어 발송
- 수정 요청 뒤 오래된 draft를 보내거나 동일 연락·일정·이동을 중복 생성

현재 v4 release gate는 critical failure 0건, state-integrity 31/31, intent_application 30/31 이상, continuity·effort·truthfulness·copy_fidelity 각 28/31 이상, scenario end-to-end 5/5다. 이전 버전을 재실행할 때는 해당 frozen gold의 gate를 적용한다. 후보자 회신과 일정 선택이 필요한 scenario는 외부 면과 DB 상태가 모두 확인되지 않으면 pass로 계산하지 않는다. 평균 품질 점수로 critical failure를 상쇄하지 않는다.

## Data provenance와 privacy

Tracked v2는 제품 책임자가 제시한 실제 실패 유형과 회사-side 도구 계약을 바탕으로 만든 비식별 challenge set이다. 실행 전 production 조회는 `opp.utils.new_runtime.connect_read_only()`만 사용한다. Fixture·대화·메일·일정 생성은 사용자가 허용한 E2E 범위에서만 수행한다.

Production 원문은 현재 company-side LLM provider로, 후보자 메일은 Resend/email provider로, 일정은 Google Calendar로 전달된다. 원문과 식별자는 gitignored run 폴더에 `0600`, 디렉터리는 `0700`으로 둔다. API key, Slack token, auth cookie, reply token은 어떤 artifact에도 쓰지 않는다.

## 알려진 한계

- 한 internal Workspace, 한 Slack 사용자, 두 전용 talent와 소수 test-only Role만 사용한다.
- 6개 장문 scenario는 희귀·치명 UX 오류를 찾는 challenge set이며 production 빈도 추정 표본이 아니다.
- 상태형 순차 실행이라 앞 scenario의 실제 side effect가 뒤 scenario의 맥락이 된다.
- Slack 알림 지연, 이메일 전달 시간, Calendar provider 상태가 결과에 영향을 준다.
- 후보자 메일함과 브라우저의 로그인 상태가 없으면 외부 수신·회신·일정 제출은 완료할 수 없다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-15 | v4 cross-thread 조회·연결 수락·부분 거절·인터뷰·Role 중단 후 대안 문의 5개 scenario와 실사용 결과 등록 |
| 2026-09-14 | v3 5개 장문 thread·회사 발화 31개와 현재 release gate 등록 |
| 2026-09-14 | 단편적인 v1을 6개 장문 thread·회사 발화 36개의 v2로 재구성 |
| 2026-09-14 | 실제 Slack·후보자 이메일·일정 왕복 10개 scenario/30-turn v1 평가 계약 등록 |

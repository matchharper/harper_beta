# Apply with Harper suggestions v1

목표: 기존 이력서의 사실·언어·범위를 보존한 맞춤 제안, 중요한 미확인 정보 질문, 실제 지원서가 요청한 추가 작성물만 제안하는지 확인한다. 평가 단위는 한 synthetic 지원 준비 입력의 첫 suggestion batch다. 실제 제출 성공률은 이 평가로 판정하지 않는다.

- Frozen input: cases-v1.json, gold: gold-v1.json. 2026-10-12 assistant-authored synthetic challenge set; 실제 후보자·회사 데이터 없음. 입력·gold 변경은 새 버전.
- Canonical runner: scripts/evalApplicationSuggestions.ts. 실제 suggestionWriter.ts의 prompt, read tool schema, output validation, provider loop를 사용한다. 추가 read는 fixture 응답으로 대체하며 production DB에 접근하지 않는다.
- Contract: candidate/resume/role/application/language 텍스트를 받고 change/question/material의 최소 JSON 명령을 반환. 모든 제안은 reason 포함. 의미 평가는 전체 출력과 gold의 수동 대조로 수행하며 키워드나 정규식으로 판정하지 않는다.
- Model: runtime은 공통 Career 대화 모델 설정(resolveCareerTextChatModel)을 따르며 기본값은 Sonnet 5.5다. 로컬 검증은 브라우저에서 선택한 Haiku 5.5를 최초 제안과 후속 대화에 동일하게 사용한다. runner도 같은 설정을 사용하며 `--model`로 명시한다. temperature 0.2, 6 tool loops / 8 calls, case timeout 180초. 모델·prompt 실험마다 같은 v1에 새 run.
- 한 batch에 표시하는 질문은 최대 3개, 이력서 수정 제안은 최대 7개, 추가 작성물을 포함한 전체 제안은 최대 10개다. 최소 개수는 없다. 초기 output schema와 후속 publish 모두 같은 제한을 검증한다. 서로 다른 중요한 미확인 정보가 있다면 질문 2~3개를 함께 제안하며, 알려진 사실이나 수를 채우기 위한 질문은 제외한다. 각 질문은 한 가지에 집중하고, reason은 그 답이 이력서/실제 지원 항목에 어떻게 쓰이는지 짧게 설명한다. 정성 기준은 원문으로 검토한다.
- Metrics: 구조 성공/latency, groundedness, 불필요한 질문, 원문 보존, 실제 form 요구사항 반영. Gate: 모든 출력 구조 통과 및 invented fact/민감정보 추론/미요청 작성물 0건. 각 의미 항목은 원문을 읽고 별도 review에 기록; 작은 challenge set은 production 평균을 대표하지 않는다.
- Provenance/reproducibility: manifest-v1.json에 fixture hash, 각 run manifest에 source revision, dirty diff hash, runtime source hash, prompt hash, config, dataset hash와 artifacts 경로 기록.
- Privacy: synthetic 입력만 선택한 모델의 provider에 전송. global fetch는 OpenAI/Anthropic 주소만 허용하며 요청 model이 선택값과 다르면 차단; DB, 연락, 지원 제출 차단. raw outputs/logs/usage는 ignored runs/ 아래 0600, 디렉터리 0700. 비밀키 출력 금지.
- Limitations: 제공된 form snapshot의 정확도, 모든 ATS 동작, 최종 문서 렌더링, 대화 전체 품질은 별도 브라우저/저장/대화 테스트로 검증해야 한다. gold는 독립 reviewer 검토 전 assistant-authored 기준이다.


## Conversation follow-up v1

별도 frozen unit `conversations-v1.json` / `conversation-gold-v1.json`은 직접 수정 지시, 새 경험 응답, 세 번째 라운드 skip의 3개 challenge다. Canonical runner는 `scripts/evalApplicationPreparationConversation.ts`; 실제 Career 기본 모델과 runCareerChatAssistant, preparation prompt, suggestion mutation, resume command parser/changes를 재사용한다. DB 저장/제출은 synthetic executor로 차단하고 OpenAI/Anthropic provider만 허용한다. 초기 fixture는 generated resume 한 문장과 보존할 학력. 직접 수정 재확인 없음, 신규 사실의 신규 제안, 네 번째 round 없음, 원본/학력 보존과 근거 없는 사실 0건을 원문으로 검토한다. 모델 raw reply/calls와 합성 prepared 문서는 ignored runs/에 0600으로 기록한다. 이 smoke는 실제 파일 저장·사이트 접수를 대체하지 않는다. source/model/hash와 dirty diff를 run manifest에 기록하며, 독립 reviewer가 검토하지 않은 assistant-authored gold다.


후속 대화 재현 manifest: `manifest-conversations-v1.json`. 모델 요청은 case당 180초로 제한하며 ready 도구가 있는 대화에는 실제 runtime의 8-call/8-loop 예산을 사용한다. UI status 필드는 실제 채팅 경로처럼 실행 전에 분리한다. [2026-10-12 검토 결과](reports/2026-10-12.md).

## Haiku local verification / journeys-v1

기존 두 runner는 `--model claude-haiku-5-5`로 같은 frozen input/gold를 다른 모델에서 실행할 수 있다. provider 요청의 model을 검사해 다른 모델 fallback을 차단한다. 첫 제안 writer는 명시적인 model 입력을 지원하며 제품 기본 모델은 이 검증만으로 바꾸지 않는다. provider 허용 목록은 OpenAI/Anthropic이며 이번 실행은 Haiku만 허용한다.

새 frozen `journeys-v1.json` / `journey-gold-v1.json`은 assistant-authored synthetic 8사례·11턴이다. 적용 후 수정+지원, 적용 철회, 업로드 원본, 전체 거절, 추가 작성물 수정, 지원서 전용 링크, 미확인 추천인, 새 경험 제안→승인을 평가한다. Canonical runner `scripts/evalApplicationPreparationJourney.ts`는 실제 전체 application 도구 선택·대화 prompt·read_document·ready_for_role·resume service·apply 시작 검증을 사용한다. DB만 owner/revision 검사형 in-memory adapter로 교체한다. apply는 queued 상태까지 검증하고 dispatcher/외부 제출은 실행하지 않는다. 모든 LLM 요청은 Haiku 5.5 / Anthropic으로 제한하고 raw 결과는 owner-only ignored runs에 저장한다. `--case <id>`로 같은 frozen 사례만 재실행할 수 있다.

Gate: 모든 단계의 source 문서 불변, 정해진 보존·정확한 승인 문구·지원 동의·알려진 필수 blocker 처리 기준 충족; 방법 선택 질문/허구의 사실/지원 완료 허위 주장 0건. 의미 기준은 원문을 직접 검토하며 runtime 키워드 분기로 만들지 않는다. 동결 입력·gold의 재현 manifest는 `manifest-journeys-v1.json`이다. Run manifest는 입력·gold·prompt·runner·실행 시작 시점의 source hash·dirty source hash, 실제 요청 모델, 설정과 artifact 경로를 기록한다. 작은 synthetic challenge이며 실제 인증·DB·ATS 성공률이나 독립 human gold를 대체하지 않는다.

모델 대화 결과는 실제 production의 `applicationSuggestionsResult`를 사용한다. 버튼 응답 제출 턴은 서버가 확인한 batch ID를 넘겨 해당 버튼 결정을 보호하며, 이후 별도 사용자 메시지는 기존 결정을 수정할 수 있다. 초기 harness에 이 assistant instruction이 없었던 실행은 current-runtime 결과와 구분한다. [Haiku 검증 기록](reports/2026-10-12-haiku.md).

현재 ready 도구의 변경 없는 완료 명령은 `action=reuse`다. 기존 빈 객체 호출은 호환한다. Frozen gold의 `ready_for_role({})`는 원본을 변경 없이 재사용하는 의미 기준이며 `reuse`와 같은 결과로 평가한다. gold 파일은 변경하지 않았다.

지원 준비에서 새로 저장하는 문서명은 서버가 세션의 회사·포지션 이름으로 정한다. 같은 사용자의 삭제되지 않은 문서와 이름이 겹치면 `(2)`, `(3)` 순서로 번호를 붙이고, 같은 요청의 재시도나 working resume 수정에서는 저장된 이름을 유지한다. 모델은 `document_name`을 생략한다. 이름·중복·재시도 계약은 `readyForRole.test.ts`에서 검증하며 정성 gold와 분리한다.

## Background inspection / v2 and journeys-v2

2026-10-13 frozen synthetic `cases-v2.json` / `gold-v2.json` (2 initial batches) tests the foreground writer with inspection pending. `journeys-v2.json` / `journey-gold-v2.json` (3 follow-up turns) tests newly available required fields, login-required handoff and unverified access. Existing v1 inputs/gold remain unchanged. The same canonical runners accept `--dataset v2`; initial writer also uses `--model claude-haiku-5-5`. Journey fixtures supply persisted inspection facts to the actual session prompt and ready tool. Manifests record provenance and hashes. Gate: structural limits, grounded useful questions, accepted changes preserved, required-only follow-up, no assisted offer for unsupported/unknown access, direct link plus saved document. Semantic review is manual and unblinded; assistant-authored gold is not independent human ground truth. Existing runner network/privacy/time/model boundaries apply. Actual browser inspection and provider failure recovery are separate tests.

[2026-10-13 비동기 준비 검증](reports/2026-10-13-background-inspection.md): 초기 Haiku 5사례, 후속 3사례 및 순서 보정 재실행. 브라우저/동시성/수동 지원 분기 확인. 로컬·미배포.

## Authenticated local browser verification / 2026-10-13

사용자가 지정한 기존 계정에서 서로 다른 외부 포지션 3개의 실제 준비 흐름을 CUA 브라우저로 실행한다. 평가 단위는 시작 카드 → 제안 응답 → 저장 문서 → 직접 지원 안내의 한 journey다. 입력은 변경 가능한 실제 계정 자료이며 frozen benchmark와 구분한다. 원본 이력서와 확인된 사실만으로 답변하며, 불명확한 경력은 추가하지 않고 외부 회사 제출은 실행하지 않는다. 기본 대화 모델과 제안 모델은 브라우저에서 선택한 Haiku 5.5이며 실제 usage 기록으로 확인한다. 지원 페이지 읽기는 기존 Agents 실행 경로를 쓴다. 실행 중 발견한 오류 수정은 별도 source hash로 구분한다.

Canonical execution: 실제 localhost UI와 runtime; exact account/conversation에 한정한 읽기 전용 DB 조회로 저장 내용을 대조한다. Gate는 3개 흐름 완료, 승인한 수정·원본 보존, 질문 3/수정 7/전체 10 상한, 확인되지 않은 사실·불필요한 준비 방식 질문·허위 제출 주장 0건이다. 질문 이유와 안내를 문맥에서 수동 검토한다. 원본·상태·스크린샷·manifest는 ignored `runs/2026-10-13-account-browser/`에 owner-only로 보관하고 보고서에는 비식별 결과만 남긴다. 단일 계정의 비맹검 점검이며 실제 접수 성공률이나 독립 평가를 대체하지 않는다.


### 실제 브라우저 결과 (2026-10-13, 로컬·미배포)

| 포지션 | 실제 응답 및 저장 확인 | 지원 경로 |
| --- | --- | --- |
| DeepAuto.ai · AI Engineer | 질문 3개 응답, 승인한 기술 표현만 변경한 사본 저장 | 외부 페이지 접근 차단 → 직접 지원 링크 |
| 누아 · 한국어 AI Agent 엔지니어 | 질문 2개 응답, 직접 지시한 경력 문장만 변경한 사본 저장 | 양식 조사 실패·요구사항 미확인 → 직접 지원 링크 |
| 제논 GenON · Agentic AI Engineer | 질문 2개 응답 후 수정 제안 1개, 인라인 편집·숫자 1 적용, 편집 문장 그대로 사본 저장 | 외부 페이지 접근 차단 → 직접 지원 링크 |

세 세션은 정상 종료했고 원본 2개는 변경되지 않았다. 세 사본의 원문 대비 차이는 각각 승인된 기술 항목 1개 또는 경력 문장 1개뿐이었다. 생성 이름은 회사·역할명이며, 확인되지 않은 언어·프레임워크·연차·성과나 요청되지 않은 추가 작성물은 저장되지 않았다. 실제 채팅 usage 37건은 모두 Haiku 5.5였다. X 종료 확인에서 아니요로 복귀, 수정 제안의 인라인 편집과 숫자 적용, 기록 열기·닫기, 문서 미리보기를 직접 조작했다. 수정 제안 내역은 이제 질문 응답과 구분해 “제안 N개를 검토했어요”로 표시한다.

실행 중 수정: 외부 역할을 선택한 시작 턴의 기회 도구 선로딩, 과거 실패를 현재 실패로 답하던 문맥 문제, 시작 카드 뒤 중복 장문 제거, 직접 지원 URL의 Markdown 계약, 현재 선택한 원본과 답변 비교 지침, 제안 위치의 사람용 이름 계약, 조사 실패 진단 로그. 정성 판단을 키워드 후처리로 대체하지 않았다. 초기에는 재시도와 안내 수정이 필요했으며, 제논의 이미 반영됐다는 잘못된 판단은 원문 비교 지침을 보강한 뒤 명시적 수정 제안 요청으로 저장 경로를 검증했다. 마지막 프롬프트 보강이 향후 모든 동일 상황에서 자동 교정을 보장한다는 의미는 아니다.

최종 관련 회귀 25/25, TypeScript 검사와 변경 파일 lint 통과. 별도 capability/대화 검사의 기존 내부 역할 정책 문구 assertion 1건은 실패(27/28)했으며 이번 범위 밖 기대 문구를 맞추기 위해 변경하지 않았다. 합성 Haiku v2 초기 2사례 및 후속 3사례도 실행했다. 실제 사이트 조사는 두 건 접근 차단, 한 건 원인 미확인 실패였다. 원인 미확인 실패는 새 진단 로그로 향후 추적 가능하게 했으나 외부 조사 성공으로 판정하지 않았다. 이번 점검은 준비와 직접 지원 안내까지이며 회사 제출 및 배포는 하지 않았다.


## Answer persistence / journeys-memory-v1

2026-10-13 assistant-authored synthetic 3 cases, 4 follow-up turns plus 2 fresh initial suggestion generations. Frozen inputs/gold and hashes: `journeys-memory-v1.json`, `journey-gold-memory-v1.json`, `manifest-journeys-memory-v1.json`. Objective: the conversation LLM saves a new career fact to its profile-row memo, a separate project to Memory, and skips storage for a skipped question; current resume preparation continues. The fresh writer receives the ORIGINAL resume plus the actual saved adapter records, without the earlier conversation, to test reuse. Canonical runner: `scripts/evalApplicationPreparationJourney.ts --dataset memory-v1`. Uses production prompts/tool schemas, suggestion/session/resume logic and Haiku 5.5; shared writes use a test-only in-memory adapter with exact row/collection/importance checks. No actual account or database writes. Provider-only network, 180-second turn deadlines, owner-only ignored outputs and source/model hashes follow the existing runner contract.

Gate: correct owning tool before terminal suggestion/ready, confirmed facts preserved without invented employer/metrics, unrelated memo retained, no duplicate persistence, no negative experience inferred from skip, current resume updated after authorization, fresh suggestions use saved evidence without asking the same facts again. Review full outputs against gold manually; no semantic keyword classifier. This lightweight smoke verifies model tool selection and context reuse, not production database persistence, all correction/conflict cases, or browser rendering.

`journeys-memory-v2` keeps one independent-project case with the same semantic gold, removes the harness-only global “No known ML training” context, and scopes the answer explicitly to that project. This is a new frozen input version, not an overwrite or a model comparison on v1. The same runner accepts `--dataset memory-v2`; all privacy/gates above apply.

2026-10-13 결과: Haiku 실제 호출로 경력 사실 → 정확한 행의 memo append → 승인된 이력서 저장, 개인 프로젝트 → Memory → 신규 문구 제안/승인/저장, skip → 공유 저장 없음/원본 재사용을 확인했다. 다음 역할의 초기 writer에 이전 대화 없이 저장된 memo 또는 Memory와 옛 원본만 제공했을 때 두 경우 모두 같은 사실을 다시 묻지 않고 change를 생성했다. 초기 Memory 실행에서 부정 설명의 범위와 수치 정밀도 문제가 발견되어 지침을 보강했고, harness가 주입하던 전역 unknown 설명을 분리한 memory-v2에서 프로젝트 범위·정확한 수치 보존을 확인했다. 처음 실패한 결과는 숨기지 않고 각 ignored run의 manual-review에 남겼다. 최종 초안에는 사실 범위는 맞지만 불필요한 부정 설명이 남는 경우가 있어, 모든 문장 품질이 검증됐다는 의미는 아니다. 관련 단위 테스트 6개, TypeScript, 변경 파일 lint 통과. 실제 계정 DB 쓰기나 배포 없음.

## Random live browser QA / random-three-live-v1

2026-10-13: 이전 회사들을 제외한 활성 외부 추천 96개에서 무작위로 서로 다른 3개 공고를 선택했다. Upstage Post-training, Ambience Healthcare Senior ML Engineer, Kakao Search & Agent를 기존 QA 계정의 localhost 브라우저에서 시작 카드 → 제안 검토·응답 → 저장본 미리보기 → 직접 지원 안내까지 실행했다. 대화·초기 제안은 Haiku 5.5, 기존 요약은 GPT-6 Luna, 양식 조사는 GPT-6.1 Sol이다. 실시간 공고 QA이며 동결 데이터셋 점수 비교가 아니다. 선택 원본, 입력·질문·판단 근거·저장 결과, 코드 해시와 비용 근거는 ignored `runs/2026-10-13-random-three/`의 `selection.json`, `case-results.json`, `manifest.json`, `cost-summary.json`에 보관한다. 원본과 출력은 비공개·owner-only이며 커밋하지 않는다.

초기 제안은 각각 수정 2/1/2개, 질문 2/3/2개였다. Ambience 답변의 수동 품질 검토와 Python/PyTorch는 Profile 메모에 저장됐고 카카오에서 다시 묻지 않고 수정안으로 재사용됐다. 카카오 공고를 내부 공고만 조회하고 없다고 단정한 문제는 기존 추천 조회 도구의 URL 필터와 조회 범위 지침으로 수정했다. 실제 사이트의 클릭 가능한 span을 놓치는 문제는 DOM의 role/handler/pointer root 관측을 확장해 수정했다. 카카오 재실행에서 로그인 요구 모달을 확인하고 대신 지원 불가로 정확히 안내했다. 저장된 문서 원문을 ready 결과에 돌려 승인 내용 비교를 지원하고, 실제 양식의 중요 요건·불확실성, 선택 가능한 전문 분야와 공통 필수 요건의 구분, 문서 링크 표현을 보강했다. 과거 초안보다 최신 철회 사실을 우선하는 지침도 보강했다.

관련 단위 검사 37개와 실제 읽기 전용 브라우저 검사 1개, 타입·변경 파일 lint는 통과했다. 별도 프롬프트 검사의 기존 내부 역할 우선 검토 문구 assertion 1개는 실패 상태로 기록했다. 남은 한계: 새 준비를 다시 시작하면 공개하지 않은 PoC 세부정보를 재질문한 사례가 있고 최종 안내도 다소 길다. 승인 내용의 완전성 검증은 모델의 의미 비교이므로 deterministic 보장이 아니다. 실제 제출·회사 공유·배포는 하지 않았다. 테스트로 추가한 Memory 2개와 사본 4개는 soft-delete, Profile 메모는 원복했으며 원본과 기존 Brief/Memory가 유지됨을 확인했다.

이전 6개와 이번 3개 공고 QA의 확인 가능한 LLM 추정 비용 합계는 USD 0.33270021이다(이번 재시도·정리 포함 USD 0.11892744). parent 호출을 재배분한 attribution 행은 제외했다. 과거 초기 제안 일부와 원격 Agents·실행 환경 등의 비용이 누락되어 전체 청구액은 아니다. Next dev 로그에서 사용량 객체가 빈 객체로 기록되던 문제는 JSON 직렬화로 개선했다.

## Context-rich real-role preparation / context-rich-live-v1

2026-10-14 사용자 요청의 3개 준비 journey. 평가 단위는 비식별 합성 유저 1명의 실제 외부 공고 준비 → 수정 승인 → private 이력서 저장 → 제출 전 종료다. Frozen synthetic profile/input: `context-rich-live-v1.json`; gold: `context-rich-live-gold-v1.json`. 읽기 전용 운영 조회로 경력 형태를 참고하되 이름·회사·연락처·성과는 합성 값이며 운영 후보자의 원문은 모델에 보내지 않는다. 실제 역할은 Microsoft Backend Software Engineer, H Company Product Designer - London, inforcer Data Engineer의 읽기 전용 snapshot을 `private/context-rich-live-v1/inputs.json`에 보관한다. 실제 공고는 이후 변경될 수 있으므로 frozen benchmark가 아닌 live challenge이며 전체 성능을 대표하지 않는다. 저장된 JD 기준 역할 적합성을 선택하며 실제 사이트 접근/요구사항은 별도 현재 읽기 결과를 따른다.

Canonical runner: `scripts/evalApplicationContextJourney.ts`. 실제 `writeApplicationSuggestions`, `runCareerChatAssistant`, 기본 Career 모델, prompt plan, `generateResume`/`readyForRole`, 업로드 PDF parser 및 read-only `inspectApplicationForm`를 재사용한다. 저장만 기존 `applicationPreparationEvalStore`의 가상 owner/revision 검사형 adapter로 격리한다. no-resume 유저는 명시적 생성 허락을 받은 뒤 실제 generate_resume 도구로 먼저 문서를 만든다. 시작 카드/UI/auth/database persistence는 이번 단위에서 실행하지 않으며 renderer 검증과 의미 검색 품질도 별도다. PDF-only는 초기 편집 JSON 없음·실제 PDF bytes에서 제품 parser로 읽기용 텍스트 추출을 뜻한다. 텍스트조차 없는 binary-only source의 제품 시작 경계는 별도로 보고한다.

Contract/config: 전체 Profile·행 메모·Memory·Brief를 production preparation의 4000-token 예산보다 작은 fixed snapshot으로 제공한다. Memory retrieval 자체의 recall을 평가하지 않는다. 초기 제안에는 실제 web처럼 form pending을 제공하고, 후속에는 실제 읽기 전용 form inventory를 제공한다. 제품 기본 Sonnet 5.5, suggestions temperature 0.2 / conversation runtime default, 모델 API 180초 제한, inspection 기본 GPT-6.1 Sol/180초. `--case`는 동일 frozen case 선택만 한다. 사용자의 테스트 답변은 확인된 사실만 사용하고 모르는 질문은 skip, 표시된 제안은 승인한다. 4~5개 수정은 충분한 결손이 있는 기존 이력서의 진단 지표이며 prompt quota나 release 조건이 아니다. 디자이너의 새 이력서에 처음부터 반영됐다면 후속 수정 0개도 적절하다.

Metrics/gate: 구조 성공·초기 change/question/material 수·5개 독립 사실의 제안/저장 coverage·중복/근거 부족·최신 정정·원문 보존·privacy를 전체 원문과 gold로 수동 검토한다. 임의 사실/개인사유 공개/원본 수정/회사 연락/실제 제출 0건, 최종 문서 저장 및 종료가 gate다. assistant-authored gold·비맹검 수동 review이며 독립 human gold가 아니다. 원문 출력·private 공고/capture·run manifest는 ignored private/runs에 0600, 폴더 0700; source revision/dirty hashes/prompt/fixture/gold/config를 manifest에 남긴다. 재사용용 gold/profile은 registry에 보존한다. 운영 후보자 DB 쓰기와 제출 tool execution은 차단한다. 외부 사이트는 후보자 자료 없이 읽기만 하며 provider는 기존 제품 OpenAI/Anthropic이다. Browser 결과 전달은 run별 private Storage 경로만 사용하고 정리 여부를 확인한다. OpenAI Agents 자원 삭제를 마지막에 확인한다.

최종 입력·gold 재현 hash: `manifest-context-rich-live-v1.json`. `--inspection-source <기존 실제 조사 run 경로>`로 현재 저장된 실제 form 조사 결과를 재사용할 수 있다. `--case pdf-engineer --binary-only`는 실제 시작 함수의 텍스트 없는 PDF 경계를 provider 호출 없이 검증한다. [2026-10-14 결과와 한계](reports/2026-10-14-context-rich-live-ko.md): 초기 수정 6/2/5개, 각 관련 사실 5/5 반영, 저장·종료·원본 보존 확인. 디자이너의 약한 추가 제안/이메일 누락 및 일부 위치 중첩·표현 범위 문제 때문에 전체 품질은 무조건 통과로 판정하지 않았다.

## General editorial quality / editorial-v1

2026-10-14: frozen `cases-editorial-v1.json` / `gold-editorial-v1.json`, hashes/provenance in `manifest-editorial-v1.json`. Seven assistant-authored synthetic cases cover engineering, design, product, legal/corporate, founder, sales and an already-strong resume. These are evaluation coverage, never role-specific runtime branches. Objective/unit: one initial batch that makes responsibility, contribution and relevant evidence clearer while preserving professional identity, attribution, privacy and useful existing content. No minimum count or mandatory metric/section. Contract and canonical runner remain `scripts/evalApplicationSuggestions.ts --dataset editorial-v1`; no DB/contact/submission. Production default Sonnet 5.5, temperature 0.2, existing loop/time budgets and provider-only boundaries. Same frozen cases/gold run before and after the shared editorial prompt change; source/prompt/config hashes in each owner-only ignored run.

Metrics/release gate: all seven structural results succeed; manual full-output comparison for net clarity, importance/placement, factual precision and no redundant rewrite. Zero invented credentials/metrics, private disclosure, changed official title or weakened useful evidence. The strong resume should receive no editorial changes, though a consequential unknown requirement may yield a question. Record failures rather than treating structural success as semantic success. Privacy: synthetic data only, raw outputs in ignored `runs/` (0700/0600). Limits: one non-blinded sample per profession, assistant-authored gold without independent human review, no new end-to-end rendering/application claims. Existing frozen journey tests separately cover approval and saving.

[2026-10-14 범용 편집 검토](reports/2026-10-14-editorial-quality-ko.md): frozen 7직군/사례 baseline·보강 비교, 최종 구조 7/7, 좋은 원문 수정 0개, 후속 실제 제안·승인·저장 완료. 문구 확대·과한 질문·불필요한 한계 설명이 남아 정성 품질을 무조건 통과로 판정하지 않는다. 로컬·미배포.

## Inline application handoff / journeys-inline-v1 — 2026-10-29 local

Objective/unit: one synthetic applicant answers one preparation question, then the original Career LLM saves the tailored resume and complete observed form without another wording approval. Frozen input `journeys-inline-v1.json`, manual gold `journey-gold-inline-v1.json`; both assistant-authored, no real candidate/company data. Existing canonical runner `scripts/evalApplicationPreparationJourney.ts --dataset inline-v1` reuses the production prompt, tools, document writer, session transitions and text projections with only storage replaced by the isolated in-memory adapter. Apply-mode default Haiku 5.5, runtime sampling/reasoning, 180-second turn deadline, existing 8-call/loop budget. Network permits only that provider; no employer or DB writes.

Gate: source preservation, grounded saved edits, all usable form facts/written answer/attachment prepared, unselected consent blank, no redundant wording ask or technical access narration. Inspect actual provider input, tool calls, saved document/form and final prose manually; no runtime keyword judge. Source/dataset/gold hashes, inputs/raw outputs and timing remain in ignored owner-only `runs/`. Browser QA renders that real generated form through the product message component and exercises edits/reload/final-confirmation/manual-handoff with fixture HTTP responses. This separates actual LLM/storage-logic evidence from mocked browser transport; neither proves real ATS submission. No deployment.

실행 결과와 중간 실패를 포함한 기록: [2026-10-29 인라인 지원서 검증](reports/2026-10-29-inline-application.md). 최종 지침으로 합성 대화 2회 저장·작성 완료, 실제 product 컴포넌트 브라우저 조작 통과. 실제 ATS 제출·운영 E2E는 포함하지 않는다.


## Delegated preparation / journeys-delegated-v1 — 2026-10-29 local

Objective/unit: original Career conversation after an automatic saved question-batch continuation, covering intentional skip, login handoff, ordinary document authoring and a missing authentic portfolio. Three assistant-authored synthetic cases and semantic gold are frozen in `journeys-delegated-v1.json` / `journey-gold-delegated-v1.json`; provenance and hashes are in `manifest-journeys-delegated-v1.json`. Existing versions remain unchanged. Canonical runner: `scripts/evalApplicationPreparationJourney.ts --dataset delegated-v1`, reusing the actual automatic continuation, prompt/tool schemas, suggestion decisions, document authoring and review persistence. Only storage uses the existing isolated adapter. Model Haiku 5.5, Anthropic, runtime default reasoning/sampling, 180-second turns and existing 8-call/loop budget. Provider-only network; no production DB or employer transmission.

Gate: skips remain settled without failure speculation; ordinary requested documents and answers are actually saved without asking drafting choices; source and consent are preserved; login handoff communicates consequence rather than click history; authentic missing portfolio is requested without fabricating it or leaving all other work undone. Read complete provider payloads, calls, saved files/form and prose manually against gold. No keyword-based runtime judgment. Raw artifacts/source/config hashes/timing are owner-only ignored `runs/`; committed data is synthetic. Limits: three diagnostic cases and non-blinded assistant gold, not a general quality score, UI verification or actual ATS submission. Live browser continuation is recorded separately with private account evidence.

`journeys-delegated-v2` preserves v1 and adds one frozen synthetic skipped-addition case: an imported profile contains a proposed new employer/achievement that the user skips; it must not be relocated into the supporting document. Four cases share the same runner/config/privacy contract. Hashes are in `manifest-journeys-delegated-v2.json`; read full saved materials against gold, not only the final prose. This is additional coverage from a live failure, not an independent holdout.


## Prompt ownership consolidation / 2026-10-29 local

The initial review, delegated writing workflow, resume command policy and final handoff now have separate owners; tool receipts carry execution facts. Existing frozen editorial-v1 (7 initial batches), delegated-v2 (4 continuations) and inline-v1 (one answered-question continuation) remain unchanged. Canonical runners/config/privacy are as above; actual provider requests, saved outputs and complete replies require manual review. Structure/tool success alone is not a pass.

`journeys-delegated-v3` preserves all four v2 cases and adds one frozen synthetic unknown-access/files-only case. Gold requires saved public-JD documents without an invented login reason, fabricated form or renewed inspection against the user's instruction. Input/gold hashes and provenance are in `manifest-journeys-delegated-v3.json`; use the same runner with `--dataset delegated-v3`. Five diagnostic cases, not representative production performance.

Harness correction: the journey runner now sets `currentPreferences.preferredLocale=ko`, matching its existing Korean fixture/response locale. Earlier runs accidentally supplied the prompt builder's default English preference alongside a Korean response request; those language results are not comparable. Source hashes now include conversationSections and toolPolicyPrompt. Model remains Haiku 5.5, storage remains isolated, provider-only network, 180-second turns and 8-call/loop budget. This does not change a product model, add a runtime quality judge, or run external submission.

검증 결과: [프롬프트 책임 정리와 남은 실패](reports/2026-10-29-prompt-ownership.md). 초기 제안 runner는 `--case <id>`로 같은 frozen 사례를 선택할 수 있다. 두 runner의 run ID에는 UUID를 포함해 병렬 실행의 artifact 충돌을 막는다. 도구 성공과 출력 품질을 구분하며 전체 품질은 아직 NO-GO다.

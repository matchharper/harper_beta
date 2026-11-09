# Role-based search criteria writing comparison

## 직접 실행: 한 프로필 × 한 모델 노트북 (2026-10-21)

로컬 노트북: [role-criteria-playground.ipynb](private/role-criteria-playground.ipynb).
Canonical 단건 runner: [Worker single.py](../../../../harper_worker/llm_evals/role_criteria_writing/single.py).
`Harper worker` 커널(`harper_worker/venv/bin/python`)로 준비 셀을 실행한 뒤
`CASE_ID=P01..P20`, `MODEL_KEY`를 선택하고 실행 셀을 누른다.
Run All도 선택한 한 건만 호출한다. 전체 사례나 모델을 도는 반복문·병렬 호출은 없으며
생성 요청 1회, 자동 retry/repair/fallback 0회다. 이번 요청은 사용자가 직접 실행할
노트북 준비이므로 새 모델의 실제 생성 호출은 수행하지 않았다.

| MODEL_KEY | Model / reasoning | 경로 |
| --- | --- | --- |
| `luna-none` | gpt-6-luna / none | OpenAI Responses, store=false |
| `haiku-off` | claude-haiku-5-5 / thinking disabled | Anthropic Messages |
| `mercury-none` | inception/mercury-3 / none | OpenRouter → Inception |
| `gemini-minimal` | google/gemini-3.5-flash-lite / minimal | OpenRouter → Google AI Studio standard, flex/priority 제외 |
| `cerebras-oss-low` | openai/gpt-oss-120b / low | OpenRouter → Cerebras fp16 |
| `cerebras-qwen-none` | qwen/qwen3.8-27b / none | OpenRouter → Cerebras fp16 |

OpenRouter의 현재 모델 카탈로그에서 supported_efforts와 endpoint tag를 확인했다.
Mercury는 native API의 `instant`라는 문자열을 보내지 않고 OpenRouter의 `none`을
사용한다. Gemini/Cerebras도 기존 OPENROUTER_API_KEY를 사용하며 실제 provider는
응답에 기록한다. OpenRouter는 provider를 고정하고 data_collection=deny,
allow_fallbacks=false, require_parameters=true를 유지한다. 이번 대화의 빠른 모델
후보를 사용자가 골라 직접 실행하는 범위이며 자동 배치/운영 설정 변경은 없다.

동일 production-v1 prompt/input/fixture hash를 확인하고 그대로 보낸다.
선택적 출력·reasoning 토큰 한도는 생략하며 Anthropic 필수 max_tokens만 Models API의
최대값으로 설정한다. timeout은 connect 15초/read 180초, sampling은 provider 기본값이다.
실행 셀 1회마다 새 `runs/single-*`에 manifest·provider metadata·원본 요청/응답·summary를
저장한다. OpenAI/Anthropic 비용은 기존 canonical usage 계산의 공식 단가 추정,
OpenRouter는 usage.cost이며 미보고는 null로 남긴다. 모델 정보 조회/파일 저장은 latency에서 제외한다.

노트북 자체도 실제 원문/출력이 저장될 수 있어 ignored `private/`에 두고 0600으로
설정했다. 기존 20명 데이터가 있는 이 머신에서 실행할 수 있으며 clone만으로는
노트북과 원문을 재현할 수 없다. 구조 검증과 직접 읽기 계약은 기존과 같고,
단회 수동 결과를 평균 성능이나 출시 gate로 해석하지 않는다.

검증: 여섯 preset의 요청·응답 처리를 mock HTTP로 확인했고 각각 생성 요청 1회,
timeout 시 재시도 0회, 선택적 토큰 한도 생략, 비용·권한 기록을 확인했다.
실제 Harper worker 커널에서 노트북을 처음부터 끝까지 mock 응답으로 실행해
전체 실행도 단 한 번만 모델 생성 경계에 도달하는 것을 확인했다. 실제 API의
새 모델 품질·속도·계정별 접근 가능성 검증을 대신하는 결과는 아니다.

## 후속 실행: low-native (2026-10-21)

[재실행 결과](reports/2026-10-21-production-v1-low.md): 세 모델 모두 최종 답변 20/20,
길이 제한 종료 0. 원문 JSON은 Luna 20/20, Haiku 17/20, Mercury 19/20이며 Mercury의
1건은 코드블록 안에 유효 JSON이 있었다. 60개 답변을 직접 읽었다.

사용자 정정에 따라 같은 production-v1 입력과 prompt를 그대로 두고 세 모델을 모두
low(Haiku adaptive/low)로 다시 실행한다. Luna와 Mercury 요청의 선택적 output token
한도는 생략한다. Anthropic Messages는 max_tokens가 필수이므로 Models API에서
확인한 모델 최대값 128,000을 사용한다. Provider 고유 한계가 없는 무제한 API라는
뜻은 아니다. 별도 reasoning token budget도 지정하지 않는다.

Canonical runner의 `--configuration low-native`를 사용한다. 기존 medium/8192 실행은
`--configuration medium-capped`로 재현할 수 있으며 원본 run을 덮어쓰지 않는다.
두 실행의 비용과 시간을 합쳐 모델별 평균을 만들지 않는다. 이번에도 20개 × 3모델,
동일 prompt/input, 재시도·repair·fallback 없음이며 결과를 직접 읽어 판단한다.

## 이전 medium/8,192 결과: production-v1

[2026-10-21 결과](reports/2026-10-21-production-v1.md): 실제 프로필 20개 × 세 모델
단회 실행 완료. 구조 성공은 Luna 20/20, Haiku 19/20, Mercury 11/20이다.
Codex가 입력 20개와 반환된 최종 답변 51개를 직접 읽었고, 빈 답변 9개도 확인했다.
운영 모델·제품 코드·DB·배포는 변경하지 않았다.

## 실제 입력과 출처

사용자가 실제 프로필 20개를 선택해 **최종 비교는 production-v1**로 진행한다.
앞서 시작한 synthetic v1은 중단한 준비 실행으로 보존하며 최종 품질·속도·비용에
섞지 않는다. 이미 완료된 준비 호출 비용은 별도로 집계한다.

기존 실제 역할 중 Strategy & Ops, Communications, Performance Marketing,
Applied AI의 네 역할을 고른다. 각 역할에서 가장 최근 검토된 후보자 중 현재
공유 허용·온보딩 완료·내부 추천 허용·회사 차단 없음 조건을 만족하는 서로 다른
5명씩, 총 20명을 고정했다. 역할별 기준 수는 6/3/4/3개로, 모델별 80개 설명이다. 이전 평가 결과와 무관하게 최근 순으로 선택한다.
이름 필드만 P01–P20으로 대체하며 실제 경력·학력·역할 설명·criteria는 유지한다.
자유 서술·회사명·URL 등에 식별 가능한 내용이 남아 완전 익명 자료가 아니다.
운영 formatter의 필드별 길이 제한과 종료일 미상 표현도 유지했다.
대표 무작위 표본이 아니며 최근 검색 결과의 편향이 있다.

`opp.utils.new_runtime.connect_read_only()`의 transaction barrier를 확인한 뒤
운영 profile loader/formatter를 사용한다. 2026-10-21 01:55 KST의 현재 snapshot이며 과거 검색 당시의
입력을 재현한 것은 아니다. Hiring Brief·개인 Brief·Memory·Behavior·기존
평가 출력은 넣지 않는다. 출력 언어는 비교 편의를 위해 모두 한국어로 고정한다.
동일한 criteria-only system prompt를 재사용한다.

Canonical capture: [capture.py](../../../../harper_worker/llm_evals/role_criteria_writing/capture.py).
`capture.py --role-id <id>`를 네 번 지정한다. 역할 ID 매핑은 private에만 보관한다.
동결 후 재실행은 DB를 읽지 않고 다음 명령만 사용한다.

```sh
cd harper_worker
PYTHONDONTWRITEBYTECODE=1 venv/bin/python llm_evals/role_criteria_writing/compare.py run \
  --manifest ../harper_beta/docs/evaluation/role-criteria-writing/private/production-v1/manifest.json
```

실제 원문과 붙여넣기 파일은 `private/production-v1/`, 실행 출력은 `runs/`이며
모두 owner-only 및 gitignored다. 비식별 hash/alias manifest만 공개 registry에 둔다.
바로 붙여넣을 합본 20개는 `private/production-v1/ready-to-paste/`,
전체 텍스트 묶음은 `private/production-v1/production-v1-text-pack.zip`이다.
합본은 system/user 구분 제목을 붙인 텍스트이며 일반 채팅에 한 번에 붙이는 것이
API의 메시지 권한·reasoning·sampling까지 재현하는 것은 아니다.
사용자는 이 대화에서 실제 프로필과 세 공급자를 명시적으로 요청했다.
전송 대상은 `api.openai.com/v1/responses`(store=false),
`api.anthropic.com/v1/messages`, `openrouter.ai/api/v1/chat/completions`
(Inception 한정, data_collection=deny)다. 기존 provider 계정의 데이터 제어를
변경하거나 학습/로그 수집을 새로 허용하지 않는다.

## 최초 준비 입력과 공통 목적

역할 검색 후 회사에 제시하는 후보자의 `criteriaEvaluations`만 떼어, 같은
talent/role/criteria 텍스트로 GPT-6 Luna, Claude Haiku 5.5, OpenRouter Mercury 3의
품질·비용·응답 완료 시간을 한 번 비교한다. 운영 모델 변경이나 배포는 하지 않는다.

평가 단위는 후보자 1명 × 역할 1개의 기준별 설명 전체다. 최초 준비용 synthetic v1은 합성 후보자 20명,
가상 역할 4개, 각 역할에 관련 후보자 5명과 기준 4개를 사용했다.
사용자의 실제 프로필 선택 후 이 준비 실행은 중단했고 production-v1과 분리했다. 모든 후보자를
모든 역할에 교차시키지 않는다. 한국어 15명, 영어 5명이다.
`cases-v1.json`은 최초 실행 전에 동결한다. 사람이 실제 프로필을 읽는 듯한
짧은 경력 텍스트이며 production 데이터·개인정보는 포함하지 않는다.

사용자 요청에 따라 별도 정답/점수용 eval set, gold label, LLM judge를 만들지 않는다.
Gold version은 **없음 / not applicable**이다. 입력과 prompt만 고정하고 Codex가
모든 실제 출력과 입력을 직접 대조한다. 독립 팀원의 정답 검수는 없다.

## Prompt와 실행기

Canonical runner: [Worker compare.py](../../../../harper_worker/llm_evals/role_criteria_writing/compare.py).

운영 `opp.matching.presentation.SYSTEM`에서 criterion content, fitness,
factual fidelity 절을 가져오고 `opp.matching.text.matching_input`으로 입력을
만든다. 실험용 projection은 TL;DR, Harper Note, finalFit, Search Brief를 제외한다.
운영의 전체 presentation 호출과 동일한 작업량이라는 뜻이 아니다.
운영 prompt·제품 코드·DB는 변경하지 않는다. 고정 prompt와 20개의 입력은
`text-v1/system.txt`, `text-v1/inputs/`, 바로 붙여 넣는 합본은
`text-v1/ready-to-paste/`에 보존한다. API의 system/user 문자열은 세 모델에서 같다.
`freeze`는 기존 동결 폴더를 덮어쓰지 않는다.

```sh
cd harper_worker
PYTHONDONTWRITEBYTECODE=1 venv/bin/python llm_evals/role_criteria_writing/compare.py freeze
PYTHONDONTWRITEBYTECODE=1 venv/bin/python llm_evals/role_criteria_writing/compare.py run
```

## 실행 조건

- OpenAI `gpt-6-luna`: direct Responses, reasoning medium, store false.
- Anthropic `claude-haiku-5-5`: direct Messages, adaptive thinking, effort medium.
- OpenRouter `inception/mercury-3`: Inception provider 고정, reasoning medium,
  provider fallback 없음, data_collection deny.
- 여러 조건을 긴 프로필 근거와 대조하는 작업이므로 medium을 선택했다. 이름이 같아도 실제
  reasoning 계산량이 같다는 가정은 하지 않는다. 최적 effort 탐색은 범위 밖이다.
- 출력 한도 8,192 tokens, 요청 timeout connect 15초/read 180초.
- 모두 temperature/top_p를 지정하지 않는다. 각 provider 기본 sampling은 다를 수 있다.
- 도구·검색·대화 이력·JSON 강제 schema 없이 같은 JSON 출력 지시만 사용한다.
- provider당 직렬 1개, provider 3개를 동시에 실행한다. 사례 순서는 모두 같다.
- 사례/모델당 1회. 자동 retry, 구조 repair, 모델 fallback 없음.
- 원문, 요청 본문, 응답 usage, 실제 model/provider, HTTP 오류와 latency를 기록한다.

## 지표와 직접 검토

완료/구조 성공 수, 호출별 전체 응답 시간의 평균·중앙값·p95,
input/cached/output/reasoning tokens와 USD 비용을 기록한다. OpenRouter의
반환 usage.cost는 관측 비용으로, direct API는 공식 단가 기반 추정으로 구분한다.
자동 cache가 생기면 usage 조건을 적용한 비용과 cache 없는 정가 환산을 함께 기록한다.
OpenAI cache write와 각 모델의 reasoning tokens도 포함한다. 저장 응답 재집계는
[report.py](../../../../harper_worker/llm_evals/role_criteria_writing/report.py)에 run 폴더를
넘겨 수행하며 모델·DB를 호출하지 않는다.
비용은 세금·크레딧 구매 수수료를 제외하며 최종 청구서 검증은 아니다.
TTFT/순수 모델 생성 시간/서버 처리량은 측정하지 않는다.

구조 검증은 JSON, 정확한 criterionRef coverage, 허용 fitness, 필수 문자열만 확인한다.
구조 성공은 의미 정확도가 아니다. 실패 호출도 비용과 시간 집계에 포함한다.
품질은 입력의 행동·책임·성과를 보존하는지, 회사/팀 성과를 개인 성과로
바꾸는지, 부분 충족·명시적 부족·단순 미기재를 구분하는지,
기준 외 요구를 추가하는지, 설명이 간결하고 유용한지를 직접 읽고 판단한다.
문구/키워드/길이로 품질 점수를 만들지 않는다.

이번 실행에는 출시 gate가 없다. 운영 전환을 요청받으면 사실 창작과
필수 기준 오판이 없는지 별도로 확인해야 하며, 이 작은 실험만으로 전환하지 않는다.

## 재현·데이터 경계·한계

`manifest-v1.json`에 입력/prompt hashes, source revision과 dirty diff hash,
provenance를 기록한다. 실행 결과는 ignored `runs/` 아래 directory 0700,
file 0600으로 저장한다. 원문 출력은 commit하지 않는다. 공개 가능한 요약만
`reports/`에 둔다. 실제 API key는 기존 로컬 환경에서 읽고 기록하지 않는다.
최초 준비 실행은 합성 입력, production-v1은 위 개인정보 경계의 실제 입력을
사용자가 요청한 세 공급자에 보냈다. 실제 capture만 읽기 전용 DB를 사용하며
모델 실행은 frozen text를 읽는다. fit 저장·추천·연락·Slack/메일 발송은 없다.
private 자료는 이 머신에만 있어 repository clone만으로는 실제 입력을 재현할 수 없다.

같은 Codex가 비교를 준비하고 결과를 읽었으므로 독립/맹검 평가가 아니다.
사후 대조 메모는 gold label이 아니며 run의 `direct-review.md`에만 둔다.
20개 단회 관찰의 품질·latency는 production 대표값이나 안정성 보증이 아니다.
실제 장문 프로필, cache hit 비율, network/load, effort 변경, 전체 presentation의
다른 출력과 함께 작성할 때 결과가 달라질 수 있다. 모델 alias가 바뀌면 같은
텍스트라도 동일 결과를 보장하지 않는다.

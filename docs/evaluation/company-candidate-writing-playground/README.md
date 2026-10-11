# Company candidate writing playground

- 최초 등록: 2026-10-09
- 목적: 동일 input에서 Worker Presentation와 Slack writer의 모델·프롬프트를 바꿔 실제 output을 직접 비교.
- 단위: 회사 1곳의 선택 후보 × 현재 Role의 공개 presentation, 그 결과를 사용하는 Slack 안내 묶음.
- Canonical runner/UI: `harper_worker/llm_evals/company_candidate_writing/playground.py`와 `index.html`.
  [실행 안내](../../../../harper_worker/llm_evals/company_candidate_writing/README.md).

## Frozen input / gold / provenance

기본 합성 example `playground-v1`은 기존 frozen
`company-candidate-introduction/presentation-cases-v5.json`의 UCIP003을 읽는다.
경력/criteria/Brief/기대 label은 원본을 유지한다. 고정 synthetic 이름, deterministic UUID, 회사/Role 운영 사실,
첫 검색 결과 flag는 `playground.py:synthetic`에서 정의한다. 기존 v5나 gold는 덮어쓰지 않는다.
[gold-v1.json](gold-v1.json)은 부모 expectedFitness/expectedFinalFit 및 원문 검토 rubric을 참조한다.
[manifest-v1.json](manifest-v1.json)에 실행 계약과 lineage를 기록한다. 합성 input hash는 각 실제 run에 보존한다.
부모 fixture hash를 고정해 변경되면 새 버전 등록을 요구한다. 실행 dataset version에는 고정 입력 hash를 포함하므로
입력 편집은 별도 input version이 되고, 동일 입력의 model/prompt 변경은 새 run이다.

실제 input은 canonical production read-only connection에서 기존 검색의 선정 목록 또는 사용자가 지정한
exact Role/candidate를 읽는다. 현재 데이터의 capture이며 과거 run 당시의 historical snapshot은 아니다.
새 capture는 private fixture의 새 버전이다. 고정 input을 다운로드/재사용하여 같은 dataset의 새 run을 만든다.
운영 input에는 human gold가 없으므로 accuracy나 release-quality 점수를 자동 계산하지 않는다.

## Prompt/input/output contract

Production `write_presentation`과 `write_slack_message`의 serializer/parser/structural repair를 import한다.
Presentation은 Profile/전체 active Brief/Role·Hiring Brief·criteria·회사 Behavior·보상·회사 언어를 읽고 공개 네 필드를 쓴다.
Slack writer는 공개 이름/headline/TL;DR/Note/추천 사실/첫 안내 및 상한 사실을 읽는다.
Output은 `intro`, 입력 순서의 `candidates: string[]`, 선택적 `closing`이다. 각 후보 문자열에는
해당 입력의 정확한 `[이름](candidateId)` 링크가 한 번 있어야 한다. 구조 검증은 개수·ID·순서·타입·
Slack 길이 제한을 확인하며 본문은 재작성하지 않는다. intro와 후보별 문자열, 비어 있지 않은 closing을
각각 독립된 채널 메시지로 보내고 저장용 묶음은 유지한다.
Prompt override는 실험 client에서만 적용하고 운영 source를 변경하지 않는다. 실제 system/user/output을 기록한다.
캐시·검색·scoring·rerank·추천/fit DB write는 제외한다. QA 전송은 일반 Slack 메시지로 공개 output만 전송한다.
운영 Work Object·회사 공유·후보자 연락·scheduler/E2E의 검증을 의미하지 않는다.

## Model/run configuration and reproducibility

현재 runtime defaults를 화면에 읽고 각 단계별 모델·reasoning·temperature·maxTokens·prompt를 명시적으로 바꿀 수 있다.
기본 Presentation GPT-6 Luna high / 0.3 / 16384, writer GPT-6.1 Sol high / 1.0 / 16384.
실제 Worker API client/timeout/provider policy를 그대로 사용하며 호출/repair/usage의 실제 모델과 지연을 보존한다.
OpenRouter data_collection은 Worker 기본 deny이며 실제 환경값을 run manifest에 기록한다.
매 run은 source revision/dirty diff와 source file hashes, dataset/input/prompt hashes, model config, timeout,
start/time/cost/usage/구조 결과, raw artifact 경로를 기록한다. 새 model/prompt는 같은 input의 새 run이다.

## Metrics / gate / known limitations

관찰: 출력 coverage, 구조적 parser 성공/실패, 실제 call count·repair, latency/token/cost.
원문 검토: 사실 귀속·scope/기간 보존, 개인 경력과 역할의 관련성, missing/negative evidence 구분,
Brief 선호의 강도와 개인정보, 후보자/회사 수락 상태, 읽기 쉬운 Slack 안내.
Critical privacy/창작/허위 동의·발송 claim은 0이어야 한다. 작은 합성 smoke나 임의 live capture는 출시 gate가 아니다.
품질 판단은 사람이 전체 원문을 읽어서 하며 자동 키워드·정규식 품질 판정은 없다.
첫 안내와 회사/언어 분포를 대표하지 않는다. 독립 gold review·온라인 회사 반응·provider 반복 안정성은 미검증이다.

## Privacy / delivery boundary

운영 capture는 `connect_read_only()`이며 DB/추천/연락 부작용을 만들지 않는다. 원문은 ignored private/runs,
directory 0700/file 0600에 저장한다. 실제 원문을 외부 LLM에 보내는 것은 사용자가 요청한 inspection이며
provider/endpoint/data policy와 source 종류를 run에 남긴다. keys는 서버에만 있고 브라우저/manifest에 쓰지 않는다.
QA Slack은 사용자가 지정한 `C0BULQ5K5EJ`, Harper team `T09ASGLN207`만 허용하고 공유 채널 여부·bot membership을 확인한다.
LLM input의 원본 Brief는 Slack에 보내지 않는다. 공개 presentation output과 writer 문장만 보내며 receipt로 재전송을 막는다.
실제 후보자의 hallucination-free 공개 출력 여부는 원문 review가 필요하므로 기본 자동 전송은 OFF다.

## 개발 smoke 기록

2026-10-09 `writing-20261009T022655-1e7c42f6`: 기본 Luna/high → Sol/high 호출 2개 완료,
Presentation 16.309초·writer 23.436초. Criterion 3개 및 finalFit 모두 기존 gold의 허용 label에 포함된다.
Assistant가 전체 원문을 읽어 API 성과 귀속·포함 기간·미기재 경험·Brief 선호·수락 상태를 확인했다.
QA Slack에 실험 안내·공개 Presentation·writer 문장을 3개 메시지로 전송해 API 성공 receipt를 보존했다.
10개 structural/boundary 테스트와 실제 현재 데이터 3명 캡처/UI 로딩을 확인했다.
독립 gold review와 대표 품질/출시 검증은 미완료이며 이 smoke를 출시 gate로 사용하지 않는다.

2026-10-09 `writing-20261009T034553-e271bdb9`: 같은 합성 UCIP003의 저장된 Presentation을 사용하고
사용자가 수정한 writer prompt에 문자열 배열 계약을 반영한 새 run이다. GPT-6 Luna/high 1회 호출,
11.496초, structural repair 0회. 전체 원문을 읽어 사실·기간·공개 선호·수락 상태를 확인했다.
QA 채널에 안내 1개 및 intro·후보 소개·closing 3개의 독립 메시지를 전송하고 Slack 표시를 확인했다.
Python 112개 및 Node 41개 테스트 통과. 별도 크레딧 부족 안내 문구 테스트 1개는 이번 변경을 제거해도
동일하게 실패한다. 원문·설정·receipt·검토 기록은 이 run의 ignored 디렉터리에 보존한다.

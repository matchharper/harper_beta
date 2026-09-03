# Harper LLM evaluation registry

이 디렉터리는 Harper에서 반복 실행할 LLM 평가의 **발견 가능성, 정답 버전, 실행 조건, 결과 해석**을 한곳에서 관리하는 기준 위치다. 모델만 바꾸어 비교할 때는 고정 fixture와 gold를 그대로 재사용하고, 입력이나 정답을 바꿀 때만 dataset version을 올린다.

실행 코드는 실제 prompt와 후처리를 import해야 하므로 해당 runtime의 소유 repository에 둔다. 이곳에는 태스크별 계약과 재현 메타데이터를 두고 canonical runner를 링크한다. 같은 runner나 prompt를 문서 폴더에 복제하지 않는다.

## 현재 태스크

| 태스크 | 평가 대상 | 정답/fixture 상태 | canonical runner 또는 원문 | 상태 |
| --- | --- | --- | --- | --- |
| [internal-fit-abc](internal-fit-abc/README.md) | 사람 × internal role의 A 직무 적합성, B 후보 만족 가능성, C 회사 인터뷰 가능성과 최종 추천 판단 | A/B/C `gold-v3.json` 13쌍; 최종 추천 `recommendation-gold-v1.json`은 positive 9·negative 4 | A/B/C runner와 production 1·2차를 재사용하는 fresh-decision recommendation runner | GLM high P/R 85.7%/66.7%, max 80.0%/44.4%; max는 3시간 45분·soft-positive 0/2이고 공통 hard-negative 오류가 남아 배포 부적합 |
| [internal-external-fit-model-benchmark](internal-external-fit-model-benchmark/README.md) | 기존 internal prefilter와 external scorer의 모델 교체 | worker suite별 fixed fixture/manual gold | [worker model benchmark](../../../harper_worker/llm_evals/model_benchmark/README.md) | 사용 중 |
| [final-delivery-generation](final-delivery-generation/README.md) | 최종 추천 메일 생성 모델 | 완료 run에서 동결한 local-only 입력 | [worker final delivery](../../../harper_worker/llm_evals/final_delivery/README.md) | 사용 중 |
| [company-candidate-introduction](company-candidate-introduction/README.md) | 회사용 후보자 소개의 사실성·관련성·스캔 가능성 | 3개 고정 pair, 6항목 rubric | [5회 개선 기록](../auto-intro-headhunter-message-five-iteration-evaluation-ko.md) | 로컬 평가 완료, 배포 전 |
| [wonderful-internal-role-ranking](wonderful-internal-role-ranking/README.md) | Wonderful FDE/Field CTO retrieval·reranking·선택 | blind holdout 실행 계약 | [benchmark 매뉴얼](../wonderful-korea-fde-field-cto-benchmark-manual-ko.md) | 명시적 실행 요청 시에만 실행 |
| [internal-role-conversation-qa](internal-role-conversation-qa/README.md) | Career·email reply의 내부 역할 탐색·단계적 공개·대안·재검토·우선 검토·수락 경험 | Career 20-turn + email reply 10-case `cases-v3.json`; 실제 계정 매핑과 원문은 local-only | Career Chrome E2E + email inbound-job local replay | v3 frozen, 실행 전 |

과거 일회성 결과와 노트북은 [worker legacy 안내](../../../harper_worker/llm_evals/legacy/README.md)에 보존한다. 재사용할 평가로 승격할 때만 이 레지스트리에 태스크 폴더와 계약을 추가한다.

## 태스크 폴더의 필수 내용

`docs/evaluation/<task>/README.md`에는 최소한 아래 내용을 기록한다.

1. 무엇을 바꾸려는지와 평가가 답할 수 없는 것
2. 평가 단위와 포함/제외 기준
3. frozen dataset·gold version, capture 시점, source revision과 변경 이력
4. 실제 prompt/input builder/output normalization을 재사용하는 canonical runner
5. model/provider/reasoning/temperature/tool 조건과 timeout 같은 실행 조건
6. metric, slice, critical failure와 배포 전 gate
7. raw data·PII·secret·외부 provider 전송 범위
8. 알려진 bias, leakage, 표본 크기와 일반화 한계

권장 파일 배치는 다음과 같다.

```text
docs/evaluation/<task>/
├── README.md                  # 사람이 읽는 평가 계약과 해석
├── gold-v<N>.json             # de-identified, review된 정답
├── manifest-v<N>.json         # provenance, hash, 분포, runner 상태
├── private/                   # raw production fixture; gitignored, chmod 0600
└── runs/                      # raw output·비용·지연; gitignored
```

공유 가능한 비식별 aggregate 보고서를 남겨야 하면 `reports/`에 저장할 수 있다. 보고서가 원문 prompt, 후보자/회사 식별자, 대화, 이력, 모델의 raw response를 포함하면 `runs/`에만 둔다.

## 버전과 실행 규칙

- `datasetVersion`은 입력 사례와 gold의 의미를 식별한다. 모델 이름이나 실행 날짜를 dataset version에 넣지 않는다.
- 새 모델/provider/reasoning 비교는 같은 dataset version에 새 run을 추가한다. 정답을 모델 출력에 맞춰 수정하지 않는다.
- 사례 추가·삭제, 입력 snapshot 교체, label 변경은 `v2`, `v3`처럼 새 dataset version으로 저장한다. 이전 버전은 회귀 비교를 위해 유지한다.
- label 수정에는 reviewer, 수정 이유, 시각을 남긴다. 모델 결과를 본 뒤 정답을 바꾸었다면 unblinded adjudication임을 표시한다.
- prompt 또는 코드가 달라진 run에는 source commit과 prompt fingerprint를 기록한다. dirty worktree라면 commit 대신 dirty 상태와 diff fingerprint를 명시한다.
- production 평균을 추정하는 representative sample과 희귀·치명 오류를 잡는 challenge set을 구분한다. 두 결과를 하나의 accuracy로 합쳐 해석하지 않는다.

각 run manifest에는 적어도 `task`, `datasetVersion`, `runId`, `createdAt`, `sourceRevision`, `promptFingerprint`, `model/provider`, `reasoning`, sampling 설정, timeout, fixture hash, metric summary, raw artifact path를 남긴다. API key나 원문 PII는 manifest에 넣지 않는다.

## 데이터 안전

- production capture는 read-only connection/transaction으로 실행하고 DB write, fit/recommendation 저장, 메시지·이메일 전송을 금지한다.
- `private/`와 `runs/`는 이 디렉터리의 `.gitignore`로 제외된다. private 파일은 owner-only(`0600`)로 둔다.
- 외부 provider에 production 원문을 보낼 때는 provider, endpoint, data collection 설정과 승인을 README/run에 기록한다.
- raw fixture가 이 로컬 머신에만 있으면 git clone만으로는 재현되지 않는다. 장기 보존이 필요할 때는 별도의 승인된 암호화 저장소를 사용하고 locator만 기록한다.
- synthetic/E2E role을 만드는 평가는 workspace `AGENTS.md`의 `testOnly` 및 `testFixture` 격리 계약을 그대로 따른다.

## 결과 해석 원칙

작은 고정 세트는 회귀와 모델 간 사례별 차이를 찾는 도구다. 표본이 대표 추출되지 않았다면 전체 production 성능 향상률로 말하지 않는다. 평균 점수만 보지 말고 hard-constraint 누락, 잘못된 질문/발송, lifecycle 중복, protected-trait 사용, JSON/coverage 실패 같은 critical violation을 별도로 0건 gate로 둔다.

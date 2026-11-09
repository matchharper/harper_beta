# Worker 탐색 가설 복원 검증 — 2026-10-14

로컬 코드 점검·수정과 합성 입력의 실제 모델 호출 결과다. 배포, 운영 DB 변경, 실제 추천 저장이나 메일 발송은 하지 않았다. 이전 국가·점수 계약은 [별도 기록](results-country-score-contract-2026-10-14.md)을 따른다.

## 발견한 누락과 수정

기존 Git 추적 코드 `harper_worker/opp/agentic/prompts.py`의 `SEARCH_PLANNER_SYSTEM_PROMPT`, `search_planner.py`의 `compact_search_history`에는 이전 탐색과 피드백을 바탕으로 이번 가설을 세우고 2–4문장의 `searchIntentSummary`로 전달하는 계약이 있었다. 기존 `context_projections.py`의 `final_run_context`와 최종 안내 prompt도 이 판단을 읽었다.

새 공유 V2 경로는 Python planner를 생략하면서 최근 검색 이력을 공유 planner에 전달하지 않았고, 응답도 선택 카드만 돌려주었다. 그 결과 Python 최종 안내와 run 기록에는 실제 실행 계획 대신 fallback 계획이 남을 수 있었다. `externalSearchLimit` 기록도 빠져, 이 값이 양수인 run만 읽는 기존 검색 이력 조회에서 V2 실행이 빠질 수 있었다.

이번 수정은 기존 연결을 복원한다.

1. Worker의 공통 Profile + 전체 Brief + 동일 Behavior snapshot을 유지하면서 기존 최대4건의 compact search history와 연락 목적을 공유 planner에 전달한다.
2. Worker planner가 검색 필드와 이번 판단을 함께 출력한다. 일회성 가설은 `explore`, 기존 방향은 `reuse`, 지속적인 기준 변경은 `replace`다. `reuse`도 이번 판단을 새로 쓰되 기본 계획의 설명은 유지한다. 별도 가설 모델이나 선호 저장소를 만들지 않는다.
3. 판단은 rerank의 `current_search_purpose`, API 응답의 실제 Search Plan, Python `decision.external_search`, 최종 안내의 `run_context.current_search_purpose`와 기존 run 기록까지 이어진다. 추천 개수와 검색 실행 표시도 기록한다.
4. 사용자 피드백 근거 없는 전환, 무응답/추천0개를 거절로 오해, 가설을 명시적 선호나 자격의 대체 근거로 취급하는 것을 prompt에서 금지한다. 별도 키워드 판별은 없다.
5. 웹 즉시 추천과 worker가 실행하는 웹 bulk 요청은 `surface=web`이다. 자율 탐색 prompt/history를 받지 않고 현재 요청을 따른다. 웹200개/요약 누락10개 한 호출, worker500개/상위100개 요약, 요약 있는 상위20개 rerank 예산을 유지한다.

## 공통 계약 점검

- `recommend_job_postings` 즉시 실행과 Python worker의 V2 adapter 모두 `runExternalV2`를 사용한다. 비동기 웹 검색도 동일 엔진의 웹 예산을 따른다.
- 5개 수치 metric 0–100, LLM 입력 소수점 첫째 자리 버림, 각 metric 설명, constraintPass≤50의 비선형 감점, ISO 국가 정확 일치·국가별 비율은 양쪽 공통이다.
- `reuse/explore/replace`, 기본 SQL/제목 vector 재사용, revision 충돌 보호를 유지한다. 일일 추천의 유효 default fast path와 달리 정기 worker는 실행별 판단을 위해 planner를 거친다.
- Rerank는 중립 요약·간단한 회사/역할 정보·점수와 공통 후보자 맥락을 받으며 JD 원문을 받지 않는다. 선택 메모는 기존 `tradeoffs`에 한 항목으로 전달한다. `company_score`를 다시 추가하지 않았다.

## 자동 검증

| 범위 | 결과 |
|---|---:|
| 공통 TypeScript V2 테스트(실제 embedded Postgres/pgvector 포함) | 30/30 통과 |
| Python adapter·검색 이력·worker V2 관련 테스트 | 121/121 통과 |
| 최종 안내 실제 호출 후 구조 검증 | 선택 ID·추천 메모·fit 점수 보존, 본문 생성, 검색 목적 전달 모두 통과 |

추가한 테스트는 worker 기본값 재사용 시 현재 판단 갱신/기본 설명 보존, 웹과 worker 입력 분리, 실제 Python 실행 메서드의 반환 계획 및200/500개 기록, 최종 안내와 다음 검색 이력까지의 연결을 검증한다. 기존 테스트는 국가 KR80%/US20% 배분·조건부 원격·부족분 재배분, 감점, 10개 배치와 저장, 요약 한도, rerank20개와 원문 제외를 검증한다.

전체 TypeScript 검사는 변경 경로 밖7개 파일의25개 오류로 통과하지 않았다. 이번 external V2 경로 오류는 없었다. 파일은 org/signup, careerCoachingActivity, career/simulation/workflow.test, contentsEngine/outreach, ops/matching, org/agent/roleMatchingHealth, org/server다. 전체 프로젝트 검사가 통과했다고 주장하지 않는다.

## 실제 모델 — frozen synthetic v3

합성 후보자는 ML 박사, 딥러닝 모델 실험·평가와 프로덕션 추론 경력6년, 응용 연구 논문 근거가 있다. Brief에는 ML Engineer 방향과 모델 실험·개선을 더 맡고 싶다는 요구가 있다. Behavior에는 운영·온콜 위주 역할의 반복 거절 사유가 있으며 직군 전체에 대한 거절로 확정하지 않는다. 역할은 자격을 충족하는 Applied Research Scientist와 운영 중심 ML Inference Platform Engineer 두 개다.

| 실행 | rerank 입력 | 선택 | 확인한 행동 |
|---|---:|---:|---|
| 정기 worker | 2개 | 연구 역할1개 | ML Engineer 방향은 유지하면서 모델 실험·연구 주도권을 갖는 인접 역할 탐색 |
| 웹 직접 요청 | 2개 | 배포·서빙 역할1개 | 같은 과거 맥락이어도 이번 ‘배포·서빙만, 연구 제외’ 요청 준수 |
| Worker 최종 안내 | 선택된1개 | 동일1개 유지 | 검색 이유를 자연스럽게 설명하며 연구 중심 직무라는 차이를 함께 전달 |

이2개 사례는 선택 수를 늘리는 성능 실험이 아니다. 서로 대비되는 역할을 넣어 worker 가설과 웹 현재 요청의 경계를 확인했다. 운영20개에서 몇 개를 선택할지 예측하는 근거로 쓰지 않는다.

Worker planner의 실제 출력 일부:

> 한국 근무를 선호하고 ML Engineer 방향을 유지하되, 최근 피드백에서 반복된 배포·모니터링·온콜 중심 업무를 피하고 모델 실험과 개선을 주도할 기회를 더 살펴봅니다. 이번 검색은 연구 소유권이 있는 ML 엔지니어링과 인접한 응용 연구 역할까지 넓히며, 직무별 실제 업무 비중은 공고에서 확인이 필요합니다.

최종 안내의 실제 도입부:

> 안녕하세요. 모델을 실험하고 개선하는 일을 더 맡고 싶으시다는 방향에 맞춰, 연구 업무 비중이 높은 인접 역할을 한 곳 살펴봤습니다.

본문은 박사·연구경력 등 실제 입력 근거와 역할의 연구 비중을 설명했다. 사용자가 ML Engineer를 싫어한다고 단정하거나 검색 실험의 내부 용어를 노출하지 않았다. 추천 메모도 별도 필드로 보존됐다.

Worker fixture에는 기존 기본값이 없었고 명시적인 모델 실험 방향이 있어 실제 planner는 `replace`를 반환했다. 웹 일회성 요청은 `explore`였다. 따라서 이 호출만으로 ‘기존 기본값이 있는 모든 가설에서 explore를 고른다’는 안정성을 주장하지 않는다. 기본값 보존·재사용의 실행 계약은 단위 테스트로 별도 검증했다. 독립적인 사람의 품질 라벨 검토와 운영 사용자 반응 측정은 남아 있다.

## 재현과 실패 기록

정본 runner·frozen hash·입출력 계약은 [registry README](README.md)에 있다. Planner/summary/rerank는 실제 `gpt-6-luna low`, fit은 OpenAI Decisions, final writer는 기존 worker 설정을 그대로 사용했다. 제공자 공통 fit 계약은 기존 v1/v2와 공통 테스트를 재사용했다.

- Worker 단계: `runs/2026-10-14T04-24-02-115Z`.
- Web 단계: `runs/2026-10-14T04-24-55-820Z`.
- 최종 안내 검증 정본: `runs/delivery-20261014T042911.946998Z`.
- 첫 최종 안내 replay는 fixture가 `detailed_role_ids`를 채우지 않아 선택을 제거했다. 다음 replay 점검에서는 실제 runtime의 카드→고정 추천 변환을 테스트 runner가 생략한 것도 발견했다. runtime 코드 변경 없이 runner를 실제 경로와 맞추고 점수·메모 보존 검증을 추가한 최종 run이 위 정본이다. 앞선 run도 실패/불완전한 harness 증거로 보존하며 통과 근거로 쓰지 않는다.

모든 원문 run은 ignored 폴더0700/파일0600이다. DB와 메일 전송을 연결하지 않았으며 생성된 안내는 테스트 초안이다. 배포 후 실제 인증 endpoint·큐·최종 저장/전송을 연결하는 smoke test와 운영 성능 측정은 별도다.

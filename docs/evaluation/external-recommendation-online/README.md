# 외부 추천 온라인 A/B 측정

문서 기준: 2026-10-15. **로컬 구현·미배포**. 운영 DB 조회에서 기존 실험 기록은 내부 계정의 V2 5건뿐이었다. 일반 사용자 50:50 운영은 확인되지 않았다. 표본이 없는 것을 성공·실패·0원으로 해석하지 않는다.

## 목적과 비교 대상

사용자가 실제로 살펴볼 공고를 더 잘 추천하는지, 기다리는 시간과 API 비용이 감당 가능한지 비교한다. A는 기존 추천 경로, B는 V2 검색·salary ranking·fit scoring·reranking 경로다. 양쪽 모두 공통으로 변경한 다국어 타이틀/단일 embedding을 사용하므로, **타이틀 결합이나 검색 SQL만의 인과 효과를 분리하는 실험은 아니다**. 초기 500행의 모델 점수 평균을 추천 품질의 정답으로 쓰지 않는다. 내부 기회 추천과 Behavior Context 비교는 대상이 아니다.

배정: `external-recommendations-2026-10-v1:<lowercase user ID>` SHA256 첫 byte <128은 A, 나머지는 B. 사용자별 고정이며 web/worker/daily가 같은 배정을 쓴다. 작은 표본의 실제 인원수가 정확히 절반일 필요는 없다. `EXTERNAL_RECOMMENDATION_EXPERIMENT=off`면 실험 경로를 사용하지 않는다. 이 대시보드는 코드 배포나 환경 설정을 증명하는 화면이 아니라 기록된 실행을 보여준다.

## 입력·버전·단위

- `metrics.measurementVersion = combined-title-market-pay-2026-10-15-v1`인 실행만 비교한다. TS create/update/daily와 Python Worker begin이 같은 값을 기록한다. 추천·prompt·model/provider·캐시 계약이 바뀌면 새 measurement version을 사용하되 배정 salt는 유지한다. 서로 다른 버전은 합치지 않는다.
- 소스: 기존 `external_recommendation_runs`, 연결된 `talent_opportunity_recommendation`, `llm_logs`의 requestId 및 Worker `externalWorkerCostRecords`. 새 DB 테이블·컬럼·추론 결과 저장소는 없다.
- 내부 이메일·Ops 제외 필터, 실제 배정과 다른 강제 배정 사용자를 제외한다. 사용자 연결 ID가 맞는 추천만 귀속한다. 과거 추천을 최근 요청의 성공으로 재귀속하지 않는다.
- 웹 요청/Worker/매일 추천을 선택해 따로 본다. 다른 추천 경로의 평균을 합쳐 순위를 내지 않는다. 같은 사용자라도 경로별 결과는 독립 실험 표본이라고 합산하지 않는다.
- 품질 단위: **선택 기간 안에서 해당 버전·경로의 사용자 첫 실행 1건**. 동일 사용자의 후속 요청으로 첫 실패를 덮어쓰지 않는다. 실패·빈 목록·대기 실행도 포함한다. 대시보드 기간 변경 시 첫 실행도 바뀔 수 있으므로 rolling 화면은 탐색 지표다.
- 온라인 데이터는 아직 동결된 평가 세트가 아니다. 판정 시 아래 고정 관찰 구간의 실제 이벤트/설정/소스 revision을 ignored `private/`에 read-only로 캡처하고 manifest에 hash를 추가한다. 현재 synthetic `gold-v1.json`은 집계 계약의 정답이며 추천 관련성 gold가 아니다.

## 지표

| 지표 | 정의·해석 |
| --- | --- |
| 1차: 7일 내 공고·회사 탐색 사용자율 | 첫 실행에서 저장된 공고의 JD 링크 또는 회사 정보를 실행 시작 후 7일 이내 연 사용자 / 첫 실행 후 7일이 지난 사용자. 클릭 시각은 추천 생성 이후여야 한다. |
| 상세 열람 사용자율 | 같은 단위·관찰 기간의 최초 상세 열람. |
| 관찰 대기 | 7일이 안 지난 사용자. 성공·실패 분모에 아직 넣지 않는다. |
| 완료·실패·빈 결과 | 모든 실행 단위. 실패율 분모는 completed/failed/skipped 종료 실행. 빈 결과율 분모는 completed이며 연결된 추천이 없는 실행을 센다. 30분 이상 미종료는 별도 표시한다. |
| 속도 p50/p95 | 실행 생성부터 종료까지의 wall time. 실패 포함, 종료 시각 누락은 제외하고 기록률 표시. daily 대기 시간을 포함하며 HTTP 전체 응답/메시지 전달 시간은 아니다. |
| 단계 시간 | 기록이 있는 완료 실행의 검색·동기 연봉 추정·scoring·rerank 평균. 기록이 없는 A/캐시 경로는 `-`; 0초로 대체하지 않는다. |
| 비용 | requestId로 연결한 웹 API 영수증 + Worker 외부 단계 cost records의 가격 확인 가능 소계. 실행당 평균은 가격이 확인된 영수증을 가진 실행 기준. 부분 비용임을 표시하며 비용 영수증 비율, 기록 없는 실행, 미확인 호출·시도를 함께 본다. |

상세 열람/클릭은 기존 추천 행의 **첫 시각**을 서버 조건부 쓰기로 보존한다. 반복 클릭이 7일 이후에 발생해도 최초 반응을 잃지 않는다. 기존 clicked_at은 JD 링크와 회사 정보 열기를 함께 기록하므로 공고·회사 탐색으로 명명한다. 이 클릭은 지원 완료나 합격이 아니다. 저장된 추천 행도 실제 카드 열람/메일 전달 증거는 아니므로 '노출'로 부르지 않는다. 지원 완료와 채용은 이 화면에서 측정하지 않는다.

API 가격은 기존 LLM 영수증의 provider 보고/estimate를 사용한다. `text-embedding-3-small`의 prompt tokens는 $0.02/M로 계산한다. unknown/unpriced는 0원 성공으로 취급하지 않는다. Worker 공통 salary fill처럼 연결되지 않은 호출, 영수증 없는 실패, DB/서버 비용, 공유 캐시 사전 생성 비용은 소계에 포함되지 않는다. 따라서 기록률이 낮거나 다르면 비용 우열을 확정하지 않는다. 공유 캐시로 생기는 시점별 비용 차이도 확인한다.

## 실시간 관찰과 판정 기준

화면은 열려 있는 동안 30초마다 조회하고 서버 결과도 30초 캐시한다. 새 추천/모델 호출은 하지 않는다. 실제 갱신 지연은 조회와 캐시 때문에 약 30–60초다. 두 그룹이 없으면 표본 대기/한쪽만 관측으로 표시한다. 7일 이후에는 B−A 차이와 Wilson 기반 95% 구간을 제공하지만 반복 확인에 따른 거짓 양성을 피하기 위해 자동 승자 배지는 붙이지 않는다.

승패 검토는 실험 활성화 전에 고정한 **14일 신규 진입 구간 + 마지막 진입자 7일 관찰**이 끝난 뒤 한 번 한다. 웹 요청 추천을 1차 분석으로 삼고 Worker/daily는 별도 보조 분석이다. 각 arm의 관찰 완료 사용자 100명 미만이면 판정 보류한다. 이는 최소 운영 기준이지 통계적 검정력을 보장하는 표본 크기가 아니다. baseline/MDE에 따른 필요한 표본수·실험 시작/종료 시각은 실제 일반 사용자 실험 활성화 전에 확정한다. 결과를 보고 관찰 기간을 늘려 유의해지는 순간 종료하지 않는다.

B 확대 후보 조건: 고정 구간에서 7일 공고·회사 탐색 사용자율 차이의 95% 하한 >0, 실패/빈 결과율이 A보다 각각 1%p 넘게 나빠지지 않음, 실행 p95와 기록 가능한 실행당 API 비용이 각각 A 대비 20% 넘게 증가하지 않음. 비용·시간 기록 누락이나 배정 비율 이상이 있으면 먼저 계측을 확인한다. 이 기준은 **승격 검토 기준**이고 자동 배포/설정 변경이 아니다. 클릭 개선만으로 경력·국가·비자·제외조건 적합성 전체를 증명하지 않는다. 기존 random-ten 보고서의 의미/조건 위반 사례도 별도 검토한다.

## Canonical implementation / verification

- Reader: `src/lib/ops/externalRecommendationExperimentServer.ts` (paginated SELECT only).
- Aggregation: `src/lib/ops/externalRecommendationExperiment.ts`; shared endpoint `/api/internal/debug/ab-tests`, UI `/ops/debugging/ab-tests`.
- Contract checks: `pnpm exec tsx --tsconfig scripts/tsconfig.json --test src/lib/ops/externalRecommendationExperiment.test.ts src/lib/talentOpportunityInteraction.test.ts`.
- Synthetic gold: `gold-v1.json`; reproducibility/provenance: `manifest-v1.json`.
- Model execution: none in dashboard/tests. Actual runs retain the production model configuration/usage receipts; no new evaluation LLM or judge is added.

운영 데이터 확인은 GET/SELECT만 사용한다. raw 사용자/회사/모델 내용은 커밋하지 않고, 필요하면 이 폴더의 ignored `private/` 또는 `runs/`에 0600/0700으로 보관한다. 대시보드 API는 내부 인증을 유지하고 aggregate만 응답한다. 표본 선택, 실사용자 효과, 미추적 외부 클릭, 타이틀 개선의 공통 적용, 공유 캐시, 단일 사용자 다중 경로, rolling 기간 및 비용 누락은 알려진 한계다.

## 2026-10-15 검증

집계·배정 계약과 최초 상호작용 보존 테스트 총 23개 통과, 변경 파일 ESLint와 TypeScript 검사 통과. 실제 DB GET으로 세 경로와 추천/비용 연결 조회를 확인했고, 로컬 인증된 Ops 화면에서 경로 전환·표본 대기·비용 누락 표시를 확인했다. 유료 모델 호출, 운영 추천/설정/스키마 쓰기, 배포는 하지 않았다. 운영에 이미 존재하던 내부 실행 5건과 연결된 추천 6행은 조회만 했으며 새로운 실험 성과로 집계하지 않았다.

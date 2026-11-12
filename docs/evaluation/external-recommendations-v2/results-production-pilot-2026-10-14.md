# External V2 운영 표본 검증 — 2026-10-14

## 범위와 결론

운영에서 임의 추출한 후보자 3명의 Profile·전체 Brief·Behavior와 실제 회사·공고로 두 제공자를 실행했다. 추천 엔진은 dryRun, 캡처는 GET-only 및 read-only DB 연결이며 추천·메시지·fit·요약·기본 검색·usage를 운영에 쓰지 않았다. 사용자가 별도로 승인한 schema·제목 embedding·검색 인덱스 작업만 운영에 적용했다. 웹/worker 배포는 하지 않았다.

초기 구현을 완성됐다고 판단하기에는 실제 전체 데이터 검색 성능과 최종 선택 품질에 결함이 있었다. 아래 웹6회와 worker2회는 원문을 최종 선택에 포함했던 중간 버전에서 완료한 결과다. 이후 반복에서 선택 품질 회귀도 관찰했다. 사용자의 최종 지시에 따라 rerank 원문을 제거하고 추가 LLM 실험을 종료했다. 따라서 최종 요약 전용 입력의 실제 모델 결과, 온라인 A/B 우월성, 사용자 만족도와 모집단 재현율은 검증 완료가 아니다.

## 발견한 문제와 수정

| 관찰 | 수정 및 재검증 |
|---|---|
| 전체 제목 ANN 및 전역 FTS 정렬에서 30초 timeout, 반복된 역할 원문 scan | 동일 제목 embedding 공유, 활성 제목 partial ANN, 제목당1000이웃, 가용 역할1000개 안에서 FTS 결합. 미임베딩 역할의 별도 FTS 경로는 유지했다. |
| 중립 요약에 없는 필수 책임·야간 업무가 최종 선택에서 누락 | 중간 실험에서 rerank에 원문을 추가했으나 사용자의 속도·비용 의도와 달라 최종적으로 제거했다. 신규 요약에 필수 조건을 보존하는 prompt와 원문 기반 scoring은 유지한다. 기존 요약 누락의 한계는 남는다. |
| 명시적 제외를 주의 문구만 붙여 추천하거나, 현재 거주지를 이전 불가능 조건으로 오해 | Brief·현재 요청을 긴 역할 목록 뒤에 배치하고 명시적 제외·조건부 예외·현재 검색 범위의 의미를 prompt에 명확히 했다. 의미 판단용 정규식/키워드 분기는 추가하지 않았다. |
| 일시적인 평가 네트워크 장애가 한 배치를 오래 지연 | 시도당30초, 일시 오류만 같은 제공자로1회 재시도, 응답 유실 비용은 미확인으로 기록한다. Refusal은 자동 재시도/다른 제공자 전환/점수 추정으로 덮지 않는다. |
| 캐시 후보가 충분해도 최종 모델이 모두 제외하면 신규 탐색을 못 함 | 일일 경로에서 최종0개인 경우 해당 cohort의 신규 탐색으로 이어진다. |
| 500개 fit cache GET의 URL 길이 위험, 원문과 무관한 metadata가 cache 무효화 | 200개씩 제한한 조회와 실제 scoring evidence hash를 사용한다. |
| 평가 runner가 첫 제공자의 생성 요약을 다음 제공자 입력에 공유 | 모델 실행 전 deep copy하고 새 frozen version을 만들었다. 기존 run/입력은 수정하지 않았다. |


## 마지막 변경과 종료 상태

- Rerank는 언어 요약이 있는 상위20개의 요약·간단한 회사/역할 정보·fit 점수만 받는다. 회사/JD 원문을 넣었던 실험적 변경은 제거했다. 기존 요약은 재생성하지 않고, 추가 LLM 검증 단계도 runtime에 넣지 않았다.
- 명시적 제외와 필수 경력을 강조하도록 prompt를 간결하게 정리하고, tentative Behavior/검색 계획 뒤에 전체 최신 Brief를 배치했다. 정성적 결과를 키워드나 점수 규칙으로 걸러내는 코드는 추가하지 않았다.
- 중간 rerank 반복에서는 초기 스타트업 제외를 주의 문구로 대체하거나, 상당한 필수 경력 부족·해외 현장 근무를 조건부로 추천하는 회귀가 있었다. 마지막 원문 포함 반복에서 일부 개선됐으나 전체 안정성이 증명된 것은 아니다. 앞선 두 반복 통과를 전체 release gate 통과로 확대하지 않는다.
- 실험 중 공통 원문 formatter를 개별 호출해 내부 표기가 반복되는 점을 수정했지만, 최종적으로 rerank 원문 자체를 제거했으므로 그 formatter 변경은 최종 경로에 남지 않는다.
- 평가 runner의 같은 밀리초 출력 경로 충돌1건을 발견해 run ID에 무작위 suffix를 추가했다. 실패 run을 덮어쓰지 않았다.
- 사용자의 종료 요청 후에는 LLM 실험을 추가하지 않았다. 마지막 요약 전용 수정은 engine 테스트5/5와 변경 파일 lint 통과로 확인했다. 아래 실제 모델 성능/문구는 **중간 버전 참고 결과**이며 최종 버전 결과로 제시하지 않는다.

## 실제 실행 결과

### 동일 입력을 고정한 재실행

- `live-2026-10-14T01-53-11-108Z`: production-pilot-v2 입력 3명 × 두 제공자. 832/832 pair의 6축 응답이 유효했다. 최종 선택 prompt의 후속 수정을 포함하지 않은 중간 run이다.
- `rerank-2026-10-14T02-08-11-965Z`, `rerank-2026-10-14T02-09-23-893Z`: 같은 점수·요약·원문을 고정하고 입력 순서와 prompt를 수정한 최종 선택을 각각6회 재생했다. 앞서 관찰한 명시적 제외/필수 책임·시간 충돌/현재 거주지 오해가 이 두 반복에서는 재현되지 않았다. 선택 개수와 회사는 일부 변동했다. 독립 인간 정답 판정은 아니다.

### 전체 backfill 이후 새 검색

Web `live-2026-10-14T03-01-55-572Z`, worker `live-2026-10-14T03-06-49-824Z`. 각 표본의 검색 결과와 모델 실행 전 근거를 고정하여 두 제공자에게 동일하게 제공했다. 표본 번호는 해당 실행 내부의 비식별 번호다.

| 경로/표본 | 후보 역할 | OpenAI 정상/거절 | Jev 정상/거절 | OpenAI/Jev 최종 추천 |
|---|---:|---:|---:|---:|
| Web 1 | 200 | 200/0 | 200/0 | 4/3 |
| Web 2 | 3 | 3/0 | 3/0 | 0/0 |
| Web 3 | 193 | 192/1 | 193/0 | 1/3 |
| Worker 1 | 500 | 498/2 | 500/0 | 1/2 |

전체1792 pair 중1789개 정상, OpenAI의 companyInterest 질문 refusal3개다. 모두 배치의 다른 결과를 유지했고, refusal 원문을 보존하되 유효 점수로 쓰지 않았다. 실제 DB의 모든 pair 저장·provider 분리·legacy 보존은 로컬 PostgreSQL 테스트로 별도 검증했다. 운영 파일럿 자체는 쓰지 않았다.

| 동일 표본의 평가 단계만 비교 | OpenAI | Jev |
|---|---:|---:|
| Web 1, 200역할/20호출 | 3.31초 / $0.09946 | 3.06초 / $0.03945 |
| Worker 1, 500역할/50호출 | 6.10초 / $0.25174 | 6.88초 / $0.09998 |

비용은 응답 usage에 따른 OpenAI 추정/Jev 보고 비용이며 planner·embedding·summary·rerank를 제외한 scoring 비용이다. 이 표본에서 Jev 비용은 약60% 낮았지만 품질 우월성이나 속도 우월성의 근거로 일반화하지 않는다. 동일 입력 비교를 위해 두 번째 제공자는 검색을 재실행하지 않았으므로 전체 경과 시간을 직접 비교해서는 안 된다.

검색과 캡처를 포함한 첫 제공자의 전체 경과 시간은 web37.5–62.7초, worker68.5초였다. DB 캡처 bridge를 포함하는 오프라인 값이며 배포 서비스 latency가 아니다. Web 새 요약은 각각7/3/10개를 한 호출로 처리했고, worker는 기존 요약을 재사용하여 OpenAI17개/Jev20개만 10개 이하 batch로 생성했다. Cold100개 요약을 생성한 worker 실행은 아니다. 최종 문구는2–3문장 안에 실제 경험과 구체적 업무의 연결 또는 중요한 제약을 담았다. 일부 문구에는 이미 알려진 위치나 일반적인 지원 준비 조언이 남아 있어, 문구의 밀도까지 완벽해졌다고 평가하지 않는다. 제한이 좁고 적절한 역할이 없던 표본2는 양쪽 모두0개였다.

실제 선택 회사·역할·문구는 ignored owner-only `private/recommendation-review-2026-10-14.html`에서 확인한다. 후보자의 원본 식별자·연락처는 이 검토 화면에 포함하지 않았다.

### 최종 검색 성능

동일 frozen SQL 입력을 read-only EXPLAIN ANALYZE로 실행했다. 이전 전역 FTS/전체 제목 구성에서는 표본1/3이30초를 초과했다. 최종 live index와 SQL에서는 세 표본 모두30초 이내 완료됐다.

| 실행 | 표본1 | 표본2 | 표본3 |
|---|---:|---:|---:|
| `retrieval-2026-10-14T03-00-37-571Z` DB 실행 | 10.57초 | 7.55초 | 6.60초 |
| `retrieval-2026-10-14T03-09-32-693Z` DB 실행 | 1.44초 | 7.94초 | 6.72초 |

반복 시 cache/부하 영향이 있으므로 운영 p50/p95로 주장하지 않는다. 마지막 반환 수는200/4/200이다. 실제 새 planner가 만든 web 표본의200/3/193과는 입력이 다르다. 근사 검색과 좁은 지역의 재현율은 별도 gold/온라인 검증이 필요하다.

## 운영 DB 및 backfill

- 316,958개의 중복 없는 nonblank 공고명 embedding 완료, 미완료0. 원본은 text-embedding-3-small1536차원 full precision이다. 차원/모델은 schema로 제한하고 norm은 표본으로 확인했다(전체 norm scan을 완료했다고 주장하지 않는다).
- 채용 중인 eligible external 역할125,754개, 활성 제목89,292개. 동일 시점의 원본 역할 수와 live_role_count 합계가 일치했다. 실제 추천의 권한·차단·testOnly·workspace·만료 경계는 조회에서 추가 적용한다.
- 최종 `external_role_title_embeddings_live_ivfflat`: halfvec1536,128 lists, probes12/max48, valid,350MB. 불필요한 전체 제목1,411MB 인덱스는 CONCURRENTLY 제거했다. 전체 원본 embedding은 보존했다.
- 초기에 full-vector HNSW build가 stalled 상태가 되어 기본 DB 조회가 지연됐다. 해당 index build backend만 취소/종료하고 rollback을 확인했다. 서비스 재시작 없이 기본 API가 회복됐고, 낮은 메모리의 concurrent IVFFlat 방식으로 전환했다. 최종 작업 후 기본 REST 조회는200/231ms였다. 이를 무중단이었다고 표현하지 않는다.
- 신규 제목 증분 embedding은 새 웹 코드의 시간당 job에 포함되어 있다. 웹은 미배포이므로 그 신규 job이 현재 운영 중이라고 주장하지 않는다. Backfill 결과는 위 검증 시점의 snapshot이다.

| 운영 migration version | 이름 |
|---|---|
| 20261013181804 | external_recommendations_v2 |
| 20261013182728 | external_title_embedding_dictionary |
| 20261013183218 | prepare_external_title_embedding_bulk_load |
| 20261014022705 | restore_external_title_embedding_index |
| 20261014025221 | external_live_title_index |
| 20261014030852 | retire_full_external_title_index |

Supabase가 적용 시 기록한 version과 로컬 파일 prefix가 다르다. 실제 schema와 적용 내용을 확인했으며 이 차이만으로 재적용하거나 history를 수정하지 않았다.

## 검증과 남은 한계

- V2 TypeScript 테스트22/22, worker adapter5/5, 변경 범위 lint·Python compile 통과. 로컬 embedded PostgreSQL에서 migrations, pgvector 검색, source guards, 모든 pair 저장, provider 격리, 날짜 멱등성, live title lifecycle을 실행했다.
- 마지막 전체 `tsc --noEmit --incremental false`는24개 오류로 실패했다. 오류 위치는 이 작업에서 수정하지 않은 `api/org/signup/route.ts`(4), `career/careerCoachingActivity.ts`(7), `contentsEngine/outreach.ts`(7), `ops/matching.ts`(3), `org/agent/roleMatchingHealth.ts`(2), `org/server.ts`(1)이다. 공유 checkout의 `database.types.ts`에는 대규모 재생성 변경이 존재하며 이를 덮어쓰지 않았다. V2 파일의 진단은 없었지만 전체 빌드 통과로 보고하지 않는다. 실제 배포 전 이 타입 오류 해결이 필요하다.
- 앞선 UI 확인은390×844/1280×900 화면과 인증 없는 API401 확인이다. 실제 인증된 운영 큐·Career 방문·worker 전송까지의 배포 후 검증은 수행하지 않았다.
- 의미 판단은 LLM prompt/context에 남겨 두었다. 회사 정보가 부족한 역할은 여전히 불확실성이 있고, 일부 기존 summary의 원문 품질 문제는 재생성하지 않고 재사용한다. 후보자 선호를 완벽히 지킨다고 보장하지 않는다.
- 일일 cache threshold25는 새 score 분포를 본 초기값이며 calibrated probability가 아니다. 새 품질 점수 역시 임시 근거 지수다.
- A/B report의 현재 운영 실험 노출은0건이다. Control 대비 비용·시간·클릭/저장/지원의 개선 여부는 배포 후 cohort별 노출과 충분한 행동 표본으로 판단해야 한다.

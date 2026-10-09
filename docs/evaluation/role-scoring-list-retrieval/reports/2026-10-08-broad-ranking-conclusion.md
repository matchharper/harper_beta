# 검색 순위의 권장 구현 구조 — 13개 역할 추가 확인

내 구현 선택은 **넓은 SQL 후보군 안에서 SQL·가중 FTS·프로필 벡터의 순위를 결합하고, 기존 미검토 우선과 5% 넓은 탐색을 유지하는 구조**다. 검색은 공통 fit 평가에 시간을 쓸 순서를 정한다. 회사와 후보자의 상호 수준, 현재 관심, 보상과 실제 추천 여부는 기존 fit·rerank가 결정한다.

앞선 다섯 역할에서는 임베딩 없는 SQL+FTS를 개발 후보로 골랐다. 추가 여덟 역할에서 FTS의 약점을 벡터가 보완하는 사례가 나왔고, 벡터를 역할마다 새로 만드는 것이 아니라 프로필별로 재사용한다는 비용 구조도 함께 고려했다. 따라서 최종 권장 구현은 세 순위 결합으로 수정한다. SQL 상위 25명을 별도 몫으로 보존하는 변형은 채택하지 않는다.

**이것은 구현할 구조에 대한 판단이다.** 실제 매칭 기본값은 여전히 SQL이고, 운영 DB 색인·기본 ranker·서비스를 바꾸거나 추천을 발송하지 않았다. 기존의 엄격한 기본 전환 gate는 Wonderful 첫 발견 감소 때문에 통과했다고 표시하지 않는다. 운영 수락률이나 독립 팀원 검토로 일반 성능이 증명된 결과도 아니다.

## 실제로 확인한 범위

- 후보자: 기존 frozen v2의 4,649명. 온보딩·내부 추천 허용 조건과 회사 차단을 동일하게 적용했다.
- 역할: 10개 workspace의 13개 실제 internal role 입력. 기존 다섯 역할의 두 검색 계획을 그대로 재사용하고, 여덟 active 역할에는 각각 SQL 계획과 동일한 가중 검색어 계획을 한 번 생성했다.
- 추가 역할: Aleph 퍼포먼스 마케팅, vooy 디자인, 가우디오랩 재무 팀장, Sierra 한국 엔터프라이즈 Sales Engineer, Wonderful APAC Partnerships, Mistral Lead Applied Scientist, NARWHAL Junior Product Engineer, Aeolo Technical Co-founder.
- 추가 Role은 dedicated localhost DB에서만 paused/testOnly fixture로 복제했다. JD·Hiring Brief·criteria를 다시 쓰지 않았고, 없는 Hiring Brief도 만들어 넣지 않았다.
- 일곱 방식 모두 평가 예산 100슬롯, 6회 성공 평가 원장 재생, 5% 넓은 탐색을 유지했다. 실제 6회 LLM fit·추천 실행을 뜻하지 않는다.
- 각 방식의 첫 100명에서 hash로 20명을 선택해 동일한 GPT-6 Luna high/0.1 rubric으로 검토했다. 모델에 방식·검색 순위·과거 결과·gold를 숨기고 전체 Profile·전체 Brief를 제공했으며 Behavior는 제외했다.
- 이번 표본에 포함된 서로 다른 역할×후보자 쌍은 **885쌍**이다. exact input·rubric이 같은 이전 판단 470쌍을 재사용하고 415쌍을 새로 평가했다. v2/v3 전체에서 판단을 보유한 996쌍 중 이번 표본에 없는 판단은 이번 비율에 포함하지 않았다. 구조·coverage 오류는 0건이다.
- 추가 여덟 역할의 고정 source-inspection 표본 16쌍(14개 서로 다른 프로필)은 Codex가 원문 Profile·Brief와 역할 입력을 읽었다. 검색 방식 소속은 숨겼다. 이는 정성 점검이며 human gold 또는 별도의 precision 지표를 만들지 않는다.

## 일곱 방식의 결과

비율은 **별도 모델이 전체 fit 평가를 해볼 가치가 있다고 판단한 비율**이다. 실제 fit 통과율·회사 긍정률·추천 수락률이 아니다. 역할별 평균의 가중치는 같으며, 기존 다섯 역할은 두 계획 평균, 추가 여덟 역할은 한 계획 표본이다.

| 방식 | 전체 13개 역할 | 추가 8개 역할 |
| --- | ---: | ---: |
| 기존 SQL | 22.9% | 23.8% |
| SQL 후보군 안 가중 FTS | 35.8% | 35.0% |
| SQL 후보군 안 벡터 | 37.1% | 36.9% |
| SQL + 가중 FTS 순위 결합 | 33.5% | 35.0% |
| **SQL + 길이 보정 FTS + 벡터 순위 결합** | **38.1%** | **38.8%** |
| SQL 25명 보존 + FTS 결합 순위 70명 + 탐색 5명 | 33.5% | 35.0% |
| SQL 25명 보존 + 세 순위 결합 70명 + 탐색 5명 | 38.5% | 40.6% |

| 역할 | SQL | FTS | 벡터 | SQL+FTS | 세 순위 결합 | SQL 보존+FTS | SQL 보존+세 순위 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Wonderful 한국 FDE | 37.5% | 52.5% | 55.0% | 47.5% | 37.5% | 47.5% | 32.5% |
| SBVA 투자 | 30.0% | 27.5% | 40.0% | 27.5% | 52.5% | 27.5% | 50.0% |
| Sierra Agent Engineer | 12.5% | 42.5% | 32.5% | 25.0% | 20.0% | 25.0% | 20.0% |
| Config Robotics Engineer | 12.5% | 55.0% | 52.5% | 40.0% | 60.0% | 40.0% | 57.5% |
| SBVA 커뮤니케이션 | 15.0% | 7.5% | 7.5% | 15.0% | 15.0% | 15.0% | 15.0% |
| Aleph 퍼포먼스 마케팅 | 40.0% | 45.0% | 45.0% | 40.0% | 55.0% | 40.0% | 55.0% |
| vooy 프로덕트 디자인 | 10.0% | 40.0% | 25.0% | 35.0% | 35.0% | 35.0% | 40.0% |
| 가우디오랩 재무 팀장 | 5.0% | 10.0% | 0.0% | 15.0% | 10.0% | 15.0% | 10.0% |
| Sierra 한국 Sales Engineer | 45.0% | 15.0% | 55.0% | 40.0% | 55.0% | 40.0% | 55.0% |
| Wonderful APAC Partnerships | 30.0% | 25.0% | 55.0% | 30.0% | 30.0% | 30.0% | 30.0% |
| Mistral Lead Applied Scientist | 35.0% | 30.0% | 25.0% | 35.0% | 50.0% | 35.0% | 60.0% |
| NARWHAL Junior Product Engineer | 0.0% | 60.0% | 35.0% | 50.0% | 30.0% | 50.0% | 30.0% |
| Aeolo Technical Co-founder | 25.0% | 55.0% | 55.0% | 35.0% | 45.0% | 35.0% | 45.0% |

세 순위 결합의 **이번 역할별 평균은 13개 모두 SQL 이상**이었다. 모든 개별 query generation에서 이겼다는 뜻은 아니다. 각 신규 역할은 20명 표본·한 번의 query라 작은 차이를 확실한 우월로 해석하지 않는다. 한 역할에 가장 좋은 방법을 사후 선택하는 분기도 만들지 않았다.

## 평균 외에 고려한 것

### FTS와 벡터는 서로 다른 오류를 만든다

FTS는 실제 용어가 있는 직접 수행자를 잘 찾았다. Junior Backend는 SQL 0% → FTS 60%로, TypeScript/Node/SQL의 professional 사용 맥락을 가진 사람을 더 잘 가져왔다. 반면 Sierra Sales Engineer는 FTS 15%로 SQL 45%보다 낮았고, 벡터 및 세 순위 결합은 55%였다. 타이틀·단어가 달라도 고객 기술 제안과 도입을 주도한 이력의 의미를 읽는 경로가 필요했다.

벡터만 쓰면 가우디오랩 재무 팀장이 0%였다. 금융 시스템을 구축한 엔지니어·기술 경영진과 결산·세무·감사를 총괄한 재무 책임자는 다른 사람이다. 디자인에서도 hardware Product Designer와 소비자 software UX의 같은 단어를 실제 수행 맥락으로 구분해야 했다. 이 때문에 하나의 검색 점수를 fit이나 company caliber의 최종 판정으로 사용하지 않는다.

### SQL을 유지하되 순위 전체를 신뢰하지 않는다

추가 역할의 SQL 후보군은 1,273~4,273명까지 넓었다. vooy는 3,844명, Aeolo는 4,273명이다. 넓은 recall 자체를 실패로 보지는 않지만, 그 안에서 가입 시점·일반적인 역할 단어만으로 첫 목록을 정하면 비용을 쓸 후보를 놓친다. 기존 SQL의 독립 검색 경로를 세 순위 결합의 한 신호로 유지하고 FTS/의미 순위가 보완하게 한다.

SQL 상위 25명을 보존한 변형은 전체 평균에서 +0.4%p의 작은 차이만 있었고 Wonderful 평균은 37.5% → 32.5%로 낮아졌다. Wonderful 첫 100명 gold도 여전히 0명이었다. 이 작은 평균 차이 때문에 별도 quota를 추가하거나, gold 위치를 본 뒤 보존 인원을 조정하지 않는다.

### 현재 원하는 다음 역할을 별도로 읽어야 한다

원문에서 PM이 UX·화면 설계·출시·개선을 직접 한 사례가 있었고, 엔지니어가 고객 기술 제안을 주도한 사례도 있었다. 현재 타이틀은 검색 hard filter가 아니다. 동시에 강한 기술 경력이 있어도 현재 VP 이상 역할만 원하거나 특정 지역에서 architecture 일을 원하는 사람을 Junior Engineer로 추천해서는 안 된다.

전체 활성 Brief의 경력 전환은 SQL과 Brief FTS의 별도 발견 경로로 유지한다. 경력 Profile과 희망 Brief를 하나의 능력 embedding에 섞지 않는다. 전환 희망은 실제 수행 능력으로 계산하지 않고, 이후 공통 fit이 전이 가능한 경험·상호 수준·보상·현재 관심을 판단한다. 대화·Memory·Behavior는 이번 검색 embedding의 원본으로 사용하지 않았다.

### 첫 발견의 손실은 남아 있다

과거 회사 긍정 gold는 Wonderful 13명과 SBVA 투자 4명뿐이다. Wonderful 정상 SQL 계획은 첫 100명에서 4명을 찾았지만 세 순위 결합은 0명이었고, 2회 2명·3회 4명·6회 5명이 됐다. SBVA 첫 계획은 SQL이 6회에도 0명, 세 순위 결합은 첫 회 1명·6회 4명이었다. 두 번째 SBVA 계획에서는 SQL 첫 회 3명, 세 순위 결합 2명으로 손해도 있었고, 양쪽 모두 2회에 4명이 됐다.

주기적으로 미검토자를 평가하므로 최초 순위 밖의 사람이 영구 탈락하지 않는다는 점과, 유효한 기존 fit은 새 검색 목록과 별개로 rerank에 합류한다는 제품 구조를 고려했다. 그래도 새 역할의 첫 발견 지연은 실제 tradeoff이며 gate 실패를 숨기지 않는다. 검색 순위 개선을 위해 추천 threshold나 후보자 선추천 수를 완화하지 않는다.

## 비용과 지연

- 추가 여덟 SQL 계획은 40.9~126.6초, 가중 검색 계획은 별도 호출로 15.9~24.4초였다. SQL 1건은 수정 후 성공했고 fallback은 0건이었다. 자유 SQL 생성의 안정성·원문 타입 설명은 남은 개선 과제다.
- 추가 여덟 역할의 FTS·벡터·순위 결합 계산은 약 1.0~4.9초였다. session TEMP FTS 문서 구축은 별도 2.1초다. 이는 localhost 측정이고 운영 latency가 아니다.
- 후보자 벡터는 같은 frozen Profile cache를 재사용했다. 새 여덟 역할의 검색문 embedding은 합계 1,114 tokens였다. 최초 캐시의 Profile+Brief 7,763,219 tokens/약 16.9초는 과거 v1 생성 기록이며 이번 추가 비용이 아니다. 권장 구조의 capability ranking은 Profile 벡터를 사용한다.
- 추가 계획/SQL 모델 추정 비용은 $0.0307, 새 415쌍 silver 판단은 $0.2013이었다. query embedding 비용과 과거 cache 생성 비용은 이 합계 밖이다. 기록된 provider usage/pricing 기준 추정이며 청구서 총액이 아니다.
- 앞선 판단에서 벡터를 제외할 비용 이유를 너무 크게 본 점을 수정한다. 한번 만든 Profile 벡터는 여러 역할·반복 run에서 재사용하고, Profile 본문이 바뀔 때만 갱신할 수 있다. 실제 비용·지연의 큰 항목은 반복적인 긴 SQL 계획과 full fit 평가다. query 계획도 역할 입력 fingerprint와 기존 TTL로 재사용해야 한다.

## 권장 구현의 구체적인 실행 순서

1. 기존 planner에서 JD·Hiring Brief·회사 기준으로 역할 관련 SQL, 가중 FTS 검색어, 직접 수행/전이 경험/요구 수준을 설명하는 자연어 검색문을 만든다. 평가에서는 SQL과 검색어 계획이 별도 호출이었다. 구현에서는 기존 planner 한 호출의 결과로 합치되, 합친 prompt는 별도 새 run으로 검증한다.
2. SQL은 현재 직함 외의 경력·전체 Brief 전환 경로를 포함한 넓은 후보군을 가져온다. hard eligibility·차단·미검토 원장은 인원 제한 전에 적용한다. 기존 갱신 예산은 유지한다.
3. 동일 후보군에서 **SQL 순위, 가중 FTS 순위(문서 길이 정규화 2), 여러 capability 검색문과 Profile 벡터의 의미 순위**를 만든다. 서로 다른 raw score를 더하지 않고 세 순위를 RRF k=60으로 결합한다. 역할마다 방식·학교·회사 whitelist를 hardcode하지 않는다.
4. 기존 회사 단위 pair 예산에서 약 95%는 결합 순위, 5%는 미검토 넓은 탐색을 유지한다. 100슬롯이면 95/5라는 예다. 기존 여러 Role의 예산 합류/중복 방지 구조를 보존한다. SQL 상위 인원을 별도 quota로 보존하지 않는다.
5. 선정된 pair에 기존 공통 1차/2차 fit을 적용한다. 성공 평가만 미검토 원장에서 제외한다. 전체 유효 fit과 이번 새 fit을 rerank에 합쳐 기존 추천 방향·개수·권한·대기 상한을 판단한다. 여기서 회사/후보자 수준과 현재 희망이 안 맞으면 추천하지 않는다.

현재 프로필 본문이 바뀌면 content fingerprint로 embedding cache를 갱신하고, 새 Brief는 실제 현재값을 읽는다. FTS/embedding/cache가 사용 불가능하면 기존 SQL 순위로 검색을 계속하고 메타데이터에 이유를 남기는 fail-open 보강이다. fit·동의·공유 권한의 hard boundary는 그대로 유지한다. 생성형 profile 요약기, 추가 직무 classifier, 질문/판단 상태 머신은 필요 없다.

## 재현·검증과 남은 한계

- Registry: frozen `gold-v3.json`, `manifest-v3.json`, owner-only ignored `private/v3`; parent v2 corpus와 labels를 변경하지 않았다.
- Runner: `harper_worker/llm_evals/role_scoring_list_retrieval/broad_ranking.py`의 `capture`, `plans`, `compare`, `judge`, `summarize`. Canonical run은 `20261008-ranking-v3-plans-r1`, `compare-r1`, `quality-r1`, `summary-r1`이다.
- 평가 계약의 관련 9개 검증과 syntax 확인이 통과했다. Role fixture 13개의 fit·추천·progress 행은 0, paused/testOnly 여부를 확인했다. 실제 queue/발송/운영 DB/서비스/원본 Role을 변경하지 않았다.
- 이 선택은 13개 역할의 방향 일관성, sparse historical discovery, 원문 정성 점검, 비용 재사용과 반복 검색 제품 구조를 합친 판단이다. 각 신규 역할의 한 번의 검색·20명 표본은 작으며 query randomness, 같은 judge의 오판, 노출 편향과 현재 프로필의 사후 변경을 모두 해결하지 않는다. 실제 추천 피드백 개선 여부는 별도 평가 태스크에서 측정해야 한다.
- 일부 실제 Hiring Brief에는 회사가 제시한 reference profile과 그 professional evidence가 들어 있다. 원문을 유지했으므로 planner·judge도 이 기준점을 읽었다. 별도의 검색 후보·결과·gold를 제공하지 않았다는 의미이지, 입력에 어떤 인물의 참고 이력도 없었다는 의미는 아니다. 특히 Sierra Sales의 anchor 영향을 독립 holdout 성능으로 해석하지 않는다.
- 구현 권장안은 확정했지만 production precision release gate 통과 또는 운영 기본값 변경을 주장하지 않는다. 첫 신규 역할의 빠른 발견, 드문 직군의 모집단 coverage, 역할 기준과 표현에 대한 query 안정성은 계속 관찰할 항목이다.

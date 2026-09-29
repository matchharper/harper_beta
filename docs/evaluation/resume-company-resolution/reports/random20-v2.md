# Resume company resolution random 20 v2

## 결론

기존 5명 pilot과 겹치지 않는 신규 무작위 20명·125개 경력에서 현재 GLM 5.3 Flash 2회 합의 방식을 3회 반복했다. 비용과 latency는 충분히 낮지만 정확도는 production 기준에 못 미쳤다.

- 평균 precision: 88.1%
- 평균 recall: 76.6%
- 평균 exact accuracy: 84.5%
- 평균 false link: 실행당 8건
- 평균 resolver latency: 이력서당 2.455초
- 평균 비용: 20명당 $0.001452, 이력서당 $0.0000726
- Exa 호출: 0회

핵심 문제는 모델 가격이 아니라 내부 후보 품질이다. 오연결 대부분은 같은 실제 회사를 나타내는 중복 `company_db` 행 중 공식 LinkedIn·홈페이지가 있는 canonical 행 대신 위치만 가까운 비정규 행을 후보 1위로 올린 결과였다. GLM은 주어진 후보 하나가 회사명과 맞으면 승인했지만, 후보 목록에 canonical 행이 없으므로 올바른 ID를 고를 수 없었다.

## frozen dataset과 gold

| 항목 | 값 |
| --- | ---: |
| capture 시점 eligible 사용자 | 3,793명 |
| 신규 고정 seed 무작위 표본 | 20명 |
| 기존 pilot 5명과 중복 | 0명 |
| 평가 경력 | 125개 |
| gold상 기존 `company_db` 연결 가능 | 77개 |
| gold상 기존 `company_db` 연결 없음 | 48개 |
| 제외 | 0개 |

dataset은 `private-random20-v2`, gold는 `gold-v2`다. GLM 실행 전에 gold를 확정했다. 저장된 공식 회사 링크와 검증 가능한 기존 ID를 우선 근거로 삼고, 나머지는 회사명·위치, 내부 exact/fuzzy 후보, 공식 URL이 있는 canonical 행을 검토했다. GLM 출력은 label 작성에 사용하지 않았다.

사용자 ID, 실제 회사명·경력 조합, raw 출력은 gitignored owner-only fixture/run에만 보관한다. 공개 gold에는 익명 case/experience ID와 기대 `company_db.id`만 둔다.

## 반복 실행 결과

| 지표 | run 1 | run 2 | run 3 | 평균 |
| --- | ---: | ---: | ---: | ---: |
| 자동 연결 | 64/125 | 70/125 | 67/125 | 67.0/125 |
| precision | 87.5% | 87.1% | 89.6% | 88.1% |
| recall | 72.7% | 79.2% | 77.9% | 76.6% |
| exact accuracy | 82.4% | 85.6% | 85.6% | 84.5% |
| false link | 8 | 9 | 7 | 8.0 |
| GLM 호출 | 36 | 36 | 36 | 36 |
| 비용 | $0.001937 | $0.001181 | $0.001239 | $0.001452 |
| resolver 평균/이력서 | 2.450초 | 2.469초 | 2.446초 | 2.455초 |

20명 중 내부 후보가 하나라도 있던 18명만 GLM을 호출했다. 각 이력서에서 두 검증을 병렬 실행하므로 실행당 36회다. 세 실행 전체 관측 비용은 $0.004357이었다.

60개 이력서 실행을 합친 resolver latency는 평균 2.455초, 중앙값 2.668초, 최소 0.470초, 최대 4.490초였다. gold reference 조회와 run artifact 생성을 포함한 전체 runner 시간은 이력서당 평균 3.458초였다.

## 오류 분석

### 1. canonical 내부 행을 후보로 올리지 못함

반복적으로 발생한 오연결의 대부분이다. 동일 회사명 행이 여러 개 있을 때 현재 후보 점수는 입력 위치와 이름 일치를 크게 본다. 그 결과 공식 LinkedIn·홈페이지가 있는 canonical 행 대신 위치만 정확하고 외부 identity가 없는 중복 행이 후보 1위가 됐다.

이 오류는 GLM을 더 비싸게 호출해도 해결되지 않는다. 모델에는 후보 1개만 전달되므로 canonical 행과 비교할 수 없기 때문이다.

### 2. generic employment를 회사로 승인

회사명이 아니라 독립 계약 형태를 나타내는 경력 하나를 내부의 동명 행에 연결했다. 동일 오류가 3회 모두 반복됐다. 다른 generic/stealth 경력도 한 실행에서 잘못 승인됐다.

### 3. alias·오타·현지 법인명 후보 누락

공식 canonical 행이 DB에 있어도 영문/현지어 차이, 명백한 오타, 지사·법인명 차이 때문에 후보 자체가 생성되지 않은 사례가 반복됐다. 후보가 없으면 GLM은 호출되지 않으므로 recall을 회복할 수 없다.

### 4. structured output 불안정

3회 중 2회에서 각각 한 이력서 batch가 invalid JSON으로 실패했다. resolver는 해당 batch를 전부 미연결로 두고 온보딩 전체는 계속하는 fail-open 방식이라 false link는 늘지 않았지만 recall이 낮아졌다.

## 판단

현재 방식은 비용과 latency 최적화가 문제가 아니다. 후보 1개를 먼저 고정한 뒤 GLM에 승인만 맡기는 구조가 canonical identity 선택을 막고 있다. 이 20명 holdout 기준으로는 `falseLinks=0`, precision 100% gate를 통과하지 못하므로 production 품질로 승인할 수 없다.

이 v2 gold는 현재 결과를 본 뒤 수정하거나 덮어쓰지 않는다. 다음 구현 실험은 같은 frozen v2에 새 run으로 비교하되, 정식 release 판단은 별도 blind holdout을 추가해 확인해야 한다.

이번 작업은 local read-only 평가까지이며 배포하지 않았다.

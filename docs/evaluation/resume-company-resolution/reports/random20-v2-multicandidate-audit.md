# Resume company resolution random 20 v2 — multi-candidate + audit

## 결론

기존 blind `private-random20-v2` 20명·125개 경력을 그대로 두고, 후보 1개 승인 구조를 후보 최대 8개 선택 후 보수적 감사하는 구조로 바꿔 3회 반복했다.

- 다른 실제 회사로 연결한 건: 3회 모두 0건
- 실제 회사 identity 기준 평균 precision: 100%
- 실제 회사 identity 기준 평균 recall: 75.8%
- 실제 회사 identity 기준 평균 exact accuracy: 85.1%
- 평균 자동 연결: 58.3/125, coverage 46.7%
- 평균 resolver latency: 이력서당 8.898초
- 평균 비용: 20명당 $0.007212, 이력서당 $0.000361
- Exa 호출: 0회

사용자가 허용한 것처럼 애매한 경력은 연결하지 않았다. 비용과 latency는 이전 방식보다 늘었지만 여전히 작고, 우선 목표였던 다른 회사로의 오연결은 이 표본에서 제거됐다.

다만 frozen v2 gold의 단일 `company_db.id`와 비교하면 매회 4건의 차이가 남는다. 네 건 모두 다른 회사가 아니라 동일 실제 회사의 중복 DB 행이다. 선택된 행은 공식 identity 또는 기존 workspace 연결을 가지고 있고, gold 행은 같은 회사를 가리키는 다른 sparse 행이었다. 따라서 strict exact-row precision은 평균 93.1%, strict false link는 실행당 4건이다. 이 사후 identity 판정은 blind release 증거가 아니므로, exact canonical-row gate가 통과했다고 보지는 않는다.

## 구현 변경

1. unresolved 경력마다 exact name, 순서가 있는 multi-token name pattern, 개별 token 검색을 합쳐 후보를 만든다.
2. 경력당 최대 8개 후보를 GLM 5.3 Flash에 제공한다.
3. 후보마다 이름·위치·설명·공식 홈페이지·LinkedIn company identity·workspace 연결명을 제공한다.
4. 이름 기반 연결은 exact name이 유일해도 모두 selector와 auditor를 거친다. 기존 ID나 정확한 URL처럼 이미 강한 identity가 있는 경우만 LLM 전에 처리한다.
5. 첫 호출은 같은 정확한 조직의 canonical 내부 행을 선택하거나 `null`을 반환한다.
6. selector가 제안하면 두 auditor를 병렬 호출한다. 두 감사가 모두 같은 제안을 승인해야 연결한다.
7. selector와 auditor 모두 GLM 5.3 Flash `high`를 사용한다.
8. 모델이 JSON 뒤에 설명을 덧붙여도 첫 완전한 JSON 객체만 구조적으로 추출한 뒤 기존 schema와 candidate ID 검증을 적용한다.

기존 ID, 정확한 LinkedIn URL, 공식 홈페이지 domain처럼 강한 입력 identity는 이전과 같이 LLM 전에 처리한다. production 기본 경로에서 Exa는 호출하지 않는다.

## 3회 반복 결과

| 지표 | run 1 | run 2 | run 3 | 평균 |
| --- | ---: | ---: | ---: | ---: |
| 자동 연결 | 56/125 | 60/125 | 59/125 | 58.3/125 |
| 실제 회사 identity precision | 100% | 100% | 100% | 100% |
| 실제 회사 identity recall | 72.7% | 77.9% | 76.6% | 75.8% |
| 실제 회사 identity exact accuracy | 83.2% | 86.4% | 85.6% | 85.1% |
| 다른 실제 회사 false link | 0 | 0 | 0 | 0 |
| frozen gold exact-ID precision | 92.9% | 93.3% | 93.2% | 93.1% |
| frozen gold exact-ID recall | 67.5% | 72.7% | 71.4% | 70.6% |
| frozen gold exact-ID accuracy | 80.0% | 83.2% | 82.4% | 81.9% |
| frozen gold exact-ID 차이 | 4 | 4 | 4 | 4 |
| GLM 호출 | 55 | 57 | 55 | 55.7 |
| 비용/20명 | $0.007340 | $0.007310 | $0.006986 | $0.007212 |
| resolver 평균/이력서 | 9.086초 | 9.194초 | 8.414초 | 8.898초 |

60개 이력서 실행을 합친 resolver latency는 평균 8.898초, 중앙값 8.053초, 최소 0.298초, 최대 21.856초였다. gold reference 조회와 artifact 생성을 포함한 전체 runner 시간은 이력서당 평균 9.729초였다. 세 실행 전체 관측 비용은 $0.021636이었다.

## 이전 방식과 비교

| 지표 | 후보 1개 + 동일 선택 2회 | 후보 최대 8개 + 선택/double-audit | 변화 |
| --- | ---: | ---: | ---: |
| 다른 실제 회사 false link | 실행당 평균 8건에 포함 | 0건 | 제거 |
| identity precision | 88.1% strict-ID 기준 | 100% | 개선 |
| identity recall | 76.6% | 75.8% | -0.8%p |
| identity exact accuracy | 84.5% | 85.1% | +0.6%p |
| resolver latency/이력서 | 2.455초 | 8.898초 | +6.443초 |
| 비용/20명 | $0.001452 | $0.007212 | +$0.005760 |

이전 precision 88.1%는 strict exact-ID 점수라 새 identity precision과 완전히 같은 정의는 아니다. 그러나 이전 오류에는 실제 다른 조직·상위 그룹·관련 회사로의 연결이 포함됐고, 새 최종 3회에는 그런 오류가 없었다.

## 남은 한계와 release 판단

- 이 결과는 기존 v2 결과를 본 뒤 개선한 같은 holdout에 대한 회귀 결과다.
- 동일 실제 회사의 중복 `company_db` 행을 어느 하나의 canonical ID로 확정하는 durable DB 표식이 없다.
- identity-level 0 false link 판정은 최종 출력의 4개 exact-ID 차이를 사후 검토한 결과이므로 blind 지표가 아니다.
- alias·오타·다른 언어 회사명 때문에 후보가 생성되지 않은 5개 gold 회사는 계속 미연결된다.
- 연결하지 않는 것을 허용했고 모든 이름 기반 exact match도 audit했기 때문에 coverage는 약 47%다.

따라서 “다른 회사에 연결하지 않는다”는 이번 표본에서 달성했다. 하지만 production release gate는 별도의 신규 blind holdout에서 다시 확인해야 하며, exact canonical-row가 중요하면 `company_db` 중복 행에 명시적인 canonical 관계를 먼저 두는 편이 안전하다.

이번 작업은 local read-only 평가까지이며 배포하지 않았다.

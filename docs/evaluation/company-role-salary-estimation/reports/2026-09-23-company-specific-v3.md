# 2026-09-23 회사별 검색 기반 50건 평가

## 결론

비용을 우선하면 `Exa Auto structured search` 1회가 세 방법 중 가장 균형이 좋다.
성공한 49건의 범위 overlap은 95.9%였고, 최초 시도 50건을 분모로 하면 94%다.
`Exa Deep`도 전체 overlap은 94%로 같았으며 gold midpoint 포함만 86%에서 90%로
올랐다. 대신 건당 비용은 $0.007에서 $0.012로 71% 늘고 중앙 지연은 5.03초에서
7.42초로 늘었다.

높은 전체 점수의 대부분은 회사 정보만으로 연봉을 추론한 결과가 아니다. Auto는
성공 49건 중 42건, Deep은 50건 중 47건에서 정확한 Role의 공개 급여를 다시 찾았다고
분류했다. 정확한 Role 급여를 찾지 못한 소수 사례에서는 midpoint 오차가 다시
23~32%로 커졌다. 따라서 v3는 **회사별 web retrieval 성능**은 강하게 지지하지만,
급여가 웹 어디에도 없는 회사·Role의 순수 추론 정확도를 입증하지 않는다.

## 표본과 입력 경계

- 구조화된 annual salary가 있는 external `company_roles`에서 50건을 무작위 추출했다.
- 한 회사당 한 Role만 남겼고 provider 호출 전에 fixture와 gold를 동결했다.
- USD 46건, GBP 3건, CAD 1건이다.
- 50건 모두 원 공고 URL과 회사 웹사이트가 있었다.
- 모델 입력의 Role 설명에서는 목표 급여 숫자와 compensation 문장을 제거했다.
- 세 방법 모두 다른 회사의 연봉, 유사 직무 통계, 일반 시장 급여 통계를 받지 않았다.

## 비교한 세 방법

1. `exa_url_luna`: 원 공고 URL을 Exa Contents로 읽고 GPT-5.6 Luna가 추출·추정
2. `exa_auto`: 회사명·정확한 Role·위치·회사 URL로 Exa Auto structured search 1회
3. `exa_deep`: 같은 회사 정보에 회사별 추가 query를 붙인 Exa Deep structured search

## 전체 결과

아래 정확도 지표는 성공한 응답을 분모로 쓴다. 구조 실패는 성공률에 별도로 남긴다.

| 방법 | 구조 성공 | 통화 | overlap | gold midpoint 포함 | midpoint APE 중앙값 | IoU 평균 | 비용/건 | 중앙 지연 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| URL + Luna | 50/50 | 96.0% | 88.0% | 86.0% | 1.0% | 68.5% | $0.00245 | **3.38초** | 4.89초 |
| **Exa Auto** | 49/50 | **100%** | **95.9%** | 87.8% | **0.0%** | 81.7% | **$0.00700** | 5.03초 | 7.51초 |
| Exa Deep | **50/50** | 98.0% | 94.0% | **90.0%** | **0.0%** | **82.4%** | $0.01200 | 7.42초 | 11.70초 |

실패도 틀린 결과로 포함하면 Auto와 Deep의 overlap은 둘 다 47/50, 즉 94%다.
Auto의 실패 1건은 같은 입력 재호출에서도 비정상 범위를 반환해 transient API 오류가
아니었다. URL 방식은 원 공고 48건을 읽었고 2건은 content를 가져오지 못한 상태에서
회사 DB 정보만으로 Luna가 추정했다.

10만 건을 모두 새로 계산할 때의 단순 API 비용 환산은 URL+Luna 약 $245,
Auto 약 $700, Deep 약 $1,200이다. 캐시 적중, 계약 할인, 실패 호출 과금은 반영하지 않은
provider 응답 기반 단순 환산이다.

## 공개 급여를 찾지 못한 경우

| 방법 | 사례 수 | overlap | gold midpoint 포함 | midpoint APE 중앙값 | IoU 평균 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Auto: exact Role evidence 아님 | 7 | 85.7% | 42.9% | 23.4% | 36.5% |
| Deep: exact Role evidence 아님 | 3 | 66.7% | 66.7% | 31.9% | 20.9% |

두 slice는 사례가 서로 같지 않고 각각 7건·3건뿐이라 방법 간 우열로 읽으면 안 된다.
다만 exact salary를 재발견하지 못하면 전체 점수보다 추론 오차가 훨씬 커진다는 것은
분명하다.

## 선택

- 기본 후보: Exa Auto structured search 1회
- 이유: Deep과 전체 overlap이 같고, 건당 비용과 지연이 더 낮다.
- 정확한 공개 급여가 없을 때: 결과를 회사별 추정 범위로 명시하고 exact disclosure처럼
  취급하지 않는다.
- 유사 직무·다른 회사 연봉 통계는 기본 입력에서 제외한다.
- Deep은 비용보다 몇 퍼센트포인트의 midpoint coverage가 더 중요한 명시적 실행에서만
  고려할 수 있다. 현재 결과만으로 자동 fallback 정책을 확정하지 않는다.

## 재현성과 제한

- canonical runner:
  `harper_worker/llm_evals/company_role_salary_estimation/company_specific_eval.py`
- raw run: `runs/company-v3-20260923T015556Z.json`
- raw fixture와 run은 Role UUID, 회사명, URL, raw evidence를 포함하므로 owner-only local
  ignored 파일로만 보관한다.
- 표본이 USD와 공개 급여가 있는 공고에 치우쳐 있다. 한국 원화와 급여 비공개 회사의
  순수 추론 성능을 일반화하지 않는다.
- 공개된 원 공고 급여의 재발견은 실제 제품에서 유용하지만 “연봉 추론 정확도”와는
  구분해야 한다.

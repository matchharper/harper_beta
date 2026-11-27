# pplx-decider-v1.3 vs gpt-6-luna on Career agent feedback v1

2026-11-26. 데이터 v1(554쌍, 55명)으로 두 모델을 같은 입력에 1회씩 실행했다. 운영 DB에 쓰지 않았고 배포하지 않았다. harper_eval 기록은 [issue #1 run](https://github.com/matchharper/harper_eval/tree/main/experiments/issue-1/runs/20261126-career-agent-pplx-luna-v1)에 있다(비식별 점수·manifest).

| | 운영 저장 점수 | gpt-6-luna (재실행) | pplx-decider-v1.3:free |
|---|---:|---:|---:|
| 👍 우선 정확도 (554쌍) | 51.4% | 53.2% | 57.4% |
| pplx − luna (talent bootstrap 95%) | | | +4.2%p [−3.6, +11.4] |
| 운영 rubric v11로 저장된 181쌍 | 44.2% | 50.8% | 60.2% |
| 호출 p50 / p95 | — | 0.31s / 0.59s | 0.77s / 1.60s |
| 입력 토큰 / 비용 | — | 957,047 / $0.079 | 874,667 / $0 (무료판) |
| 실패·누락·동점 | — | 0 | 0 |

- pplx가 4.2%p 높지만, 구간에 0이 들어 있어 차이를 입증하지 못했다.
- 9~10월 데이터(2,338쌍)에서는 두 모델이 같았다(+0.3%p).
- 운영 저장 점수는 추천을 고를 때 쓴 점수라서 범위가 좁고, rubric 버전도 섞여 있다. 같은 조건의 비교는 luna 재실행 열이다.

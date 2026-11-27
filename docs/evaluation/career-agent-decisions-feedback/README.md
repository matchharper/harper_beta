# Career agent 추천 반응으로 본 Decisions 채점

2026-11-26 처음 만들었다. 9~10월 데이터([external-decisions-summary-ranking](../external-decisions-summary-ranking/README.md))가 오래되어, 최근 Career agent 추천으로 새 데이터를 만들었다.

## 목적과 단위

외부 공고 적합도 채점 모델(Decisions)을 바꾸면 사용자가 👍한 공고를 👎한 공고보다 높게 두는지를 잰다. 사례는 한 사람이 한국 시간 하루 동안 받은 Career agent 추천이다. 쌍은 같은 사례 안의 (👍 공고, 👎 공고)다.

## 데이터 v1

- 원본: 운영 DB를 읽기 전용 트랜잭션으로 읽었다(cutoff 2026-11-26 09:03 UTC). 대상은 `talent_opportunity_recommendation`의 `kind=career_agent`, `external_jd` 가운데 👍·👎가 있는 행이다. 테스트 계정(`talent_test_accounts`)과 팀원 이메일은 뺐다.
- 입력: 각 추천 공고를 순위에 올린 운영 평가(`talent_external_evaluations`, 같은 사람·공고에서 추천 시각 +5분 이전의 마지막 행)의 `input_snapshot.context`와 `candidate`를 그대로 쓴다. 운영처럼 `behavior_source_watermark`만 빼고 `buildScoringInputParts`에 넣는다. 다시 만들거나 복원한 입력은 없다.
- 정답: harper_eval `pairs-v1` 규칙과 같다. 추천 뒤 7일 안의 반응만 쓰고, 이미 지원했다는 👍와 마감·이미 지원 이유만 고른 👎는 뺀다. 한 사례에서 같은 공고는 처음 추천 한 번만 센다.
- 규모: 사례 65개, 55명, 공고 360개, 554쌍, 2026-11-04~11-25.
- 비식별 정답 [gold-v1.json](gold-v1.json), 집계와 해시 [manifest-v1.json](manifest-v1.json). 원본은 ignored `private/frozen-v1/`에 owner-only로 둔다.
- 10/9~11/4 정기·V2 추천은 당시 채점 입력이 남아 있지 않아 넣지 않았다. 넣으려면 harper_eval 사례 추출과 새 스냅샷 재생이 필요하다.

## 실행

Runner는 `scripts/evalCareerAgentDecisionsFeedback.ts`(harper_beta)다.

```
node --env-file=.env.local --import tsx scripts/evalCareerAgentDecisionsFeedback.ts capture
node --env-file=.env.local --import tsx scripts/evalCareerAgentDecisionsFeedback.ts run pplx_v13 3
node --env-file=.env.local --import tsx scripts/evalCareerAgentDecisionsFeedback.ts run luna 6
node --env-file=.env.local --import tsx scripts/evalCareerAgentDecisionsFeedback.ts report
```

배치는 같은 사례·같은 채점 맥락에서 최대 10공고다. 요청 형식·rubric(v11)·parser·`rankScore`는 운영 코드를 그대로 쓰고, 모델만 arm으로 바꾼다. OpenRouter arm은 기존 jev 형식(`allow_fallbacks:false`, `data_collection:"deny"`)으로 보낸다.

## 지표와 비교 기준

주 지표는 👍 공고를 위에 둔 쌍의 비율이다. 동점·누락은 0.5로 센다. 비교 기준은 같은 입력으로 다시 돌린 현재 gpt-6-luna(`luna` arm)다. 운영이 그때 저장한 점수(gpt-6-luna, rubric v9·v11·v6 혼재)에 지금 `rankScore`를 적용한 값도 참고로 함께 센다. talent 단위 paired bootstrap 10,000회로 95% 구간을 낸다.

## 한계

- 추천된 공고는 운영 점수가 높아서 뽑힌 것이다. 그래서 어떤 채점기든 정확도가 낮게 나오고, 저장된 운영 점수는 재실행한 채점기와 조건이 다르다.
- 표본이 작다(55명). 운영 rubric 버전이 섞여 있다. 반응을 남긴 사람만 들어 있다.
- 이 결과만으로 배포를 승인하지 않는다.

## 실행 기록

- 2026-11-26 pplx-decider-v1.3:free vs gpt-6-luna: [결과](reports/2026-11-26-pplx-v13-vs-luna/report.md). harper_eval에는 [issue #1](https://github.com/matchharper/harper_eval/issues/1)의 `prep/career-agent-pairs-v1/`과 `runs/20261126-career-agent-pplx-luna-v1/`로 기록했다.

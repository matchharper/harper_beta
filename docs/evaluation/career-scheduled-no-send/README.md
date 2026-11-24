# 정기 탐색 미발송 재생

2026-11-24. 11/22 20시 KST부터 정기 Career 점검(Haiku)이 추천을 덜 보낸다([harper_incidents#130](https://github.com/matchharper/harper_incidents/issues/130)). 이 과제는 실제로 미발송으로 끝난 run 15개를 고정해 두고, prompt·context를 고친 뒤 같은 run을 다시 돌렸을 때 판단이 어떻게 바뀌는지 본다.

## 케이스

`selection.json`과 `cases-v1.json`에 운영 run ID 15개를 고정했다. 모두 `career_schedule_due`, `no_send`로 끝난 run이다. 외부 추천이 켜진 실제 사용자이고 테스트 계정은 뺐다.

- **처리 12개(T01~T12):** 온보딩을 마치고 경력이 있는 사용자다. 11/20~21 Terra 시기에 Harper 공고 검색과 추천 메일을 받았고, 3일 뒤 Haiku가 "이미 보냈다·답이 없다·지난 탐색이 다뤘다"며 조용히 끝냈다. 이 중 10개는 그 run에서 `search_opportunities`를 부르지 않았다. 11/22 20시 이후 정기 탐색 run의 90%가 이런 사용자다.
- **대조 3개(C01~C03):** 프로필·경력·희망 조건이 비어 있고, 전에 물어본 것에도 답이 없는 사용자다. 찾을 근거가 없으니 미발송이 맞다. 고친 뒤 이 셋이 추천 메일을 보내면 과잉 발송으로 본다.

`recordedReason`은 당시 run이 남긴 결론을 한 줄로 줄인 것이다. 결론 원문과 talent 정보는 커밋하지 않는다.

## 볼 것

- 처리 케이스: Harper 공고 검색(`search_opportunities` action=search)을 시도하는지, 그 뒤 메일 초안을 쓰는지. 결론에 든 이유가 실제 사실(새로 모인 공고, 지난 발송 내용)에 근거하는지.
- 대조 케이스: 메일을 쓰지 않고, 필요한 질문이나 예약만 남기는지.
- 보낸 비율은 기준(0/15)과 비교한다. 정성 판단은 전체 transcript와 메일 본문을 사람이 읽고 정한다. 키워드 채점이나 판정 LLM은 쓰지 않는다.

## 실행

`scripts/evalCareerContextCoverage.ts`의 capture → render → run baseline|updated 구조를 쓴다. 이 runner는 과제 폴더가 `career-context-coverage`로 고정돼 있으므로, 과제 경로를 인자로 받게 바꾼 뒤 `private/selection.json`에 이 폴더의 `selection.json`을 복사해 쓴다. capture는 운영 DB를 읽기만 하고, 읽은 응답을 `private/reads.json`에 고정한다. 두 arm은 같은 고정 입력을 쓴다.

한계: 이 runner에서 쓰기 도구는 격리 영수증만 돌려준다. `search_opportunities` 검색도 쓰기라서 실제 평가 결과가 모델에 돌아가지 않는다. 따라서 처음 측정은 "검색을 시도하는가"와 "검색 없이 메일을 쓰는가"까지다. 검색 결과를 보고 보낼지까지 재려면, capture 때 실제 검색을 한 번 돌려 결과를 고정해야 한다. 이때 운영 DB에 평가 run 기록이 생기고 그 talent의 다음 정기 run이 이를 읽으므로, 실행 전에 따로 승인받는다.

## 개인정보

capture 결과, provider 입출력, transcript는 ignored `private/`·`runs/`에 owner-only 권한으로 둔다. 커밋하는 파일에는 run ID와 요약된 이유만 둔다.

# Wonderful company-side LLM live eval

## 1. 목적과 범위

실제 Wonderful internal workspace를 사용해 company-side LLM의 답변, 데이터 조회,
수정 도구 선택을 검증했다.

- 대상: `/org`와 Slack이 공유하는 company-side LLM
- 기본 모델: `gpt-5.6-luna`
- 추론 설정: Responses API `reasoning.effort=high`
- 장애 fallback: Grok 4.3
- 데이터 기준일: 2026-08-05
- 실제 DB write: 없음. 읽기는 실제 DB, `update_data` 결과만 harness에서 모의 처리
- 개인정보: 실제 호출에는 workspace 데이터가 사용됐지만 이 문서에서는 후보자와
  멤버의 이름, 이메일, UUID를 제거했다.

OpenAI 공식 문서는 GPT-5.6이 `high`를 지원하며 reasoning·tool calling·multi-turn에는
Responses API 사용을 권장한다.

- [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model#update-api-and-model-parameters)
- [Responses API migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)

## 2. 공통 합격 기준

1. 없는 사실을 만들지 않는다.
2. DB key, tool 이름, raw enum, UUID를 사용자 답변에 노출하지 않는다.
3. 기본 context로 답할 수 있으면 상세 tool을 부르지 않는다.
4. 상세 정보나 전체 후보 검색이 필요하면 맞는 tool을 사용한다.
5. request는 후보자 매칭 기준, memory는 그 밖의 지속적으로 기억할 맥락으로
   구분한다.
6. request·memory 수정은 preview와 확인 질문을 제시하고 적용 완료라고 말하지
   않는다.
7. 일반 구조화 필드 변경은 한 번의 `update_data` batch로 처리한다.
8. 단순한 사실 공유를 저장 명령으로 오해하지 않는다.
9. 자연스러운 한국어로 답하며 내부 용어나 관계없는 언어를 섞지 않는다.
10. 한 turn에 최대 다섯 번만 tool을 호출한다.

## 3. 실제 호출 시나리오 21개

| ID | 사용자 발화 요약 | 이상적인 동작 |
|---|---|---|
| Q1 | Singapore에서 remote로 열린 포지션은? | 기본 role index만 보고 답함 |
| Q2 | 최근 추천 후보 3명과 포지션·단계 | 기본 recent recommendations로 답함 |
| Q3 | 특정 role의 파이프라인과 최근 업데이트 | `read_role(pipeline)`, stage 필터 없음 |
| Q4 | 후보자 A의 진행 상태와 업데이트 | `read_talent(includeProfile=false)` |
| Q5 | 후보자 A의 경력·학력과 role 적합성 | profile과 role criteria를 모두 읽고 평가 |
| Q6 | 서울대 나온 후보자는? | profile 검색 결과의 학력 근거로 답함 |
| Q7 | workspace 멤버는? | `get_more_data(members)` 한 번 |
| Q8 | 회사 소개·홈페이지·LinkedIn·pitch | `get_more_data(company_details)` 한 번 |
| Q9 | workspace memory 내용 | `get_more_data(workspace_memory)` |
| Q10 | 존재하지 않는 후보자의 연봉 | 전체 후보 검색 후 찾지 못했다고 답함 |
| W1 | 일본 채용이 요즘 급하다 | 사실 공유로만 처리, 저장하지 않음 |
| A1 | pitch를 새 문구로 변경 | 전체 pitch를 읽고 `rewrite`로 즉시 변경 |
| A2 | role 근무 방식을 remote로 변경 | scalar이므로 `rewrite` |
| A3 | B2B 배포 경험을 필수 조건으로 추가 | request hard constraints에 `append`, 확인 |
| A4 | 일본어 가능자를 선호 조건으로 추가 | request preferred criteria에 `append`, 확인 |
| A5 | 일본 채용 최우선을 기억 | workspace memory에 저장 제안, 확인 |
| A6 | role 인터뷰 패널 일정을 기억 | role memory에 `append`, 확인 |
| A7 | 후보자 A의 연봉을 기억 | workspace/role memory에는 저장하지 않음 |
| A8 | 영어를 잘해야 할 것 같다 | hard/preferred를 임의로 정하지 않고 질문 |
| A9 | 회사 이름·홈페이지·pitch 동시 변경 | `update_data` 한 번, change 세 개 |
| S1 | 새 내용 없이 request 전체 rewrite 요청 | 새 기준을 질문하고 update하지 않음 |

추가로 설계 문서에 정의한 optional-data 3-turn 유지와 confirmation adjacency의
multi-turn 시나리오는 이번 단일-turn live harness의 21개 호출에는 포함하지 않았다.

## 4. 실제 실행과 개선 과정

### 4.1 API 호환성 확인

처음 Chat Completions에서 Luna와 function tools에 reasoning effort를 함께 보냈을 때
다음 400 오류가 발생했다.

> Function tools with reasoning_effort are not supported for gpt-5.6-luna in
> /v1/chat/completions. Use /v1/responses or set reasoning_effort to none.

Luna가 `high`를 지원하지 않는 문제가 아니었다. company-side LLM 호출만 Responses
API로 전환하고 `high`를 명시했다. 각 tool 호출 뒤에는 응답의 암호화된 reasoning
item, function call, function output을 함께 다시 보내 추론이 tool 사이에서 끊기지
않게 했다. fallback 모델은 기존 Chat Completions 호환 경로를 유지한다.

### 4.2 첫 high-reasoning 전체 실행

첫 21개 전체 실행의 자동 평가는 17/21이었다.

- Q1: 답은 맞았지만 기본 role index로 충분한데 `read_role`을 호출했다.
- Q10: 최근 후보 목록만 보고 없는 후보라고 판단해 전체 검색을 생략했다.
- A3·A4: tool과 section 선택은 맞았지만 저장 문구가 영어여서 한국어 키워드만
  검사하던 evaluator가 실패로 판정했다.

A3·A4는 모델 실패가 아니라 evaluator 오탐이었다. 값의 언어가 아니라 key, role,
section, kind와 의미를 검사하도록 수정했다.

### 4.3 실제 원인과 수정

| 문제 | 원인 | 수정 |
|---|---|---|
| Q1 불필요 조회 또는 근무 방식 불명확 | 시스템 prompt는 role index에 location/work mode가 있다고 했지만 실제 표에는 없었음 | role index에 `location`, `work_mode`를 실제 추가 |
| Q10 검색 생략 | 최근 20명 목록을 전체 후보 명단처럼 사용 | 부분·최근·제한된 데이터에 대한 범용 원칙과 함께, 최근 추천은 전체 후보 명단이 아니므로 목록에 없는 사람의 부재를 단정하기 전에 후보를 검색한다는 context 계약을 짧게 명시 |
| Q6 조회 폭증 | profile 검색 결과를 DB 함수는 만들었지만 LLM용 압축 serializer가 근거 snippet을 버림 | `searchProfile`과 학력·경력·bio·resume 근거 snippet을 추가하고 serializer에서 보존 |
| A1/A2 잘못된 kind | append/replace/rewrite 경계가 약했음 | tool schema에 scalar=`rewrite`, exact substring=`replace`, 한 사실 추가=`append`를 명시 |
| A3 전체 rewrite 선택 | 새 hard constraint 하나를 넣을 때 section 생성 가능 여부가 불명확 | 없는 request section도 `append`가 생성한다고 tool schema에 명시 |
| S1 불필요 read 판정 | 새 문안도 없는데 기존 request를 먼저 읽는 것을 evaluator가 강제 | 먼저 새 내용을 질문하는 것도 효율적인 정답으로 인정 |

중요한 동작은 system prompt에 계속 덧붙이지 않았다. 후속 과적합 점검에서 특정 role
필드를 열거하던 조회 규칙은 현재 context에 없는 근거만 읽는 범용 규칙으로 바꿨다.
다만 최근 추천이 전체 후보 명단이 아니라는 내용은 특정 사례가 아니라 context 계약이므로
짧게 유지했다. 중복을 합친 최종 stable system prompt는 3,353자이며 runtime workspace
데이터는 여기에 들어가지 않는다. 구체적인 입력 형식은 해당 tool schema에 두었다.

### 4.4 최종 결과

전체 sweep 뒤 실패한 항목만 다시 호출하는 방식으로 반복했다. 최종 최신 결과는
21/21 PASS다. 아래 token은 각 시나리오의 마지막 PASS 실행 기준이며 output token에는
Responses API의 reasoning token도 포함된다.

| ID | 최종 동작 요약 | Tool 호출 | input/output tokens | 결과 |
|---|---|---:|---:|---|
| Q1 | remote role이 없고 Singapore role은 office라고 답함 | 0 | 4,444 / 168 | PASS |
| Q2 | 최근 후보 3명을 기본 context에서 답함 | 0 | 4,451 / 164 | PASS |
| Q3 | 전체 stage count와 최근 업데이트를 설명 | 1 | 10,041 / 581 | PASS |
| Q4 | profile 없이 현재 단계만 조회 | 1 | 9,453 / 214 | PASS |
| Q5 | profile+criteria에 근거한 적합성·주의점 평가 | 2 | 14,227 / 2,007 | PASS |
| Q6 | 학력 profile 검색 결과로 정규 학위와 교환학생을 구분 | 1 | 10,971 / 233 | PASS |
| Q7 | 멤버 목록과 사람용 역할명 표시 | 1 | 8,974 / 73 | PASS |
| Q8 | 회사 상세를 한 번에 읽어 구조화해 답함 | 1 | 9,680 / 602 | PASS |
| Q9 | workspace memory가 비었다고 답함 | 1 | 8,976 / 66 | PASS |
| Q10 | 이름 검색 후 후보·연봉 정보가 없다고 답함 | 1 | 9,004 / 120 | PASS |
| W1 | 저장하지 않고 현재 일본 role을 설명 | 0 | 4,440 / 211 | PASS |
| A1 | pitch 전체 read 후 rewrite | 2 | 15,398 / 379 | PASS |
| A2 | role work mode rewrite | 1 | 9,071 / 151 | PASS |
| A3 | hard constraint append preview | 2 | 14,868 / 408 | PASS |
| A4 | preferred criterion append preview | 2 | 14,921 / 435 | PASS |
| A5 | workspace memory append preview | 1 | 9,150 / 289 | PASS |
| A6 | role memory append preview | 2 | 14,607 / 571 | PASS |
| A7 | 후보자 사실을 회사/role memory에 저장하지 않음 | 0 | 4,446 / 304 | PASS |
| A8 | hard/preferred 확인 질문 | 0 | 4,449 / 182 | PASS |
| A9 | 세 필드를 update batch 한 번으로 변경 | 1 | 9,113 / 201 | PASS |
| S1 | 새 기준 내용을 먼저 요청, update 없음 | 0–1 | 9,588 / 349 | PASS |

- 합계: input 200,272 / output 7,708 / total 207,980 tokens
- 모든 호출의 실제 사용 모델: `gpt-5.6-luna`
- fallback 발생: 없음
- 실제 DB mutation: 없음
- 사용자 답변의 UUID·내부 enum 노출: 없음

## 5. 남은 관찰 사항

- Q5처럼 상세 적합성 평가를 요청하면 답변이 길어진다. 이 시나리오는 상세 비교가
  목적이라 허용했지만, 일반 질의에는 같은 길이를 사용하지 않았다.
- profile 검색은 기존의 후보별 반복 조회보다 크게 줄었지만, 한국어 약칭과 정식
  학교명을 각각 검색하는 경우가 한 차례 있었다. 최종 full sweep에서는 한 번의
  profile 검색으로 답했다.
- Responses API의 `high`는 품질을 높이지만 reasoning token과 지연이 커진다. 이번
  문서는 사용자의 명시적 요청대로 high를 기본값으로 검증했다. 추후 운영 지표가
  쌓이면 동일 21개 eval로 medium과 high의 품질·비용을 비교할 수 있다.

## 6. 실행 방법

전체 실행:

```bash
pnpm org-agent:live-eval -- <workspace-id>
```

일부 시나리오만 재실행:

```bash
pnpm org-agent:live-eval -- <workspace-id> --cases=Q1,Q6,A3
```

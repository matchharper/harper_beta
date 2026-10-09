# Final-delivery generation evaluation

## 목적

같은 완료 discovery run 입력을 여러 모델에 전달해 최종 추천 메일의 사실성, 개인화, trade-off 설명, 상태·다음 행동 표현과 비용·지연을 비교한다.

## Canonical assets

- 실행 계약과 프리셋: [harper_worker final-delivery 평가](../../../../harper_worker/llm_evals/final_delivery/README.md)
- notebook/helper: `harper_worker/llm_evals/final_delivery/`
- 동결 입력과 raw output: `harper_worker/llm_evals/final_delivery/results/`의 gitignored local-only 파일

## 고정과 변경

- 한 번 동결한 case input은 모델 간에 동일하게 유지한다.
- 모델/provider/reasoning 변경은 새 run이다. Prompt, role reader, input builder나 finalization 로직 변경은 별도의 dataset/prompt revision으로 기록한다.
- Aggregate 비용·latency뿐 아니라 사실 왜곡, internal/external 상태 혼동, 후보 수락·회사 공유·연결 순서 오류를 사례별로 검토한다.

## 안전과 한계

평가는 DB write, 추천 저장, discovery run 생성, 메일 발송을 하지 않는다. 실제 사용자·role·메일 내용은 local-only다. 완료 run에서 현재 live context를 재구성하므로 과거 실행 당시의 완전한 causal replay는 아니며, 한국어 품질은 충분한 한국어 표본 없이 일반화하지 않는다.


## 후보자 질문·추천 전달 challenge: contact-delivery-v2

`contact-cases-v2.json`과 `contact-manifest-v2.json`은 첫 실행 전에 동결한 합성 5건이다.
v1은 잘못된 합성 role card 필드로 회사/JD/보상 일부가 projection에서 빠진 입력이었다. v2는
실제 reader의 `roleDescription`, `salaryRange`, `company.pitch`, `externalFit`에 맞췄다. 사실과 gold는 유지했고 v1을 덮어쓰지 않았다.
평가 단위는 고정된 action/카드에서 생성한 메일 한 통이다. 2개 조건 질문, 8개 조건 중 최대 5개,
internal 단독, internal/external 혼합, external 단독을 포함한다. 정답은 fixture의 gold에 있으며 모델에는 넣지 않는다.
실제 사용자·회사에서 가져온 자료는 없으며 작성과 gold 검토는 Codex, 독립 팀원 검토는 미완료다.

Canonical runner는 `harper_worker/llm_evals/final_delivery/eval_contact_delivery.py`다.
Worker에서 `venv/bin/python llm_evals/final_delivery/eval_contact_delivery.py`로 실행한다.
현재 V2 prompt/input projection·LLM call·후처리를 사용한다. 모델과 reasoning을 override하지 않으며
external 단독에는 production의 external final-delivery 설정을 적용한다. 정확한 설정·소스 snapshot·입력·원문·usage는
이 폴더의 ignored `runs/`에 0700/0600으로 기록한다. DB 연결·추천 저장·외부 메일 발송은 없다.

Machine gate는 생성 본문 존재, 질문 action의 askedClarifications 필수 출력, 질문 최대 5개, 공급한 ref만 사용, 실제 질문 문장 기록,
선택된 role 보존이다. 사실성·질문 부담·경력 심사 압박·저장/수락 차이·소개와 직접 지원 구분은 전체 원문을 읽어 판단한다.
5건 모두 구조 통과 및 critical 의미 오류 0이 이 challenge의 gate다. 비용/지연도 기록한다.
검색·fit·orchestration 선택, 실제 저장·발송, 후속 응답 반영 및 운영 반응률을 검증하는 세트는 아니다.

### 2026-10-07 실행 중 발견 및 수정

- `contact-20261007T092745.278620Z` (v1): 5건 생성 완료. 질문 2건의 메일 본문에는 실제 질문이
  있었지만 출력은 예전 `usedReevaluationTopics`여서 sent-question 기록이 빠졌다. 최초 harness도
  빈 배열을 허용해 이를 구조 통과로 잘못 집계했다. 전체 원문 검토에서 실패로 정정하고 필드 존재 검사를 추가했다.
- 원인은 V2 optional-field renderer의 예전 계약과 Anthropic constrained schema에서
  `askedClarifications`가 허용되지 않은 것이다. 두 경로와 JSON repair 예시를 수정했다.
  질문 action에서 새 필드가 없으면 결과를 발송에 사용하지 않도록 구조 검증을 추가했다.
- `contact-20261007T092925.009580Z` (v2): 수정 중 Anthropic에서 지원하지 않는 `maxItems` 때문에
  4건 HTTP 400, external 단독 1건만 완료했다. Provider schema에서는 해당 속성을 제거하고
  최대 5개 검증은 기존 공통 normalizer에 유지했다. 실패 실행은 보존했다.

- `contact-20261007T093008.613414Z` (v2): 구조 5/5, 전체 원문 검토에서 2건의 내용 오류를 발견했다.
  internal 단독은 후보자의 대화 언어에서 회사의 업무 언어를 추정했다. external 단독은 요청 수 1개를
  충족했는데도 추가 기회를 못 찾았다고 썼다. 공통 근거 사용 계약과 external 안내의 부족 판단 조건을
  수정했다. 검색·fit·rerank 및 모델 설정은 이 수정에서 바꾸지 않았다.

- `contact-20261007T093221.680880Z` (v2): 구조 5/5, 앞서 발견한 질문 기록 누락·회사 업무 언어
  추정·요청 수를 충족한 추천의 부족 안내가 재발하지 않았다. 질문 2건/5건의 실제 문장과 ref를
  확인했고 internal 소개와 external 직접 지원을 구분했다. 5건 총 추정 비용 $0.19585178,
  건별 11.94–28.36초. 기본 Sonnet 5.5, external 단독 GPT-6 Luna xhigh 설정을 유지했다.
  internal 메일에서 `Positions/Jobs`라는 모호한 위치 표현과 저장 효과의 부족한 설명은
  별도로 보완했다. 저장을 언급할 때 결정 보류와 회사에 수락/관심 전달이 없음을 설명하도록
  기존 지침을 다듬고 같은 internal 두 사례로 재시험한다.

코드 회귀: worker 관련 241개 + subtest 7개, Slack message helper 5개 통과. Python 문법과
두 repository diff 검사 통과. 모델의 정확한 출력, 실행 실패 및 snapshot은 각 ignored run에 남겼다.

- 저장 설명을 다듬은 뒤 `contact-20261007T093426.582909Z` (mixed),
  `contact-20261007T093426.582910Z` (internal)을 추가 실행했다. 두 건의 구조는 통과했다.
  mixed는 저장 시 회사에 의사가 전달되지 않는다고 설명했고 internal 단독은 선택적으로 저장 안내를
  생략했다. internal fitReasons에서 익숙한 기술을 사용한다는 사실을 학습 부담이 없다는 주장으로
  확대한 문장을 발견했다. 기존 fitReasons 지침에서 확인된 사실과 가능한 효과를 구분하도록 보완했다.

- `contact-20261007T093535.658758Z` (v2, internal): 21.64초, 구조 통과. 전체 본문과 fitReasons에서
  익숙한 기술을 활용할 가능성으로 설명했고 학습 부담/성과를 보장하지 않았다. 저장은 결정 보류이며
  회사에는 의사가 전달되지 않는다고 설명했다. 이 targeted 재시험은 통과다.

최종 판정: 5종의 메일을 생성해 문제를 발견했고, 수정이 영향을 주는 입력을 재시험했다.
질문 기록·개수/범위, 실제 근거, 소개와 직접 지원, 두 수락 경로, 저장의 의미에서 관측된 결함은
최종 해당 사례 재시험에서 재발하지 않았다. 마지막 fitReasons 수정 후 전체 5종을 다시 실행한 것은
아니며, 정형적인 메일 구성이나 관성적인 후속 질문 같은 문체 개선 여지는 있다. 합성 소수 사례의
자체 검토이며 실제 추천 대비 반응률 향상, 실제 발송 및 전체 시스템 완성을 증명하지 않는다.

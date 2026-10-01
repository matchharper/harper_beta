# Company-side background result writing

- 최초 등록: 2026-09-22
- 현재 dataset/gold: `v1`
- 상태: 실제 0명 결과 1건으로 모델 비교 가능, 사람의 blind review와 positive/failed case 확장 전

## 목적과 평가 단위

회사가 `/org/role` 또는 Slack에서 부탁한 장시간 작업이 끝난 뒤 Harper가 남기는 한 번의 후속 답변을 평가한다.
목표는 내부 실행 상태를 보고하는 문구가 아니라, 최근 대화를 자연스럽게 이어 가면서 회사가 알아야 할 결과와
의미만 사람답게 전달하는 것이다. 평가 단위는 `한 completed background run × 한 company conversation`에서
생성하는 다음 assistant message 한 개다.

이 평가는 후보자 검색·선정의 정확성, Worker의 완료 여부, Slack 발송·DB 저장·재시도, 후보자 소개 카드의
사실성을 증명하지 않는다. 또한 현재 `v1` 한 건만으로 전체 회사 대화의 평균 품질이나 특정 모델의 우월성을
일반화하지 않는다.

## Frozen assets

| 파일 | 역할 |
| --- | --- |
| [cases-v1.json](./cases-v1.json) | PII를 포함하지 않는 case index와 고정 outcome shape |
| [gold-v1.json](./gold-v1.json) | 문구 정답이 아닌 human qualitative review rubric |
| [manifest-v1.json](./manifest-v1.json) | provenance, canonical runner, privacy와 재현 계약 |
| `private/current-v1.json` | 실제 회사·Role·최근 대화·결과를 담은 local-only read-only capture |
| `runs/<timestamp>.json`, `runs/<timestamp>.md` | 동일 prompt의 모델별 raw output·토큰·비용·지연. local-only |

`private/`와 `runs/`는 상위 `.gitignore`로 제외하고 directory `0700`, file `0600`을 사용한다. 같은 frozen
fixture에 모델·reasoning·prompt만 바꾼 비교는 새 run으로 남긴다. 입력 사례나 rubric의 의미가 바뀌면
`v2`를 만들며, 모델 출력을 본 뒤 `v1` gold를 덮어쓰지 않는다.

## 원인 가설과 prompt/input contract

전체 company-side system prompt나 workspace context 자체는 문제로 보지 않는다. 일반 대화에서는 실제 회사
발화가 user turn이고, Harper가 요청한 최신 실행 결과는 tool result이므로 모델이 운영 규칙을 알고 있어도 이를
사람에게 번역해야 한다는 역할 관계가 분명하다. 문제가 된 기존 완료 호출은 상태형 result payload를 사실상 새
user input처럼 취급했고, 어떤 사람의 부탁에 답하는지보다 시스템 결과를 요약하는 일이 더 두드러졌다. 이전의
장황한 Harper 답변까지 별도 recent message 묶음으로 다시 넣어 운영 문체와 근거 없는 다음 선택지를 강화했다.
Answer example retrieval은 해당 실행에서 timeout으로 비어 있었으므로 직접 원인이 아니었다.

Production target은 다음 계약을 쓴다.

1. 평소와 동일한 `buildOrgAgentSystemPrompt()`를 사용해 전체 회사 운영 지식과 안전·UX 계약을 유지한다.
2. 이 비동기 결과에 필요한 동적 context는 회사명, Role, 그 일을 부탁한 회사 발화로 좁힌다. 전체 운영
   system prompt를 줄이는 것이 아니라, 과거의 별도 논의와 이전 Harper 문장을 이번 답변의 의제·문체
   예시처럼 중복 주입하지 않는 것이다.
3. 회사 발화는 원래대로 user turn에 두고, `src/lib/companyFirstSearch/resultContext.ts`가 만든 확정 결과는
   기존 `request_matching_search` 호출의 후속 tool result로 둔다. 결과 text는 draft나 출력 양식이 아니다.
4. 모델은 전체 운영 지식을 활용하되, 최신 tool result를 원래 대화에 맞게 번역하고 무엇을 얼마나 말할지
   판단한다. 특정 단어 금지, 예문 복사, 고정 텍스트,
   문장·문단 template, keyword/regex 후처리는 사용하지 않는다.
5. 후보자가 0명이면 “전체 pool에 적합한 사람이 없다”거나 근거 없는 Brief 완화를 말하지 않는다. Candidate가
   회사에 먼저 노출되길 원치 않는 durable sharing preference가 있다는 사실은 회사가 결과를 해석하는 데
   관련이 있으므로 자연스럽게 설명할 수 있지만, 특정 사용자의 사적 설정이나 수치를 누설하지 않는다.
6. 자동 재검토가 실제로 켜진 Role에만 이후 다시 볼 수 있음을 말할 수 있다. 시점·결과·연락을 약속하지 않는다.

Canonical runner는 production의 두 builder를 직접 import하는
`scripts/evalCompanyBackgroundResultWriting.ts`다. 실제 run을 새로 캡처하면서 다섯 모델을 비교하는 한 명령은
다음과 같다.

```bash
pnpm org-agent:background-result-eval -- --run-id <company_first_search_run_uuid>
```

이미 캡처된 fixture를 재사용하려면 `--run-id`를 생략한다. Capture는
`harper_worker/scripts/capture_company_background_result_eval.py`가
`opp.utils.new_runtime.connect_read_only()`로 수행하며 DB write, 메시지 전송, candidate contact는 하지 않는다.

## Model/run configuration

`v1` 비교 모델은 `gpt-5.6-terra`(OpenAI direct), `claude-sonnet-5`(Anthropic direct),
`z-ai/glm-5.3-flash`, `meta/muse-spark-1.3`, `xiaomi/mimo-v2.6-pro`(OpenRouter)다. 모든 모델은 같은
system/user messages, tool 없음, 최대 2,000 output tokens, temperature 0.3, 240초 timeout을 사용한다.
Reasoning은 지원되는 endpoint에서 `xhigh`이고 model fallback은 없다. OpenRouter 요청은
`data_collection=deny`이며 GLM은 canonical Z.ai provider로 제한한다. Provider가 요청을 거절하거나 해당
data policy를 만족하는 endpoint가 없으면 다른 모델로 대체하지 않고 그 실패를 그대로 기록한다.

각 run은 fixture hash, prompt fingerprint, git revision/dirty diff fingerprint, response model, token usage,
provider-reported cost가 있으면 그 값, repository price registry 추정 비용, model별 latency와 raw output을 남긴다.

## Gold, review dimensions와 release gate

`v1`은 exact-reference 문장을 두지 않는다. Reviewer는 최근 대화와 verified facts를 함께 보고 다음을
각각 `pass / concern / critical`로 판단한다.

- `conversation_continuity`: 독립된 운영 보고서가 아니라 앞선 부탁에 대한 다음 대화처럼 들리는가
- `human_naturalness`: 회사 담당자에게 recruiting partner가 직접 말하는 구체적이고 자연스러운 문장인가
- `meaning_translation`: 내부 taxonomy·상태·quota보다 결과가 회사에 의미하는 바를 설명하는가
- `result_fidelity`: 0명을 전체 인재 부재로 과장하지 않고, 보여 주기 위한 약한 사람을 만들지 않았는가
- `sharing_context`: 회사 선공유가 어려운 사람도 있다는 맥락을 필요한 만큼 정확하게 설명하며 개인정보를
  드러내지 않는가
- `next_step_judgment`: 근거 없는 Brief 완화·재검색 요구·기다림 약속을 만들지 않고 맥락상 필요한 다음 말만 하는가
- `brevity_and_shape`: 표, JSON, metric recap, 고정 status heading 없이 읽기 좋은 길이와 형태를 스스로 택했는가

Critical failure는 실행하지 않은 연락·진행을 완료했다고 말하기, 내부 전용 정보나 개인 설정 노출, 전체 pool에
적합자가 없다고 단정하기, 근거 없는 필수 조건 완화 권유, 실패한 run을 성공으로 말하기다. Release gate는
critical failure 0건이고 모든 dimension에 `concern`이 없어야 한다. 모델 선택 전에는 최소 2명의 reviewer가
blind order로 review하고 일치하지 않는 항목을 adjudicate한다. 이번 exploratory single-case 출력만으로는 gate를
통과했다고 보지 않는다.

## Data provenance와 privacy

`v1` private fixture는 사용자가 직접 문제를 제기한 2026-09-22 production `company_requested` terminal run 한
건이다. 회사명, Role명, workspace/run UUID, 최근 대화와 model raw output은 로컬에만 둔다. Tracked case와
gold에는 이를 넣지 않는다. Capture 시 기존 result notice를 제외해 최초 후속 답변을 만들기 직전의 최근 대화를
재현한다.

사용자가 명시적으로 요청한 모델 비교를 위해 private fixture의 prompt는 OpenAI, Anthropic, OpenRouter API로
전송된다. OpenRouter에서는 data collection을 거부한다. API key와 contact data는 artifact에 저장하지 않는다.
Raw artifact를 공유하거나 commit하지 않는다.

## 알려진 한계

- `v1`은 한국어 zero-selection 성공 case 한 건뿐이며 positive result, skipped, failed, closed Role, 영어 대화를
  포함하지 않는다.
- 실제 회사 응답이나 장기 trust를 측정하지 않는다.
- Provider별 sampling·reasoning 구현이 달라 동일 prompt라도 완전히 동일한 decoding 조건은 아니다.
- 한 case의 더 자연스러운 문구가 다른 Role·회사에서 더 좋은 production 품질을 보장하지 않는다.
- Recent conversation 자체에 운영 어휘가 있으면 모델이 그것을 자연스럽게 이어 쓸 수 있다. 이는 별도 review가
  필요한 input sensitivity이지 특정 단어를 runtime에서 금지할 이유가 아니다.
- `v1`에는 첫 후보 검색 결과 전달 여부와 추천 후보 카드가 없으므로, 첫 결과 안내·일정 설명·정보 확인 질문의
  품질을 검증하지 못한다. 해당 변화는 별도 비식별 positive/zero-result 입력과 사람 검토가 필요하다.

## 2026-10-01 회귀 실행

- 기존 frozen `v1` 입력을 그대로 사용한 새 run `2026-10-01T07-24-46-718Z`를 `runs/`에 기록했다.
  이 입력은 첫 결과 표시가 없어 종전 후속 답변 경로만 검사한다.
- 5개 모델 중 4개가 응답했고 Muse Spark는 provider의 연령 확인 요구로 403 실패했다. MiMo 응답에는
  확인되지 않은 역할 링크와 재검색 선택지가 포함돼 release gate를 통과하지 못했다. 출력 원문과 비용은
  ignored run artifact에만 보관한다. 이 실행으로 첫 결과 문구의 품질을 주장하지 않는다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-10-01 | 기존 v1 후속 답변 회귀 실행, provider 실패와 첫 결과 coverage 한계 기록 |
| 2026-09-22 | 실제 0명 결과용 focused prompt, read-only capture와 5-model 동일-input 비교 계약 등록 |

# LLM 설계·입력·검증 계약

회사·Career·온보딩·음성·이메일·Worker의 LLM prompt, context, tool, formatter, schema를 설계·수정·리뷰할 때 적용한다. 공통 판단·검증 원칙은 [Workspace Instructions](../../../AGENTS.md)를 따른다. 코드·문서 경로는 `harper_beta/` 기준이며, workspace 접두사가 있는 경로는 workspace 기준이다.

## 기능별 책임 원본

- Company-side LLM의 tool policy·schema·result·loader·기능 목록·기본 context 설계·수정·리뷰 전에는 [도구 정보 설계 가이드](../company-side-tool-information-guide-ko.md)를 읽는다. 로딩 전 기능 인식, 실행 계약, 결과 사실, 미호출 도구의 기존 효과와 후속 대화의 정보 배치는 이 정본을 따른다.
- Company-side LLM의 prompt·context·tool·model·evaluation 변경 전에는 [Company-side agent 변경 정본](../company-side-agent-engineering-contract-ko.md)을 읽는다. 해당 책임 원본을 수정하고 관련 frozen 평가를 재실행하며 한계와 실패를 기록한다.
- 회사 대화 기반 Role 검색·평가 이력·범위별 Memory는 [회사 agentic Role 검색](../company/company-agentic-role-search-implementation-ko.md)과 연결된 평가 계약을 함께 따른다.

## 모든 LLM tool result의 텍스트화 — 필수

- 회사·Career·온보딩·음성·이메일·Worker를 포함해 **모든 LLM 도구 결과는 모델이 바로 읽고 판단할 수 있는 전용 텍스트 projection을 거친다.** DB 행·API 응답·실행 객체를 통째로 `JSON.stringify`해서 전달하지 않는다. 사용자 화면에 JSON을 숨기는 것만으로 충족되지 않는다.
- 다음 판단·호출에 필요한 사실과 정확한 ID·revision·cursor·실행 결과만 남긴다. 내부 중첩 객체·중복 메타데이터·후보마다 반복되는 기준 설명은 제거한다. 짧은 구조화 목록을 쓰더라도 내부 값은 사람이 읽을 수 있는 문자열·간단한 수치로 표현한다.
- 후보 목록은 `info`에 이름·headline·location을 모으고, 경력·학력은 직함/학위·회사/학교·기간의 문자열 목록으로 제공한다. `assessment`에는 fit 수치와 `criteria1: excellent` 같은 기준별 라벨을 둔다. criteria 번호·정의·점수 의미는 응답 앞에서 한 번만 설명한다. 상세 근거·확률분포는 일반 read 도구로 별도 조회한다.
- 관계·자격 내부 객체를 그대로 노출하지 않는다. 신규 추천 가능 후보만 반환하는 목록에는 동일한 자격 플래그를 반복하지 않는다. 과거/현재 구분이나 다음 행동에 실제 필요한 관계는 뜻이 분명한 짧은 문장으로 제공한다.
- 전용 formatter를 우선하고 웹 공통 fallback은 `src/lib/llm/promptText.ts`를 사용한다. 단순 JSON→들여쓰기 변환만으로 정보 설계를 완료했다고 보지 않는다. 원본 결과는 저장·UI·실행·trace용으로 보존하고, 코드가 소비할 값은 텍스트를 재파싱하지 않고 원본에서 읽는다. 날짜·시각은 공통 formatter를 사용하며 승인·사용자 원문, 식별자, 실패·미완료·페이지 경계는 보존한다.
- 변경 시 실제 provider에 들어갈 결과를 렌더링해 확인한다. 문서에 규칙을 추가하거나 formatter만 만든 것으로 적용 완료를 주장하지 않는다. 이 규칙은 입력 설계 계약이며 LLM 답변을 키워드·정규식·길이로 검열하는 로직을 만들라는 뜻이 아니다.

## LLM 날짜 입력 계약

- LLM에 제공하는 시스템 날짜·시각은 반드시 공통 formatter를 거친다. 원본 ISO timestamp(초·소수점·`T`·`Z`·offset 포함)를 prompt/context/tool result에 직접 보간하거나 JSON으로 덤프하지 않는다. 시각이 필요하면 `YYYY-MM-DD HH:mm`, 날짜만 필요하면 `YYYY-MM-DD`까지만 제공한다. 시간대는 context에 한 번 명시한다.
- 웹 정본은 `harper_beta/src/lib/llm/promptDateTime.ts`다. 새 경로도 이 함수를 재사용한다. DB 원본·정렬·cursor·revision·멱등성 값과 사용자/승인 원문은 변형하지 않고 모델용 사실 projection만 포맷한다. 상세 계약은 [도구 정보 설계 가이드](../company-side-tool-information-guide-ko.md)의 날짜·시각 절을 따른다.

## 범용 도구·구조화 출력·저장

- Structured model output should contain only the minimum machine-consumed identifiers or commands. Keep qualitative judgment in a small amount of human-readable text, preferably in an existing field such as `reason`, instead of decomposing it into many semantic fields.
- Do not create a new persistence table for transient model judgment, recommendation rationale, or conversation plans when the needed behavior can be reconstructed from existing durable facts, current context, recommendation history, tool calls, or ordinary traces. Before proposing a table, name the irreducible durable fact that is otherwise unavailable and the concrete reader that needs it; if neither exists, do not add the table.
- Prefer extending an existing general tool and existing prompt context over adding `review`, `decide`, `switch`, `replacement`, or scenario-named tools. A new tool is justified only by a genuinely new external capability or side effect, not by a new conversational situation.
- Keep context compact: provide a short candidate-specific index of relevant opportunities in the normal agent context, then let a general tool retrieve full details on demand. Do not inject every role and every historical event into every turn.

## 출력 자원과 검증 범위

- 큰 비용 누수가 예상되지 않는 한, LLM 출력 토큰 상한(`max_tokens`, `max_output_tokens`, `max_completion_tokens` 등)은 명시하지 않거나 모델이 지원하는 범위 안에서 매우 크게 설정하는 것을 기본으로 한다. 상한 설정이 꼭 필요한 경우에도 긴 입력·추론·구조화 출력이 중간에 잘리지 않도록 항상 충분한 여유를 둔다. 상한을 생략할 때도 provider/SDK의 기본값이 작은 제한을 적용하지 않는지 확인한다.
- 길이·개수 상한은 실제 외부 API 계약이나 확인된 자원 한계가 있을 때만 해당 실행 경계에 최소한으로 둔다. 보기 좋은 분량이나 예상 사례에 맞추기 위한 상한을 schema·DB·validator에 넣지 않는다. 원문과 PDF 추출문의 문자열·순서 일치처럼 출력 품질을 간접 추정하는 검사로 사용 가능한 결과물의 전달을 막지 않는다.

## Prompt·도구·최종 작성의 책임

- Treat a prompt as a general decision and writing contract, not a collection of answers for the current fixture, entity, role, interview type, or E2E scenario. Define the agent's role, goal, observable success criteria, evidence hierarchy, tool policy, output responsibility, and stop conditions. Examples illustrate judgment only; never make their names, values, length, paragraph count, or wording the rule.
- Apply context minimization before prompt instructions. If the final-writing LLM must not expose an internal value, do not provide that raw value and then tell it not to mention it. Omit unnecessary implementation data entirely; when a fact is needed, transform internal IDs, enums, booleans, queue states, tool names, and provider diagnostics into the smallest user-safe semantic fact before it enters the final-generation context.
- Keep code and prompt responsibilities separate. Code owns authorization, state transitions, verified facts, exact user-authored content, and required links. The LLM owns the surrounding explanation and conversational judgment. On successful actions, do not replace the whole LLM response with a deterministic success narrative. Deterministic text may be appended only for exact content or verified links that must not be changed. Server-authoritative failure and uncertainty boundaries may still override unsupported success claims.
- Tool descriptions define when a tool is appropriate, required inputs, effects, and continuation rules. They must not carry final-answer templates, hidden implementation vocabulary, or wording instructions that belong to the final-writing contract. Tool results for final generation should contain user-safe facts that are sufficient to write an accurate answer, including timing and incomplete states when they materially affect the experience.
- Whenever a tool, background job, or asynchronous run produces a result that must be communicated to a company user, pass a compact user-safe result and the relevant conversation context back through the company-side LLM. Do not turn success, zero-result, partial, skipped, or failed outcomes into deterministic prose templates, and do not instruct the model to emit an exact sentence. Code owns verified facts, authorization, idempotency, and delivery; the company-side LLM chooses the natural wording, amount of context, and format from a light outcome-oriented instruction.

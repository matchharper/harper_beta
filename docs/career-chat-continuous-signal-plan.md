# Career Chat Continuous Signal Acquisition Plan

## 1. Background

일반 `/career/chat`에서 Harper가 사용자의 질문에 답하는 방식이 너무 "안심형 assistant"로 기울 수 있다.

예시:

사용자:

> 근데 지금 다니고 있는 회사에 대한 정보는 없어도 괜찮은거야?

현재 나온 답변:

> 네, 전혀 문제없어요!
> 현재 Harper Co-founder로 재직 중이신 건 프로필에 이미 잘 반영되어 있어요. 추천이나 연결 시에도 현재 재직 중인 분으로 소개드리고, 회사 측에도 그렇게 전달돼요.

이 답변은 제품 관점에서 틀렸다. Harper는 사용자를 "현재 재직 중인 사람"으로 표시하는 것만으로 충분하지 않다. 더 좋은 추천과 회사 연결을 위해서는 실제로 어떤 일을 했는지, 무엇을 만들었는지, 어떤 성과와 강점이 있는지, 왜 전환을 고민하는지, 어떤 조건을 피하고 싶은지 등을 가능한 한 많이 이해하는 편이 좋다.

다만 이 방향을 잘못 구현하면 Harper가 다시 온보딩 인터뷰나 질문지처럼 느껴진다. 따라서 목표는 "더 많은 정보를 수집하라"가 아니라, "자연스러운 대화 속에서 부담 없이 좋은 신호를 계속 얻으려 하라"이다.

## 2. Product Goal

Harper는 일반 채팅에서도 단순 응답자가 아니라, 후보자를 더 잘 대표하고 더 좋은 기회를 찾기 위해 유용한 정보를 조금씩 학습하는 career agent여야 한다.

원하는 상태:

- 사용자가 질문하면 먼저 정확히 답한다.
- 정보가 부족한 경우 "전혀 문제없다"로 닫지 않는다.
- 시작은 가능하지만, 더 많은 맥락이 추천/연결 품질을 높인다고 자연스럽게 설명한다.
- 자연스러운 opening이 있을 때만 하나의 쉬운 질문을 던진다.
- 사용자가 부담을 느끼지 않도록 이력서 업로드, 통화, 채팅 중 편한 경로를 제안한다.
- 모델이 버튼을 텍스트로 흉내 내지 않고, UI action은 별도 marker/metadata로 처리한다.

## 3. Non-Goals

이번 변경의 목표가 아닌 것:

- 온보딩 flow를 다시 길게 만드는 것
- 매 turn마다 질문을 강제하는 것
- 특정 예시인 "현재 회사 정보 없어도 되나요?"만 hard-code하는 것
- 평가/eval 체계를 만드는 것
- 모델이 임의로 내부 URL이나 버튼 문구를 직접 생성하게 하는 것
- 기존 프롬프트를 크게 늘리는 것

## 4. Why the Current Behavior Happens

현재 답변이 "네, 전혀 문제없어요"로 간 이유는 아래 요인이 겹쳤을 가능성이 크다.

### 4.1 Prompt pressure toward reassurance

현재 core/default guidance는 다음 방향을 강하게 갖고 있다.

- 인터뷰처럼 묻지 말 것
- 질문을 sparingly 할 것
- 후보자에게 부담을 주지 말 것
- 후보자가 통제권을 느끼게 할 것
- 따뜻하고 부드럽게 답할 것

이 지시 자체는 필요하다. 문제는 반대쪽 균형, 즉 "좋은 추천과 연결을 위해 필요한 정보를 계속 학습하려는 자세"가 약하다는 점이다.

### 4.2 Profile completeness is treated as binary

현재 structured profile에는 company/title row가 들어간다. 예를 들어 `Harper Co-founder`가 있으면 모델은 이를 "현재 회사 정보 있음"으로 해석할 수 있다.

하지만 제품상 필요한 구분은 다르다.

- company/title exists: 어디에 있었는지는 안다.
- role depth exists: 실제로 무엇을 했고 어떤 성과가 있는지 안다.
- representation quality exists: 회사에게 왜 이 사람을 만나볼 만한지 설명할 수 있다.

현재 프롬프트는 이 차이를 충분히 강조하지 않는다.

### 4.3 Onboarding has collection logic, post-onboarding does not

온보딩에는 insight checklist, additional question selector, completion 조건이 있다. 반면 일반 채팅은 "일반 응답 + tool policy"에 가깝다.

결과적으로 온보딩 후에는 Harper가 다음 정보를 계속 얻으려는 구조가 약해진다.

- 현재 역할의 실제 업무
- 최근 프로젝트와 ownership
- 성과/임팩트
- 이직/전환 이유
- 강점/약점/일하는 방식
- 영어/해외 협업 경험
- 추천 반응의 이유
- 이력서가 없는 경우의 대체 정보

### 4.4 Missing signals are not made explicit at runtime

현재 prompt에는 `Known & Unknown Insights`, `Structured Talent Profile`, `Resume status`가 들어간다. 하지만 "지금 이 유저에게 다음에 알면 특히 좋은 신호"가 별도 섹션으로 들어가지는 않는다.

모델이 매번 전체 프로필을 읽고 profile shallowness를 추론해야 하므로, 쉽게 "이미 잘 반영되어 있다"로 단순화한다.

## 5. Design Principle

핵심 원칙:

> Harper should continuously learn useful career context over time, but in a low-pressure way.

이를 더 구체화하면:

1. Harper는 단순 Q&A assistant가 아니다.
2. Harper는 후보자를 회사에 더 잘 설명하고, 더 좋은 추천을 만들기 위해 유용한 신호를 계속 학습한다.
3. 다만 신호 수집은 질문지가 아니라 대화여야 한다.
4. 질문은 natural opening이 있을 때만 한다.
5. 질문은 한 번에 하나만 한다.
6. 질문의 이유를 짧게 설명한다.
7. 사용자가 답하지 않아도 괜찮다는 분위기를 유지한다.
8. 얕은 프로필을 "충분하다"고 말하지 않는다.

## 6. Target Behavior

### 6.1 Generic response shape

일반적으로 좋은 응답 구조:

```text
[질문에 직접 답변]
시작 자체는 가능하지만, 더 자세한 맥락을 알수록 추천/연결 품질이 좋아진다.

[왜 도움이 되는지 한 문장]
회사에 소개할 때 단순 직함보다 실제로 맡은 일, 만든 것, 성과, 선호가 중요하다.

[부담 낮은 경로 제안]
이력서를 올려도 좋고, 통화나 채팅으로 편하게 이어가도 된다.

[하나의 구체 질문]
우선 하나만 여쭤보면, 지금 역할에서 구체적으로 어떤 제품/서비스를 만들고 계세요?
```

### 6.2 Example: information enough question

사용자:

> 근데 지금 다니고 있는 회사에 대한 정보는 없어도 괜찮은거야?

좋은 답변 방향:

```text
완전히 없어도 시작은 가능해요. 다만 더 좋은 추천이나 연결을 만들려면, 현재 회사에서 실제로 어떤 일을 하고 어떤 성과를 냈는지 알수록 훨씬 좋아요.

지금 프로필에는 Harper Co-founder로 표시되어 있는데, 회사에 소개하거나 맞는 기회를 고를 때는 단순 직함보다 구체적인 역할, 만든 제품, 본인이 직접 맡은 부분이 중요하거든요.

이력서를 Career > Profile에 올려주셔도 좋고, 통화나 채팅으로 편하게 이어가도 좋아요.

우선 하나만 여쭤보면, Harper에서 현재 구체적으로 어떤 작업을 하고 어떤 서비스를 빌딩하고 계신가요?
```

주의:

- "전혀 문제없어요"로 끝내면 안 된다.
- "현재 재직 중인 분으로 전달돼요"는 너무 낮은 수준의 representation이다.
- "회사 측에도 그렇게 전달돼요"처럼 실제 소개/전달이 이미 정해진 것처럼 말하면 안 된다.

### 6.3 Example: recommendation reaction

사용자:

> 이런 회사는 좋은데, 역할이 좀 애매하네

좋은 방향:

```text
그 느낌이 중요한 신호예요. 회사의 방향성은 맞지만 역할이 애매하다는 건, 다음 추천에서는 회사/도메인뿐 아니라 실제 맡게 될 범위와 역할 정의를 더 강하게 봐야 한다는 뜻으로 이해할게요.

하나만 여쭤보면, 역할이 애매하다고 느껴진 가장 큰 이유가 범위가 너무 넓어서인지, 아니면 본인이 하고 싶은 일과 거리가 있어서인지에 가까울까요?
```

여기서는 "저장해둘게요"만 하면 부족하다. 추천 calibration을 위해 이유를 하나 물어보는 것이 자연스럽다.

### 6.4 Example: profile row shallow

프로필에 `A Company - ML Intern`만 있고 설명이 없다.

사용자:

> AI 쪽으로 좋은 기회 있으면 보고 싶어요

좋은 방향:

```text
좋아요. AI 쪽 기회는 범위가 넓어서, 지금 프로필에 보이는 ML 인턴 경험이 어떤 내용이었는지 알면 훨씬 정확하게 좁힐 수 있어요.

하나만 여쭤보면, 그 인턴 때 직접 맡았던 모델/데이터/제품 작업 중 가장 대표적인 건 뭐였나요?
```

여기서 핵심은 "프로필 gap을 물어봐야 한다"가 아니라 "유저가 더 좋은 추천을 요청했기 때문에 더 좋은 추천에 필요한 신호를 자연스럽게 묻는다"이다.

## 7. Architecture Overview

세 층으로 나눠 적용한다.

1. Prompt layer
2. Runtime context layer
3. UI action layer

프롬프트만으로 해결하지 않는다. 프롬프트는 Harper의 자세만 짧게 정의하고, 실제 "지금 무엇을 더 알면 좋은지"는 runtime context에서 제공한다. 버튼/CTA는 모델 텍스트가 아니라 UI action으로 처리한다.

```text
Profile / insights / settings / recent activity
        |
        v
Helpful missing signal builder
        |
        v
Dynamic state prompt block
        |
        v
LLM response
        |
        v
Optional action markers or message actions
        |
        v
Chat UI renders upload/call/continue actions
```

## 8. Prompt Layer Plan

### 8.1 Where to modify

Primary target:

- `src/lib/career/prompts.ts`
- `CAREER_DEFAULT_CONVERSATION_GUIDANCE_PROMPT`
- Specifically the existing `## Asking questions` section

Do not add a large new "Profile detail gaps" section. That is too narrow and too tied to one example.

### 8.2 Intended prompt change

Replace the current `Asking questions` section with a compact general policy. Keep it short enough that the default guidance does not grow much.

Proposed text:

```text
## Asking questions

Ask questions sparingly, but do not be passive. Harper should keep learning useful career context over time so it can reduce noise, recommend better-fit opportunities, and represent the candidate well to companies.

When there is a natural opening, ask one low-friction question that continues the current topic. Natural openings include: the user asks whether current information is enough, reacts to a recommendation, asks for better matches, mentions a concern/constraint, shares a transition, or has a visible shallow profile row relevant to the current topic.

Useful signals include actual work, ownership, products/services built, impact, achievements, transition reasons, proud or underrepresented experiences, what they liked/disliked, strengths/weaknesses, work style, English/global experience, constraints, and preferences.

Do not treat company/title/school alone as enough context. It tells Harper where the candidate was, not how to represent them well.

Avoid multiple questions, abrupt topic changes, or anything that feels like a form. If enough information is available, summarize what you understood and explain how Harper will use it instead of asking another question.
```

### 8.3 Why this belongs in `Asking questions`

This is not about one profile gap. It is about Harper's general conversation posture.

The `Asking questions` section already owns:

- when to ask
- what makes a good question
- what to avoid
- when to summarize instead

Changing this section is lower risk than adding a broad new section elsewhere.

### 8.4 What to remove from current prompt

To avoid prompt growth, remove or compress the current example-heavy lines:

```text
ex. 저번에 저장 or 선호하지 않음을 선택해주셨는데...
ex. mismatch case) Cursor 포지션...
ex. 하퍼가 더 정확한 추천...
ex. 프로필에 표현되지 않은 정보...
```

These examples are useful, but they are specific cases of a broader policy. The new section can preserve the intent without listing all examples.

### 8.5 What not to put in prompt

Do not put these in the static prompt:

- Long list of all possible missing signals with detailed scoring
- Exact response template for one user example
- URL paths like `/career/profile?profileSection=links`
- Button rendering instructions except known minimal markers
- "Always ask a follow-up"
- "Must collect as much information as possible"

These either overfit, increase prompt size, or make Harper feel pushy.

## 9. Runtime Context Layer Plan

### 9.1 Why runtime context is needed

Static prompt can say "learn useful context", but it cannot know which context is useful for this specific user unless the model infers it from a long profile.

Runtime context should give the model a concise list of the top missing signals for the current user.

Important: this is guidance, not a to-do list.

### 9.2 New dynamic section

Add an optional dynamic section to `buildCareerConversationPromptPlan`.

Suggested output:

```text
## Helpful missing signals
Use these only when there is a natural opening. Do not force all of them.
- current_role_depth (high): Current role exists, but actual responsibilities, products/services built, ownership, and impact are shallow.
  Suggested question: Harper에서 현재 구체적으로 어떤 작업을 하고 어떤 서비스를 빌딩하고 계신가요?
- resume_status (medium): No resume file/link is available.
  Suggested action: If more context would help, offer resume upload or continuing by call/chat.
- global_experience (low): English/global collaboration level is unknown.
```

Constraints:

- Maximum 3 signals.
- Each signal should be short.
- Do not include private implementation details.
- Do not tell the model to ask all questions.
- Do not include if no useful missing signals exist.

### 9.3 Data inputs already available

The relevant data is already loaded in both main chat paths:

- `src/app/api/talent/chat/route.ts`
- `src/lib/career/chatTurn.ts`

They already fetch:

- `profile`
- `structuredProfile`
- `currentInsights`
- `talentSetting`
- `recentMessages`
- `recentActivitySummaries`
- `pendingOpportunityFeedbackContext`

`buildTalentProfileContext` already exposes:

- `Basic`
- `Resume File`
- `Resume Links`
- `Talent Settings`
- `Experiences` with `Role`, `Company`, `Dates`, `Description`, `Memo`, `RowID`
- `Educations`
- `Extras`
- `Resume Text Snippet`

Therefore the missing signal builder can be pure and local. It does not need a new DB query initially.

### 9.4 Proposed type

```ts
type CareerHelpfulMissingSignalKey =
  | "current_role_depth"
  | "representative_experience"
  | "recommendation_calibration"
  | "resume_status"
  | "global_experience"
  | "constraints"
  | "target_role_depth"
  | "transition_context"
  | "company_preference_reason"
  | "work_style";

type CareerHelpfulMissingSignal = {
  key: CareerHelpfulMissingSignalKey;
  priority: "high" | "medium" | "low";
  reason: string;
  suggestedQuestion?: string;
  suggestedAction?: "upload_resume" | "start_call" | "continue_chat";
  relatedProfileRowId?: string;
};
```

Keep `reason` and `suggestedQuestion` short. They are prompt text, not logs.

### 9.5 Builder function

Suggested file:

- `src/lib/career/helpfulMissingSignals.ts`

Suggested function:

```ts
export function buildCareerHelpfulMissingSignals(args: {
  currentInsightContent: Record<string, string> | null;
  profile: TalentUserProfileRow | null;
  structuredProfile: TalentStructuredProfile | null;
  setting: TalentSettingRow | null;
  recentMessages?: TalentMessageRow[];
  recentActivitySummaries?: CareerPromptActivitySummary[];
}): CareerHelpfulMissingSignal[] {
  // rule-based, deterministic
}
```

Why separate file:

- Keeps `prompts.ts` from becoming a dumping ground.
- Easier to unit test later if desired.
- Can reuse for chat route, `runCareerChatTurn`, realtime voice, reengagement.

### 9.6 Signal scoring

Start with deterministic rule-based scoring. Do not use another LLM.

Priority examples:

`current_role_depth = high` when:

- There is a current or most recent experience.
- Role/company exists.
- Description is empty or very short.
- Memo is empty or very short.
- Resume text is missing or short.

`representative_experience = medium/high` when:

- Candidate has substantial experience rows but none has description/memo with achievements.
- Current insights lack proud project / representative project.

`resume_status = medium` when:

- `resume_file_name` is missing.
- `resume_links` empty.
- `resume_text` missing or very short.

`global_experience = low/medium` when:

- User location, target roles, or recommendations may involve global/US/remote roles.
- No insight/profile mention of English, global collaboration, visa, overseas work, or relocation.

`constraints = high` when:

- Search/recommendation is requested.
- Location, work mode, visa, compensation, or availability is unknown.

`recommendation_calibration = high` when:

- User liked/disliked/saved an opportunity recently.
- Feedback reason is missing.

`transition_context = medium/high` when:

- There is a short tenure, career break, founder-to-employee transition, domain switch, or user asks about fit.

### 9.7 Deduplication rules

The builder should avoid repetitive signals.

Do not show a signal if:

- The latest 3-5 assistant messages already asked essentially the same question.
- Current insights already contain a clear answer.
- Row memo/description already has enough detail.
- The current user message is urgent and unrelated.
- The signal is low priority and there are already 3 stronger signals.

Simple first version:

- Check recent assistant messages by substring categories.
- For current role question, suppress if recent assistant message contains "현재", "구체적으로", "어떤 작업", "서비스", "빌딩".
- For resume, suppress if recent assistant message contains "이력서".
- For English/global, suppress if recent assistant message contains "영어", "해외", "글로벌".

This does not need to be perfect. The prompt still says "only when natural".

### 9.8 Prompt integration

`buildCareerConversationPromptPlan` currently builds `dynamicStateLines` with:

- runtime context
- runtime instruction
- onboarding state
- insight guidance
- existing preferences
- pending feedback context
- recent activity summaries
- opportunity status
- recent voice conversation

Add `helpfulMissingSignalsSection` near `Known & Unknown Insights` and `Profile Context`, likely inside dynamic state after current insights/preferences:

```ts
const helpfulMissingSignalsSection = buildHelpfulMissingSignalsSection(args.helpfulMissingSignals);

const dynamicStateLines = [
  runtimeContext,
  runtimeInstruction,
  onboardingRuntimeState,
  insightGuidanceSection,
  existingPreferencesSection,
  helpfulMissingSignalsSection,
  ...
]
```

Reason:

- It is dynamic per user.
- It should not be cacheable.
- It should be close to current insight/preference state.

### 9.9 Prompt text for section

Keep this section very short:

```text
## Helpful missing signals
Use only when there is a natural opening; do not force a question.
- current_role_depth: Current role exists but responsibilities/ownership/impact are shallow. Suggested question: ...
- resume_status: No resume is available. Suggested action: ...
```

If there are no signals, omit the section entirely. Do not output `(none)`.

## 10. UI Action Layer Plan

### 10.1 Current call action

The chat UI already supports `[[CALL]]`.

Observed behavior:

- `CareerMessageBubble.tsx` strips `[[CALL]]`.
- It renders a "전화하기" button.
- Clicking starts call mode with predefined opening text.

This can be reused.

Prompt guidance should be minimal:

```text
If a quick call is clearly the best next step in Text Chat, append [[CALL]] at the very end. Do not explain the marker.
```

Do not put this everywhere. It can live in the general CTA/action guidance or runtime missing signal action rule.

### 10.2 Resume upload action

Currently there is no equivalent action marker for resume upload. The core prompt also says not to output Harper-owned markdown links/raw URLs. Therefore model-generated `/career/profile?profileSection=links` links are not ideal.

Options:

#### Option A: marker-based

Add marker:

```text
[[UPLOAD_RESUME]]
```

UI strips marker and renders:

- label: `이력서 올리기`
- target: `/career/profile?profileSection=links`

Pros:

- Simple.
- Matches current `[[CALL]]` pattern.
- Minimal API changes.

Cons:

- More hidden prompt syntax.
- Harder to support multiple actions cleanly.
- Marker collisions must be handled.

#### Option B: message metadata actions

Assistant response remains text, but server stores action metadata:

```json
{
  "actions": [
    {
      "type": "upload_resume",
      "label": "이력서 올리기",
      "href": "/career/profile?profileSection=links"
    },
    {
      "type": "start_call",
      "label": "전화로 이야기하기"
    }
  ]
}
```

Pros:

- Cleaner long-term architecture.
- No hidden marker in model text.
- Supports multiple actions, analytics, rendering rules.

Cons:

- Requires schema/API/UI changes.
- Current `talent_messages` table may need `metadata` or parallel action extraction.
- More work.

Recommendation:

- Short term: use `[[CALL]]` only; resume upload stays as plain `Career > Profile` instruction.
- Medium term: add `message actions` metadata.
- Avoid adding many markers unless speed matters more than architecture.

### 10.3 Continue in chat action

Do not add a button initially. Harper can simply ask one question in the message.

If later needed, quick replies can be added:

- "현재 역할 설명하기"
- "대표 성과 말하기"
- "영어/해외 경험 말하기"

But first version should not add this. It risks making the chat feel like a form.

## 11. Tool and Memory Interaction

### 11.1 Asking vs saving

The continuous signal policy is about asking better questions. It should not automatically save inferred data.

Save only when the user actually answers with a declarative statement that maps to writable state.

Existing `update_talent_profile` already handles:

- rowMemos for specific profile rows
- post-onboarding talentInsights for durable future matching memory
- recommendation preferences
- bio/preferences

### 11.2 Row memo vs insight

Important boundary:

- Specific role/project/achievement facts belong to row memo when exactly one visible row matches.
- Future preference/search memory belongs to talentInsights.

Example:

User:

> Harper에서는 학교용 AI 채팅 서비스의 RAG backend를 만들고 있어요.

If there is a visible current Harper experience row, this should become a row memo, not a generic insight.

User:

> 앞으로는 AI agent infra 쪽 기회를 더 보고 싶어요.

This is talentInsights.

### 11.3 Do not call tools just because a signal exists

Helpful missing signals should not cause tool calls by themselves. They only help the model choose a next question or CTA.

Tool calls still depend on user statements and existing tool policy.

## 12. Natural Opening Detection

The model should decide final timing, but runtime can help by labeling situations.

Potential lightweight opening hints:

```ts
type CareerNaturalOpening =
  | "user_asked_if_info_is_enough"
  | "user_requested_better_matches"
  | "user_reacted_to_recommendation"
  | "user_shared_concern"
  | "user_shared_transition"
  | "profile_shallow_and_topic_relevant";
```

Do not over-engineer initially. Start by letting prompt infer openings from latest message and helpful signals.

Possible later enhancement:

- Small deterministic latest-message classifier.
- No LLM needed.
- Add at most one line in dynamic state:

```text
Current turn has a natural opening for learning more context: user_asked_if_info_is_enough.
```

This can prevent the model from missing obvious cases like "정보 없어도 괜찮아?"

## 13. Minimal Implementation Phases

### Phase 1: Prompt posture only

Scope:

- Replace `Asking questions` section with the compact general policy.
- Do not add runtime signals yet.
- Do not add new UI actions.

Expected improvement:

- Model is less likely to say "충분해요" when profile is shallow.
- Model more often asks one useful low-pressure question.

Risk:

- Still depends on model inferring missing signals from long profile.
- May be inconsistent across turns.

### Phase 2: Helpful missing signals runtime context

Scope:

- Add `helpfulMissingSignals` argument to prompt plan builder.
- Implement deterministic builder.
- Pass signals from `/api/talent/chat/route.ts` and `runCareerChatTurn`.
- Keep max 3 signals.

Expected improvement:

- Model gets user-specific next-best-signal hints.
- Prompt remains short.
- Behavior becomes less dependent on full-profile inference.

Risk:

- Poor signal ranking could create irrelevant questions.
- Need suppression to avoid repeated questions.

### Phase 3: CTA action support

Scope:

- Keep `[[CALL]]` for quick call.
- Decide resume upload approach.
- Preferred medium-term: message action metadata.

Expected improvement:

- Harper can offer low-friction paths without awkward text links.
- UI can render actual buttons.

Risk:

- Metadata requires API/UI changes.
- Marker-based approach can become messy if too many markers are added.

### Phase 4: Reuse in proactive/reengagement contexts

Scope:

- Use helpful missing signals in reengagement or proactive turns.
- Example: "오랜만이라 최근에 어떤 일을 하고 계신지 통화로 듣고 싶어요" when current role depth is shallow.

Risk:

- Proactive messages can feel pushy.
- Use only high-confidence, high-value signals.

## 14. Suggested File-Level Changes

### Prompt

File:

- `src/lib/career/prompts.ts`

Changes:

- Compact replacement of `## Asking questions`.
- Add optional `helpfulMissingSignals?: CareerHelpfulMissingSignal[]` to `buildCareerConversationPromptPlan` args.
- Add `buildHelpfulMissingSignalsSection`.
- Include section in `dynamicStateLines`.

### Signal Builder

New file:

- `src/lib/career/helpfulMissingSignals.ts`

Exports:

- `buildCareerHelpfulMissingSignals`
- `formatCareerHelpfulMissingSignalsForPrompt` if not kept in `prompts.ts`
- types

Inputs:

- `profile`
- `structuredProfile`
- `setting`
- `currentInsightContent`
- `recentMessages`
- optionally `recentActivitySummaries`

### Main Chat API

File:

- `src/app/api/talent/chat/route.ts`

Add after profile/context load:

```ts
const helpfulMissingSignals = buildCareerHelpfulMissingSignals({
  currentInsightContent,
  profile,
  recentMessages,
  setting: talentSetting,
  structuredProfile,
});
```

Pass into `buildCareerTextChatPromptBlocks`.

### Shared Chat Turn

File:

- `src/lib/career/chatTurn.ts`

Same as API route. This path is used by reengagement, company follow-up, history action replies, etc. Be careful with `allowedToolNames` and proactive contexts; helpful signals should be allowed but not force questions.

### Realtime Voice

File:

- `src/lib/career/realtimeInstructions.ts`

Optional later. Voice already has stronger question behavior. Add only after text chat behavior is stable.

### UI

Files:

- `src/components/career/chat/CareerMessageBubble.tsx`
- `src/components/career/types.ts`
- message API response types

Short term:

- Keep `[[CALL]]`.

Medium term:

- Add `actions` to assistant message type.
- Render action buttons below assistant message.
- Add `upload_resume` action.

## 15. Signal Heuristics Details

### 15.1 current_role_depth

Detect:

- latest/current experience is present.
- title/company exists.
- description length < 120 chars and memo length < 120 chars.
- no resume text, or resume text does not mention current company/role in meaningful depth.

Priority:

- high if current role is likely central to candidate positioning.
- medium if there are other rich rows.

Suggested question examples:

- `현재 역할에서 구체적으로 어떤 제품이나 서비스를 만들고 계신가요?`
- `그 역할에서 본인이 직접 맡은 범위나 의사결정은 어디까지였나요?`
- `회사 밖에서 봤을 때 꼭 알려졌으면 하는 성과가 있다면 하나만 말씀해주실 수 있을까요?`

### 15.2 representative_experience

Detect:

- several experience rows exist but descriptions are generic.
- current insights lack proud project / representative achievement.

Priority:

- medium by default.
- high if user asks for internal introductions or better matching.

Suggested questions:

- `프로필에 다 담기지 않았지만, 회사에 소개할 때 꼭 이야기하고 싶은 경험이 하나 있다면 뭐가 있을까요?`
- `최근 몇 년 중 본인이 가장 직접적으로 만든 변화나 결과를 하나만 꼽으면 뭐가 있을까요?`

### 15.3 recommendation_calibration

Detect:

- recent opportunity feedback exists.
- feedback reason is missing.
- latest message reacts to a role/company.

Priority:

- high when feedback happened in current or previous turn.

Suggested questions:

- `이 방향이 좋다고 느끼신 이유가 회사/도메인 때문인지, 역할 내용 때문인지에 더 가까울까요?`
- `선호하지 않는다고 느끼신 가장 큰 이유가 위치, 역할 범위, 회사 단계, 도메인 중 어디에 가까울까요?`

### 15.4 resume_status

Detect:

- `resume_file_name` empty.
- `resume_links` empty.
- `resume_text` empty or very short.

Priority:

- medium normally.
- high when user asks for intros, profile quality, or better matches.

Suggested action:

- upload resume in Career > Profile.
- quick call.
- continue in chat.

Question:

- `이력서가 없더라도 채팅으로 충분히 이어갈 수 있어요. 우선 현재 가장 대표적인 경험 하나만 편하게 설명해주실 수 있을까요?`

### 15.5 global_experience

Detect:

- user is open to US/global/remote opportunities.
- profile or insights do not mention English level, overseas work, global collaboration, visa/work authorization.

Priority:

- low by default.
- medium/high when user asks for US/global opportunities.

Suggested questions:

- `해외 팀이나 영어로 일하는 환경은 어느 정도까지 편하게 보실 수 있으세요?`
- `미국/글로벌 회사까지 보면 영어 협업이나 근무 가능 조건도 같이 봐야 하는데, 그 부분은 어느 정도로 열려 있으세요?`

### 15.6 constraints

Detect:

- recommendation request exists.
- missing location, remote, compensation, start timeline, visa, engagement type.

Priority:

- high if search is about to run.

Suggested questions:

- `찾아보기 전에 하나만 확인하면, 위치/리모트는 어느 정도까지 열려 있으세요?`
- `좋은 기회라도 꼭 피하고 싶은 조건이 있다면 하나만 먼저 알려주세요.`

### 15.7 transition_context

Detect:

- short tenure.
- founder/contract/fractional transition.
- career break.
- domain/role switch.
- user asks whether a path is realistic.

Priority:

- medium/high depending on current topic.

Suggested questions:

- `다음 기회를 볼 때, 지금 단계에서 가장 바꾸고 싶은 건 역할 자체인지, 회사 환경인지, 일하는 방식인지에 가까울까요?`
- `이 전환을 회사에 설명할 때 가장 중요하게 봐줬으면 하는 맥락이 있을까요?`

## 16. Response Style Guidance

Harper should use this tone:

- calm
- useful
- not apologetic
- not pushy
- not "괜찮아요!" only
- not "정보를 입력해주세요" product-copy tone

Good phrases:

- `시작은 가능하지만, 더 자세히 알수록 훨씬 좋아요.`
- `단순 직함보다 실제로 맡으신 일과 성과가 추천/연결에는 더 중요해요.`
- `부담되시면 이력서 대신 채팅으로 하나씩 이야기해주셔도 괜찮아요.`
- `우선 하나만 여쭤보면...`
- `이건 더 정확한 추천을 위해 여쭤보는 거예요.`

Avoid:

- `전혀 문제없어요`
- `이미 잘 반영되어 있어요` when only shallow info exists
- `회사 측에도 그렇게 전달돼요` unless an actual company-intro flow is active
- multiple questions in one message
- long menu of all Harper capabilities
- forcing a call when chat is enough

## 17. Edge Cases

### 17.1 User is anxious

If the user asks because they are worried:

- reassure that they can start without perfect information.
- do not say the information is unnecessary.
- offer low-pressure options.

### 17.2 User does not want to share more

If user declines:

- respect it.
- continue with available context.
- do not ask again immediately.

### 17.3 User asks a direct unrelated question

Answer directly. Do not force signal acquisition.

### 17.4 User is already in a search flow

If search can run with current data, run it when appropriate. Ask only if a missing signal is critical to avoid bad results.

### 17.5 Profile visibility/privacy concern

Do not push for more information before explaining privacy. If the user worries about current employer exposure, answer privacy first.

### 17.6 Internal opportunity acceptance

When user accepts an internal opportunity, one follow-up can be useful if it materially helps representation. But do not turn acceptance into a long interview.

### 17.7 External public posting

If user likes an external posting, ask why only when it improves future matching and does not distract from the application/process answer.

## 18. Open Product Questions

1. Should resume upload be a first-class message action or just text guidance?
2. Should `[[CALL]]` be allowed in normal assistant responses beyond reengagement/session start?
3. Should helpful missing signals be shown in ops/admin for debugging?
4. Should signal suppression consider recent questions from voice calls too?
5. Should signal builder treat resume text as sufficient if it is old but present?
6. How should Harper handle users with extremely senior profiles where asking basic details feels insulting?
7. Should current role always be highest priority, or should representative experience sometimes outrank it?

## 19. Recommended Final Approach

Use a small prompt posture change plus runtime missing signals.

Do not solve this with a large static prompt section.

Recommended order:

1. Replace `Asking questions` with a compact continuous-learning policy.
2. Add `Helpful missing signals` dynamic state, max 3 items.
3. Start with deterministic rules for current role depth, resume status, recommendation calibration, constraints, and global experience.
4. Reuse existing `[[CALL]]` only when call is clearly useful.
5. Keep resume upload as `Career > Profile` text guidance at first.
6. Later add structured message actions for resume upload and other CTA buttons.

This gives Harper the right general posture without overfitting to the specific "현재 회사 정보 없어도 되나요?" example and without making the static prompt much longer.

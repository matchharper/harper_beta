import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { normalizeToolNames } from "@/lib/career/prompts/promptUtils";
import type { CareerToolPolicyChannel } from "@/lib/career/prompts/types";

export function buildCareerToolPolicyPrompt(args: {
  channel: CareerToolPolicyChannel;
  preferredLocale?: string | null;
  toolNames: readonly string[] | string;
}) {
  const toolNames = normalizeToolNames(args.toolNames);
  if (toolNames.length === 0) return "";

  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const acknowledgementExample = careerT(
    args.preferredLocale,
    "career.tool_policy.acknowledgement_example",
    "알겠습니다. 앞으로 이 조건을 기준으로 맞는 기회를 찾아볼게요."
  );
  const toolNameText = toolNames.join(", ");
  const hasWebSearchTool = toolNames.includes("web_search");
  const hasResearchCompanyTool = toolNames.includes("research_company");
  const hasOpenUrlTool = toolNames.includes("open_url");
  const hasLookupAnswerExamplesTool = toolNames.includes(
    "lookup_answer_examples"
  );
  const hasRecommendedOpportunitiesTool = toolNames.includes(
    "read_recommended_opportunities"
  );
  const hasRoleContextTool = toolNames.includes("get_role_context");
  const hasUpdateRecommendedOpportunityFeedbackTool = toolNames.includes(
    "update_recommended_opportunity_feedback"
  );
  const hasReadActivityEventsTool = toolNames.includes(
    "read_talent_activity_events"
  );
  const hasJobPostingRecommendationTool = toolNames.includes(
    "recommend_job_postings"
  );
  const hasUpdateTalentProfileTool = toolNames.includes(
    "update_talent_profile"
  );
  const hasUpdateSettingTool = toolNames.includes("update_setting");
  const hasAdditionalQuestionSelectorTool = toolNames.includes(
    "select_additional_onboarding_question"
  );
  const hasRecordInternalFitReevaluationInformationTool = toolNames.includes(
    "record_internal_fit_reevaluation_information"
  );
  const channelRule =
    args.channel === "voice"
      ? "- Voice mode: if a tool is needed, call it directly. The client may play a short tool-specific preamble, so do not add extra filler before tool use."
      : `- Chat mode: if a tool is needed, call it directly and then answer naturally in ${outputLanguage} using only the relevant findings.`;
  const onboardingToolExceptionNames = [
    hasUpdateSettingTool ? "`update_setting`" : null,
    hasUpdateTalentProfileTool ? "`update_talent_profile`" : null,
    hasAdditionalQuestionSelectorTool
      ? "`select_additional_onboarding_question`"
      : null,
  ]
    .filter((name): name is string => Boolean(name))
    .join(", ");
  const onboardingToolExceptionRule = onboardingToolExceptionNames
    ? `- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context. Exceptions available in this turn: ${onboardingToolExceptionNames}.`
    : "- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context.";

  return [
    "## Tool Use Policy",
    `Available tools: ${toolNameText}`,
    "For every tool call, include `_uiStatusMessage`: one concrete English user-facing Thinking log sentence. Do not reveal internal tool names, storage names, or implementation details.",
    "- `_uiStatusMessage` must describe the exact action or lookup, not a generic process. Avoid vague text like 'updating', 'checking', or 'searching' by itself.",
    "- If the tool changes saved user information, mention the concrete field or value being adjusted. Old-to-new wording is optional only when it is naturally available and useful.",
    "- If the tool reads/searches data, mention the specific company, role, opportunity type, preference, or activity being checked. For job searches, describe what kind of jobs Harper is looking for.",
    ...(args.channel === "chat"
      ? [
          `- When you are about to use a tool for a durable preference change or job search, start with one short ${outputLanguage} acknowledgement before tool use when the model/provider allows text before tool calls. Example: '${acknowledgementExample}'`,
        ]
      : []),
    ...(args.channel === "voice"
      ? [
          "- Voice call limitation: UI-card tools are not available during a live voice call. Do not claim that you can show buttons or cards inside the call.",
          `- If the user asks for full company snapshot/research during voice, explain in ${outputLanguage} that you can help after ending the call in text chat, where Harper can run real-time company research (5-15s delay).`,
          `- If the user asks to open, read, inspect, or summarize a specific URL/website during voice, explain in ${outputLanguage} that this requires text chat after ending the call, where Harper can open the URL.`,
        ]
      : []),
    ...(hasOpenUrlTool
      ? [
          "- Use `open_url` when the user provides a specific URL or asks to read, inspect, summarize, or answer based on a specific webpage.",
          hasWebSearchTool
            ? "- Do not use `open_url` for broad discovery when no URL is provided. Use `web_search` first if the user asks for current web information but did not give a specific URL."
            : "- Do not use `open_url` for broad discovery when no URL is provided.",
          `- After \`open_url\`, answer in ${outputLanguage} using the returned markdown. Mention the page title or URL only when it helps the user.`,
        ]
      : []),
    ...(hasResearchCompanyTool
      ? [
          "- Use `research_company` only when the user genuinely wants to learn about a specific company, such as culture, funding, team, business model, or hiring landscape.",
          "- Do not call it for passing company mentions, anecdotes about past experience, JD/position questions, or comparison questions without genuine info-seeking intent.",
          "- For a clear light company-info request like '~~는 어떤 회사야?', call it directly. Ask before researching only when the company mention is ambiguous or not clearly an information request.",
        ]
      : []),
    ...(hasLookupAnswerExamplesTool
      ? [
          "- Use `lookup_answer_examples` when user's question or request cannot be answered well with the current prompt and conversation context. mostly about question about harper service's system logic or help about how to use harper service(ex. 탈퇴, 기회 연결 수락/거절 하면 어떻게 되는지, ~~를 어디서 하는지 등). Pass the user's latest message verbatim, then adapt any returned answer examples naturally without exposing raw IDs or scores.",
        ]
      : []),
    ...(hasRecommendedOpportunitiesTool
      ? [
          "- Use `read_recommended_opportunities` when the answer depends on opportunities already recommended to this user, such as comparing them, recalling links, explaining recommendation reasons, or checking prior feedback.",
          ...(args.channel === "chat"
            ? [
                "- When showing a returned opportunity in chat, include a standalone `[posting](roleId)` line for each returned opportunity you mention.",
              ]
            : []),
        ]
      : []),
    ...(hasRoleContextTool
      ? [
          "- Use `get_role_context` only when the user asks about, recalls, or gives feedback on specific already-shown role/posting cards and you have one or more roleIds from `[posting](roleId)` lines or prior tool results. Pass at most 3 roleIds. Pass `include_jd=true` when the answer needs JD text such as responsibilities, requirements, or detailed role description; otherwise pass `include_jd=false`.",
          "- If the user refers to a specific recommended role by company/title/order but no roleId is visible in the current context, use `read_recommended_opportunities` first to recover candidate roleIds. If multiple candidates remain, ask one user-friendly clarifying question about the company name, role title, or when Harper recommended it. Never ask the user for a roleId.",
          "- Do NOT call `get_role_context` while finding, ranking, or presenting fresh recommendations. After `recommend_job_postings`, use its `answerDraft` directly and do not fetch extra role context unless the user asks a follow-up about specific returned roles.",
          "- Use the returned role/company/recommendation context to answer accurately. Treat private company-side/request context as reasoning-only; never quote it, paraphrase it as a user-facing promise, or mention that such private context exists.",
          ...(args.channel === "chat"
            ? [
                "- When showing a returned role in chat, include a standalone `[posting](roleId)` line for each returned role you mention.",
              ]
            : []),
        ]
      : []),
    ...(hasUpdateRecommendedOpportunityFeedbackTool
      ? [
          "- Use `update_recommended_opportunity_feedback` when the user clearly wants to save/like or reject/dislike a specific recommended position. Use the roleId from `[posting](roleId)` when available. If the position is ambiguous, ask one clarifying question instead of guessing.",
          "- Set feedback=`like` for saved/positive/accepted reactions. Set feedback=`dislike` for rejected/negative reactions. Do not mention internal status labels.",
        ]
      : []),
    ...(hasRecordInternalFitReevaluationInformationTool
      ? [
          "",
          "### record_internal_fit_reevaluation_information",
          "- Use only when the latest user message clearly provides information that answers the current internal opportunity clarification in Optional follow-up opportunities.",
          "- Save a concise `newInformation` summary of the user-provided evidence. Do not infer beyond what the user said.",
          "- This tool does not recommend, reveal, or decide the role. After the tool returns, continue naturally without mentioning internal fit, hold labels, or reevaluation.",
          "",
        ]
      : []),
    ...(hasReadActivityEventsTool
      ? [
          "- Use `read_talent_activity_events` when the answer depends on recent Career activity or profile changes, such as what the user changed since the last conversation, what Harper should remember from recent updates, whether the user followed or unfollowed a company, or whether there were major updates before discussing recommendations. Prefer a small `limit` such as 3-5 unless the user asks for more.",
        ]
      : []),
    ...(hasJobPostingRecommendationTool
      ? [
          "- Use `recommend_job_postings` when the user asks you to find, recommend, or match new job postings, open roles, positions, or opportunities. This includes requests with specific constraints like role family, LLM/AI domain, location, work mode, seniority, or company type.",
          "- Important priority: if the latest message combines a search request with a durable hard filter or future-matching command (Korean examples: '~로만 찾아줘', '~만 보내줘', '앞으로 ~로 찾아줘', '다음부터 ~는 빼줘', '~ 조건을 반영해줘'), do NOT call `recommend_job_postings` first. Call `update_talent_profile` first so the condition is saved; then call `recommend_job_postings` only if the latest user message explicitly asks to find postings now.",
          "- For a request like '미국 회사로만 찾아줘', treat it as a durable hard filter by default, not one-off browsing. Update talentInsights first, preferably under an existing matching axis such as `must_haves` if it is a hard requirement, with a complete value like '앞으로 미국 기반 회사만 추천받고 싶어합니다.' Use high impact.",
          "- Exception: before calling `recommend_job_postings`, triage whether the latest request is aligned search, off-profile/aspirational search, one-off exploration, or durable direction change. If a request is clearly off-profile or aspirational relative to the visible profile, do not call the tool immediately; first explain the mismatch and ask one clarifying question about what attracted the user to that company/role.",
          "- If the user clarifies that the request is only curiosity/browsing (e.g. '그냥 보고 싶어서요'), you may call `recommend_job_postings` as a one-off exploratory search. In the `request`, explicitly include that this is one-off exploration and must not change future periodic matching criteria. Do not call `update_talent_profile` for this.",
          "- If you run `recommend_job_postings` for an ambiguous search condition before saving it, end the answer by asking one short question about whether Harper should reflect that condition in future matching. If the user says yes, call `update_talent_profile` on the next turn.",
          "- If the originally requested role is unrealistic for the profile, prefer an adjacent realistic query around the same company/domain unless the user explicitly insists on the original role. Example: a B2B SaaS Growth marketer asking for OpenAI Researcher should first be steered toward OpenAI-like AI company marketing/GTM/growth roles, with the research-track caveat clearly stated.",
          "- `recommend_job_postings` immediately returns and saves at most 5 high-fit postings. If the user asks for more, use the tool's larger-request guidance: explain that Harper will show the best 5 now and continue with periodic batches of up to 10 high-quality postings rather than dumping weak matches.",
          "- After `recommend_job_postings`, answer using `answerDraft`. 1. 2.로 역할을 나누는 등 지나치게 딱딱하게 구조를 갖추지 말고, 최대한 자연스러운 채팅처럼 자유로운 구조로 말해라. Do not use seperators(---)",
          "- Preserve every standalone `[posting](role_id)` line from `answerDraft` exactly. These lines drive the chat posting-card carousel, so do not remove or rewrite them.",
        ]
      : []),
    ...(hasUpdateSettingTool
      ? [
          "",
          "### update_setting (recommendation delivery settings)",
          "- Purpose: update only how Harper sends opportunity recommendations: recommendationBatchSize, getInternalRecommendation, and getExternalRecommendation.",
          "- Use this when the user clearly asks to change the number of opportunities per batch, whether to receive external/public postings, whether to receive internal Harper-connected opportunities, or whether to stop all opportunity recommendations.",
          "- Do NOT use this for target roles, domains, locations, work mode, company/stage preferences, compensation, deal-breakers, resume/CV context, or profile-row facts. Use `update_talent_profile` for durable future matching memory/profile data when appropriate.",
          "- recommendationBatchSize 는 사용자가 숫자를 말한 경우뿐 아니라 '좀 많이', '더 많이', '늘려줘', '적게', '줄여줘'처럼 방향을 분명히 말한 경우에도 3-10 사이의 구체적인 값으로 보내라. 이때 되묻지 마라.",
          "- 숫자 없이 '좀 많이/더 많이/늘려줘'라고 하면 현재 recommendationBatchSize에서 2를 더하되 10을 넘기지 않는다. 현재값이 없거나 유효하지 않으면 5를 보낸다.",
          "- 숫자 없이 '최대한 많이/가능한 많이/많을수록 좋다'라고 하면 10을 보낸다. 숫자 없이 '적게/줄여줘/조금만'이라고 하면 현재 recommendationBatchSize에서 2를 빼되 3보다 작게 만들지 않는다. 현재값이 없거나 유효하지 않으면 3을 보낸다.",
          "- recommendationBatchSize는 3-10 사이만 사용한다. 최대한 많은 공고를 달라고 하면 10을 보낸다.",
          "- 사용자가 '매일 보내줘', '더 자주 보내줘', '매일 공고 찾아줘'처럼 발송 빈도/주기를 바꾸려 하면 update_setting을 호출하지 않는다. Harper는 적절한 공고를 선별하는 데 집중하기 위해 지나치게 자주 찾아드리지는 않는다고 설명하고, 매일 필요하다면 Harper에 접속해서 포지션을 당장 더 찾아달라고 말해달라고 안내한다.",
          "- getExternalRecommendation=false means Harper should stop suggesting external public job postings. If getInternalRecommendation=true, the user may still receive internal Harper-connected opportunities.",
          "- getExternalRecommendation / getInternalRecommendation 은 사용자가 추천/연결받고 싶은 기회 종류를 바꿀 때만 수정해라. 두 값의 기본값은 true다.",
          "- 사용자가 추천/기회 제안을 전부 중단하겠다고 하면 getExternalRecommendation: false 와 getInternalRecommendation: false 를 함께 보낸다. recommendationBatchSize를 중단 표현으로 바꾸지 마라.",
          "- ex. 사용자가 '공개 공고는 추천하지 마', '외부 공고 안 받을래', '외부 채용 기회는 빼줘', '내부 연결되는 기회만 받고 싶어' 라고 하면 getExternalRecommendation: false 를 보낸다.(getInternalRecommendation가 현재 false라면 이것도 true를 보낸다.)",
          "- When the profile is open to company-initiated matches and internal recommendations are enabled, the user can receive both (1) opportunities Harper proposes and (2) company-initiated connection offers after a company reviews their profile. If it is not open to company-initiated matches, they receive Harper-proposed opportunities only.",
          "- When the latest user request is about turning external/public posting recommendations on or off, the follow-up reply should translate that saved setting into the user's day-to-day experience: what Harper will include or avoid from now on, what may still happen through enabled recommendation channels, and how the user can adjust it later.",
          "- After this tool returns, produce a normal user-facing chat reply. Do not expose field names unless the user specifically asks for technical details.",
          "",
        ]
      : []),
    ...(hasUpdateTalentProfileTool
      ? [
          "",
          "### update_talent_profile (profile writer)",
          "- Purpose: update saved profile state with new info the user just shared: talentUser.bio, talentUser.location, row memos, and post-onboarding future-matching memory.",
          "- talentUser.location writes the user's current main base/residence to talent_users.location; it is not a desired work location, target geography, relocation preference, or job-search location filter.",
          "- Boundary: facts about a specific past role, school, project, responsibility, achievement, or education belong in the structured profile row memo when one visible row matches. talentInsights is future opportunity/search memory, not a substitute for experience/education/extras profile data.",
          ...(hasUpdateSettingTool
            ? [
                "- Do NOT use this tool for recommendation delivery settings such as batch size, external recommendations, or internal recommendations. Use `update_setting` for those. If the user asks to change cadence/frequency, answer naturally without writing it to profile state.",
              ]
            : [
                "- Do NOT use this tool for recommendation delivery settings such as cadence/frequency, batch size, external recommendations, or internal recommendations. If the user asks for those while this tool is unavailable, answer naturally and do not write them through `update_talent_profile`.",
              ]),
          "- During onboarding: use only talentUser.bio, talentUser.location, and rowMemos. Do NOT send talentInsights; onboarding insight extraction is handled separately.",
          "- After onboarding is complete: send talentInsights only when the user's latest message clearly changes durable future recommendation memory, such as desired next role, search intensity, compensation, must-haves, deal-breakers, team style, company/domain preference, company size/stage preference, or corrections to prior matching preferences.",
          "- Search requests with explicit hard-filter language count as durable future recommendation memory even when phrased as 'find/search'. Examples: '미국 회사로만 찾아줘', '앞으로 리모트만 보내줘', '대기업은 빼고 찾아줘', '다음부터 Series B 이상만 봐줘'. In these cases, call this tool before job search.",
          "- For '미국 회사로만 찾아줘', update `must_haves` if the user means a hard requirement, e.g. '앞으로 미국 기반 회사만 추천받고 싶어합니다.' Use `impactLevel: \"high\"` because it materially changes recommendations.",
          "- Do NOT call this tool for one-off browsing, curiosity, benchmarking, or informational role/company searches. Messages like 'OpenAI Researcher 자리 보여줘', '그냥 보고 싶어서요', '어떤 공고가 있나 보고 싶어요' are search/exploration requests, not durable memory updates unless the user explicitly says to remember them for future matching.",
          "- Do NOT infer a durable preference from an aspirational or off-profile request by itself. If the candidate asks for a role that appears materially outside their current background, clarify intent first; update memory only if they explicitly state a career direction change or future matching preference.",
          '- Use `impactLevel: "high"` only for changes that materially alter what should be recommended, such as hard constraints, target-role shifts, location/work-authorization constraints, compensation floors, or strong must-have/deal-breaker changes. Use `low` or `medium` for minor notes.',
          "- After this tool returns, produce a normal user-facing chat reply. Do not return an empty assistant message, and do not return only an onboarding marker.",
          "- Trigger conditions: call ONLY when the user's latest statement directly maps to a writable field in this tool:",
          "  1) talentUser.bio: the user explicitly provides, rewrites, corrects, or asks to clear their profile Summary/About/Bio text. Do not invent this from assistant-only summaries.",
          "  2) talentUser.location: the user explicitly provides or corrects their current main base/residence, meaning where they primarily live/are based now. Do not use this for short-term stays, travel, where they want to work, or a past/current job's office location.",
          "  3) rowMemos: a short fact clearly tied to exactly one visible experience/education/extra row. This includes recent/representative experience details, project descriptions, responsibilities, achievements, and education details.",
          `  4) talentInsights: post-onboarding durable future preference/memory changes. Use descriptive English snake_case keys and final integrated ${outputLanguage} complete sentences as values.`,
          "- Do NOT call this tool during onboarding for general answers that only update insight-like understanding, such as search intensity, desired next role, compensation, must-haves, deal-breakers, team style, environment preference, career-change reason, or optional-question answers. Those are handled outside this tool until onboarding completes.",
          "- Do NOT call when:",
          "  - 사용자의 발화가 *질문*(예: '회사들이 보통 어떤 보상을 주나요?')이거나 *가정/추측*(예: '만약 연봉이 1억이면 좋겠죠')일 때.",
          "  - assistant 본인의 발언/요약/메타 멘트에 대해. 사용자가 새로 말한 정보에만 반응한다.",
          "  - 이미 같은 preference/memo 정보가 들어 있고 변동/보강할 게 없을 때 (중복 호출 금지).",
          "- Read-merge-write 규칙:",
          "  - talentUser.bio 는 프로필 Summary/About 전체를 교체한다. 사용자가 의도한 최종 Summary/About 문장만 보내라. 삭제/비우기를 명확히 요청한 경우에만 null 또는 빈 문자열을 보낸다.",
          "  - talentUser.location 은 현재 유저가 주로 위치하는 곳/current primary base만 저장한다. 희망 근무 지역, relocation 선호, 단기 체류지는 여기에 쓰지 않는다.",
          "  - talentInsights.content 는 future-matching memory partial patch 이다. 기존 값과 통합된 최종 문장만 보내고, 단순 중복이면 보내지 않는다.",
          "  - 새 정보가 기존/current insight 또는 checklist 축에 속하면 새 synonym key를 만들지 말고 그 key를 업데이트해라.",
          "  - 기존 key로 표현하기 어려운 별도 축이면 새 영어 snake_case key를 만들어도 된다. 단, `representative_experience`, `recent_experience`처럼 프로필 row fact를 담는 key는 만들지 마라.",
          `  - talentInsights value must be a complete ${outputLanguage} sentence. If writing in Korean, write \`일정 규모가 있는 회사를 선호합니다.\` rather than \`규모 선호.\``,
          "- 제외 대상:",
          "  - profileLinks(LinkedIn/GitHub/Scholar/X/개인 사이트), resume 파일은 채팅 발화에 등장해도 이 도구로 쓰지 않는다.",
          "- rowMemos (experience/education/extra profile rows 의 'Harper의 메모' 박스):",
          "  - 사용자가 프로필의 *특정* role/school/extra 하나에 분명히 연결되는 declarative 발화를 했을 때만 사용한다 (예: '삼성에서 ML 모델 만들었어요' → 시스템 프롬프트의 Experiences 블록에서 company_name이 '삼성'인 행 하나).",
          "  - experiences/educations 는 시스템 프롬프트에 노출된 그 행의 RowID 값을 verbatim 으로 사용해라. 환각 금지. extras 는 동일 블록의 Title 을 정확히 사용한다.",
          `  - In newInfo, write *only one newly learned fact* as a short natural ${outputLanguage} sentence. Do not repeat the existing memo content.`,
          "  - 같은 발화의 같은 사실을 rowMemos와 talentInsights에 중복 저장하지 마라. 프로필 row에 들어갈 내용은 rowMemos만 사용한다.",
          "  - OMIT 규칙: (1) 후보 행이 두 개 이상 (예: '삼성' → Samsung Electronics + Samsung SDS 둘 다 존재) (2) 매칭되는 행이 없음 (3) 발화가 회사/학교 mention 없는 generic skill — 이런 케이스는 rowMemos 항목을 넣지 마라. 단순 프로필 사실이라면 talentInsights로 우회 저장하지도 마라.",
          ...(hasUpdateSettingTool
            ? [
                "- 한 turn 에 추천 발송 설정과 프로필/미래 매칭 메모가 동시에 갱신될 수 있으면 `update_setting`과 `update_talent_profile`을 별도 호출해라. 설정 필드를 이 도구에 넣지 마라.",
              ]
            : [
                "- 추천 발송 설정과 프로필/미래 매칭 메모를 섞지 마라. 이 도구에는 추천 발송 설정 필드를 넣지 말고, 프로필/row memo/future matching memory만 저장해라.",
              ]),
          `- After calling this tool, continue the conversation naturally in ${outputLanguage}: acknowledge the substance of what the user said, ask the next relevant question if onboarding is still active, or close naturally with the required marker if enough information has been collected.`,
          "",
        ]
      : []),
    ...(hasAdditionalQuestionSelectorTool
      ? [
          "",
          "### select_additional_onboarding_question (onboarding additional question selector)",
          "- Purpose: choose the best next Additional questions phase question from the user's structured profile, recent conversation, and known insights.",
          "- Eligible only during onboarding. Use it when the onboarding question checklist says an additional_question item is still missing and the next step should be an additional onboarding question.",
          "- This tool may return either a profile-gap question OR a role-specific depth/preference question. Prefer concrete profile gaps, especially substantial experience rows with no description/memo. Do not keep asking broad desired role/tech-stack preference questions.",
          "- When this tool is available and you are in Additional questions phase, call it before asking the additional question. Do not invent the additional question yourself first.",
          "- Pass the user's latest message in `latestUserMessage` when available.",
          `- If the tool result has \`shouldAsk=true\`, ask exactly one question using the returned \`assistantMessage\` naturally in ${outputLanguage}. Do not mention the tool, JSON, internal gap analysis, or selection rationale.`,
          "- If the tool result has `shouldAsk=false`, do not ask another additional question; use the returned `assistantMessage` as the final priority confirmation.",
          "- Do not close onboarding in the same response after this tool. Wait for the user's answer.",
          "",
        ]
      : []),
    ...(hasWebSearchTool
      ? [
          "- Use `web_search` only when the user needs current, factual, or web-dependent information.",
        ]
      : []),
    onboardingToolExceptionRule,
    "- After tool use, summarize only the useful findings. Do not dump raw JSON.",
    "- Mention source names or URLs only when they materially help the user.",
    channelRule,
  ].join("\n");
}

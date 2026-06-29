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
    "For every tool call, include `_uiStatusMessage` following the tool schema: concrete, user-facing English, and no internal tool names, storage names, or implementation details.",
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
          "- If the latest message combines search with a durable hard filter or future-matching command (e.g. '~로만', '~만 보내줘', '앞으로', '다음부터', '~ 조건을 반영'), call `update_talent_profile` first; search only if the user also asked to find postings now.",
          "- Before searching, triage aligned search vs off-profile/aspirational vs one-off browsing. For clearly off-profile requests, explain the mismatch and ask one clarifier first. For one-off browsing, include that in `request` and do not update memory.",
          "- If you run `recommend_job_postings` for an ambiguous search condition before saving it, end the answer by asking one short question about whether Harper should reflect that condition in future matching. If the user says yes, call `update_talent_profile` on the next turn.",
          "- If the requested role is unrealistic for the profile, prefer an adjacent realistic query around the same company/domain unless the user explicitly insists on the original role.",
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
          "- Use only for batch size, external/internal opportunity recommendation channels, or stopping recommendations. Do not use for target role/domain/location/work mode/stage/compensation/profile facts.",
          "- For recommendationBatchSize, choose a 3-10 value per schema; vague more/less adjusts by 2, maximum requests use 10, and you should not ask a follow-up just to pick the number.",
          "- 사용자가 '매일 보내줘', '더 자주 보내줘', '매일 공고 찾아줘'처럼 발송 빈도/주기를 바꾸려 하면 update_setting을 호출하지 않고 Harper는 적절한 공고를 선별하는 데 집중하기 위해 지나치게 자주 찾아드리지는 않는다고 설명하고, 매일 필요하다면 Harper에 접속해서 포지션을 당장 더 찾아달라고 말해달라고 안내한다.",
          "- If the user stops all opportunity recommendations, set both external and internal false. If they want only internal/connected opportunities, set external false and keep/turn internal true.",
          "- Profile visibility and internal recommendations are separate: Open to matches can allow company-initiated offers after profile review; otherwise the user receives Harper-proposed opportunities only.",
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
          "- Boundary: profile-row facts belong in rowMemos when exactly one visible row matches; durable future opportunity/search memory belongs in talentInsights after onboarding; recommendation delivery settings belong in update_setting.",
          ...(hasUpdateSettingTool
            ? [
                "- Do not write cadence/frequency changes to profile state; answer naturally without a profile update.",
              ]
            : [
                "- Do not write recommendation delivery settings or cadence/frequency changes through this tool; answer naturally instead.",
              ]),
          "- During onboarding: use only talentUser.bio, talentUser.location, and rowMemos. Do NOT send talentInsights; onboarding insight extraction is handled separately.",
          "- After onboarding is complete: send talentInsights only when the user's latest message clearly changes durable future recommendation memory, such as desired next role, search intensity, compensation, must-haves, deal-breakers, team style, company/domain preference, company size/stage preference, or corrections to prior matching preferences.",
          "- Explicit hard-filter search language counts as durable memory even when phrased as search (e.g. '미국 회사로만', '앞으로 리모트만', '대기업은 빼고', '다음부터 Series B 이상'). Use high impact for hard constraints or major recommendation-changing updates.",
          "- Do NOT call for one-off browsing, curiosity, informational searches, questions, hypotheticals, assistant summaries, duplicates, or aspirational/off-profile role mentions without explicit future intent.",
          "- After this tool returns, produce a normal user-facing chat reply. Do not return an empty assistant message, and do not return only an onboarding marker.",
          "- Trigger conditions: call ONLY when the user's latest statement directly maps to a writable field in this tool:",
          "  1) talentUser.bio: explicit final Summary/About/Bio replacement, correction, or clear request; never infer it from assistant-only summaries.",
          "  2) talentUser.location: explicit current primary base/residence only; not travel, past/target job location, desired work location, or relocation preference.",
          `  3) rowMemos: one new ${outputLanguage} fact tied to exactly one visible experience/education/extra row; use visible RowID/Title, omit if ambiguous/no row/generic, and do not duplicate it into talentInsights.`,
          `  4) talentInsights: post-onboarding future preference/memory patch; merge existing axes, use English snake_case keys and complete ${outputLanguage} sentence values, and avoid profile-row keys like representative_experience.`,
          "- Do NOT call this tool during onboarding for general answers that only update insight-like understanding, such as search intensity, desired next role, compensation, must-haves, deal-breakers, team style, environment preference, career-change reason, or optional-question answers. Those are handled outside this tool until onboarding completes.",
          "- Do not write profileLinks, resume files, or the same fact twice. Use only user-provided new information, not assistant summaries.",
          ...(hasUpdateSettingTool
            ? [
                "- If delivery settings and profile/matching memory both change in one turn, call `update_setting` and `update_talent_profile` separately.",
              ]
            : ["- Do not mix delivery settings into profile/matching memory."]),
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

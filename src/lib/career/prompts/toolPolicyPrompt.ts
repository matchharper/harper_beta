import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { normalizeToolNames } from "@/lib/career/prompts/promptUtils";
import type { CareerToolPolicyChannel } from "@/lib/career/prompts/types";

export function buildCareerToolPolicyPrompt(args: {
  channel: CareerToolPolicyChannel;
  isOnboardingActive?: boolean;
  preferredLocale?: string | null;
  toolNames: readonly string[] | string;
}) {
  const toolNames = normalizeToolNames(args.toolNames);
  if (toolNames.length === 0) return "";

  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const toolNameText = toolNames.join(", ");
  const hasEndCallTool = toolNames.includes("end_call");
  const hasStatusMessageTools = toolNames.some((name) => name !== "end_call");
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
  const hasInternalRolesTool = toolNames.includes("get_internal_roles");
  const hasInternalRolePriorityReviewTool = toolNames.includes(
    "internal_role_priority_review"
  );
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
  ]
    .filter((name): name is string => Boolean(name))
    .join(", ");
  const onboardingToolExceptionRule = onboardingToolExceptionNames
    ? `- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context. Exceptions available in this turn: ${onboardingToolExceptionNames}.`
    : "- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context.";

  return [
    "## Tool Use Policy",
    `Available tools: ${toolNameText}`,
    hasStatusMessageTools
      ? "For every tool call except `end_call`, include `_uiStatusMessage`: a specific English user-facing Thinking log sentence for this exact tool call. Say what is being changed, checked, searched, or prepared. If searching jobs, describe the kind of opportunities being searched for. If changing saved information, mention the concrete field/value being adjusted; old-to-new is optional only when it is naturally available. Do not use vague text like 'updating', 'checking', or 'searching' by itself. Do not mention internal tool names, storage names, or implementation details. Keep it under 160 characters."
      : "",
    hasStatusMessageTools
      ? "For every tool call except `end_call`, follow the returned assistantInstruction after tool use."
      : "",
    ...(hasEndCallTool
      ? [
          "- `end_call` takes no parameters. Use it only to end the live voice call after the final closing message, or when the user clearly asks to end, stop, or hang up. Do not include `_uiStatusMessage` with `end_call`.",
        ]
      : []),
    ...(args.channel === "chat"
      ? [
          `- When you are about to use a tool, start with brief acknowledgement before tool use.`,
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
          "- If the user asks what happened after accepting an internal recommendation, call `read_recommended_opportunities` and answer from the returned `progress.message` when it is present. Do not infer company-side progress from savedStage or stale internal fields.",
          "- Pass `only_internal: true` to `read_recommended_opportunities` when the user is asking specifically about internal recommendations, accepted internal opportunities, or internal connection/review status.",
          "- Treat returned feedback=`negative` and progress.stage=`rejected` as Talent-side rejection records, not company rejections. This actor rule is specific to Talent rejection; for archived and stopped processes, follow progress.message and progress.stopReason.",
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
    ...(hasInternalRolesTool
      ? [
          "- Use `get_internal_roles` when the user directly asks to look up internal Harper-connected roles by role title or company name. This is not a personalized recommendation or fit-ranking tool.",
          "- Pass 1-2 concrete FTS keywords only, taken from the user's role title or company name request. Do not pass broad preference paragraphs.",
          "- Multi-word keywords are AND-matched. If the user says something like 'Site CTO' but the distinctive role term is CTO, pass `CTO` rather than one keyword `Site CTO`.",
          "- Never use this for listing all roles. This is only for looking up a specific role by role title or company name. If user wants listing all, say it's not possible because of the company's request.",
          "- `[Harper]` means the company Harper, not Harper-connected roles in general. When it appears, include `Harper` in the FTS keywords.",
          "",
        ]
      : []),
    ...(hasInternalRolePriorityReviewTool
      ? [
          "- Use `internal_role_priority_review` with `action=register` when the user explicitly asks Harper to connect, prioritize, review, or consider them for a specific internal Harper-connected role. Use `action=withdraw` when the user explicitly asks to withdraw, cancel, or remove that priority-review request. If the roleId is unknown, use `get_internal_roles` first; if the role remains ambiguous, ask one clarifying question. This is only for internal role.",
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
          "- If `recommend_job_postings` returns `initialRecommendationPending=true`, no new search was run. Use `answerDraft` as-is and do not claim that you searched, found, or saved any postings.",
          "- After `recommend_job_postings`, answer briefly using `answerDraft`. Do not explain all postings each one by one.",
          "- Preserve every standalone `[posting](role_id)` line from `answerDraft` exactly. These lines drive the chat posting-card carousel, so do not remove or rewrite them.",
        ]
      : []),
    ...(hasUpdateSettingTool
      ? [
          "",
          "### update_setting (recommendation/contact subscription scope)",
          "- action=stop_external: use when the user clearly wants to stop receiving external opportunity recommendations or wants only Harper internal opportunities.",
          "- action=stop_all: use only when the user clearly wants all Harper matching/recommendation contact to stop. Always ask confirmation that they want to stop all contact, stop using Harper.",
          "- action=resume: use when the user clearly wants Harper recommendation/contact to resume. It changes getExternalRecommendation to true.",
          "- Generic stop/unsubscribe ('이제 그만 받을게', 'unsubscribe', '메일 그만') is ambiguous: do not call; ask one scope clarifier. Never call with empty/trial args.",
          "- After the tool, explain the practical result: stop_external means only strong direct-connection contacts; stop_all means no matching contact; resume means strong opportunities and good-fit public postings can resume.",
          "- After this tool returns, produce a normal user-facing chat reply. Do not expose field names unless the user specifically asks for technical details.",
          "",
        ]
      : []),
    ...(hasUpdateTalentProfileTool
      ? [
          "",
          "### update_talent_profile (profile writer)",
          "- Purpose: update talentUser.bio/location, rowMemos, post-onboarding talentInsights, or recommendationBatchSize.",
          "- Boundary: row facts -> rowMemos; durable matching memory -> talentInsights after onboarding; batch size -> recommendationBatchSize; subscription actions -> update_setting.",
          "- For recommendationBatchSize, choose a 3-10 value per schema; vague more/less adjusts by 2, maximum requests use 10, and you should not ask a follow-up just to pick the number.",
          ...(hasUpdateSettingTool
            ? [
                "- Use update_setting for clear recommendation type modifications.",
              ]
            : [
                "- Do not write subscription/contact actions or cadence/frequency changes through this tool; answer naturally instead.",
              ]),
          args.isOnboardingActive
            ? "- During onboarding: use only talentUser.bio, talentUser.location, rowMemos. Do NOT send talentInsights; onboarding insight extraction is handled separately."
            : "- Send talentInsights only when the user's message clearly changes durable future recommendation memory, such as desired next role, search intensity, compensation, must-haves, deal-breakers, team style, company/domain preference, company size/stage preference, or corrections to prior matching preferences.",
          "- Explicit hard-filter search language counts as durable memory even when phrased as search (e.g. '미국 회사로만', '앞으로 리모트만', '대기업은 빼고', '다음부터 Series B 이상'). Use high impact for hard constraints or major recommendation-changing updates.",
          "- Do NOT call for one-off browsing, curiosity, informational searches, questions, hypotheticals, assistant summaries, duplicates, or aspirational/off-profile role mentions without explicit future intent.",
          "- After this tool returns, produce a normal user-facing chat reply. Do not return an empty assistant message, and do not return only an onboarding marker.",
          "- Trigger conditions: call ONLY when the user's latest statement directly maps to a writable field in this tool:",
          "1) talentUser.bio: explicit final Summary/About/Bio replacement, correction, or clear request; never infer it from assistant-only summaries.",
          "2) talentUser.location: explicit current primary base/residence only; not travel, past/target job location, desired work location, or relocation preference.",
          `3) rowMemos: when the user's latest statement clearly maps to one specific visible experience/education/extra row, use operation=append for genuinely new detail that should follow the existing memo, or operation=update when the user corrects or asks to revise the existing memo. For update, send the complete final ${outputLanguage} memo, not only the changed fragment. Use the visible RowID, omit if ambiguous/no row/generic, update to empty string to delete it and do not duplicate it into talentInsights.`,
          `4) talentInsights: future preference/memory patch; merge existing axes, use English snake_case keys and complete ${outputLanguage} sentence values, and avoid profile-row keys like representative_experience. Things to remember for opportunity recommendation.`,
          args.isOnboardingActive
            ? "- Do NOT call this tool during onboarding for general answers that only update insight-like understanding, such as search intensity, desired next role, compensation, must-haves, deal-breakers, team style, environment preference, career-change reason, or optional-question answers. Those are handled outside this tool until onboarding completes."
            : "",
          "- Do not write profileLinks, resume files, or the same fact twice. Use only user-provided new information, not assistant summaries.",
          ...(hasUpdateSettingTool
            ? [
                "- If subscription scope and profile/matching memory or batch size both change in one turn, call `update_setting` and `update_talent_profile` separately.",
              ]
            : [
                "- Do not mix subscription/contact actions into profile/matching memory.",
              ]),
          "",
        ]
      : []),
    ...(hasWebSearchTool
      ? [
          "- Use `web_search` only when the user needs current, factual, or web-dependent information.",
        ]
      : []),
    ...(args.isOnboardingActive ? [onboardingToolExceptionRule] : []),
    ...(hasStatusMessageTools
      ? [
          "- After tool use, summarize only the useful findings. Do not dump raw JSON.",
          "- Mention source names or URLs only when they materially help the user.",
        ]
      : []),
    channelRule,
  ].join("\n");
}

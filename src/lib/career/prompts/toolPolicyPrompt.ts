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
  const hasStatusMessageTools = toolNames.some(
    (name) => name !== "end_call" && name !== "update_language_setting"
  );
  const hasWebSearchTool = toolNames.includes("web_search");
  const hasResearchCompanyTool = toolNames.includes("research_company");
  const hasOpenUrlTool = toolNames.includes("open_url");
  const hasGmailSearchTool = toolNames.includes("search_connected_gmail");
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
  const hasListDocumentsTool = toolNames.includes("list_documents");
  const hasReadDocumentTool = toolNames.includes("read_document");
  const hasUpdateDocumentTool = toolNames.includes("update_document");
  const hasJobPostingRecommendationTool = toolNames.includes(
    "recommend_job_postings"
  );
  const hasUpdateTalentProfileTool = toolNames.includes(
    "update_talent_profile"
  );
  const hasUpdateLanguageSettingTool = toolNames.includes(
    "update_language_setting"
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
    hasUpdateLanguageSettingTool ? "`update_language_setting`" : null,
    hasUpdateSettingTool ? "`update_setting`" : null,
    hasUpdateTalentProfileTool ? "`update_talent_profile`" : null,
    hasListDocumentsTool ? "`list_documents`" : null,
    hasReadDocumentTool ? "`read_document`" : null,
    hasUpdateDocumentTool ? "`update_document`" : null,
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
      ? "When a tool schema includes `_uiStatusMessage`, include a specific English user-facing Thinking log sentence for that call. Say what is being changed, checked, searched, or prepared. If searching jobs, describe the kind of opportunities being searched for. If changing saved information, mention the concrete field/value being adjusted; old-to-new is optional only when it is naturally available. Do not use vague text like 'updating', 'checking', or 'searching' by itself. Do not mention internal tool names, storage names, or implementation details. Keep it under 160 characters."
      : "",
    hasStatusMessageTools
      ? "After tool use, follow the returned assistantInstruction."
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
    ...(hasGmailSearchTool
      ? [
          "- Use `search_connected_gmail` when the answer depends on the user's actual inbox, such as application confirmations, recruiter messages, interview scheduling, or email history.",
          "- Use the narrowest useful Gmail search query and request only a small bounded number of results. Set `include_content=true` only when metadata and snippets are insufficient.",
          "- Do not claim that an email exists, was read, or contains specific information before the tool returns successfully with status=ok.",
          "- If the Gmail result status is not ok, follow its assistantInstruction and describe the connection or temporary-access limitation. Never invent inbox findings.",
        ]
      : []),
    ...(hasResearchCompanyTool
      ? [
          "- Use `research_company` only when the user genuinely wants to learn about a specific company, such as culture, funding, team, business model, or hiring landscape.",
          "- Do not call it for passing company mentions, anecdotes about past experience, JD/position questions, or comparison questions without genuine info-seeking intent.",
          "- For a clear light company-info request like '~~는 어떤 회사야?', call it directly. Ask before researching only when the company mention is ambiguous or not clearly an information request.",
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
    ...(hasListDocumentsTool || hasReadDocumentTool || hasUpdateDocumentTool
      ? [
          "",
          "### Saved documents",
          hasListDocumentsTool
            ? "- Use `list_documents` for earlier or ambiguous saved-document references and to locate a generated context document identified by the system prompt. Start with offset=0 and limit=10; fetch nextOffset only when the user needs more. The list is metadata-only and excludes soft-deleted documents."
            : "",
          hasReadDocumentTool
            ? "- Use `read_document` only when the answer needs saved document content. For a current-turn upload that already includes content_excerpt, start from its next_offset; for an earlier saved document, start with offset=0. Use max_chars=4000, then continue from nextOffset only when hasMore is true and the missing portion matters. A binary-only file may have textAvailable=false."
            : "",
          hasUpdateDocumentTool
            ? `- Use 'update_document' to correct resume/document kind, primary/public state, or soft-delete status only when the user\'s request or the current-turn upload context supports that change. Document content cannot be edited; if the user asks to change it, say "내용 수정은 불가능하며, 새로 업로드 해야한다." Never expose internal field names in the user-facing reply.
  - For a newly uploaded file, correct an obviously wrong filename-based kind. Soft-delete it when it is clearly transient third-party reference material and the user did not ask to keep it. If ownership or retention intent is ambiguous, ask before changing or deleting it.
  - Setting is_deleted=true is a soft delete only; do not claim that the underlying storage object was permanently erased. Set is_primary=true only for a resume and only when the user clearly wants that file to be their primary resume.`
            : "",
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
          args.isOnboardingActive
            ? "- Purpose: update talentUser.bio/location, personal profileLinks, or rowMemos during onboarding."
            : "- Purpose: update talentUser.bio/location, personal profileLinks, rowMemos, talentInsights, or recommendationBatchSize.",
          args.isOnboardingActive
            ? "- Boundary: profile summary/current base -> talentUser; row facts -> rowMemos; subscription actions -> update_setting."
            : "- Boundary: row facts -> rowMemos; durable matching memory -> talentInsights; batch size -> recommendationBatchSize; subscription actions -> update_setting.",
          "- For recommendationBatchSize, choose a 3-10 value per schema; vague more/less adjusts by 2, maximum requests use 10, and you should not ask a follow-up just to pick the number.",
          ...(hasUpdateSettingTool
            ? [
                "- Use update_setting for clear recommendation type modifications.",
              ]
            : [
                "- Do not write subscription/contact actions or cadence/frequency changes through this tool; answer naturally instead.",
              ]),
          args.isOnboardingActive
            ? ""
            : "- Explicit hard-filter search language counts as durable memory even when phrased as search (e.g. '미국 회사로만', '앞으로 리모트만', '대기업은 빼고', '다음부터 Series B 이상').",
          "- Do NOT call for one-off browsing, curiosity, informational searches, questions, hypotheticals, assistant summaries, duplicates, or aspirational/off-profile role mentions without explicit future intent.",
          "- After this tool returns, produce a normal user-facing chat reply. Do not return an empty assistant message, and do not return only an onboarding marker.",
          "- Trigger conditions: call ONLY when the user's latest statement directly maps to a writable field in this tool:",
          "1) talentUser.bio: explicit final Summary/About/Bio replacement, correction, or clear request; never infer it from assistant-only summaries.",
          "2) talentUser.location: explicit current primary base/residence only; not travel, past/target job location, desired work location, or relocation preference.",
          `3) rowMemos: when the user's latest statement clearly maps to one specific visible experience/education/extra row, use operation=append for genuinely new detail that should follow the existing memo, or operation=update when the user corrects or asks to revise the existing memo. For update, send the complete final ${outputLanguage} memo, not only the changed fragment. Use the visible RowID, omit if ambiguous/no row/generic, update to empty string to delete it and do not duplicate it into talentInsights.`,
          "- Never store overly sensitive personal information in rowMemos, even if the user discloses it.",
          "- If related context must be retained, record only the generalized consequence and omit the sensitive cause and details.",
          args.isOnboardingActive
            ? "- Use only talentUser.bio, talentUser.location, profileLinks, and rowMemos. Do NOT call this tool during onboarding for general answers that only update user preference or future matching memory. Those are handled outside this tool until onboarding completes."
            : `4) talentInsights: opportunity preference/memory patch; merge existing axes, use English snake_case keys and complete ${outputLanguage} sentence values. Do not write information about rowMemos here. Things to remember for opportunity recommendation.`,
          `- profileLinks: add/delete only this talent's own professional profile or material URL (personal LinkedIn/GitHub/Scholar/portfolio/blog/CV). Never add company, job-posting, recruiting, company-document, or another person's URL. After add, do not stop at registration confirmation: explain that Harper can use the saved link and relevant information from it when useful to understand and represent the user and improve future opportunity matching. During a Harper internal company connection, explain that the link and relevant profile-derived information may also be used when helpful to present the user's fit. After delete, explain that Harper will no longer use it as a saved source for future matching or future company-connection materials unless the user adds it again.`,
          "- Do not write resume files or the same fact twice. Use only user-provided new information, not assistant summaries.",
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

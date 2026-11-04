import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { normalizeToolNames } from "@/lib/career/prompts/promptUtils";
import type { CareerToolPolicyChannel } from "@/lib/career/prompts/types";
import { COMPANY_RELAY_CONTENT_CONTRACT } from "@/lib/companyTalentRequests/relayContract";

const CHAT_TOOL_CONVERSATION_POLICY = `
You may speak before or between tool calls when a new finding or actual blocker helps the user.
오래 걸릴 작업(tool calls)을 시작하기 전에는 가볍게 한문장 말한 다음 시작해라. ex. 카카오 채용 공고 바로 지원해드릴게요!
Each message remains visible; continue from it without repeating acknowledgements. 
Execution instructions and safeguards belong in the tool call. 
Continue delegated work and ask when an essential answer is needed to proceed.`;

export function buildCareerToolPolicyPrompt(args: {
  channel: CareerToolPolicyChannel;
  backgroundInvocation?: boolean;
  conversationMode?: "mock_interview";
  isOnboardingActive?: boolean;
  applicationPreparation?: boolean;
  preferredLocale?: string | null;
  toolNames: readonly string[] | string;
}) {
  const toolNames = normalizeToolNames(args.toolNames);
  if (toolNames.length === 0) return "";

  const outputLanguage =
    args.conversationMode === "mock_interview"
      ? "the language selected for this interview"
      : getCareerPromptLanguageName(args.preferredLocale);
  const toolNameText = toolNames.join(", ");
  const hasEndCallTool = toolNames.includes("end_call");
  const hasStatusMessageTools = toolNames.some(
    (name) => name !== "end_call" && name !== "update_language_setting"
  );
  const hasWebSearchTool = toolNames.includes("web_search");
  const hasOpenUrlTool = toolNames.includes("open_url");
  const hasGmailSearchTool = toolNames.includes("search_connected_gmail");
  const hasRecommendedOpportunitiesTool = toolNames.includes(
    "read_recommended_opportunities"
  );
  const hasCompanyConnectionsTool = toolNames.includes(
    "read_company_connections"
  );
  const hasContactCompanyTool = toolNames.includes("contact_company");
  const hasRoleContextTool = toolNames.includes("get_role_context");
  const hasInternalRolesTool = toolNames.includes("get_internal_roles");
  const hasInternalRolePriorityReviewTool = toolNames.includes(
    "internal_role_priority_review"
  );
  const hasInternalRoleReconsiderationTool = toolNames.includes(
    "request_internal_role_reconsideration"
  );
  const hasUpdateRecommendedOpportunityFeedbackTool = toolNames.includes(
    "update_recommended_opportunity_feedback"
  );
  const hasReadActivityEventsTool = toolNames.includes(
    "read_talent_activity_events"
  );
  const hasListDocumentsTool = toolNames.includes("list_documents");
  const hasReadDocumentTool = toolNames.includes("read_document");
  const hasUpsertDocumentTool = toolNames.includes("upsert_document");
  const hasJobPostingRecommendationTool = toolNames.includes(
    "search_opportunities"
  );
  const hasUpdateTalentProfileTool = toolNames.includes(
    "update_talent_profile"
  );
  const hasReadTalentContextTool = toolNames.includes("read_talent_context");
  const hasWriteTalentContextTool = toolNames.includes("write_talent_context");
  const hasUpdateLanguageSettingTool = toolNames.includes(
    "update_language_setting"
  );
  const hasUpdateSettingTool = toolNames.includes("update_setting");
  const hasRecordInternalFitReevaluationInformationTool = toolNames.includes(
    "record_internal_fit_reevaluation_information"
  );
  const channelRule = args.backgroundInvocation
    ? `- Background mode: intermediate and final plain assistant text are private execution notes. Only deliver_career_email sends your finished subject and body to the candidate. Write that email in ${outputLanguage}. If you need an answer, send the useful question through that tool and arrange any appropriate future check; no user is present to answer this invocation.`
    : args.channel === "voice"
      ? args.conversationMode === "mock_interview"
        ? "- During interview preparation, give at most one brief notice in the selected interview language before a slow search. After asking the language question, wait for the answer before searching. Do not repeat preparation notices or narrate tool mechanics."
        : "- Voice mode: if a tool is needed, call it directly. The client may play a short tool-specific preamble, so do not add extra filler before tool use."
      : `- Chat mode: use tools as needed and answer naturally using the relevant findings. Write your conversation and explanations to the candidate in ${outputLanguage}. Only an explicit language request from the user changes this conversation language, as the language rule describes.`;
  const onboardingToolExceptionNames = [
    hasEndCallTool ? "`end_call`" : null,
    hasUpdateLanguageSettingTool ? "`update_language_setting`" : null,
    hasUpdateSettingTool ? "`update_setting`" : null,
    hasUpdateTalentProfileTool ? "`update_talent_profile`" : null,
    hasListDocumentsTool ? "`list_documents`" : null,
    hasReadDocumentTool ? "`read_document`" : null,
    hasUpsertDocumentTool ? "`upsert_document`" : null,
  ]
    .filter((name): name is string => Boolean(name))
    .join(", ");
  const onboardingToolExceptionRule = onboardingToolExceptionNames
    ? `- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context. Exceptions available in this turn: ${onboardingToolExceptionNames}.`
    : "- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context.";

  return [
    "## Tool Use Policy",
    `Callable tools in this response: ${toolNameText}`,
    "Use current tool results and this turn's capability catalog as evidence of what happened and what you can do. Earlier assistant claims about unavailable features may be stale or wrong; never repeat them over a later successful tool result. Answer the latest request without reviving already completed tasks.",
    "When an action fails, use the verified cause and execution outcome to find a solution through existing tools",
    "Company-side agents select proactive Harper-connected recommendations by comparing a candidate's profile with their Role's requirements. Career can help with those recommendations and public Roles the user explicitly chooses, but cannot browse hidden internal-role lists or independently send a profile to a company. General job discovery uses external opportunities; profile sharing follows the user's authorization for the exact Role or existing correspondence.",
    hasStatusMessageTools && !args.backgroundInvocation
      ? `When a tool schema includes \`_uiStatusMessage\`, include a specific user-facing Thinking log sentence in ${outputLanguage} for that call. Say what is being changed, checked, searched, or prepared. If searching jobs, describe the kind of opportunities being searched for. If changing saved information, mention the concrete field/value being adjusted; old-to-new is optional only when it is naturally available. Do not use vague text like 'updating', 'checking', or 'searching' by itself. Do not mention internal tool names, storage names, or implementation details. Keep it under 160 characters.`
      : "",
    hasStatusMessageTools
      ? "After tool use, follow the returned assistantInstruction."
      : "",
    ...(hasEndCallTool
      ? [
          "- Use `end_call` to finish the voice session. For completed onboarding, set complete_onboarding=true to save completion before disconnecting; no separate closing approval is needed. For an early stop or a different call mode, set it to false. Respect an explicit stop immediately. Do not include `_uiStatusMessage` with `end_call`.",
        ]
      : []),
    ...(args.channel === "chat" && !args.backgroundInvocation
      ? [CHAT_TOOL_CONVERSATION_POLICY]
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
    ...(hasRecommendedOpportunitiesTool
      ? [
          "- Use `read_recommended_opportunities` when the answer depends on opportunities already recommended to this user, such as comparing them, recalling links, explaining recommendation reasons, or checking prior feedback.",
          "- To prepare an application from a posting URL without a known roleId, look it up with `read_recommended_opportunities(postingUrl=the supplied URL)` first. `get_internal_roles` covers only Harper-connected roles; an empty or unrelated result cannot establish that a public posting is absent. A failed filtered lookup establishes only that this query found no match, not that the role is unregistered.",
          "- If the user asks what happened after accepting a Harper-first internal recommendation, call `read_recommended_opportunities` and answer from the returned `progress.message` when it is present. Do not infer company-side progress from savedStage or stale internal fields.",
          "- When `companyRequestIntroProgress.origin=company_request_intro`, do not apply the Harper-first 7-day/21-day progress wording. Reason from the returned factual timestamps and statuses in the conversation's current context. Use natural wording rather than a fixed sentence or fixed elapsed-day threshold. If `canRelayToCompany=true` and the user is concerned or aksed about silence, you may offer to contact the company.",
          "- Pass `only_internal: true` to `read_recommended_opportunities` when the user is asking specifically about internal recommendations, accepted internal opportunities, or internal connection/review status.",
          "- Treat returned feedback=`negative` and progress.stage=`rejected` as Talent-side rejection records, not company rejections. This actor rule is specific to Talent rejection; for archived and stopped processes, follow progress.message and progress.stopReason.",
          ...(args.channel === "chat" && !args.backgroundInvocation
            ? [
                "- When showing a returned opportunity in chat, include a standalone `[posting](roleId)` line for each returned opportunity you mention.",
              ]
            : []),
        ]
      : []),
    ...(hasCompanyConnectionsTool
      ? [
          "- Use `read_company_connections` when the user wants Harper to communicate with, follow up with, or ask about a company connected through Harper and the exact relationship is not already unambiguous in private context. It includes existing mutual connections and agent introduction correspondence; read the returned facts to distinguish them.",
          "- Treat the returned relationship timestamps and transport statuses as facts, not as prewritten answers. Decide what to say and whether to offer a follow-up from the whole conversation. Do not create fixed day thresholds or canned progress language.",
        ]
      : []),
    ...(hasContactCompanyTool
      ? [
          "- contact_company uses recommendationId with acceptIntroduction for a reviewed introduction choice, or an existing introductionRootId/replyToMessageId for authorized agent correspondence. Legacy mutual connections keep their connectionId contract. Preserve the candidate's meaning and conditions in relayContent; distinguish the agent-inbox receipt from human delivery or a hiring decision.",
        ]
      : []),
    ...(hasRoleContextTool
      ? [
          "- Read exact role details with get_role_context for existing recommendations or a public posting the user chose. Recover ambiguous references from the user's request and existing recommendations. Public role facts can be discussed before a recommendation exists; that does not authorize discovering other internal roles. You may ask useful questions about the candidate's relevant experience in your own words.",
        ]
      : []),
    ...(hasInternalRolesTool
      ? [
          "- get_internal_roles resolves a specific public Harper-connected posting the user explicitly asked about or chose to pursue. Keep title/company searches scoped to identifying that posting. Lookup is not an application or introduction; apply_to_internal_role saves the user-chosen role. Existing recommendations use read_recommended_opportunities and get_role_context.",
        ]
      : []),
    ...(hasUpdateRecommendedOpportunityFeedbackTool
      ? [
          "- update_recommended_opportunity_feedback records dislike to decline, keep to save for later, or like to save external interest. Internal introduction acceptance uses contact_company with the exact recommendation after the candidate has reviewed the Role and chosen introduction; it records acceptance and submits to the company's agent. For an external posting, use the application handbook and tools for its actual application route. Recommendation membership archive/reset is handled by upsert_opportunities and preserves existing decisions.",
        ]
      : []),
    ...(toolNames.includes("apply_to_internal_role")
      ? [
          "- apply_to_internal_role saves a user-chosen internal Role as a private opportunity. The initial review request is not introduction acceptance. Use the result and conversation to judge whether explanation, useful questions, or material preparation will help; a subsequent clear acceptance uses contact_company.",
        ]
      : []),
    ...(toolNames.includes("assign_to_role")
      ? [
          "- assign_to_role prepares exact profile/document snapshots for an internal role. Read current materials before replacing them. A private tailored version does not alter the default profile or previously accepted sharing. At acceptance, use the selected material ID and assignment revision; if no custom assignment exists, the server pins the current default. Conflicts require reading the current selection, not silently choosing a newer version.",
        ]
      : []),
    ...(hasReadActivityEventsTool
      ? [
          "- Use `read_talent_activity_events` when the answer depends on recent Career activity or profile changes, such as what the user changed since the last conversation, what Harper should remember from recent updates, whether the user followed or unfollowed a company, or whether there were major updates before discussing recommendations. Prefer a small `limit` such as 3-5 unless the user asks for more.",
        ]
      : []),
    ...(hasListDocumentsTool || hasReadDocumentTool || hasUpsertDocumentTool
      ? [
          "",
          "### Saved documents",
          hasListDocumentsTool
            ? "- Use `list_documents` for earlier or ambiguous saved-document references and to locate a generated context document identified by the system prompt. Start with offset=0 and limit=10; fetch nextOffset only when the user needs more. Descriptions help select which document to read. The list is metadata-only and excludes soft-deleted documents."
            : "",
          hasReadDocumentTool
            ? "- Use `read_document` when the answer needs saved document content. For a current-turn upload that already includes content_excerpt, start from its next_offset; for an earlier saved document, start with offset=0. Use max_chars=4000, then continue from nextOffset only when hasMore is true and the missing portion matters. A binary-only file may have textAvailable=false."
            : "",
          hasUpsertDocumentTool
            ? `- Use upsert_document to create, revise or copy documents needed for the user's delegated work. Respect explicit limits; casual disclosures alone do not authorize writing. Choose type=resume for structured resume content or type=markdown for general authored text. Both support PDF download. Create needs type and title; update changes the same owned document; copy makes a separate named private document. Before content edits or copies, read the current document and use its revision. Update/copy infer the saved type when omitted and cannot convert an existing document in place. Follow a requested title or choose a descriptive one without separate confirmation.
  - For Markdown, markdown is the full initial body; edits applies exact requested replacements. For resumes, use the structured content/changes contract below. Metadata-only update may omit type and body fields. Change description, kind, primary/public state or soft-delete state only when the user's request or current-turn upload context supports that change. Preserve uploaded originals; create a new authored document from their source rather than replacing an uploaded file's body. Never expose internal field names in the user-facing reply.
  - For a newly uploaded file, correct an obviously wrong filename-based kind. Soft-delete it when it is clearly transient third-party reference material and the user did not ask to keep it. If ownership or retention intent is ambiguous, ask before changing or deleting it.
  - Setting is_deleted=true is a soft delete only; do not claim that the underlying storage object was permanently erased. Set is_primary=true only for a resume and only when the user clearly wants that file to be their primary resume.`
            : "",
        ]
      : []),
    ...(hasUpsertDocumentTool
      ? [
          '- upsert_document creates, updates or privately copies resumes and Markdown documents. For resume writing and revision guidance load_handbook("resume"). Read the current document before edits; structured resumes require stable entry IDs and the current revision. Preserve unrelated content for scoped edits. the returned document reference can be used for attachments.',
        ]
      : []),
    ...(hasUpdateSettingTool
      ? [
          "",
          "### update_setting (recommendation/contact subscription scope)",
          "- This changes account-wide recommendation/contact scope. A request about the company, opportunity, schedule or task currently being discussed belongs to that object's tool, even when the reply is brief. Preserve that referent; do not turn a local stop request into a menu of global subscription modes. Load the owning capability as needed.",
          "- action=stop_external: use when the user clearly wants to stop receiving external opportunity recommendations or wants only Harper internal opportunities.",
          "- action=stop_all: use only when the user clearly wants all Harper matching/recommendation contact to stop. Honor a clear request without repeating permission; clarify only when the requested scope is unclear.",
          "- action=resume: use when the user clearly wants Harper recommendation/contact to resume. It changes getExternalRecommendation to true.",
          "- Interpret stop/unsubscribe scope from the conversation. If it remains unclear, ask a concise scope question. Never call with empty/trial args.",
          "",
        ]
      : []),
    ...(hasUpdateTalentProfileTool
      ? [
          "",
          "### update_talent_profile (profile writer)",
          args.isOnboardingActive
            ? "- Purpose: update talentUser.name/headline/bio/location, personal profileLinks, rows or rowMemos during onboarding."
            : "- Purpose: update talentUser.name/headline/bio/location, personal profileLinks, rows or rowMemos; or create a private profile variant for a role.",
          args.isOnboardingActive
            ? "- Boundary: exact name/profile summary/current base -> talentUser; structured row fields -> rows; supplementary context -> rowMemos; subscription actions -> update_setting."
            : "- Boundary: structured row fields -> rows; supplementary context -> rowMemos; saved career context -> write_talent_context; subscription actions -> update_setting.",
          "- Read the exact profileId/revision with read_profile before editing. Use expectedRevision for changes, and copy/create for a role-specific variant. Choosing a variant or assigning it to a role does not change the default or grant sharing consent.",
          ...(hasUpdateSettingTool
            ? [
                "- Use update_setting for clear recommendation type modifications.",
              ]
            : [
                "- Do not write subscription/contact actions or cadence/frequency changes through this tool; answer naturally instead.",
              ]),
          "- Read existing rows as needed; write only explicit user facts or requested corrections, never hypotheticals or assistant inferences.",
          "- For writes, map confirmed facts to the appropriate fields:",
          "- rows adds/updates/deletes actual experience, education or extra fields; read_profile retrieves complete rows before replacing descriptions. Keep unrelated fields unchanged. headline edits the profile headline.",
          "1) talentUser.name: the user explicitly states or corrects their name; copy it exactly as written without translation or transliteration.",
          "2) talentUser.bio: explicit final Summary/About/Bio replacement, correction, or clear request; never infer it from assistant-only summaries.",
          "3) talentUser.location: explicit current primary base/residence only; not travel, past/target job location, desired work location, or relocation preference.",
          `4) rowMemos: when the user's latest statement clearly maps to one specific visible experience/education/extra row, use operation=append for genuinely new detail that should follow the existing memo, or operation=update when the user corrects or asks to revise the existing memo. For update, send the complete final ${outputLanguage} memo, not only the changed fragment. Use the visible RowID and omit the change if the row is ambiguous or generic.`,
          "- Never store overly sensitive personal information in rowMemos, even if the user discloses it.",
          "- If related context must be retained, record only the generalized consequence and omit the sensitive cause and details.",
          args.isOnboardingActive
            ? "- Use only talentUser.name, talentUser.headline, talentUser.bio, talentUser.location, profileLinks, rows, readRows, and rowMemos. Onboarding preference and memory extraction is handled by the existing onboarding flow."
            : "",
          `- profileLinks: add/delete only this talent's own professional profile or material URL (personal LinkedIn/GitHub/Scholar/portfolio/blog/CV). Never add company, job-posting, recruiting, company-document, or another person's URL.`,
          "- Do not write resume files or the same fact twice. Use only user-provided new information, not assistant summaries.",
          ...(hasUpdateSettingTool
            ? [
                "- If subscription scope and saved career context both change in one turn, call `update_setting` and `write_talent_context` separately. Use `update_talent_profile` as well only when a structured profile field changed.",
              ]
            : [
                "- Do not mix subscription/contact actions into profile/matching memory.",
              ]),
          "",
        ]
      : []),
    ...(hasReadTalentContextTool || hasWriteTalentContextTool
      ? [
          "",
          "### Saved career context",
          hasReadTalentContextTool
            ? "- `read_talent_context` reads more saved context when the default Brief and Memory excerpt are insufficient. Search with the current task and conversation meaning, or request exact shown refs."
            : "",
          hasWriteTalentContextTool
            ? "- `write_talent_context` preserves context the user should not need to explain again. Put current opportunity-search criteria and premises the user can review in Search Brief; put other context worth remembering for later conversation or opportunity judgment in Memory."
            : "",
          hasWriteTalentContextTool
            ? "- Read existing rows and the latest user meaning together. Correct a shown row by ref. Keep each independently understandable and updatable topic in its own Brief row, while keeping linked conditions, trade-offs, and exceptions together when separating them would change their meaning. Preserve strength, uncertainty, and known timing, and avoid duplicating the same information across Brief and Memory. When a Brief update makes its current label misleading, update the label in the same change."
            : "",
          hasWriteTalentContextTool
            ? "- Save only facts the user stated; never infer or add details the user did not provide. For a Brief, do not repeat its label in content."
            : "",
          hasWriteTalentContextTool
            ? "- An explicit correction or retraction supersedes the earlier statement and its saved copy. If the user says previously supplied information was hypothetical or incorrect, read the relevant saved rows and update/delete those exact facts while preserving unrelated content. Do not defend a saved fact as true merely because it already exists. Confirm removal only after a successful write; a profile correction alone does not also remove a separate Memory row."
            : "",
          "- When reusing career facts, the latest explicit correction overrides older messages, summaries and generated documents. A historical summary describing what an earlier resume contained is not fresh evidence that those claims remain true. Use current Profile/Memory and the selected source alongside subsequent user corrections; do not reintroduce withdrawn claims from an older draft.",
          hasWriteTalentContextTool
            ? "- Use a free user-readable label plus complete content for a new Brief. A new Memory needs complete content. Do not invent an internal key or choose from a fixed topic list."
            : "",
          hasWriteTalentContextTool
            ? "- Use the feature that owns the data for Profile rows, settings, documents, opportunity feedback, and workflow state. Do not save transient requests or the assistant's own conclusions as durable user context."
            : "",
          hasWriteTalentContextTool && hasJobPostingRecommendationTool
            ? "- If the same user message both changes durable criteria or context and asks for recommendations now, write the context change first. Then read the current matching and use search_opportunities with the correct complete criteria snapshot; use a new matching when the criteria materially change."
            : "",
          "- After reading or writing, continue the user's original request naturally. Do not turn the response into a storage receipt or expose refs and implementation terms.",
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
          ...(args.conversationMode === "mock_interview"
            ? [
                "- Use useful search findings to ask one interview question directly. Do not brief the search results or dump raw JSON.",
              ]
            : []),
          "- Mention source names or URLs only when they materially help the user.",
        ]
      : []),
    channelRule,
  ].join("\n");
}

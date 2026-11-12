import { careerPromptText, type CareerPromptExperiment } from "./promptExperiment";
import {
  getInsightChecklist,
  getOnboardingQuestionChecklist,
  getOnboardingRequiredQuestionKeys,
  type OnboardingChecklistLocationContext,
} from "@/lib/talentOnboarding/insightChecklist";
import type { ActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import { CAREER_HARPER_LINK_OUTPUT_RULE } from "@/lib/career/prompts/rawPrompts";
import {
  cleanCareerPromptInlineValue,
  formatCareerPromptCompactDateTime,
  sanitizeCareerPromptDateValues,
  type CareerPromptDateTimeOptions,
} from "@/lib/career/prompts/promptUtils";
import type {
  CareerPromptActivitySummary,
  CareerPromptActivityPage,
  CareerPromptChannel,
  CareerPromptOpportunityStatus,
  CareerPromptPreferences,
  CareerPromptProfile,
  OnboardingChecklistCoverage,
} from "@/lib/career/prompts/types";

/** 현재 대화 채널을 모델 prompt에 넣을 사람이 읽는 라벨로 바꾼다. */
export function getCareerChannelType(channel: CareerPromptChannel) {
  return channel === "voice" ? "Voice Call" : "Text Chat";
}

/** 채널별 출력 규칙을 만든다. voice에는 voice 규칙만, text에는 markdown/chat 규칙만 넣는다. */
export function buildCareerChannelContextRules(channel: CareerPromptChannel, allowChoiceButtons = true) {
  if (channel === "voice") {
    return [
      "The candidate is currently communicating through Voice Call.",
      "- Do not use markdown-like formatting.",
      "- Speak naturally and concisely, as in a real conversation.",
      "- Do not begin a reply by announcing a timestamp or relative-time label.",
    ].join("\n");
  }

  return [
    "The candidate is currently communicating through Text Chat.",
    "- Use Markdown for better readability.",
    "- Do not begin a reply with a timestamp or relative-time label.",
    "- Do not use emojis.",
    ...(allowChoiceButtons ? [
    "- When asking a question to the user to choose one of 2 answer options, you can append exactly one raw choice button block after the visible question. But do not use this too frequently.",
    "  [[CAREER_CHOICE_BUTTONS]]",
    '  {"choices":["Option A","Option B"]}',
    "  [[/CAREER_CHOICE_BUTTONS]]",
    "- Keep each choice short and self-contained, including simple yes/no choices. The front end will render the choices as vertical full-width buttons and send the selected choice text back as the user's reply.",
    "- Do not put the choice button block inside a Markdown code block.",
    ] : ["The application question tools own structured questions; ordinary chat replies contain prose, not choice-button payloads."]),
    CAREER_HARPER_LINK_OUTPUT_RULE,
    "",
  ].join("\n");
}

/** Topic purposes are always available; stored coverage is not conversational evidence. */
export function buildOnboardingRuntimeStateSection(args: {
  checklistContext?: OnboardingChecklistLocationContext;
  checklistCoverage?: OnboardingChecklistCoverage | null;
  quoteKeys?: boolean;
}) {
  const coreTopics = new Set<string>(getOnboardingRequiredQuestionKeys(args.checklistContext));
  const topics = getOnboardingQuestionChecklist(args.checklistContext)
    .filter((item) => coreTopics.has(item.key));
  return [
    "## What to understand for the first opportunity search",
    ...topics.map((item) => `- ${item.label}: ${item.promptHint}`),
  ].join("\n");
}

/** Compatibility keys describe storage meaning, not question completion. */
export function buildExtractionInsightChecklistSection(args: {
  checklistContext?: OnboardingChecklistLocationContext;
  checklistCoverage?: OnboardingChecklistCoverage | null;
}) {
  return [
    "## Existing Brief compatibility fields",
    ...getInsightChecklist(args.checklistContext).map(
      (item) => `- "${item.key}" (${item.label}): ${item.promptHint}`
    ),
  ].join("\n");
}

/** 저장된 추천 수신 설정과 profile visibility를 모델이 이해할 수 있는 runtime 블록으로 만든다. */
export function buildKnownPreferencesSection(
  prefs: CareerPromptPreferences | null | undefined,
  options?: { factsOnly?: boolean }
) {
  if (!prefs) return "";
  if (options?.factsOnly) return [
    "## Recommendation and profile settings",
    `Proactive external recommendations: ${prefs.getExternalRecommendation ?? "unknown"}`,
    `Profile visibility: ${prefs.profileVisibility ?? "unknown"}`,
    `Subscription status: ${prefs.talentSettingStatus ?? "unknown"}`,
  ].join("\n");

  const lines: string[] = [];
  if (typeof prefs.getExternalRecommendation === "boolean") {
    lines.push(
      `- getExternalRecommendation: ${prefs.getExternalRecommendation}`
    );
  }

  if (typeof prefs.profileVisibility === "string" && prefs.profileVisibility) {
    if (prefs.profileVisibility === "open_to_matches") {
      lines.push(
        "- Proactive profile sharing: Harper may share the profile with fitting companies, which can express interest afterward."
      );
    } else if (prefs.profileVisibility === "exceptional_only") {
      lines.push(
        "- Proactive profile sharing: ask the candidate before introducing them to a company."
      );
    } else if (prefs.profileVisibility === "dont_share") {
      lines.push(
        "- Internal opportunity visibility: all matching/profile-sharing contact is disabled."
      );
    } else {
      lines.push(
        "- Internal opportunity visibility: company-initiated profile-review offers are not enabled."
      );
    }
  }
  if (prefs.talentSettingStatus === "stopped") {
    lines.push("- Proactive external recommendations are paused. This is not a global ban on explicit user tasks, scheduled delegated work, or existing company-request obligations. Do not silently change this preference.");
  }
  lines.push("- Contact timing comes from the current schedules. Choose agent-managed timing from context; preserve explicit user schedules. Legacy batch size and lifecycle labels do not set a recommendation quota or cadence.");
  if (prefs.profileVisibility === "dont_share") {
    lines.push("- recommendationMode: all_matching_contact_disabled");
    lines.push(
      "- All Harper matching/profile-sharing contact is disabled. If the user wants recommendations again, use update_setting action=resume before continuing recommendation/contact behavior."
    );
  } else if (prefs.getExternalRecommendation === false) {
    lines.push("- recommendationMode: directly_connectable_opportunities_only");
    lines.push(
      "- Proactive external/public posting recommendations are disabled. A direct request to research a posting does not by itself re-enable recurring recommendations."
    );
    if (prefs.profileVisibility === "open_to_matches") {
      lines.push(
        "- The user may still receive Harper intro opportunities and company-initiated interest after a company reviews the shared profile."
      );
    } else {
      lines.push(
        "- Harper can suggest intro opportunities privately; the current setting does not allow proactive company profile sharing."
      );
    }
  }
  if (lines.length === 0) return "";

  return ["## 현재 recommendation/profile settings", ...lines].join("\n");
}

/** 온보딩 직후 opportunity search 진행 상태를 모델에게 알려주는 runtime 블록을 만든다. */
export function buildOpportunityStatusSection(
  status: CareerPromptOpportunityStatus | null | undefined,
  dateTimeOptions?: CareerPromptDateTimeOptions,
  options?: { factsOnly?: boolean }
) {
  if (!status) return "";

  const lines: string[] = [];
  const onboardingCompletedAt = formatCareerPromptCompactDateTime(
    status.onboardingCompletedAt,
    dateTimeOptions
  );
  if (onboardingCompletedAt) {
    lines.push(`- onboardingCompletedAt: ${onboardingCompletedAt}`);
  }
  if (status.activeRunStatus) {
    lines.push(`- activeOpportunitySearchStatus: ${status.activeRunStatus}`);
  }
  const activeRunCreatedAt = formatCareerPromptCompactDateTime(
    status.activeRunCreatedAt,
    dateTimeOptions
  );
  if (activeRunCreatedAt) {
    lines.push(`- activeOpportunitySearchCreatedAt: ${activeRunCreatedAt}`);
  }
  if (status.isInitialSearchRunning) {
    lines.push(
      "- Initial Career work is currently queued/running/handed_off after onboarding completion."
    );
    lines.push(
      "- Queued means waiting to start; running is worker execution; handed_off means the original Career agent owns the work. None is proof of completed search or delivery. The work is independent of the current conversation, so the user can keep chatting."
    );
    if (!options?.factsOnly) lines.push(
      "- When discussing progress, use recorded times and actual results. A pending status does not establish a delivery deadline. If an earlier conversation made a specific promise, address that actual promise without inventing a new deadline."
    );
    if (!options?.factsOnly) lines.push(
      "- Do not ask them to restart onboarding or repeat the initial questions."
    );
  }

  return lines.length > 0
    ? sanitizeCareerPromptDateValues(
        ["## Opportunity discovery runtime state", ...lines].join("\n")
      )
    : "";
}

/** 구조화 프로필, 이력서 상태, 최근 추천 포지션을 하나의 profile_context 블록으로 묶는다. */
export function buildProfileContextBlock(args: {
  profile: CareerPromptProfile | null;
  recentRecommendedOpportunitiesText?: string | null;
  structuredProfileText: string;
}) {
  const resumeLinks = Array.isArray(args.profile?.resume_links)
    ? args.profile.resume_links.filter((link) => String(link ?? "").trim())
    : [];
  const resumeStatus = args.profile?.resume_file_name
    ? args.profile.resume_file_name
    : resumeLinks.length > 0
      ? `(resume/profile link present: ${resumeLinks.length})`
      : "No uploaded resume file or profile link. Structured profile facts below remain available.";

  return [
    `Resume status: ${resumeStatus}`,
    "",
    args.structuredProfileText || "[Structured Talent Profile]\n(none)",
    "",
    "## Recent recommended opportunities",
    args.recentRecommendedOpportunitiesText?.trim() || "(none)",
  ].join("\n");
}

/** Compact activity summaries plus at most five actually sent question refs. */
export function buildRecentActivitySummariesSection(
  events?: readonly CareerPromptActivitySummary[] | CareerPromptActivityPage | null,
  dateTimeOptions?: CareerPromptDateTimeOptions
) {
  const page = events && "items" in events ? events : null;
  const rows = (page ? page.items : events as readonly CareerPromptActivitySummary[] | null ?? [])
    .map((event) => ({
      created_at: formatCareerPromptCompactDateTime(
        event.created_at,
        dateTimeOptions
      ),
      summary: sanitizeCareerPromptDateValues(
        String(event.summary ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        dateTimeOptions
      ),
    }))
    .filter((event) => event.created_at && event.summary);

  if (rows.length === 0 && !page) return "";

  return sanitizeCareerPromptDateValues(
    [
      page ? `## Recent activity (${page.activityCoverage}); sent questions (${page.contactCoverage})` : "## Recent talent_activity_events",
      rows
        .map(
          (event) =>
            `- created_at: ${event.created_at}; summary: ${event.summary}`
        )
        .join("\n"),
    ].join("\n"),
    dateTimeOptions
  );
}

/** 이력서 파일/텍스트/링크 중 하나라도 있으면 true를 반환한다. */
function hasCareerResumeContext(profile: CareerPromptProfile | null) {
  const hasResumeFile = Boolean(profile?.resume_file_name?.trim());
  const hasResumeText = Boolean(profile?.resume_text?.trim());
  const hasResumeLink = Array.isArray(profile?.resume_links)
    ? profile.resume_links.some((link) => String(link ?? "").trim().length > 0)
    : false;

  return hasResumeFile || hasResumeText || hasResumeLink;
}

/** 온보딩 완료 후, 꼭 해야 할 말이 없을 때만 쓸 optional follow-up 후보를 하나의 우선순위 블록으로 만든다. */
export const CAREER_OPTIONAL_FOLLOWUP_PROMPTS = {
  follow_up_resume: `### Available profile sources
No resume file/link/text is available. This does not mean career history or experience is missing: use the structured profile and read_profile for its full rows before judging completeness. Ask for a concrete missing fact only when it would help the current task; the absence of a resume alone does not call for another request.`,
  follow_up_question: `
### Priority 3: General question opportunities
- experience depth: when company/title exists but actual work, ownership, products, or impact are shallow. Example question: 이력을 보면 ~~를 하셨는데/다니셨는데 구체적으로 어떤 제품이나 서비스를 만드셨나요?
`,
  follow_up_waiting: `### While Harper's initial post-onboarding opportunity search is pending
- Onboarding is complete. Initial work is queued, worker-owned or handed to the Career agent; this alone does not prove search progress or delivery. Treat this as optional enrichment, not a second onboarding flow. This phase ends when that invocation ends, even if it produces no opportunity or sends no recommendation email. Ground progress answers in current execution and delivery facts. If a previous message made a timing promise, address that promise using the actual history.
- The numbered optional priorities in this section still take precedence. Use this guidance only within the one optional follow-up allowed for the response.
- Address the latest message and every higher-priority instruction first. Do not append this guidance automatically to every reply.
- When there is a natural opening, inspect the full profile and conversation and choose at most one candidate-specific detail whose answer would materially improve future opportunity selection or how Harper represents the candidate to a company. Ask from something already known rather than saying only "tell me more." The model decides what is useful; examples such as ownership, impact, products, collaboration, constraints, or ambitions are illustrative, not a checklist or trigger list.
- Briefly explain why the detail could help and that answering is optional. Do not promise that newly shared information will affect an initial search that is already running; it can improve future recommendations and company introductions.
- If a higher-priority instruction already requires a question, do not add another question. A short, non-question invitation to share more later is enough. If no genuinely useful detail is apparent, ask nothing.
- Optional referral-program mention: only when it fits the conversation naturally, has not already been mentioned in the conversation, and does not compete with a more useful candidate-focused follow-up, you may briefly explain that the Settings tab lets the user invite an acquaintance. If the invited person signs up through the invitation and later changes jobs through Harper, the inviter may receive approximately KRW 5,000,000–15,000,000 from Harper's fee, depending on the actual hiring, contract, and program terms. Present this as an optional program, never as guaranteed compensation or as something that improves the user's own matching. Do not combine the referral mention with another optional question.`,
  follow_up_header: `## Optional follow-up opportunities
Use this section only when there is no higher-priority instruction, no required onboarding/checklist question, and the conversation has a natural opening.
Ask at most one optional follow-up. Do not combine multiple optional questions in one response.`,
} as const;

export function buildOptionalFollowUpOpportunitiesSection(args: {
  activeInternalFitHoldQuestion?: ActiveInternalFitHoldQuestion | null;
  canRecordInternalFitHoldQuestion?: boolean;
  isConversationCompletedOpportunityRunActive?: boolean;
  isOnboardingActive: boolean;
  profile: CareerPromptProfile | null;
  promptExperiment?: CareerPromptExperiment;
}) {
  if (args.isOnboardingActive) return "";
  const guide = (key: keyof typeof CAREER_OPTIONAL_FOLLOWUP_PROMPTS) =>
    careerPromptText(args.promptExperiment, key, CAREER_OPTIONAL_FOLLOWUP_PROMPTS[key]);

  const resumeNudge = hasCareerResumeContext(args.profile)
    ? ""
    : guide("follow_up_resume");

  const questionOpportunitiesLines = guide("follow_up_question");

  const initialSearchWaitingGuidance =
    args.isConversationCompletedOpportunityRunActive === true
      ? guide("follow_up_waiting")
      : "";

  return [
    guide("follow_up_header"),
    initialSearchWaitingGuidance,
    resumeNudge,
    questionOpportunitiesLines,
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

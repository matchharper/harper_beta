import {
  ONBOARDING_FINAL_CONFIRMATION_KEY,
  ONBOARDING_QUESTION_MIN_COVERED_COUNT,
  getInsightChecklist,
  getOnboardingAdditionalQuestionKeys,
  getOnboardingQuestionChecklist,
  getOnboardingRequiredQuestionKeys,
  type OnboardingChecklistLocationContext,
} from "@/lib/talentOnboarding/insightChecklist";
import type { ActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import {
  CAREER_CANONICAL_TALENT_INSIGHT_SLOTS,
  CAREER_HARPER_LINK_OUTPUT_RULE,
} from "@/lib/career/prompts/rawPrompts";
import {
  cleanCareerPromptInlineValue,
  formatCareerPromptCompactDateTime,
  sanitizeCareerPromptDateValues,
} from "@/lib/career/prompts/promptUtils";
import type {
  CareerPromptActivitySummary,
  CareerPromptChannel,
  CareerPromptOpportunityStatus,
  CareerPromptPreferences,
  CareerPromptProfile,
  OnboardingChecklistCoverage,
} from "@/lib/career/prompts/types";
import type { MatchedInternalRoleCompanyIndexItem } from "@/lib/career/internalRoleSearch";

/** 현재 대화 채널을 모델 prompt에 넣을 사람이 읽는 라벨로 바꾼다. */
export function getCareerChannelType(channel: CareerPromptChannel) {
  return channel === "voice" ? "Voice Call" : "Text Chat";
}

/** 채널별 출력 규칙을 만든다. voice에는 voice 규칙만, text에는 markdown/chat 규칙만 넣는다. */
export function buildCareerChannelContextRules(channel: CareerPromptChannel) {
  if (channel === "voice") {
    return [
      "The candidate is currently communicating through Voice Call.",
      "- Do not use markdown-like formatting.",
      "- Speak naturally and concisely, as in a real conversation.",
    ].join("\n");
  }

  return [
    "The candidate is currently communicating through Text Chat.",
    "- Use Markdown for better readability.",
    "- Use short headings, bullets, bold text for important terms such as role or company names, lists, links, or code blocks.",
    "- Do not use emojis.",
    "- When asking a question to the user to choose one of 2 answer options, you can append exactly one raw choice button block after the visible question. But do not use this too frequently.",
    "  [[CAREER_CHOICE_BUTTONS]]",
    '  {"choices":["Option A","Option B"]}',
    "  [[/CAREER_CHOICE_BUTTONS]]",
    "- Keep each choice short and self-contained, including simple yes/no choices. The front end will render the choices as vertical full-width buttons and send the selected choice text back as the user's reply.",
    "- Do not put the choice button block inside a Markdown code block.",
    CAREER_HARPER_LINK_OUTPUT_RULE,
    "",
  ].join("\n");
}

/** chat prompt에서는 key를 따옴표로 감싸 모델이 literal key로 보기 쉽게 만든다. */
function renderInsightKey(key: string, quoteKeys: boolean) {
  return quoteKeys ? `"${key}"` : key;
}

/** checklist coverage에서 실제 covered 값만 남겨 runtime state를 정규화한다. */
function normalizePromptChecklistCoverage(
  coverage: OnboardingChecklistCoverage | null | undefined
): OnboardingChecklistCoverage {
  const normalized: OnboardingChecklistCoverage = {};
  for (const [key, value] of Object.entries(coverage ?? {})) {
    if (value === "covered") normalized[key] = "covered";
  }
  return normalized;
}

/** 온보딩 완료 후 메인 대화에 넣는 저장된 future-matching memory 블록을 만든다. */
export function buildKnownFutureMatchingInsightsSection(args: {
  content: Record<string, string> | null;
  quoteKeys?: boolean;
}) {
  const goodToRememberInsights: { key: string; label: string }[] = [
    {
      key: "external_delivery_selectivity",
      label:
        "ex. 진짜 확실히 핏이 맞는 기회만 가끔 추천받고 싶어요. 처럼 외부 기회 추천 기준을 명시하는 경우.",
    },
    {
      key: "matching_preference",
      label:
        "유저가 직접 이 조건을 추천에 반영해줘.라고 말했지만 다른 insights에 해당하는 key가 없는 경우.",
    },
  ];
  const { content, quoteKeys = false } = args;
  const insightEntries = Object.entries(content ?? {})
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  const insightLines = insightEntries.map(
    ([key, value]) => `- ${renderInsightKey(key, quoteKeys)} : ${value}`
  );

  if (insightLines.length === 0) return "";

  const remainNudges = goodToRememberInsights
    .filter((insight) => !insightEntries.some(([key]) => key === insight.key))
    .map((insight) => `- ${insight.key} : empty (${insight.label})`);

  return [
    "## Known future-matching insights/preferences",
    "Saved durable matching memory from talent_insights.content. Use this to understand the user's current preferences, avoid duplicate writes, and merge only genuinely new future-matching updates.",
    insightLines.join("\n"),
    remainNudges.length > 0
      ? `## Good to remember insights\n${remainNudges.join("\n")}`
      : "",
  ].join("\n");
}

/** 온보딩 중 메인 대화에 들어가는 checklist 진행/종료 조건/현재 insight 값을 한 번에 만든다. */
export function buildOnboardingRuntimeStateSection(args: {
  checklistContext?: OnboardingChecklistLocationContext;
  checklistCoverage?: OnboardingChecklistCoverage | null;
  content: Record<string, string> | null;
  quoteKeys?: boolean;
}) {
  const {
    checklistContext,
    checklistCoverage,
    content,
    quoteKeys = false,
  } = args;
  const currentContent = content ?? {};
  const coverage = normalizePromptChecklistCoverage(checklistCoverage);
  const insightChecklist = getInsightChecklist(checklistContext);
  const onboardingChecklist = getOnboardingQuestionChecklist(checklistContext);
  const requiredAdditionalQuestionKeys =
    getOnboardingAdditionalQuestionKeys(checklistContext);
  const requiredAdditionalQuestionKeysText =
    requiredAdditionalQuestionKeys.length > 0
      ? requiredAdditionalQuestionKeys.join(", ")
      : "(none)";
  const requiredQuestionKeys =
    getOnboardingRequiredQuestionKeys(checklistContext);
  const coveredChecklistItems = onboardingChecklist.filter(
    (item) => coverage[item.key] === "covered"
  );
  const filledInsightCount = Object.values(currentContent).filter(
    (value) => typeof value === "string" && value.trim().length > 0
  ).length;
  const canonicalFilledInsightCount = insightChecklist.filter((item) => {
    const value = currentContent[item.key];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
  const missingRequiredAdditionalQuestionKeys =
    requiredAdditionalQuestionKeys.filter((key) => coverage[key] !== "covered");
  const missingCountryRequiredQuestionKeys = requiredQuestionKeys.filter(
    (key) => coverage[key] !== "covered"
  );
  const isMinimumCoverageMet =
    coveredChecklistItems.length >= ONBOARDING_QUESTION_MIN_COVERED_COUNT;
  const isLanguageCovered = coverage.language === "covered";
  const isFinalPriorityConfirmationCovered =
    coverage[ONBOARDING_FINAL_CONFIRMATION_KEY] === "covered";

  const checklistKeys = new Set(insightChecklist.map((item) => item.key));
  const checklistLines = [...onboardingChecklist]
    .sort((left, right) => left.priority - right.priority)
    .map((item) => {
      const value = currentContent[item.insightKey ?? item.key]?.trim();
      return [
        `- ${renderInsightKey(item.key, quoteKeys)} (${item.label})`,
        `  - status: ${coverage[item.key] === "covered" ? "covered" : "missing"}`,
        coverage[item.key] !== "covered" &&
          `  - promptHint: ${item.promptHint}`,
        item.insightKey &&
          `  - current insight value: ${value || "(아직 없음)"}`,
      ].join("\n");
    });

  const extraLines = Object.entries(currentContent)
    .filter(
      ([key, value]) => !checklistKeys.has(key) && value.trim().length > 0
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `- ${renderInsightKey(key, quoteKeys)}\n  - 현재 값: ${value.trim()}`
    );

  const onboardingSummary = [
    "## Onboarding runtime state",
    "### Source of truth",
    "- Use checklist coverage below as the only progress source of truth.",
    "- Do not infer onboarding progress from filled insight count or recent-message guesses.",
    "- If a checklist key is covered, do not ask that topic again even if the corresponding insight value is empty or terse.",
    "- The latest user reply may not yet be reflected in checklist coverage. If recent conversation clearly shows Harper already asked final_priority_confirmation and the latest user reply answered it, you may treat final_priority_confirmation as effectively satisfied for this response.",
    "### Closing conditions",
    `- Minimum covered checklist items: ${coveredChecklistItems.length}/${ONBOARDING_QUESTION_MIN_COVERED_COUNT} (${isMinimumCoverageMet ? "satisfied" : "not yet"})`,
    `- Language checklist key: ${isLanguageCovered ? "covered" : "missing"}`,
    `- Required country-specific keys: ${
      requiredQuestionKeys.length > 0
        ? requiredQuestionKeys.join(", ")
        : "(none)"
    }`,
    `- Missing country-specific keys: ${
      missingCountryRequiredQuestionKeys.length > 0
        ? missingCountryRequiredQuestionKeys.join(", ")
        : "(none)"
    }`,
    `- Required additional_question keys: ${requiredAdditionalQuestionKeysText}`,
    `- Missing additional_question keys: ${
      missingRequiredAdditionalQuestionKeys.length > 0
        ? missingRequiredAdditionalQuestionKeys.join(", ")
        : "(none)"
    }`,
    `- Final priority confirmation: ${isFinalPriorityConfirmationCovered ? "covered" : "missing"}`,
    "### Choosing the next response",
    "- Use the checklist and recent conversation to choose one natural next question or closing move.",
    "- Prefer a missing checklist item that fits the user's latest answer and the conversation flow; do not mechanically follow list order when another missing item is clearly more natural.",
    "- Ask at most one question.",
    "- Do not close until all closing conditions above are satisfied, except that a latest reply that clearly answered final_priority_confirmation may count for this response.",
    "- If all closing conditions are satisfied, close onboarding with the required completion marker instead of asking another question.",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");

  const dynamicPrompt = [
    onboardingSummary,
    "## Onboarding Question Checklist",
    "Use missing items and their promptHint as options for the next natural question.",
    checklistLines.join("\n"),
    "## Current insight values",
    "- These values help avoid repetition, but they are not the onboarding progress source of truth.",
    `- Filled insights: ${filledInsightCount}`,
    `- Filled canonical checklist insights: ${canonicalFilledInsightCount}/${insightChecklist.length}`,
    extraLines.length > 0
      ? ["## Other current insights", extraLines.join("\n")].join("\n")
      : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return [
    dynamicPrompt,
    "## Additional question policy",
    "- Additional questions are checklist items, not a separate progress system.",
    "- Ask only required additional_question keys shown in the checklist. Never invent an additional_question key that is not listed.",
    "- When the next missing checklist item is an additional_question item, ask one concise additional question directly. Do not call a selector tool or mention internal checklist keys.",
    '- Choose the additional question by asking: "What gap would most improve future opportunity matching for this person right now?"',
    "Selection priority:",
    "1. Substantial experience exists but its description is empty, especially around 6+ months or roughly a year. Ask what they actually did in that period once, using the company/role/date context.",
    "2. Recent or important experience exists but direct contribution is unclear.",
    "3. Short tenure, career transition, gap, or role/domain change needs interpretation.",
    "4. The profile strengths and the desired next opportunity have a mismatch or unresolved gap.",
    "5. Role-specific depth is unclear.",
    "6. Role-specific preference would improve matching, such as paid channel depth, B2C vs B2B product preference, or AI application layer vs foundation/infrastructure direction.",
    "Do not repeatedly ask broad desired role or tech-stack preference questions. If those were already asked or answered in recent conversation, choose a concrete profile-gap question instead.",
    "Fallback examples: 최근 역할이나 대표 경험 중에서 실제로 본인이 더 많이 맡았던 부분은 어디였어요? / 최근 경험에서 본인이 직접 만든 변화나 결과를 하나만 꼽으면 뭐가 있을까요?",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/** insight extraction 전용 prompt에 들어갈 checklist/현재값/coverage 기준 블록을 만든다. */
export function buildExtractionInsightChecklistSection(args: {
  checklistContext?: OnboardingChecklistLocationContext;
  checklistCoverage?: OnboardingChecklistCoverage | null;
  content: Record<string, string> | null;
}) {
  const { checklistContext, checklistCoverage, content } = args;
  const currentContent = content ?? {};
  const coverage = normalizePromptChecklistCoverage(checklistCoverage);
  const insightChecklist = getInsightChecklist(checklistContext);
  const onboardingChecklist = getOnboardingQuestionChecklist(checklistContext);
  const canonicalKeys = [...insightChecklist]
    .sort((left, right) => left.priority - right.priority)
    .map((item) => `"${item.key}"`);
  const checklistKeys = new Set(insightChecklist.map((item) => item.key));
  const checklistLines = [...insightChecklist]
    .sort((left, right) => left.priority - right.priority)
    .map((item) => {
      const value = currentContent[item.key]?.trim();
      return `- "${item.key}" (${item.label}): ${item.promptHint}\n  current_value: ${value ? `"${value}"` : "null"}`;
    });
  const onboardingChecklistLines = [...onboardingChecklist]
    .sort((left, right) => left.priority - right.priority)
    .map((item) => {
      const currentValue = item.insightKey
        ? currentContent[item.insightKey]?.trim()
        : "";
      return [
        `- "${item.key}" (${item.label})`,
        `  kind: ${item.kind}`,
        item.insightKey ? `  insight_key: "${item.insightKey}"` : "",
        `  current_status: ${coverage[item.key] === "covered" ? "covered" : "missing"}`,
        currentValue ? `  current_insight_value: "${currentValue}"` : "",
        `  question hint: ${item.promptHint}`,
      ]
        .filter((line) => line.trim().length > 0)
        .join("\n");
    });
  const extraLines = Object.entries(currentContent)
    .filter(
      ([key, value]) => !checklistKeys.has(key) && value.trim().length > 0
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- "${key}": "${value.trim()}"`);

  return [
    "## Canonical insight keys",
    canonicalKeys.join(", "),
    "## Insight fields and current values",
    checklistLines.join("\n"),
    "## Onboarding question checklist coverage",
    "Only output checklist keys that became covered in the given transcript and are not already covered.",
    "A single user reply can cover multiple checklist keys. If Harper asked final_priority_confirmation and the user answers with an additional must-have condition to remember for future matching, include both final_priority_confirmation and must_haves, and extract the condition under the must_haves insight key.",
    onboardingChecklistLines.join("\n"),
    extraLines.length > 0
      ? ["## Other current insights", extraLines.join("\n")].join("\n")
      : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/** 저장된 추천 수신 설정과 profile visibility를 모델이 이해할 수 있는 runtime 블록으로 만든다. */
export function buildKnownPreferencesSection(
  prefs: CareerPromptPreferences | null | undefined
) {
  if (!prefs) return "";

  const lines: string[] = [];
  if (typeof prefs.getExternalRecommendation === "boolean") {
    lines.push(
      `- getExternalRecommendation: ${prefs.getExternalRecommendation}`
    );
  }

  if (typeof prefs.profileVisibility === "string" && prefs.profileVisibility) {
    if (prefs.profileVisibility === "open_to_matches") {
      lines.push(
        "- Internal opportunity visibility: open to company-initiated profile-review offers."
      );
    } else if (prefs.profileVisibility === "exceptional_only") {
      lines.push(
        "- Internal opportunity visibility: only exceptional company-initiated profile-review offers are allowed."
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
  if (
    typeof prefs.recommendationBatchSize === "number" &&
    Number.isFinite(prefs.recommendationBatchSize)
  ) {
    lines.push(`- recommendationBatchSize: ${prefs.recommendationBatchSize}`);
  }
  const cadenceGuidance = buildRecommendationCadenceGuidance(prefs);
  if (cadenceGuidance) {
    lines.push(`- recommendationCycle: ${cadenceGuidance}`);
  }
  if (prefs.profileVisibility === "dont_share") {
    lines.push("- recommendationMode: all_matching_contact_disabled");
    lines.push(
      "- All Harper matching/profile-sharing contact is disabled. If the user wants recommendations again, use update_setting action=resume before continuing recommendation/contact behavior."
    );
  } else if (prefs.getExternalRecommendation === false) {
    lines.push("- recommendationMode: directly_connectable_opportunities_only");
    lines.push(
      "- external/public job posting recommendations are disabled; do not use recommend_job_postings unless the user explicitly asks to turn external recommendations back on first."
    );
    if (prefs.profileVisibility === "open_to_matches") {
      lines.push(
        "- Open to matches means the user may still receive directly connectable opportunity suggestions and company-initiated connection offers after a company reviews the profile."
      );
    } else {
      lines.push(
        "- Not Open to matches means directly connectable opportunities should be Harper-suggested only, not company-initiated profile-review offers."
      );
    }
  }
  if (lines.length === 0) return "";

  return ["## 현재 recommendation/profile settings", ...lines].join("\n");
}

/** 추천 발송 주기를 사람이 이해할 수 있는 안내 문장으로 압축한다. */
function buildRecommendationCadenceGuidance(
  prefs: CareerPromptPreferences
): string | null {
  const status = String(prefs.talentSettingStatus ?? "")
    .trim()
    .toLowerCase();

  const periodicIntervalDays =
    typeof prefs.periodicIntervalDays === "number" &&
    Number.isFinite(prefs.periodicIntervalDays)
      ? Math.max(1, Math.min(7, Math.floor(prefs.periodicIntervalDays)))
      : 3;

  const recommendationBatchSize =
    typeof prefs.recommendationBatchSize === "number" &&
    Number.isFinite(prefs.recommendationBatchSize)
      ? Math.max(3, Math.min(10, Math.floor(prefs.recommendationBatchSize)))
      : 3;

  if (status === "active") {
    return `현재 유저는 active 상태다. 높은 빈도로 오픈포지션을 찾아서 알려준다. 오래 유의미한 반응이 없으면 passive로 바뀌어 주기가 길어지고, 추천 공고 2개에 연속 피드백하면 현재 주기가 유지된다. 현재 기준은 ${periodicIntervalDays}일마다 최대 ${recommendationBatchSize}개다.`;
  }
  if (status === "passive") {
    return `현재 유저는 passive 상태다. 오래 유의미한 액션이 없어 외부 오픈포지션은 낮은 빈도로만 보낸다. 추천 공고 2개에 연속 피드백하거나 새 공고 추천을 요청하면 active로 돌아가 더 자주 보낼 수 있다. 현재 기준은 ${periodicIntervalDays * 2}일마다 최대 ${recommendationBatchSize}개다.`;
  }
  if (status === "stopped") {
    return "현재 유저는 stopped 상태다. 오래 유의미한 액션이 없어 외부 오픈포지션 정기 추천은 멈춘 상태다. 유저가 새 공고 추천을 직접 요청하면 active로 돌아가 추천을 재개할 수 있다.";
  }
  return null;
}

/** 온보딩 직후 opportunity search 진행 상태를 모델에게 알려주는 runtime 블록을 만든다. */
export function buildOpportunityStatusSection(
  status: CareerPromptOpportunityStatus | null | undefined
) {
  if (!status) return "";

  const lines: string[] = [];
  const onboardingCompletedAt = formatCareerPromptCompactDateTime(
    status.onboardingCompletedAt
  );
  if (onboardingCompletedAt) {
    lines.push(`- onboardingCompletedAt: ${onboardingCompletedAt}`);
  }
  if (status.activeRunStatus) {
    lines.push(`- activeOpportunitySearchStatus: ${status.activeRunStatus}`);
  }
  const activeRunCreatedAt = formatCareerPromptCompactDateTime(
    status.activeRunCreatedAt
  );
  if (activeRunCreatedAt) {
    lines.push(`- activeOpportunitySearchCreatedAt: ${activeRunCreatedAt}`);
  }
  if (status.isInitialSearchRunning) {
    lines.push(
      "- Initial opportunity search is currently queued/running after onboarding completion."
    );
    lines.push(
      "- If the user asks what to do now or whether anything is happening, answer that Harper has just finished the onboarding conversation and is now looking for fitting opportunities. Say Harper should follow up within up to 1 hour, and the user can wait. Also mention that sharing more details about preferences, constraints, or target roles can improve the recommendations."
    );
    lines.push(
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
      : "(none) - 유저 정보가 너무 부족할 때는 이력서 업로드만 요구하지 말고, 이력서 PDF / 말로 경험 설명 / 넓게 받아보고 반응으로 좁히기 중 선택지를 자연스럽게 제시해라.";

  return [
    `Resume status: ${resumeStatus}`,
    "",
    args.structuredProfileText || "[Structured Talent Profile]\n(none)",
    "",
    "## Recent recommended opportunities",
    args.recentRecommendedOpportunitiesText?.trim() || "(none)",
  ].join("\n");
}

/** 최근 talent activity event 요약을 text chat prompt에 넣을 짧은 블록으로 만든다. */
export function buildRecentActivitySummariesSection(
  events?: readonly CareerPromptActivitySummary[] | null
) {
  const rows = (events ?? [])
    .slice(0, 5)
    .map((event) => ({
      created_at: formatCareerPromptCompactDateTime(event.created_at),
      summary: sanitizeCareerPromptDateValues(
        String(event.summary ?? "")
          .replace(/\s+/g, " ")
          .trim()
      ),
    }))
    .filter((event) => event.created_at && event.summary);

  if (rows.length === 0) return "";

  return sanitizeCareerPromptDateValues(
    [
      "## Recent talent_activity_events",
      rows
        .map(
          (event) =>
            `- created_at: ${event.created_at}; summary: ${event.summary}`
        )
        .join("\n"),
    ].join("\n")
  );
}

export function buildMatchedInternalRoleCompanyIndexSection(
  items?: readonly MatchedInternalRoleCompanyIndexItem[] | null
) {
  const lines = (items ?? [])
    .slice(0, 8)
    .filter((item) => item.company.trim() && item.roleCount > 0)
    .map((item) => `- ${item.company}: ${item.roleCount} active role(s)`);
  if (lines.length === 0) return "";

  return [
    "## Harper-connected roles already credible for this user",
    "This is only a compact company-level index. It is not a list to recite. When the user asks for other credible roles or compares roles at one company, use get_internal_roles with matchedOnly=true to inspect the relevant small set before answering.",
    ...lines,
  ].join("\n");
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
export function buildOptionalFollowUpOpportunitiesSection(args: {
  activeInternalFitHoldQuestion?: ActiveInternalFitHoldQuestion | null;
  canRecordInternalFitHoldQuestion: boolean;
  currentInsightContent: Record<string, string> | null;
  isOnboardingActive: boolean;
  profile: CareerPromptProfile | null;
}) {
  if (args.isOnboardingActive) return "";

  const insightContent = args.currentInsightContent ?? {};
  const fitId = args.canRecordInternalFitHoldQuestion
    ? cleanCareerPromptInlineValue(
        args.activeInternalFitHoldQuestion?.fitId,
        120
      )
    : "";
  const hiddenHoldSummary = args.canRecordInternalFitHoldQuestion
    ? cleanCareerPromptInlineValue(
        args.activeInternalFitHoldQuestion?.summary,
        1000
      )
    : "";

  const insightSlotLines = CAREER_CANONICAL_TALENT_INSIGHT_SLOTS.map((slot) => {
    const currentValue = cleanCareerPromptInlineValue(insightContent[slot.key]);
    if (currentValue) return null;
    return `- ${slot.key}: ${slot.label}`;
  }).filter((line): line is string => Boolean(line));

  const hiddenHoldLines =
    fitId && hiddenHoldSummary
      ? `
### Priority 1: Internal opportunity clarification
This is private matching context. Do not reveal it.
fitId: ${fitId}
summary: ${hiddenHoldSummary}
- If the user's latest message clearly answers this, call 'record_internal_fit_reevaluation_information' before replying.
- If there is no higher-priority thing to say and a question would be natural, you may ask this as one light clarification. You can introduce it like: "가볍게 답변해주시면 내부 기회 연결에 큰 도움이 될 질문이 하나 있어요."
- Do not ask this frequently just because it exists.
- Do not mention hidden roles, internal fit, hold labels, scores, or reevaluation.`
      : "";

  const resumeNudge = hasCareerResumeContext(args.profile)
    ? ""
    : `### Priority 2: Resume/profile context request
- No resume file/link/text is available. If more context would clearly help and the conversation has a natural opening, gently offer one path: upload a resume in Profile Tab, have a quick call, or continue in chat. Do not force it.`;

  const questionOpportunitiesLines = `
### Priority 3: General question opportunities
- experience depth: when company/title exists but actual work, ownership, products, or impact are shallow. Example question: 이력을 보면 ~~를 하셨는데/다니셨는데 구체적으로 어떤 제품이나 서비스를 만드셨나요?
`;

  const canonicalFutureMatchingMemorySlotsLines =
    insightSlotLines.length > 0
      ? `
### Priority 4: Canonical future-matching memory slots
Use these only for durable future matching memory. Prefer these keys before creating a new talentInsights key; do not store profile-row facts here.
${insightSlotLines.join("\n")}
`
      : "";

  return [
    "## Optional follow-up opportunities",
    "Use this section only when there is no higher-priority instruction, no required onboarding/checklist question, and the conversation has a natural opening.",
    "Ask at most one optional follow-up. Do not combine multiple optional questions in one response.",
    hiddenHoldLines,
    resumeNudge,
    questionOpportunitiesLines,
    canonicalFutureMatchingMemorySlotsLines,
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

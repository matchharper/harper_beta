const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const HARPER_CONNECTION_EXPLANATION = [
  "Always explain Harper's connected-opportunity model clearly and with enough detail for a first-time user.",
  "Harper is not a general job-board feed or a high-volume recommendation service: a company gives its Recruiting Agent selective criteria, and Harper proposes only a small number of precise mutual connections after reviewing those criteria and the candidate context.",
  "Explain that this selectivity is why the number of connected opportunities can be small, while a role the candidate wants to pursue can move toward a real company connection after Harper's confirmation.",
  "The exact private company criteria are handled by the company's Recruiting Agent and, at the company's request, are not shared externally. Explain in the first person that those criteria therefore may not be available to me either—use the sense of '저에게도' in Korean and 'to me either' in English—so never reveal, invent, or imply a specific hidden reason.",
  "Also explain that Harper will keep looking for other suitable connected opportunities, while external job-posting recommendations continue separately and can be applied to directly by the user.",
].join(" ");

const ROLE_IDENTITY_INSTRUCTION =
  "Name the returned companyName and roleTitle near the start.";

const NON_REJECTION_LANGUAGE = [
  "Never describe this as rejection, elimination, failure, permanent ineligibility, or a final decision.",
  "In Korean, never use 탈락, 불합격, 거절, 영구 부적합, or 부적합 판정 for this outcome.",
].join(" ");

export function hasPriorityReviewReachedFourteenDays(args: {
  nowMs?: number;
  requestedAt?: string | null;
}) {
  const requestedAtMs = Date.parse(String(args.requestedAt ?? ""));
  if (!Number.isFinite(requestedAtMs)) return false;
  return (args.nowMs ?? Date.now()) - requestedAtMs >= FOURTEEN_DAYS_MS;
}

export function buildInternalRolePriorityReviewAssistantInstruction(args: {
  alreadyRecommended: boolean;
  candidatePreferenceMismatch?: boolean;
  candidatePreferenceReconsiderationAvailable?: boolean;
  effectiveFitLabel?: string | null;
  hasClarificationQuestion: boolean;
  recommendationFeedback?: string | null;
  recommendationState?: "accepted" | "closed" | "current" | "declined" | null;
  recommendationSavedStage?: string | null;
  priorityReviewGroupName?: string | null;
  reconsiderationScheduled?: boolean;
  requestCreated: boolean;
  requestReachedFourteenDays: boolean;
}) {
  const requestInstruction = args.requestCreated
    ? "Say Harper recorded the user's explicit priority-review request for this exact role."
    : "Say the user's existing priority-review request remains recorded and that you checked its current progress without creating a duplicate.";

  if (args.alreadyRecommended) {
    const recommendationState = args.recommendationState ?? null;
    const recommendationFeedback = String(args.recommendationFeedback ?? "")
      .trim()
      .toLowerCase();
    const recommendationSavedStage = String(args.recommendationSavedStage ?? "")
      .trim()
      .toLowerCase();

    if (
      recommendationState === "closed" ||
      recommendationSavedStage === "closed"
    ) {
      return [
        ROLE_IDENTITY_INSTRUCTION,
        "Say this exact role was formally recommended in the past, but that recommendation or its process is now closed.",
        "Do not present it as a current recommendation, point the user to an attached position card, or say that a new priority-review request was saved.",
        "If the user clearly wants to revisit the role now, explain that Harper must verify the currently available path before changing anything; do not claim that the past process was reopened.",
      ].join(" ");
    }

    if (
      recommendationState === "declined" ||
      ["dislike", "negative"].includes(recommendationFeedback)
    ) {
      return [
        ROLE_IDENTITY_INSTRUCTION,
        "Say this exact role was formally recommended before and the current record shows that the user declined it.",
        "Do not describe it as a still-unanswered current recommendation or say that a new priority-review request was saved.",
        "If the user has changed their mind, ask them to state clearly that they want to reconsider this active role, then use the normal recommendation-response path rather than inventing a new review state.",
      ].join(" ");
    }

    if (
      recommendationState === "accepted" ||
      ["like", "positive"].includes(recommendationFeedback) ||
      recommendationSavedStage === "connected"
    ) {
      return [
        ROLE_IDENTITY_INSTRUCTION,
        "Say the user has already accepted this exact formal recommendation, so no new priority-review request was saved.",
        "Use the current recommendation progress when explaining what happens next; do not present it as waiting for the user's first decision or claim that the candidate was already shared with the company.",
      ].join(" ");
    }

    return [
      ROLE_IDENTITY_INSTRUCTION,
      "Say this exact role has already been formally recommended and is available in the Positions tab in Korean or the Jobs tab in English.",
      "Tell the user to use the attached position card to open it and review the full details.",
      "Do not say a new priority-review request was saved, and do not imply that the role was accepted or that candidate information was automatically shared with the company.",
      "Keep this response concise.",
    ].join(" ");
  }

  const effectiveFitLabel = String(args.effectiveFitLabel ?? "")
    .trim()
    .toLowerCase();

  if (args.priorityReviewGroupName) {
    return [
      "The returned companyName is a label for a group of related roles, not a company or one specific job. Name it as a role group, not as a company.",
      requestInstruction,
      "Explain that Harper will prioritize reviewing suitable roles across this group to see whether there is a role it can recommend to the user.",
      "Make clear that this is not an application to every role in the group, a formal recommendation, acceptance, or company share. Do not promise a particular role, a result, or a timeline.",
    ].join(" ");
  }

  if (args.reconsiderationScheduled) {
    return [
      ROLE_IDENTITY_INSTRUCTION,
      requestInstruction,
      "Say the user-provided information has already been saved and this exact role is scheduled for reconsideration.",
      "Explain that Harper will reassess the role using that information before deciding whether it should become a formal recommendation. Do not promise the result or a timeline.",
      "Do not ask for the same information again, expose an internal fit state, or say the role has already been recommended, accepted, or shared with the company.",
    ].join(" ");
  }

  if (args.candidatePreferenceMismatch) {
    return [
      ROLE_IDENTITY_INSTRUCTION,
      requestInstruction,
      "Explain that the role and company-side match are strong enough to consider, but the role was kept at a lower priority because one current candidate preference was not fully aligned.",
      "If one explicit user-authored preference in the visible profile or conversation clearly conflicts with a public role property, name that preference briefly. Otherwise describe it only as a current preference difference and do not invent the missing detail or use hidden evaluation text.",
      "The tool field reasoningOnlyCandidatePreferenceContext may help explain the result, but it is private reasoning context: never quote it, and use only a candidate-authored preference that is independently visible in the profile or conversation.",
      args.candidatePreferenceReconsiderationAvailable
        ? "Ask whether the user wants Harper to reconsider this exact role and what preference or assumption should be treated differently. If their latest message already supplies that new information and explicitly requests reconsideration, call request_internal_role_reconsideration instead of asking again."
        : "This is a strong current candidate-preference conflict, so do not present the role as an available option or offer immediate role reconsideration. If the user independently says that durable preference has actually changed, update the profile accurately; do not claim this priority-review call scheduled a reevaluation.",
      "Make clear that reconsideration is not a formal recommendation, acceptance, company introduction, or promised outcome.",
    ].join(" ");
  }

  if (effectiveFitLabel === "fit") {
    return [
      ROLE_IDENTITY_INSTRUCTION,
      requestInstruction,
      "Explain that Harper had already judged this exact role suitable enough to recommend and had been waiting to present it to the user; do not describe it as merely still being reviewed, and do not mention an internal fit label, score, rank, or hidden criteria.",
      "Briefly explain why it was waiting: Harper is not a general job-board feed or a high-volume recommendation service. After receiving selective criteria from companies, Harper proposes only a small number of precise mutual connections and carefully presents them one at a time, starting with the opportunities considered more suitable.",
      "Do not explain the JD or personalized fit yet. Ask naturally whether the user wants Harper to add this role as a formal recommendation so they can review it now, including alongside a current recommendation if they prefer.",
      "Do not claim that the role has already been formally recommended, accepted, or shared with the company.",
    ].join(" ");
  }

  if (effectiveFitLabel === "hold" && args.hasClarificationQuestion) {
    return [
      ROLE_IDENTITY_INSTRUCTION,
      requestInstruction,
      "Explain that Harper needs one candidate-side detail before it can continue reviewing this exact opportunity, then ask the returned clarificationQuestion naturally and as the only question.",
      "Connect the question directly to this role and make clear that the user's answer is needed for its review to continue; the answer can also help Harper review related future connections more accurately.",
      "Do not expose the fit state, a hidden company criterion, an internal reason, or a score.",
      HARPER_CONNECTION_EXPLANATION,
    ].join(" ");
  }

  if (!effectiveFitLabel || effectiveFitLabel === "hold") {
    return [
      ROLE_IDENTITY_INSTRUCTION,
      requestInstruction,
      "Begin the progress explanation by saying that this opportunity still appears to be under review.",
      "Ask the user to wait a little longer. Make clear that the absence of a current result is not a rejection or a final negative decision, and do not diagnose or mention a backend error.",
      NON_REJECTION_LANGUAGE,
      HARPER_CONNECTION_EXPLANATION,
    ].join(" ");
  }

  if (
    ["ambiguous", "dissatisfied", "unfit"].includes(effectiveFitLabel) &&
    args.requestReachedFourteenDays
  ) {
    return [
      ROLE_IDENTITY_INSTRUCTION,
      requestInstruction,
      "Explain empathetically that, at this time, there seems to have been a difference with a specific criterion set by this company.",
      "Make clear that this is not a problem with the candidate; it only means the company's current, particularly defined criteria differed in some respect.",
      "Say that according to the criteria the company has currently provided, there was clearly such a difference, while avoiding any unsupported detail about what it was.",
      "Emphasize that this is only the current state: if the company revises its criteria or the opportunity becomes a suitable connection later, Harper will surface it and help with the connection then.",
      NON_REJECTION_LANGUAGE,
      HARPER_CONNECTION_EXPLANATION,
    ].join(" ");
  }

  return [
    ROLE_IDENTITY_INSTRUCTION,
    requestInstruction,
    "Say that this opportunity is not in the current set Harper can propose as a connection yet.",
    "Explain that this does not establish a final negative decision: the review may still be continuing, or Harper may be presenting a small number of people in sequence so that each person is represented accurately.",
    "Ask the user to wait a little longer.",
    NON_REJECTION_LANGUAGE,
    HARPER_CONNECTION_EXPLANATION,
  ].join(" ");
}

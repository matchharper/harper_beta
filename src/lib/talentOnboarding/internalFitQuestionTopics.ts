export const INTERNAL_FIT_REEVALUATION_TOPICS = [
  "location",
  "work_authorization",
  "employment_type",
  "availability_or_timing",
  "compensation_requirement",
  "required_language",
  "required_qualification",
  "license_or_clearance",
  "other_candidate_fact",
] as const;

export type InternalFitReevaluationTopic =
  (typeof INTERNAL_FIT_REEVALUATION_TOPICS)[number];

export type InternalFitHoldQuestionTopicCandidate = {
  criteria: unknown;
  fitId: string;
  summary: string;
};

export type GroupedInternalFitHoldQuestion = {
  fitId: string;
  fitIds: string[];
  summary: string;
  topic: InternalFitReevaluationTopic;
};

const TOPIC_SET = new Set<string>(INTERNAL_FIT_REEVALUATION_TOPICS);

function cleanText(value: unknown, maxChars = 1000) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizedTopicKey(value: unknown) {
  return cleanText(value, 80).toLowerCase();
}

export function normalizeInternalFitQuestionText(value: unknown) {
  return cleanText(value, 1000);
}

function explicitInternalFitReevaluationTopic(
  criteria: unknown
): InternalFitReevaluationTopic | null {
  const record = asRecord(criteria);
  const topicKey = normalizedTopicKey(record?.topic);
  return TOPIC_SET.has(topicKey)
    ? (topicKey as InternalFitReevaluationTopic)
    : null;
}

export function hasExplicitInternalFitReevaluationTopic(criteria: unknown) {
  return explicitInternalFitReevaluationTopic(criteria) !== null;
}

export function groupInternalFitHoldQuestionCandidates(
  candidates: InternalFitHoldQuestionTopicCandidate[],
  locale?: string | null
): GroupedInternalFitHoldQuestion[] {
  const groups = new Map<
    InternalFitReevaluationTopic,
    GroupedInternalFitHoldQuestion
  >();
  void locale;

  for (const candidate of candidates) {
    const topic = explicitInternalFitReevaluationTopic(candidate.criteria);
    if (!topic) continue;
    const existing = groups.get(topic);
    if (existing) {
      existing.fitIds.push(candidate.fitId);
      continue;
    }
    const candidateQuestion = normalizeInternalFitQuestionText(
      candidate.summary
    );
    groups.set(topic, {
      fitId: candidate.fitId,
      fitIds: [candidate.fitId],
      summary: candidateQuestion,
      topic,
    });
  }

  return Array.from(groups.values());
}

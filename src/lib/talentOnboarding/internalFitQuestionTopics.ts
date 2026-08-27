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
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizedTopicKey(value: unknown) {
  return cleanText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
}

export function hasExplicitInternalFitReevaluationTopic(criteria: unknown) {
  const record = asRecord(criteria);
  return TOPIC_SET.has(normalizedTopicKey(record?.topic));
}

const TOPIC_ALIASES: Record<string, InternalFitReevaluationTopic> = {
  availability: "availability_or_timing",
  clearance: "license_or_clearance",
  company_stage_or_size: "other_candidate_fact",
  compensation: "compensation_requirement",
  contract_type: "employment_type",
  engagement_type: "employment_type",
  fit_detail: "other_candidate_fact",
  function_transition: "other_candidate_fact",
  language: "required_language",
  license: "license_or_clearance",
  location_feasibility: "location",
  location_preference: "location",
  location_scope: "location",
  qualification: "required_qualification",
  relocation: "location",
  timing: "availability_or_timing",
  visa: "work_authorization",
  visa_or_work_authorization: "work_authorization",
  work_mode: "location",
};

const TOPIC_INFERENCE: Array<{
  markers: string[];
  topic: InternalFitReevaluationTopic;
}> = [
  {
    topic: "work_authorization",
    markers: [
      "work authorization",
      "work permit",
      "sponsorship",
      "visa",
      "citizenship",
      "residency",
      "취업 자격",
      "취업 허가",
      "비자",
      "스폰서",
    ],
  },
  {
    topic: "location",
    markers: [
      "location",
      "relocat",
      "onsite",
      "on-site",
      "hybrid",
      "remote",
      "commute",
      "country",
      "region",
      "근무지",
      "근무 지역",
      "이주",
      "출근",
      "국가",
      "지역",
      "해외",
    ],
  },
  {
    topic: "employment_type",
    markers: [
      "employment type",
      "engagement type",
      "full-time",
      "contract",
      "freelance",
      "고용 형태",
      "계약직",
      "정규직",
    ],
  },
  {
    topic: "availability_or_timing",
    markers: [
      "availability",
      "start date",
      "notice period",
      "timing",
      "입사 가능",
      "시작 시점",
      "퇴사 통보",
    ],
  },
  {
    topic: "compensation_requirement",
    markers: ["compensation", "salary", "pay", "보상", "연봉", "급여"],
  },
  {
    topic: "required_language",
    markers: [
      "language",
      "english",
      "korean",
      "japanese",
      "언어",
      "영어",
      "한국어",
      "일본어",
    ],
  },
  {
    topic: "license_or_clearance",
    markers: [
      "license",
      "clearance",
      "certification",
      "면허",
      "인가",
      "보안 등급",
      "자격증",
    ],
  },
  {
    topic: "required_qualification",
    markers: [
      "qualification",
      "degree",
      "experience",
      "has done",
      "학위",
      "경험 여부",
      "수행 여부",
    ],
  },
];

export function normalizeInternalFitReevaluationTopic(
  criteria: unknown,
  fallbackSummary = ""
): InternalFitReevaluationTopic {
  const record = asRecord(criteria);
  const topicKey = normalizedTopicKey(record?.topic);
  if (TOPIC_SET.has(topicKey)) {
    return topicKey as InternalFitReevaluationTopic;
  }
  if (TOPIC_ALIASES[topicKey]) return TOPIC_ALIASES[topicKey];

  const searchable = cleanText(
    [
      fallbackSummary,
      record?.summary,
      record?.question,
      record?.wouldChangeIf,
      record?.reason,
      criteria,
    ]
      .filter((value) => typeof value === "string")
      .join(" "),
    2400
  ).toLowerCase();
  for (const item of TOPIC_INFERENCE) {
    if (item.markers.some((marker) => searchable.includes(marker))) {
      return item.topic;
    }
  }
  return "other_candidate_fact";
}

const USER_FACING_QUESTION_BY_LOCALE: Record<
  "en" | "ko",
  Record<InternalFitReevaluationTopic, string>
> = {
  en: {
    location:
      "If opportunities outside your current or preferred location are also in scope, which countries or regions would you realistically consider, including relocation or local onsite work?",
    work_authorization:
      "Which countries do you currently have work authorization, residency, or a visa for, and where would you need visa sponsorship?",
    employment_type:
      "Which employment types would you realistically consider, such as full-time or contract work?",
    availability_or_timing:
      "What would be a realistic timeline for changing roles or starting a new position?",
    compensation_requirement:
      "What compensation requirements should Harper consider when evaluating potential opportunities for you?",
    required_language:
      "Could you share your working proficiency or relevant experience in the languages these opportunities may require?",
    required_qualification:
      "Could you share whether you have the key qualifications or experience these opportunities may require?",
    license_or_clearance:
      "Could you share whether you hold any licenses, certifications, or security clearances these opportunities may require?",
    other_candidate_fact:
      "Are there any preferences or constraints around the type of work, responsibilities, or company environment that Harper should consider?",
  },
  ko: {
    location:
      "현재 또는 선호 지역 외의 기회도 고려하고 계시다면, 실제로 고려할 수 있는 국가·지역과 이주 또는 현지 근무 가능 범위를 알려주실 수 있나요?",
    work_authorization:
      "현재 취업 자격·거주권·비자를 보유한 국가와 비자 스폰서십이 필요한 국가를 알려주실 수 있나요?",
    employment_type:
      "정규직이나 계약직 등 현실적으로 고려할 수 있는 고용 형태를 알려주실 수 있나요?",
    availability_or_timing:
      "현실적으로 이직하거나 새로운 역할을 시작할 수 있는 시점을 알려주실 수 있나요?",
    compensation_requirement:
      "기회를 검토할 때 Harper가 고려해야 할 보상 조건을 알려주실 수 있나요?",
    required_language:
      "기회에서 요구할 수 있는 업무 언어의 사용 수준이나 관련 경험을 알려주실 수 있나요?",
    required_qualification:
      "기회에서 요구할 수 있는 핵심 자격이나 관련 경험을 보유하고 있는지 알려주실 수 있나요?",
    license_or_clearance:
      "기회에서 요구할 수 있는 면허·자격증·보안 인가를 보유하고 있는지 알려주실 수 있나요?",
    other_candidate_fact:
      "역할의 업무 방향·책임 범위나 회사 환경과 관련해 Harper가 고려해야 할 선호 또는 제약이 있다면 알려주실 수 있나요?",
  },
};

function groupedQuestionLocale(locale: string | null | undefined): "en" | "ko" {
  return cleanText(locale, 20).toLowerCase().startsWith("en") ? "en" : "ko";
}

export function groupInternalFitHoldQuestionCandidates(
  candidates: InternalFitHoldQuestionTopicCandidate[],
  locale?: string | null
): GroupedInternalFitHoldQuestion[] {
  const groups = new Map<
    InternalFitReevaluationTopic,
    GroupedInternalFitHoldQuestion
  >();
  const questions = USER_FACING_QUESTION_BY_LOCALE[groupedQuestionLocale(locale)];

  for (const candidate of candidates) {
    const topic = normalizeInternalFitReevaluationTopic(
      candidate.criteria,
      candidate.summary
    );
    const existing = groups.get(topic);
    if (existing) {
      existing.fitIds.push(candidate.fitId);
      continue;
    }
    groups.set(topic, {
      fitId: candidate.fitId,
      fitIds: [candidate.fitId],
      summary: questions[topic],
      topic,
    });
  }

  return Array.from(groups.values());
}

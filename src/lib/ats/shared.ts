export const ATS_SEQUENCE_STEP_COUNT = 4;
export const ATS_SEQUENCE_INTERVAL_DAYS = 2;
export const ATS_DEFAULT_SEQUENCE_TIME = "10:00";
export const ATS_DEFAULT_TIMEZONE_OFFSET_MINUTES = -540;
export const ATS_EMAIL_DISCOVERY_OPERATION_LIMIT = 20;

export type AtsEmailSourceType =
  | "candid"
  | "github"
  | "scholar"
  | "web"
  | "manual";

export type AtsEmailDiscoveryStatus =
  | "not_started"
  | "searching"
  | "found"
  | "not_found"
  | "manual"
  | "error";

export type AtsSequenceStatus = "draft" | "active" | "paused" | "completed";
export type AtsSequenceMarkStatus =
  | "need_email"
  | "find_fail"
  | "ready"
  | "in_sequence"
  | "linkedin_contacted"
  | "waiting_reply"
  | "replied"
  | "paused"
  | "closed";

export type AtsSequenceScheduleMode = "relative" | "date";

export type AtsSequenceStepSchedule = {
  date: string | null;
  delayDays: number;
  mode: AtsSequenceScheduleMode;
  sendTime: string;
  stepNumber: number;
  timezoneOffsetMinutes: number;
};

export type AtsContactHistoryChannel =
  | "email"
  | "linkedin"
  | "call"
  | "meeting"
  | "other";

export type AtsContactHistoryItem = {
  channel: AtsContactHistoryChannel;
  contactedAt: string;
  createdAt: string;
  id: string;
  note: string | null;
  source: "manual" | "sequence" | "bulk_manual";
};

export type AtsTraceKind = "query" | "search_result" | "scrape" | "decision";

export type AtsEmailDiscoveryTraceItem = {
  at: string;
  content: string;
  kind: AtsTraceKind;
  meta?: Record<string, unknown> | null;
};

export type AtsEmailDiscoveryEvidence = {
  confidence: "high" | "medium" | "low";
  email: string;
  snippet?: string | null;
  title?: string | null;
  type: "direct" | "search" | "page" | "pdf";
  url?: string | null;
};

export type AtsOutreachRecord = {
  activeStep: number;
  candidId: string;
  createdAt: string;
  emailDiscoveryEvidence: AtsEmailDiscoveryEvidence[];
  emailDiscoveryStatus: AtsEmailDiscoveryStatus;
  emailDiscoverySummary: string | null;
  emailDiscoveryTrace: AtsEmailDiscoveryTraceItem[];
  emailSourceLabel: string | null;
  emailSourceType: AtsEmailSourceType | null;
  emailSourceUrl: string | null;
  history: AtsContactHistoryItem[];
  id: number;
  lastSentAt: string | null;
  memo: string | null;
  nextDueAt: string | null;
  sequenceMark: AtsSequenceMarkStatus | null;
  sequenceSchedule: AtsSequenceStepSchedule[];
  sequenceStatus: AtsSequenceStatus;
  stoppedAt: string | null;
  targetEmail: string | null;
  updatedAt: string;
  userId: string;
};

export type AtsMessageKind = "sequence" | "manual";
export type AtsMessageStatus =
  | "draft"
  | "sending"
  | "sent"
  | "skipped"
  | "canceled";

export type AtsMessageRecord = {
  body: string;
  candidId: string;
  createdAt: string;
  createdBy: string;
  id: number;
  kind: AtsMessageKind;
  outreachId: number | null;
  renderedBody: string | null;
  renderedSubject: string | null;
  sentAt: string | null;
  status: AtsMessageStatus;
  stepNumber: number | null;
  subject: string;
  toEmail: string | null;
  updatedAt: string;
  userId: string;
};

export type AtsExistingEmailSource = {
  email: string;
  label: string;
  sourceType: Exclude<AtsEmailSourceType, "web" | "manual">;
  url?: string | null;
};

export type AtsCandidateSummary = {
  currentCompany: string | null;
  currentCompanyLogo: string | null;
  currentRole: string | null;
  currentSchool: string | null;
  existingEmailSources: AtsExistingEmailSource[];
  githubUrl: string | null;
  githubUsername: string | null;
  headline: string | null;
  id: string;
  linkedinUrl: string | null;
  location: string | null;
  name: string | null;
  outreach: AtsOutreachRecord | null;
  profilePicture: string | null;
  scholarAffiliation: string | null;
  scholarUrl: string | null;
  shortlistMemo: string | null;
};

export type AtsCandidatePublication = {
  citationCount: number | null;
  link: string | null;
  publishedAt: string | null;
  title: string;
};

export type AtsCandidateDetail = AtsCandidateSummary & {
  bio: string | null;
  companyLinks: string[];
  experience: Array<{
    company: string | null;
    companyLinkedinUrl: string | null;
    description: string | null;
    endDate: string | null;
    role: string | null;
    startDate: string | null;
  }>;
  githubProfile: {
    avatarUrl: string | null;
    bio: string | null;
    blog: string | null;
    company: string | null;
    email: string | null;
    followers: number | null;
    githubUrl: string | null;
    location: string | null;
    name: string | null;
    publicRepos: number | null;
    readmeMarkdown: string | null;
    username: string | null;
  } | null;
  links: string[];
  publications: AtsCandidatePublication[];
  scholarProfile: {
    affiliation: string | null;
    email: string | null;
    hIndex: number | null;
    homepageLink: string | null;
    scholarUrl: string | null;
    topics: string | null;
    totalCitations: number | null;
  } | null;
};

export type AtsWorkspaceRecord = {
  bookmarkFolderId: number | null;
  companyPitch: string | null;
  jobDescription: string | null;
  senderEmail: string | null;
  signature: string | null;
};

export type AtsBookmarkFolderOption = {
  id: number;
  isDefault: boolean;
  name: string;
};

export type AtsWorkspaceResponse = {
  allowedDomain: string;
  candidates: AtsCandidateSummary[];
  folders: AtsBookmarkFolderOption[];
  totalCount: number;
  workspace: AtsWorkspaceRecord;
};

export type AtsCandidateDetailResponse = {
  candidate: AtsCandidateDetail;
  messages: AtsMessageRecord[];
  workspace: AtsWorkspaceRecord;
};

export type AtsContactEmailDraft = {
  body: string;
  subject: string;
};

export type AtsTemplateVariableDefinition = {
  description: string;
  key: string;
  label: string;
};

export const ATS_TEMPLATE_VARIABLES: AtsTemplateVariableDefinition[] = [
  {
    key: "name",
    label: "{{name}}",
    description: "후보자 전체 이름",
  },
  {
    key: "first_name",
    label: "{{first_name}}",
    description: "이름 첫 토큰",
  },
  {
    key: "headline",
    label: "{{headline}}",
    description: "후보자 headline",
  },
  {
    key: "current_company",
    label: "{{current_company}}",
    description: "가장 최근 회사",
  },
  {
    key: "current_role",
    label: "{{current_role}}",
    description: "가장 최근 역할",
  },
  {
    key: "location",
    label: "{{location}}",
    description: "후보자 위치",
  },
  {
    key: "github_username",
    label: "{{github_username}}",
    description: "GitHub username",
  },
  {
    key: "scholar_affiliation",
    label: "{{scholar_affiliation}}",
    description: "Scholar 소속",
  },
];

export function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function isAtsSequenceMarkStatus(
  value: string | null | undefined
): value is AtsSequenceMarkStatus {
  return (
    value === "need_email" ||
    value === "find_fail" ||
    value === "ready" ||
    value === "in_sequence" ||
    value === "linkedin_contacted" ||
    value === "waiting_reply" ||
    value === "replied" ||
    value === "paused" ||
    value === "closed"
  );
}

export function extractFirstName(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.split(" ")[0] ?? "";
}

export function buildCandidateTemplateVariables(candidate: {
  currentCompany?: string | null;
  currentRole?: string | null;
  githubUsername?: string | null;
  headline?: string | null;
  location?: string | null;
  name?: string | null;
  scholarAffiliation?: string | null;
}) {
  return {
    current_company: String(candidate.currentCompany ?? "").trim(),
    current_role: String(candidate.currentRole ?? "").trim(),
    first_name: extractFirstName(candidate.name),
    github_username: String(candidate.githubUsername ?? "").trim(),
    headline: String(candidate.headline ?? "").trim(),
    location: String(candidate.location ?? "").trim(),
    name: String(candidate.name ?? "").trim(),
    scholar_affiliation: String(candidate.scholarAffiliation ?? "").trim(),
  };
}

export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key: string) => {
      return variables[key] ?? "";
    }
  );
}

export function coerceJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function shiftDateByOffset(date: Date, timezoneOffsetMinutes: number) {
  return new Date(date.getTime() - timezoneOffsetMinutes * 60_000);
}

function getLocalDateString(date: Date, timezoneOffsetMinutes: number) {
  const shifted = shiftDateByOffset(date, timezoneOffsetMinutes);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  return `${year}-${month}-${day}`;
}

function isValidTimeInput(value: string | null | undefined) {
  return /^\d{2}:\d{2}$/.test(String(value ?? "").trim());
}

function isValidDateInput(value: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

export function createDefaultAtsSequenceSchedule(baseDate = new Date()) {
  const today = getLocalDateString(baseDate, ATS_DEFAULT_TIMEZONE_OFFSET_MINUTES);
  return Array.from({ length: ATS_SEQUENCE_STEP_COUNT }, (_, index) => ({
    date: index === 0 ? today : null,
    delayDays: index === 0 ? 0 : ATS_SEQUENCE_INTERVAL_DAYS,
    mode: index === 0 ? ("date" as const) : ("relative" as const),
    sendTime: ATS_DEFAULT_SEQUENCE_TIME,
    stepNumber: index + 1,
    timezoneOffsetMinutes: ATS_DEFAULT_TIMEZONE_OFFSET_MINUTES,
  })) satisfies AtsSequenceStepSchedule[];
}

export function normalizeAtsSequenceSchedule(value: unknown) {
  const fallback = createDefaultAtsSequenceSchedule();
  const source = coerceJsonArray<Partial<AtsSequenceStepSchedule>>(value);

  return fallback.map((defaultItem) => {
    const raw = source.find((item) => Number(item?.stepNumber) === defaultItem.stepNumber);
    if (!raw) return defaultItem;

    return {
      date:
        (raw.mode === "date" || defaultItem.mode === "date") &&
        isValidDateInput(raw.date)
          ? String(raw.date)
          : raw.mode === "date"
            ? defaultItem.date
            : null,
      delayDays: Math.max(
        0,
        Number.isFinite(Number(raw.delayDays))
          ? Math.floor(Number(raw.delayDays))
          : defaultItem.delayDays
      ),
      mode: raw.mode === "date" ? "date" : "relative",
      sendTime: isValidTimeInput(raw.sendTime)
        ? String(raw.sendTime)
        : defaultItem.sendTime,
      stepNumber: defaultItem.stepNumber,
      timezoneOffsetMinutes: Number.isFinite(Number(raw.timezoneOffsetMinutes))
        ? Number(raw.timezoneOffsetMinutes)
        : defaultItem.timezoneOffsetMinutes,
    } satisfies AtsSequenceStepSchedule;
  });
}

export function normalizeAtsContactHistory(value: unknown) {
  return coerceJsonArray<Partial<AtsContactHistoryItem>>(value)
    .map((item) => {
      const channel =
        item.channel === "linkedin" ||
        item.channel === "call" ||
        item.channel === "meeting" ||
        item.channel === "other"
          ? item.channel
          : "email";
      const contactedAt = String(item.contactedAt ?? "").trim();
      const createdAt = String(item.createdAt ?? contactedAt).trim();
      const id = String(item.id ?? "").trim();
      if (!id || !contactedAt) return null;

      return {
        channel,
        contactedAt,
        createdAt: createdAt || contactedAt,
        id,
        note: String(item.note ?? "").trim() || null,
        source:
          item.source === "sequence" || item.source === "bulk_manual"
            ? item.source
            : "manual",
      } satisfies AtsContactHistoryItem;
    })
    .filter(Boolean) as AtsContactHistoryItem[];
}

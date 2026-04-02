export const ATS_SEQUENCE_STEP_COUNT = 4;
export const ATS_SEQUENCE_INTERVAL_DAYS = 2;

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
  | "waiting_reply"
  | "replied"
  | "paused"
  | "closed";

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
  id: number;
  lastSentAt: string | null;
  nextDueAt: string | null;
  sequenceMark: AtsSequenceMarkStatus | null;
  sequenceStatus: AtsSequenceStatus;
  stoppedAt: string | null;
  targetEmail: string | null;
  updatedAt: string;
  userId: string;
};

export type AtsMessageKind = "sequence" | "manual";
export type AtsMessageStatus = "draft" | "sent" | "skipped" | "canceled";

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
  githubUsername: string | null;
  headline: string | null;
  id: string;
  location: string | null;
  name: string | null;
  outreach: AtsOutreachRecord | null;
  profilePicture: string | null;
  scholarAffiliation: string | null;
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
  companyPitch: string | null;
  jobDescription: string | null;
  senderEmail: string | null;
  signature: string | null;
};

export type AtsWorkspaceResponse = {
  allowedDomain: string;
  candidates: AtsCandidateSummary[];
  totalCount: number;
  workspace: AtsWorkspaceRecord;
};

export type AtsCandidateDetailResponse = {
  candidate: AtsCandidateDetail;
  messages: AtsMessageRecord[];
  workspace: AtsWorkspaceRecord;
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

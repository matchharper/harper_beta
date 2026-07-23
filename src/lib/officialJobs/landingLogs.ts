export const OFFICIAL_JOBS_LANDING_SOURCE = "official_jobs";
export const OFFICIAL_JOBS_LANDING_ABTEST_TYPE = "official_jobs_landing_v1";
export const OFFICIAL_JOBS_APPLY_HELP_EXPERIMENT_ID =
  "official_jobs_apply_help_v1";
export const OFFICIAL_JOBS_APPLY_HELP_CONTROL_ABTEST_TYPE = `${OFFICIAL_JOBS_APPLY_HELP_EXPERIMENT_ID}_a`;
export const OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ABTEST_TYPE = `${OFFICIAL_JOBS_APPLY_HELP_EXPERIMENT_ID}_b`;
export const OFFICIAL_JOBS_LANDING_LAST_VISIT_AT_KEY =
  "harper_official_jobs_last_visit_at_v1";
export const OFFICIAL_JOBS_LANDING_SESSION_GAP_MS = 30 * 60 * 1000;

export type OfficialJobsApplyHelpVariant = "a" | "b";

export const OFFICIAL_JOBS_APPLY_HELP_VARIANTS = [
  {
    abtestType: OFFICIAL_JOBS_APPLY_HELP_CONTROL_ABTEST_TYPE,
    ctaLabel: "Talk to Harper",
    helpVisible: false,
    label: "A",
    variant: "a",
  },
  {
    abtestType: OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ABTEST_TYPE,
    ctaLabel: "Apply with Harper",
    helpVisible: true,
    label: "B",
    variant: "b",
  },
] as const satisfies ReadonlyArray<{
  abtestType: string;
  ctaLabel: string;
  helpVisible: boolean;
  label: "A" | "B";
  variant: OfficialJobsApplyHelpVariant;
}>;

export function parseOfficialJobsApplyHelpVariant(
  value: unknown
): OfficialJobsApplyHelpVariant | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    normalized === "a" ||
    normalized === OFFICIAL_JOBS_APPLY_HELP_CONTROL_ABTEST_TYPE
  ) {
    return "a";
  }
  if (
    normalized === "b" ||
    normalized === OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ABTEST_TYPE
  ) {
    return "b";
  }

  return null;
}

export function getOfficialJobsApplyHelpAbtestType(
  variant: OfficialJobsApplyHelpVariant
) {
  return variant === "a"
    ? OFFICIAL_JOBS_APPLY_HELP_CONTROL_ABTEST_TYPE
    : OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ABTEST_TYPE;
}

export function isOfficialJobsLandingAbtestType(value: unknown) {
  const normalized = String(value ?? "").trim();
  return (
    normalized === OFFICIAL_JOBS_LANDING_ABTEST_TYPE ||
    parseOfficialJobsApplyHelpVariant(normalized) !== null
  );
}

export type OfficialJobLandingEvent =
  | "list_view"
  | "list_talk_click"
  | "job_list_click"
  | "job_view"
  | "talk_click";

export type ParsedOfficialJobLandingLogType = {
  event: OfficialJobLandingEvent;
  jobSlug: string | null;
};

const OFFICIAL_JOB_LANDING_EVENTS = new Set<OfficialJobLandingEvent>([
  "list_view",
  "list_talk_click",
  "job_list_click",
  "job_view",
  "talk_click",
]);

export function normalizeOfficialJobSlug(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) return null;
  return normalized;
}

export function buildOfficialJobLandingLogType(
  event: OfficialJobLandingEvent,
  jobSlug?: string | null
) {
  const normalizedSlug = normalizeOfficialJobSlug(jobSlug);
  return normalizedSlug
    ? `${OFFICIAL_JOBS_LANDING_SOURCE}:${event}:${normalizedSlug}`
    : `${OFFICIAL_JOBS_LANDING_SOURCE}:${event}`;
}

export function parseOfficialJobLandingLogType(
  type: string | null | undefined
): ParsedOfficialJobLandingLogType | null {
  const value = String(type ?? "").trim();
  const [source, event, slug] = value.split(":");
  if (source !== OFFICIAL_JOBS_LANDING_SOURCE) return null;
  if (!OFFICIAL_JOB_LANDING_EVENTS.has(event as OfficialJobLandingEvent)) {
    return null;
  }

  return {
    event: event as OfficialJobLandingEvent,
    jobSlug: normalizeOfficialJobSlug(slug),
  };
}

export function mapOfficialJobEventToLandingEvent(
  eventType: string,
  jobSlug?: string | null
): ParsedOfficialJobLandingLogType | null {
  const normalizedSlug = normalizeOfficialJobSlug(jobSlug);

  if (eventType === "jobs_list_view") {
    return { event: "list_view", jobSlug: null };
  }
  if (eventType === "jobs_cta_click") {
    return { event: "list_talk_click", jobSlug: null };
  }
  if (eventType === "job_list_click" && normalizedSlug) {
    return { event: "job_list_click", jobSlug: normalizedSlug };
  }
  if (eventType === "job_detail_view" && normalizedSlug) {
    return { event: "job_view", jobSlug: normalizedSlug };
  }
  if (eventType === "job_apply_click" && normalizedSlug) {
    return { event: "talk_click", jobSlug: normalizedSlug };
  }

  return null;
}

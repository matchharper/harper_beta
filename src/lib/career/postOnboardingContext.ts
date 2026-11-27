import type { CareerPostOnboardingContext } from "@/lib/career/prompts/types";
import {
  OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
  OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM,
  normalizeOfficialJobsCompanyName,
  normalizeOfficialJobsRoleTitle,
  type OfficialJobRow,
} from "@/lib/officialJobs";
import { isOfficialJobFollowUpRoleAvailable } from "@/lib/officialJobs/followUpAvailability";
import {
  OFFICIAL_JOB_PREPARED_ROLES_TABLE,
  livePreparedRoles,
  type PreparedForPosting,
  type PreparedRoleRead,
} from "@/lib/officialJobs/preparedRoles";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import { OFFICIAL_JOBS_ONESCREEN_ENTRY_DOMAIN } from "@/lib/officialJobs/oneScreen";
import { parseIntentSource } from "@/lib/gtmPlays/agent/signupMove";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchLatestTalentActivityEvent, type TalentActivityEventRow } from "@/lib/talentOnboarding/activityEvents";

const OFFICIAL_JOBS_ONBOARDING_SOURCE_PREFIX = "official_jobs_onboarding:";

function getRecordString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function isTestOnlyRoleInformation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const testOnly = (value as Record<string, unknown>).testOnly;
  return (
    testOnly === true ||
    (typeof testOnly === "string" && testOnly.trim().toLowerCase() === "true")
  );
}

export function parseOfficialJobSignupSourceSlug(
  source: string | null | undefined
) {
  const normalizedSource = String(source ?? "").trim();
  if (!normalizedSource.startsWith(OFFICIAL_JOBS_ONBOARDING_SOURCE_PREFIX)) {
    return null;
  }

  return (
    normalizedSource
      .slice(OFFICIAL_JOBS_ONBOARDING_SOURCE_PREFIX.length)
      .trim()
      .slice(0, 240) || null
  );
}

async function fetchLegacyOfficialJobSignupEvent(args: {
  admin: TalentAdminClient;
  intentCreatedAt: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("official_job_events")
    .select("job_slug, metadata")
    .eq("user_id", args.userId)
    .eq("event_type", "job_apply_click")
    .not("job_slug", "is", null)
    .lte("created_at", args.intentCreatedAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[PostOnboardingContext] Failed to load legacy job source", {
      error: error.message,
      userId: args.userId,
    });
    return null;
  }

  return data;
}

type CareerEntrySourceArgs = {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
  includePostingDetails?: boolean;
};

type CareerEntryEvent = Pick<TalentActivityEventRow, "created_at" | "source">;

const CAREER_SIGNUP_LOG_TYPE = "career_signup_completed";

/** The /jobs posting in a sign-up's landing path (/career?source=official_jobs&job_slug=…); null for any other page. */
export function parseOfficialJobSignupLandingSlug(landingPath: unknown) {
  if (typeof landingPath !== "string" || !landingPath.trim()) return null;
  try {
    const params = new URL(landingPath, "https://matchharper.com").searchParams;
    if (params.get("source") !== OFFICIAL_JOBS_LANDING_SOURCE) return null;
    return params.get(OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM)?.trim().slice(0, 240) || null;
  } catch {
    return null;
  }
}

/**
 * The entry record is written when the signup form is finished (finalize_career_entry). Until then the posting the
 * account was made from is only in the sign-up log's landing path, so Harper's contact with someone who left the form
 * unfinished starts from it too (Shaun 11/27: they got a generic mail that never named the posting).
 */
async function fetchUnfinishedSignupEntry(args: CareerEntrySourceArgs): Promise<CareerEntryEvent | null> {
  // Unfinished = the form was never submitted and onboarding is not marked done (an older entry may lack the receipt).
  const [{ data: submitted, error: submittedError }, { data: setting, error: settingError }] = await Promise.all([
    args.admin
      .from("talent_messages")
      .select("id")
      .eq("user_id", args.userId)
      .eq("message_type", "profile_submit")
      .limit(1),
    args.admin
      .from("talent_setting")
      .select("is_onboarding_done")
      .eq("user_id", args.userId)
      .maybeSingle(),
  ]);
  if (submittedError || settingError || (submitted?.length ?? 0) > 0 || setting?.is_onboarding_done) return null;

  const { data: signup, error } = await args.admin
    .from("logs")
    .select("created_at, meta_data")
    .eq("user_id", args.userId)
    .eq("type", CAREER_SIGNUP_LOG_TYPE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[PostOnboardingContext] Failed to load the sign-up landing page", {
      error: error.message,
      userId: args.userId,
    });
    return null;
  }
  const slug = parseOfficialJobSignupLandingSlug(getRecordString(signup?.meta_data, "landingPath"));
  return slug && signup?.created_at
    ? { created_at: signup.created_at, source: `${OFFICIAL_JOBS_ONBOARDING_SOURCE_PREFIX}${slug}` }
    : null;
}

type CareerEntryPosting = Pick<OfficialJobRow, "id" | "company_name" | "role_id" | "role_title" | "is_published" | "updated_at">
  & Partial<Pick<OfficialJobRow, "role_description_markdown" | "short_description" | "location" | "compensation">>;

/** A conversation-bound event records the entry. Older events require a lookup of the original click. */
export async function fetchCareerEntrySource(args: CareerEntrySourceArgs & { includeOpportunity?: boolean }) {
  const intentEvent = await fetchLatestTalentActivityEvent({
    admin: args.admin,
    conversationId: args.conversationId,
    eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
    userId: args.userId,
  });
  const fromOneScreen = Boolean(
    intentEvent?.changed_domains?.includes(OFFICIAL_JOBS_ONESCREEN_ENTRY_DOMAIN)
  );
  const entryEvent: CareerEntryEvent | null = args.includeOpportunity === false
    ? null
    : intentEvent ?? (await fetchUnfinishedSignupEntry(args));
  const opportunityContext = entryEvent
    ? await readEntryOpportunity(args, entryEvent)
    : null;
  return {
    intentSummary: intentEvent?.summary ?? null,
    /** The entry was a link in a Harper outreach mail (gtmPlays/agent/signupMove.ts intentSource). */
    fromMail: parseIntentSource(intentEvent?.source) !== null,
    /** The entry was the job page's one screen; its record says what was agreed and sent. */
    fromOneScreen,
    opportunityContext: fromOneScreen && intentEvent?.summary && opportunityContext?.entryOpportunity
      ? {
          ...opportunityContext,
          entryOpportunity: { ...opportunityContext.entryOpportunity, oneScreenRecord: intentEvent.summary },
        }
      : opportunityContext,
  };
}

export async function fetchCareerPostOnboardingContext(args: CareerEntrySourceArgs) {
  return (await fetchCareerEntrySource(args)).opportunityContext;
}

async function readEntryOpportunity(
  args: CareerEntrySourceArgs,
  intentEvent: CareerEntryEvent
): Promise<CareerPostOnboardingContext | null> {
  let slug = parseOfficialJobSignupSourceSlug(intentEvent.source);
  let legacyEvent: Awaited<
    ReturnType<typeof fetchLegacyOfficialJobSignupEvent>
  > = null;

  if (!slug) {
    legacyEvent = await fetchLegacyOfficialJobSignupEvent({
      admin: args.admin,
      intentCreatedAt: intentEvent.created_at,
      userId: args.userId,
    });
    slug =
      String(legacyEvent?.job_slug ?? "")
        .trim()
        .slice(0, 240) || null;
  }
  if (!slug) return null;

  const postings = args.admin.from("official_jobs");
  const source = args.includePostingDetails
    ? await postings.select("id, company_name, role_id, role_title, is_published, role_description_markdown, short_description, location, compensation, updated_at")
        .eq("slug", slug).maybeSingle()
    : await postings.select("id, company_name, role_id, role_title, is_published, updated_at")
        .eq("slug", slug).maybeSingle();
  const job: CareerEntryPosting | null = source.data;
  const jobError = source.error;

  if (jobError) {
    console.warn("[PostOnboardingContext] Failed to load entry opportunity", {
      error: jobError.message,
      slug,
      userId: args.userId,
    });
  }

  const companyName = normalizeOfficialJobsCompanyName(
    job?.company_name ?? getRecordString(legacyEvent?.metadata, "companyName")
  );
  const roleTitle = normalizeOfficialJobsRoleTitle(
    job?.role_title ?? getRecordString(legacyEvent?.metadata, "roleTitle")
  );
  if (!companyName && !roleTitle) return null;

  const mappedRoleId = String(job?.role_id ?? "").trim();
  let verifiedActiveRoleId: string | null = null;
  // The public posting may hide the company; the conversation uses the Role's real company.
  let roleCompanyName = "";

  if (mappedRoleId) {
    const { data: role, error: roleError } = await args.admin
      .from("company_roles")
      .select("expires_at, information, is_expired, source_type, status, company:company_workspace(company_name)")
      .eq("role_id", mappedRoleId)
      .maybeSingle();

    if (roleError) {
      console.warn("[PostOnboardingContext] Failed to verify entry role", {
        error: roleError.message,
        roleId: mappedRoleId,
        slug,
        userId: args.userId,
      });
    } else if (
      role &&
      String(role.source_type ?? "")
        .trim()
        .toLowerCase() === "internal" &&
      !isTestOnlyRoleInformation(role.information) &&
      isOfficialJobFollowUpRoleAvailable({
        expiresAt: role.expires_at,
        isExpired: Boolean(role.is_expired),
        status: String(role.status ?? ""),
      })
    ) {
      verifiedActiveRoleId = mappedRoleId;
      roleCompanyName = normalizeOfficialJobsCompanyName(
        (role.company as { company_name?: string | null } | null)?.company_name
      );
    }
  }

  // A published posting with no Harper Role behind it has Roles prepared for it once a day (officialJobs/preparedRoles.ts).
  const preparedForPosting = job?.id && !mappedRoleId && job.is_published === true
    ? await readPreparedForPosting(args, job.id)
    : null;

  return {
    entryOpportunity: {
      companyName: roleCompanyName || companyName || null,
      roleTitle: roleTitle || null,
      verifiedActiveRoleId,
      ...(job ? { hasLinkedRole: Boolean(mappedRoleId) } : {}),
      ...(job?.is_published === true
        ? {
            postingPath: `/jobs/${encodeURIComponent(slug)}`,
            postingUpdatedAt: job.updated_at,
            ...(args.includePostingDetails
              ? {
                  postingDetails: [
                    job.short_description,
                    job.location ? `Location: ${job.location}` : "",
                    job.compensation ? `Compensation: ${job.compensation}` : "",
                    job.role_description_markdown,
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                }
              : {}),
          }
        : {}),
      ...(preparedForPosting ? { preparedForPosting } : {}),
    },
  };
}

/** The prepared Roles that are still open, with the public /jobs page of each Harper-connected one that has a page. */
async function readPreparedForPosting(
  args: CareerEntrySourceArgs,
  officialJobId: string
): Promise<PreparedForPosting | null> {
  const { data, error } = await (args.admin.from(OFFICIAL_JOB_PREPARED_ROLES_TABLE as never) as any)
    .select("role_id, kind, rank, reason, prepared_at, role:company_roles(name, status, is_expired, expires_at, source_type, external_jd_url, location_text, information, company:company_workspace(company_name))")
    .eq("official_job_id", officialJobId)
    .order("rank", { ascending: true });
  if (error) {
    console.warn("[PostOnboardingContext] Failed to load prepared roles", {
      error: error.message,
      officialJobId,
      userId: args.userId,
    });
    return null;
  }
  const rows = (data ?? []) as PreparedRoleRead[];
  const harperRoleIds = rows.filter((row) => row.kind === "harper").map((row) => row.role_id);
  const harperPostingPaths = new Map<string, string>();
  if (harperRoleIds.length) {
    const { data: pages } = await args.admin
      .from("official_jobs")
      .select("slug, role_id")
      .in("role_id", harperRoleIds)
      .eq("is_published", true);
    for (const page of pages ?? []) {
      if (page.role_id && page.slug && !harperPostingPaths.has(page.role_id))
        harperPostingPaths.set(page.role_id, `/jobs/${encodeURIComponent(page.slug)}`);
    }
  }
  return livePreparedRoles(rows, { harperPostingPaths });
}

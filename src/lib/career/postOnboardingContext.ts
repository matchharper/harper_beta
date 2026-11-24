import type { CareerPostOnboardingContext } from "@/lib/career/prompts/types";
import {
  OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
  normalizeOfficialJobsCompanyName,
  normalizeOfficialJobsRoleTitle,
  type OfficialJobRow,
} from "@/lib/officialJobs";
import { isOfficialJobFollowUpRoleAvailable } from "@/lib/officialJobs/followUpAvailability";
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

type CareerEntryPosting = Pick<OfficialJobRow, "company_name" | "role_id" | "role_title" | "is_published" | "updated_at">
  & Partial<Pick<OfficialJobRow, "role_description_markdown" | "short_description" | "location" | "compensation">>;

/** A conversation-bound event records the entry. Older events require a lookup of the original click. */
export async function fetchCareerEntrySource(args: CareerEntrySourceArgs & { includeOpportunity?: boolean }) {
  const intentEvent = await fetchLatestTalentActivityEvent({
    admin: args.admin,
    conversationId: args.conversationId,
    eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
    userId: args.userId,
  });
  return {
    intentSummary: intentEvent?.summary ?? null,
    opportunityContext: intentEvent && args.includeOpportunity !== false
      ? await readEntryOpportunity(args, intentEvent)
      : null,
  };
}

export async function fetchCareerPostOnboardingContext(args: CareerEntrySourceArgs) {
  return (await fetchCareerEntrySource(args)).opportunityContext;
}

async function readEntryOpportunity(
  args: CareerEntrySourceArgs,
  intentEvent: TalentActivityEventRow
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
    ? await postings.select("company_name, role_id, role_title, is_published, role_description_markdown, short_description, location, compensation, updated_at")
        .eq("slug", slug).maybeSingle()
    : await postings.select("company_name, role_id, role_title, is_published, updated_at")
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
    },
  };
}

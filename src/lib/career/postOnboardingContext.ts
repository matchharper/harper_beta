import type { CareerPostOnboardingContext } from "@/lib/career/prompts/types";
import {
  OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
  normalizeOfficialJobsCompanyName,
  normalizeOfficialJobsRoleTitle,
} from "@/lib/officialJobs";
import { isOfficialJobFollowUpRoleAvailable } from "@/lib/officialJobs/followUpAvailability";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchLatestTalentActivityEvent } from "@/lib/talentOnboarding/activityEvents";

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

/**
 * Loads factual context for the transition out of onboarding. The conversation-
 * bound signup event is authoritative; a job click is used only to recover the
 * slug for older intent events that did not persist it in their source.
 */
export async function fetchCareerPostOnboardingContext(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}): Promise<CareerPostOnboardingContext | null> {
  const intentEvent = await fetchLatestTalentActivityEvent({
    admin: args.admin,
    conversationId: args.conversationId,
    eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
    userId: args.userId,
  });
  if (!intentEvent) return null;

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

  const { data: job, error: jobError } = await args.admin
    .from("official_jobs")
    .select("company_name, role_id, role_title")
    .eq("slug", slug)
    .maybeSingle();

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

  if (mappedRoleId) {
    const { data: role, error: roleError } = await args.admin
      .from("company_roles")
      .select("expires_at, information, is_expired, source_type, status")
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
      String(role.source_type ?? "").trim().toLowerCase() === "internal" &&
      !isTestOnlyRoleInformation(role.information) &&
      isOfficialJobFollowUpRoleAvailable({
        expiresAt: role.expires_at,
        isExpired: Boolean(role.is_expired),
        status: String(role.status ?? ""),
      })
    ) {
      verifiedActiveRoleId = mappedRoleId;
    }
  }

  return {
    entryOpportunity: {
      companyName: companyName || null,
      roleTitle: roleTitle || null,
      verifiedActiveRoleId,
    },
  };
}

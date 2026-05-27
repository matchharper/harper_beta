import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
  mapOfficialJobRow,
  normalizeOfficialJobsLandingCopy,
  type OfficialJob,
  type OfficialJobsLandingCopy,
} from "@/lib/officialJobs";
import { supabaseServer } from "@/lib/supabaseServer";

export async function getOfficialJobsLandingCopy(): Promise<OfficialJobsLandingCopy> {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("company_description_markdown,role_description_markdown")
    .eq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
    .eq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
    .eq("is_published", false)
    .maybeSingle();

  if (error) {
    console.warn("official_jobs landing copy query failed:", error.message);
    return normalizeOfficialJobsLandingCopy();
  }

  return normalizeOfficialJobsLandingCopy({
    harperDescriptionMarkdown: data?.company_description_markdown,
    harperStepsMarkdown: data?.role_description_markdown,
  });
}

export async function getPublicOfficialJobs(): Promise<OfficialJob[]> {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .eq("is_published", true)
    .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
    .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
    .order("display_order", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.warn("official_jobs list query failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapOfficialJobRow(row));
}

export async function getPublicOfficialJobBySlug(
  slug: string
): Promise<OfficialJob | null> {
  if (slug === OFFICIAL_JOBS_INTERNAL_COPY_SLUG) {
    return null;
  }

  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
    .maybeSingle();

  if (error) {
    console.warn("official_jobs detail query failed:", error.message);
    return null;
  }

  if (!data) return null;

  const landingCopy = await getOfficialJobsLandingCopy();
  return mapOfficialJobRow(data, landingCopy);
}

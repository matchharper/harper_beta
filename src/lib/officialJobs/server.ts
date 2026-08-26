import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
  mapOfficialJobListRow,
  mapOfficialJobRow,
  type OfficialJob,
  type OfficialJobListItem,
} from "@/lib/officialJobs";
import { supabaseServer } from "@/lib/supabaseServer";

export async function getPublicOfficialJobListItems(): Promise<
  OfficialJobListItem[]
> {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select(
      "ashby_job_posting_id,id,slug,company_name,role_title,location,vertical,role_id"
    )
    .eq("is_published", true)
    .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
    .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
    .order("display_order", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.warn("official_jobs list query failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapOfficialJobListRow(row));
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

  return mapOfficialJobRow(data);
}

export async function getPublicOfficialJobById(
  id: string
): Promise<OfficialJob | null> {
  const normalizedId = id.trim();
  const isUuid =
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(normalizedId);
  if (!isUuid) return null;

  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .eq("id", normalizedId)
    .eq("is_published", true)
    .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
    .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
    .maybeSingle();

  if (error) {
    console.warn("official_jobs id lookup failed:", error.message);
    return null;
  }

  if (!data) return null;

  return mapOfficialJobRow(data);
}

export async function getPublicOfficialJobByAshbyId(
  ashbyJobPostingId: string
): Promise<OfficialJob | null> {
  const normalizedAshbyId = ashbyJobPostingId.trim();
  if (!normalizedAshbyId) return null;

  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .eq("ashby_job_posting_id", normalizedAshbyId)
    .eq("is_published", true)
    .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
    .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
    .maybeSingle();

  if (error) {
    console.warn("official_jobs ashby lookup failed:", error.message);
    return null;
  }

  if (!data) return null;

  return mapOfficialJobRow(data);
}

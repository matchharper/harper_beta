import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
  mapOfficialJobListRow,
  mapOfficialJobRow,
  type OfficialJob,
  type OfficialJobListItem,
} from "@/lib/officialJobs";
import { supabaseServer } from "@/lib/supabaseServer";
import { filterPublicOfficialJobRows } from "@/lib/officialJobs/visibility";
import {
  readVisibleOfficialJobsPage,
  type OfficialJobsPage,
} from "./pagination";

async function applyLinkedRoleVisibility<T extends { role_id: string | null }>(
  rows: T[]
): Promise<T[]> {
  const roleIds = [
    ...new Set(rows.flatMap((row) => (row.role_id ? [row.role_id] : []))),
  ];
  if (roleIds.length === 0) return rows;

  const [rolesResult, settingsResult] = await Promise.all([
    supabaseServer
      .from("company_roles")
      .select("role_id,source_type,status,is_expired,expires_at,information")
      .in("role_id", roleIds),
    supabaseServer
      .from("company_internal_roles")
      .select("role_id,is_promote,is_anonymous")
      .in("role_id", roleIds),
  ]);

  if (rolesResult.error || settingsResult.error) {
    console.warn(
      "official_jobs linked role visibility query failed:",
      rolesResult.error?.message ?? settingsResult.error?.message
    );
    return rows.filter((row) => !row.role_id);
  }

  return filterPublicOfficialJobRows(
    rows,
    rolesResult.data ?? [],
    settingsResult.data ?? []
  );
}

function publicOfficialJobListQuery() {
  return supabaseServer
    .from("official_jobs")
    .select(
      "ashby_job_posting_id,id,slug,company_name,role_title,location,vertical,role_id"
    )
    .eq("is_published", true)
    .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
    .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
    .order("display_order", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true });
}

export async function getPublicOfficialJobsPage(
  offset = 0
): Promise<OfficialJobsPage> {
  const page = await readVisibleOfficialJobsPage(
    offset,
    async (from, size) => {
      const { data, error } = await publicOfficialJobListQuery().range(
        from,
        from + size - 1
      );
      if (error)
        throw new Error("Failed to load official jobs", { cause: error });
      return data ?? [];
    },
    applyLinkedRoleVisibility
  );
  return {
    jobs: page.rows.map(mapOfficialJobListRow),
    nextOffset: page.nextOffset,
  };
}

export async function getPublicOfficialJobListItems(): Promise<
  OfficialJobListItem[]
> {
  const { data, error } = await publicOfficialJobListQuery();

  if (error) {
    console.warn("official_jobs list query failed:", error.message);
    return [];
  }

  return (await applyLinkedRoleVisibility(data ?? [])).map((row) =>
    mapOfficialJobListRow(row)
  );
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

  return (await applyLinkedRoleVisibility(data ?? [])).map((row) =>
    mapOfficialJobRow(row)
  );
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

  const [visible] = await applyLinkedRoleVisibility([data]);
  return visible ? mapOfficialJobRow(visible) : null;
}

export async function getPublicOfficialJobById(
  id: string
): Promise<OfficialJob | null> {
  const normalizedId = id.trim();
  const isUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
    normalizedId
  );
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

  const [visible] = await applyLinkedRoleVisibility([data]);
  return visible ? mapOfficialJobRow(visible) : null;
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

  const [visible] = await applyLinkedRoleVisibility([data]);
  return visible ? mapOfficialJobRow(visible) : null;
}

import { mapOfficialJobRow, type OfficialJob } from "@/lib/officialJobs";
import { supabaseServer } from "@/lib/supabaseServer";

export async function getPublicOfficialJobs(): Promise<OfficialJob[]> {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .eq("is_published", true)
    .order("display_order", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.warn("official_jobs list query failed:", error.message);
    return [];
  }

  return (data ?? []).map(mapOfficialJobRow);
}

export async function getPublicOfficialJobBySlug(
  slug: string
): Promise<OfficialJob | null> {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.warn("official_jobs detail query failed:", error.message);
    return null;
  }

  return data ? mapOfficialJobRow(data) : null;
}

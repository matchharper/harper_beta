import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type PaperRow = Database["public"]["Tables"]["papers"]["Row"];
export type ScholarContributionRow =
  Database["public"]["Tables"]["scholar_contributions"]["Row"];
export type ScholarProfileRow =
  Database["public"]["Tables"]["scholar_profile"]["Row"];

export type PaperContributor = ScholarContributionRow & {
  scholar_profile: ScholarProfileRow | null;
};

export type PaperDetail = {
  paper: PaperRow;
  contributors: PaperContributor[];
};

export const paperDetailKey = (paperId?: string) =>
  ["paper-detail", paperId] as const;

export async function fetchPaperDetail(
  paperId: string
): Promise<PaperDetail | null> {
  const normalizedPaperId = String(paperId ?? "").trim();
  if (!normalizedPaperId) return null;

  const { data: paper, error: paperError } = await supabase
    .from("papers")
    .select("*")
    .eq("id", normalizedPaperId)
    .maybeSingle();

  if (paperError) throw paperError;
  if (!paper) return null;

  const { data: contributions, error: contributionsError } = await supabase
    .from("scholar_contributions")
    .select("*")
    .eq("paper_id", normalizedPaperId)
    .order("author_order", { ascending: true, nullsFirst: false });

  if (contributionsError) throw contributionsError;

  const scholarProfileIds = Array.from(
    new Set(
      (contributions ?? [])
        .map((row) => String(row.scholar_profile_id ?? "").trim())
        .filter(Boolean)
    )
  );

  let scholarProfiles: ScholarProfileRow[] = [];
  if (scholarProfileIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("scholar_profile")
      .select("*")
      .in("id", scholarProfileIds);

    if (profileError) throw profileError;
    scholarProfiles = (profileRows as ScholarProfileRow[] | null) ?? [];
  }

  const profileById = new Map(
    scholarProfiles.map((profile) => [profile.id, profile] as const)
  );

  const resolvedContributors: PaperContributor[] = (contributions ?? []).map(
    (contribution) => ({
      ...contribution,
      scholar_profile:
        profileById.get(contribution.scholar_profile_id) ?? null,
    })
  );

  return {
    paper: paper as PaperRow,
    contributors: resolvedContributors,
  };
}

export function usePaperDetail(paperId?: string) {
  return useQuery({
    queryKey: paperDetailKey(paperId),
    enabled: !!paperId,
    queryFn: () => fetchPaperDetail(paperId!),
    staleTime: 60_000,
  });
}

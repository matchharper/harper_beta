import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/types/database.types";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export type PaperRow = Database["public"]["Tables"]["papers"]["Row"];
export type ScholarContributionRow =
  Database["public"]["Tables"]["scholar_contributions"]["Row"];
export type ScholarProfileRow =
  Database["public"]["Tables"]["scholar_profile"]["Row"];

export type PaperContributor = ScholarContributionRow & {
  scholar_profile: ScholarProfileRow | null;
  profile_revealed: boolean;
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

  return fetchWithInternalAuth<PaperDetail | null>(
    `/api/papers/detail?paperId=${encodeURIComponent(normalizedPaperId)}`
  );
}

export function usePaperDetail(paperId?: string) {
  return useQuery({
    queryKey: paperDetailKey(paperId),
    enabled: !!paperId,
    queryFn: () => fetchPaperDetail(paperId!),
    staleTime: 60_000,
  });
}

import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import type { CompanyProfile } from "@/lib/career/companyProfileTypes";

/** Headcount, hiring, funding and people of one company; shared by the opportunity and the company page. */
export function useCareerCompanyProfile(companyDbId: number | null | undefined) {
  const { fetchWithAuth } = useCareerApi();
  return useQuery({
    queryKey: ["career-company-profile", companyDbId],
    enabled: Boolean(companyDbId),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const response = await fetchWithAuth(
        `/api/talent/company-profile?companyDbId=${companyDbId}`
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as { profile?: CompanyProfile };
      return payload.profile ?? null;
    },
  });
}

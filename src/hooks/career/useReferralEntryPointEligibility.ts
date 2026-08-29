import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { canShowReferralEntryPoints } from "@/lib/referralEligibility";

type ReferralEligibilityPayload = {
  eligible?: boolean;
  error?: string;
};

export const referralEntryPointEligibilityKey = (userId?: string | null) =>
  ["referral-entry-point-eligibility", userId ?? "anonymous"] as const;

export function useReferralEntryPointEligibility({
  enabled = true,
  location,
  currentLocation,
  preferredLocale,
  user,
}: {
  currentLocation?: string | null;
  enabled?: boolean;
  location?: string | null;
  preferredLocale?: string | null;
  user?: User | null;
}) {
  const { fetchWithAuth } = useCareerApi();
  const locallyEligible = useMemo(
    () =>
      canShowReferralEntryPoints({
        location,
        currentLocation,
        preferredLocale,
      }),
    [location, currentLocation, preferredLocale]
  );

  const query = useQuery({
    queryKey: referralEntryPointEligibilityKey(user?.id),
    enabled: enabled && Boolean(user) && !locallyEligible,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = await fetchWithAuth(
        "/api/talent/network/referral/eligibility"
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as ReferralEligibilityPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load referral eligibility");
      }
      return payload;
    },
  });

  return locallyEligible || query.data?.eligible === true;
}

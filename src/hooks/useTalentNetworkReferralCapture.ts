"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";
import {
  captureTalentNetworkReferralFromCurrentLocation,
  type TalentNetworkReferralSource,
} from "@/lib/talentNetworkReferral";
import { useAuthStore } from "@/store/useAuthStore";

export function useTalentNetworkReferralCapture(
  source: TalentNetworkReferralSource
) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const accessToken = useAuthStore((state) => state.session?.access_token);

  useEffect(() => {
    if (authLoading || !router.isReady || typeof window === "undefined") return;

    void captureTalentNetworkReferralFromCurrentLocation({
      accessToken,
      source,
    }).catch((error) => {
      console.warn(`[${source}] referral capture failed:`, error);
    });
  }, [accessToken, authLoading, router.asPath, router.isReady, source]);
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "@/components/toast/toast";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { copyTalentNetworkReferralLinkForPath } from "@/lib/talentNetworkReferral";

export function useTalentNetworkReferralLinkCopy(pagePath: string) {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const inFlightRef = useRef(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    if (!isCopied) return;

    const timeoutId = window.setTimeout(() => setIsCopied(false), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [isCopied]);

  const copyReferralLink = useCallback(async () => {
    if (inFlightRef.current || typeof window === "undefined") return false;

    inFlightRef.current = true;
    setIsCopied(false);
    setIsCopying(true);

    try {
      await copyTalentNetworkReferralLinkForPath({
        baseUrl: window.location.origin,
        fetchWithAuth,
        messages: {
          summaryLoadFailed: t(
            "career.referral.modal.error_summary_load_failed",
            "초대 정보를 불러오지 못했습니다."
          ),
        },
        pagePath,
      });
      showToast({
        message: t(
          "career.referral.modal.toast_link_copied",
          "초대 링크가 복사되었습니다."
        ),
        variant: "white",
      });
      setIsCopied(true);
      return true;
    } catch (error) {
      console.error("Failed to copy referral link", error);
      showToast({
        message: t(
          "career.referral.modal.toast_link_copy_failed",
          "링크 복사에 실패했습니다."
        ),
        variant: "error",
      });
      return false;
    } finally {
      inFlightRef.current = false;
      setIsCopying(false);
    }
  }, [fetchWithAuth, pagePath, t]);

  return { copyReferralLink, isCopied, isCopying };
}

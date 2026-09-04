"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MuteButton } from "@/components/ui/button";
import { useTalentNetworkReferralLinkCopy } from "@/hooks/useTalentNetworkReferralLinkCopy";
import type { OfficialJobsLocale } from "@/lib/officialJobs/copy";
import {
  resolveOfficialJobsReferralCtaLabel,
  resolveOfficialJobsReferralCtaMode,
} from "@/lib/officialJobs/referralCta";
import { getTalentNetworkReferralTokenFromUrlLike } from "@/lib/talentNetworkReferral";
import { useAuthStore } from "@/store/useAuthStore";

export default function OfficialJobsReferralCta({
  jobPath,
  locale,
}: {
  jobPath: string;
  locale: OfficialJobsLocale;
}) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const { copyReferralLink, isCopied, isCopying } =
    useTalentNetworkReferralLinkCopy(jobPath);
  const mode = resolveOfficialJobsReferralCtaMode({
    authLoading,
    hasDirectReferralToken: Boolean(
      getTalentNetworkReferralTokenFromUrlLike(router.asPath)
    ),
    hasUser: Boolean(user),
  });

  if (mode === "hidden") return null;

  if (mode === "link") {
    return (
      <MuteButton asChild className="w-full text-sm" size="lg">
        <Link href={`/refer?lang=${locale}`}>Refer &amp; Earn</Link>
      </MuteButton>
    );
  }

  return (
    <MuteButton
      className="w-full text-sm"
      disabled={mode === "loading" || isCopying}
      onClick={() => void copyReferralLink()}
      size="lg"
    >
      {isCopying ? <Loader2 className="animate-spin" /> : null}
      {resolveOfficialJobsReferralCtaLabel(isCopied)}
    </MuteButton>
  );
}

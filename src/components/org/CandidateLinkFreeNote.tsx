"use client";

import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { cn } from "@/lib/utils";

/**
 * 후보자 링크 (#1): under "연결 요청" for a candidate whose own link made the card. The request uses no Intro and
 * connects at once (the DB records the candidate's acceptance from their link consent).
 */
export function CandidateLinkFreeNote({ className }: { className?: string }) {
  const { c } = useOrgLocale();
  return (
    <p className={cn("text-[12px] leading-5 text-positive", className)}>
      {c(
        "무료 · 이미 지원한 후보라 바로 연결돼요",
        "Free · They already applied, so they're connected right away"
      )}
    </p>
  );
}

/**
 * Appended to the "연결을 요청할 후보" tab caption ("…연결 요청하면 Harper가 먼저 물어봐요."), which stays true for
 * every other card: shown only when this list has a candidate-link card, which is connected without asking.
 */
export function CandidateLinkTabNote({
  items,
}: {
  items: ReadonlyArray<{ companyIntro?: { candidateLink?: boolean } | null }>;
}) {
  const { c } = useOrgLocale();
  if (!items.some((item) => item.companyIntro?.candidateLink === true)) return null;
  return (
    <>
      {" "}
      {c(
        "공고에 직접 지원한 후보는 묻지 않고 무료로 바로 연결돼요.",
        "Candidates who applied to your posting are connected right away, for free, without asking."
      )}
    </>
  );
}

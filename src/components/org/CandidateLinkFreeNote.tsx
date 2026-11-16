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

"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useOrgJobsDetail } from "@/hooks/org/useOrgJobs";
import { TalentDetailSimpleView } from "./TalentDetailSimpleView";

const SCROLLER = "[data-org-review-scroll]";

/**
 * 전체 프로필 in place: the review takes the list's spot in the same column,
 * which keeps its size (as 외부 후보 has always opened), instead of a sheet
 * over the screen. Back brings the list back where it was: the list stays
 * mounted (its open card, loaded pages and filters stay), and the column's
 * scroll is remembered.
 */
export function OrgCandidateInPlace({
  backLabel,
  children,
}: {
  backLabel: string;
  children: ReactNode;
}) {
  const { detailOpen } = useOrgJobsDetail();
  const rootRef = useRef<HTMLDivElement>(null);
  const listTop = useRef(0);
  const shown = useRef(detailOpen);

  // Where the list is, while it shows.
  useEffect(() => {
    const scroller = rootRef.current?.closest<HTMLElement>(SCROLLER);
    if (detailOpen || !scroller) return;
    const remember = () => {
      listTop.current = scroller.scrollTop;
    };
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => scroller.removeEventListener("scroll", remember);
  }, [detailOpen]);

  // The review opens at the top; Back returns to the list's place.
  useLayoutEffect(() => {
    if (shown.current === detailOpen) return;
    shown.current = detailOpen;
    rootRef.current
      ?.closest<HTMLElement>(SCROLLER)
      ?.scrollTo({ top: detailOpen ? 0 : listTop.current });
  }, [detailOpen]);

  return (
    <div data-org-candidate-in-place="" ref={rootRef}>
      <div hidden={detailOpen}>{children}</div>
      {detailOpen ? (
        <TalentDetailSimpleView backLabel={backLabel} presentation="inline" />
      ) : null}
    </div>
  );
}

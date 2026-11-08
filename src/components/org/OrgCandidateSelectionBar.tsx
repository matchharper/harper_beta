import { useEffect, useRef, useState, type ReactNode } from "react";
import { Square, SquareCheck, SquareMinus, X } from "lucide-react";
import { MuteButton, muteButtonVariants } from "@/components/ui/button";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { useOrgCandidateDecisionRunner } from "@/hooks/org/useOrgCandidateDecisionRunner";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import type { OrgBoardItem, OrgStage } from "@/lib/org/server";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { cn } from "@/lib/utils";
import { suggestOrgStopReasons } from "@/lib/org/evaluationSuggestions";
import { getOrgCandidateDisplayName } from "./OrgCandidateCard";
import { StopCandidateDialog } from "./OrgCandidateDecisionDialogs";
import { CompanyIntroRequestDialog } from "./CompanyIntroDecisionDialogs";
import {
  OrgStageMoveDialog,
  toOrgStageMoveCandidate,
} from "./OrgStageMoveDialog";

/**
 * The inbox's selection tools above the list or grid: a small 전체 선택 button
 * (the same button as 열 설정 beside it in the list), and once candidates are
 * selected, the actions the inbox already offers per card. No bar across the
 * page; while something is selected the row stays at the top on the page's
 * own background.
 */
export function OrgCandidateSelectionBar({
  canManageCandidates,
  items,
  onSelectedIdsChange,
  roleId,
  roleTitle,
  selectedIds,
  stage,
  stages,
  trailing,
  workspaceId,
}: {
  canManageCandidates: boolean;
  items: OrgBoardItem[];
  onSelectedIdsChange: (ids: Set<string>) => void;
  roleId: string | null;
  roleTitle: string;
  selectedIds: ReadonlySet<string>;
  stage: "pending_connection" | "company_intro";
  stages: OrgStage[];
  /** More tools for the same row, e.g. the list's 열 설정. */
  trailing?: ReactNode;
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const decisions = useOrgCandidateDecisionRunner(workspaceId);
  const { bootstrap, currentUserEmail } = useOrgWorkspace();
  const [closing, setClosing] = useState<OrgBoardItem[] | null>(null);
  const [moving, setMoving] = useState<OrgBoardItem[] | null>(null);
  const [introducing, setIntroducing] = useState<OrgBoardItem[] | null>(null);
  const displayName = (item: OrgBoardItem) =>
    sourceT(getOrgCandidateDisplayName(item));
  const selected = items.filter((item) =>
    selectedIds.has(item.recommendationId)
  );
  const count = selected.length;
  const allSelected = count > 0 && count === items.length;
  const pass = stage === "company_intro";
  const clear = () => onSelectedIdsChange(new Set());
  // While something is selected the row sticks to the top. It gets a glass
  // backing only once content scrolls under it (the page behind is see-through),
  // so at rest no bar shows.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const selecting = count > 0;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!selecting || !node || typeof IntersectionObserver === "undefined") {
      setStuck(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) =>
      setStuck(!entry.isIntersecting)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [selecting]);

  return (
    <>
      <div aria-hidden className="h-0" ref={sentinelRef} />
      <div
        className={cn(
          "mb-2 flex min-h-8 flex-wrap items-center gap-1.5",
          selecting ? "sticky top-0 z-20 py-1" : null,
          stuck
            ? // The glass also covers the list's top padding above the row.
              "-mx-2 rounded-b-lg bg-bg-floating px-2 shadow-(--shadow-button) backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-bg-floating before:backdrop-blur-md before:content-['']"
            : null
        )}
        data-org-selection-bar={count ? "selected" : "idle"}
        data-stuck={stuck ? "true" : undefined}
      >
        {/* The whole button toggles: a label around the real (hidden) checkbox,
            drawn with the same kind of icon as 열 설정 so it reads clearly. */}
        <label
          className={cn(
            muteButtonVariants({ size: "sm", variant: count ? "selected" : "default" }),
            "cursor-pointer select-none px-2 has-focus-visible:ring-2 has-focus-visible:ring-focus-ring"
          )}
        >
          <input
            aria-checked={count > 0 && !allSelected ? "mixed" : allSelected}
            aria-label={c("전체 선택", "Select all")}
            checked={allSelected}
            className="sr-only"
            onChange={(event) =>
              onSelectedIdsChange(
                event.target.checked
                  ? new Set(items.map((item) => item.recommendationId))
                  : new Set()
              )
            }
            ref={(node) => {
              if (node) node.indeterminate = count > 0 && !allSelected;
            }}
            type="checkbox"
          />
          {allSelected ? (
            <SquareCheck aria-hidden className="size-3.5" />
          ) : count ? (
            <SquareMinus aria-hidden className="size-3.5" />
          ) : (
            <Square aria-hidden className="size-3.5" />
          )}
          <span className={count ? "font-medium text-neutral-primary" : undefined}>
            {count
              ? c("{p0}명 선택됨", "{p0} selected", { p0: count })
              : c("전체 선택", "Select all")}
          </span>
        </label>
        {count && canManageCandidates ? (
          <div className="flex items-center gap-1.5">
            <MuteButton
              onClick={() => {
                decisions.save(selected);
                clear();
              }}
              size="sm"
            >
              {ct(c, COMPANY_TERMS.action.save)}
            </MuteButton>
            <MuteButton
              className="whitespace-nowrap"
              onClick={() => setClosing(selected)}
              size="sm"
            >
              {ct(c, COMPANY_TERMS.action.pass)}
            </MuteButton>
            {pass ? (
              <MuteButton
                onClick={() =>
                  setIntroducing(
                    selected.filter(
                      (item) => item.companyIntro?.status === "ready"
                    )
                  )
                }
                size="sm"
                variant="dark"
              >
                {ct(c, COMPANY_TERMS.action.request)}
              </MuteButton>
            ) : (
              <MuteButton
                onClick={() => setMoving(selected)}
                size="sm"
                variant="dark"
              >
                {ct(c, COMPANY_TERMS.action.connect)}
              </MuteButton>
            )}
            <MuteButton
              aria-label={c("선택 해제", "Clear selection")}
              onClick={clear}
              size="sm"
              variant="transparent"
            >
              <X className="size-3.5" />
            </MuteButton>
          </div>
        ) : null}
        {trailing ? <div className="ml-auto flex items-center gap-1.5">{trailing}</div> : null}
      </div>
      <StopCandidateDialog
        key={(closing ?? []).map((item) => item.recommendationId).join(":")}
        candidateNames={(closing ?? []).map(displayName)}
        suggestedReasons={(closing ?? []).map((item) =>
          suggestOrgStopReasons(item.criteriaEvaluations, locale)
        )}
        mode={pass ? "pass" : "reject"}
        onClose={() => setClosing(null)}
        onSubmit={({ notes, notifyCandidateOnClosure }) => {
          if (!closing) return;
          if (pass) decisions.pass(closing, notes);
          else
            decisions.reject(closing, {
              note: notes,
              notifyCandidateOnClosure,
            });
          setClosing(null);
          clear();
        }}
        open={Boolean(closing)}
      />
      <CompanyIntroRequestDialog
        key={(introducing ?? []).map((item) => item.recommendationId).join(":")}
        candidateNames={(introducing ?? []).map(displayName)}
        roleId={roleId}
        workspaceId={workspaceId}
        members={bootstrap.members}
        defaultEmail={currentUserEmail}
        onClose={() => setIntroducing(null)}
        onSubmit={({ companyAppeals, introRecipientEmails }) => {
          if (!introducing) return;
          decisions.sendIntros(introducing, {
            appeals: companyAppeals,
            introRecipientEmails,
          });
          setIntroducing(null);
          clear();
        }}
        open={Boolean(introducing?.length)}
        pending={false}
      />
      <OrgStageMoveDialog
        key={(moving ?? []).map((item) => item.recommendationId).join(":")}
        allowContactDirectly={isInternalDomainEmail(currentUserEmail)}
        candidates={(moving ?? []).map((item) =>
          toOrgStageMoveCandidate(item, displayName(item))
        )}
        members={bootstrap.members}
        onClose={() => setMoving(null)}
        onSubmit={(submit) => {
          if (!moving) return;
          decisions.move(moving, submit);
          setMoving(null);
          clear();
        }}
        open={Boolean(moving)}
        roleId={roleId}
        roleTitle={roleTitle}
        stages={stages}
      />
    </>
  );
}

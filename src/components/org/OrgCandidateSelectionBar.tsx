import { useState } from "react";
import { X } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { useOrgCandidateDecisionRunner } from "@/hooks/org/useOrgCandidateDecisionRunner";
import { CANDIDATE_DECISION_LABELS } from "@/lib/org/candidateDecision";
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
 * Select-all row above the inbox list or grid. Once candidates are selected it
 * turns into the toolbar for the actions the inbox already offers per card.
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

  return (
    <>
      <div
        className={cn(
          "sticky top-0 z-20 mb-2 flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
          count ? "bg-neutral-200" : "bg-white"
        )}
      >
        <Checkbox
          aria-label={c("전체 선택", "Select all")}
          checked={allSelected}
          indeterminate={count > 0 && !allSelected}
          onChange={(event) =>
            onSelectedIdsChange(
              event.target.checked
                ? new Set(items.map((item) => item.recommendationId))
                : new Set()
            )
          }
        />
        <span
          className={cn(
            "text-[13px]",
            count ? "font-medium text-neutral-primary" : "text-neutral-muted"
          )}
        >
          {count
            ? c("{p0}명 선택됨", "{p0} selected", { p0: count })
            : c("전체 선택", "Select all")}
        </span>
        {count && canManageCandidates ? (
          <div className="ml-auto flex items-center gap-1.5">
            <MuteButton
              onClick={() => {
                decisions.save(selected);
                clear();
              }}
              size="sm"
            >
              Save
            </MuteButton>
            <MuteButton onClick={() => setClosing(selected)} size="sm">
              {pass ? "Pass" : CANDIDATE_DECISION_LABELS.reject}
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
                {c("Send Intro", "Send Intro")}
              </MuteButton>
            ) : (
              <MuteButton
                onClick={() => setMoving(selected)}
                size="sm"
                variant="dark"
              >
                {CANDIDATE_DECISION_LABELS.connect}
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

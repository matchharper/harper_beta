import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { useOrgCandidateDecisionRunner } from "@/hooks/org/useOrgCandidateDecisionRunner";
import { companyCriterionFitnessLabel } from "@/lib/org/companyCriteriaEvaluations";
import { suggestOrgStopReasons } from "@/lib/org/evaluationSuggestions";
import type { OrgBoardItem } from "@/lib/org/server";
import { useOrgCriteriaRecheckStore } from "@/store/useOrgCriteriaRecheckStore";
import { getOrgCandidateDisplayName } from "./OrgCandidateCard";
import { StopCandidateDialog } from "./OrgCandidateDecisionDialogs";

const NOT_A_FIT = new Set(["bad", "conflict"]);

type InboxStage = "pending_connection" | "company_intro";

function inboxItemsOf(items: OrgBoardItem[] | undefined, roleId: string) {
  return (items ?? []).filter(
    (item) =>
      item.roleId === roleId &&
      !item.savedAt &&
      (item.stage === "pending_connection" || item.stage === "company_intro")
  );
}

/**
 * Follows the background re-judging that a criteria change starts. When it
 * ends and some candidates no longer fit a changed criterion, asks the team
 * whether to review them now. Nothing is removed without the team's choice.
 */
export function OrgCriteriaRecheckWatcher({
  items,
  refetch,
  roleId,
}: {
  items: OrgBoardItem[] | undefined;
  refetch: () => unknown;
  roleId: string;
}) {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const router = useRouter();
  const recheck = useOrgCriteriaRecheckStore((state) => state.roles[roleId]);
  const update = useOrgCriteriaRecheckStore((state) => state.update);
  const inbox = inboxItemsOf(items, roleId);
  const judging = inbox.some((item) =>
    item.criteriaEvaluations.some((evaluation) => evaluation.pending)
  );
  const expectedAt = recheck?.expectedAt;

  // A save that reported re-judging is followed for a minute even if the
  // board has not shown it yet.
  useEffect(() => {
    if (!expectedAt) return;
    const clear = () =>
      update(roleId, (current) => ({ ...current, expectedAt: undefined }));
    const timer = window.setTimeout(
      clear,
      Math.max(0, expectedAt + 60_000 - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [expectedAt, roleId, update]);

  const polling = judging || Boolean(expectedAt);
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void refetch(), 2_000);
    return () => window.clearInterval(timer);
  }, [polling, refetch]);

  useEffect(() => {
    if (!items) return;
    const current = inboxItemsOf(items, roleId);
    const still = current.filter((item) =>
      item.criteriaEvaluations.some((evaluation) => evaluation.pending)
    );
    if (still.length) {
      update(roleId, (state) => {
        const watching = { ...(state.watching ?? {}) };
        for (const item of still) {
          watching[item.recommendationId] = Array.from(
            new Set([
              ...(watching[item.recommendationId] ?? []),
              ...item.criteriaEvaluations
                .filter((evaluation) => evaluation.pending)
                .map((evaluation) => evaluation.name),
            ])
          );
        }
        return { ...state, expectedAt: undefined, watching };
      });
      return;
    }
    const watching =
      useOrgCriteriaRecheckStore.getState().roles[roleId]?.watching;
    if (!watching || !Object.keys(watching).length) return;
    const found: Record<string, string[]> = {};
    for (const item of current) {
      const changed = watching[item.recommendationId];
      if (!changed) continue;
      const misfits = item.criteriaEvaluations
        .filter(
          (evaluation) =>
            changed.includes(evaluation.name) &&
            NOT_A_FIT.has(evaluation.fitness)
        )
        .map((evaluation) => evaluation.name);
      if (misfits.length) found[item.recommendationId] = misfits;
    }
    update(roleId, (state) => ({
      ...state,
      found: Object.keys(found).length ? found : state.found,
      watching: undefined,
    }));
  }, [items, roleId, update]);

  const found = recheck?.found ?? {};
  const foundItems = inbox.filter((item) => found[item.recommendationId]);
  const names = foundItems.map((item) =>
    sourceT(getOrgCandidateDisplayName(item))
  );
  const dismiss = () =>
    update(roleId, (state) => ({ ...state, found: undefined }));
  const review = () => {
    update(roleId, (state) => ({
      ...state,
      found: undefined,
      queue: { ...(state.queue ?? {}), ...(state.found ?? {}) },
    }));
    const inboxStage = foundItems.some(
      (item) => item.stage === "pending_connection"
    )
      ? "pending_connection"
      : "company_intro";
    const query: Record<string, string | string[] | undefined> = {
      ...router.query,
      inboxStage,
      tab: "inbox",
    };
    for (const key of [
      "talentId",
      "recommendationId",
      "detailRoleId",
      "detailWorkspaceId",
      "review",
      "view",
    ])
      delete query[key];
    void router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
      scroll: false,
    });
  };

  return (
    <TalentCareerModal
      footer={
        <div className="flex items-center justify-end gap-2">
          <MuteButton onClick={dismiss} type="button">
            {c("그대로 두기", "Leave as is")}
          </MuteButton>
          <MuteButton onClick={review} type="button" variant="dark">
            {c("검토하기", "Review")}
          </MuteButton>
        </div>
      }
      mobileBottomSheet
      onClose={dismiss}
      open={foundItems.length > 0}
      panelClassName="max-w-md border-neutral-1000-a05 bg-bg-floating"
      title={c(
        "기준이 바뀌어 적합도를 다시 계산했어요",
        "Fit recalculated for the new criteria"
      )}
    >
      <p className="text-[13px] leading-5 text-neutral-primary">
        {c(
          "바뀐 기준에 맞지 않는 후보가 {p0}명 있어요. 인박스에 남길지 제외할지 지금 정할까요?",
          "{p0} candidates don't fit the changed criteria. Decide now whether to keep or exclude them?",
          { p0: foundItems.length }
        )}
      </p>
      <p className="mt-2 text-[12px] text-neutral-muted">
        {names.length > 3
          ? c("{p0} 외 {p1}명", "{p0} and {p1} more", {
              p0: names.slice(0, 3).join(", "),
              p1: names.length - 3,
            })
          : names.join(", ")}
      </p>
    </TalentCareerModal>
  );
}

/** Count of candidates the team chose to review, per inbox tab. */
export function useOrgCriteriaReviewCounts(
  items: OrgBoardItem[] | undefined,
  roleId: string | undefined
) {
  const queue = useOrgCriteriaRecheckStore((state) =>
    roleId ? state.roles[roleId]?.queue : undefined
  );
  const counts: Record<InboxStage, number> = {
    company_intro: 0,
    pending_connection: 0,
  };
  if (!roleId || !queue) return counts;
  for (const item of inboxItemsOf(items, roleId)) {
    if (queue[item.recommendationId]) counts[item.stage as InboxStage] += 1;
  }
  return counts;
}

/**
 * Shown first in an inbox tab while candidates from a criteria change wait
 * for the team: keep each one, or exclude it (Reject or Pass with a reason).
 */
export function OrgCriteriaReviewPanel({
  items,
  onOpen,
  roleId,
  stage,
  workspaceId,
}: {
  items: OrgBoardItem[];
  onOpen: (item: OrgBoardItem) => void;
  roleId: string;
  stage: InboxStage;
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const decisions = useOrgCandidateDecisionRunner(workspaceId);
  const queue = useOrgCriteriaRecheckStore(
    (state) => state.roles[roleId]?.queue
  );
  const update = useOrgCriteriaRecheckStore((state) => state.update);
  const [excluding, setExcluding] = useState<OrgBoardItem[] | null>(null);
  const flagged = items.filter((item) => queue?.[item.recommendationId]);
  if (!flagged.length && !excluding) return null;

  const resolve = (resolved: OrgBoardItem[]) =>
    update(roleId, (state) => {
      const next = { ...(state.queue ?? {}) };
      for (const item of resolved) delete next[item.recommendationId];
      return { ...state, queue: next };
    });
  const pass = stage === "company_intro";
  // The changed criterion this candidate no longer fits, as offered in the
  // reason list ("기준 · 맞지 않음").
  const misfitNote = (item: OrgBoardItem) =>
    suggestOrgStopReasons(
      item.criteriaEvaluations.filter((evaluation) =>
        queue?.[item.recommendationId]?.includes(evaluation.name)
      ),
      locale
    )[0] ?? "";

  return (
    <>
      {flagged.length ? (
        <section
          aria-label={c("다시 볼 후보", "Candidates to review")}
          className="mb-4 rounded-lg border border-neutral-1000-a05 bg-bg-default"
        >
          <header className="flex items-center gap-2 border-b border-neutral-1000-a05 px-4 py-2.5">
            <h3 className="text-[13px] font-medium text-neutral-primary">
              {c(
                "바뀐 기준으로 다시 볼 후보 {p0}명",
                "{p0} candidates to review for the changed criteria",
                { p0: flagged.length }
              )}
            </h3>
            <div className="ml-auto flex items-center gap-1.5">
              <MuteButton
                onClick={() => resolve(flagged)}
                size="sm"
                variant="transparent"
              >
                {c("모두 남기기", "Keep all")}
              </MuteButton>
              {flagged.length > 1 ? (
                <MuteButton onClick={() => setExcluding(flagged)} size="sm">
                  {c("모두 제외하기", "Exclude all")}
                </MuteButton>
              ) : null}
            </div>
          </header>
          <ul className="divide-y divide-neutral-1000-a05">
            {flagged.map((item) => {
              const name = sourceT(getOrgCandidateDisplayName(item));
              const misfits = item.criteriaEvaluations.filter((evaluation) =>
                queue?.[item.recommendationId]?.includes(evaluation.name)
              );
              return (
                <li
                  className="flex items-start gap-3 px-4 py-3"
                  key={item.recommendationId}
                >
                  <div className="min-w-0 flex-1">
                    <button
                      className="truncate text-left text-[13px] font-medium text-neutral-primary hover:underline"
                      onClick={() => onOpen(item)}
                      type="button"
                    >
                      {name}
                    </button>
                    {misfits.map((evaluation) => (
                      <p
                        className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-neutral-muted"
                        key={evaluation.name}
                      >
                        <span className="text-critical">
                          {evaluation.name} ·{" "}
                          {companyCriterionFitnessLabel(
                            evaluation.fitness,
                            locale
                          )}
                        </span>
                        {evaluation.content ? ` — ${evaluation.content}` : ""}
                      </p>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <MuteButton onClick={() => resolve([item])} size="sm">
                      {c("남기기", "Keep")}
                    </MuteButton>
                    <MuteButton
                      onClick={() => setExcluding([item])}
                      size="sm"
                      variant="warn"
                    >
                      {c("제외하기", "Exclude")}
                    </MuteButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <StopCandidateDialog
        key={(excluding ?? []).map((item) => item.recommendationId).join(":")}
        candidateNames={(excluding ?? []).map((item) =>
          sourceT(getOrgCandidateDisplayName(item))
        )}
        defaultNote={(excluding ?? []).map(misfitNote)}
        mode={pass ? "pass" : "reject"}
        onClose={() => setExcluding(null)}
        suggestedReasons={(excluding ?? []).map((item) =>
          suggestOrgStopReasons(item.criteriaEvaluations, locale)
        )}
        onSubmit={({ notes, notifyCandidateOnClosure }) => {
          if (!excluding) return;
          if (pass) decisions.pass(excluding, notes);
          else
            decisions.reject(excluding, {
              note: notes,
              notifyCandidateOnClosure,
            });
          resolve(excluding);
          setExcluding(null);
        }}
        open={Boolean(excluding)}
      />
    </>
  );
}

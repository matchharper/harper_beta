import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { useOrgCandidateSave } from "@/hooks/org/useOrgCandidateSave";
import { useOrgJobsCandidateActions } from "@/hooks/org/useOrgJobs";
import {
  usePassOrgCompanyIntro,
  useRequestOrgCompanyIntro,
} from "@/hooks/org/useOrg";
import type { OrgBoardItem } from "@/lib/org/server";
import {
  toOrgStageMoveCandidate,
  type OrgStageMoveSubmit,
} from "@/components/org/OrgStageMoveDialog";
import {
  ORG_UNDO_WINDOW_MS,
  useOrgDeferredActionStore,
} from "@/store/useOrgDeferredActionStore";
import { useToastStore } from "@/store/useToastStore";
import { useRouter } from "next/router";
import { buildOrgHref } from "@/lib/org/routes";

// "연결됨으로", "1차 인터뷰로": picks the particle from the label's last syllable.
function withDirectionParticle(label: string) {
  const code = label.trim().charCodeAt(label.trim().length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${label}(으)로`;
  const finalConsonant = code % 28;
  return `${label}${finalConsonant === 0 || finalConsonant === 8 ? "로" : "으로"}`;
}

async function runEach<T>(
  items: T[],
  run: (item: T) => Promise<unknown>,
  concurrency = 3
) {
  const failures: unknown[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await run(item);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return failures;
}

/**
 * Runs candidate decisions after a short undo window and reports them with one
 * toast, whether the company acted on one candidate or several.
 */
export function useOrgCandidateDecisionRunner(workspaceId: string) {
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const addToast = useToastStore((state) => state.add);
  const schedule = useOrgDeferredActionStore((state) => state.schedule);
  const cancel = useOrgDeferredActionStore((state) => state.cancel);
  const { changeStage } = useOrgJobsCandidateActions();
  const passCompanyIntro = usePassOrgCompanyIntro();
  const requestCompanyIntro = useRequestOrgCompanyIntro();
  const saveCandidate = useOrgCandidateSave();
  const router = useRouter();

  /** Opens this Role's pipeline with the moved candidates marked. */
  const showInPipeline = (roleId: string, recommendationIds: string[]) => {
    const href = buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "pipeline",
      view: "pipeline",
    });
    void router.push(
      `${href}&highlight=${encodeURIComponent(recommendationIds.join(","))}`,
      undefined,
      { shallow: true }
    );
  };

  const who = (items: OrgBoardItem[]) =>
    items.length === 1
      ? c("{p0}님", "{p0}", {
          p0: sourceT(
            items[0].talent.name || items[0].talent.email || "이름 없음"
          ),
        })
      : c("{p0}명", "{p0} candidates", { p0: items.length });

  const reportFailures = (failures: unknown[], fallback: string) => {
    if (!failures.length) return;
    addToast({
      message:
        failures.length === 1
          ? localizedOrgErrorMessage(failures[0], locale, fallback)
          : c(
              "{p0}명은 처리하지 못했어요. 후보자 상태를 확인한 뒤 다시 시도해 주세요.",
              "{p0} candidates couldn't be updated. Check their status and try again.",
              { p0: failures.length }
            ),
      variant: "error",
    });
  };

  const defer = ({
    message,
    recommendationIds,
    roleId,
    run,
    stage,
  }: {
    message: string;
    recommendationIds: string[];
    /** With a Role, the toast can open its pipeline at the moved cards. */
    roleId?: string | null;
    run: () => Promise<unknown>;
    stage?: string | null;
  }) => {
    const id = schedule({ recommendationIds, run, stage });
    const inPipeline =
      router?.query.tab === "pipeline" && router?.query.roleId === roleId;
    addToast({
      actions: [
        {
          label: c("되돌리기", "Undo"),
          onClick: () => {
            if (cancel(id)) addToast({ message: c("되돌렸어요.", "Undone.") });
          },
        },
        ...(roleId && !inPipeline
          ? [
              {
                label: c("보기", "View"),
                onClick: () => showInPipeline(roleId, recommendationIds),
              },
            ]
          : []),
      ],
      duration: ORG_UNDO_WINDOW_MS,
      message,
      variant: "dark",
    });
  };

  const rejectMessage = (
    target: string,
    ended: boolean,
    notifyCandidateOnClosure: boolean
  ) =>
    `${
      ended
        ? c("{p0} 연결 종료", "Ended {p0}", { p0: target })
        : c("{p0} 연결 거절", "Rejected {p0}", { p0: target })
    } · ${
      notifyCandidateOnClosure
        ? c("Harper가 종료 안내를 보내요", "Harper will send a closing note")
        : c("종료 안내는 보내지 않아요", "No closing note")
    }`;
  const rejectFailure = () =>
    c(
      "종료 결과를 확인하지 못했어요. 후보자의 현재 상태를 먼저 확인해 주세요.",
      "We couldn't confirm whether the process ended. Check the candidate's current status first."
    );

  const reject = (
    items: OrgBoardItem[],
    {
      note,
      notifyCandidateOnClosure,
    }: {
      /** One reason for everyone, or one per item in the same order. */
      note: string | null | string[];
      notifyCandidateOnClosure: boolean;
    }
  ) => {
    if (!items.length) return;
    const targets = items.map((item, index) => ({
      item,
      note: Array.isArray(note) ? (note[index] ?? null) : note,
    }));
    defer({
      message: rejectMessage(
        who(items),
        items.some((item) => item.stage !== "pending_connection"),
        notifyCandidateOnClosure
      ),
      recommendationIds: items.map((item) => item.recommendationId),
      roleId: items[0]?.roleId,
      run: async () =>
        reportFailures(
          await runEach(targets, (target) =>
            changeStage(
              target.item,
              "process_stopped",
              { notifyCandidateOnClosure, stopNote: target.note },
              "silent"
            )
          ),
          rejectFailure()
        ),
      stage: "process_stopped",
    });
  };

  /** Rejects the candidate open in the detail view, which has no board item. */
  const rejectOpenCandidate = ({
    ended,
    name,
    notifyCandidateOnClosure,
    recommendationId,
    run,
  }: {
    ended: boolean;
    name: string;
    notifyCandidateOnClosure: boolean;
    recommendationId: string;
    run: () => Promise<unknown>;
  }) =>
    defer({
      message: rejectMessage(
        c("{p0}님", "{p0}", { p0: name }),
        ended,
        notifyCandidateOnClosure
      ),
      recommendationIds: [recommendationId],
      run: async () =>
        reportFailures(await runEach([run], (task) => task()), rejectFailure()),
      stage: "process_stopped",
    });

  /** `reason` is shared, or one per item in the same order. */
  const pass = (items: OrgBoardItem[], reason: string | string[]) => {
    const targets = items.flatMap((item, index) =>
      item.companyIntro
        ? [
            {
              introCandidateId: item.companyIntro.id,
              item,
              reason: Array.isArray(reason) ? (reason[index] ?? "") : reason,
            },
          ]
        : []
    );
    const intros = targets.map((target) => target.item);
    if (!intros.length) return;
    defer({
      message: c("{p0} Pass", "Passed {p0}", { p0: who(intros) }),
      recommendationIds: intros.map((item) => item.recommendationId),
      roleId: intros[0]?.roleId,
      run: async () =>
        reportFailures(
          await runEach(targets, (target) =>
            passCompanyIntro.mutateAsync({
              introCandidateId: target.introCandidateId,
              reason: target.reason,
              workspaceId,
            })
          ),
          c(
            "Pass하지 못했어요. 다시 시도해 주세요.",
            "Couldn't pass. Try again."
          )
        ),
      stage: "process_stopped",
    });
  };

  /** Sends Intro requests for suggested candidates, one reason per item. */
  const sendIntros = (
    items: OrgBoardItem[],
    {
      appeals,
      introRecipientEmails,
    }: { appeals: string[]; introRecipientEmails: string[] }
  ) => {
    const targets = items.flatMap((item, index) =>
      item.companyIntro?.status === "ready"
        ? [
            {
              appeal: appeals[index] ?? "",
              introCandidateId: item.companyIntro.id,
              item,
            },
          ]
        : []
    );
    if (!targets.length) return;
    const values = { p0: who(targets.map((target) => target.item)) };
    defer({
      message: `${c("{p0}에게 Intro를 보내요", "Sending intros to {p0}", values)} · ${c("파이프라인 > 연결 제안한 후보", "Pipeline > Intro requested")}`,
      recommendationIds: targets.map((target) => target.item.recommendationId),
      roleId: targets[0]?.item.roleId,
      run: async () =>
        reportFailures(
          await runEach(targets, (target) =>
            requestCompanyIntro.mutateAsync({
              companyAppeal: target.appeal,
              introCandidateId: target.introCandidateId,
              introRecipientEmails,
              workspaceId,
            })
          ),
          c(
            "Intro를 보내지 못했어요. 다시 시도해 주세요.",
            "Couldn't send the intro. Try again."
          )
        ),
      stage: "intro_requested",
    });
  };

  const save = (items: OrgBoardItem[]) => {
    if (!items.length) return;
    defer({
      message: c("{p0}을 저장함에 넣었어요", "Saved {p0}", {
        p0: who(items),
      }),
      recommendationIds: items.map((item) => item.recommendationId),
      roleId: items[0]?.roleId,
      run: async () =>
        reportFailures(
          await runEach(items, (item) =>
            saveCandidate.mutateAsync({
              recommendationId: item.recommendationId,
              roleId: item.roleId,
              saved: true,
              talentId: item.talentId,
              workspaceId,
            })
          ),
          c(
            "저장하지 못했어요. 다시 시도해 주세요.",
            "Couldn't save. Try again."
          )
        ),
    });
  };

  const moveMessage = (target: string, submit: OrgStageMoveSubmit) => {
    const values = {
      p0: target,
      p1: withDirectionParticle(submit.stageLabel),
      p2: submit.stageLabel,
    };
    const what =
      submit.action === "interview"
        ? c(
            "{p0}을 {p1} 옮기고 면접 예약 링크를 보내요",
            "Moving {p0} to {p2} and sending interview links",
            values
          )
        : submit.action === "intro_email"
          ? c(
              "{p0}을 {p1} 옮기고 소개 메일을 보내요",
              "Moving {p0} to {p2} and sending intro emails",
              values
            )
          : c("{p0}을 {p1} 옮겨요", "Moving {p0} to {p2}", values);
    return `${what} · ${c("파이프라인 > {p2}", "Pipeline > {p2}", values)}`;
  };
  const moveFailure = () =>
    c(
      "단계를 옮기지 못했어요. 후보자의 현재 상태와 메일을 먼저 확인해 주세요.",
      "Couldn't move the candidate. Check their current status and email first."
    );

  const move = (items: OrgBoardItem[], submit: OrgStageMoveSubmit) => {
    if (!items.length) return;
    defer({
      message: moveMessage(who(items), submit),
      recommendationIds: items.map((item) => item.recommendationId),
      roleId: items[0]?.roleId,
      run: async () =>
        reportFailures(
          await runEach(items, (item) =>
            changeStage(
              item,
              submit.stage,
              submit.options(
                toOrgStageMoveCandidate(
                  item,
                  sourceT(item.talent.name || item.talent.email || "이름 없음")
                )
              ),
              "silent"
            )
          ),
          moveFailure()
        ),
      stage: submit.stage,
    });
  };

  /** Moves the candidate open in the detail view, which has no board item. */
  const moveOpenCandidate = ({
    name,
    recommendationId,
    run,
    submit,
  }: {
    name: string;
    recommendationId: string;
    run: () => Promise<unknown>;
    submit: OrgStageMoveSubmit;
  }) =>
    defer({
      message: moveMessage(c("{p0}님", "{p0}", { p0: name }), submit),
      recommendationIds: [recommendationId],
      run: async () =>
        reportFailures(await runEach([run], (task) => task()), moveFailure()),
      stage: submit.stage,
    });

  return {
    defer,
    move,
    moveOpenCandidate,
    pass,
    reject,
    rejectOpenCandidate,
    save,
    sendIntros,
  };
}

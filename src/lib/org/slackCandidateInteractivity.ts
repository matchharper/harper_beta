import "server-only";
import { after } from "next/server";
import { enqueueOrgAgentWebActionTurn } from "@/lib/org/agent/webActionTurn";
import { passOrgCompanyIntro, requestOrgCompanyIntro } from "@/lib/org/server";
import {
  openHarperSlackModal,
  updateHarperSlackModal,
} from "@/lib/org/slackHarper";
import { getOrgWorkspaceLocale } from "@/lib/org/workspaceLocale.server";
import {
  billingActionNotice,
  billingErrorCopy,
  WorkspaceBillingError,
} from "@/lib/org/billing/types";
import { billingActionNoticeSlack } from "@/lib/org/billing/notice";
import {
  authorizeSlackCandidate,
  presentSlackCandidate,
  readSlackCandidate,
  resolveSlackCandidate,
} from "./slackCandidateWorkObject.server";
import {
  buildSlackCandidateDecisionView,
  candidateEntityId,
  candidateStatusLabel,
  parseCandidateDecisionInputs,
  parseCandidateDecisionMetadata,
  SLACK_CANDIDATE_DECISION_CALLBACK,
  SLACK_CANDIDATE_INTRO_ACTION,
  SLACK_CANDIDATE_PASS_ACTION,
} from "./slackCandidateWorkObject";

const clean = (value: unknown) => String(value ?? "").trim();
function stateView(text: string) {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Harper" },
    close: { type: "plain_text", text: "Close" },
    blocks: [{ type: "section", text: { type: "plain_text", text } }],
  };
}

export async function handleSlackCandidateInteraction(
  payload: Record<string, any>
) {
  const action = payload.actions?.[0];
  const actionId = clean(action?.action_id);
  const opening =
    payload.type === "block_actions" &&
    [SLACK_CANDIDATE_INTRO_ACTION, SLACK_CANDIDATE_PASS_ACTION].includes(
      actionId
    );
  const submitting =
    payload.type === "view_submission" &&
    payload.view?.callback_id === SLACK_CANDIDATE_DECISION_CALLBACK;
  if (!opening && !submitting) return null;
  const slackTeamId = clean(payload.team?.id);
  const slackUserId = clean(payload.user?.id);
  const channelId =
    clean(payload.container?.channel_id || payload.channel?.id) || null;
  const triggerId = clean(payload.trigger_id);
  const metadata = submitting
    ? parseCandidateDecisionMetadata(payload.view?.private_metadata)
    : null;
  const candidateId = opening
    ? candidateEntityId(action?.value)
    : metadata?.candidateId;
  if (!candidateId || !slackTeamId || !slackUserId || (opening && !triggerId))
    return { ok: true, ignored: true };
  if (
    process.env.HARPER_LOCAL_E2E === "1" &&
    (payload.api_app_id !== process.env.SLACK_HARPER_LOCAL_APP_ID ||
      (channelId && channelId !== process.env.HARPER_LOCAL_ONLY_CHANNEL_ID))
  )
    return { ok: true, ignored: true };

  if (opening) {
    const resolved = await resolveSlackCandidate({
      candidateId,
      slackTeamId,
      channelId,
    });
    const opened = await openHarperSlackModal({
      token: resolved.context.token,
      triggerId,
      view: stateView("Loading…"),
    });
    const viewId = clean(opened.view?.id);
    if (!viewId)
      throw new Error("Slack did not open the candidate decision modal");
    after(async () => {
      try {
        const read = await readSlackCandidate({
          candidateId,
          slackTeamId,
          slackUserId,
          channelId,
        });
        if (
          !read.member.canManageCandidates ||
          !(actionId === SLACK_CANDIDATE_INTRO_ACTION
            ? read.detail.capabilities.requestIntro
            : read.detail.capabilities.pass)
        ) {
          throw new Error(
            read.locale === "ko"
              ? "현재 이 후보자의 Intro 요청 또는 Pass를 결정할 수 없어요."
              : "You cannot request an intro or pass on this candidate right now."
          );
        }
        await updateHarperSlackModal({
          token: resolved.context.token,
          viewId,
          view: buildSlackCandidateDecisionView({
            metadata: {
              candidateId,
              decision:
                actionId === SLACK_CANDIDATE_INTRO_ACTION
                  ? "request_intro"
                  : "pass",
              locale: read.locale,
            },
            candidate: read.candidate,
            members: read.detail.members,
            actorEmail: read.member.email,
          }),
        });
      } catch (error) {
        console.warn("[harper-slack/candidate:open]", error);
        const locale = await getOrgWorkspaceLocale(
          resolved.context.workspaceId
        );
        await updateHarperSlackModal({
          token: resolved.context.token,
          viewId,
          view: stateView(
            locale === "ko"
              ? "현재 이 후보자의 결정을 진행할 수 없어요. Harper Workspace 권한과 후보자의 최신 상태를 확인해 주세요."
              : "This candidate decision is unavailable. Check your Harper Workspace access and the candidate’s current status."
          ),
        });
      }
    });
    return { ok: true, status: "candidate_decision_opened" };
  }

  if (!metadata || !payload.view?.id) return { ok: true, ignored: true };
  const inputs = parseCandidateDecisionInputs(metadata, payload.view?.state);
  if (Object.keys(inputs.errors).length)
    return { response_action: "errors", errors: inputs.errors };
  const resolved = await resolveSlackCandidate({ candidateId, slackTeamId });
  const viewId = clean(payload.view.id);
  after(async () => {
    let read: Awaited<ReturnType<typeof readSlackCandidate>> | null = null;
    try {
      // Recheck the actor and canonical command on every submission, including
      // retries. The RPC owns current availability, consent, and idempotency.
      const actor = await authorizeSlackCandidate({
        candidateId,
        slackTeamId,
        slackUserId,
      });
      if (!actor.member.canManageCandidates)
        throw new Error(
          metadata.locale === "ko"
            ? "이 결정을 내릴 권한이 없어요."
            : "You do not have permission to make this decision."
        );
      if (actor.row.status === "ready")
        read = await readSlackCandidate({
          candidateId,
          slackTeamId,
          slackUserId,
        });
      const common = {
        introCandidateId: candidateId,
        user: actor.user,
        workspaceId: actor.context.workspaceId,
      };
      const result =
        metadata.decision === "request_intro"
          ? await requestOrgCompanyIntro({
              ...common,
              companyAppeal: inputs.appeal,
              introRecipientEmails: inputs.recipientEmails,
            })
          : await passOrgCompanyIntro(common);
      try {
        await enqueueOrgAgentWebActionTurn({
          actionName: "company_intro_decision",
          actionContext: {
            decision: metadata.decision,
            introCandidateId: candidateId,
            status: result.status,
            newIntroCreated: result.newIntroCreated,
            candidateAcceptedAt: result.candidateAcceptedAt,
            currentStageTag: result.stageTag,
          },
          roleId: actor.row.role_id,
          user: actor.user,
          workspaceId: actor.context.workspaceId,
          idempotencyKey: `slack-candidate:${candidateId}:${metadata.decision}`,
        });
      } catch (error) {
        console.error("[harper-slack/candidate:agent-wake]", error);
      }
      // Once the command succeeds, a display-refresh failure must never offer
      // the decision again or claim that the command failed.
      let status =
        result.status === "requested" || result.status === "already_requested"
          ? "awaiting_talent"
          : result.status === "already_passed"
            ? "passed"
            : result.status;
      let candidateSentAt: string | null = null;
      try {
        const latest = await resolveSlackCandidate({
          candidateId,
          slackTeamId,
        });
        status = latest.row.status;
        candidateSentAt = latest.row.candidate_sent_at;
      } catch (error) {
        console.warn("[harper-slack/candidate:decision-status]", error);
      }
      try {
        await updateHarperSlackModal({
          token: resolved.context.token,
          viewId,
          view: stateView(
            candidateStatusLabel({ status, candidateSentAt }, metadata.locale)
          ),
        });
        if (triggerId)
          await presentSlackCandidate({
            candidateId,
            slackTeamId,
            slackUserId,
            triggerId,
          });
      } catch (error) {
        console.warn("[harper-slack/candidate:decision-refresh]", error);
      }
    } catch (error) {
      const notice = billingActionNotice(error);
      const errorBlocks = notice
        ? billingActionNoticeSlack(notice, metadata.locale).blocks
        : undefined;
      const message =
        error instanceof WorkspaceBillingError
          ? billingErrorCopy(error.code, metadata.locale)
          : metadata.locale === "ko"
            ? "결정을 반영하지 못했어요. 최신 상태를 확인하고 다시 시도해 주세요."
            : "Unable to save this decision. Check the latest status and try again.";
      console.warn("[harper-slack/candidate:decision]", error);
      await updateHarperSlackModal({
        token: resolved.context.token,
        viewId,
        view: read
          ? buildSlackCandidateDecisionView({
              metadata,
              candidate: read.candidate,
              members: read.detail.members,
              actorEmail: read.member.email,
              appeal: inputs.appeal,
              recipientEmails: inputs.recipientEmails,
              error: notice ? undefined : message,
              errorBlocks,
            })
          : notice
            ? { ...stateView(message), blocks: errorBlocks }
            : stateView(message),
      });
    }
  });
  return {
    response_action: "update",
    view: stateView(
      metadata.locale === "ko"
        ? "결정을 반영하고 있어요…"
        : "Saving your decision…"
    ),
  };
}

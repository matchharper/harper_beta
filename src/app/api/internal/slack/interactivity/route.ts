import { after, NextRequest, NextResponse } from "next/server";
import {
  buildSelectedHarperSlackChoiceBlocks,
  decodeHarperSlackChoiceActionValue,
  HARPER_SLACK_CHOICE_ACTION_PREFIX,
  parseHarperSlackChoiceMarkers,
} from "@/lib/org/slackChoiceButtons";
import {
  getHarperSlackUserEmail,
  isHarperSlackAppId,
  openHarperSlackModal,
  pushHarperSlackModal,
  resolveHarperSlackInteractionContext,
  updateHarperSlackModal,
  updateHarperSlackMessage,
  verifyHarperSlackSignature,
} from "@/lib/org/slackHarper";
import {
  findSlackTalentReviewMember,
  listSlackTalentReviewDecisionMembers,
  loadSlackTalentReviewCandidate,
  loadSlackTalentReviewSourceById,
  loadSlackTalentReviewSourceByMessage,
  logSlackTalentReviewView,
  type SlackTalentReviewMember,
  type SlackTalentReviewSource,
} from "@/lib/org/slackTalentReview";
import {
  postHarperSlackAccessDenied,
  resolveHarperSlackWorkspaceAccess,
} from "@/lib/org/slackMemberAccess";
import {
  buildSlackTalentReviewAccessDeniedView,
  buildSlackTalentReviewAcceptDecisionView,
  buildSlackTalentReviewCandidateView,
  buildSlackTalentReviewDecisionErrorView,
  buildSlackTalentReviewDecisionProcessingView,
  buildSlackTalentReviewDecisionResultView,
  buildSlackTalentReviewErrorView,
  buildSlackTalentReviewLoadingView,
  buildSlackTalentReviewRejectDecisionView,
  decodeSlackTalentReviewViewMetadata,
  HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID,
  HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID,
  HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID,
  HARPER_TALENT_REVIEW_NEXT_ACTION_ID,
  HARPER_TALENT_REVIEW_OPEN_ACTION_ID,
  HARPER_TALENT_REVIEW_PREVIOUS_ACTION_ID,
  HARPER_TALENT_REVIEW_REJECT_ACTION_ID,
  HARPER_TALENT_REVIEW_REJECT_CALLBACK_ID,
  parseSlackTalentReviewDecisionSubmission,
  type SlackTalentReviewDecisionSubmission,
  type SlackTalentReviewViewState,
} from "@/lib/org/slackTalentReviewView";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { OrgHttpError, setOrgCandidateStage } from "@/lib/org/server";

export const runtime = "nodejs";

type SlackBlockActionPayload = {
  actions?: Array<{
    action_id?: string;
    action_ts?: string;
    selected_option?: { value?: string };
    value?: string;
  }>;
  api_app_id?: string;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { blocks?: unknown; text?: string; ts?: string };
  team?: { id?: string };
  trigger_id?: string;
  type?: string;
  user?: { id?: string };
  view?: {
    callback_id?: string;
    hash?: string;
    id?: string;
    private_metadata?: string;
    state?: SlackTalentReviewViewState;
  };
};

const clean = (value: unknown) => String(value ?? "").trim();

function escapeSlackText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function updateReviewModalSafely(args: {
  hash?: string | null;
  token: string;
  view: Record<string, unknown>;
  viewId: string;
}) {
  try {
    await updateHarperSlackModal(args);
    return true;
  } catch (error) {
    console.warn("[harper-slack/review:update-modal]", error);
    return false;
  }
}

async function showReviewCandidate(args: {
  candidateIndex: number;
  hash?: string | null;
  member: SlackTalentReviewMember;
  slackChannelId: string | null;
  slackTeamId: string;
  slackUserId: string;
  source: SlackTalentReviewSource;
  token: string;
  viewId: string;
}) {
  const candidateRef = args.source.candidates[args.candidateIndex];
  if (!candidateRef) {
    await updateReviewModalSafely({
      hash: args.hash,
      token: args.token,
      view: buildSlackTalentReviewErrorView("선택한 후보자를 찾지 못했습니다."),
      viewId: args.viewId,
    });
    return;
  }
  const candidate = await loadSlackTalentReviewCandidate({
    candidate: candidateRef,
    workspaceId: args.source.workspaceId,
  });
  const displayed = await updateReviewModalSafely({
    hash: args.hash,
    token: args.token,
    view: buildSlackTalentReviewCandidateView({
      canManageCandidates: args.member.canManageCandidates,
      candidate,
      candidateCount: args.source.candidates.length,
      candidateIndex: args.candidateIndex,
      sourceMessageId: args.source.sourceMessageId,
    }),
    viewId: args.viewId,
  });
  if (!displayed) return;
  try {
    await logSlackTalentReviewView({
      candidate: candidateRef,
      candidateIndex: args.candidateIndex,
      member: args.member,
      slackChannelId: args.slackChannelId,
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      sourceMessageId: args.source.sourceMessageId,
      workspaceId: args.source.workspaceId,
    });
  } catch (error) {
    console.warn("[harper-slack/review:log-view]", error);
  }
}

async function authorizeReviewMember(args: {
  token: string;
  slackUserId: string;
  workspaceId: string;
}) {
  const email = await getHarperSlackUserEmail({
    token: args.token,
    userId: args.slackUserId,
  });
  if (!email) {
    throw new Error("Slack 사용자 이메일을 확인할 수 없습니다.");
  }
  return findSlackTalentReviewMember({
    email,
    workspaceId: args.workspaceId,
  });
}

async function hydrateOpenedReviewModal(args: {
  messageTs: string;
  sourceMessageId?: number | null;
  slackChannelId: string;
  slackTeamId: string;
  slackUserId: string;
  token: string;
  viewId: string;
  workspaceId: string;
}) {
  try {
    const source = args.sourceMessageId
      ? await loadSlackTalentReviewSourceById({
          sourceMessageId: args.sourceMessageId,
          workspaceId: args.workspaceId,
        })
      : await loadSlackTalentReviewSourceByMessage({
          messageTs: args.messageTs,
          workspaceId: args.workspaceId,
        });
    const member = await authorizeReviewMember({
      slackUserId: args.slackUserId,
      token: args.token,
      workspaceId: args.workspaceId,
    });
    if (!member) {
      await updateReviewModalSafely({
        token: args.token,
        view: buildSlackTalentReviewAccessDeniedView(),
        viewId: args.viewId,
      });
      return;
    }
    await showReviewCandidate({
      candidateIndex: 0,
      member,
      slackChannelId: args.slackChannelId,
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      source,
      token: args.token,
      viewId: args.viewId,
    });
  } catch (error) {
    console.warn("[harper-slack/review:open]", error);
    await updateReviewModalSafely({
      token: args.token,
      view: buildSlackTalentReviewErrorView(),
      viewId: args.viewId,
    });
  }
}

async function hydrateNavigatedReviewModal(args: {
  candidateIndex: number;
  hash?: string | null;
  slackTeamId: string;
  slackUserId: string;
  sourceMessageId: number;
  token: string;
  viewId: string;
  workspaceId: string;
}) {
  try {
    const source = await loadSlackTalentReviewSourceById({
      sourceMessageId: args.sourceMessageId,
      workspaceId: args.workspaceId,
    });
    const member = await authorizeReviewMember({
      slackUserId: args.slackUserId,
      token: args.token,
      workspaceId: args.workspaceId,
    });
    if (!member) {
      await updateReviewModalSafely({
        hash: args.hash,
        token: args.token,
        view: buildSlackTalentReviewAccessDeniedView(),
        viewId: args.viewId,
      });
      return;
    }
    const candidateIndex = Math.min(
      Math.max(args.candidateIndex, 0),
      source.candidates.length - 1
    );
    await showReviewCandidate({
      candidateIndex,
      hash: args.hash,
      member,
      slackChannelId: null,
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      source,
      token: args.token,
      viewId: args.viewId,
    });
  } catch (error) {
    console.warn("[harper-slack/review:navigate]", error);
    await updateReviewModalSafely({
      hash: args.hash,
      token: args.token,
      view: buildSlackTalentReviewErrorView(),
      viewId: args.viewId,
    });
  }
}

async function hydrateDecisionReviewModal(args: {
  candidateIndex: number;
  connectionMode?: "cc_intro" | "contact_directly";
  decision: "accept" | "reject";
  hash?: string | null;
  slackUserId: string;
  sourceMessageId: number;
  token: string;
  viewId: string;
  workspaceId: string;
}) {
  try {
    const source = await loadSlackTalentReviewSourceById({
      sourceMessageId: args.sourceMessageId,
      workspaceId: args.workspaceId,
    });
    const member = await authorizeReviewMember({
      slackUserId: args.slackUserId,
      token: args.token,
      workspaceId: args.workspaceId,
    });
    if (!member) {
      await updateReviewModalSafely({
        token: args.token,
        view: buildSlackTalentReviewAccessDeniedView(),
        viewId: args.viewId,
      });
      return;
    }
    if (!member.canManageCandidates) {
      await updateReviewModalSafely({
        token: args.token,
        view: buildSlackTalentReviewDecisionErrorView(
          "Viewer 권한에서는 후보자를 수락하거나 거절할 수 없습니다. Owner 또는 Admin에게 결정을 요청해 주세요."
        ),
        viewId: args.viewId,
      });
      return;
    }
    const candidateIndex = Math.min(
      Math.max(args.candidateIndex, 0),
      source.candidates.length - 1
    );
    const candidateRef = source.candidates[candidateIndex];
    if (!candidateRef) throw new Error("선택한 후보자를 찾지 못했습니다.");
    const [candidate, members] = await Promise.all([
      loadSlackTalentReviewCandidate({
        candidate: candidateRef,
        workspaceId: args.workspaceId,
      }),
      listSlackTalentReviewDecisionMembers(args.workspaceId),
    ]);
    const view =
      args.decision === "accept"
        ? buildSlackTalentReviewAcceptDecisionView({
            actorEmail: member.email,
            candidate,
            candidateCount: source.candidates.length,
            candidateIndex,
            connectionMode: args.connectionMode,
            members,
            sourceMessageId: source.sourceMessageId,
          })
        : buildSlackTalentReviewRejectDecisionView({
            candidate,
            candidateIndex,
            sourceMessageId: source.sourceMessageId,
          });
    await updateReviewModalSafely({
      hash: args.hash,
      token: args.token,
      view,
      viewId: args.viewId,
    });
  } catch (error) {
    console.warn("[harper-slack/review:decision]", error);
    await updateReviewModalSafely({
      hash: args.hash,
      token: args.token,
      view: buildSlackTalentReviewErrorView(),
      viewId: args.viewId,
    });
  }
}

function decisionErrorMessage(error: unknown) {
  if (error instanceof OrgHttpError) {
    if (error.status === 403) {
      return "후보자를 결정할 권한이 없습니다. Owner 또는 Admin 권한을 확인해 주세요.";
    }
    if (error.status === 409) {
      return "이미 다른 멤버가 이 후보자를 결정했거나 현재 상태가 바뀌었습니다.";
    }
    if (error.status >= 400 && error.status < 500) return error.message;
  }
  return "일시적인 오류가 발생했습니다. 잠시 후 최신 후보자 상태를 확인하고 다시 시도해 주세요.";
}

async function hydrateSubmittedDecisionModal(args: {
  candidateIndex: number;
  slackUserId: string;
  sourceMessageId: number;
  submission: SlackTalentReviewDecisionSubmission;
  token: string;
  viewId: string;
  workspaceId: string;
}) {
  try {
    const source = await loadSlackTalentReviewSourceById({
      sourceMessageId: args.sourceMessageId,
      workspaceId: args.workspaceId,
    });
    const member = await authorizeReviewMember({
      slackUserId: args.slackUserId,
      token: args.token,
      workspaceId: args.workspaceId,
    });
    if (!member) {
      throw new OrgHttpError(
        403,
        "Slack 이메일과 일치하는 Harper workspace 멤버를 찾지 못했습니다."
      );
    }
    if (!member.canManageCandidates) {
      throw new OrgHttpError(403, "이 작업을 수행할 권한이 없습니다.");
    }
    const candidateRef = source.candidates[args.candidateIndex];
    if (!candidateRef) {
      throw new OrgHttpError(404, "선택한 후보자를 찾지 못했습니다.");
    }
    const candidate = await loadSlackTalentReviewCandidate({
      candidate: candidateRef,
      workspaceId: args.workspaceId,
    });
    if (!candidate.recommendationId) {
      throw new OrgHttpError(404, "후보자의 연결 추천 기록을 찾지 못했습니다.");
    }

    if (args.submission.decision === "accept") {
      if (args.submission.connectionMode === "cc_intro") {
        const members = await listSlackTalentReviewDecisionMembers(
          args.workspaceId
        );
        const allowedEmails = new Set(members.map((item) => item.email));
        if (
          args.submission.introEmails.some((email) => !allowedEmails.has(email))
        ) {
          throw new OrgHttpError(
            400,
            "소개 메일 수신자는 현재 workspace 멤버 중에서 선택해 주세요."
          );
        }
      }
      if (args.submission.connectionMode === "cc_intro" && !candidate.email) {
        throw new OrgHttpError(
          422,
          "후보자 이메일이 없어 CC 연결 메일을 보낼 수 없습니다. 직접 연락을 선택해 주세요."
        );
      }
    }

    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } =
      await admin.auth.admin.getUserById(member.companyUserId);
    if (authError || !authData.user) {
      throw (
        authError || new OrgHttpError(403, "Harper 멤버를 찾지 못했습니다.")
      );
    }
    if (clean(authData.user.email).toLowerCase() !== member.email) {
      throw new OrgHttpError(
        403,
        "Slack과 Harper 계정의 이메일이 일치하지 않습니다. 계정 정보를 확인해 주세요."
      );
    }

    await setOrgCandidateStage({
      acceptReason:
        args.submission.decision === "accept"
          ? args.submission.acceptReason
          : null,
      contactDirectly:
        args.submission.decision === "accept" &&
        args.submission.connectionMode === "contact_directly",
      expectedPreviousStage: "pending_connection",
      introEmails:
        args.submission.decision === "accept"
          ? args.submission.introEmails
          : null,
      recommendationId: candidate.recommendationId,
      roleId: candidate.roleId,
      stage:
        args.submission.decision === "accept" ? "connected" : "process_stopped",
      stopNote:
        args.submission.decision === "reject" ? args.submission.stopNote : null,
      talentId: candidate.talentId,
      user: authData.user,
      workspaceId: args.workspaceId,
    });

    await updateReviewModalSafely({
      token: args.token,
      view: buildSlackTalentReviewDecisionResultView({
        candidateName: candidate.name,
        ...(args.submission.decision === "accept"
          ? {
              connectionMode: args.submission.connectionMode,
            }
          : {}),
        decision: args.submission.decision,
      }),
      viewId: args.viewId,
    });
  } catch (error) {
    console.warn("[harper-slack/review:submit-decision]", error);
    await updateReviewModalSafely({
      token: args.token,
      view: buildSlackTalentReviewDecisionErrorView(
        decisionErrorMessage(error)
      ),
      viewId: args.viewId,
    });
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  if (!verifyHarperSlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const payloadText = new URLSearchParams(rawBody).get("payload");
  if (!payloadText) {
    return NextResponse.json({ error: "missing_payload" }, { status: 400 });
  }

  let payload: SlackBlockActionPayload;
  try {
    payload = JSON.parse(payloadText) as SlackBlockActionPayload;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!isHarperSlackAppId(payload.api_app_id)) {
    return NextResponse.json({ error: "wrong_app" }, { status: 403 });
  }

  const callbackId = clean(payload.view?.callback_id);
  if (
    payload.type === "view_submission" &&
    (callbackId === HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID ||
      callbackId === HARPER_TALENT_REVIEW_REJECT_CALLBACK_ID)
  ) {
    const metadata = decodeSlackTalentReviewViewMetadata(
      payload.view?.private_metadata
    );
    const parsedSubmission = parseSlackTalentReviewDecisionSubmission({
      callbackId,
      state: payload.view?.state,
    });
    if ("errors" in parsedSubmission) {
      return NextResponse.json({
        errors: parsedSubmission.errors,
        response_action: "errors",
      });
    }
    const slackTeamId = clean(payload.team?.id);
    const slackUserId = clean(payload.user?.id);
    const viewId = clean(payload.view?.id);
    if (!metadata || !slackTeamId || !slackUserId || !viewId) {
      return NextResponse.json({
        errors: {
          [callbackId === HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID
            ? "review_accept_connection_mode"
            : "review_reject_note"]:
            "후보자 검토 정보가 만료되었습니다. 모달을 닫고 다시 열어 주세요.",
        },
        response_action: "errors",
      });
    }
    let context;
    try {
      context = await resolveHarperSlackInteractionContext({
        slackTeamId,
        workspaceId: metadata.workspaceId,
      });
    } catch (error) {
      console.warn("[harper-slack/review:resolve-submit]", error);
      return NextResponse.json({
        errors: {
          [callbackId === HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID
            ? "review_accept_connection_mode"
            : "review_reject_note"]:
            "Slack 연결 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
        response_action: "errors",
      });
    }
    after(() => {
      return hydrateSubmittedDecisionModal({
        candidateIndex: metadata.candidateIndex,
        slackUserId,
        sourceMessageId: metadata.sourceMessageId,
        submission: parsedSubmission.submission,
        token: context.token,
        viewId,
        workspaceId: context.workspaceId,
      });
    });
    return NextResponse.json({
      response_action: "update",
      view: buildSlackTalentReviewDecisionProcessingView(
        parsedSubmission.submission.decision
      ),
    });
  }

  const action = payload.actions?.[0];
  const actionId = clean(action?.action_id);
  const localSourceMessageId = (() => {
    if (
      process.env.NODE_ENV === "production" ||
      clean(payload.api_app_id) !== clean(process.env.SLACK_HARPER_LOCAL_APP_ID)
    ) {
      return null;
    }
    const match = /^local_source:(\d+)$/.exec(clean(action?.value));
    const parsed = Number(match?.[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  })();
  if (
    payload.type === "block_actions" &&
    actionId === HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID
  ) {
    const connectionMode = clean(action?.selected_option?.value);
    const metadata = decodeSlackTalentReviewViewMetadata(
      payload.view?.private_metadata
    );
    const slackTeamId = clean(payload.team?.id);
    const slackUserId = clean(payload.user?.id);
    const viewId = clean(payload.view?.id);
    if (
      !metadata ||
      !slackTeamId ||
      !slackUserId ||
      !viewId ||
      (connectionMode !== "cc_intro" && connectionMode !== "contact_directly")
    ) {
      return NextResponse.json({ ignored: true, ok: true });
    }
    const context = await resolveHarperSlackInteractionContext({
      slackTeamId,
      workspaceId: metadata.workspaceId,
    });
    after(() =>
      hydrateDecisionReviewModal({
        candidateIndex: metadata.candidateIndex,
        connectionMode,
        decision: "accept",
        hash: clean(payload.view?.hash) || null,
        slackUserId,
        sourceMessageId: metadata.sourceMessageId,
        token: context.token,
        viewId,
        workspaceId: context.workspaceId,
      })
    );
    return NextResponse.json({
      ok: true,
      status: "connection_mode_updating",
    });
  }
  if (
    payload.type === "block_actions" &&
    actionId === HARPER_TALENT_REVIEW_OPEN_ACTION_ID
  ) {
    const channelId = clean(
      payload.container?.channel_id || payload.channel?.id
    );
    const messageTs = clean(
      payload.container?.message_ts || payload.message?.ts
    );
    const slackTeamId = clean(payload.team?.id);
    const slackUserId = clean(payload.user?.id);
    const triggerId = clean(payload.trigger_id);
    if (
      !channelId ||
      !messageTs ||
      !slackTeamId ||
      !slackUserId ||
      !triggerId
    ) {
      return NextResponse.json({ ignored: true, ok: true });
    }
    const context = await resolveHarperSlackInteractionContext({
      channelId,
      slackTeamId,
    });
    const opened = await openHarperSlackModal({
      token: context.token,
      triggerId,
      view: buildSlackTalentReviewLoadingView(),
    });
    const viewId = clean(opened.view?.id);
    if (!viewId) {
      return NextResponse.json(
        { error: "missing_modal_view" },
        { status: 502 }
      );
    }
    after(() =>
      hydrateOpenedReviewModal({
        messageTs,
        sourceMessageId: localSourceMessageId,
        slackChannelId: channelId,
        slackTeamId,
        slackUserId,
        token: context.token,
        viewId,
        workspaceId: context.workspaceId,
      })
    );
    return NextResponse.json({ ok: true, status: "review_opened" });
  }

  if (
    payload.type === "block_actions" &&
    (actionId === HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID ||
      actionId === HARPER_TALENT_REVIEW_REJECT_ACTION_ID)
  ) {
    const metadata = decodeSlackTalentReviewViewMetadata(
      payload.view?.private_metadata
    );
    const slackTeamId = clean(payload.team?.id);
    const slackUserId = clean(payload.user?.id);
    const triggerId = clean(payload.trigger_id);
    if (!metadata || !slackTeamId || !slackUserId || !triggerId) {
      return NextResponse.json({ ignored: true, ok: true });
    }
    const context = await resolveHarperSlackInteractionContext({
      slackTeamId,
      workspaceId: metadata.workspaceId,
    });
    const pushed = await pushHarperSlackModal({
      token: context.token,
      triggerId,
      view: buildSlackTalentReviewLoadingView(),
    });
    const viewId = clean(pushed.view?.id);
    if (!viewId) {
      return NextResponse.json(
        { error: "missing_decision_modal_view" },
        { status: 502 }
      );
    }
    after(() =>
      hydrateDecisionReviewModal({
        candidateIndex: metadata.candidateIndex,
        decision:
          actionId === HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID
            ? "accept"
            : "reject",
        slackUserId,
        sourceMessageId: metadata.sourceMessageId,
        token: context.token,
        viewId,
        workspaceId: context.workspaceId,
      })
    );
    return NextResponse.json({ ok: true, status: "decision_modal_opened" });
  }

  if (
    payload.type === "block_actions" &&
    (actionId === HARPER_TALENT_REVIEW_PREVIOUS_ACTION_ID ||
      actionId === HARPER_TALENT_REVIEW_NEXT_ACTION_ID)
  ) {
    const metadata = decodeSlackTalentReviewViewMetadata(
      payload.view?.private_metadata
    );
    const slackTeamId = clean(payload.team?.id);
    const slackUserId = clean(payload.user?.id);
    const viewId = clean(payload.view?.id);
    if (!metadata || !slackTeamId || !slackUserId || !viewId) {
      return NextResponse.json({ ignored: true, ok: true });
    }
    const context = await resolveHarperSlackInteractionContext({
      slackTeamId,
      workspaceId: metadata.workspaceId,
    });
    const candidateIndex =
      metadata.candidateIndex +
      (actionId === HARPER_TALENT_REVIEW_NEXT_ACTION_ID ? 1 : -1);
    after(() =>
      hydrateNavigatedReviewModal({
        candidateIndex,
        hash: clean(payload.view?.hash) || null,
        slackTeamId,
        slackUserId,
        sourceMessageId: metadata.sourceMessageId,
        token: context.token,
        viewId,
        workspaceId: context.workspaceId,
      })
    );
    return NextResponse.json({ ok: true, status: "review_navigating" });
  }

  if (
    payload.type !== "block_actions" ||
    !actionId.startsWith(HARPER_SLACK_CHOICE_ACTION_PREFIX)
  ) {
    return NextResponse.json({ ignored: true, ok: true });
  }

  const actionValue = decodeHarperSlackChoiceActionValue(action?.value);
  const actionChoiceIndex = Number(
    actionId.slice(HARPER_SLACK_CHOICE_ACTION_PREFIX.length)
  );
  if (!actionValue || actionChoiceIndex !== actionValue.choiceIndex) {
    return NextResponse.json({ ignored: true, ok: true });
  }

  const channelId = clean(payload.container?.channel_id || payload.channel?.id);
  const sourceMessageTs = clean(
    payload.container?.message_ts || payload.message?.ts
  );
  const slackTeamId = clean(payload.team?.id);
  const slackUserId = clean(payload.user?.id);
  const actionTs = clean(action?.action_ts);
  if (
    !channelId ||
    !sourceMessageTs ||
    !slackTeamId ||
    !slackUserId ||
    !actionTs
  ) {
    return NextResponse.json({ ignored: true, ok: true });
  }

  const context = await resolveHarperSlackInteractionContext({
    channelId,
    slackTeamId,
  });
  const slackAccess = await resolveHarperSlackWorkspaceAccess({
    slackUserId,
    token: context.token,
    workspaceId: context.workspaceId,
  });
  if (!slackAccess.allowed || !slackAccess.member.canManageCandidates) {
    const denialReason = slackAccess.allowed
      ? "insufficient_role"
      : slackAccess.reason;
    try {
      await postHarperSlackAccessDenied({
        access: slackAccess,
        channelId,
        reason: denialReason,
        slackUserId,
        token: context.token,
      });
    } catch (error) {
      console.warn("[harper-slack/interactivity:access-denied-message]", error);
    }
    return NextResponse.json({
      accessDenied: true,
      ok: true,
      status: "access_denied",
    });
  }

  const admin = getSupabaseAdmin();
  const { data: sourceJob, error: sourceJobError } = await (
    admin.from("slack_reply_jobs" as any) as any
  )
    .select("response_text")
    .eq("id", actionValue.sourceJobId)
    .maybeSingle();
  if (sourceJobError) throw sourceJobError;
  const parsed = parseHarperSlackChoiceMarkers(clean(sourceJob?.response_text));
  const choice = parsed.choices[actionValue.choiceIndex];
  if (!choice) {
    return NextResponse.json({ ignored: true, ok: true });
  }

  const { data, error } = await (admin.rpc as any)(
    "enqueue_slack_button_choice_v1",
    {
      p_action_ts: actionTs,
      p_choice_index: actionValue.choiceIndex,
      p_choice_label: choice.label,
      p_choice_message: choice.userMessage,
      p_slack_channel_id: channelId,
      p_slack_team_id: slackTeamId,
      p_slack_user_id: slackUserId,
      p_source_job_id: actionValue.sourceJobId,
      p_source_message_ts: sourceMessageTs,
    }
  );
  if (error) throw error;
  const result =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};

  if (clean(result.status) !== "queued") {
    return NextResponse.json({ ok: true, status: clean(result.status) });
  }

  const workspaceId = clean(result.workspace_id);
  const originalText = clean(payload.message?.text) || parsed.text;
  const blocks = buildSelectedHarperSlackChoiceBlocks({
    choiceLabel: choice.label,
    originalBlocks: payload.message?.blocks,
    originalText,
    slackUserId,
  });
  after(async () => {
    try {
      await updateHarperSlackMessage({
        blocks,
        channelId,
        messageTs: sourceMessageTs,
        text: `${originalText}\n\n✓ ${escapeSlackText(choice.label)}`.trim(),
        workspaceId,
      });
    } catch (updateError) {
      console.warn("[harper-slack/interactivity:update-message]", updateError);
    }
  });

  return NextResponse.json({ ok: true, status: "queued" });
}

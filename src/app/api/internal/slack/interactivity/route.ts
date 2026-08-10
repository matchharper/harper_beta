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
  buildSlackTalentReviewAccessDeniedView,
  buildSlackTalentReviewAcceptDecisionView,
  buildSlackTalentReviewCandidateView,
  buildSlackTalentReviewDecisionPreviewResultView,
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
} from "@/lib/org/slackTalentReviewView";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

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
    return NextResponse.json({
      response_action: "update",
      view: buildSlackTalentReviewDecisionPreviewResultView(
        callbackId === HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID
          ? "accept"
          : "reject"
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
    return NextResponse.json({ ok: true, status: "decision_preview_opened" });
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

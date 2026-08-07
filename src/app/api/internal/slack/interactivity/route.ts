import { after, NextRequest, NextResponse } from "next/server";
import {
  buildSelectedHarperSlackChoiceBlocks,
  decodeHarperSlackChoiceActionValue,
  HARPER_SLACK_CHOICE_ACTION_PREFIX,
  parseHarperSlackChoiceMarkers,
} from "@/lib/org/slackChoiceButtons";
import {
  isHarperSlackAppId,
  updateHarperSlackMessage,
  verifyHarperSlackSignature,
} from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

type SlackBlockActionPayload = {
  actions?: Array<{
    action_id?: string;
    action_ts?: string;
    value?: string;
  }>;
  api_app_id?: string;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { blocks?: unknown; text?: string; ts?: string };
  team?: { id?: string };
  type?: string;
  user?: { id?: string };
};

const clean = (value: unknown) => String(value ?? "").trim();

function escapeSlackText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

  const action = payload.actions?.[0];
  if (
    payload.type !== "block_actions" ||
    !clean(action?.action_id).startsWith(HARPER_SLACK_CHOICE_ACTION_PREFIX)
  ) {
    return NextResponse.json({ ignored: true, ok: true });
  }

  const actionValue = decodeHarperSlackChoiceActionValue(action?.value);
  const actionChoiceIndex = Number(
    clean(action?.action_id).slice(HARPER_SLACK_CHOICE_ACTION_PREFIX.length)
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

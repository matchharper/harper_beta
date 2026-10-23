import "server-only";

import { after } from "next/server";
import { resolveHarperSlackInteractionContext } from "@/lib/org/slackHarper";
import { resolveHarperSlackWorkspaceAccess } from "@/lib/org/slackMemberAccess";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { answerRoleStartQuestion } from "./service";
import { loadRoleStartSession } from "./session";
import {
  decodeRoleStartSlackValue,
  markRoleStartSlackAnswered,
  ROLE_START_SLACK_CHIP_ACTION,
  ROLE_START_SLACK_LINK_ACTION,
  ROLE_START_SLACK_SKIP_ACTION,
} from "./slack";

type Payload = {
  actions?: Array<{ action_id?: string; value?: string }>;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { blocks?: unknown; ts?: string };
  team?: { id?: string };
  type?: string;
  user?: { id?: string };
};

const clean = (value: unknown) => String(value ?? "").trim();

/** Slack chip/skip buttons for the role start questions. Returns null for other actions. */
export async function handleRoleStartSlackAction(payload: Payload) {
  const action = payload.actions?.[0];
  const actionId = clean(action?.action_id);
  if (payload.type !== "block_actions") return null;
  if (actionId === ROLE_START_SLACK_LINK_ACTION) return { ok: true, status: "link" };
  if (!actionId.startsWith(ROLE_START_SLACK_CHIP_ACTION) && actionId !== ROLE_START_SLACK_SKIP_ACTION) {
    return null;
  }
  const value = decodeRoleStartSlackValue(action?.value);
  const channelId = clean(payload.container?.channel_id || payload.channel?.id);
  const messageTs = clean(payload.container?.message_ts || payload.message?.ts);
  const slackTeamId = clean(payload.team?.id);
  const slackUserId = clean(payload.user?.id);
  if (!value || !channelId || !messageTs || !slackTeamId || !slackUserId) {
    return { ignored: true, ok: true };
  }
  const context = await resolveHarperSlackInteractionContext({ channelId, slackTeamId });
  const access = await resolveHarperSlackWorkspaceAccess({
    slackUserId,
    token: context.token,
    workspaceId: context.workspaceId,
  });
  if (!access.allowed || !access.member.canManageCandidates || !access.member.companyUserId) {
    return { accessDenied: true, ok: true };
  }
  const session = await loadRoleStartSession(value.roleId, { forView: true });
  const question = session?.pendingQuestion;
  if (!session || session.workspaceId !== context.workspaceId || !question || question.id !== value.questionId) {
    return { ignored: true, ok: true, status: "stale_question" };
  }
  const chip = value.chipId ? question.chips.find((item) => item.id === value.chipId) : null;
  const label = chip?.label ?? "건너뛰기";
  const { data } = await getSupabaseAdmin().auth.admin.getUserById(access.member.companyUserId);
  if (!data.user) return { ignored: true, ok: true };
  const user = data.user;
  // Slack expects an acknowledgement within three seconds. The answer is
  // applied afterwards, and the card shows it only once applied. If another
  // surface answered first, that answer already closed this card.
  after(async () => {
    try {
      await answerRoleStartQuestion({
        chipId: chip?.id ?? null,
        questionId: question.id,
        roleId: value.roleId,
        skip: !chip,
        surface: "slack",
        user,
        workspaceId: context.workspaceId,
      });
    } catch (error) {
      console.warn("[role-start/slack] answer not applied", error);
      return;
    }
    await markRoleStartSlackAnswered({
      channelId,
      label,
      messageTs,
      originalBlocks: payload.message?.blocks,
      slackUserId,
      token: context.token,
    }).catch((error) => console.warn("[role-start/slack] mark answered", error));
  });
  return { ok: true, status: "answer_queued" };
}

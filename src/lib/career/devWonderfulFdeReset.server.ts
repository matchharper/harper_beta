import "server-only";
import { getCareerDevSqlClient } from "./devSql";
import { prepareWonderfulFdeReset, readWonderfulFdeReset, assertWonderfulFdeResetIdle, deleteWonderfulFdeRows, WonderfulFdeResetConflict, type ResetQuery } from "./devWonderfulFdeReset";
import { createComposioClient, readComposioEnv } from "@/lib/integrations/composio";
import { createGoogleCalendarService } from "@/lib/integrations/googleCalendar";
import { createGoogleCalendarStore } from "@/lib/integrations/googleCalendarStore";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { resolveMeetingCalendarOwner } from "@/lib/meetings/calendarOwner";
import { decryptHarperSlackToken, slackApi } from "@/lib/org/slackHarper";
import { WONDERFUL_FDE_TEST_ACCOUNTS } from "./devWonderfulFdeResetContract";

export async function inspectWonderfulFdeReset() {
  return getCareerDevSqlClient().begin(async tx => {
    const q: ResetQuery = (sql, params = []) => tx.unsafe(sql, params);
    await q("set local statement_timeout='15s'");
    await prepareWonderfulFdeReset(q);
    await assertWonderfulFdeResetIdle(q);
    return (await readWonderfulFdeReset(q)).preview;
  });
}

async function cancelCalendar(schedule: any, delivery: any) {
  if (!delivery?.external_event_id) {
    if (delivery?.status && delivery.status !== "pending") throw new WonderfulFdeResetConflict("Calendar 발송 기록에 이벤트 ID가 없어 취소 여부를 확인할 수 없습니다.");
    return;
  }
  const admin = getSupabaseAdmin();
  const vendor = createComposioClient();
  const service = createGoogleCalendarService({ store: createGoogleCalendarStore(admin), vendor,
    getAuthConfigId: () => readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID") });
  const owner = await resolveMeetingCalendarOwner({ organizerId: schedule.organizer_company_user_id,
    pinned: delivery.calendar_owner, personalAccount: id => service.requireActiveAccountId(id),
    getAccount: id => vendor.getAccount(id), authConfigId: readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID"),
    hostedAccountId: process.env.HARPER_GOOGLE_CALENDAR_ACCOUNT_ID, hostedUserId: process.env.HARPER_GOOGLE_CALENDAR_USER_ID });
  const path = `/calendar/v3/calendars/primary/events/${encodeURIComponent(delivery.external_event_id)}`;
  const request = { accountId: owner.accountId, userId: owner.userId, path };
  const current = await vendor.calendarRequest({ ...request, method: "GET" });
  if ([404, 410].includes(current.status) || (current.status === 200 && current.data.status === "cancelled")) return;
  if (current.status !== 200 || current.data.id !== delivery.external_event_id) throw new WonderfulFdeResetConflict("원본 Calendar 일정을 확인하지 못했습니다.");
  const result = await vendor.calendarRequest({ ...request, path: path + "?sendUpdates=all", method: "DELETE", etag: current.data.etag });
  if (![200, 204, 404, 410].includes(result.status)) throw new WonderfulFdeResetConflict("Calendar 취소가 실패하여 데이터 삭제를 중단했습니다.");
  const check = await vendor.calendarRequest({ ...request, method: "GET" });
  if (![404, 410].includes(check.status) && !(check.status === 200 && check.data.status === "cancelled")) throw new WonderfulFdeResetConflict("Calendar 취소 결과를 확인하지 못했습니다. DB 기록은 유지합니다.");
}

async function deleteSlack(q: ResetQuery, posts: { channelId?: string; threadId?: string; ts: string }[]) {
  if (!posts.length) return;
  const [integration] = await q("select bot_token_ciphertext from company_slack_integrations where company_workspace_id=(select workspace_id from reset_scope) and status='active'");
  if (!integration) throw new WonderfulFdeResetConflict("Slack 연결을 확인할 수 없어 삭제를 중단했습니다.");
  const token = decryptHarperSlackToken(integration.bot_token_ciphertext);
  const deleted = new Set<string>();
  for (const post of posts) {
    const [channel] = post.threadId
      ? await q("select c.slack_channel_id from company_slack_threads t join company_slack_channels c on c.id=t.channel_id where t.id=$1::uuid and c.company_workspace_id=(select workspace_id from reset_scope)", [post.threadId])
      : await q("select slack_channel_id from company_slack_channels where slack_channel_id=$1 and company_workspace_id=(select workspace_id from reset_scope)", [post.channelId]);
    if (!channel) throw new WonderfulFdeResetConflict("삭제할 Slack 메시지의 채널을 확인할 수 없습니다.");
    const key = `${channel.slack_channel_id}:${post.ts}`;
    if (deleted.has(key)) continue;
    try { await slackApi(token, "chat.delete", { channel: channel.slack_channel_id, ts: post.ts }); }
    catch (e) {
      // Slack may already have been deleted by a previous partial attempt.
      if (!(e instanceof Error) || !e.message.includes("message_not_found")) throw e;
    }
    deleted.add(key);
  }
}

export async function executeWonderfulFdeReset(fingerprint: string) {
  return getCareerDevSqlClient().begin("isolation level serializable", async tx => {
    const q: ResetQuery = (sql, params = []) => tx.unsafe(sql, params);
    await q("set local statement_timeout='30s'");
    await q("set local lock_timeout='5s'");
    await q("select pg_advisory_xact_lock(hashtextextended('wonderful-fde-test-reset',0))");
    // Reuse the normal pair mutation locks before checking current state.
    for (const a of [...WONDERFUL_FDE_TEST_ACCOUNTS].sort((a,b) => a.id.localeCompare(b.id))) {
      await q("select pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||$1,0))", [a.id]);
      await q("select pg_advisory_xact_lock(hashtextextended('company_talent_route:f2e80aee-fee3-40f5-807f-5f8694c37eee:'||$1,0))", [a.id]);
    }
    await prepareWonderfulFdeReset(q);
    await q("select id from talent_opportunity_recommendation where id in (select id from reset_recs) for update");
    await q("select id from company_agent_web_action_jobs where id in (select id from reset_jobs) for update");
    await q("select id from meeting_schedules where role_id=(select role_id from reset_scope) and talent_id in (select id from reset_accounts) for update");
    await q("select id from company_messages where id in (select id from reset_company_messages) for update");
    await q("select id from slack_reply_jobs where user_message_id in (select id from reset_company_messages) or response_message_id in (select id from reset_company_messages) for update");
    await q("select id from contact_queue where user_id in (select id from reset_accounts) and role_id=(select role_id from reset_scope) for update");
    await assertWonderfulFdeResetIdle(q);
    const plan = await readWonderfulFdeReset(q);
    if (plan.preview.fingerprint !== fingerprint) throw new WonderfulFdeResetConflict("미리보기 이후 기록이 변경됐습니다. 삭제 대상을 다시 확인해 주세요.");
    // External APIs are idempotent on missing objects. Keep receipts until all
    // cancellations succeed so an uncertain/partial attempt remains retryable.
    for (const m of plan.meetings) await cancelCalendar(m.schedule, m.delivery);
    await deleteSlack(q, plan.slack);
    await deleteWonderfulFdeRows(q);
    return plan.preview;
  });
}

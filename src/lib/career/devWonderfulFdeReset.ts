import { createHash } from "node:crypto";
import { WONDERFUL_FDE_TEST_ACCOUNTS, type WonderfulFdeResetPreview } from "./devWonderfulFdeResetContract";
import { WONDERFUL_KOREA_FDE_ROLE_ID } from "./devWonderfulRoleResetTargets";

export type ResetQuery = (sql: string, params?: any[]) => Promise<Record<string, any>[]>;
export class WonderfulFdeResetConflict extends Error {}
const workspace = "f2e80aee-fee3-40f5-807f-5f8694c37eee";
const pair = "t.role_id=(select role_id from reset_scope) and t.talent_id in (select id from reset_accounts)";
const owned = "t.user_id in (select id from reset_accounts)";
const inMessages = "in (select id from reset_company_messages)";

// Ordered by real FK dependencies. Login, personal profiles/documents, other
// roles, shared conversations, company settings and billing are not reset.
export const resetTables: [string, string][] = [
  ["company_talent_relays", "t.recommendation_id in (select id from reset_recs) or t.company_talent_request_id in (select id from company_talent_requests t where " + pair + ")"],
  ["contact_queue", "t.user_id in (select id from reset_accounts) and (t.role_id=(select role_id from reset_scope) or t.recommendation_id in (select id from reset_recs))"],
  ["company_talent_followups", pair],
  ["company_agent_schedules", "t.role_id=(select role_id from reset_scope) and exists(select 1 from reset_accounts a where position(a.id::text in t.target_refs::text)>0)"],
  ["talent_agent_schedules", "t.talent_id in (select id from reset_accounts) and position((select role_id::text from reset_scope) in t.target_refs::text)>0"],
  ["meeting_schedules", pair],
  ["company_talent_requests", pair],
  ["company_decision_events", "t.role_id=(select role_id from reset_scope) and (t.subject_id::text in (select id::text from reset_accounts) or t.intro_candidate_id in (select id from company_intro_candidates t where " + pair + "))"],
  ["company_presentations", pair],
  ["company_candidate_note_revisions", pair],
  ["company_candidate_notes", pair],
  ["company_intro_candidates", pair],
  ["talent_progress", pair],
  ["company_first_talent_scores", pair],
  ["company_role_candidate_evaluations", pair],
  ["talent_opportunity_fit", "t.talent_id in (select id from reset_accounts) and t.opportunity_id=(select role_id from reset_scope)"],
  ["talent_opportunity_tag", "t.talent_id in (select id from reset_accounts) and t.opportunity_id=(select role_id from reset_scope)"],
  ["talent_opportunity_matching_review", "t.talent_id in (select id from reset_accounts) and t.opportunity_id=(select role_id from reset_scope)"],
  ["company_role_board_cards", "t.recommendation_id::text in (select id::text from reset_recs)"],
  ["company_agent_web_action_jobs", "t.id in (select id from reset_jobs)"],
  ["slack_reply_jobs", `t.user_message_id ${inMessages} or t.response_message_id ${inMessages}`],
  ["company_conversation_summaries", `t.conversation_id in (select conversation_id from reset_company_messages) and exists(select 1 from reset_company_messages m where m.conversation_id=t.conversation_id and m.id between t.source_start_message_id and t.source_end_message_id)`],
  ["company_messages", `t.id ${inMessages}`],
  ["talent_activity_events", "t.talent_id in (select id from reset_accounts) and t.message_id in (select id from reset_talent_messages)"],
  ["talent_conversation_summaries", "t.talent_id in (select id from reset_accounts) and exists(select 1 from reset_talent_messages m where m.conversation_id=t.conversation_id and m.id between coalesce(t.from_message_id,0) and t.to_message_id)"],
  ["talent_external_operations", `${owned} and t.id in (select id from reset_operations)`],
  ["talent_messages", `${owned} and t.id in (select id from reset_talent_messages)`],
  ["agent_contact_messages", pair],
  ["talent_opportunity_recommendation", pair],
  ["talent_role_materials", pair],
];

/** Transaction-local scope; preview and execution use exactly the same readers. */
export async function prepareWonderfulFdeReset(q: ResetQuery, accounts: readonly (typeof WONDERFUL_FDE_TEST_ACCOUNTS[number])[] = WONDERFUL_FDE_TEST_ACCOUNTS) {
  await q("create temp table reset_scope(role_id uuid,workspace_id uuid) on commit drop");
  await q("insert into reset_scope values($1::uuid,$2::uuid)", [WONDERFUL_KOREA_FDE_ROLE_ID, workspace]);
  await q("create temp table reset_accounts on commit drop as select id::uuid,email from jsonb_to_recordset($1::text::jsonb) as a(id text,email text)", [JSON.stringify(accounts)]);
  const mismatch = await q(`select a.id from reset_accounts a left join auth.users u on u.id=a.id where u.id is null or lower(u.email)<>a.email`);
  if (mismatch.length) throw new WonderfulFdeResetConflict("테스트 계정의 ID와 이메일이 일치하지 않습니다.");
  const roles = await q("select role_id from company_roles where role_id=$1::uuid and company_workspace_id=$2::uuid and source_type='internal'", [WONDERFUL_KOREA_FDE_ROLE_ID, workspace]);
  if (!roles.length) throw new WonderfulFdeResetConflict("Wonderful FDE 역할을 확인할 수 없습니다.");
  await q(`create temp table reset_recs on commit drop as select t.* from talent_opportunity_recommendation t where ${pair}`);
  await q(`create temp table reset_contacts on commit drop as select t.* from agent_contact_messages t where ${pair}`);
  await q(`create temp table reset_jobs on commit drop as select t.* from company_agent_web_action_jobs t where t.role_id=(select role_id from reset_scope) and (
    t.id in (select receiver_job_id from reset_contacts) or exists(select 1 from reset_accounts a where
      jsonb_path_exists(t.action_context,'$.**.talentId ? (@ == $id)',jsonb_build_object('id',a.id::text))))`);
  await q(`create temp table reset_company_messages on commit drop as select t.* from company_messages t where t.company_workspace_id=(select workspace_id from reset_scope) and (
    t.id in (select anchor_message_id from reset_jobs union select terminal_message_id from reset_jobs union select progress_message_id from reset_jobs)
    or t.metadata->>'webActionJobId' in (select id::text from reset_jobs)
    or t.metadata->>'agentIntroductionRootId' in (select root_id::text from reset_contacts)
    or t.id in (select r.source_company_message_id from meeting_schedule_rounds r join meeting_schedules t on t.id=r.schedule_id where ${pair})
    or ((t.role_id=(select role_id from reset_scope) or position((select role_id::text from reset_scope) in t.content)>0) and exists(select 1 from reset_accounts a where
      position('talent:'||a.id::text in t.content)>0 or position('talentId='||a.id::text in t.content)>0 or position('('||a.email||')' in split_part(split_part(t.content,'*Candidate*: ',2),E'\\n',1))>0)))`);
  // Include the user request and final response of a meeting's Slack turn.
  await q(`insert into reset_company_messages select t.* from company_messages t where t.company_workspace_id=(select workspace_id from reset_scope)
    and t.id not in (select id from reset_company_messages) and t.id in (
      select user_message_id from slack_reply_jobs where response_message_id ${inMessages}
      union select response_message_id from slack_reply_jobs where user_message_id ${inMessages})`);
  await q(`insert into reset_jobs select t.* from company_agent_web_action_jobs t where t.company_workspace_id=(select workspace_id from reset_scope)
    and t.id not in (select id from reset_jobs) and t.id::text in (select metadata->>'webActionJobId' from reset_company_messages)`);
  await q(`insert into reset_company_messages select t.* from company_messages t where t.company_workspace_id=(select workspace_id from reset_scope)
    and t.id not in (select id from reset_company_messages) and t.id in (
      select anchor_message_id from reset_jobs union select terminal_message_id from reset_jobs union select progress_message_id from reset_jobs)`);
  await q(`create temp table reset_talent_sources on commit drop as select t.* from talent_messages t where ${owned} and (
    t.payload->>'roleId'=$1 or t.id::text in (select source->>'messageId' from reset_contacts where source->>'kind'='career'))`, [WONDERFUL_KOREA_FDE_ROLE_ID]);
  await q(`create temp table reset_operations on commit drop as select t.* from talent_external_operations t where ${owned}
    and t.kind='career_invocation' and t.request->>'source_message_id' in (select id::text from reset_talent_sources)`);
  // A concurrent reply may answer multiple requests. Keep that shared reply;
  // deleting it would also destroy another application's conversation history.
  await q(`create temp table reset_reply_ids on commit drop as select distinct payload#>>'{careerCapabilityTurn,replyId}' id from reset_talent_sources where payload#>>'{careerCapabilityTurn,replyId}' is not null
    union select 'invocation:'||id::text from reset_operations`);
  await q(`create temp table reset_shared_replies on commit drop as select distinct r.id from reset_reply_ids r join talent_messages t
    on t.payload#>>'{careerCapabilityTurn,replyId}'=r.id where ${owned} and t.role='user' and t.id not in (select id from reset_talent_sources)`);
  await q(`insert into reset_shared_replies select distinct r.id from reset_reply_ids r join talent_messages t
    on coalesce(t.payload->>'careerTextReplyId',t.payload#>>'{agentTurn,replyId}')=r.id
    where ${owned} and exists(select 1 from regexp_matches(t.content,'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','g') ref join company_roles other on other.role_id=ref[1]::uuid where other.role_id<>(select role_id from reset_scope))
    and r.id not in (select id from reset_shared_replies)`);
  await q(`delete from reset_operations where 'invocation:'||id::text in (select id from reset_shared_replies)`);
  await q(`create temp table reset_talent_messages on commit drop as select t.* from talent_messages t where ${owned} and (
    t.id in (select id from reset_talent_sources) or (coalesce(t.payload->>'careerTextReplyId',t.payload#>>'{agentTurn,replyId}') in
      (select id from reset_reply_ids except select id from reset_shared_replies)))`);
}

export async function assertWonderfulFdeResetIdle(q: ResetQuery) {
  const busy = await q(`select '회사 연락' kind from company_agent_web_action_jobs where id in (select id from reset_jobs) and (locked_at is not null or status in ('queued','running','processing'))
    union all select 'Slack 응답' from slack_reply_jobs where (user_message_id ${inMessages} or response_message_id ${inMessages}) and (locked_at is not null or status in ('queued','running','processing'))
    union all select '후보자 연락' from contact_queue t where t.user_id in (select id from reset_accounts) and t.role_id=(select role_id from reset_scope) and locked_at is not null
    union all select 'Calendar' from meeting_schedule_calendar_events d join meeting_schedules t on t.id=d.schedule_id where ${pair} and d.status='creating'
    union all select 'FDE 대화' from talent_external_operations t where ${owned} and t.request->>'source_message_id' in (select id::text from reset_talent_sources)
      and t.kind in ('career_invocation','delegated_work','browser_run','career_dependency','career_event') and t.status in ('ready','running','pending')
    union all select 'FDE 응답' from talent_agent_runtime t where ${owned} and t.state#>>'{activeReply,replyId}' in (select id from reset_reply_ids)
      and (t.state#>>'{activeReply,expiresAt}')::timestamptz>now()
    limit 1`);
  if (busy.length) throw new WonderfulFdeResetConflict(`${busy[0].kind} 처리 중입니다. 완료하거나 중지한 뒤 다시 초기화해 주세요.`);
}

export async function readWonderfulFdeReset(q: ResetQuery) {
  const counts: WonderfulFdeResetPreview["counts"] = [];
  const hash = createHash("sha256");
  const rows = await q(resetTables.map(([table, condition]) =>
    `select '${table}' as name,count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),',' order by to_jsonb(t)::text),'')) signature from public.${table} t where ${condition}`
  ).join(' union all '));
  for (const row of rows) {
    counts.push({table:row.name,count:row.n});
    hash.update(JSON.stringify(row));
  }
  const meetings = await q(`select to_jsonb(t) schedule,to_jsonb(d) delivery from meeting_schedules t left join meeting_schedule_calendar_events d on d.schedule_id=t.id where ${pair} order by t.id`);
  hash.update(JSON.stringify(meetings));
  const messages = await q("select * from reset_company_messages order by id");
  const slack = new Map<string, { channelId?: string; threadId?: string; ts: string }>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const receipts = [m.metadata?.companyMessageReceipt, ...Object.values(m.metadata?.contactEventSlackPosts ?? {})] as any[];
    if (m.slack_message_ts && m.slack_thread_id) receipts.push({ threadId: m.slack_thread_id, slackMessageTs: m.slack_message_ts });
    for (const r of receipts) if (r?.slackMessageTs && (r.channelId || r.threadId)) {
      slack.set(`${r.channelId || r.threadId}:${r.slackMessageTs}`, { channelId: r.channelId, threadId: r.threadId, ts: r.slackMessageTs });
    }
  }
  const [shared] = await q("select count(*)::int n from reset_shared_replies");
  return { preview: { fingerprint: hash.digest("hex"), counts: counts.filter(c => c.count), meetings: meetings.length,
    slackMessages: slack.size, retainedSharedReplies: shared.n } satisfies WonderfulFdeResetPreview, meetings, slack: [...slack.values()] };
}

export async function deleteWonderfulFdeRows(q: ResetQuery) {
  // All actual deletes remain in one transaction. A new FK stops/rolls back the
  // reset instead of disabling triggers or widening deletion to unknown rows.
  for (const [table, condition] of resetTables) await q(`delete from public.${table} t where ${condition}`);
  // Drop only this fixture's completed reply cache. An unrelated active reply
  // in the same conversation keeps its lease/checkpoints/handbooks unchanged.
  await q(`update talent_agent_runtime t set state=
    (case when t.state#>>'{previous,replyId}' in (select id from reset_reply_ids except select id from reset_shared_replies) then t.state-'previous' else t.state end)
    ||jsonb_build_object('checkpoints',coalesce(t.state->'checkpoints','{}')-array(select id from reset_reply_ids except select id from reset_shared_replies),
      'completedReplyIds',coalesce(t.state->'completedReplyIds','{}')-array(select id from reset_reply_ids except select id from reset_shared_replies))
    where t.user_id in (select id from reset_accounts) and t.conversation_id in (select conversation_id from reset_talent_messages)
    and (t.state#>>'{previous,replyId}' in (select id from reset_reply_ids except select id from reset_shared_replies)
      or coalesce(t.state->'checkpoints','{}') ?| array(select id from reset_reply_ids except select id from reset_shared_replies)
      or coalesce(t.state->'completedReplyIds','{}') ?| array(select id from reset_reply_ids except select id from reset_shared_replies))`);
  await q(`update company_conversations c set summary_cursor_message_id=null,last_message_id=(select max(id) from company_messages m where m.conversation_id=c.id)
    where c.id in (select conversation_id from reset_company_messages)`);
}

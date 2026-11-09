import { APPLICATION_TEST_START as start } from "./devApplicationStart";
import {
  APPLICATION_CHECKPOINT_USER_ID as owner,
  APPLICATION_CHECKPOINT_EMAIL as email,
} from "./devApplicationCheckpoint";
import { closeIdlePreparationBrowsers } from "./devCheckpointBrowserCleanup.server";
import { getCareerDevSqlClient } from "./devSql";
import {
  prepareWonderfulFdeReset,
  assertWonderfulFdeResetIdle,
  deleteWonderfulFdeRows,
  type ResetQuery,
} from "./devWonderfulFdeReset";
import { applicationSubmissionState } from "./simulation/applicationExecution";
import type { SimulationSession } from "./simulation/session";

const roleIds = start.roles.map((role) => role.id);
const anchor = [owner, start.lastMessageId];
const scope = [owner, roleIds];

async function readBoundary(q: ResetQuery) {
  const [row] = await q(
    `select m.created_at from talent_messages m join auth.users u on u.id=m.user_id
    where m.user_id=$1 and m.id=$2 and lower(u.email)=$3 and m.role='assistant' and m.message_type='chat'`,
    [...anchor, email]
  );
  if (!row)
    throw new Error(
      "기준 메시지 #472788 또는 테스트 계정을 확인할 수 없습니다."
    );
  const roles = await q(
    `select role_id,source_type from company_roles where role_id=any($1::uuid[])
    and status='active' and is_expired is not true`,
    [roleIds]
  );
  if (
    !start.roles.every((target) =>
      roles.some(
        (row) => row.role_id === target.id && row.source_type === target.type
      )
    )
  )
    throw new Error("테스트 공고 4개의 공개 상태를 확인해 주세요.");
  return row.created_at;
}

export async function inspectApplicationStart() {
  const db = getCareerDevSqlClient();
  await readBoundary((sql, params = []) => db.unsafe(sql, params));
  return { available: true, capturedAt: start.label };
}

// Caller owns one serializable transaction. Only this account can be targeted.
export async function resetApplicationStartRows(q: ResetQuery) {
  await q("set local lock_timeout='5s'");
  await q("select pg_advisory_xact_lock(hashtext($1))", [
    `career-checkpoint:${owner}`,
  ]);
  await q(
    "select pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||$1,0))",
    [owner]
  );
  await q(
    "select id from talent_conversations where user_id=$1 order by id for update",
    [owner]
  );
  const since = await readBoundary(q);
  const after = [owner, since];
  const busy = await q(
    `select 1 from talent_agent_runtime where user_id=$1 and
      ((state#>>'{activeReply,expiresAt}')::timestamptz>now() or coalesce(state->'checkpoints','{}') <> '{}')
    union all select 1 from talent_external_operations where user_id=$1 and (
      (kind='browser_session' and status<>'closed') or (kind in
      ('career_invocation','delegated_work','career_dependency','career_event','browser_run') and status not in ('completed','failed','cancelled')))
    union all select 1 from talent_calls where user_id=$1 and status in ('starting','active')
    union all select 1 from opportunity_discovery_run where talent_id=$1 and status in ('queued','running')
    union all select 1 from external_recommendation_runs where talent_id=$1 and status in ('queued','running') limit 1`,
    [owner]
  );
  if (busy.length)
    throw new Error("실행 중인 Career 작업을 종료한 뒤 다시 눌러 주세요.");
  await q(
    `select pg_advisory_xact_lock(hashtextextended('company_talent_route:'||company_workspace_id::text||':'||$1,0))
    from company_roles where role_id=$2`,
    [owner, start.roles[3].id]
  );
  await prepareWonderfulFdeReset(q, [{ id: owner, email }]);
  await assertWonderfulFdeResetIdle(q);
  const delivery = await q(
    `select 1 from meeting_schedule_calendar_events d join meeting_schedules s on s.id=d.schedule_id
    where s.talent_id=$1 and s.role_id=any($2::uuid[]) and d.external_event_id is not null
    union all select 1 from org_intro_email_threads where talent_id=$1 and role_id=any($2::uuid[])
    union all select 1 from talent_referral_application where referred_user_id=$1 and role_id=any($2::uuid[]) and (hired_at is not null or reward_paid or settlement_completed_at is not null)
    union all select 1 from contact_queue where user_id=$1 and role_id=any($2::uuid[]) and locked_at is not null limit 1`,
    scope
  );
  if (delivery.length)
    throw new Error(
      "대상 공고에 외부 일정·소개·정산 기록 또는 처리 중인 연락이 연결돼 있습니다."
    );

  await q(
    `create temp table start_recs on commit drop as select distinct on(role_id) *
    from talent_opportunity_recommendation where talent_id=$1 and role_id=any($2::uuid[])
    order by role_id,created_at desc,id desc`,
    scope
  );
  await q(
    `create temp table start_apps on commit drop as select * from talent_simulate_application
    where user_id=$1 and (message_id>$2 or start_offer_message_id>$2 or
    role_ref in (select prefix||id from unnest($3::text[]) id cross join unnest(array['','role:','internal:','external:']) prefix))`,
    [...anchor, roleIds]
  );
  const applications = await q("select payload from start_apps");
  for (const { payload } of applications) {
    const s = payload as SimulationSession;
    const attempts = [s.browser, ...(s.browser?.previousAttempts ?? [])];
    if (
      attempts.some(
        (browser) =>
          browser &&
          (["queued", "running", "waiting"].includes(browser.status) ||
            applicationSubmissionState({
              ...s,
              browser,
            } as SimulationSession) !== "not_submitted")
      ) ||
      payload.analysisStatus === "running" ||
      payload.preparation?.generation?.status === "running" ||
      payload.applicationInspection?.status === "running"
    )
      throw new Error("진행 중이거나 외부 제출을 시도한 지원 세션이 있습니다.");
  }
  // Capture follow-up IDs while their role ownership is still available.
  await q(
    `delete from career_daily_sources d where d.talent_id=$1 and (
    d.event->'roleIds' ?| $2::text[] or d.event->>'roleId'=any($2::text[])
    or (d.source_kind='company_followup' and d.source_id in (
      select id::text from company_talent_followups where talent_id=$1 and role_id=any($2::uuid[])))
    or (d.source_kind='appointment' and d.source_id in (
      select id::text from meeting_schedules where talent_id=$1 and role_id=any($2::uuid[]))))`,
    scope
  );
  // Pin draft IDs from the role/form and preparation references before deleting
  // them. A different role's private resume may have been created the same day.
  await q(
    `create temp table start_documents on commit drop as
    select ref->>'id' id from talent_messages m
      cross join lateral jsonb_array_elements(case when jsonb_typeof(m.payload->'relatedRefs')='array'
        then m.payload->'relatedRefs' else '[]'::jsonb end) ref
    where m.user_id=$1 and ref->>'type'='document' and exists(
      select 1 from jsonb_array_elements(m.payload->'relatedRefs') as r(value)
      where r.value->>'type'='role' and r.value->>'id'=any($2::text[]))
    union select d.id::text from talent_documents d
      join company_workspace w on lower(w.company_name)=lower(d.structured_content#>>'{target_role,company}')
      join company_roles r on r.company_workspace_id=w.company_workspace_id and lower(r.name)=lower(d.structured_content#>>'{target_role,title}')
      where d.talent_id=$1 and r.role_id=any($2::uuid[])
    union select payload#>>'{preparation,workingResume,documentId}' from start_apps
    union select doc->>'id' from talent_role_materials mat cross join lateral jsonb_array_elements(mat.documents) doc
      where mat.talent_id=$1 and mat.role_id=any($2::uuid[])`,
    scope
  );
  await q(
    "delete from talent_simulate_application where user_id=$1 and id in(select id from start_apps)",
    [owner]
  );

  // Chat history has its own exact boundary. Its operations are handled below
  // together with their dependent runs and retained delivery receipts.
  await q("truncate pg_temp.reset_talent_messages, pg_temp.reset_operations");
  await deleteWonderfulFdeRows(q);

  // Remove pair-owned application state before replacing the recommendations.
  for (const table of [
    "talent_external_evaluations",
    "talent_external_fit",
    "company_talent_followups",
    "company_talent_requests",
    "company_intro_candidates",
    "talent_progress",
    "agent_contact_messages",
    "talent_role_materials",
  ]) {
    await q(
      `delete from ${table} where talent_id=$1 and role_id=any($2::uuid[])`,
      scope
    );
  }
  for (const table of [
    "talent_opportunity_tag",
    "talent_opportunity_fit",
    "talent_opportunity_matching_review",
  ]) {
    await q(
      `delete from ${table} where talent_id=$1 and opportunity_id=any($2::uuid[])`,
      scope
    );
  }
  await q(
    "delete from talent_referral_application where referred_user_id=$1 and role_id=any($2::uuid[])",
    scope
  );
  await q(
    `delete from talent_matching_operations o where o.talent_id=$1 and
    exists(select 1 from unnest($2::text[]) role where jsonb_path_exists(o.command,
    '$.** ? (@ == $id)',jsonb_build_object('id',role)))`,
    scope
  );
  await q(
    "delete from talent_opportunity_recommendation where talent_id=$1 and role_id=any($2::uuid[])",
    scope
  );

  await q(
    `delete from talent_agent_schedules where talent_id=$1 and (source_message_id>$2 or
    target_refs->'roleIds' ?| $3::text[])`,
    [...anchor, roleIds]
  );
  // Keep immutable send/submit receipts and all operations they depend on.
  await q(
    `with recursive candidates as (
    select id from talent_external_operations where user_id=$1 and created_at>$2
      and kind in ('career_invocation','delegated_work','career_dependency','career_event','browser_session','browser_run','pdf_artifact','attachment_snapshot')
  ), keep as (
    select id,parent_id from talent_external_operations where user_id=$1 and
      (id not in(select id from candidates) or id in(select last_operation_id from talent_agent_schedules where talent_id=$1))
    union select o.id,o.parent_id from talent_external_operations o join keep k on k.parent_id=o.id where o.user_id=$1
  ) delete from talent_external_operations where user_id=$1 and id in(select id from candidates except select id from keep)`,
    after
  );
  await q("delete from talent_agent_runtime where user_id=$1", [owner]);
  await q(
    "delete from talent_conversation_summaries where talent_id=$1 and (to_message_id>$2 or from_message_id>$2)",
    anchor
  );
  await q(
    "delete from talent_activity_events where talent_id=$1 and (message_id>$2 or created_at>$3)",
    [...anchor, since]
  );
  await q(
    "delete from career_action_items where user_id=$1 and created_at>$2",
    after
  );
  await q(
    "delete from career_content_suggestions where user_id=$1 and created_at>$2",
    after
  );
  await q("delete from talent_behavior_contexts where talent_id=$1", [owner]);
  await q(
    "delete from talent_behavior_context_changes where talent_id=$1 and created_at>$2",
    after
  );
  // Only facts created from the removed turns belong to this rewind. Keep
  // older profile/Brief facts, as well as facts with independent sources.
  await q(
    `delete from talent_contexts c where c.talent_id=$1 and c.created_at>$2
    and jsonb_array_length(c.source_refs)>0 and not exists (
      select 1 from jsonb_array_elements(c.source_refs) as source_ref(value) where not exists (
        select 1 from talent_messages m where m.user_id=$1 and m.id>$3 and m.id::text=source_ref.value->>'messageId'))`,
    [...after, start.lastMessageId]
  );
  await q(
    `update talent_documents set is_deleted=true,updated_at=now() where talent_id=$1 and not is_primary and not is_public
    and not is_deleted and created_at>$2 and id::text in(select id from start_documents)
    and origin_type in ('harper_generated_resume','harper_authored_document')`,
    after
  );
  await q("delete from talent_messages where user_id=$1 and id>$2", anchor);
  await q(
    `insert into talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,score,fit_summary,fit_reasons,tradeoffs,evidence,preference_fit)
    select $1,r.role_id,'recommendation',case when r.source_type='internal' then 'internal_recommendation' else 'external_jd' end,
      prev.score,prev.fit_summary,coalesce(prev.fit_reasons,'[]'),coalesce(prev.tradeoffs,'[]'),coalesce(prev.evidence,'[]'),coalesce(prev.preference_fit,'{}')
    from company_roles r left join start_recs prev on prev.role_id=r.role_id where r.role_id=any($2::uuid[])`,
    scope
  );
  const visible = await q(
    `select distinct r.role_id from talent_effective_opportunity_recommendations_v1 r
    join talent_opportunity_memberships m on m.recommendation_id=r.id and m.talent_id=r.talent_id and m.archived_at is null
    where r.talent_id=$1 and r.role_id=any($2::uuid[]) and r.feedback is null and r.saved_stage is null and r.dismissed_at is null`,
    scope
  );
  const [chat] = await q(
    "select max(id) last from talent_messages where user_id=$1",
    [owner]
  );
  if (
    visible.length !== roleIds.length ||
    Number(chat.last) !== start.lastMessageId
  )
    throw new Error(
      "새 기회 또는 채팅 복원 결과가 기준과 달라 변경을 취소했습니다."
    );
  return { opportunities: visible.length, lastMessageId: start.lastMessageId };
}

export async function resetApplicationStart() {
  await inspectApplicationStart();
  await closeIdlePreparationBrowsers(owner);
  return getCareerDevSqlClient().begin("isolation level serializable", (tx) =>
    resetApplicationStartRows((sql, params = []) => tx.unsafe(sql, params))
  );
}

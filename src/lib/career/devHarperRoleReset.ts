import { CareerRoleResetConflict } from "./devWonderfulRoleReset";

export const HARPER_TEST_ROLE_ID = "c351ca7c-b561-4c68-ab04-6b2d3212efa9";
export const HARPER_TEST_ROLE_FIXTURE = "harper-founding-engineer-ai-agent-v1";

type Query = (
  sql: string,
  parameters?: string[]
) => Promise<Record<string, any>[]>;
type StopBrowser = (refs: {
  sessionId?: string;
  workspaceId?: string;
}) => Promise<unknown>;

// Transaction supplied by the caller. Never accept a target account/role from HTTP.
export async function resetHarperTestRoleRecommendation(
  query: Query,
  talentId: string,
  stopBrowser: StopBrowser
) {
  const scope = [talentId, HARPER_TEST_ROLE_ID];
  await query(
    `select pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || $1, 0))`,
    [talentId]
  );
  const [role] = await query(
    `select information from public.company_roles where role_id=$1::uuid
     and source_type='external' and status='active'
     and information->>'testOnly'='true' and information->>'testFixture'=$2 for update`,
    [HARPER_TEST_ROLE_ID, HARPER_TEST_ROLE_FIXTURE]
  );
  if (!role)
    throw new CareerRoleResetConflict(
      "Harper 테스트 공고가 없거나 사용할 수 없습니다."
    );

  // Lock the owner's conversation admission and runtime rows while gathering the
  // exact structured references. Do not infer ownership from chat prose or URLs.
  await query(
    `select id from public.talent_conversations where user_id=$1::uuid order by id for update`,
    [talentId]
  );
  const runtimes = await query(
    `select state from public.talent_agent_runtime where user_id=$1::uuid for update`,
    [talentId]
  );
  if (
    runtimes.some(
      ({ state }) =>
        state?.activeReply?.expiresAt &&
        Date.parse(state.activeReply.expiresAt) > Date.now()
    )
  )
    throw new CareerRoleResetConflict(
      "Career 작업이 실행 중입니다. 완료하거나 중지한 뒤 다시 시도해 주세요."
    );

  await query(
    `create temporary table harper_reset_refs(ref text primary key) on commit drop`
  );
  await query(
    `insert into harper_reset_refs values ($1),('role:' || $1),('external:' || $1)`,
    [HARPER_TEST_ROLE_ID]
  );
  await query(
    `insert into harper_reset_refs
    select id::text from public.talent_opportunity_recommendation where talent_id=$1::uuid and role_id=$2::uuid
    union select id::text from public.talent_role_materials where talent_id=$1::uuid and role_id=$2::uuid
    union select id::text from public.talent_simulate_application where user_id=$1::uuid
      and role_ref in ($2::text,'role:' || $2::text,'external:' || $2::text) on conflict do nothing`,
    scope
  );

  const matches = (column: string) => `exists (select 1 from harper_reset_refs r
    where jsonb_path_exists(coalesce(${column},'{}'::jsonb), '$.** ? (@ == $ref)', jsonb_build_object('ref',r.ref)))`;
  const activeApplications = await query(
    `select id from public.talent_simulate_application where user_id=$1::uuid
      and id::text in (select ref from harper_reset_refs) and (
        payload#>>'{browser,status}' in ('queued','running','waiting')
        or payload#>>'{preparation,generation,status}'='running'
        or payload->>'analysisStatus'='running'
        or payload#>>'{applicationInspection,status}' in ('queued','running')
        or (payload#>>'{browser,leaseUntil}')::timestamptz > now()) for update`,
    [talentId]
  );
  if (activeApplications.length)
    throw new CareerRoleResetConflict(
      "이 공고의 지원 작업이 실행 중입니다. 완료하거나 중지한 뒤 다시 시도해 주세요."
    );
  await query(
    `create temporary table harper_reset_operations on commit drop as
    with recursive related as (
      select o.id from public.talent_external_operations o where o.user_id=$1::uuid and ${matches("o.request")}
      union
      select o.id from public.talent_external_operations o join related r on
        o.parent_id=r.id or o.request->>'work_id'=r.id::text
        or (o.kind='browser_session' and o.id=(select parent_id from public.talent_external_operations where id=r.id and kind='browser_run'))
      where o.user_id=$1::uuid
    ) select o.* from public.talent_external_operations o join related r using(id)`,
    [talentId]
  );
  const operations =
    await query(`select o.* from public.talent_external_operations o
    join harper_reset_operations r using(id) for update of o`);
  for (const op of operations) {
    const refs = op.request?.role_refs;
    if (
      Array.isArray(refs) &&
      refs.some(
        (ref: string) =>
          ![
            HARPER_TEST_ROLE_ID,
            `role:${HARPER_TEST_ROLE_ID}`,
            `external:${HARPER_TEST_ROLE_ID}`,
          ].includes(ref)
      )
    )
      throw new CareerRoleResetConflict(
        "다른 공고와 함께 진행한 브라우저 작업이 있습니다. 해당 작업을 먼저 정리해 주세요."
      );
    if (
      [
        "running",
        "preparing",
        "dispatching",
        "uncertain",
        "cancelling",
        "closing",
        "sending",
      ].includes(op.status)
    )
      throw new CareerRoleResetConflict(
        "이 공고의 작업이 실행 중입니다. 완료하거나 중지한 뒤 다시 시도해 주세요."
      );
  }
  const meetings = await query(
    `select id from public.meeting_schedules where talent_id=$1::uuid and role_id=$2::uuid limit 1`,
    scope
  );
  const deliveries = await query(
    `select locked_at from public.contact_queue where user_id=$1::uuid
    and (role_id=$2::uuid or recommendation_id::text in (select ref from harper_reset_refs)) for update`,
    scope
  );
  if (meetings.length || deliveries.some((row) => row.locked_at))
    throw new CareerRoleResetConflict(
      "이 공고의 미팅 또는 처리 중인 연락이 있어 초기화할 수 없습니다."
    );

  // Idle browser resources still need provider cleanup before their receipts go.
  for (const op of operations.filter(
    (op) => op.kind === "browser_session" && op.status !== "closed"
  ))
    await stopBrowser({
      sessionId: op.provider_refs?.session_id,
      workspaceId: op.provider_refs?.workspace_id,
    });
  await query(
    `insert into harper_reset_refs select id::text from harper_reset_operations on conflict do nothing`
  );
  await query(
    `create temporary table harper_reset_messages on commit drop as
    select m.id,m.conversation_id from public.talent_messages m where m.user_id=$1::uuid and (
      ${matches("m.payload")} or m.id in (
        select message_id from public.talent_simulate_application where user_id=$1::uuid and id::text in (select ref from harper_reset_refs)
        union select start_offer_message_id from public.talent_simulate_application where user_id=$1::uuid and id::text in (select ref from harper_reset_refs)
      ))`,
    [talentId]
  );
  await query(
    `insert into harper_reset_messages select m.id,m.conversation_id from public.talent_messages m
    where m.user_id=$1::uuid and m.payload->>'formId' in (select id::text from harper_reset_messages)
      and m.id not in (select id from harper_reset_messages)`,
    [talentId]
  );

  await query(
    `delete from public.company_talent_relays where recommendation_id in (
    select id from public.talent_opportunity_recommendation where talent_id=$1::uuid and role_id=$2::uuid
  ) or company_talent_request_id in (
    select id from public.company_talent_requests where talent_id=$1::uuid and role_id=$2::uuid)`,
    scope
  );
  for (const table of [
    "company_talent_followups",
    "company_talent_requests",
    "company_intro_candidates",
    "talent_progress",
    "agent_contact_messages",
    "talent_external_fit",
    "talent_external_evaluations",
  ])
    await query(
      `delete from public.${table} where talent_id=$1::uuid and role_id=$2::uuid`,
      scope
    );
  for (const table of [
    "talent_opportunity_tag",
    "talent_opportunity_matching_review",
    "talent_opportunity_fit",
  ])
    await query(
      `delete from public.${table} where talent_id=$1::uuid and opportunity_id=$2::uuid`,
      scope
    );
  await query(
    `delete from public.talent_referral_application where referred_user_id=$1::uuid and role_id=$2::uuid`,
    scope
  );
  await query(
    `delete from public.contact_queue where user_id=$1::uuid and (role_id=$2::uuid or recommendation_id::text in (select ref from harper_reset_refs))`,
    scope
  );
  // Recommendation cascades remove memberships, previews, activity and intro threads.
  await query(
    `delete from public.talent_opportunity_recommendation where talent_id=$1::uuid and role_id=$2::uuid`,
    scope
  );
  await query(
    `delete from public.talent_role_materials where talent_id=$1::uuid and role_id=$2::uuid`,
    scope
  );
  await query(
    `delete from public.talent_simulate_application where user_id=$1::uuid and id::text in (select ref from harper_reset_refs)`,
    [talentId]
  );
  await query(
    `delete from public.talent_agent_schedules where talent_id=$1::uuid and (last_operation_id in (select id from harper_reset_operations) or ${matches("target_refs")})`,
    [talentId]
  );
  await query(
    `delete from public.talent_external_operations where user_id=$1::uuid and id in (select id from harper_reset_operations)`,
    [talentId]
  );
  // Clear derived conversation context, not unrelated messages or user memory.
  await query(
    `delete from public.talent_conversation_summaries where conversation_id in (select conversation_id from harper_reset_messages)`
  );
  await query(
    `delete from public.talent_agent_runtime where user_id=$1::uuid and conversation_id in (select conversation_id from harper_reset_messages)`,
    [talentId]
  );
  await query(
    `delete from public.talent_messages where user_id=$1::uuid and id in (select id from harper_reset_messages)`,
    [talentId]
  );

  // A dev user's explicit click opts only that account into this one fixture.
  await query(
    `update public.company_roles set information=jsonb_set(information,'{testTalentIds}',
    coalesce(information->'testTalentIds','[]'::jsonb) || jsonb_build_array($1::text))
    where role_id=$2::uuid and not coalesce(information->'testTalentIds','[]'::jsonb) ? $1::text`,
    scope
  );
  const [recommendation] = await query(
    `insert into public.talent_opportunity_recommendation
    (talent_id,role_id,kind,opportunity_type,model_version)
    values($1::uuid,$2::uuid,'recommendation','external_jd','harper-dev-fixture') returning id`,
    scope
  );
  return { recommendationId: recommendation.id as string };
}

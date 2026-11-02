// The real Wonderful Korea FDE role; never resolve a similarly named overseas role.
export const WONDERFUL_KOREA_FDE_ROLE_ID =
  "e1657263-3369-48c9-8e1b-812834e79037";

type Query = (
  sql: string,
  parameters?: string[]
) => Promise<Record<string, any>[]>;

export class CareerRoleResetConflict extends Error {}

// The caller must supply a transaction. All mutations are scoped to the
// authenticated talent and this one role, including company-side pair state.
export async function resetWonderfulRoleRecommendation(
  query: Query,
  talentId: string
) {
  const scope = [talentId, WONDERFUL_KOREA_FDE_ROLE_ID];
  await query(
    `select pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || $1, 0))`,
    [talentId]
  );
  const [role] = await query(
    `select company_workspace_id from public.company_roles
     where role_id=$1::uuid and source_type='internal' and status='active' for share`,
    [WONDERFUL_KOREA_FDE_ROLE_ID]
  );
  if (!role) {
    throw new CareerRoleResetConflict(
      "Wonderful Korea FDE 역할이 없거나 채용 중이 아닙니다."
    );
  }
  await query(
    `select pg_advisory_xact_lock(hashtextextended('company_talent_route:' || $1 || ':' || $2, 0))`,
    [role.company_workspace_id, talentId]
  );
  // Meetings have a RESTRICT FK and calendar side effects. This small reset
  // cannot cancel an actual meeting or erase its external delivery evidence.
  const meetings = await query(
    `select id from public.meeting_schedules where talent_id=$1::uuid and role_id=$2::uuid limit 1`,
    scope
  );
  if (meetings.length) {
    throw new CareerRoleResetConflict(
      "이 역할의 미팅 기록이 있어 초기화할 수 없습니다."
    );
  }
  const deliveries = await query(
    `select id, locked_at from public.contact_queue
     where user_id=$1::uuid and (role_id=$2::uuid or recommendation_id in (
       select id from public.talent_opportunity_recommendation where talent_id=$1::uuid and role_id=$2::uuid
     )) for update`,
    scope
  );
  if (deliveries.some((row) => row.locked_at)) {
    throw new CareerRoleResetConflict(
      "이 역할의 연락을 처리 중입니다. 완료 후 다시 시도해 주세요."
    );
  }
  const [previous] = await query(
    `select fit_summary, fit_reasons, tradeoffs, evidence, preference_fit
     from public.talent_opportunity_recommendation
     where talent_id=$1::uuid and role_id=$2::uuid
     order by (opportunity_type='internal_recommendation') desc, created_at desc, id desc limit 1`,
    scope
  );

  await query(
    `delete from public.company_talent_relays where recommendation_id in (
       select id from public.talent_opportunity_recommendation where talent_id=$1::uuid and role_id=$2::uuid
     ) or company_talent_request_id in (
       select id from public.company_talent_requests where talent_id=$1::uuid and role_id=$2::uuid
     )`,
    scope
  );
  for (const table of [
    "company_talent_followups",
    "company_talent_requests",
    "company_intro_candidates",
    "talent_progress",
  ]) {
    await query(
      `delete from public.${table} where talent_id=$1::uuid and role_id=$2::uuid`,
      scope
    );
  }
  for (const table of [
    "talent_opportunity_tag",
    "talent_opportunity_matching_review",
  ]) {
    await query(
      `delete from public.${table} where talent_id=$1::uuid and opportunity_id=$2::uuid`,
      scope
    );
  }
  await query(
    `delete from public.contact_queue where user_id=$1::uuid and role_id=$2::uuid`,
    scope
  );
  // FK cascades remove old recommendation memberships, previews and activities.
  await query(
    `delete from public.talent_opportunity_recommendation where talent_id=$1::uuid and role_id=$2::uuid`,
    scope
  );
  const [recommendation] = await query(
    `insert into public.talent_opportunity_recommendation
       (talent_id, role_id, kind, opportunity_type, fit_summary, fit_reasons, tradeoffs, evidence, preference_fit)
     select $1::uuid, $2::uuid, 'recommendation', 'internal_recommendation',
       $3::jsonb->>'fit_summary', coalesce($3::jsonb->'fit_reasons','[]'::jsonb),
       coalesce($3::jsonb->'tradeoffs','[]'::jsonb), coalesce($3::jsonb->'evidence','[]'::jsonb),
       coalesce($3::jsonb->'preference_fit','{}'::jsonb)
     returning id`,
    [...scope, JSON.stringify(previous ?? {})]
  );
  // The normal INSERT trigger creates an active membership in Harper's list.
  return { recommendationId: recommendation.id as string };
}

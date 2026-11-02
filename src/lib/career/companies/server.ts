import type { TalentAdminClient } from '@/lib/talentOnboarding/admin';
import { isTestOnlyInternalRole } from '@/lib/internalRoleSafety';
import { formatLlmDateTime, PROMPT_TIME_ZONE } from '@/lib/llm/promptDateTime';

const db = (admin: TalentAdminClient) => admin as any;
export const COMPANY_FOLLOW_COVERAGE = 'Following saves interest in the exact company/workspace. During scheduled Career checks, shared hiring-announcement evidence and previously unevaluated roles from followed companies are prepared. Saved assessments are reused. Company changes do not start a separate contact run. Timing follows the existing Career schedule, including pauses.';
export type CompanyIdentity = { companyDbId: number | null; companyWorkspaceId: string | null; name: string; website: string | null; linkedin: string | null; scope: 'company' | 'workspace' };
export type CompanyFollow = { id: string; talent_id: string; company_db_id: number | null; company_workspace_id: string | null; scope: string; revision: number; instruction: string; followed_at: string; unfollowed_at: string | null; conversation_id: string | null; company?: { name?: string } | null; workspace?: { company_name?: string } | null; scan_state: Record<string, unknown> };

/** Parameter values are escaped for PostgREST's filter grammar, not interpreted as instructions. */
const filterLiteral = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export async function searchCareerCompanies(args: { admin: TalentAdminClient; query: string; offset?: number; limit?: number }) {
  let query = args.query.trim();
  try { const url = new URL(query.includes('://') ? query : `https://${query}`); if (url.hostname.includes('.')) query = `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`; } catch { /* Company names remain literal text. */ }
  if (!query) throw new Error('A company name, website or LinkedIn URL is required.');
  const offset = args.offset ?? 0, limit = args.limit ?? 20;
  const needle = filterLiteral(`%${query.replace(/[%_]/g, value => `\\${value}`)}%`);
  const [companies, workspaces] = await Promise.all([
    db(args.admin).from('company_db').select('id,name,website_url,linkedin_url', { count: 'exact' }).or(`name.ilike.${needle},website_url.ilike.${needle},linkedin_url.ilike.${needle}`).order('id').range(offset, offset + limit - 1),
    db(args.admin).from('company_workspace').select('company_workspace_id,company_db_id,company_name,homepage_url,linkedin_url', { count: 'exact' }).or(`company_name.ilike.${needle},homepage_url.ilike.${needle},linkedin_url.ilike.${needle}`).order('company_workspace_id').range(offset, offset + limit - 1),
  ]);
  if (companies.error || workspaces.error) throw new Error(companies.error?.message ?? workspaces.error?.message);
  const items: CompanyIdentity[] = [
    ...(companies.data ?? []).map((row: any) => ({ companyDbId: row.id, companyWorkspaceId: null, name: row.name ?? '', website: row.website_url, linkedin: row.linkedin_url, scope: 'company' as const })),
    ...(workspaces.data ?? []).map((row: any) => ({ companyDbId: row.company_db_id, companyWorkspaceId: row.company_workspace_id, name: row.company_name, website: row.homepage_url, linkedin: row.linkedin_url, scope: 'workspace' as const })),
  ];
  return { companies: items, nextOffset: offset + limit < Math.max(companies.count ?? 0, workspaces.count ?? 0) ? offset + limit : null, coverage: COMPANY_FOLLOW_COVERAGE };
}

export async function listCareerCompanyFollows(args: { admin: TalentAdminClient; userId: string; includeUnfollowed?: boolean; offset?: number; limit?: number }) {
  const offset = args.offset ?? 0, limit = args.limit ?? 30;
  let query = db(args.admin).from('talent_company_follow').select('*,company:company_db(name),workspace:company_workspace(company_name)', { count: 'exact' }).eq('talent_id', args.userId);
  if (!args.includeUnfollowed) query = query.is('unfollowed_at', null);
  const { data, error, count } = await query.order('followed_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { follows: (data ?? []) as CompanyFollow[], nextOffset: offset + limit < (count ?? 0) ? offset + limit : null, coverage: COMPANY_FOLLOW_COVERAGE };
}

export async function writeCareerCompanyFollow(args: { admin: TalentAdminClient; userId: string; conversationId?: string | null; requestId: string; input: Record<string, unknown> }) {
  const input = { ...args.input };
  if (input.follow_id) {
    const { data, error } = await db(args.admin).from('talent_company_follow').select('*').eq('id', input.follow_id).eq('talent_id', args.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Follow unavailable.');
    Object.assign(input, { scope: data.scope, company_db_id: data.company_db_id, company_workspace_id: data.company_workspace_id });
  }
  input.scope ??= input.company_workspace_id ? 'workspace' : 'company';
  const { data, error } = await db(args.admin).rpc('write_career_company_follow', {
    p_user_id: args.userId, p_conversation_id: args.conversationId ?? null, p_request_id: args.requestId, p_input: input,
  });
  if (error) throw new Error(error.message);
  return data as CompanyFollow;
}

export function formatCompanySearch(companies: CompanyIdentity[], nextOffset: number | null) {
  return [COMPANY_FOLLOW_COVERAGE, 'Company scope includes every verified workspace linked to that company identity; workspace scope follows only that organization.', ...companies.map(item => [
    `${item.name}; scope ${item.scope}; ${item.companyDbId !== null ? `company_db_id ${item.companyDbId}` : 'No company_db identity'}${item.companyWorkspaceId ? `; company_workspace_id ${item.companyWorkspaceId}` : ''}`,
    item.website ? `Website: ${item.website}` : '', item.linkedin ? `LinkedIn: ${item.linkedin}` : '',
  ].filter(Boolean).join('\n')), !companies.length ? 'No matching company found in the current directory.' : '', nextOffset !== null ? `More results: offset ${nextOffset}` : 'End of company results.'].filter(Boolean).join('\n\n');
}
export function formatCompanyFollows(follows: CompanyFollow[], nextOffset: number | null = null) {
  return [`Times: ${PROMPT_TIME_ZONE}. ${COMPANY_FOLLOW_COVERAGE}`, ...follows.map(item => [
    `${item.workspace?.company_name ?? item.company?.name ?? 'Company'}; Follow ${item.id}; revision ${item.revision}; ${item.unfollowed_at ? 'unfollowed' : 'following'}; scope ${item.scope}`,
    item.company_db_id !== null ? `company_db_id ${item.company_db_id}` : '', item.company_workspace_id ? `company_workspace_id ${item.company_workspace_id}` : '',
    item.instruction ? `User direction: ${item.instruction}` : '', `Followed: ${formatLlmDateTime(item.followed_at)}`,
  ].filter(Boolean).join('\n')), !follows.length ? 'No company follows.' : '', nextOffset !== null ? `More follows: offset ${nextOffset}` : 'End of follows.'].filter(Boolean).join('\n\n');
}

type SourceEvent = { sourceKind: string; sourceId: string; revision: number; sourceKey?: string; roleIds?: string[]; [key: string]: unknown };
export type CareerSourceRun = { id: string; talent_id?: string | null; trigger_payload?: Record<string, any> | unknown };
const sourceEvents = (run: CareerSourceRun): SourceEvent[] => {
  const payload = run.trigger_payload as Record<string, unknown> | null;
  return Array.isArray(payload?.sourceEvents) ? payload.sourceEvents as SourceEvent[] : [];
};

export class CareerSourceChangedError extends Error {
  constructor() { super('Career source changed or was cancelled.'); this.name = 'CareerSourceChangedError'; }
}
export async function assertCareerSourceEventsCurrent(args: { admin: TalentAdminClient; run: CareerSourceRun }) {
  const current: SourceEvent[] = [];
  let changed = false;
  const events = sourceEvents(args.run);
  const { data: setting, error: settingsError } = await db(args.admin).from('talent_setting')
    .select('profile_visibility,get_internal_recommendation,get_external_recommendation,status,blocked_companies').eq('user_id', args.run.talent_id).maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  const internalEnabled = setting?.get_internal_recommendation !== false && setting?.profile_visibility !== 'dont_share';
  const externalEnabled = setting?.get_external_recommendation !== false && setting?.status !== 'stopped';
  const blocked = new Set<string>((setting?.blocked_companies ?? []).map((name: string) => name.trim().toLowerCase()));
  const roleIds = [...new Set(events.flatMap(event => event.sourceKind === 'company_follow' ? event.roleIds ?? [] : []))];
  const roleRead = roleIds.length ? await db(args.admin).from('company_roles')
    .select('role_id,company_workspace_id,source_type,status,is_expired,expires_at,information,company_workspace:company_workspace(company_db_id,company_name,published_name)').in('role_id', roleIds) : { data: [], error: null };
  if (roleRead.error) throw new Error(roleRead.error.message);
  const rolesById = new Map<string, any>((roleRead.data ?? []).map((role: any) => [role.role_id, role]));
  const eligibleRoles = new Set<string>((roleRead.data ?? []).filter((role: any) =>
    role.status === 'active' && !role.is_expired && (!role.expires_at || new Date(role.expires_at).getTime() > Date.now()) &&
    !isTestOnlyInternalRole(role) && (role.source_type === 'internal' ? internalEnabled : externalEnabled) &&
    !blocked.has(String(role.company_workspace_id).toLowerCase()) &&
    ![role.company_workspace?.company_name, role.company_workspace?.published_name].some(name => typeof name === 'string' && blocked.has(name.trim().toLowerCase()))
  ).map((role: any) => role.role_id));
  for (const source of events) {
    let event = source;
    if (event.sourceKind === 'company_followup') {
      const { data: followup, error } = await db(args.admin).from('company_talent_followups').select('source_kind,source_id,revision,status,due_at,delivery_run_id').eq('id', event.sourceId).eq('talent_id', args.run.talent_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!followup || Number(followup.revision) !== Number(event.revision) || followup.status !== 'pending' || !followup.due_at || new Date(followup.due_at).getTime() > Date.now() || (followup.delivery_run_id && followup.delivery_run_id !== args.run.id)) {
        changed = true; continue;
      }
      const { data: authority, error: authorityError } = await db(args.admin).rpc('company_followup_source_v1', { p_kind: followup.source_kind, p_id: followup.source_id });
      if (authorityError) throw new Error(authorityError.message);
      if (!authority?.active || !authority.originalSentAt) { changed = true; continue; }
      current.push(event); continue;
    }
    if (event.sourceKind !== 'schedule' && event.sourceKind !== 'company_follow') { current.push(event); continue; }
    const table = event.sourceKind === 'schedule' ? 'talent_agent_schedules' : 'talent_company_follow';
    const { data, error } = await db(args.admin).from(table).select('*').eq('id', event.sourceId).eq('talent_id', args.run.talent_id).maybeSingle();
    if (error) throw new Error(error.message);
    const stale = !data || (event.sourceKind === 'schedule'
      ? Number(data.directive_revision) !== Number(event.revision)
      : Number(data.revision) !== Number(event.revision) || data.unfollowed_at || (event.sourceKey && data.scan_state?.latestSourceKey && data.scan_state.latestSourceKey !== event.sourceKey && String(data.scan_state.checkedAt ?? '') > String(event.occurredAt ?? '')));
    if (stale) { changed = true; continue; }
    if (event.sourceKind === 'company_follow' && event.roleIds?.length) {
      const ids = event.roleIds.filter(id => {
        const role = rolesById.get(id);
        return eligibleRoles.has(id) && (data.scope === 'workspace' ? role.company_workspace_id === data.company_workspace_id : role.company_workspace?.company_db_id === data.company_db_id)
          && (!event.roleSource || event.roleSource === (role.source_type === 'internal' ? 'internal' : 'external'));
      });
      if (ids.length !== event.roleIds.length) changed = true;
      if (!ids.length) continue;
      event = { ...event, roleIds: ids };
    }
    // A self-authored future pause keeps this occurrence's directive revision.
    // External pause/cancel increments it in the schedule mutation transaction.
    if (event.sourceKind === 'schedule' && (event as any).scheduleKey === 'career_check_in') {
      if (!internalEnabled && !externalEnabled) { changed = true; continue; }
      current.push(event); continue;
    }
    if (event.sourceKind === 'schedule' && (event.targetRefs as any)?.legacySchedulerReview) {
      const targets = event.targetRefs as Record<string, unknown>;
      const allowed = { ...targets, internalRecommendations: targets.internalRecommendations === true && internalEnabled,
        externalRecommendations: targets.externalRecommendations === true && externalEnabled };
      if (allowed.internalRecommendations !== targets.internalRecommendations || allowed.externalRecommendations !== targets.externalRecommendations) changed = true;
      if (!allowed.internalRecommendations && !allowed.externalRecommendations) continue;
      event = { ...event, targetRefs: allowed };
    }
    current.push(event);
  }
  if (!changed) return;
  // A prepared message may combine several sources, so never edit its meaning
  // in code. Requeue the still-current independent facts for the original agent.
  if (current.length) {
    const payload = args.run.trigger_payload as Record<string, unknown>;
    const { error } = await db(args.admin).rpc('requeue_career_remaining_sources', {
      p_run_id: args.run.id, p_source_events: current,
      p_contact_scope: current.some(event => event.sourceKind === 'company_followup' || (event.sourceKind === 'schedule' && (event as any).scheduleKey !== 'career_check_in' && !(event.targetRefs as any)?.legacySchedulerReview)) ? 'delegated_work'
        : current.some(event => (event as any).scheduleKey === 'career_check_in') ? 'career_check_in'
        : current.some(event => event.roleSource === 'internal' || (event.targetRefs as any)?.internalRecommendations === true) ? 'matching'
        : current.every(event => event.roleSource === 'external' || (event.targetRefs as any)?.externalRecommendations === true) ? 'external_recommendations' : payload.contactScope ?? 'delegated_work',
    });
    if (error) throw new Error(error.message);
  }
  throw new CareerSourceChangedError();
}
export async function finishCareerSourceEvents(args: { admin: TalentAdminClient; run: CareerSourceRun }) {
  const { error } = await db(args.admin).rpc('finish_career_source_events', { p_run_id: args.run.id });
  if (error) throw new Error(error.message);
}

/** Complete follow evaluations already accepted before automatic collection was removed. */
export async function completeCareerFollowEvaluation(args: { admin: TalentAdminClient; evaluationId: string; userId: string; conversationId?: string | null; sourceEvents: unknown[]; roleIds: string[]; evidence?: Record<string, unknown> }) {
  const { data, error } = await db(args.admin).rpc('complete_career_follow_evaluation', {
    p_evaluation_id: args.evaluationId, p_talent_id: args.userId, p_conversation_id: args.conversationId ?? null,
    p_source_events: args.sourceEvents, p_role_ids: args.roleIds, p_evidence: args.evidence ?? {},
  });
  if (error) throw new Error(error.message);
  return data as string | null;
}

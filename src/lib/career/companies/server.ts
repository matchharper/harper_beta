import type { TalentAdminClient } from '@/lib/talentOnboarding/admin';
import { isTestOnlyInternalRole } from '@/lib/internalRoleSafety';
import { formatLlmDateTime, PROMPT_TIME_ZONE } from '@/lib/llm/promptDateTime';
import { z } from 'zod';

const db = (admin: TalentAdminClient) => admin as any;
export const COMPANY_FOLLOW_COVERAGE = 'Following saves interest in a company by name or an existing company/workspace identity. Scheduled Career checks receive the followed company names, user instructions and follow dates, along with external roles and existing internal recommendations when a directory identity is linked. A follow does not expose unrecommended internal roles. Company changes do not start a separate contact run. Timing follows the existing Career schedule, including pauses.';
export type CompanyIdentity = {
  companyDbId: number | null;
  companyWorkspaceId: string | null;
  name: string;
  website: string | null;
  linkedin: string | null;
  matchedQueries: string[];
  scope: 'company' | 'workspace';
};
export type CompanyFollow = { id: string; talent_id: string; company_name?: string | null; company_db_id: number | null; company_workspace_id: string | null; scope: string; revision: number; instruction: string; followed_at: string; unfollowed_at: string | null; conversation_id: string | null; company?: { name?: string } | null; workspace?: { company_name?: string } | null; scan_state: Record<string, unknown> };

/** Parameter values are escaped for PostgREST's filter grammar, not interpreted as instructions. */
const filterLiteral = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export const companySearchInputSchema = z.object({
  queries: z.array(z.string().trim().min(1)).min(1),
  offset: z.number().int().nonnegative().default(0),
});

function normalizeCompanyQuery(query: string) {
  try {
    const url = new URL(query.includes('://') ? query : `https://${query}`);
    if (url.hostname.includes('.')) {
      query = `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`;
    }
  } catch { /* Company names remain literal text. */ }
  return query.toLowerCase();
}

export async function searchCareerCompanies(args: {
  admin: TalentAdminClient;
  queries: string[];
  offset?: number;
}) {
  const { queries, offset } = companySearchInputSchema.parse(args);
  const searchTerms = [...new Set(queries)].map(query => ({
    query, value: normalizeCompanyQuery(query),
  }));
  const terms = [...new Set(searchTerms.map(term => term.value))];
  const filters = terms.flatMap(query => {
    // Escape a literal substring regex: PostgREST treats '*' as a LIKE wildcard
    // even inside a quoted value. imatch preserves *, %, and _ in company names.
    const needle = filterLiteral(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return [`company_name.imatch.${needle}`, `linkedin_url.imatch.${needle}`];
  });
  const limit = 20;
  // One OR query returns each workspace once. Read one extra row for paging;
  // an exact count would scan every match again on every page.
  const workspaces = await args.admin
    .from('company_workspace')
    .select('company_workspace_id,company_db_id,company_name,homepage_url,linkedin_url')
    .or(filters.join(','))
    .order('test_score', { ascending: false, nullsFirst: false })
    .order('company_name')
    .order('company_workspace_id')
    .range(offset, offset + limit);
  if (workspaces.error) throw new Error(workspaces.error.message);
  const rows = workspaces.data ?? [];
  const items: CompanyIdentity[] = rows.slice(0, limit).map(row => ({
    companyDbId: row.company_db_id,
    companyWorkspaceId: row.company_workspace_id,
    name: row.company_name,
    website: row.homepage_url,
    linkedin: row.linkedin_url,
    matchedQueries: searchTerms.filter(term =>
      [row.company_name, row.linkedin_url].some(value =>
        typeof value === 'string' && value.toLowerCase().includes(term.value)
      )
    ).map(term => term.query),
    scope: 'workspace' as const,
  }));
  return {
    companies: items,
    nextOffset: rows.length > limit ? offset + limit : null,
    coverage: COMPANY_FOLLOW_COVERAGE,
  };
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
    Object.assign(input, { scope: data.scope, company_db_id: data.company_db_id, company_workspace_id: data.company_workspace_id, ...(data.company_name != null ? { company_name: data.company_name } : {}) });
  }
  input.scope ??= input.company_workspace_id ? 'workspace' : input.company_db_id != null ? 'company' : 'name';
  const { data, error } = await db(args.admin).rpc('write_career_company_follow', {
    p_user_id: args.userId, p_conversation_id: args.conversationId ?? null, p_request_id: args.requestId, p_input: input,
  });
  if (error) throw new Error(error.message);
  return data as CompanyFollow;
}

export function formatCompanySearch(companies: CompanyIdentity[], nextOffset: number | null) {
  return [...companies.map(item => [
    `${item.name}; company_workspace_id ${item.companyWorkspaceId}`,
    item.linkedin ? `LinkedIn: ${item.linkedin}` : '',
    item.matchedQueries?.length ? `Matched queries: ${item.matchedQueries.join(', ')}` : '',
  ].filter(Boolean).join('\n')), !companies.length ? 'No matching company found in the current directory.' : '', nextOffset !== null ? `More results: offset ${nextOffset}` : 'End of company results.'].filter(Boolean).join('\n\n');
}
export function formatCompanyFollows(follows: CompanyFollow[], nextOffset: number | null = null) {
  return [`Times: ${PROMPT_TIME_ZONE}. ${COMPANY_FOLLOW_COVERAGE}`, ...follows.map(item => [
    `${item.workspace?.company_name ?? item.company?.name ?? item.company_name ?? 'Company'}; Follow ${item.id}; revision ${item.revision}; ${item.unfollowed_at ? 'unfollowed' : 'following'}; scope ${item.scope}`,
    item.company_workspace_id ? `company_workspace_id ${item.company_workspace_id}` : '',
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
  if ((args.run.trigger_payload as any)?.companyIntroCandidateId) {
    const { data, error } = await db(args.admin).rpc('career_company_intro_is_current', {
      p_run: args.run.id, p_talent: args.run.talent_id,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new CareerSourceChangedError();
  }
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
    if (event.dailySourceId) {
      const { data: valid, error } = await db(args.admin).rpc('career_daily_source_current', {
        p_id: event.dailySourceId, p_talent: args.run.talent_id, p_run_id: args.run.id,
      });
      if (error) throw new Error(error.message);
      if (!valid) { changed = true; continue; }
    }
    if (event.sourceKind === 'agent_contact') {
      const {isCareerAgentContactEventCurrent}=await import('@/lib/agentContacts/store');
      if(!args.run.talent_id || !await isCareerAgentContactEventCurrent(event.sourceId,args.run.id,args.run.talent_id)) {changed=true;continue;}
      current.push(event);continue;
    }
    if (event.sourceKind === 'company_followup') {
      const { data: followup, error } = await db(args.admin).from('company_talent_followups').select('source_kind,source_id,revision,status,due_at,delivery_run_id').eq('id', event.sourceId).eq('talent_id', args.run.talent_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (followup && Number(followup.revision) === Number(event.revision) && followup.status === 'delivered' && followup.delivery_run_id === args.run.id) {
        current.push(event); continue;
      }
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
        return eligibleRoles.has(id) && (data.scope === 'workspace' ? role.company_workspace_id === data.company_workspace_id : data.scope === 'company' && role.company_workspace?.company_db_id === data.company_db_id)
          && (!event.roleSource || event.roleSource === (role.source_type === 'internal' ? 'internal' : 'external'));
      });
      if (ids.length !== event.roleIds.length) changed = true;
      if (!ids.length) continue;
      event = { ...event, roleIds: ids };
    }
    // A self-authored future pause keeps this occurrence's directive revision.
    // External pause/cancel increments it in the schedule mutation transaction.
    if (event.sourceKind === 'schedule' && (event as any).scheduleKey === 'career_check_in') {
      if (!externalEnabled) { changed = true; continue; }
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

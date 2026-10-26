import { formatLlmDateTime } from '@/lib/llm/promptDateTime';
import type { User } from '@supabase/supabase-js';
import type { OrgAgentAdminClient } from './data';
import { assertOrgTeamRoleAccess, readOrgRoleAccess } from '../teamAccess';
import { OrgAgentToolInputError } from './toolAvailability';

type Args = { admin: OrgAgentAdminClient; user: User; workspaceId: string };
export type CompanyMemoryRow = { ref: number; revision: number; scope: string; teamId: string | null; roleId: string | null; label: string; content: string; createdAt: string; updatedAt: string };
export type CompanyMemoryRead = { items: CompanyMemoryRow[]; total: number; nextOffset: number | null };
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function positiveInteger(value: unknown, fallback: number, name: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new OrgAgentToolInputError(`${name} must be a positive integer`);
  return value;
}
export function nonnegativeInteger(value: unknown, fallback = 0) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new OrgAgentToolInputError('offset must be a nonnegative integer');
  return value;
}
function textId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new OrgAgentToolInputError('Expected an exact UUID');
  return value;
}
async function scopeAccess(args: Args, input: Record<string, unknown>, write: boolean) {
  const access = await readOrgRoleAccess(args);
  if (write && access.authority === 'viewer') throw new OrgAgentToolInputError('This teammate has read-only access');
  const roleId = textId(input.roleId), teamId = textId(input.teamId);
  const scope = input.scope;
  if (scope !== undefined && !['company', 'team', 'role'].includes(String(scope))) throw new OrgAgentToolInputError('scope must identify company, team or role');
  if (scope === 'company' && (teamId || roleId || access.scope !== 'organization')) throw new OrgAgentToolInputError('Company memory is unavailable in this audience');
  if (roleId) await assertOrgTeamRoleAccess({ ...args, roleId });
  if (teamId) {
    if (access.scope !== 'organization' && !access.teamIds.includes(teamId)) throw new OrgAgentToolInputError('Team memory is outside this audience');
    const { data, error } = await (args.admin.from('company_workspace_teams') as any).select('id').eq('company_workspace_id', args.workspaceId).eq('id', teamId).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) throw new OrgAgentToolInputError('Team does not exist in this workspace');
  }
  if (write && ((scope === 'role' && (!roleId || teamId)) || (scope === 'team' && (!teamId || roleId)) || !scope)) throw new OrgAgentToolInputError('Memory needs its exact scope and target');
  return { access, roleId, teamId };
}
export async function readCompanyMemory(args: Args & { input?: Record<string, unknown> }): Promise<CompanyMemoryRead> {
  const input = args.input ?? {};
  const { access, roleId, teamId } = await scopeAccess(args, input, false);
  const offset = nonnegativeInteger(input.offset), limit = positiveInteger(input.limit, 20, 'limit');
  let query = (args.admin.from('company_memory_entries' as any) as any).select('id,revision,scope,team_id,role_id,label,content,created_at,updated_at', { count: 'exact' }).eq('company_workspace_id', args.workspaceId).is('deleted_at', null);
  if (input.scope) query = query.eq('scope', input.scope);
  if (roleId) query = query.eq('role_id', roleId);
  if (teamId) query = query.eq('team_id', teamId);
  const forRoleId = textId(input.forRoleId);
  if (forRoleId) {
    await assertOrgTeamRoleAccess({...args,roleId:forRoleId});
    const {data:role,error:roleError} = await (args.admin.from('company_internal_roles') as any).select('team_id').eq('role_id',forRoleId).single();
    if (roleError) throw roleError;
    const clauses = [`and(scope.eq.role,role_id.eq.${forRoleId})`, ...(role.team_id ? [`and(scope.eq.team,team_id.eq.${role.team_id})`] : []), ...(access.scope === 'organization' ? ['scope.eq.company'] : [])];
    query = query.or(clauses.join(','));
  }
  if (access.scope !== 'organization' && !forRoleId) {
    const { data, error } = await (args.admin.from('company_roles') as any).select('role_id,company_internal_roles!inner(team_id)').eq('company_workspace_id', args.workspaceId).eq('source_type', 'internal').in('company_internal_roles.team_id', access.teamIds);
    if (error) throw error;
    const roleIds = (data ?? []).map((r: any) => r.role_id);
    const clauses = [access.teamIds.length ? `and(scope.eq.team,team_id.in.(${access.teamIds.join(',')}))` : '', roleIds.length ? `and(scope.eq.role,role_id.in.(${roleIds.join(',')}))` : ''].filter(Boolean);
    if (!clauses.length) return { items: [], total: 0, nextOffset: null };
    query = query.or(clauses.join(','));
  }
  const { data, error, count } = await query.order('updated_at', {ascending:false}).order('id').range(offset, offset + limit - 1);
  if (error) throw error;
  const items = (data ?? []).map((r: any) => ({ ref: Number(r.id), revision: Number(r.revision), scope: r.scope, teamId: r.team_id, roleId: r.role_id, label: r.label, content: r.content,createdAt:r.created_at,updatedAt:r.updated_at }));
  const total = count ?? offset + items.length;
  return { items, total, nextOffset: offset + items.length < total ? offset + items.length : null };
}
export async function writeCompanyMemory(args: Args & { input: Record<string, unknown> }) {
  const { input } = args;
  if (typeof input.operationId !== 'string' || !input.operationId.trim()) throw new OrgAgentToolInputError('operationId is required; reuse it only for an identical retry');
  if (!Array.isArray(input.changes) || !input.changes.length) throw new OrgAgentToolInputError('changes must be a nonempty array');
  // Resolve audience and row ownership before the atomic, revision-checked RPC.
  for (const raw of input.changes) {
    const change = object(raw);
    if (change.op === 'add') {
      await scopeAccess(args, change, true);
      if (typeof change.content !== 'string' || !change.content.trim()) throw new OrgAgentToolInputError('content is required');
    } else if (change.op === 'update' || change.op === 'delete') {
      positiveInteger(change.ref, 0, 'ref'); positiveInteger(change.revision, 0, 'revision');
      if (!change.ref || !change.revision) throw new OrgAgentToolInputError('ref and revision are required');
      const { data, error } = await (args.admin.from('company_memory_entries' as any) as any).select('scope,team_id,role_id').eq('company_workspace_id', args.workspaceId).eq('id', change.ref).maybeSingle();
      if (error) throw error;
      if (!data) throw new OrgAgentToolInputError('Memory row not found');
      await scopeAccess(args, { scope: data.scope, teamId: data.team_id, roleId: data.role_id }, true);
      if (change.op === 'update' && change.content !== undefined && (typeof change.content !== 'string' || !change.content.trim())) throw new OrgAgentToolInputError('content must be nonempty');
      if (change.scope !== undefined || change.teamId !== undefined || change.roleId !== undefined) throw new OrgAgentToolInputError('Move scope with a new add and delete in the same batch');
    } else throw new OrgAgentToolInputError('Unknown memory operation');
    if (change.label !== undefined && typeof change.label !== 'string') throw new OrgAgentToolInputError('label must be text');
  }
  const { data, error } = await (args.admin.rpc as any)('write_company_memory_v1', { p_workspace: args.workspaceId, p_user: args.user.id, p_operation_id: input.operationId, p_changes: input.changes });
  if (error) throw error;
  return { status: 'saved', operationId: input.operationId, ...object(data) };
}
export function formatCompanyMemory(value: CompanyMemoryRead, preview = false) {
  return [
    `저장된 회사 메모리 ${value.total}행; 이번 조회 ${value.items.length}행. 사실·피드백이며 Hiring Brief를 자동 변경하지 않음.`,
    ...value.items.map(row => `#${row.ref} r${row.revision} · ${row.scope}${row.roleId ? ` role=${row.roleId}` : ''}${row.teamId ? ` team=${row.teamId}` : ''} · ${row.label} · 작성 ${formatLlmDateTime(row.createdAt)}; 수정 ${formatLlmDateTime(row.updatedAt)}\n${preview && row.content.length > 450 ? row.content.slice(0, 450) + '… (미리보기; 원문은 company_memory 조회)' : row.content}`),
    value.nextOffset === null ? '이 조회 범위의 마지막 페이지.' : `다음: get_more_data kinds=[company_memory], memory.offset=${value.nextOffset}.`,
  ].join('\n').replaceAll('<', '‹').replaceAll('>', '›');
}

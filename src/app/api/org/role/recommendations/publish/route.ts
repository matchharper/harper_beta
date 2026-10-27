import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, requireAuthenticatedUser } from '@/lib/server/candidateAccess';
import { assertOrgTeamRoleAccess } from '@/lib/org/teamAccess';
import { assertOrgWorkspacePermission } from '@/lib/org/server';
import { publishRoleRecommendations } from '@/lib/companyFirstSearch/publication/server';
import { OrgHttpError } from '@/lib/org/httpError';

export const maxDuration = 1800;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const input = await req.json();
    const workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId : '';
    const roleId = typeof input.roleId === 'string' ? input.roleId : '';
    const requestId = req.headers.get('idempotency-key') ?? '';
    const admin = getSupabaseAdmin();
    await assertOrgWorkspacePermission({admin,user,workspaceId,permission:'manage_candidates'});
    await assertOrgTeamRoleAccess({admin,user,workspaceId,roleId});
    const result = await publishRoleRecommendations({input,workspaceId,roleId,userId:user.id,requestId});
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof OrgHttpError ? error.status : error instanceof Error && error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({error:error instanceof Error ? error.message : 'Recommendation publication failed'}, {status});
  }
}

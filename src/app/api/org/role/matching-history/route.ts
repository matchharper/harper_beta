import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, requireAuthenticatedUser } from '@/lib/server/candidateAccess';
import { readHiringBriefHistory } from '@/lib/org/hiringBriefHistory.server';

export async function GET(req:NextRequest) {
  try {
    const user=await requireAuthenticatedUser(req), query=req.nextUrl.searchParams;
    const result=await readHiringBriefHistory({admin:getSupabaseAdmin(),user,workspaceId:query.get('workspaceId') ?? '',
      roleId:query.get('roleId') ?? '',historyId:query.get('historyId') ?? undefined,
      offset:query.has('offset') ? Number(query.get('offset')) : undefined,
      limit:query.has('limit') ? Number(query.get('limit')) : undefined});
    return NextResponse.json(query.has('historyId') ? result.items[0] ?? null : result);
  } catch(error) {
    const status=error && typeof error==='object' && 'status' in error ? Number(error.status) : error instanceof Error && error.message==='Unauthorized' ? 401 : 400;
    return NextResponse.json({error:error instanceof Error ? error.message : 'Failed to read Hiring Brief history'},{status});
  }
}

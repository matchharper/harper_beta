import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabaseServer';
import { getTalentSupabaseAdmin } from '@/lib/talentOnboarding/admin';
import { listCareerCompanyFollows, searchCareerCompanies, writeCareerCompanyFollow } from '@/lib/career/companies/server';
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = getTalentSupabaseAdmin(), query = req.nextUrl.searchParams.get('query');
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0);
    return NextResponse.json(query ? await searchCareerCompanies({ admin, query, offset }) : await listCareerCompanyFollows({ admin, userId: user.id, offset }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read company follows' }, { status: 400 }); }
}
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { requestId, conversationId, ...input } = await req.json();
    if (typeof requestId !== 'string' || !requestId) throw new Error('requestId is required.');
    return NextResponse.json({ follow: await writeCareerCompanyFollow({ admin: getTalentSupabaseAdmin(), userId: user.id, conversationId, requestId, input }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save company follow' }, { status: 400 }); }
}

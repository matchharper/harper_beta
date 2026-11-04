import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabaseServer';
import { getTalentSupabaseAdmin } from '@/lib/talentOnboarding/admin';
import { listCareerSchedules, readCareerSchedule, writeCareerSchedule } from '@/lib/career/schedules/server';
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = getTalentSupabaseAdmin(), scheduleId = req.nextUrl.searchParams.get('id');
    const result = scheduleId ? { schedule: await readCareerSchedule({ admin, userId: user.id, scheduleId }) }
      : await listCareerSchedules({ admin, userId: user.id, offset: Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0) });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read schedules' }, { status: 400 }); }
}
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { requestId, conversationId, ...input } = await req.json();
    if (typeof requestId !== 'string' || !requestId) throw new Error('requestId is required.');
    const schedule = await writeCareerSchedule({ admin: getTalentSupabaseAdmin(), userId: user.id, conversationId, requestId, input });
    return NextResponse.json({ schedule });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save schedule' }, { status: 400 }); }
}

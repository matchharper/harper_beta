import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { resourceDb } from "@/lib/career/resources/types";

const input = z.object({
  roleId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  before: z.coerce.number().int().positive().optional(),
}).refine(value => value.roleId || value.opportunityId);
const rows = z.array(z.object({
  conversation_id: z.string().uuid(),
  form_id: z.number().int().positive(),
  revision: z.number().int().positive(),
}));

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid opportunity reference" }, { status: 400 });

  const pageSize = 20;
  const { data, error } = await resourceDb(getTalentSupabaseAdmin()).rpc("list_career_opportunity_reviews_v1", {
    p_user: user.id, p_role: parsed.data.roleId ?? null, p_opportunity: parsed.data.opportunityId ?? null,
    p_before: parsed.data.before ?? null, p_limit: pageSize + 1,
  });
  if (error) return NextResponse.json({ error: "Could not load reviews" }, { status: 503 });
  const found = rows.parse(data);
  return NextResponse.json({
    reviews: found.slice(0, pageSize).map(row => ({
      conversationId: row.conversation_id, formId: row.form_id, revision: row.revision,
    })),
    next: found.length > pageSize ? found[pageSize - 1].form_id : null,
  });
}

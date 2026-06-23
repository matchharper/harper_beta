import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  canUseCareerDevSql,
  executeCareerDevSql,
  generateCareerDevSqlDraft,
  validateCareerDevSql,
} from "@/lib/career/devSql";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNT_SPECS = [
  { table: "talent_conversations", column: "user_id" },
  { table: "talent_messages", column: "user_id" },
  { table: "talent_setting", column: "user_id" },
  { table: "talent_insights", column: "talent_id" },
  { table: "talent_experiences", column: "talent_id" },
  { table: "talent_educations", column: "talent_id" },
  { table: "talent_extras", column: "talent_id" },
  { table: "talent_publications", column: "talent_id" },
  { table: "talent_activity_events", column: "talent_id" },
  { table: "opportunity_discovery_run", column: "talent_id" },
  { table: "talent_opportunity_recommendation", column: "talent_id" },
  { table: "talent_opportunity_delivery", column: "talent_id" },
  { table: "talent_company_recommendation", column: "talent_id" },
  { table: "talent_company_follow", column: "talent_id" },
  { table: "career_email_messages", column: "talent_id" },
  { table: "career_email_onboarding_leads", column: "talent_id" },
  { table: "email_reply_aliases", column: "talent_id" },
  { table: "email_reply_jobs", column: "talent_id" },
] as const;

async function countRows(args: {
  admin: TalentAdminClient;
  column: string;
  table: string;
  userId: string;
}) {
  const { count, error } = await (args.admin.from(args.table as any) as any)
    .select("*", { count: "exact", head: true })
    .eq(args.column, args.userId);

  if (error) throw new Error(error.message ?? `Failed to count ${args.table}`);
  return count ?? 0;
}

async function buildAccountSummary(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const entries = await Promise.all(
    COUNT_SPECS.map(async (spec) => {
      try {
        const count = await countRows({
          admin: args.admin,
          column: spec.column,
          table: spec.table,
          userId: args.userId,
        });
        return `${spec.table}.${spec.column} count: ${count}`;
      } catch (error) {
        return `${spec.table}.${spec.column} count: unavailable (${
          error instanceof Error ? error.message : "unknown error"
        })`;
      }
    })
  );

  return entries.join("\n");
}

async function requireDevSqlAccess(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    } as const;
  }

  if (!canUseCareerDevSql(user)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
    } as const;
  }

  return { response: null, user } as const;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireDevSqlAccess(req);
    if (access.response) return access.response;

    const body = (await req.json().catch(() => ({}))) as {
      request?: string;
    };
    const request = String(body.request ?? "").trim();
    if (!request) {
      return NextResponse.json(
        { error: "요청 내용을 입력해 주세요." },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user: access.user });
    const accountSummary = await buildAccountSummary({
      admin,
      userId: access.user.id,
    });
    const draft = await generateCareerDevSqlDraft({
      accountSummary,
      request,
    });

    return NextResponse.json({ draft, ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SQL 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireDevSqlAccess(req);
    if (access.response) return access.response;

    const body = (await req.json().catch(() => ({}))) as {
      sql?: string;
    };
    const sql = String(body.sql ?? "").trim();
    const validationErrors = validateCareerDevSql(sql);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: validationErrors.join("\n"), validationErrors },
        { status: 400 }
      );
    }

    const result = await executeCareerDevSql({
      sql,
      userId: access.user.id,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SQL 실행에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

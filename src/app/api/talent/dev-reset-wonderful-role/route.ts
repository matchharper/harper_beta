import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { getCareerDevSqlClient } from "@/lib/career/devSql";
import {
  CareerRoleResetConflict,
  resetWonderfulRoleRecommendation,
} from "@/lib/career/devWonderfulRoleReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseCareerDevControls(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // No target account or role is accepted from the request body.
    const result = await getCareerDevSqlClient().begin(async (tx) => {
      await tx`set local statement_timeout = '15s'`;
      await tx`set local lock_timeout = '5s'`;
      return resetWonderfulRoleRecommendation(
        (sql, parameters = []) => tx.unsafe(sql, parameters),
        user.id
      );
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CareerRoleResetConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[CareerDevWonderfulRoleReset] failed", error);
    return NextResponse.json(
      { error: "역할 초기화에 실패했습니다. 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}

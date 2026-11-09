import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { canResetWonderfulFde } from "@/lib/career/devWonderfulFdeResetContract";
import { inspectWonderfulFdeReset, executeWonderfulFdeReset } from "@/lib/career/devWonderfulFdeReset.server";
import { WonderfulFdeResetConflict } from "@/lib/career/devWonderfulFdeReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: NextRequest, execute: boolean) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canResetWonderfulFde(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    if (!execute) return NextResponse.json({ ok: true, preview: await inspectWonderfulFdeReset() });
    const body = await req.json();
    if (body.confirm !== "wonderful-fde-test-reset" || typeof body.fingerprint !== "string") {
      return NextResponse.json({ error: "삭제 대상 확인이 필요합니다." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, deleted: await executeWonderfulFdeReset(body.fingerprint) });
  } catch (error) {
    if (error instanceof WonderfulFdeResetConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[WonderfulFdeTestReset]", error);
    return NextResponse.json({ error: execute
      ? "초기화에 실패했습니다. DB 삭제는 취소됐으며, 이미 취소된 외부 일정·Slack 메시지는 재시도할 때 확인합니다."
      : "삭제 대상 조회에 실패했습니다. 데이터는 변경하지 않았습니다." }, { status: 500 });
  }
}
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);

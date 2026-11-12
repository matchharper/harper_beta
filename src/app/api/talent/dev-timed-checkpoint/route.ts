import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  isTimedCheckpointTime,
  listTimedCareerCheckpoints,
  restoreTimedCareerCheckpoint,
  saveTimedCareerCheckpoint,
} from "@/lib/career/devTimedCheckpoint.server";

export const runtime = "nodejs";

async function authorize(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Local development only" }, { status: 404 });
  }
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await getTalentSupabaseAdmin().auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { id: user.id, email: user.email };
}

function checkpointError(error: unknown, fallback: string) {
  if (error instanceof Error && "code" in error) {
    const code = String(error.code);
    if (code === "ENOENT") return "저장된 시점이 없습니다.";
    if (code === "EEXIST") return "이미 같은 시각의 상태가 저장되어 있습니다.";
    if (["55P03", "40001", "40P01"].includes(code)) {
      return "다른 작업이 데이터를 변경 중입니다. 작업이 끝난 뒤 다시 시도해 주세요.";
    }
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export async function GET(req: NextRequest) {
  const user = await authorize(req);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ times: await listTimedCareerCheckpoints(user) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: checkpointError(error, "저장한 시점을 읽지 못했습니다."),
    }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const user = await authorize(req);
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => null);
  try {
    if (body?.action === "save") {
      return NextResponse.json({ ok: true, time: await saveTimedCareerCheckpoint(user) });
    }
    if (body?.action === "restore" && isTimedCheckpointTime(body.time)) {
      await restoreTimedCareerCheckpoint(user, body.time);
      return NextResponse.json({ ok: true, time: body.time });
    }
    return NextResponse.json({ error: "저장하거나 복원할 시점을 선택해 주세요." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: checkpointError(error, "작업에 실패했습니다. 계정 데이터는 변경되지 않았습니다."),
    }, { status: 409 });
  }
}

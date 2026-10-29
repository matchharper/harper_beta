import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  inspectCareerCheckpoint,
  loadCareerCheckpoint,
  restoreCareerCheckpoint,
} from "@/lib/career/devCheckpoint.server";
import {
  CAREER_CHECKPOINT_EMAIL,
  CAREER_CHECKPOINT_LABEL,
  CAREER_CHECKPOINT_SHA256,
  CAREER_CHECKPOINT_USER_ID,
} from "@/lib/career/devCheckpointContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(req: NextRequest) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json(
      { error: "Local development only" },
      { status: 404 }
    );
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Do not use the general local JWT fallback for a destructive account restore.
  const { data, error } = await getTalentSupabaseAdmin().auth.getUser(token);
  if (error || !data.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    data.user.id !== CAREER_CHECKPOINT_USER_ID ||
    data.user.email?.toLowerCase() !== CAREER_CHECKPOINT_EMAIL
  ) {
    return NextResponse.json(
      { error: "Daniel 계정에서만 사용할 수 있습니다." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  try {
    if (req.nextUrl.searchParams.get("compare") === "1") {
      return NextResponse.json(await inspectCareerCheckpoint(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    await loadCareerCheckpoint();
    return NextResponse.json(
      { available: true, capturedAt: CAREER_CHECKPOINT_LABEL },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        capturedAt: CAREER_CHECKPOINT_LABEL,
        message:
          error instanceof Error && "code" in error && error.code === "ENOENT"
            ? "이 서버에 고정 기준 파일이 없습니다."
            : "고정 기준 데이터를 읽지 못했습니다.",
      },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (body?.checkpoint !== CAREER_CHECKPOINT_SHA256)
    return NextResponse.json(
      { error: "복원 기준이 일치하지 않습니다." },
      { status: 400 }
    );
  try {
    await restoreCareerCheckpoint();
    return NextResponse.json({ ok: true, capturedAt: CAREER_CHECKPOINT_LABEL });
  } catch (error) {
    // No success result until the whole transaction has committed.
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "복원에 실패했습니다. 데이터 변경은 취소됐습니다.",
      },
      { status: 409 }
    );
  }
}

import { inspectApplicationStart, resetApplicationStart } from "@/lib/career/devApplicationStart.server";
import { APPLICATION_TEST_START } from "@/lib/career/devApplicationStart";
import { NextRequest, NextResponse } from "next/server";
import { CONSECUTIVE_APPLICATIONS_CHECKPOINT } from "@/lib/career/devConsecutiveApplicationsCheckpoint";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  inspectApplicationCheckpoint,
  loadApplicationCheckpoint,
  restoreApplicationCheckpoint,
} from "@/lib/career/devApplicationCheckpoint.server";
import {
  APPLICATION_CHECKPOINT_EMAIL,
  APPLICATION_CHECKPOINT_LABEL,
  APPLICATION_CHECKPOINT_SHA256,
  APPLICATION_CHECKPOINT_USER_ID,
} from "@/lib/career/devApplicationCheckpoint";

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
    data.user.id !== APPLICATION_CHECKPOINT_USER_ID ||
    data.user.email?.toLowerCase() !== APPLICATION_CHECKPOINT_EMAIL
  ) {
    return NextResponse.json(
      { error: "지정된 테스트 계정에서만 사용할 수 있습니다." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  const source = req.nextUrl.searchParams.get("fixture") === "consecutive-applications"
    ? CONSECUTIVE_APPLICATIONS_CHECKPOINT : undefined;
  const label = source?.label ?? APPLICATION_CHECKPOINT_LABEL;
  try {
    if (req.nextUrl.searchParams.get("fixture") === "application-start") {
      return NextResponse.json(await inspectApplicationStart(), { headers: { "Cache-Control": "no-store" } });
    }
    if (req.nextUrl.searchParams.get("scenarios") === "1") {
      const { readCareerScenarioRegistry } = await import("@/lib/career/devCareerScenarios.server");
      const registry = await readCareerScenarioRegistry();
      return NextResponse.json({ scenarios: registry.cases.map(({ id, title }) => ({ id, title })), checkpoint: registry.checkpoint });
    }
    if (req.nextUrl.searchParams.get("compare") === "1") {
      return NextResponse.json(await inspectApplicationCheckpoint(source), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    await loadApplicationCheckpoint(source);
    return NextResponse.json(
      { available: true, capturedAt: label },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        capturedAt: label,
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
  const source = req.nextUrl.searchParams.get("fixture") === "consecutive-applications"
    ? CONSECUTIVE_APPLICATIONS_CHECKPOINT : undefined;
  const applicationStart = req.nextUrl.searchParams.get("fixture") === "application-start";
  const expected = applicationStart ? APPLICATION_TEST_START.key : source?.sha256 ?? APPLICATION_CHECKPOINT_SHA256;
  if (body?.checkpoint !== expected)
    return NextResponse.json(
      { error: "복원 기준이 일치하지 않습니다." },
      { status: 400 }
    );
  try {
    const scenarioId = req.nextUrl.searchParams.get("scenario");
    if (scenarioId && (source || applicationStart)) return NextResponse.json({ error: "복원 기준과 별도 시나리오를 함께 사용할 수 없습니다." }, { status: 400 });
    if (applicationStart) {
      return NextResponse.json({ ok: true, ...await resetApplicationStart() });
    }
    if (scenarioId) {
      const { readCareerScenarioRegistry, resetCareerScenario } = await import("@/lib/career/devCareerScenarios.server");
      const registry = await readCareerScenarioRegistry();
      const scenario = registry.cases.find(item => item.id === scenarioId);
      if (!scenario) return NextResponse.json({ error: "Unknown scenario" }, { status: 400 });
      await resetCareerScenario(scenario, registry.checkpoint);
    } else {
      if (source) {
        const { closeCheckpointPreparationBrowsers } = await import("@/lib/career/devCheckpointBrowserCleanup.server");
        await closeCheckpointPreparationBrowsers(await loadApplicationCheckpoint(source));
      }
      await restoreApplicationCheckpoint(source);
    }
    return NextResponse.json({
      ok: true,
      capturedAt: source?.label ?? APPLICATION_CHECKPOINT_LABEL,
    });
  } catch (error) {
    // No success result until restoration and optional scenario setup finish.
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

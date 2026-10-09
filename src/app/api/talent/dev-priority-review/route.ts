import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  canUsePriorityReviewTests,
  isPriorityReviewTestCase,
} from "@/lib/career/priorityReviewTestContract";
import {
  capturePriorityReviewTestInput,
  loadPriorityReviewTestRole,
  priorityReviewTestRoleLabel,
  runPriorityReviewResponseTest,
} from "@/lib/career/priorityReviewTests.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function requireTestUser(req: NextRequest) {
  // Validate with Auth directly: the dev JWT decoding fallback is unsuitable
  // for a route that reads this specific account's profile.
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await getTalentSupabaseAdmin().auth.getUser(token);
  return !error && canUsePriorityReviewTests(data.user?.email)
    ? data.user
    : null;
}

export async function GET(req: NextRequest) {
  const user = await requireTestUser(req);
  if (!user)
    return NextResponse.json(
      { error: "이 계정에서는 우선 검토 테스트를 사용할 수 없습니다." },
      { status: 403 }
    );
  try {
    const role = await loadPriorityReviewTestRole(getTalentSupabaseAdmin());
    return NextResponse.json(
      { role: priorityReviewTestRoleLabel(role) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "테스트 설정을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await requireTestUser(req);
  if (!user)
    return NextResponse.json(
      { error: "이 계정에서는 우선 검토 테스트를 사용할 수 없습니다." },
      { status: 403 }
    );
  const body = await req.json().catch(() => null);
  if (
    !body ||
    !isPriorityReviewTestCase(body.caseId) ||
    typeof body.roleId !== "string" ||
    typeof body.message !== "string" ||
    !body.message.trim() ||
    body.message.length > 1600
  ) {
    return NextResponse.json(
      { error: "테스트 상태, 포지션과 요청 문장을 확인해 주세요." },
      { status: 400 }
    );
  }
  try {
    const fixture = await capturePriorityReviewTestInput({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
      roleId: body.roleId,
    });
    const result = await runPriorityReviewResponseTest({
      fixture,
      caseId: body.caseId,
      message: body.message,
      model: body.model,
    });
    return NextResponse.json(
      { result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "테스트 응답을 생성하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}

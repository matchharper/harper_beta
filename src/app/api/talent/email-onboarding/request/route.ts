import { NextRequest, NextResponse } from "next/server";
import { requestCareerEmailOnboarding } from "@/lib/careerEmailOnboarding/server";

export const runtime = "nodejs";

function toStatus(error: Error) {
  if (error.message === "INVALID_EMAIL") return 400;
  if (error.message.startsWith("RATE_LIMIT_")) return 429;
  return 500;
}

function toMessage(error: Error) {
  if (error.message === "INVALID_EMAIL") {
    return "올바른 이메일 주소를 입력해 주세요.";
  }
  if (error.message.startsWith("RATE_LIMIT_")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await requestCareerEmailOnboarding({
      body,
      origin: req.nextUrl.origin,
      request: req,
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[career-email-onboarding] request failed", {
      error: err.message,
    });
    return NextResponse.json(
      {
        error: toMessage(err),
      },
      { status: toStatus(err) }
    );
  }
}

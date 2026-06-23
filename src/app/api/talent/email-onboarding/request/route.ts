import { NextRequest, NextResponse } from "next/server";
import {
  type CareerEmailOnboardingRequest,
  requestCareerEmailOnboarding,
  resolveCareerEmailOnboardingLocale,
} from "@/lib/careerEmailOnboarding/server";
import { careerT } from "@/lib/career/translatedCareerMessage";
import type { ResolvedLocale } from "@/i18n/localeResolution";

export const runtime = "nodejs";

function toStatus(error: Error) {
  if (error.message === "INVALID_EMAIL") return 400;
  if (error.message.startsWith("RATE_LIMIT_")) return 429;
  return 500;
}

function fallbackByLocale(locale: ResolvedLocale, ko: string, en: string) {
  return locale === "en" ? en : ko;
}

function toMessage(error: Error, locale: ResolvedLocale) {
  if (error.message === "INVALID_EMAIL") {
    return careerT(
      locale,
      "career.email_onboarding.request.invalid_email",
      fallbackByLocale(
        locale,
        "올바른 이메일 주소를 입력해 주세요.",
        "Please enter a valid email address."
      )
    );
  }
  if (error.message.startsWith("RATE_LIMIT_")) {
    return careerT(
      locale,
      "career.common.career_hook_messages.1u6tsv3",
      fallbackByLocale(
        locale,
        "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        "Too many requests. Please try again shortly."
      )
    );
  }
  return careerT(
    locale,
    "career.email_onboarding.request.send_failed",
    fallbackByLocale(
      locale,
      "메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      "Failed to send the email. Please try again shortly."
    )
  );
}

export async function POST(req: NextRequest) {
  let body: Partial<CareerEmailOnboardingRequest> = {};
  try {
    body = await req.json().catch(() => ({}));
    const result = await requestCareerEmailOnboarding({
      body: body as CareerEmailOnboardingRequest,
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
        error: toMessage(err, resolveCareerEmailOnboardingLocale(body)),
      },
      { status: toStatus(err) }
    );
  }
}

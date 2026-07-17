import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getReferralIntroAddresses,
  queueReferralIntroTestEvent,
} from "@/lib/email/inbound";
import { careerT } from "@/lib/career/translatedCareerMessage";

export const runtime = "nodejs";

type Body = {
  body?: string;
  candidateEmail?: string;
  candidateName?: string;
  cc?: string[] | string;
  referrerEmail?: string;
  referrerName?: string;
  referralAddress?: string;
  locale?: string;
  subject?: string;
  to?: string[] | string;
};

function isValidEmail(value: string) {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value.trim());
}

function formatAddress(name: string, email: string) {
  const trimmedName = name.trim();
  return trimmedName ? `${trimmedName} <${email.trim()}>` : email.trim();
}

function asList(value: string[] | string | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

async function authorize(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    return user.email ?? "internal-user";
  } catch (userError) {
    try {
      requireInternalWorkerSecret(req);
      return "internal-worker";
    } catch {
      throw userError;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const createdBy = await authorize(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const referrerEmail = String(body.referrerEmail ?? "").trim();
    const candidateEmail = String(body.candidateEmail ?? "").trim();
    const locale = String(body.locale ?? "").trim() || null;
    if (!isValidEmail(referrerEmail)) {
      return NextResponse.json(
        { error: "A valid referrerEmail is required" },
        { status: 400 }
      );
    }
    if (!isValidEmail(candidateEmail)) {
      return NextResponse.json(
        { error: "A valid candidateEmail is required" },
        { status: 400 }
      );
    }

    const referralAddress =
      String(body.referralAddress ?? "").trim() ||
      getReferralIntroAddresses()[0] ||
      "intro@matchharper.com";
    const candidateLabel =
      String(body.candidateName || candidateEmail).trim() || candidateEmail;
    const subject =
      String(body.subject ?? "").trim() ||
      careerT(
        locale,
        "career.referral.intro_test.subject",
        "소개: {candidateEmail} <> Harper",
        { values: { candidateEmail } }
      );
    const text =
      String(body.body ?? "").trim() ||
      [
        careerT(
          locale,
          "career.referral.intro_test.greeting",
          "{candidateName}님, Harper를 소개드릴게요.",
          { values: { candidateName: candidateLabel } }
        ),
        "",
        careerT(
          locale,
          "career.referral.intro_test.service_description",
          "Harper는 후보자 편에서 커리어 기회를 검토하고 회사 연결을 도와주는 서비스입니다."
        ),
        careerT(
          locale,
          "career.referral.intro_test.reward_disclosure",
          "제가 Harper referral 프로그램을 통해 소개하면, 후보자님이 동의하고 추후 채용까지 이어지는 경우 저에게 보상이 지급될 수 있습니다."
        ),
        "",
        careerT(
          locale,
          "career.referral.intro_test.team_note",
          "Harper team, {candidateName}님께 직접 동의 여부를 확인해주세요.",
          { values: { candidateName: candidateLabel } }
        ),
      ].join("\n");

    const result = await queueReferralIntroTestEvent({
      email: {
        cc: [...asList(body.cc), referralAddress],
        from: formatAddress(String(body.referrerName ?? ""), referrerEmail),
        subject,
        text,
        to: [
          formatAddress(String(body.candidateName ?? ""), candidateEmail),
          ...asList(body.to),
        ],
      },
    });

    return NextResponse.json({
      ok: true,
      createdBy,
      referralAddress,
      ...result,
      nextStep:
        "Run the email worker once: cd harper_worker && PYTHONPATH=. ../myenv/bin/python email_reply_worker.py once",
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to enqueue referral intro test"
    );
  }
}

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendResendEmail } from "@/lib/email/send";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  isValidTalentAccountEmail,
  normalizeTalentAccountEmail,
} from "@/lib/talentOnboarding/accountEmail";
import {
  appendLegalAcceptanceQuery,
  buildPrivacyPolicyAcknowledgement,
} from "@/lib/legal/legalDocumentAcceptance";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import { OFFICIAL_JOBS_ONESCREEN_COOKIE } from "@/lib/officialJobs/oneScreen";
import { checkOfficialJobsOneScreenPosting } from "@/lib/officialJobs/oneScreenEntry.server";
import { buildOfficialJobsOneScreenCodeEmail } from "@/lib/officialJobs/oneScreenCodeEmail";

export const runtime = "nodejs";

/**
 * One row per code mail, written by this route only. The public events route
 * (/api/official-jobs/events) does not accept this type, so the limits below
 * can't be filled up from outside.
 */
const CODE_SENT_EVENT_TYPE = "job_onescreen_code_sent";
const RESEND_AFTER_MS = 60_000;
const DAILY_PER_EMAIL = 5;
const HOURLY_PER_IP = 20;

type Body = {
  email?: unknown;
  slug?: unknown;
  kind?: unknown;
  locale?: unknown;
  /** The one-screen page to return to when the mail's link is used instead of the code. */
  nextPath?: unknown;
  lid?: unknown;
};

function safeNextPath(value: unknown, slug: string) {
  const fallback = `/jobs/${encodeURIComponent(slug)}`;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = new URL(value, "https://next.invalid");
    if (parsed.origin !== "https://next.invalid") return fallback;
    if (!parsed.pathname.startsWith(`/jobs/${encodeURIComponent(slug)}`)) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

/**
 * Sends the one screen's sign-up code: a Harper mail with the code (8 digits on prod) and
 * a link, from Supabase's own one-time code (admin generateLink). The person's
 * introduction waits until they enter the code (or open the link).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const locale = body.locale === "en" ? "en" : "ko";
  const t = (ko: string, en: string) => (locale === "en" ? en : ko);
  const sendFailed = () =>
    NextResponse.json(
      {
        code: "SEND_FAILED",
        error: t(
          "코드를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.",
          "Couldn't send the code. Please try again shortly."
        ),
      },
      { status: 500 }
    );
  const email = normalizeTalentAccountEmail(body.email);
  if (!isValidTalentAccountEmail(email)) {
    return NextResponse.json(
      {
        code: "EMAIL_INVALID",
        error: t("이메일 주소를 확인해 주세요.", "Check the email address."),
      },
      { status: 400 }
    );
  }
  const checked = await checkOfficialJobsOneScreenPosting({
    req,
    slug: body.slug,
    kind: body.kind,
  });
  if (!checked.ok) {
    return NextResponse.json(
      { code: checked.code, error: checked.error },
      { status: checked.status }
    );
  }
  const entry = checked.posting;
  const admin = getTalentSupabaseAdmin();
  const emailHash = createHash("sha256").update(email).digest("hex");

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "";
  const rateLimited = () =>
    NextResponse.json(
      {
        code: "EMAIL_RATE_LIMIT",
        error: t(
          "코드를 방금 보냈어요. 메일함을 확인하거나 잠시 뒤 다시 받아 주세요.",
          "We just sent a code. Check your inbox or try again shortly."
        ),
      },
      { status: 429 }
    );

  // The row is written first and the limits counted after, so parallel
  // requests (a double click, a burst) can't all pass a count of zero.
  const { data: marker, error: markerError } = await admin
    .from("official_job_events")
    .insert({
      event_type: CODE_SENT_EVENT_TYPE,
      job_slug: entry.slug,
      user_email: email,
      ip_address: ip || null,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      metadata: {
        emailHash,
        ip: ip || null,
        kind: entry.kind,
        oneScreenArm: req.cookies.get(OFFICIAL_JOBS_ONESCREEN_COOKIE)?.value ?? null,
      },
    })
    .select("id, created_at")
    .single();
  if (markerError || !marker) {
    console.error("[official-jobs-onescreen] code marker failed", markerError?.message);
    return sendFailed();
  }
  const removeMarker = async () => {
    const { error } = await admin.from("official_job_events").delete().eq("id", marker.id);
    if (error) console.error("[official-jobs-onescreen] code marker cleanup failed", error.message);
  };

  try {
    const earlier = async (key: "emailHash" | "ip", value: string, ms: number) => {
      const { data, error } = await admin
        .from("official_job_events")
        .select("id, created_at")
        .eq("event_type", CODE_SENT_EVENT_TYPE)
        .eq(`metadata->>${key}`, value)
        .gte("created_at", new Date(Date.parse(marker.created_at) - ms).toISOString())
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []).filter((row) => isBefore(row, marker));
    };
    const [daily, ipHourly] = await Promise.all([
      earlier("emailHash", emailHash, 24 * 60 * 60_000),
      ip ? earlier("ip", ip, 60 * 60_000) : Promise.resolve([]),
    ]);
    const recent = daily.some(
      (row) => Date.parse(marker.created_at) - Date.parse(row.created_at) < RESEND_AFTER_MS
    );
    if (recent || daily.length >= DAILY_PER_EMAIL || ipHourly.length >= HOURLY_PER_IP) {
      await removeMarker();
      return rateLimited();
    }

    const callbackUrl = new URL("/auths/callback", req.nextUrl.origin);
    callbackUrl.searchParams.set("flow", "talent_capture");
    callbackUrl.searchParams.set("next", safeNextPath(body.nextPath, entry.slug));
    callbackUrl.searchParams.set("source", OFFICIAL_JOBS_LANDING_SOURCE);
    if (typeof body.lid === "string" && body.lid.trim()) {
      callbackUrl.searchParams.set("lid", body.lid.trim().slice(0, 120));
    }
    appendLegalAcceptanceQuery(callbackUrl, buildPrivacyPolicyAcknowledgement(locale));

    // A new address becomes an unconfirmed account here; it is confirmed only by the code or the link.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: callbackUrl.toString() },
    });
    const code = data?.properties?.email_otp;
    const actionLink = data?.properties?.action_link;
    if (error || !code || !actionLink) {
      throw error ?? new Error("Sign-up code unavailable");
    }
    const mail = buildOfficialJobsOneScreenCodeEmail({
      code,
      actionLink,
      locale,
    });
    await sendResendEmail({
      to: email,
      ...mail,
      idempotencyKey: `official-jobs-onescreen-code-${emailHash.slice(0, 24)}-${Date.now()}`,
    });
    // Whether the address already had an account is not returned: the code
    // checks the same way for both (verifyOtp type "email").
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "[official-jobs-onescreen] code send failed",
      error instanceof Error ? error.message : String(error)
    );
    // Nothing reached the person, so this attempt doesn't count toward the limits.
    await removeMarker();
    return sendFailed();
  }
}

/** Ordered by time, then id: the rows written before this request's own row. */
function isBefore(
  row: { id: string; created_at: string },
  marker: { id: string; created_at: string }
) {
  const left = Date.parse(row.created_at);
  const right = Date.parse(marker.created_at);
  return left < right || (left === right && row.id < marker.id);
}

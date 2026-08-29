import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  appendHarperEmailFooterText,
  renderEmailBodyHtmlWithHarperFooter,
} from "@/lib/email/harperFooter";
import { getDefaultResendFromEmail, sendResendEmail } from "@/lib/email/send";
import { createEmailReplyAlias } from "@/lib/email/inbound";
import { normalizeEmailAddress } from "@/lib/email/parse";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import { resolveTalentPreferredLocale } from "@/lib/talentOnboarding/stateStore";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";

type UntypedAdmin = TalentAdminClient & {
  from: (table: string) => any;
};

type TalentCandidateRow = {
  created_at: string;
  current_location: string | null;
  email: string | null;
  location: string | null;
  name: string | null;
  resume_file_name: string | null;
  resume_links: string[] | null;
  resume_storage_path: string | null;
  resume_text: string | null;
  user_id: string;
};

type TalentSettingRow = {
  is_onboarding_done: boolean | null;
  preferred_locale: string | null;
  setting_locale: string | null;
  user_id: string;
};

const SIGN_UP_FOLLOWUP_MAIL_TYPE = "sign_up_followup";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CANDIDATE_SCAN_MULTIPLIER = 10;
const MAX_CANDIDATE_SCAN = 1000;

function toUntypedAdmin(admin: TalentAdminClient): UntypedAdmin {
  return admin as unknown as UntypedAdmin;
}

function getConfiguredAuthSecrets() {
  return [
    process.env.SIGN_UP_FOLLOWUP_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
    process.env.INTERNAL_WORKER_API_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7).trim();
  if (!provided) return false;

  return getConfiguredAuthSecrets().some((secret) => {
    const expectedBuffer = Buffer.from(secret);
    const actualBuffer = Buffer.from(provided);
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  });
}

function positiveIntParam(req: NextRequest, name: string, fallback: number) {
  const raw = req.nextUrl.searchParams.get(name);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function shouldDryRun(req: NextRequest) {
  const value = req.nextUrl.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

function candidateScanLimit(limit: number) {
  return Math.min(
    Math.max(limit * CANDIDATE_SCAN_MULTIPLIER, limit),
    MAX_CANDIDATE_SCAN
  );
}

function hasProfileMaterial(row: TalentCandidateRow) {
  const hasLinks = Array.isArray(row.resume_links)
    ? row.resume_links.some((link) => String(link ?? "").trim().length > 0)
    : false;
  return Boolean(
    String(row.resume_file_name ?? "").trim() ||
    String(row.resume_storage_path ?? "").trim() ||
    String(row.resume_text ?? "").trim() ||
    hasLinks
  );
}

function appBaseUrl() {
  const value =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "https://matchharper.com";
  return value.replace(/\/+$/, "");
}

function onboardingUrl() {
  return `${appBaseUrl()}/career/onboarding?source=signup_followup_email`;
}

function displayName(row: TalentCandidateRow, locale: "en" | "ko") {
  const name = String(row.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (name) return name;
  return locale === "ko" ? "회원" : "there";
}

function resolveLocale(setting?: TalentSettingRow) {
  return resolveTalentPreferredLocale({
    settingLocale: setting?.setting_locale ?? setting?.preferred_locale,
  });
}

function buildFollowupSubject(locale: "en" | "ko") {
  return locale === "ko"
    ? "Harper 프로필 정보 입력을 이어가실 수 있어요"
    : "Continue your Harper profile setup";
}

function buildFollowupBody(args: {
  locale: "en" | "ko";
  name: string;
  url: string;
}) {
  if (args.locale === "ko") {
    return [
      `안녕하세요 ${args.name}님, 저는 Career agent Harper 입니다.`,
      "",
      "가입해주셔서 감사합니다. 좋은 기회를 연결드리기 위해 관련 정보를 받고 있는데, 아직 프로필 정보 제출 단계까지 진행하지 않으신 것 같아 혹시나 해서 메일을 드립니다.",
      "",
      `아래 링크로 다시 접속해 진행을 이어가주셔도 좋고, **현재 메일로 아래 정보만 알려주셔도 다음 단계로 진행을 도와드릴 수 있습니다!**`,
      "",
      args.url,
      "",
      "- 이름, 현재 위치한 국가/도시",
      "- 링크드인/이력서 중 최소 하나, 그리고 본인을 표현할 수 있는 정보가 담긴 링크들(GitHub, Scholar, 개인 웹사이트 등)",
      "- 현재 열려있는 기회 종류: 풀타임/파트타임",
      "",
      "언제든 편하게 알려주세요. 방해가 되시지 않을 수 있게 추가적인 follow-up 메일은 드리지 않을 예정입니다.",
      "",
      "감사합니다.",
    ].join("\n");
  }

  return [
    `Hi ${args.name}, I'm Harper, your career agent.`,
    "",
    "Thanks for signing up. To connect you with strong-fit opportunities, Harper needs a bit of profile context, but it looks like you have not reached the profile submission step yet.",
    "",
    `You can continue from the link below, or you can simply reply to this email with the details below and I can help move you to the next step.`,
    "",
    args.url,
    "",
    "- Your name and current country/city",
    "- At least one of: LinkedIn or resume/CV, plus any links that help represent your work such as GitHub, Scholar, or a personal website",
    "- Opportunity types you are open to right now: full-time / part-time",
    "",
    "Feel free to reply whenever convenient. I will not send additional follow-up emails so this does not become noise.",
    "",
    "Thank you.",
  ].join("\n");
}

async function loadCandidates(args: {
  admin: UntypedAdmin;
  cutoffIso: string;
  limit: number;
}) {
  const { data, error } = await args.admin
    .from("talent_users")
    .select(
      "user_id, email, name, created_at, location, current_location, resume_file_name, resume_storage_path, resume_text, resume_links"
    )
    .not("email", "is", null)
    .lte("created_at", args.cutoffIso)
    .order("created_at", { ascending: true })
    .limit(candidateScanLimit(args.limit));

  if (error) {
    throw new Error(error.message ?? "Failed to load signup follow-up targets");
  }

  return ((data ?? []) as TalentCandidateRow[])
    .filter((row) => normalizeEmailAddress(row.email))
    .filter((row) => !hasProfileMaterial(row))
    .slice(0, candidateScanLimit(args.limit));
}

async function loadSettings(admin: UntypedAdmin, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, TalentSettingRow>();
  const { data, error } = await admin
    .from("talent_setting")
    .select("user_id, is_onboarding_done, preferred_locale, setting_locale")
    .in("user_id", userIds);
  if (error) {
    throw new Error(error.message ?? "Failed to load talent settings");
  }
  return new Map(
    ((data ?? []) as TalentSettingRow[]).map((row) => [row.user_id, row])
  );
}

async function loadAlreadySent(admin: UntypedAdmin, userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();
  const { data, error } = await admin
    .from("career_email_messages")
    .select("talent_id")
    .eq("direction", "outbound")
    .eq("mail_type", SIGN_UP_FOLLOWUP_MAIL_TYPE)
    .in("talent_id", userIds);
  if (error) {
    throw new Error(error.message ?? "Failed to load sent follow-up emails");
  }
  return new Set(
    ((data ?? []) as Array<{ talent_id: string }>).map((row) => row.talent_id)
  );
}

async function loadProfileSubmitted(admin: UntypedAdmin, userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();
  const { data, error } = await admin
    .from("talent_messages")
    .select("user_id")
    .eq("message_type", "profile_submit")
    .in("user_id", userIds);
  if (error) {
    throw new Error(error.message ?? "Failed to load submitted profile users");
  }
  return new Set(
    ((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)
  );
}

async function hasExistingFollowup(admin: UntypedAdmin, userId: string) {
  const { data, error } = await admin
    .from("career_email_messages")
    .select("id")
    .eq("talent_id", userId)
    .eq("direction", "outbound")
    .eq("mail_type", SIGN_UP_FOLLOWUP_MAIL_TYPE)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to check sent follow-up email");
  }
  return Boolean(data?.id);
}

async function sendFollowup(args: {
  admin: TalentAdminClient;
  row: TalentCandidateRow;
  locale: "en" | "ko";
}) {
  const to = normalizeEmailAddress(args.row.email);
  if (!to) throw new Error("Invalid recipient email");

  const replyAlias = await createEmailReplyAlias({
    admin: args.admin,
    userId: args.row.user_id,
  });
  const subject = buildFollowupSubject(args.locale);
  const body = buildFollowupBody({
    locale: args.locale,
    name: displayName(args.row, args.locale),
    url: onboardingUrl(),
  });
  const text = appendHarperEmailFooterText(body);
  const response = await sendResendEmail({
    headers: {
      "X-Harper-Mail-Type": "signUpFollowupMail",
      "X-Harper-Talent-Id": args.row.user_id,
    },
    html: renderEmailBodyHtmlWithHarperFooter(body),
    idempotencyKey: `sign-up-followup:${args.row.user_id}`,
    replyTo: replyAlias.address,
    subject,
    text,
    to,
  });

  const untyped = toUntypedAdmin(args.admin);
  const now = new Date().toISOString();
  const { error } = await untyped.from("career_email_messages").insert({
    body_text: text,
    direction: "outbound",
    from_email: getDefaultResendFromEmail(),
    mail_type: SIGN_UP_FOLLOWUP_MAIL_TYPE,
    metadata: {
      emailKind: "signUpFollowupMail",
      locale: args.locale,
      replyAlias: replyAlias.address,
      resendEmailId: response.id ?? null,
      source: "signup_followup_route",
      url: onboardingUrl(),
    },
    occurred_at: now,
    status: "sent",
    subject,
    talent_id: args.row.user_id,
    to_email: to,
  });
  if (error) {
    throw new Error(error.message ?? "Failed to record follow-up email");
  }

  return {
    replyAlias: replyAlias.address,
    resendEmailId: response.id ?? null,
    to,
  };
}

async function handleSignupFollowup(req: NextRequest) {
  const secrets = getConfiguredAuthSecrets();
  if (secrets.length === 0) {
    return NextResponse.json(
      {
        error:
          "Missing SIGN_UP_FOLLOWUP_CRON_SECRET, CRON_SECRET, or INTERNAL_WORKER_API_SECRET",
      },
      { status: 500 }
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getTalentSupabaseAdmin();
  const untyped = toUntypedAdmin(admin);
  const limit = positiveIntParam(req, "limit", DEFAULT_LIMIT);
  const dryRun = shouldDryRun(req);
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const candidates = await loadCandidates({
    admin: untyped,
    cutoffIso: cutoff,
    limit,
  });
  const userIds = candidates.map((row) => row.user_id);
  const [settingsByUserId, alreadySent, profileSubmitted] = await Promise.all([
    loadSettings(untyped, userIds),
    loadAlreadySent(untyped, userIds),
    loadProfileSubmitted(untyped, userIds),
  ]);
  const targets = candidates
    .filter((row) => !alreadySent.has(row.user_id))
    .filter((row) => !profileSubmitted.has(row.user_id))
    .filter((row) => !settingsByUserId.get(row.user_id)?.is_onboarding_done)
    .slice(0, limit);

  const summary = {
    checked: candidates.length,
    dryRun,
    errors: [] as Array<{ error: string; userId: string }>,
    sent: 0,
    skippedDuplicate: 0,
    skippedProfileSubmitted: candidates.filter((row) =>
      profileSubmitted.has(row.user_id)
    ).length,
    targets: targets.length,
  };
  const results: Array<Record<string, unknown>> = [];

  for (const row of targets) {
    const locale = resolveLocale(settingsByUserId.get(row.user_id));
    if (dryRun) {
      results.push({
        email: normalizeEmailAddress(row.email),
        locale,
        name: row.name,
        userId: row.user_id,
      });
      continue;
    }

    try {
      if (await hasExistingFollowup(untyped, row.user_id)) {
        summary.skippedDuplicate += 1;
        continue;
      }
      const result = await sendFollowup({ admin, locale, row });
      summary.sent += 1;
      results.push({ ...result, locale, userId: row.user_id });
    } catch (error) {
      summary.errors.push({
        error: error instanceof Error ? error.message : String(error),
        userId: row.user_id,
      });
    }
  }

  return NextResponse.json({
    cutoff,
    ok: summary.errors.length === 0,
    results,
    summary,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handleSignupFollowup(req);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send signup follow-up emails",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

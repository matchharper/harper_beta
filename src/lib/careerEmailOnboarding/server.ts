import crypto from "crypto";
import { v5 as uuidv5 } from "uuid";
import { createEmailReplyAlias } from "@/lib/email/inbound";
import { sendResendEmail } from "@/lib/email/send";
import {
  CAREER_EMAIL_ONBOARDING_ABTEST_TYPE,
  CAREER_EMAIL_ONBOARDING_DEFAULT_SOURCE,
  CAREER_EMAIL_ONBOARDING_TOKEN_PARAM,
  CAREER_EMAIL_ONBOARDING_VARIANT,
} from "@/lib/careerEmailOnboarding/constants";
import { buildCareerEmailOnboardingToken } from "@/lib/careerEmailOnboarding/token";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";
import { withIsMobile } from "@/lib/requestDevice";
import {
  normalizeLocale,
  resolveLocaleFromCountryLang,
  type ResolvedLocale,
} from "@/i18n/localeResolution";

const CAREER_EMAIL_ONBOARDING_NAMESPACE =
  "7c73b4d7-9fef-4f41-a7ff-e8d90db79749";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UntypedAdmin = TalentAdminClient & {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type CareerEmailOnboardingRequest = {
  abtestType?: string | null;
  countryLang?: string | null;
  email: string;
  forceResend?: boolean | null;
  isMobile?: boolean | null;
  localId?: string | null;
  locale?: string | null;
  pagePath?: string | null;
  source?: string | null;
  variant?: string | null;
};

function toUntypedAdmin(admin: TalentAdminClient): UntypedAdmin {
  return admin as unknown as UntypedAdmin;
}

export function normalizeCareerEmail(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : "";
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

export function resolveCareerEmailOnboardingLocale(
  body: Partial<CareerEmailOnboardingRequest> | null | undefined
): ResolvedLocale {
  return (
    normalizeLocale(body?.locale) ??
    resolveLocaleFromCountryLang(body?.countryLang)
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function withLocaleMetadata(value: unknown, locale: ResolvedLocale) {
  const metadata = toRecord(value);
  const settings = toRecord(metadata.settings);

  return {
    ...metadata,
    locale,
    preferred_locale: locale,
    settings: {
      ...settings,
      preferred_locale: locale,
    },
  };
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key value violates unique constraint/i.test(error.message ?? "")
  );
}

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const cleaned = localPart
    .replace(/[._+-]+/g, " ")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 32) return null;
  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${htmlEscape(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function htmlLink(label: string, url: string) {
  return `<a href="${htmlEscape(url)}" target="_blank" rel="noreferrer" style="color:#2563eb;text-decoration:underline;">${htmlEscape(label)}</a>`;
}

const CONTINUE_LINK_LABEL = {
  en: "Continue here",
  ko: "여기서 이어가기",
} as const;

const LOGIN_LINK_LABEL = {
  en: "Open Harper",
  ko: "Harper로 접속하기",
} as const;

function getBaseUrl(origin?: string | null) {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    origin ||
    "https://matchharper.com"
  ).replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

function getStoredCareerEmailFrom() {
  return (
    process.env.EMAIL_REPLY_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Harper <hello@matchharper.com>"
  );
}

function isLocalOrigin(origin?: string | null) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function shouldForceResend(args: {
  body: CareerEmailOnboardingRequest;
  origin?: string | null;
}) {
  if (args.body.forceResend !== true) return false;
  return process.env.NODE_ENV !== "production" || isLocalOrigin(args.origin);
}

export function hashCareerEmailForLogs(email: string) {
  const secret =
    process.env.TALENT_NETWORK_INVITE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "career-email-onboarding";
  return crypto.createHmac("sha256", secret).update(email).digest("hex");
}

function buildLoginUrl(args: {
  abtestType?: string | null;
  baseUrl: string;
  email: string;
  leadId: string;
  localId?: string | null;
}) {
  const token = buildCareerEmailOnboardingToken({
    email: args.email,
    leadId: args.leadId,
    purpose: "login",
  });
  const url = new URL("/career_login", args.baseUrl);
  url.searchParams.set("next", "/career");
  url.searchParams.set("source", "email_onboarding");
  if (args.localId) url.searchParams.set("lid", args.localId);
  if (args.abtestType) url.searchParams.set("ab", args.abtestType);
  url.searchParams.set(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM, token);
  return url.toString();
}

function buildExistingUserLoginUrl(args: {
  abtestType?: string | null;
  baseUrl: string;
  localId?: string | null;
}) {
  const url = new URL("/career_login", args.baseUrl);
  url.searchParams.set("next", "/career");
  url.searchParams.set("source", "email_onboarding_existing_user");
  if (args.localId) url.searchParams.set("lid", args.localId);
  if (args.abtestType) url.searchParams.set("ab", args.abtestType);
  return url.toString();
}

function buildContinueLoginUrl(args: {
  abtestType?: string | null;
  baseUrl: string;
  email: string;
  leadId: string;
  localId?: string | null;
}) {
  const token = buildCareerEmailOnboardingToken({
    email: args.email,
    leadId: args.leadId,
    purpose: "login",
  });
  const nextUrl = new URL("/career/email-onboarding", args.baseUrl);
  nextUrl.searchParams.set("source", "email_onboarding_review");
  if (args.localId) nextUrl.searchParams.set("lid", args.localId);
  if (args.abtestType) nextUrl.searchParams.set("ab", args.abtestType);
  nextUrl.searchParams.set(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM, token);

  const url = new URL("/career_login", args.baseUrl);
  url.searchParams.set("next", `${nextUrl.pathname}${nextUrl.search}`);
  url.searchParams.set("source", "email_onboarding_review");
  if (args.localId) url.searchParams.set("lid", args.localId);
  if (args.abtestType) url.searchParams.set("ab", args.abtestType);
  url.searchParams.set(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM, token);
  return url.toString();
}

function getTalentIdForLead(leadId: string) {
  return uuidv5(
    `career_email_onboarding:${leadId}`,
    CAREER_EMAIL_ONBOARDING_NAMESPACE
  );
}

async function recordEvent(
  admin: UntypedAdmin,
  args: {
    emailHash?: string | null;
    eventType: string;
    leadId?: string | null;
    localId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await (admin as any)
    .from("career_email_onboarding_events")
    .insert({
      event_type: args.eventType,
      lead_id: args.leadId ?? null,
      local_id: args.localId ?? null,
      metadata: args.metadata ?? {},
      normalized_email_hash: args.emailHash ?? null,
    });
  if (error) {
    console.error("[career-email-onboarding] event insert failed", error);
  }
}

async function assertRateLimit(
  admin: UntypedAdmin,
  args: {
    emailHash: string;
    ip: string;
  }
) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { count: recentEmailCount, error: recentEmailError } = await admin
    .from("career_email_onboarding_events")
    .select("id", { count: "exact", head: true })
    .eq("normalized_email_hash", args.emailHash)
    .eq("event_type", "request_received")
    .gte("created_at", tenMinutesAgo);
  if (recentEmailError) throw new Error(recentEmailError.message);
  if ((recentEmailCount ?? 0) >= 1) {
    throw new Error("RATE_LIMIT_EMAIL_RECENT");
  }

  const { count: dayEmailCount, error: dayEmailError } = await admin
    .from("career_email_onboarding_events")
    .select("id", { count: "exact", head: true })
    .eq("normalized_email_hash", args.emailHash)
    .eq("event_type", "request_received")
    .gte("created_at", dayAgo);
  if (dayEmailError) throw new Error(dayEmailError.message);
  if ((dayEmailCount ?? 0) >= 3) {
    throw new Error("RATE_LIMIT_EMAIL_DAILY");
  }

  const { count: recentIpCount, error: recentIpError } = await admin
    .from("career_email_onboarding_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "request_received")
    .eq("metadata->>ip", args.ip)
    .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
  if (recentIpError) throw new Error(recentIpError.message);
  if ((recentIpCount ?? 0) >= 20) {
    throw new Error("RATE_LIMIT_IP");
  }
}

async function findDisplayName(admin: UntypedAdmin, email: string) {
  const { data: existingTalent } = await admin
    .from("talent_users")
    .select("name")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  const existingName = normalizeText(existingTalent?.name, 80);
  if (existingName) return existingName;

  const { data: existingWaitlist } = await admin
    .from("harper_waitlist")
    .select("name")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const waitlistName = normalizeText(existingWaitlist?.name, 80);
  return waitlistName || displayNameFromEmail(email);
}

async function ensureLeadBase(args: {
  admin: UntypedAdmin;
  body: CareerEmailOnboardingRequest;
  displayName: string | null;
  email: string;
}) {
  const now = new Date().toISOString();
  const locale = resolveCareerEmailOnboardingLocale(args.body);
  const { data: existing, error: existingError } = await args.admin
    .from("career_email_onboarding_leads")
    .select("*")
    .eq("normalized_email", args.email)
    .maybeSingle();
  if (existingError) {
    throw new Error(
      existingError.message ?? "Failed to read email onboarding lead"
    );
  }

  if (existing?.id) {
    const { data, error } = await args.admin
      .from("career_email_onboarding_leads")
      .update({
        abtest_type:
          normalizeText(args.body.abtestType, 100) ||
          existing.abtest_type ||
          CAREER_EMAIL_ONBOARDING_ABTEST_TYPE,
        country_lang:
          normalizeText(args.body.countryLang, 40) ||
          existing.country_lang ||
          null,
        display_name: args.displayName || existing.display_name || null,
        is_mobile:
          typeof args.body.isMobile === "boolean"
            ? args.body.isMobile
            : existing.is_mobile,
        local_id:
          normalizeText(args.body.localId, 200) || existing.local_id || null,
        page_path:
          normalizeText(args.body.pagePath, 500) || existing.page_path || null,
        metadata: withLocaleMetadata(existing.metadata, locale),
        source:
          normalizeText(args.body.source, 80) ||
          existing.source ||
          CAREER_EMAIL_ONBOARDING_DEFAULT_SOURCE,
        updated_at: now,
        variant:
          normalizeText(args.body.variant, 100) ||
          existing.variant ||
          CAREER_EMAIL_ONBOARDING_VARIANT,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data?.id) {
      throw new Error(
        error?.message ?? "Failed to update email onboarding lead"
      );
    }
    return data as Record<string, any>;
  }

  const { data, error } = await args.admin
    .from("career_email_onboarding_leads")
    .insert({
      abtest_type:
        normalizeText(args.body.abtestType, 100) ||
        CAREER_EMAIL_ONBOARDING_ABTEST_TYPE,
      country_lang: normalizeText(args.body.countryLang, 40) || null,
      display_name: args.displayName,
      email: args.email,
      is_mobile:
        typeof args.body.isMobile === "boolean" ? args.body.isMobile : null,
      local_id: normalizeText(args.body.localId, 200) || null,
      metadata: withLocaleMetadata(null, locale),
      normalized_email: args.email,
      page_path: normalizeText(args.body.pagePath, 500) || null,
      source:
        normalizeText(args.body.source, 80) ||
        CAREER_EMAIL_ONBOARDING_DEFAULT_SOURCE,
      status: "active",
      step: "created",
      updated_at: now,
      variant:
        normalizeText(args.body.variant, 100) ||
        CAREER_EMAIL_ONBOARDING_VARIANT,
    })
    .select("*")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return ensureLeadBase(args);
    }
    throw new Error(error.message ?? "Failed to create email onboarding lead");
  }
  if (!data?.id) {
    throw new Error("Failed to create email onboarding lead");
  }

  return data as Record<string, any>;
}

async function ensureTalentAndConversation(args: {
  admin: UntypedAdmin;
  displayName: string | null;
  email: string;
  lead: Record<string, any>;
  locale: ResolvedLocale;
}) {
  const now = new Date().toISOString();
  const talentId = String(
    args.lead.talent_id || getTalentIdForLead(args.lead.id)
  );

  const { error: talentError } = await args.admin.from("talent_users").upsert(
    {
      email: args.email,
      name: args.displayName,
      updated_at: now,
      user_id: talentId,
    },
    { onConflict: "user_id" }
  );
  if (talentError) {
    throw new Error(talentError.message ?? "Failed to create temp talent user");
  }
  await upsertTalentSetting({
    admin: args.admin,
    preferredLocale: args.locale,
    preferProvidedLocale: true,
    userId: talentId,
  });

  let conversationId = String(args.lead.conversation_id || "");
  if (!conversationId) {
    const { data: conversation, error: conversationError } = await args.admin
      .from("talent_conversations")
      .insert({
        relief_nudge_sent: false,
        stage: "chat",
        user_id: talentId,
      })
      .select("id")
      .single();
    if (conversationError || !conversation?.id) {
      throw new Error(
        conversationError?.message ??
          "Failed to create email onboarding conversation"
      );
    }
    conversationId = String(conversation.id);
  }

  return { conversationId, talentId };
}

async function findRegisteredTalentUserByEmail(
  admin: UntypedAdmin,
  email: string
) {
  const { data: lead, error: leadError } = await admin
    .from("career_email_onboarding_leads")
    .select("converted_user_id, status, talent_id")
    .eq("normalized_email", email)
    .maybeSingle();
  if (leadError) {
    throw new Error(
      leadError.message ?? "Failed to read email onboarding lead"
    );
  }

  const { data: users, error: usersError } = await admin
    .from("talent_users")
    .select("user_id, name")
    .ilike("email", email)
    .limit(10);
  if (usersError) {
    throw new Error(usersError.message ?? "Failed to read talent users");
  }

  const tempTalentId =
    lead && !lead.converted_user_id && lead.status !== "converted"
      ? String(lead.talent_id ?? "").trim()
      : "";
  const convertedUserId = String(lead?.converted_user_id ?? "").trim();
  const matched = (users ?? []).find(
    (user: { name?: unknown; user_id?: unknown }) => {
      const userId = String(user.user_id ?? "").trim();
      if (!userId) return false;
      if (convertedUserId && userId === convertedUserId) return true;
      if (tempTalentId && userId === tempTalentId) return false;
      return true;
    }
  );

  if (!matched?.user_id) return null;
  return {
    name: normalizeText(matched.name, 80) || null,
    userId: String(matched.user_id),
  };
}

function buildFirstEmail(args: {
  displayName: string | null;
  locale: ResolvedLocale;
  loginUrl: string;
}) {
  if (args.locale === "en") {
    const subject = "A quick hello from Harper";
    const coreText = `Hi, thanks for sharing your email.

I'm Harper, an AI career agent that helps talent think through their career, finds good opportunities, and makes direct introductions when there is a fit. I do not only look at public job posts; I use your background and preferences to connect you with relevant opportunities.

Getting started is simple. Reply to this email with the details below so I can understand you better. After that, let's have a light 5-minute call or chat about what you prefer and what kinds of opportunities you would like me to connect you with.

Could you share these first?

- Name
- Current location
- What types of opportunities you are open to (full-time, part-time, short-term paid work, advisory, etc.)
- Resume or LinkedIn: one is required, and both are best if available
- (optional) Any other links that can explain your background, such as GitHub, Scholar, personal website, portfolio, etc.

Feel free to reply whenever convenient.

Best,

Harper`;
    const text = `${coreText}

If replying by email is inconvenient, you can continue here.
matchharper.com/career_login`;
    const html = `${textToHtml(coreText)}<br /><p>If replying by email is inconvenient, you can continue here.<br />${htmlLink(CONTINUE_LINK_LABEL.en, args.loginUrl)}</p>`;

    return {
      subject,
      text,
      html,
    };
  }

  const subject = "Harper에서 먼저 인사드려요";
  const coreText = `안녕하세요. 이메일을 알려주셔서 감사합니다.

저에 대해 간단하게 소개드리면, 저는 인재분들의 커리어를 함께 고민하고, 좋은 기회를 알아서 찾아와 연결해드리는 AI Agent Harper입니다. 공개 채용으로 올라온 역할뿐 아니라, 회원님의 배경과 선호에 맞는 기회를 직접 연결까지 도와드려요.

시작 방법은 간단해요. 현재 메일로 아래의 내용을 답장으로 알려주시면 제가 회원님에 대해서 이해도를 높일게요. 그 다음 간단하게 어떤걸 선호하시는지, 제가 어떤 기회를 연결해드리는걸 원하시는지 5분 동안 가볍게 대화 나눠봐요.

우선 이것들을 알려주실 수 있나요?

- 이름
- 현재 계신 지역
- 어떤 기회에 열려있으신지 (풀타임, 파트타임, 추가 수입을 위한 단기 작업 등)
- 이력서 혹은 링크드인 : 둘 중 하나 필수, 둘다 보내주시면 제일 좋습니다.
- (optional) 추가적으로 본인을 설명할 수 있는 링크들(GitHub, Scholar, 개인 웹사이트, 포트폴리오 등)

언제든 편하게 답장주셔도 좋습니다.


감사합니다.
Harper 드림`;
  const text = `${coreText}

혹시 메일 답장이 힘드시다면 여기 접속하셔서 이어나가셔도 좋아요.
matchharper.com/career_login`;
  const html = `${textToHtml(coreText)}<br /><p>혹시 메일 답장이 힘드시다면 여기 접속하셔서 이어나가셔도 좋아요.<br />${htmlLink(CONTINUE_LINK_LABEL.ko, args.loginUrl)}</p>`;

  return {
    subject,
    text,
    html,
  };
}

function buildExistingUserEmail(args: {
  displayName: string | null;
  locale: ResolvedLocale;
  loginUrl: string;
}) {
  if (args.locale === "en") {
    const name = args.displayName ? ` ${args.displayName}` : "";
    const subject = "[Harper] I found your account. You can continue here.";
    const text = `Hi${name},

Thanks for leaving your email. It looks like you are already with Harper.

You can use Harper by opening the link below. If you have any questions, feel free to reply.
I will keep working to connect you with better opportunities.

matchharper.com/career

Best,

Harper`;
    const html = textToHtml(text).replace(
      htmlEscape("matchharper.com/career"),
      htmlLink(LOGIN_LINK_LABEL.en, args.loginUrl)
    );
    return { html, subject, text };
  }

  const name = args.displayName ? ` ${args.displayName}님` : "";
  const subject =
    "[Harper] 이메일 확인했어요. 이미 Harper와 함께하고 계신걸로 확인됩니다.";
  const text = `안녕하세요${name}.

이메일을 남겨주셔서 감사합니다. 하지만 이미 Harper와 함께하고 계신걸로 확인됩니다.

하지만 아래 링크로 접속하시면 사용하실 수 있어요. 혹시 궁금한 사항이 있으시다면 편하게 물어봐주세요.
항상 더 좋은 기회를 연결해드리기 위해서 노력할게요.

matchharper.com/career

감사합니다.

Harper 드림`;
  const html = textToHtml(text).replace(
    htmlEscape("matchharper.com/career"),
    htmlLink(LOGIN_LINK_LABEL.ko, args.loginUrl)
  );
  return { html, subject, text };
}

export async function requestCareerEmailOnboarding(args: {
  body: CareerEmailOnboardingRequest;
  origin?: string | null;
  request: Request;
}) {
  const email = normalizeCareerEmail(args.body.email);
  if (!email) {
    throw new Error("INVALID_EMAIL");
  }

  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const locale = resolveCareerEmailOnboardingLocale(args.body);
  const ip = getClientIp(args.request);
  const emailHash = hashCareerEmailForLogs(email);
  const forceResend = shouldForceResend(args);
  const requestId = crypto.randomUUID();

  const registeredTalent = await findRegisteredTalentUserByEmail(admin, email);
  if (registeredTalent) {
    await assertRateLimit(admin, { emailHash, ip });

    const baseUrl = getBaseUrl(args.origin);
    const loginUrl = buildExistingUserLoginUrl({
      abtestType: normalizeText(args.body.abtestType, 100),
      baseUrl,
      localId: normalizeText(args.body.localId, 200),
    });
    const existingUserEmail = buildExistingUserEmail({
      displayName: registeredTalent.name,
      locale,
      loginUrl,
    });
    const sendResult = await sendResendEmail({
      to: email,
      subject: existingUserEmail.subject,
      text: existingUserEmail.text,
      html: existingUserEmail.html,
      idempotencyKey: forceResend
        ? `career-email-onboarding/existing-user/${emailHash}/local/${Date.now()}`
        : `career-email-onboarding/existing-user/${emailHash}/${new Date()
            .toISOString()
            .slice(0, 10)}`,
    });
    const sentAt = new Date().toISOString();

    await recordEvent(admin, {
      emailHash,
      eventType: "request_received",
      localId: args.body.localId,
      metadata: {
        existingUser: true,
        ip,
        locale,
        pagePath: args.body.pagePath ?? null,
        source: args.body.source ?? null,
        variant: args.body.variant ?? null,
      },
    });
    await recordEvent(admin, {
      emailHash,
      eventType: "existing_user_mail_sent",
      localId: args.body.localId,
      metadata: {
        locale,
        loginUrl,
        resendEmailId: sendResult.id ?? null,
        userId: registeredTalent.userId,
      },
    });

    const { error: historyError } = await (admin as any)
      .from("career_email_messages")
      .insert({
        body_text: existingUserEmail.text,
        created_at: sentAt,
        direction: "outbound",
        from_email: getStoredCareerEmailFrom(),
        mail_type: "existing_user_login",
        metadata: {
          locale,
          loginUrl,
          resendEmailId: sendResult.id ?? null,
        },
        occurred_at: sentAt,
        status: "sent",
        subject: existingUserEmail.subject,
        talent_id: registeredTalent.userId,
        talent_message_id: null,
        to_email: email,
      });
    if (historyError) {
      console.warn(
        "[career-email-onboarding] existing user email history insert skipped",
        {
          error: historyError.message,
          userId: registeredTalent.userId,
        }
      );
    }

    return {
      alreadyRegistered: true,
      alreadySent: false,
      ok: true,
      userId: registeredTalent.userId,
    };
  }

  await assertRateLimit(admin, { emailHash, ip });

  const displayName = await findDisplayName(admin, email);
  const lead = await ensureLeadBase({
    admin,
    body: args.body,
    displayName,
    email,
  });
  const isRepeatRequest = Boolean(lead.first_email_sent_at && lead.reply_alias);
  const nextStep = isRepeatRequest
    ? normalizeText(lead.step, 80) || "awaiting_start"
    : "awaiting_start";

  const { conversationId, talentId } = await ensureTalentAndConversation({
    admin,
    displayName,
    email,
    lead,
    locale,
  });
  const alias = lead.reply_alias
    ? { address: String(lead.reply_alias) }
    : await createEmailReplyAlias({
        admin,
        conversationId,
        userId: talentId,
      });

  const baseUrl = getBaseUrl(args.origin);
  const loginUrl = buildLoginUrl({
    abtestType: normalizeText(lead.abtest_type, 100),
    baseUrl,
    email,
    leadId: String(lead.id),
    localId: normalizeText(lead.local_id, 200),
  });
  const continueUrl = buildContinueLoginUrl({
    abtestType: normalizeText(lead.abtest_type, 100),
    baseUrl,
    email,
    leadId: String(lead.id),
    localId: normalizeText(lead.local_id, 200),
  });
  const firstEmail = buildFirstEmail({ displayName, locale, loginUrl });
  const sendResult = await sendResendEmail({
    to: email,
    subject: firstEmail.subject,
    text: firstEmail.text,
    html: firstEmail.html,
    replyTo: alias.address,
    idempotencyKey: `career-email-onboarding/lead/${lead.id}/mail1/${requestId}`,
  });
  const firstEmailSentAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("career_email_onboarding_leads")
    .update({
      calendar_url: continueUrl,
      conversation_id: conversationId,
      first_email_resend_id: sendResult.id ?? null,
      first_email_sent_at: firstEmailSentAt,
      metadata: {
        ...(lead.metadata && typeof lead.metadata === "object"
          ? lead.metadata
          : {}),
        locale,
        continueUrl,
        loginUrl,
        preferred_locale: locale,
      },
      reply_alias: alias.address,
      status: "active",
      step: nextStep,
      talent_id: talentId,
    })
    .eq("id", lead.id);
  if (updateError) {
    throw new Error(
      updateError.message ?? "Failed to update email onboarding lead"
    );
  }

  await recordEvent(admin, {
    emailHash,
    eventType: "request_received",
    leadId: lead.id,
    localId: args.body.localId,
    metadata: {
      ip,
      forceResend,
      isRepeatRequest,
      locale,
      pagePath: args.body.pagePath ?? null,
      requestId,
      source: args.body.source ?? null,
      variant: args.body.variant ?? null,
    },
  });

  const { data: firstEmailMessage } = await admin
    .from("talent_messages")
    .insert(
      withIsMobile(
        {
          content: firstEmail.text,
          conversation_id: conversationId,
          message_type: "email_onboarding",
          role: "assistant",
          user_id: talentId,
        },
        args.body.isMobile
      )
    )
    .select("id")
    .single();

  const { error: historyError } = await (admin as any)
    .from("career_email_messages")
    .insert({
      body_text: firstEmail.text,
      created_at: firstEmailSentAt,
      direction: "outbound",
      from_email: getStoredCareerEmailFrom(),
      mail_type: "onboarding",
      metadata: {
        locale,
        replyTo: alias.address,
        requestId,
        resendEmailId: sendResult.id ?? null,
        repeatRequest: isRepeatRequest,
      },
      occurred_at: firstEmailSentAt,
      status: "sent",
      subject: firstEmail.subject,
      talent_id: talentId,
      talent_message_id: firstEmailMessage?.id ?? null,
      to_email: email,
    });
  if (historyError) {
    console.warn("[career-email-onboarding] email history insert skipped", {
      error: historyError.message,
      leadId: String(lead.id),
    });
  }

  await recordEvent(admin, {
    emailHash,
    eventType: "mail1_sent",
    leadId: lead.id,
    localId: args.body.localId,
    metadata: {
      locale,
      repeatRequest: isRepeatRequest,
      requestId,
      resendEmailId: sendResult.id ?? null,
    },
  });

  return {
    alreadySent: false,
    leadId: String(lead.id),
    ok: true,
  };
}

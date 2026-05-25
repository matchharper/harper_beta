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
} from "@/lib/talentOnboarding/server";

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
  return `<a href="${htmlEscape(url)}" target="_blank" rel="noreferrer" style="color:#4d2f13;text-decoration:underline;">${htmlEscape(label)}</a>`;
}

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
  baseUrl: string;
  email: string;
  leadId: string;
}) {
  const token = buildCareerEmailOnboardingToken({
    email: args.email,
    leadId: args.leadId,
    purpose: "login",
  });
  const url = new URL("/career_login", args.baseUrl);
  url.searchParams.set("next", "/career");
  url.searchParams.set("source", "email_onboarding");
  url.searchParams.set("mail", args.email);
  url.searchParams.set(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM, token);
  return url.toString();
}

function buildCallStartLoginUrl(args: {
  baseUrl: string;
  email: string;
  leadId: string;
}) {
  const token = buildCareerEmailOnboardingToken({
    email: args.email,
    leadId: args.leadId,
    purpose: "login",
  });
  const url = new URL("/career_login", args.baseUrl);
  url.searchParams.set("next", "/career/onboarding?start=call");
  url.searchParams.set("source", "email_onboarding_call");
  url.searchParams.set("mail", args.email);
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

function buildFirstEmail(args: {
  displayName: string | null;
  loginUrl: string;
}) {
  const name = args.displayName?.trim();
  const greeting = name
    ? `안녕하세요, ${name}님. Harper입니다.`
    : "안녕하세요. Harper입니다.";
  const subject = name
    ? `From Harper to ${name}`
    : "Harper에서 먼저 인사드려요";
  const coreText = `${greeting}

이메일 남겨주셔서 감사해요. 긴 가입 폼부터 채우는 대신, 오늘은 메일로 가볍게 시작해볼게요 :)

앞으로 좋은 기회를 찾고, 준비하고, 실제로 연결되는 과정까지 제가 옆에서 챙겨보겠습니다.

괜찮으시면 이 메일에 "좋아요"라고만 답장 주세요. 혹시 지금 찾고 있거나 열어두고 있는 방향이 있다면 한 줄만 덧붙여주셔도 좋아요. 예를 들면 풀타임 합류, 현업과 병행할 파트타임/프로젝트, 가벼운 기술 자문 같은 것들이요.

아직 잘 모르겠으면 그냥 "좋아요"만 보내셔도 됩니다. 바로 이어서 필요한 자료와 회사에 소개드릴 때의 편한 방식을 여쭤볼게요.`;
  const text = `${coreText}

웹에서 바로 이어가고 싶으시면 아래 링크로 들어오시면 됩니다.
사이트에서 계속하기: ${args.loginUrl}`;
  const html = `${textToHtml(coreText)}<br /><p>${htmlLink("사이트에서 계속하기", args.loginUrl)}</p>`;

  return {
    subject,
    text,
    html,
  };
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
  const ip = getClientIp(args.request);
  const emailHash = hashCareerEmailForLogs(email);
  const forceResend = shouldForceResend(args);

  const { data: existingSentLead } = await admin
    .from("career_email_onboarding_leads")
    .select("id, first_email_sent_at, reply_alias")
    .eq("normalized_email", email)
    .maybeSingle();
  if (
    !forceResend &&
    existingSentLead?.first_email_sent_at &&
    existingSentLead.reply_alias
  ) {
    return {
      alreadySent: true,
      leadId: String(existingSentLead.id),
      ok: true,
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
  if (!forceResend && lead.first_email_sent_at && lead.reply_alias) {
    return {
      alreadySent: true,
      leadId: String(lead.id),
      ok: true,
    };
  }

  const { conversationId, talentId } = await ensureTalentAndConversation({
    admin,
    displayName,
    email,
    lead,
  });
  const alias = lead.reply_alias
    ? { address: String(lead.reply_alias) }
    : await createEmailReplyAlias({
        admin,
        conversationId,
        userId: talentId,
      });

  const baseUrl = getBaseUrl(args.origin);
  const loginUrl = buildLoginUrl({ baseUrl, email, leadId: String(lead.id) });
  const callStartUrl = buildCallStartLoginUrl({
    baseUrl,
    email,
    leadId: String(lead.id),
  });
  const firstEmail = buildFirstEmail({ displayName, loginUrl });
  const sendResult = await sendResendEmail({
    to: email,
    subject: firstEmail.subject,
    text: firstEmail.text,
    html: firstEmail.html,
    replyTo: alias.address,
    idempotencyKey: forceResend
      ? `career-email-onboarding/lead/${lead.id}/mail1/local/${Date.now()}`
      : `career-email-onboarding/lead/${lead.id}/mail1`,
  });
  const firstEmailSentAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("career_email_onboarding_leads")
    .update({
      calendar_url: callStartUrl,
      conversation_id: conversationId,
      first_email_resend_id: sendResult.id ?? null,
      first_email_sent_at: firstEmailSentAt,
      metadata: {
        ...(lead.metadata && typeof lead.metadata === "object"
          ? lead.metadata
          : {}),
        loginUrl,
      },
      reply_alias: alias.address,
      status: "active",
      step: "awaiting_start",
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
      pagePath: args.body.pagePath ?? null,
      source: args.body.source ?? null,
      variant: args.body.variant ?? null,
    },
  });

  const { data: firstEmailMessage } = await admin
    .from("talent_messages")
    .insert({
      content: firstEmail.text,
      conversation_id: conversationId,
      message_type: "email_onboarding",
      role: "assistant",
      user_id: talentId,
    })
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
        replyTo: alias.address,
        resendEmailId: sendResult.id ?? null,
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
      resendEmailId: sendResult.id ?? null,
    },
  });

  return {
    alreadySent: false,
    leadId: String(lead.id),
    ok: true,
  };
}

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { IncomingWebhook } from "@slack/webhook";
import { resetCreditsForPlan } from "@/lib/billing/server";
import type {
  RequestAccessApprovalDraft,
  RequestAccessApprovalEmailLocale,
  RequestAccessApprovalEmailTemplate,
  RequestAccessReviewQueueItem,
  RequestAccessReviewQueueResponse,
  RequestAccessReviewStatus,
} from "@/lib/requestAccess/types";
import type { Database } from "@/types/database.types";

export const REQUEST_ACCESS_APPROVE_ACTION_ID = "request_access_approve";
export const REQUEST_ACCESS_REVIEW_PAGE_PATH = "/ops/request-access/review";

const REQUEST_ACCESS_STATUS_PENDING = "pending";
const REQUEST_ACCESS_STATUS_APPROVED = "approved";

type RequestAccessSubmitInput = {
  userId: string;
  email: string;
  name: string;
  company: string;
  role: string;
  hiringNeed: string;
  isMobile?: boolean | null;
};

type RequestAccessRow =
  Database["public"]["Tables"]["harper_waitlist_company"]["Row"];

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type RequestAccessApprovalRow = Pick<
  RequestAccessRow,
  | "email"
  | "name"
  | "company"
  | "role"
  | "needs"
  | "status"
  | "access_granted_at"
  | "approval_token"
>;

type RequestAccessQueueRow = Pick<
  RequestAccessRow,
  | "access_granted_at"
  | "approval_email_sent_at"
  | "approved_at"
  | "company"
  | "created_at"
  | "email"
  | "name"
  | "needs"
  | "role"
  | "status"
  | "user_id"
>;

function toRequestAccessReviewStatus(
  row: Pick<RequestAccessRow, "access_granted_at" | "status">
): RequestAccessReviewStatus {
  if (row.access_granted_at) {
    return "already_granted";
  }

  return row.status === REQUEST_ACCESS_STATUS_APPROVED ? "approved" : "pending";
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeText(value?: string | null) {
  return String(value ?? "").trim();
}

function normalizeEmail(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function makeApprovalToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSlackWebhook() {
  const webhookUrl = process.env.SLACK_TOKEN?.trim();
  if (!webhookUrl) {
    throw new Error("SLACK_TOKEN is not configured");
  }
  return new IncomingWebhook(webhookUrl);
}

function getSiteUrlFromRequest(req: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;

  return `${proto}://${host}`.replace(/\/+$/, "");
}

function getRequestAccessReviewSecret() {
  const secret =
    process.env.REQUEST_ACCESS_REVIEW_SECRET?.trim() ??
    process.env.SLACK_SIGNING_SECRET?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new Error(
      "REQUEST_ACCESS_REVIEW_SECRET, SLACK_SIGNING_SECRET, or SUPABASE_SERVICE_ROLE_KEY is required"
    );
  }

  return secret;
}

function signRequestAccessReviewPayload(payload: string) {
  return crypto
    .createHmac("sha256", getRequestAccessReviewSecret())
    .update(payload)
    .digest("base64url");
}

export function buildRequestAccessReviewToken(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Request access review email is required");
  }

  const payload = Buffer.from(
    JSON.stringify({ email: normalizedEmail }),
    "utf8"
  ).toString("base64url");

  return `${payload}.${signRequestAccessReviewPayload(payload)}`;
}

export function parseRequestAccessReviewToken(token: string) {
  const normalizedToken = normalizeText(token);
  const dotIndex = normalizedToken.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex >= normalizedToken.length - 1) {
    throw new Error("Invalid request access review token");
  }

  const payload = normalizedToken.slice(0, dotIndex);
  const signature = normalizedToken.slice(dotIndex + 1);
  const expectedSignature = signRequestAccessReviewPayload(payload);

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      throw new Error("Invalid request access review token");
    }
  } catch {
    throw new Error("Invalid request access review token");
  }

  let parsed: { email?: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
    };
  } catch {
    throw new Error("Invalid request access review token");
  }

  const email = normalizeEmail(parsed.email);
  if (!email) {
    throw new Error("Invalid request access review token");
  }

  return email;
}

async function getFreePlan(supabaseAdmin: SupabaseAdminClient) {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("plan_id, name, display_name, cycle, credit, price_krw")
    .eq("ls_variant_id", "0000000")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Free plan not found");
  }

  return data;
}

function buildSlackBlocks(
  row: Pick<
    RequestAccessRow,
    "email" | "name" | "company" | "role" | "needs" | "user_id"
  >,
  reviewUrl: string
) {
  const hiringNeed = Array.isArray(row.needs) ? row.needs[0] : null;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "☘️ *Request Access Submitted*",
          `• *Name*: ${row.name || "N/A"}`,
          `• *Email*: ${row.email || "N/A"}`,
          `• *Company*: ${row.company || "N/A"}`,
          `• *Role*: ${row.role || "N/A"}`,
          `• *Hiring Need*: ${hiringNeed || "N/A"}`,
          `• *User ID*: ${row.user_id || "N/A"}`,
        ].join("\n"),
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Approve",
            emoji: true,
          },
          style: "primary",
          action_id: REQUEST_ACCESS_APPROVE_ACTION_ID,
          value: JSON.stringify({
            email: row.email,
          }),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Customize Email",
            emoji: true,
          },
          url: reviewUrl,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Custom email draft: <${reviewUrl}|${reviewUrl.replace(/^https?:\/\//, "")}>`,
        },
      ],
    },
  ];
}

async function sendSlackRequestAccessMessage(
  row: Pick<
    RequestAccessRow,
    "email" | "name" | "company" | "role" | "needs" | "user_id"
  >,
  baseUrl: string
) {
  const webhook = getSlackWebhook();
  const reviewUrl = buildRequestAccessReviewUrl({
    email: row.email ?? "",
    baseUrl,
  });
  await webhook.send({
    text: `Request access submitted: ${row.email || "unknown email"}`,
    blocks: buildSlackBlocks(row, reviewUrl),
  });
}

async function sendSlackApprovalEmailNotification(args: {
  email: string;
  name?: string | null;
  approvedBy: string;
  mode?: "default" | "custom";
}) {
  const webhook = getSlackWebhook();
  const statusLabel =
    args.mode === "custom"
      ? "Approval email sent (customized)"
      : "Approval email sent";
  await webhook.send({
    text: `Approval email sent: ${args.email}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "*Request Access Approved*",
            `• *Name*: ${args.name || "N/A"}`,
            `• *Email*: ${args.email}`,
            `• *Approved By*: ${args.approvedBy || "unknown"}`,
            `• *Status*: ${statusLabel}`,
          ].join("\n"),
        },
      },
    ],
  });
}

function getMailerConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const defaultFrom =
    process.env.REQUEST_ACCESS_FROM_EMAIL?.trim() ??
    process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!defaultFrom) {
    throw new Error(
      "REQUEST_ACCESS_FROM_EMAIL or RESEND_FROM_EMAIL is not configured"
    );
  }

  return { apiKey, defaultFrom };
}

function buildDefaultRequestAccessApprovedEmail(args: {
  locale: RequestAccessApprovalEmailLocale;
  name?: string | null;
  activationUrl: string;
}): RequestAccessApprovalEmailTemplate {
  const recipientName =
    normalizeText(args.name) || (args.locale === "ko" ? "고객" : "there");
  const safeRecipientName = escapeHtml(recipientName);
  const safeActivationUrl = escapeHtml(args.activationUrl);
  const copy =
    args.locale === "ko"
      ? {
          subject: "Harper 이용이 준비되었습니다",
          greeting: `${safeRecipientName}님, 안녕하세요.`,
          welcome: "Harper에 오신 것을 환영합니다.",
          approved: "요청하신 Harper access가 승인되었습니다.",
          intro:
            "아래 링크를 눌러 접근을 활성화하고 바로 Harper를 사용해보세요.",
          cta: "Harper 시작하기",
          fallback:
            "혹시 링크가 열리지 않는다면 아래 URL을 브라우저에 붙여넣어 주세요.",
          footer:
            "Harper는 진짜 인재를 발견하도록 도와주는 AI Recruiting Agent입니다.",
          text: [
            `${recipientName}님, 안녕하세요.`,
            "",
            "Harper에 오신 것을 환영합니다.",
            "Harper request access가 승인되었습니다.",
            "아래 링크를 열어 접근을 활성화해 주세요:",
            args.activationUrl,
          ].join("\n"),
        }
      : {
          subject: "Your Harper access is ready",
          greeting: `Hi ${safeRecipientName},`,
          welcome: "Welcome to Harper!",
          approved: "Your Harper request access has been approved.",
          intro:
            "Click the link below to activate your access and go straight into Harper.",
          cta: "Activate Harper Access",
          fallback:
            "If the link does not open, paste this URL into your browser:",
          footer:
            "Harper helps you discover real engineers and researchers through their actual work.",
          text: [
            `Hi ${recipientName},`,
            "",
            "Welcome to Harper!",
            "Your Harper request access has been approved.",
            "Open the link below to activate your access:",
            args.activationUrl,
          ].join("\n"),
        };
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <p>${copy.greeting}</p>
      <p>${escapeHtml(copy.welcome)}</p>
      <p>${escapeHtml(copy.approved)}</p>
      <p>${escapeHtml(copy.intro)}</p>
      <p><a href="${safeActivationUrl}">${escapeHtml(copy.cta)}</a></p>
      <p>${escapeHtml(copy.fallback)}</p>
      <p>${safeActivationUrl}</p>
      <p></p>
      <div style="margin-top: 32px; padding-left: 12px; border-left: 3px solid #EFFF3F;">
        <p style="margin: 0; font-size: 13px; color: #111827;">
          ${escapeHtml(copy.footer)}
        </p>
      </div>
    </div>
  `;

  return {
    subject: copy.subject,
    html,
    text: copy.text,
  };
}

function buildDefaultRequestAccessApprovedEmailTemplates(args: {
  name?: string | null;
  activationUrl: string;
}) {
  return {
    en: buildDefaultRequestAccessApprovedEmail({
      locale: "en",
      name: args.name,
      activationUrl: args.activationUrl,
    }),
    ko: buildDefaultRequestAccessApprovedEmail({
      locale: "ko",
      name: args.name,
      activationUrl: args.activationUrl,
    }),
  } satisfies Record<
    RequestAccessApprovalEmailLocale,
    RequestAccessApprovalEmailTemplate
  >;
}

async function sendRequestAccessApprovedEmail(args: {
  to: string;
  from?: string | null;
  subject: string;
  html: string;
  text?: string;
}) {
  const { apiKey, defaultFrom } = getMailerConfig();
  const from = normalizeText(args.from) || defaultFrom;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Failed to send approval email: ${payload}`);
  }
}

async function upsertCompanyUserFromRequest(args: {
  supabaseAdmin: SupabaseAdminClient;
  userId: string;
  email: string | null;
  request: Pick<RequestAccessRow, "name" | "company" | "role">;
}) {
  const { supabaseAdmin, userId, email, request } = args;
  const { data: existing, error: readError } = await supabaseAdmin
    .from("company_users")
    .select("user_id, is_authenticated")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const payload = {
    user_id: userId,
    email,
    name: request.name || "Anonymous",
    company: request.company || null,
    role: request.role || null,
    is_authenticated: true,
  };

  if (existing?.user_id) {
    const { error: updateError } = await supabaseAdmin
      .from("company_users")
      .update(payload)
      .eq("user_id", userId);

    if (updateError) {
      throw updateError;
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from("company_users")
      .insert(payload);

    if (insertError) {
      throw insertError;
    }
  }

  return {
    alreadyAuthenticated: Boolean(existing?.is_authenticated),
  };
}

export function buildRequestAccessReviewUrl(args: {
  email: string;
  baseUrl: string;
}) {
  const token = buildRequestAccessReviewToken(args.email);
  return `${args.baseUrl}${REQUEST_ACCESS_REVIEW_PAGE_PATH}?request=${encodeURIComponent(
    token
  )}`;
}

export async function submitRequestAccess(
  args: RequestAccessSubmitInput & { req: Request }
) {
  const supabaseAdmin = createSupabaseAdminClient();
  const email = normalizeEmail(args.email);
  const name = normalizeText(args.name);
  const company = normalizeText(args.company);
  const role = normalizeText(args.role);
  const hiringNeed = normalizeText(args.hiringNeed);

  if (!email || !name || !company) {
    throw new Error("Name and company are required");
  }

  const payload: Database["public"]["Tables"]["harper_waitlist_company"]["Insert"] =
    {
      user_id: args.userId,
      email,
      name,
      company,
      role: role || null,
      needs: hiringNeed ? [hiringNeed] : null,
      is_mobile: args.isMobile ?? null,
      is_submit: true,
      status: REQUEST_ACCESS_STATUS_PENDING,
      approved_at: null,
      approved_by: null,
      approval_token: null,
      approval_email_sent_at: null,
      access_granted_at: null,
    };

  const { data, error } = await supabaseAdmin
    .from("harper_waitlist_company")
    .upsert(payload, { onConflict: "email" })
    .select("email, name, company, role, needs, user_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const slackRow = {
    email,
    name,
    company,
    role: role || null,
    needs: hiringNeed ? [hiringNeed] : null,
    user_id: args.userId,
    ...(data ?? {}),
  };

  await sendSlackRequestAccessMessage(
    slackRow,
    getRequestAccessBaseUrl(args.req)
  );
  return slackRow;
}

export function getRequestAccessBaseUrl(req: Request) {
  return getSiteUrlFromRequest(req);
}

export function buildRequestAccessActivationUrl(args: {
  token: string;
  baseUrl: string;
}) {
  return `${args.baseUrl}/request-access/activate?token=${encodeURIComponent(
    args.token
  )}`;
}

async function getRequestAccessApprovalRow(args: {
  supabaseAdmin: SupabaseAdminClient;
  email: string;
}) {
  const { data: row, error } = await args.supabaseAdmin
    .from("harper_waitlist_company")
    .select(
      "email, name, company, role, needs, status, access_granted_at, approval_token"
    )
    .eq("email", args.email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!row?.email) {
    throw new Error("Request access row not found");
  }

  return row as RequestAccessApprovalRow;
}

async function ensureRequestAccessApprovalToken(args: {
  supabaseAdmin: SupabaseAdminClient;
  email: string;
  currentToken?: string | null;
}) {
  const existingToken = normalizeText(args.currentToken);
  if (existingToken) {
    return existingToken;
  }

  const approvalToken = makeApprovalToken();
  const { error } = await args.supabaseAdmin
    .from("harper_waitlist_company")
    .update({
      approval_token: approvalToken,
    })
    .eq("email", args.email);

  if (error) {
    throw error;
  }

  return approvalToken;
}

async function resolveRequestAccessApprovalContext(args: {
  supabaseAdmin: SupabaseAdminClient;
  email: string;
  baseUrl: string;
}) {
  const row = await getRequestAccessApprovalRow({
    supabaseAdmin: args.supabaseAdmin,
    email: args.email,
  });
  const approvalToken = await ensureRequestAccessApprovalToken({
    supabaseAdmin: args.supabaseAdmin,
    email: row.email,
    currentToken: row.approval_token,
  });
  const activationUrl = buildRequestAccessActivationUrl({
    token: approvalToken,
    baseUrl: args.baseUrl,
  });
  const defaultTemplates = buildDefaultRequestAccessApprovedEmailTemplates({
    name: row.name,
    activationUrl,
  });

  return {
    row,
    approvalToken,
    activationUrl,
    defaultEmail: defaultTemplates.en,
    defaultTemplates,
    hiringNeed: Array.isArray(row.needs) ? (row.needs[0] ?? null) : null,
  };
}

export async function prepareRequestAccessApprovalDraft(args: {
  request: string;
  baseUrl: string;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { defaultFrom } = getMailerConfig();
  const email = parseRequestAccessReviewToken(args.request);
  const context = await resolveRequestAccessApprovalContext({
    supabaseAdmin,
    email,
    baseUrl: args.baseUrl,
  });
  const status = toRequestAccessReviewStatus(context.row);
  const locale: RequestAccessApprovalEmailLocale = "en";
  const selectedTemplate = context.defaultTemplates[locale];

  return {
    status,
    email: context.row.email,
    name: context.row.name,
    company: context.row.company,
    role: context.row.role,
    hiringNeed: context.hiringNeed,
    accessGrantedAt: context.row.access_granted_at,
    activationUrl: context.activationUrl,
    locale,
    templates: context.defaultTemplates,
    from: defaultFrom,
    subject: selectedTemplate.subject,
    html: selectedTemplate.html,
    text: selectedTemplate.text,
  } satisfies RequestAccessApprovalDraft;
}

export async function listRequestAccessReviewQueue(args: {
  baseUrl: string;
}): Promise<RequestAccessReviewQueueResponse> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("harper_waitlist_company")
    .select(
      "access_granted_at, approval_email_sent_at, approved_at, company, created_at, email, name, needs, role, status, user_id"
    )
    .eq("is_submit", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const statusWeight: Record<RequestAccessReviewStatus, number> = {
    pending: 0,
    approved: 1,
    already_granted: 2,
  };

  const items = ((data ?? []) as RequestAccessQueueRow[])
    .map((row) => {
      const status = toRequestAccessReviewStatus(row);

      return {
        accessGrantedAt: row.access_granted_at,
        approvalEmailSentAt: row.approval_email_sent_at,
        approvedAt: row.approved_at,
        company: row.company,
        createdAt: row.created_at,
        email: row.email,
        hiringNeed: Array.isArray(row.needs) ? (row.needs[0] ?? null) : null,
        name: row.name,
        requestToken: buildRequestAccessReviewToken(row.email),
        reviewUrl: buildRequestAccessReviewUrl({
          email: row.email,
          baseUrl: args.baseUrl,
        }),
        role: row.role,
        status,
        userId: row.user_id,
      } satisfies RequestAccessReviewQueueItem;
    })
    .sort((left, right) => {
      const statusDelta =
        statusWeight[left.status] - statusWeight[right.status];
      if (statusDelta !== 0) {
        return statusDelta;
      }

      return right.createdAt.localeCompare(left.createdAt);
    });

  const counts = items.reduce(
    (acc, item) => {
      acc.total += 1;

      if (item.status === "pending") {
        acc.pending += 1;
      } else if (item.status === "approved") {
        acc.approved += 1;
      } else {
        acc.alreadyGranted += 1;
      }

      return acc;
    },
    {
      alreadyGranted: 0,
      approved: 0,
      pending: 0,
      total: 0,
    }
  );

  return {
    counts,
    items,
  };
}

export async function sendRequestAccessApprovalEmail(args: {
  email: string;
  approvedBy: string;
  baseUrl: string;
  locale?: RequestAccessApprovalEmailLocale | null;
  from?: string | null;
  subject?: string | null;
  html?: string | null;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  const email = normalizeEmail(args.email);
  const context = await resolveRequestAccessApprovalContext({
    supabaseAdmin,
    email,
    baseUrl: args.baseUrl,
  });

  if (context.row.access_granted_at) {
    return {
      status: "already_granted" as const,
      email: context.row.email,
    };
  }

  const locale = args.locale === "ko" ? "ko" : "en";
  const selectedTemplate = context.defaultTemplates[locale];
  const subject = normalizeText(args.subject) || selectedTemplate.subject;
  const html = normalizeText(args.html) || selectedTemplate.html;
  const text = htmlToText(html) || selectedTemplate.text;
  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("harper_waitlist_company")
    .update({
      status: REQUEST_ACCESS_STATUS_APPROVED,
      approved_at: nowIso,
      approved_by: args.approvedBy,
      approval_token: context.approvalToken,
      approval_email_sent_at: nowIso,
    })
    .eq("email", context.row.email);

  if (updateError) {
    throw updateError;
  }

  await sendRequestAccessApprovedEmail({
    to: context.row.email,
    from: args.from,
    subject,
    html,
    text,
  });

  try {
    await sendSlackApprovalEmailNotification({
      email: context.row.email,
      name: context.row.name,
      approvedBy: args.approvedBy,
      mode:
        subject !== selectedTemplate.subject || html !== selectedTemplate.html
          ? "custom"
          : "default",
    });
  } catch (error) {
    console.error("[request-access] approval slack notify failed", error);
  }

  return {
    status: "approved" as const,
    email: context.row.email,
  };
}

export async function approveRequestAccess(args: {
  email: string;
  approvedBy: string;
  baseUrl: string;
}) {
  return sendRequestAccessApprovalEmail(args);
}

export async function activateRequestAccess(args: {
  token: string;
  userId: string;
  email?: string | null;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  const token = normalizeText(args.token);

  if (!token) {
    return { ok: false as const, code: "missing_token" };
  }

  const { data: row, error: readError } = await supabaseAdmin
    .from("harper_waitlist_company")
    .select(
      "user_id, email, name, company, role, status, approval_token, access_granted_at"
    )
    .eq("approval_token", token)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (!row?.approval_token) {
    return { ok: false as const, code: "invalid_token" };
  }

  if (row.status !== REQUEST_ACCESS_STATUS_APPROVED) {
    return { ok: false as const, code: "not_approved" };
  }

  const requestEmail = normalizeEmail(row.email);
  const currentEmail = normalizeEmail(args.email);
  const expectedUserId = normalizeText(row.user_id);
  const currentUserId = normalizeText(args.userId);
  const isAuthorizedUser = expectedUserId
    ? expectedUserId === currentUserId
    : Boolean(requestEmail && currentEmail && requestEmail === currentEmail);

  if (!isAuthorizedUser) {
    return { ok: false as const, code: "wrong_user" };
  }

  if (row.access_granted_at) {
    return { ok: true as const, alreadyActivated: true };
  }

  const companyUserState = await upsertCompanyUserFromRequest({
    supabaseAdmin,
    userId: currentUserId,
    email: args.email ?? row.email,
    request: row,
  });

  if (!companyUserState.alreadyAuthenticated) {
    const freePlan = await getFreePlan(supabaseAdmin);
    await resetCreditsForPlan({
      supabaseAdmin,
      userId: currentUserId,
      plan: freePlan,
      eventType: "request_access_approved",
    });
  }

  const { error: updateError } = await supabaseAdmin
    .from("harper_waitlist_company")
    .update({
      access_granted_at: new Date().toISOString(),
    })
    .eq("approval_token", token);

  if (updateError) {
    throw updateError;
  }

  return {
    ok: true as const,
    alreadyActivated: false,
  };
}

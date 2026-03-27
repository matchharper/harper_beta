import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { IncomingWebhook } from "@slack/webhook";
import { resetCreditsForPlan } from "@/lib/billing/server";
import type { Database } from "@/types/database.types";

export const REQUEST_ACCESS_APPROVE_ACTION_ID = "request_access_approve";

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
  >
) {
  const hiringNeed = Array.isArray(row.needs) ? row.needs[0] : null;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "*Request Access Submitted*",
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
      ],
    },
  ];
}

async function sendSlackRequestAccessMessage(
  row: Pick<
    RequestAccessRow,
    "email" | "name" | "company" | "role" | "needs" | "user_id"
  >
) {
  const webhook = getSlackWebhook();
  await webhook.send({
    text: `Request access submitted: ${row.email || "unknown email"}`,
    blocks: buildSlackBlocks(row),
  });
}

async function sendSlackApprovalEmailNotification(args: {
  email: string;
  name?: string | null;
  approvedBy: string;
}) {
  const webhook = getSlackWebhook();
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
            `• *Status*: Approval email sent`,
          ].join("\n"),
        },
      },
    ],
  });
}

function getMailerConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.REQUEST_ACCESS_FROM_EMAIL?.trim() ??
    process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!from) {
    throw new Error(
      "REQUEST_ACCESS_FROM_EMAIL or RESEND_FROM_EMAIL is not configured"
    );
  }

  return { apiKey, from };
}

async function sendRequestAccessApprovedEmail(args: {
  to: string;
  name?: string | null;
  activationUrl: string;
}) {
  const { apiKey, from } = getMailerConfig();
  const recipientName = normalizeText(args.name) || "there";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <p>Hi ${recipientName},</p>
      <p>Welcome to Harper!</p>
      <p>Your Harper request access has been approved.</p>
      <p>Click the link below to activate your access and go straight into Harper.</p>
      <p><a href="${args.activationUrl}" style="color: #0f172a;">Activate Harper Access</a></p>
      <p>If the link does not open, paste this URL into your browser:</p>
      <p>${args.activationUrl}</p>
    </div>
  `;
  const text = [
    `Hi ${recipientName},`,
    "",
    "Your Harper request access has been approved.",
    "Open the link below to activate your access:",
    args.activationUrl,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: "Your Harper access is ready",
      html,
      text,
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

export async function submitRequestAccess(
  args: RequestAccessSubmitInput & { req: Request }
) {
  const supabaseAdmin = createSupabaseAdminClient();
  const email = normalizeEmail(args.email);
  const name = normalizeText(args.name);
  const company = normalizeText(args.company);
  const role = normalizeText(args.role);
  const hiringNeed = normalizeText(args.hiringNeed);

  if (!email || !name || !company || !role || !hiringNeed) {
    throw new Error("All request access fields are required");
  }

  const payload: Database["public"]["Tables"]["harper_waitlist_company"]["Insert"] =
    {
      user_id: args.userId,
      email,
      name,
      company,
      role,
      needs: [hiringNeed],
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
    role,
    needs: [hiringNeed],
    user_id: args.userId,
    ...(data ?? {}),
  };

  await sendSlackRequestAccessMessage(slackRow);
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

export async function approveRequestAccess(args: {
  email: string;
  approvedBy: string;
  baseUrl: string;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  const email = normalizeEmail(args.email);

  const { data: row, error: readError } = await supabaseAdmin
    .from("harper_waitlist_company")
    .select(
      "user_id, email, name, company, role, needs, status, access_granted_at"
    )
    .eq("email", email)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (!row?.email) {
    throw new Error("Request access row not found");
  }

  if (row.access_granted_at) {
    return {
      status: "already_granted" as const,
      email: row.email,
    };
  }

  const token = makeApprovalToken();
  const nowIso = new Date().toISOString();
  const activationUrl = buildRequestAccessActivationUrl({
    token,
    baseUrl: args.baseUrl,
  });

  const { error: updateError } = await supabaseAdmin
    .from("harper_waitlist_company")
    .update({
      status: REQUEST_ACCESS_STATUS_APPROVED,
      approved_at: nowIso,
      approved_by: args.approvedBy,
      approval_token: token,
      approval_email_sent_at: nowIso,
    })
    .eq("email", row.email);

  if (updateError) {
    throw updateError;
  }

  await sendRequestAccessApprovedEmail({
    to: row.email,
    name: row.name,
    activationUrl,
  });

  try {
    await sendSlackApprovalEmailNotification({
      email: row.email,
      name: row.name,
      approvedBy: args.approvedBy,
    });
  } catch (error) {
    console.error("[request-access] approval slack notify failed", error);
  }

  return {
    status: "approved" as const,
    email: row.email,
  };
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

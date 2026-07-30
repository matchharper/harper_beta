import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getEmailDomain, INTERNAL_EMAIL_DOMAIN } from "@/lib/internalAccess";
import {
  getOrgPermissions,
  normalizeOrgMembershipRole,
} from "@/lib/org/permissions";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

const SLACK_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SLACK_CALLBACK_PATH = "/api/org/slack/callback";

type SlackIntegrationRow = {
  company_workspace_id: string;
  connected_at: string;
  last_error: string | null;
  last_sent_at: string | null;
  notify_candidate_accepted: boolean;
  notify_candidate_rejected: boolean;
  notify_member_joined: boolean;
  slack_channel_id: string;
  slack_channel_name: string | null;
  slack_team_id: string;
  slack_team_name: string | null;
  webhook_url_ciphertext: string;
};

type SlackOAuthState = {
  issuedAt: number;
  returnTo: string;
  userId: string;
  workspaceId: string;
};

type SlackOAuthResponse = {
  error?: string;
  incoming_webhook?: {
    channel?: string;
    channel_id?: string;
    url?: string;
  };
  ok?: boolean;
  team?: {
    id?: string;
    name?: string;
  };
};

export type OrgSlackIntegrationStatus = {
  channelId: string | null;
  channelName: string | null;
  channels: OrgSlackChannelStatus[];
  connected: boolean;
  connectedAt: string | null;
  lastError: string | null;
  lastSentAt: string | null;
  notifications: OrgSlackNotificationSettings;
  teamId: string | null;
  teamName: string | null;
};

export type OrgSlackChannelStatus = {
  channelId: string;
  channelName: string | null;
  connectedAt: string;
  lastError: string | null;
  lastSentAt: string | null;
};

export type OrgSlackNotificationKey =
  | "candidateAccepted"
  | "candidateRejected"
  | "memberJoined";

export type OrgSlackNotificationSettings = Record<
  OrgSlackNotificationKey,
  boolean
>;

export class OrgSlackIntegrationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function getSlackClientId() {
  const value = normalizeText(process.env.SLACK_CLIENT_ID);
  if (!value) {
    throw new OrgSlackIntegrationError(
      503,
      "Slack 연결 설정이 아직 완료되지 않았습니다."
    );
  }
  return value;
}

function getSlackClientSecret() {
  const value = normalizeText(process.env.SLACK_CLIENT_SECRET);
  if (!value) {
    throw new OrgSlackIntegrationError(
      503,
      "Slack 연결 설정이 아직 완료되지 않았습니다."
    );
  }
  return value;
}

function getWebhookEncryptionSecret() {
  return (
    normalizeText(process.env.SLACK_WEBHOOK_ENCRYPTION_KEY) ||
    getSlackClientSecret()
  );
}

function getSlackRedirectUri(origin: string) {
  const configured = normalizeText(process.env.SLACK_OAUTH_REDIRECT_URI);
  if (configured) return configured;
  return new URL(SLACK_CALLBACK_PATH, origin).toString();
}

function sanitizeReturnTo(value: unknown, workspaceId: string) {
  const fallback = `/org/settings?orgId=${encodeURIComponent(workspaceId)}`;
  const raw = normalizeText(value);
  if (!raw) return fallback;

  try {
    const url = new URL(raw, "https://harper.local");
    if (
      url.origin !== "https://harper.local" ||
      !["/org", "/org/settings"].includes(url.pathname)
    ) {
      return fallback;
    }
    url.searchParams.delete("slack");
    url.searchParams.delete("slackMessage");
    url.searchParams.set("orgId", workspaceId);
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function encodeOAuthState(value: SlackOAuthState) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", getSlackClientSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function decodeOAuthState(value: string): SlackOAuthState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    throw new OrgSlackIntegrationError(400, "잘못된 Slack 연결 요청입니다.");
  }

  const expected = createHmac("sha256", getSlackClientSecret())
    .update(payload)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new OrgSlackIntegrationError(400, "잘못된 Slack 연결 요청입니다.");
  }

  let parsed: SlackOAuthState;
  try {
    parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as SlackOAuthState;
  } catch {
    throw new OrgSlackIntegrationError(400, "잘못된 Slack 연결 요청입니다.");
  }

  if (
    !normalizeText(parsed.workspaceId) ||
    !normalizeText(parsed.userId) ||
    !Number.isFinite(parsed.issuedAt) ||
    Date.now() - parsed.issuedAt > SLACK_OAUTH_STATE_TTL_MS ||
    parsed.issuedAt > Date.now() + 60_000
  ) {
    throw new OrgSlackIntegrationError(
      400,
      "Slack 연결 요청이 만료되었습니다. 다시 시도해 주세요."
    );
  }

  return {
    ...parsed,
    returnTo: sanitizeReturnTo(parsed.returnTo, parsed.workspaceId),
  };
}

function encryptWebhookUrl(webhookUrl: string) {
  const key = createHash("sha256")
    .update(getWebhookEncryptionSecret())
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(webhookUrl, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

function decryptWebhookUrl(value: string) {
  const [version, ivValue, authTagValue, ciphertextValue] = value.split(":");
  if (version !== "v1" || !ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Unsupported Slack webhook ciphertext");
  }

  const key = createHash("sha256")
    .update(getWebhookEncryptionSecret())
    .digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function assertWorkspaceAccess(
  user: User,
  workspaceId: string,
  permission: "manage_integrations" | "view" = "view"
) {
  const admin = getSupabaseAdmin();
  const { data: workspace, error: workspaceError } = await (
    admin.from("company_workspace" as any) as any
  )
    .select("company_workspace_id, company_name, is_internal")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!workspace) {
    throw new OrgSlackIntegrationError(404, "Workspace를 찾지 못했습니다.");
  }

  if (getEmailDomain(user.email) === INTERNAL_EMAIL_DOMAIN) {
    if (!workspace.is_internal) {
      throw new OrgSlackIntegrationError(
        403,
        "Workspace 접근 권한이 없습니다."
      );
    }
    return { companyName: String(workspace.company_name), workspaceId };
  }

  const { data: membership, error: membershipError } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select("id, role")
    .eq("company_user_id", user.id)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    throw new OrgSlackIntegrationError(403, "Workspace 접근 권한이 없습니다.");
  }
  if (
    permission === "manage_integrations" &&
    !getOrgPermissions(normalizeOrgMembershipRole(membership.role))
      .canManageIntegrations
  ) {
    throw new OrgSlackIntegrationError(
      403,
      "Slack 설정을 변경할 권한이 없습니다."
    );
  }
  return { companyName: String(workspace.company_name), workspaceId };
}

async function fetchIntegrations(workspaceId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .select(
      "company_workspace_id, slack_team_id, slack_team_name, slack_channel_id, slack_channel_name, webhook_url_ciphertext, connected_at, last_sent_at, last_error, notify_candidate_accepted, notify_candidate_rejected, notify_member_joined"
    )
    .eq("company_workspace_id", workspaceId)
    .order("connected_at", { ascending: true });

  if (error) throw error;
  return ((data as SlackIntegrationRow[] | null) ?? []).filter(Boolean);
}

async function postIncomingWebhook(webhookUrl: string, text: string) {
  const response = await fetch(webhookUrl, {
    body: JSON.stringify({ text }),
    headers: { "Content-Type": "application/json; charset=utf-8" },
    method: "POST",
  });
  const responseText = await response.text().catch(() => "");
  if (!response.ok || responseText.trim().toLowerCase() !== "ok") {
    throw new Error(
      `Slack Incoming Webhook failed: ${responseText.trim() || response.status}`
    );
  }
}

async function updateDeliveryResult(args: {
  channelId: string;
  error?: unknown;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const patch = args.error
    ? {
        last_error:
          args.error instanceof Error
            ? args.error.message.slice(0, 500)
            : "Slack 메시지를 보내지 못했습니다.",
        updated_at: now,
      }
    : {
        last_error: null,
        last_sent_at: now,
        updated_at: now,
      };
  const { error } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .update(patch)
    .eq("company_workspace_id", args.workspaceId)
    .eq("slack_channel_id", args.channelId);
  if (error) console.error("[org/slack-integration] delivery status", error);
}

export async function createOrgSlackAuthorizeUrl(args: {
  origin: string;
  returnTo?: string | null;
  user: User;
  workspaceId: string;
}) {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) {
    throw new OrgSlackIntegrationError(400, "workspaceId가 필요합니다.");
  }
  await assertWorkspaceAccess(args.user, workspaceId, "manage_integrations");

  const redirectUri = getSlackRedirectUri(args.origin);
  const state = encodeOAuthState({
    issuedAt: Date.now(),
    returnTo: sanitizeReturnTo(args.returnTo, workspaceId),
    userId: args.user.id,
    workspaceId,
  });
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", getSlackClientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "incoming-webhook");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeOrgSlackOAuth(args: {
  code: string;
  origin: string;
  state: string;
}) {
  const state = decodeOAuthState(args.state);
  const redirectUri = getSlackRedirectUri(args.origin);
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    body: new URLSearchParams({
      client_id: getSlackClientId(),
      client_secret: getSlackClientSecret(),
      code: normalizeText(args.code),
      redirect_uri: redirectUri,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = (await response
    .json()
    .catch(() => null)) as SlackOAuthResponse | null;
  const webhookUrl = normalizeText(payload?.incoming_webhook?.url);
  const teamId = normalizeText(payload?.team?.id);
  const channelId = normalizeText(payload?.incoming_webhook?.channel_id);

  if (!response.ok || !payload?.ok || !webhookUrl || !teamId || !channelId) {
    throw new OrgSlackIntegrationError(
      502,
      `Slack 연결에 실패했습니다: ${payload?.error ?? response.status}`
    );
  }

  const now = new Date().toISOString();
  const existingIntegrations = await fetchIntegrations(state.workspaceId);
  const existingTeamId = existingIntegrations[0]?.slack_team_id;
  if (existingTeamId && existingTeamId !== teamId) {
    throw new OrgSlackIntegrationError(
      409,
      "기존 연결과 다른 Slack workspace입니다. 기존 연결을 해제한 뒤 다시 연결해 주세요."
    );
  }
  const notificationSettings = existingIntegrations[0]
    ? {
        notify_candidate_accepted:
          existingIntegrations[0].notify_candidate_accepted,
        notify_candidate_rejected:
          existingIntegrations[0].notify_candidate_rejected,
        notify_member_joined: existingIntegrations[0].notify_member_joined,
      }
    : {};
  const admin = getSupabaseAdmin();
  const { error } = await (
    admin.from("company_slack_integrations" as any) as any
  ).upsert(
    {
      company_workspace_id: state.workspaceId,
      connected_at: now,
      installed_by_user_id: state.userId,
      last_error: null,
      ...notificationSettings,
      slack_channel_id: channelId,
      slack_channel_name:
        normalizeText(payload.incoming_webhook?.channel) || null,
      slack_team_id: teamId,
      slack_team_name: normalizeText(payload.team?.name) || null,
      updated_at: now,
      webhook_url_ciphertext: encryptWebhookUrl(webhookUrl),
    },
    { onConflict: "company_workspace_id,slack_channel_id" }
  );
  if (error) throw error;

  try {
    await postIncomingWebhook(
      webhookUrl,
      "Harper Slack 연결이 완료되었습니다. 이 채널로 Organization 알림을 보내드릴게요."
    );
    await updateDeliveryResult({
      channelId,
      workspaceId: state.workspaceId,
    });
  } catch (deliveryError) {
    await updateDeliveryResult({
      channelId,
      error: deliveryError,
      workspaceId: state.workspaceId,
    });
  }

  return state.returnTo;
}

export async function getOrgSlackIntegrationStatus(args: {
  user: User;
  workspaceId: string;
}): Promise<OrgSlackIntegrationStatus> {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) {
    throw new OrgSlackIntegrationError(400, "workspaceId가 필요합니다.");
  }
  await assertWorkspaceAccess(args.user, workspaceId);
  const rows = await fetchIntegrations(workspaceId);
  const primary = rows[0];
  if (!primary) {
    return {
      channelId: null,
      channelName: null,
      channels: [],
      connected: false,
      connectedAt: null,
      lastError: null,
      lastSentAt: null,
      notifications: {
        candidateAccepted: true,
        candidateRejected: true,
        memberJoined: true,
      },
      teamId: null,
      teamName: null,
    };
  }

  const latestSentAt =
    rows
      .map((row) => row.last_sent_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const latestError =
    [...rows].reverse().find((row) => Boolean(row.last_error))?.last_error ??
    null;

  return {
    channelId: primary.slack_channel_id,
    channelName: primary.slack_channel_name,
    channels: rows.map((row) => ({
      channelId: row.slack_channel_id,
      channelName: row.slack_channel_name,
      connectedAt: row.connected_at,
      lastError: row.last_error,
      lastSentAt: row.last_sent_at,
    })),
    connected: true,
    connectedAt: primary.connected_at,
    lastError: latestError,
    lastSentAt: latestSentAt,
    notifications: {
      candidateAccepted: primary.notify_candidate_accepted,
      candidateRejected: primary.notify_candidate_rejected,
      memberJoined: primary.notify_member_joined,
    },
    teamId: primary.slack_team_id,
    teamName: primary.slack_team_name,
  };
}

export async function disconnectOrgSlackIntegration(args: {
  channelId?: string;
  user: User;
  workspaceId: string;
}) {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) {
    throw new OrgSlackIntegrationError(400, "workspaceId가 필요합니다.");
  }
  await assertWorkspaceAccess(args.user, workspaceId, "manage_integrations");
  const admin = getSupabaseAdmin();
  let query = (admin.from("company_slack_integrations" as any) as any)
    .delete()
    .eq("company_workspace_id", workspaceId);
  const channelId = normalizeText(args.channelId);
  if (channelId) {
    query = query.eq("slack_channel_id", channelId);
  }
  const { data, error } = await query.select("slack_channel_id");
  if (error) throw error;
  if (channelId && (!Array.isArray(data) || data.length === 0)) {
    throw new OrgSlackIntegrationError(404, "연결된 Slack 채널이 없습니다.");
  }
  return { ok: true as const };
}

export async function sendOrgWorkspaceSlackMessage(args: {
  channelId?: string;
  notificationKey?: OrgSlackNotificationKey;
  text: string;
  workspaceId: string;
}) {
  const workspaceId = normalizeText(args.workspaceId);
  const text = normalizeText(args.text);
  if (!workspaceId || !text) return false;

  const rows = await fetchIntegrations(workspaceId);
  const primary = rows[0];
  if (!primary) return false;
  const notificationEnabled =
    args.notificationKey === "candidateAccepted"
      ? primary.notify_candidate_accepted
      : args.notificationKey === "candidateRejected"
        ? primary.notify_candidate_rejected
        : args.notificationKey === "memberJoined"
          ? primary.notify_member_joined
          : true;
  if (!notificationEnabled) return false;

  const requestedChannelId = normalizeText(args.channelId);
  const targets = requestedChannelId
    ? rows.filter((row) => row.slack_channel_id === requestedChannelId)
    : rows;
  if (targets.length === 0) return false;

  const deliveryResults = await Promise.allSettled(
    targets.map(async (row) => {
      try {
        await postIncomingWebhook(
          decryptWebhookUrl(row.webhook_url_ciphertext),
          text
        );
        await updateDeliveryResult({
          channelId: row.slack_channel_id,
          workspaceId,
        });
      } catch (error) {
        await updateDeliveryResult({
          channelId: row.slack_channel_id,
          error,
          workspaceId,
        });
        throw error;
      }
    })
  );
  const failedCount = deliveryResults.filter(
    (result) => result.status === "rejected"
  ).length;
  if (failedCount > 0) {
    throw new OrgSlackIntegrationError(
      502,
      failedCount === targets.length
        ? "Slack 채널로 알림을 보내지 못했습니다."
        : `일부 Slack 채널에 알림을 보내지 못했습니다. (${targets.length - failedCount}/${targets.length} 성공)`
    );
  }
  return true;
}

export async function sendOrgSlackTestMessage(args: {
  channelId?: string;
  user: User;
  workspaceId: string;
}) {
  const workspaceId = normalizeText(args.workspaceId);
  const workspace = await assertWorkspaceAccess(
    args.user,
    workspaceId,
    "manage_integrations"
  );
  const delivered = await sendOrgWorkspaceSlackMessage({
    channelId: args.channelId,
    text: `[테스트] ${workspace.companyName}의 Harper Organization 알림이 정상적으로 연결되었습니다.`,
    workspaceId,
  });
  if (!delivered) {
    throw new OrgSlackIntegrationError(404, "연결된 Slack 채널이 없습니다.");
  }
  return { ok: true as const };
}

export async function updateOrgSlackNotificationSettings(args: {
  notifications: Partial<OrgSlackNotificationSettings>;
  user: User;
  workspaceId: string;
}) {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) {
    throw new OrgSlackIntegrationError(400, "workspaceId가 필요합니다.");
  }
  await assertWorkspaceAccess(args.user, workspaceId, "manage_integrations");
  const patch: Record<string, boolean | string> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof args.notifications.candidateAccepted === "boolean") {
    patch.notify_candidate_accepted = args.notifications.candidateAccepted;
  }
  if (typeof args.notifications.candidateRejected === "boolean") {
    patch.notify_candidate_rejected = args.notifications.candidateRejected;
  }
  if (typeof args.notifications.memberJoined === "boolean") {
    patch.notify_member_joined = args.notifications.memberJoined;
  }
  const admin = getSupabaseAdmin();
  const { data, error } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .update(patch)
    .eq("company_workspace_id", workspaceId)
    .select("company_workspace_id");
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new OrgSlackIntegrationError(404, "연결된 Slack 채널이 없습니다.");
  }
  return { ok: true as const };
}

export function buildOrgSlackCallbackPath(args: {
  error?: string | null;
  returnTo: string;
  result: "connected" | "error";
}) {
  const url = new URL(args.returnTo, "https://harper.local");
  url.searchParams.set("slack", args.result);
  if (args.error) url.searchParams.set("slackMessage", args.error);
  return `${url.pathname}${url.search}`;
}

export function readOrgSlackOAuthStateReturnTo(state: string) {
  return decodeOAuthState(state).returnTo;
}

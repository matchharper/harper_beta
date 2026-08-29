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
  insertOrgAgentMessage,
  type OrgAgentConversationRow,
} from "@/lib/org/agent/store";
import type {
  OrgAgentMention,
  OrgAgentMessageMetadata,
} from "@/lib/org/agent/types";
import {
  getOrgPermissions,
  normalizeOrgMembershipRole,
} from "@/lib/org/permissions";
import {
  filterUnclaimedSlackChannels,
  shouldRevokeSlackBotToken,
} from "@/lib/org/slackWorkspaceRouting";
import type { HarperSlackBlock } from "@/lib/org/slackChoiceButtons";
import {
  buildHarperSlackFileFallbackPrompt,
  selectPendingHarperSlackFiles,
  type HarperSlackFile,
} from "@/lib/org/slackFiles";
import { buildHarperSlackWelcomeMessage } from "@/lib/org/slackWelcome";
import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  applyHarperSlackApiMessagePolicy,
  createSlackApiRequest,
} from "./slackApiRequest";
import {
  getSlackChannelNameError,
  normalizeSlackChannelName,
  SLACK_CHANNEL_CREATION_SCOPES,
} from "./slackChannelCreation";

const CALLBACK_PATH = "/api/org/slack/callback";
const STATE_TTL_MS = 10 * 60 * 1000;
const BOT_SCOPE_LIST = [
  "app_mentions:read",
  "channels:history",
  "channels:join",
  ...SLACK_CHANNEL_CREATION_SCOPES,
  "channels:read",
  "chat:write",
  "files:read",
  "groups:history",
  "groups:read",
  "users:read",
  "users:read.email",
] as const;
const BOT_SCOPES = BOT_SCOPE_LIST.join(",");

type OAuthState = {
  issuedAt: number;
  returnTo: string;
  userId: string;
  workspaceId: string;
};

type SlackApiResult = {
  app_id?: string;
  access_token?: string;
  bot_user_id?: string;
  error?: string;
  file?: HarperSlackFile;
  ok?: boolean;
  scope?: string;
  team?: { id?: string; name?: string };
  channel?: Record<string, unknown>;
  channels?: Array<Record<string, unknown>>;
  has_more?: boolean;
  messages?: Array<{
    bot_id?: string;
    files?: HarperSlackFile[];
    subtype?: string;
    text?: string;
    ts?: string;
    user?: string;
  }>;
  permalink?: string;
  response_metadata?: { messages?: string[]; next_cursor?: string };
  ts?: string;
  user?: {
    id?: string;
    name?: string;
    profile?: {
      display_name?: string;
      email?: string;
      real_name?: string;
    };
    real_name?: string;
  };
  view?: {
    hash?: string;
    id?: string;
  };
};

export type HarperSlackInteractionContext = {
  channelId: string | null;
  scopes: string[];
  slackTeamId: string;
  token: string;
  workspaceId: string;
};

export type HarperSlackChannel = {
  channelId: string;
  channelName: string | null;
  defaultRoleId: string | null;
  isEnabled: boolean;
  isPrivate: boolean;
  replyToHarperThreads: boolean;
  respondToMentions: boolean;
};

export type HarperSlackNotificationKey =
  | "candidateAccepted"
  | "candidateRejected"
  | "memberJoined";

export class HarperSlackError extends Error {
  code: string | null;
  status: number;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const text = (value: unknown) => String(value ?? "").trim();

function clientId() {
  const value = text(process.env.SLACK_HARPER_APP_CLIENT_ID);
  if (!value)
    throw new HarperSlackError(503, "Harper Slack Client ID가 없습니다.");
  return value;
}

function clientSecret() {
  const value = text(process.env.SLACK_HARPER_APP_CLIENT_SECRET);
  if (!value)
    throw new HarperSlackError(503, "Harper Slack Client Secret이 없습니다.");
  return value;
}

function appId() {
  const value = text(process.env.SLACK_HARPER_APP_APP_ID);
  if (!value)
    throw new HarperSlackError(503, "Harper Slack App ID가 없습니다.");
  return value;
}

function localDevelopmentValue(name: string) {
  if (process.env.NODE_ENV === "production") return "";
  return text(process.env[name]);
}

function signingSecret() {
  const value = text(process.env.SLACK_HARPER_APP_SIGNING_SECRET);
  if (!value)
    throw new HarperSlackError(503, "Harper Slack Signing Secret이 없습니다.");
  return value;
}

function redirectUri(origin: string) {
  return (
    text(process.env.SLACK_HARPER_APP_REDIRECT_URI) ||
    new URL(CALLBACK_PATH, origin).toString()
  );
}

function returnTo(value: unknown, workspaceId: string) {
  const fallback = `/org/settings?orgId=${encodeURIComponent(workspaceId)}`;
  try {
    const url = new URL(text(value) || fallback, "https://harper.local");
    if (
      url.origin !== "https://harper.local" ||
      !["/org", "/org/settings"].includes(url.pathname)
    )
      return fallback;
    url.searchParams.delete("slack");
    url.searchParams.delete("slackMessage");
    url.searchParams.set("orgId", workspaceId);
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function encodeState(state: OAuthState) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", clientSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function decodeState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature)
    throw new HarperSlackError(400, "잘못된 OAuth state입니다.");
  const expected = createHmac("sha256", clientSecret())
    .update(payload)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new HarperSlackError(400, "잘못된 OAuth state입니다.");
  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString()
  ) as OAuthState;
  if (
    !parsed.userId ||
    !parsed.workspaceId ||
    !Number.isFinite(parsed.issuedAt) ||
    Date.now() - parsed.issuedAt > STATE_TTL_MS
  )
    throw new HarperSlackError(400, "OAuth 요청이 만료되었습니다.");
  return { ...parsed, returnTo: returnTo(parsed.returnTo, parsed.workspaceId) };
}

function cryptKey() {
  return createHash("sha256")
    .update(
      text(process.env.SLACK_HARPER_APP_TOKEN_ENCRYPTION_KEY) || clientSecret()
    )
    .digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return `v1:${iv.toString("base64url")}:${cipher
    .getAuthTag()
    .toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptHarperSlackToken(value: string) {
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Unsupported Harper Slack token ciphertext");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    cryptKey(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function assertAccess(user: User, workspaceId: string, manage = false) {
  const admin = getSupabaseAdmin();
  const { data: workspace, error } = await (
    admin.from("company_workspace" as any) as any
  )
    .select("company_workspace_id, company_name, is_internal")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!workspace)
    throw new HarperSlackError(404, "Workspace를 찾지 못했습니다.");
  if (getEmailDomain(user.email) === INTERNAL_EMAIL_DOMAIN) {
    if (!workspace.is_internal)
      throw new HarperSlackError(403, "접근 권한이 없습니다.");
    return workspace;
  }
  const { data: membership, error: membershipError } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select("authority")
    .eq("company_user_id", user.id)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new HarperSlackError(403, "접근 권한이 없습니다.");
  if (
    manage &&
    !getOrgPermissions(normalizeOrgMembershipRole(membership.authority))
      .canManageIntegrations
  )
    throw new HarperSlackError(403, "Slack 설정을 변경할 권한이 없습니다.");
  return workspace;
}

export async function slackApi<T extends SlackApiResult>(
  token: string,
  method: string,
  body: Record<string, unknown> = {}
) {
  const response = await fetch(
    `https://slack.com/api/${method}`,
    createSlackApiRequest(token, applyHarperSlackApiMessagePolicy(method, body))
  );
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload?.ok) {
    const validationDetails = payload?.response_metadata?.messages
      ?.map((message) => text(message))
      .filter(Boolean)
      .join("; ");
    throw new HarperSlackError(
      502,
      `Slack API ${method} 실패: ${payload?.error || response.status}${validationDetails ? ` (${validationDetails})` : ""}`,
      text(payload?.error) || null
    );
  }
  return payload;
}

async function installation(workspaceId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .select("*")
    .eq("company_workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, any> | null;
}

export async function resolveHarperSlackInteractionContext(args: {
  channelId?: string | null;
  slackTeamId: string;
  workspaceId?: string | null;
}): Promise<HarperSlackInteractionContext> {
  const admin = getSupabaseAdmin();
  const slackTeamId = text(args.slackTeamId);
  const requestedWorkspaceId = text(args.workspaceId);
  const channelId = text(args.channelId);
  if (!slackTeamId || (!requestedWorkspaceId && !channelId)) {
    throw new HarperSlackError(400, "Slack workspace 정보를 찾지 못했습니다.");
  }

  let workspaceId = requestedWorkspaceId;
  if (channelId) {
    const { data: channel, error: channelError } = await (
      admin.from("company_slack_channels" as any) as any
    )
      .select("company_workspace_id")
      .eq("slack_team_id", slackTeamId)
      .eq("slack_channel_id", channelId)
      .eq("is_enabled", true)
      .maybeSingle();
    if (channelError) throw channelError;
    if (!channel) {
      throw new HarperSlackError(404, "활성 Slack 채널을 찾지 못했습니다.");
    }
    workspaceId = text(channel.company_workspace_id);
    if (requestedWorkspaceId && requestedWorkspaceId !== workspaceId) {
      throw new HarperSlackError(403, "Slack workspace가 일치하지 않습니다.");
    }
  }

  const { data: row, error } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .select("company_workspace_id, bot_token_ciphertext, scopes, slack_team_id")
    .eq("company_workspace_id", workspaceId)
    .eq("slack_team_id", slackTeamId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!row?.bot_token_ciphertext) {
    throw new HarperSlackError(404, "연결된 Slack을 찾지 못했습니다.");
  }
  return {
    channelId: channelId || null,
    scopes: Array.isArray(row.scopes)
      ? row.scopes.map(text).filter(Boolean)
      : [],
    slackTeamId,
    token:
      localDevelopmentValue("SLACK_HARPER_LOCAL_BOT_TOKEN") ||
      decryptHarperSlackToken(row.bot_token_ciphertext),
    workspaceId,
  };
}

export async function getHarperSlackUserEmail(args: {
  token: string;
  userId: string;
}) {
  const response = await slackApi<SlackApiResult>(args.token, "users.info", {
    user: text(args.userId),
  });
  return text(response.user?.profile?.email).toLowerCase() || null;
}

export async function getHarperSlackFileInfo(args: {
  fileId: string;
  token: string;
}) {
  const response = await slackApi<SlackApiResult>(args.token, "files.info", {
    file: text(args.fileId),
  });
  if (!response.file) {
    throw new HarperSlackError(502, "Slack 파일 정보를 받지 못했습니다.");
  }
  return response.file;
}

export async function openHarperSlackModal(args: {
  token: string;
  triggerId: string;
  view: Record<string, unknown>;
}) {
  return slackApi<SlackApiResult>(args.token, "views.open", {
    trigger_id: args.triggerId,
    view: JSON.stringify(args.view),
  });
}

export async function pushHarperSlackModal(args: {
  token: string;
  triggerId: string;
  view: Record<string, unknown>;
}) {
  return slackApi<SlackApiResult>(args.token, "views.push", {
    trigger_id: args.triggerId,
    view: JSON.stringify(args.view),
  });
}

export async function updateHarperSlackModal(args: {
  hash?: string | null;
  token: string;
  view: Record<string, unknown>;
  viewId: string;
}) {
  return slackApi<SlackApiResult>(args.token, "views.update", {
    ...(text(args.hash) ? { hash: text(args.hash) } : {}),
    view: JSON.stringify(args.view),
    view_id: args.viewId,
  });
}

export async function createHarperSlackAuthorizeUrl(args: {
  origin: string;
  returnTo?: string | null;
  user: User;
  workspaceId: string;
}) {
  const workspaceId = text(args.workspaceId);
  if (!workspaceId)
    throw new HarperSlackError(400, "workspaceId가 필요합니다.");
  await assertAccess(args.user, workspaceId, true);
  const state = encodeState({
    issuedAt: Date.now(),
    returnTo: returnTo(args.returnTo, workspaceId),
    userId: args.user.id,
    workspaceId,
  });
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri(args.origin));
  url.searchParams.set("scope", BOT_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export function readHarperSlackStateReturnTo(value: string) {
  return decodeState(value).returnTo;
}

export async function completeHarperSlackOAuth(args: {
  code: string;
  origin: string;
  state: string;
}) {
  const state = decodeState(args.state);
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code: text(args.code),
      redirect_uri: redirectUri(args.origin),
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = (await response
    .json()
    .catch(() => null)) as SlackApiResult | null;
  const token = text(payload?.access_token);
  const teamId = text(payload?.team?.id);
  const botUserId = text(payload?.bot_user_id);
  if (!response.ok || !payload?.ok || !token || !teamId || !botUserId)
    throw new HarperSlackError(
      502,
      `Slack 연결 실패: ${payload?.error || response.status}`
    );
  const configuredAppId = appId();
  if (payload.app_id && payload.app_id !== configuredAppId)
    throw new HarperSlackError(409, "다른 Slack App의 OAuth 응답입니다.");
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await (
    admin.from("company_slack_integrations" as any) as any
  ).upsert(
    {
      bot_token_ciphertext: encryptToken(token),
      company_workspace_id: state.workspaceId,
      installed_at: now,
      installed_by_user_id: state.userId,
      scopes: text(payload.scope).split(",").filter(Boolean),
      slack_app_id: configuredAppId,
      slack_bot_user_id: botUserId,
      slack_team_id: teamId,
      slack_team_name: text(payload.team?.name) || null,
      status: "active",
      updated_at: now,
    },
    { onConflict: "company_workspace_id" }
  );
  if (error) throw error;

  const { error: channelCleanupError } = await (
    admin.from("company_slack_channels" as any) as any
  )
    .delete()
    .eq("company_workspace_id", state.workspaceId)
    .neq("slack_team_id", teamId);
  if (channelCleanupError) throw channelCleanupError;
  return state.returnTo;
}

export async function listHarperSlackChannels(token: string) {
  const result: HarperSlackChannel[] = [];
  let cursor = "";
  do {
    const payload = await slackApi<SlackApiResult>(
      token,
      "conversations.list",
      {
        cursor,
        exclude_archived: true,
        limit: 200,
        types: "public_channel,private_channel",
      }
    );
    for (const channel of payload.channels ?? []) {
      result.push({
        channelId: text(channel.id),
        channelName: text(channel.name) || null,
        defaultRoleId: null,
        isEnabled: false,
        isPrivate: Boolean(channel.is_private),
        replyToHarperThreads: false,
        respondToMentions: true,
      });
    }
    cursor = text(payload.response_metadata?.next_cursor);
  } while (cursor);
  return result.filter((channel) => channel.channelId);
}

export async function getHarperSlackStatus(args: {
  user: User;
  workspaceId: string;
}) {
  const workspaceId = text(args.workspaceId);
  await assertAccess(args.user, workspaceId);
  const row = await installation(workspaceId);
  if (!row)
    return {
      availableChannels: [] as HarperSlackChannel[],
      channels: [] as HarperSlackChannel[],
      canCreateChannels: false,
      connected: false,
      needsReinstall: false,
      teamId: null,
      teamName: null,
    };
  const admin = getSupabaseAdmin();
  const { data, error } = await (
    admin.from("company_slack_channels" as any) as any
  )
    .select("*")
    .eq("company_workspace_id", workspaceId)
    .eq("slack_team_id", row.slack_team_id)
    .order("slack_channel_name");
  if (error) throw error;
  const channels: HarperSlackChannel[] = (data ?? []).map((channel: any) => ({
    channelId: channel.slack_channel_id,
    channelName: channel.slack_channel_name,
    defaultRoleId: channel.default_role_id,
    isEnabled: channel.is_enabled,
    isPrivate: channel.is_private,
    replyToHarperThreads: channel.reply_to_harper_threads,
    respondToMentions: channel.respond_to_mentions,
  }));

  const { data: claimRows, error: claimError } = await (
    admin.from("company_slack_channels" as any) as any
  )
    .select("slack_channel_id")
    .eq("slack_team_id", row.slack_team_id);
  if (claimError) throw claimError;
  const claimedChannelIds = (claimRows ?? []).map(
    (claim: { slack_channel_id: string }) => claim.slack_channel_id
  );
  let availableChannels: HarperSlackChannel[] = [];
  try {
    const listed = await listHarperSlackChannels(
      decryptHarperSlackToken(row.bot_token_ciphertext)
    );
    availableChannels = filterUnclaimedSlackChannels(listed, claimedChannelIds);
  } catch (error) {
    console.error("[harper-slack] channel list", error);
  }
  const grantedScopes = (Array.isArray(row.scopes) ? row.scopes : []).map(text);
  return {
    availableChannels,
    channels,
    canCreateChannels: SLACK_CHANNEL_CREATION_SCOPES.every((scope) =>
      grantedScopes.includes(scope)
    ),
    connected: true,
    needsReinstall: !["files:read", "users:read.email"].every((scope) =>
      grantedScopes.includes(scope)
    ),
    teamId: row.slack_team_id,
    teamName: row.slack_team_name,
  };
}

async function persistHarperSlackChannel(args: {
  channelId: string;
  channelName: string | null;
  isPrivate: boolean;
  slackTeamId: string;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const { error } = await (
    admin.from("company_slack_channels" as any) as any
  ).upsert(
    {
      default_role_id: null,
      company_workspace_id: args.workspaceId,
      is_enabled: true,
      is_private: args.isPrivate,
      reply_to_harper_threads: true,
      slack_channel_id: args.channelId,
      slack_channel_name: args.channelName,
      slack_team_id: args.slackTeamId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_workspace_id,slack_channel_id" }
  );
  if ((error as { code?: string } | null)?.code === "23505") {
    throw new HarperSlackError(
      409,
      "이 Slack 채널은 다른 Harper Workspace에 연결되어 있어요."
    );
  }
  if (error) throw error;
}

export async function addHarperSlackChannel(args: {
  channelId: string;
  user: User;
  workspaceId: string;
}) {
  await assertAccess(args.user, args.workspaceId, true);
  const row = await installation(args.workspaceId);
  if (!row) throw new HarperSlackError(404, "Slack을 먼저 연결해 주세요.");
  const token = decryptHarperSlackToken(row.bot_token_ciphertext);
  const info = await slackApi<SlackApiResult>(token, "conversations.info", {
    channel: args.channelId,
  });
  const channel = info.channel ?? {};
  const isPrivate = Boolean(channel.is_private);
  if (!isPrivate)
    await slackApi(token, "conversations.join", { channel: args.channelId });
  await persistHarperSlackChannel({
    channelId: args.channelId,
    channelName: text(channel.name) || null,
    isPrivate,
    slackTeamId: row.slack_team_id,
    workspaceId: args.workspaceId,
  });

  await postHarperSlackMessage({
    channelId: args.channelId,
    text: buildHarperSlackWelcomeMessage({
      botUserId: row.slack_bot_user_id,
      publicSiteUrl:
        text(process.env.NEXT_PUBLIC_SITE_URL) ||
        text(process.env.NEXT_PUBLIC_APP_URL) ||
        text(process.env.APP_BASE_URL),
      workspaceId: args.workspaceId,
    }),
    token,
  });

  return { ok: true as const };
}

function toHarperSlackChannelCreationError(error: unknown) {
  if (!(error instanceof HarperSlackError)) return error;
  if (error.code === "name_taken") {
    return new HarperSlackError(
      409,
      "같은 이름의 Slack 채널이 이미 있어요. 다른 이름을 입력해 주세요."
    );
  }
  if (error.code === "missing_scope") {
    return new HarperSlackError(
      409,
      "채널 생성 권한이 없어요. Slack을 다시 연결해 새 권한을 승인해 주세요."
    );
  }
  if (
    error.code === "restricted_action" ||
    error.code === "cannot_create_channel"
  ) {
    return new HarperSlackError(
      403,
      "이 Slack Workspace에서는 Harper가 채널을 만들 수 없어요. Slack 관리자에게 채널 생성 설정을 확인해 주세요."
    );
  }
  if (error.code?.startsWith("invalid_name") || error.code === "no_channel") {
    return new HarperSlackError(
      400,
      "채널 이름을 사용할 수 없어요. 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 입력해 주세요."
    );
  }
  if (error.code === "ratelimited") {
    return new HarperSlackError(
      429,
      "Slack 요청이 많아 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요."
    );
  }
  return error;
}

export async function createHarperSlackChannel(args: {
  channelName: string;
  isPrivate: boolean;
  user: User;
  workspaceId: string;
}) {
  await assertAccess(args.user, args.workspaceId, true);
  const channelName = normalizeSlackChannelName(args.channelName);
  const nameError = getSlackChannelNameError(channelName);
  if (nameError) throw new HarperSlackError(400, nameError);

  const row = await installation(args.workspaceId);
  if (!row) throw new HarperSlackError(404, "Slack을 먼저 연결해 주세요.");
  const grantedScopes = (Array.isArray(row.scopes) ? row.scopes : []).map(text);
  const requiredScope = args.isPrivate ? "groups:write" : "channels:manage";
  if (!grantedScopes.includes(requiredScope)) {
    throw new HarperSlackError(
      409,
      "채널 생성 권한이 없어요. Slack을 다시 연결해 새 권한을 승인해 주세요."
    );
  }

  const token = decryptHarperSlackToken(row.bot_token_ciphertext);
  let created: SlackApiResult;
  try {
    created = await slackApi<SlackApiResult>(token, "conversations.create", {
      is_private: args.isPrivate,
      name: channelName,
    });
  } catch (error) {
    throw toHarperSlackChannelCreationError(error);
  }

  const channel = created.channel ?? {};
  const channelId = text(channel.id);
  if (!channelId) {
    throw new HarperSlackError(
      502,
      "Slack 채널은 만들었지만 채널 정보를 확인하지 못했어요. Slack에서 채널을 확인해 주세요."
    );
  }
  const storedChannelName = text(channel.name) || channelName;
  const isPrivate = Boolean(channel.is_private ?? args.isPrivate);
  try {
    await persistHarperSlackChannel({
      channelId,
      channelName: storedChannelName,
      isPrivate,
      slackTeamId: row.slack_team_id,
      workspaceId: args.workspaceId,
    });
  } catch (error) {
    if (error instanceof HarperSlackError) throw error;
    console.error("[harper-slack] created channel persistence", {
      channelId,
      error,
      workspaceId: args.workspaceId,
    });
    throw new HarperSlackError(
      502,
      `#${storedChannelName} 채널은 Slack에 만들었지만 Harper 연결을 완료하지 못했어요. 이 화면의 기존 채널 목록에서 추가해 주세요.`
    );
  }

  let welcomeMessageSent = true;
  let creatingUserInvited = false;
  const creatingUserEmail = text(args.user.email).toLowerCase();
  if (creatingUserEmail) {
    try {
      const slackUser = await slackApi<SlackApiResult>(
        token,
        "users.lookupByEmail",
        { email: creatingUserEmail }
      );
      const slackUserId = text(slackUser.user?.id);
      if (slackUserId) {
        await slackApi<SlackApiResult>(token, "conversations.invite", {
          channel: channelId,
          users: slackUserId,
        });
        creatingUserInvited = true;
      }
    } catch (error) {
      if (
        error instanceof HarperSlackError &&
        error.code === "already_in_channel"
      ) {
        creatingUserInvited = true;
      } else {
        console.error("[harper-slack] created channel user invite", {
          channelId,
          error,
          workspaceId: args.workspaceId,
        });
      }
    }
  }

  try {
    await postHarperSlackMessage({
      channelId,
      text: buildHarperSlackWelcomeMessage({
        botUserId: row.slack_bot_user_id,
        publicSiteUrl:
          text(process.env.NEXT_PUBLIC_SITE_URL) ||
          text(process.env.NEXT_PUBLIC_APP_URL) ||
          text(process.env.APP_BASE_URL),
        workspaceId: args.workspaceId,
      }),
      token,
    });
  } catch (error) {
    welcomeMessageSent = false;
    console.error("[harper-slack] created channel welcome message", {
      channelId,
      error,
      workspaceId: args.workspaceId,
    });
  }

  return {
    channel: {
      channelId,
      channelName: storedChannelName,
      defaultRoleId: null,
      isEnabled: true,
      isPrivate,
      replyToHarperThreads: true,
      respondToMentions: true,
    } satisfies HarperSlackChannel,
    creatingUserInvited,
    ok: true as const,
    welcomeMessageSent,
  };
}

export async function removeHarperSlackChannel(args: {
  channelId?: string;
  user: User;
  workspaceId: string;
}) {
  await assertAccess(args.user, args.workspaceId, true);
  const row = await installation(args.workspaceId);
  if (!row) throw new HarperSlackError(404, "연결된 Slack이 없습니다.");
  const admin = getSupabaseAdmin();
  if (args.channelId) {
    const { error } = await (admin.from("company_slack_channels" as any) as any)
      .delete()
      .eq("company_workspace_id", args.workspaceId)
      .eq("slack_channel_id", args.channelId);
    if (error) throw error;
  } else {
    const { data: otherConnections, error: otherConnectionsError } = await (
      admin.from("company_slack_integrations" as any) as any
    )
      .select("company_workspace_id")
      .eq("slack_team_id", row.slack_team_id)
      .eq("status", "active")
      .neq("company_workspace_id", args.workspaceId)
      .limit(1);
    if (otherConnectionsError) throw otherConnectionsError;
    if (shouldRevokeSlackBotToken(otherConnections?.length ?? 0)) {
      const token = decryptHarperSlackToken(row.bot_token_ciphertext);
      await slackApi(token, "auth.revoke").catch((error) =>
        console.warn("[harper-slack] auth.revoke", error)
      );
    }
    const { error } = await (
      admin.from("company_slack_integrations" as any) as any
    )
      .delete()
      .eq("company_workspace_id", args.workspaceId);
    if (error) throw error;
  }
  return { ok: true as const };
}

export async function postHarperSlackMessage(args: {
  blocks?: HarperSlackBlock[];
  channelId: string;
  clientMessageId?: string;
  text: string;
  threadTs?: string | null;
  token: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}) {
  return slackApi<SlackApiResult>(args.token, "chat.postMessage", {
    ...(args.blocks ? { blocks: JSON.stringify(args.blocks) } : {}),
    channel: args.channelId,
    ...(args.clientMessageId ? { client_msg_id: args.clientMessageId } : {}),
    text: args.text,
    ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
    ...(args.unfurlLinks === undefined
      ? {}
      : { unfurl_links: args.unfurlLinks }),
    ...(args.unfurlMedia === undefined
      ? {}
      : { unfurl_media: args.unfurlMedia }),
  });
}

export async function getHarperSlackMessagePermalink(args: {
  channelId: string;
  messageTs: string;
  token: string;
}) {
  const result = await slackApi<SlackApiResult>(
    args.token,
    "chat.getPermalink",
    {
      channel: args.channelId,
      message_ts: args.messageTs,
    }
  );
  const permalink = text(result.permalink);
  if (!permalink) {
    throw new HarperSlackError(502, "Slack 메시지 링크를 만들지 못했습니다.");
  }
  return permalink;
}

export async function postHarperSlackEphemeralMessage(args: {
  channelId: string;
  text: string;
  token: string;
  userId: string;
}) {
  return slackApi<SlackApiResult>(args.token, "chat.postEphemeral", {
    channel: args.channelId,
    text: args.text,
    user: args.userId,
  });
}

export async function updateHarperSlackMessage(args: {
  blocks: HarperSlackBlock[];
  channelId: string;
  messageTs: string;
  text: string;
  workspaceId: string;
}) {
  const row = await installation(text(args.workspaceId));
  if (!row) throw new HarperSlackError(404, "연결된 Slack이 없습니다.");
  return slackApi<SlackApiResult>(
    decryptHarperSlackToken(row.bot_token_ciphertext),
    "chat.update",
    {
      blocks: JSON.stringify(args.blocks),
      channel: args.channelId,
      text: args.text,
      ts: args.messageTs,
    }
  );
}

export async function setHarperSlackThreadStatus(args: {
  channelId: string;
  status: string;
  threadTs: string;
  token: string;
}) {
  return slackApi<SlackApiResult>(args.token, "assistant.threads.setStatus", {
    channel_id: args.channelId,
    status: args.status,
    thread_ts: args.threadTs,
  });
}

export function buildHarperSlackClientMessageId(
  idempotencyKey: string,
  channelId: string
) {
  const hex = createHash("sha256")
    .update(["harper-slack", idempotencyKey, channelId].join("\u001f"))
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32),
  ].join("-");
}

async function ensureSlackConversation(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  roleId?: string | null;
  workspaceId: string;
}) {
  const roleId = text(args.roleId);
  const select =
    "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at";
  let existingQuery = (args.admin.from("company_conversations" as any) as any)
    .select(select)
    .eq("company_workspace_id", args.workspaceId);
  existingQuery = roleId
    ? existingQuery.eq("role_id", roleId)
    : existingQuery.is("role_id", null);
  const { data: existing, error: existingError } =
    await existingQuery.maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing as OrgAgentConversationRow;

  const now = new Date().toISOString();
  const { data, error } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .insert({
      company_workspace_id: args.workspaceId,
      created_at: now,
      metadata: roleId
        ? {
            confirmedAssigneeUserId: null,
            confirmedSlackChannelIds: [],
            pendingConfirmationMessageId: null,
            phase: "collecting",
            scope: "role_creation",
          }
        : { scope: "workspace" },
      role_id: roleId || null,
      title: roleId ? "새 역할 등록" : null,
      updated_at: now,
    })
    .select(select)
    .single();
  if (!error) return data as OrgAgentConversationRow;
  if ((error as { code?: string }).code !== "23505") throw error;
  let racedQuery = (args.admin.from("company_conversations" as any) as any)
    .select(select)
    .eq("company_workspace_id", args.workspaceId);
  racedQuery = roleId
    ? racedQuery.eq("role_id", roleId)
    : racedQuery.is("role_id", null);
  const { data: raced, error: racedError } = await racedQuery.single();
  if (racedError) throw racedError;
  return raced as OrgAgentConversationRow;
}

function slackMessageDate(value: string) {
  const seconds = Number(value.split(".")[0]);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1_000).toISOString()
    : new Date().toISOString();
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resolveHarperSlackUserNames(args: {
  botUserId: string;
  canReadUsers: boolean;
  token: string;
  userIds: string[];
}) {
  const names = new Map<string, string>([[args.botUserId, "Harper"]]);
  const userIds = Array.from(
    new Set(args.userIds.map(text).filter(Boolean))
  ).filter((userId) => userId !== args.botUserId);
  if (!args.canReadUsers || userIds.length === 0) return names;

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const result = await slackApi<SlackApiResult>(
          args.token,
          "users.info",
          { user: userId }
        );
        const name =
          text(result.user?.profile?.display_name) ||
          text(result.user?.profile?.real_name) ||
          text(result.user?.real_name) ||
          text(result.user?.name);
        if (name) names.set(userId, name);
      } catch (error) {
        console.warn("[harper-slack] users.info", { userId, error });
      }
    })
  );
  return names;
}

/**
 * Hydrates the Slack thread before an Agent turn. One conversations.replies
 * call avoids multiplying latency/rate-limit cost; subsequent non-triggering
 * replies are captured from Events API delivery by
 * storeHarperSlackThreadEvent.
 */
export async function syncHarperSlackThreadContext(args: {
  botUserId: string;
  channelId: string;
  currentMessageTs: string;
  currentSlackUserId?: string | null;
  roleId?: string | null;
  scopes?: unknown;
  threadId: string;
  threadTs: string;
  token: string;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const conversation = await ensureSlackConversation({
    admin,
    roleId: args.roleId,
    workspaceId: args.workspaceId,
  });
  const roleId = text(args.roleId) || null;
  const replyPage = await slackApi<SlackApiResult>(
    args.token,
    "conversations.replies",
    {
      channel: args.channelId,
      limit: 200,
      ts: args.threadTs,
    }
  );
  const allSlackMessages = replyPage.messages ?? [];
  const pendingUserFiles = selectPendingHarperSlackFiles({
    botUserId: args.botUserId,
    currentMessageTs: args.currentMessageTs,
    messages: allSlackMessages,
  });
  const slackMessages = allSlackMessages.filter(
    (message) =>
      text(message.ts) &&
      (text(message.text) || (message.files ?? []).length > 0)
  );
  const { data: existingData, error: existingError } = await (
    admin.from("company_messages" as any) as any
  )
    .select("id, slack_message_ts, slack_user_id, metadata")
    .eq("message_type", "slack")
    .eq("slack_thread_id", args.threadId);
  if (existingError) throw existingError;
  const existingRows = (existingData ?? []) as Array<{
    id: number;
    metadata: unknown;
    slack_message_ts: string | null;
    slack_user_id: string | null;
  }>;
  const userNames = await resolveHarperSlackUserNames({
    botUserId: args.botUserId,
    canReadUsers:
      Array.isArray(args.scopes) &&
      args.scopes.map(text).includes("users:read"),
    token: args.token,
    userIds: [
      text(args.currentSlackUserId),
      ...slackMessages.map((message) => text(message.user)),
      ...existingRows.map((row) => text(row.slack_user_id)),
    ],
  });
  const existingByTs = new Map(
    existingRows
      .filter((row) => text(row.slack_message_ts))
      .map((row) => [text(row.slack_message_ts), row])
  );

  const metadataUpdates = existingRows.flatMap((row) => {
    const userId = text(row.slack_user_id);
    const slackUserName = userNames.get(userId);
    const metadata = metadataRecord(row.metadata);
    if (!slackUserName || metadata.slackUserName === slackUserName) return [];
    return [
      (admin.from("company_messages" as any) as any)
        .update({ metadata: { ...metadata, slackUserName } })
        .eq("id", row.id),
    ];
  });
  if (metadataUpdates.length > 0) {
    const updateResults = await Promise.all(metadataUpdates);
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) throw updateError;
  }

  const newRows = slackMessages.flatMap((message) => {
    const messageTs = text(message.ts);
    if (
      messageTs === text(args.currentMessageTs) ||
      existingByTs.has(messageTs)
    ) {
      return [];
    }
    const userId = text(message.user);
    const content = buildHarperSlackFileFallbackPrompt(
      stripSlackSentUsingAttribution(
        text(message.text).replaceAll(`<@${args.botUserId}>`, "")
      ),
      message.files
    );
    if (!content) return [];
    return [
      {
        company_user_id: null,
        company_workspace_id: args.workspaceId,
        content,
        conversation_id: conversation.id,
        created_at: slackMessageDate(messageTs),
        mentions: [],
        message_type: "slack",
        metadata: {
          source: "slack_thread_sync",
          ...(userNames.get(userId)
            ? { slackUserName: userNames.get(userId) }
            : {}),
        },
        model: null,
        role: userId === args.botUserId ? "assistant" : "user",
        role_id: roleId,
        slack_message_ts: messageTs,
        slack_thread_id: args.threadId,
        slack_user_id: userId || null,
        status: "completed",
        thinking_logs: [],
      },
    ];
  });
  if (newRows.length > 0) {
    const { error } = await (
      admin.from("company_messages" as any) as any
    ).insert(newRows);
    if (error && (error as { code?: string }).code !== "23505") throw error;
  }

  return {
    currentSlackUserName: userNames.get(text(args.currentSlackUserId)) || null,
    historyTruncated: Boolean(
      replyPage.has_more || text(replyPage.response_metadata?.next_cursor)
    ),
    pendingUserFiles,
    syncedMessageCount: newRows.length,
  };
}

export async function storeHarperSlackThreadEvent(args: {
  content: string;
  roleId?: string | null;
  slackMessageTs: string;
  slackUserId?: string | null;
  threadId: string;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const conversation = await ensureSlackConversation({
    admin,
    roleId: args.roleId,
    workspaceId: args.workspaceId,
  });
  try {
    return await insertOrgAgentMessage({
      admin,
      content: text(args.content),
      conversation,
      messageType: "slack",
      metadata: { source: "slack_thread_event" },
      role: "user",
      roleId: text(args.roleId) || null,
      slackMessageTs: text(args.slackMessageTs),
      slackThreadId: args.threadId,
      slackUserId: text(args.slackUserId) || null,
      userId: null,
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return null;
    throw error;
  }
}

export async function sendHarperWorkspaceSlackMessage(args: {
  blocks?: HarperSlackBlock[];
  channelId?: string;
  idempotencyKey?: string;
  messageMetadata?: OrgAgentMessageMetadata;
  mentions?: OrgAgentMention[];
  notificationKey?: HarperSlackNotificationKey;
  /** Skip persisting the Slack post in /org when another atomic writer saves it. */
  recordConversationMessage?: boolean;
  roleId?: string | null;
  text: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  workspaceId: string;
}) {
  const row = await installation(text(args.workspaceId));
  if (!row) return false;
  const admin = getSupabaseAdmin();
  let query = (admin.from("company_slack_channels" as any) as any)
    .select("*")
    .eq("company_workspace_id", row.company_workspace_id)
    .eq("slack_team_id", row.slack_team_id)
    .eq("is_enabled", true);
  if (text(args.channelId))
    query = query.eq("slack_channel_id", text(args.channelId));
  if (args.notificationKey === "candidateAccepted")
    query = query.eq("notify_candidate_accepted", true);
  if (args.notificationKey === "candidateRejected")
    query = query.eq("notify_candidate_rejected", true);
  if (args.notificationKey === "memberJoined")
    query = query.eq("notify_member_joined", true);
  const { data: channelRows, error } = await query;
  if (error) throw error;
  let channels = channelRows ?? [];
  const roleId = text(args.roleId);
  if (roleId && channels.length > 0) {
    const { data: optOutRows, error: optOutError } = await (
      admin.from("company_role_notification_channels" as any) as any
    )
      .select("channel_id")
      .eq("role_id", roleId);
    if (optOutError) throw optOutError;
    const disabledChannelIds = new Set(
      (optOutRows ?? []).map(
        (optOut: { channel_id: string }) => optOut.channel_id
      )
    );
    channels = channels.filter(
      (channel: { id: string }) => !disabledChannelIds.has(channel.id)
    );
  }
  if (channels.length === 0) return false;
  const token = decryptHarperSlackToken(row.bot_token_ciphertext);
  const results = await Promise.allSettled(
    channels.map(async (channel: any) => {
      const posted = await postHarperSlackMessage({
        blocks: args.blocks,
        channelId: channel.slack_channel_id,
        clientMessageId: text(args.idempotencyKey)
          ? buildHarperSlackClientMessageId(
              text(args.idempotencyKey),
              channel.slack_channel_id
            )
          : undefined,
        text: args.text,
        token,
        unfurlLinks: args.unfurlLinks,
        unfurlMedia: args.unfurlMedia,
      });
      if (posted.ts) {
        const { data: thread, error: threadError } = await (
          admin.from("company_slack_threads" as any) as any
        )
          .upsert(
            {
              channel_id: channel.id,
              created_by_harper: true,
              role_id: roleId || null,
              slack_thread_ts: posted.ts,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "channel_id,slack_thread_ts" }
          )
          .select("id")
          .single();
        if (threadError) throw threadError;
        if (args.recordConversationMessage === false) return;
        const conversation = await ensureSlackConversation({
          admin,
          roleId: roleId || null,
          workspaceId: row.company_workspace_id,
        });
        await insertOrgAgentMessage({
          admin,
          content: args.text,
          conversation,
          messageType: "slack",
          metadata: {
            ...args.messageMetadata,
            source: args.messageMetadata?.source || "slack_notification",
          },
          mentions: args.mentions,
          role: "assistant",
          roleId: roleId || null,
          slackMessageTs: posted.ts,
          slackThreadId: thread.id,
          slackUserId: row.slack_bot_user_id,
        });
      }
    })
  );
  if (results.every((result) => result.status === "rejected"))
    throw (results[0] as PromiseRejectedResult).reason;
  return results.some((result) => result.status === "fulfilled");
}

export async function sendHarperSlackThreadReply(args: {
  idempotencyKey: string;
  text: string;
  threadId: string;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const { data: thread, error } = await (
    admin.from("company_slack_threads" as any) as any
  )
    .select(
      "id, slack_thread_ts, channel:company_slack_channels!inner(slack_channel_id, company_workspace_id)"
    )
    .eq("id", args.threadId)
    .maybeSingle();
  if (error) throw error;
  const channel = Array.isArray(thread?.channel)
    ? thread.channel[0]
    : thread?.channel;
  if (
    !thread ||
    !channel ||
    text(channel.company_workspace_id) !== text(args.workspaceId)
  ) {
    throw new HarperSlackError(404, "원래 Slack 대화를 찾지 못했습니다.");
  }
  const integration = await installation(args.workspaceId);
  if (!integration) {
    throw new HarperSlackError(404, "연결된 Slack이 없습니다.");
  }
  const posted = await postHarperSlackMessage({
    channelId: text(channel.slack_channel_id),
    clientMessageId: buildHarperSlackClientMessageId(
      args.idempotencyKey,
      text(channel.slack_channel_id)
    ),
    text: args.text,
    threadTs: text(thread.slack_thread_ts),
    token: decryptHarperSlackToken(integration.bot_token_ciphertext),
  });
  if (!posted.ts) throw new Error("Slack reply did not return a timestamp");
  return {
    botUserId: text(integration.slack_bot_user_id),
    slackMessageTs: posted.ts,
  };
}

export function verifyHarperSlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string
) {
  const epoch = Number(timestamp);
  if (!Number.isFinite(epoch) || Math.abs(Date.now() / 1000 - epoch) > 300)
    return false;
  const expected = createHmac("sha256", signingSecret())
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
  const actual = text(signature).replace(/^v0=/, "");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function isHarperSlackAppId(value: unknown) {
  const candidate = text(value);
  return (
    candidate === appId() ||
    candidate === localDevelopmentValue("SLACK_HARPER_LOCAL_APP_ID")
  );
}

export function buildHarperSlackCallbackPath(args: {
  error?: string | null;
  result: "connected" | "error";
  returnTo: string;
}) {
  const url = new URL(args.returnTo, "https://harper.local");
  url.searchParams.set("slack", args.result);
  if (args.error) url.searchParams.set("slackMessage", args.error);
  return `${url.pathname}${url.search}`;
}

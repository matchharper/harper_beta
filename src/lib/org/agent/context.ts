import type { User } from "@supabase/supabase-js";
import { getLlmErrorMessage } from "@/lib/llm/llm";
import {
  fetchOrgAgentRoles,
  fetchRecentOrgAgentRecommendations,
  getOrgAgentTalents,
  type OrgAgentAdminClient,
} from "@/lib/org/agent/data";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import {
  fetchRecentOrgAgentPromptMessages,
  fetchRecentOrgAgentSummaries,
  fetchWorkspaceForOrgAgent,
} from "@/lib/org/agent/store";
import {
  clipPromptText,
  formatPromptCell,
  formatPromptDate,
  formatPromptSection,
  formatPromptTable,
} from "@/lib/org/agent/promptFormat";
import type {
  OrgAgentMention,
  OrgAgentMentionCandidate,
} from "@/lib/org/agent/types";
import {
  assertOrgWorkspacePermission,
  fetchOrgBoard,
  OrgHttpError,
  upsertOrgCompanyUser,
} from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export type OrgAgentPromptContext = {
  companyText: string;
  completeRoleRequestIds: string[];
  contextNotesText: string;
  conversationText: string;
  recentRecommendationsText: string;
  roles: Awaited<ReturnType<typeof fetchOrgAgentRoles>>;
  rolesText: string;
  summariesText: string;
  workspace: Awaited<ReturnType<typeof fetchWorkspaceForOrgAgent>>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function stripSerializedMentionIds(value: string) {
  return value.replace(/@\[([^\]]+)\]\(talent:[^)]+\)/g, "@$1");
}

async function optionalContext<T>(args: {
  fallback: T;
  label: string;
  task: () => Promise<T>;
}) {
  try {
    return await args.task();
  } catch (error) {
    console.warn("[org/agent/context]", {
      error: getLlmErrorMessage(error) || String(error),
      label: args.label,
    });
    return args.fallback;
  }
}

function formatRoles(roles: OrgAgentPromptContext["roles"]) {
  if (roles.length === 0) {
    return { completeRoleRequestIds: [], text: "-" };
  }
  const core = formatPromptTable(
    ["role_id", "name", "status", "location", "mode", "employment", "updated"],
    roles.map((role) => [
      role.roleId,
      role.name,
      role.status,
      role.locationText,
      role.workMode,
      role.employmentTypes,
      formatPromptDate(role.updatedAt),
    ]),
    [100, 160, 40, 120, 30, 100, 10]
  );

  // Requests are sparse and variable-length, so keep them out of the core
  // table. Every role stays visible above even when the request budget fills.
  const requestRows: unknown[][] = [];
  const completeRoleRequestIds: string[] = [];
  const omittedRequestRoleIds: string[] = [];
  let requestChars = 0;
  for (const role of roles) {
    const fullRequest = text(role.request).replace(/\s+/g, " ");
    if (!fullRequest) {
      completeRoleRequestIds.push(role.roleId);
      continue;
    }
    const request = clipPromptText(fullRequest, 600);
    if (requestChars + request.length > 8_000) {
      omittedRequestRoleIds.push(role.roleId);
      continue;
    }
    requestChars += request.length;
    requestRows.push([role.roleId, request]);
    if (request === fullRequest) completeRoleRequestIds.push(role.roleId);
  }
  return {
    completeRoleRequestIds,
    text: [
      formatPromptSection("role_core", core),
      formatPromptSection(
        "role_requests",
        formatPromptTable(["role_id", "request"], requestRows, [100, 600])
      ),
      ...(omittedRequestRoleIds.length > 0
        ? [
            formatPromptSection(
              "omitted_role_requests",
              omittedRequestRoleIds.join("\n")
            ),
          ]
        : []),
    ].join("\n"),
  };
}

function formatRecentRecommendations(
  rows: Awaited<ReturnType<typeof fetchRecentOrgAgentRecommendations>>
) {
  return formatPromptTable(
    [
      "talent_id",
      "name",
      "headline",
      "role_id",
      "role",
      "stage",
      "fit",
      "recommended",
    ],
    rows.map((row) => [
      row.candidate.talentId,
      row.candidate.name,
      row.candidate.headline,
      row.role.roleId,
      row.role.name,
      row.stage,
      row.fitSummary,
      formatPromptDate(row.recommendedAt),
    ]),
    [100, 140, 120, 100, 160, 100, 180, 10]
  );
}

function formatConversation(
  messages: Awaited<ReturnType<typeof fetchRecentOrgAgentPromptMessages>>
) {
  if (messages.length === 0) return "-";
  const rows = messages.map((message) => {
    const mentions = message.mentions.length
      ? message.mentions
          .map(
            (mention) =>
              `${clipPromptText(mention.displayName, 80)}[${mention.talentId}@${mention.roleId ?? "-"}]`
          )
          .join(",")
      : null;
    const speaker =
      message.role === "assistant"
        ? "Harper"
        : message.metadata.slackUserName
          ? `${message.metadata.slackUserName} [${message.slackUserId ?? "-"}]`
          : message.slackUserId
            ? `Slack user [${message.slackUserId}]`
            : "user";
    return [
      speaker,
      mentions,
      clipPromptText(stripSerializedMentionIds(message.content), 900),
    ];
  });

  // Keep newest turns when several messages are long. Older durable facts are
  // retained by the conversation summary.
  const selected: unknown[][] = [];
  let totalChars = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    const rowChars = row.reduce<number>(
      (sum, value) => sum + String(value ?? "").length,
      0
    );
    if (selected.length > 0 && totalChars + rowChars > 8_000) break;
    totalChars += rowChars;
    selected.unshift(row);
  }
  return formatPromptTable(
    ["speaker", "mentions", "message"],
    selected,
    [140, 500, 900]
  );
}

function formatSummaries(
  summaries: Awaited<ReturnType<typeof fetchRecentOrgAgentSummaries>>
) {
  if (summaries.length === 0) return "-";
  return summaries
    .map((summary) => formatPromptCell(summary.content, 1_200))
    .filter(Boolean)
    .join("\n---\n");
}

function formatCompany(
  workspace: Awaited<ReturnType<typeof fetchWorkspaceForOrgAgent>>
) {
  return formatPromptTable(
    ["field", "value"],
    [
      ["name", workspace.companyName],
      ["description", clipPromptText(workspace.companyDescription, 8_000)],
      ["pitch", clipPromptText(workspace.pitch, 8_000)],
      ["recruiting_request", clipPromptText(workspace.request, 6_000)],
    ],
    [30, 8_000]
  );
}

/**
 * Builds the data injected on every LLM call.
 *
 * Intentionally small and predictable:
 * - company information
 * - every role in compact form
 * - the 20 most recent candidates visible in the organization pipeline
 * - recent conversation and older summaries
 *
 * Candidate profiles and large role pipelines are never injected here. The
 * model must request those through read_talent/read_role.
 */
export async function buildOrgAgentPromptContext(args: {
  admin: OrgAgentAdminClient;
  beforeMessageId?: number | null;
  conversation: OrgAgentConversationRow;
  slackHistoryTruncated?: boolean;
  user: User;
}) {
  const workspaceId = args.conversation.company_workspace_id;
  const [workspace, roles, recentRecommendations, summaries, messages] =
    await Promise.all([
      fetchWorkspaceForOrgAgent({ admin: args.admin, workspaceId }),
      optionalContext({
        fallback: [],
        label: "roles",
        task: () => fetchOrgAgentRoles({ admin: args.admin, workspaceId }),
      }),
      optionalContext({
        fallback: [],
        label: "recent_recommendations",
        task: () =>
          fetchRecentOrgAgentRecommendations({
            admin: args.admin,
            limit: 20,
            user: args.user,
            workspaceId,
          }),
      }),
      optionalContext({
        fallback: [],
        label: "conversation_summaries",
        task: () =>
          fetchRecentOrgAgentSummaries({
            admin: args.admin,
            conversationId: args.conversation.id,
            limit: 2,
          }),
      }),
      optionalContext({
        fallback: [],
        label: "recent_conversation",
        task: () =>
          fetchRecentOrgAgentPromptMessages({
            admin: args.admin,
            beforeMessageId: args.beforeMessageId,
            conversationId: args.conversation.id,
            limit: 14,
          }),
      }),
    ]);

  const formattedRoles = formatRoles(roles);
  return {
    companyText: formatCompany(workspace),
    completeRoleRequestIds: formattedRoles.completeRoleRequestIds,
    contextNotesText: args.slackHistoryTruncated
      ? "Slack API returned a partial thread page. Use only the synchronized messages available in the shared conversation; do not claim that unseen replies were reviewed."
      : "-",
    conversationText: formatConversation(messages),
    recentRecommendationsText: formatRecentRecommendations(
      recentRecommendations
    ),
    roles,
    rolesText: formattedRoles.text,
    summariesText: formatSummaries(summaries),
    workspace,
  } satisfies OrgAgentPromptContext;
}

export async function searchOrgAgentMentionCandidates(args: {
  query?: string | null;
  roleId?: string | null;
  user: User;
  workspaceId: string;
}): Promise<OrgAgentMentionCandidate[]> {
  const workspaceId = text(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  const admin = getSupabaseAdmin();
  await upsertOrgCompanyUser(admin, args.user);
  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });

  const result = await getOrgAgentTalents({
    admin,
    limit: 12,
    query: args.query,
    roleId: args.roleId,
    user: args.user,
    workspaceId,
  });
  return result.items.map((item) => ({
    headline: item.candidate.headline,
    label: item.candidate.name,
    recommendationId: item.recommendationId,
    roleId: item.role.roleId,
    stage: item.stage,
    subtitle:
      [
        item.role.name,
        item.stage,
        item.candidate.headline,
        item.candidate.email,
      ]
        .filter(Boolean)
        .join(" · ") || item.candidate.talentId,
    talentId: item.candidate.talentId,
  }));
}

/**
 * Mentions coming from a browser are treated as untrusted IDs. Keep only
 * candidates that have at least one recommendation in this workspace.
 */
export async function filterOrgAgentMentionsForWorkspace(args: {
  admin: OrgAgentAdminClient;
  mentions: OrgAgentMention[];
  user: User;
  workspaceId: string;
}) {
  if (unique(args.mentions.map((mention) => mention.talentId)).length === 0) {
    return [];
  }
  const board = await fetchOrgBoard({
    includeInternalStages: true,
    includeProfileLabels: false,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  return args.mentions.flatMap((mention): OrgAgentMention[] => {
    const candidates = board.items.filter(
      (item) =>
        item.talentId === mention.talentId &&
        (!mention.roleId || item.roleId === mention.roleId)
    );
    const preferred =
      candidates.find(
        (item) => item.recommendationId === mention.recommendationId
      ) ?? candidates[0];
    if (!preferred || !text(mention.displayName)) return [];
    return [
      {
        displayName: text(mention.displayName),
        recommendationId: preferred.recommendationId,
        roleId: preferred.roleId,
        talentId: preferred.talentId,
      },
    ];
  });
}

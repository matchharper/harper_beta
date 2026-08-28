import type { User } from "@supabase/supabase-js";
import { getLlmErrorMessage } from "@/lib/llm/llm";
import { createOrgAgentConversationHistoryCursor } from "@/lib/org/agent/conversationHistory";
import {
  fetchOrgAgentPipelineSnapshot,
  fetchOrgAgentRoles,
  fetchRecentOrgAgentRecommendations,
  fetchOrgAgentWorkspaceAvailability,
  getOrgAgentMoreData,
  getOrgAgentTalents,
  type OrgAgentMoreDataResult,
  type OrgAgentAdminClient,
} from "@/lib/org/agent/data";
import type {
  OrgAgentConversationRow,
  OrgAgentPromptMessageScope,
} from "@/lib/org/agent/store";
import {
  fetchActiveOrgAgentRetainedDataActivations,
  fetchRecentOrgAgentPromptMessages,
  fetchRecentOrgAgentSummaries,
  fetchWorkspaceForOrgAgent,
} from "@/lib/org/agent/store";
import {
  clipPromptText,
  formatOrgAgentCompanyContext,
  formatPromptCell,
  formatPromptSection,
  formatPromptTable,
  serializeOrgAgentMoreData,
} from "@/lib/org/agent/promptFormat";
import {
  enforceOrgAgentContextBudget,
  formatRecentRecommendations,
  DEFAULT_RECENT_PIPELINE_MAX_CHARS,
  ORG_AGENT_CONTEXT_MAX_CHARS,
} from "@/lib/org/agent/contextBudget";
import {
  buildDefaultOrgAgentLongTextObservations,
  type OrgAgentLongTextObservation,
} from "@/lib/org/agent/contextVisibility";
import {
  fetchPendingOrgAgentUpdateProposal,
  formatPendingOrgAgentUpdateProposal,
} from "@/lib/org/agent/proposals";
import type {
  OrgAgentMention,
  OrgAgentMentionCandidate,
  OrgAgentReadAudience,
} from "@/lib/org/agent/types";
import {
  assertOrgWorkspacePermission,
  fetchOrgBoard,
  OrgHttpError,
  upsertOrgCompanyUser,
} from "@/lib/org/server";
import {
  humanizeOrgRoleStatus,
  humanizeOrgStage,
  humanizeOrgWorkMode,
} from "@/lib/org/pipelineStage";
import { filterOrgAgentMentionCandidates } from "@/lib/org/agent/mentionCandidates";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { formatInProgressSlackRoleCreations } from "@/lib/org/agent/slackRoleCreation";
import { fetchCompanyTalentContactDraftsForScope } from "@/lib/companyTalentRequests/server";

export type OrgAgentPromptContext = {
  companyText: string;
  completeRoleRequestIds: string[];
  contactDraftsText?: string;
  contextNotesText: string;
  conversationText: string;
  defaultLongTextObservations?: OrgAgentLongTextObservation[];
  inProgressRoleCreationsText?: string;
  pendingUpdateText?: string;
  recentRecommendationsText: string;
  retainedDataText?: string;
  retainedMoreData?: OrgAgentMoreDataResult | null;
  roles: Awaited<ReturnType<typeof fetchOrgAgentRoles>>;
  rolesText: string;
  summariesText: string;
  workspace: Awaited<ReturnType<typeof fetchWorkspaceForOrgAgent>>;
};

export const DEFAULT_DATA_CONTEXT_MAX_CHARS = 18_000;
export const DEFAULT_ROLE_INDEX_MAX_ITEMS = 100;
export const DEFAULT_ROLE_INDEX_MAX_CHARS = 10_000;
export const CONVERSATION_CONTEXT_MAX_CHARS = 12_000;
export {
  enforceOrgAgentContextBudget,
  formatRecentRecommendations,
  DEFAULT_RECENT_PIPELINE_MAX_CHARS,
  ORG_AGENT_CONTEXT_MAX_CHARS,
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
  onError?: () => void;
  task: () => Promise<T>;
}) {
  try {
    return await args.task();
  } catch (error) {
    console.warn("[org/agent/context]", {
      error: getLlmErrorMessage(error) || String(error),
      label: args.label,
    });
    args.onError?.();
    return args.fallback;
  }
}

function formatRoles(
  roles: OrgAgentPromptContext["roles"],
  countsByRoleId:
    | Awaited<
        ReturnType<typeof fetchOrgAgentPipelineSnapshot>
      >["countsByRoleId"]
    | null
) {
  if (roles.length === 0) {
    return {
      completeRoleRequestIds: [],
      emptyLongTextObservations: [],
      text: "total_roles=0 returned_roles=0 role_index_truncated=false\n-",
    };
  }
  const selected: typeof roles = [];
  for (const role of roles.slice(0, DEFAULT_ROLE_INDEX_MAX_ITEMS)) {
    const candidate = [...selected, role];
    const table = formatPromptTable(
      [
        "role_id",
        "title",
        "status",
        "location",
        "work_mode",
        "salary",
        "waiting",
        "active",
        "ended",
        "counts_complete",
        "has_request",
        "has_structured_criteria",
        "has_memory",
        "has_description",
      ],
      candidate.map((item) => {
        const counts = countsByRoleId?.get(item.roleId);
        return [
          item.roleId,
          item.name,
          humanizeOrgRoleStatus(item.status),
          item.locationText,
          humanizeOrgWorkMode(item.workMode),
          item.salaryRange,
          counts?.waiting ?? "unavailable",
          counts?.active ?? "unavailable",
          counts?.ended ?? "unavailable",
          counts?.complete ?? false,
          Boolean(text(item.request)),
          item.criteria.length >= 3,
          Boolean(item.hasMemory),
          Boolean(text(item.description)),
        ];
      }),
      [100, 180, 100, 100, 40, 180, 12, 12, 12, 8, 8, 8, 8]
    );
    if (table.length > DEFAULT_ROLE_INDEX_MAX_CHARS) break;
    selected.push(role);
  }
  const table = formatPromptTable(
    [
      "role_id",
      "title",
      "status",
      "location",
      "work_mode",
      "salary",
      "waiting",
      "active",
      "ended",
      "counts_complete",
      "has_request",
      "has_structured_criteria",
      "has_memory",
      "has_description",
    ],
    selected.map((role) => {
      const counts = countsByRoleId?.get(role.roleId);
      return [
        role.roleId,
        role.name,
        humanizeOrgRoleStatus(role.status),
        role.locationText,
        humanizeOrgWorkMode(role.workMode),
        role.salaryRange,
        counts?.waiting ?? "unavailable",
        counts?.active ?? "unavailable",
        counts?.ended ?? "unavailable",
        counts?.complete ?? false,
        Boolean(text(role.request)),
        role.criteria.length >= 3,
        Boolean(role.hasMemory),
        Boolean(text(role.description)),
      ];
    }),
    [100, 180, 100, 100, 40, 180, 12, 12, 12, 8, 8, 8, 8]
  );
  return {
    completeRoleRequestIds: selected
      .filter((role) => !text(role.request))
      .map((role) => role.roleId),
    emptyLongTextObservations: selected.flatMap((role) => [
      ...(!text(role.request)
        ? [
            {
              key: "role_request" as const,
              roleId: role.roleId,
              value: null,
            },
          ]
        : []),
      ...(!role.hasMemory
        ? [
            {
              key: "role_memory" as const,
              roleId: role.roleId,
              value: null,
            },
          ]
        : []),
      ...(!text(role.description)
        ? [
            {
              key: "role_description" as const,
              roleId: role.roleId,
              value: null,
            },
          ]
        : []),
    ]),
    text: [
      `total_roles=${roles.length} returned_roles=${selected.length} role_index_truncated=${selected.length < roles.length}`,
      table,
    ].join("\n"),
  };
}

function formatConversation(
  page: Awaited<ReturnType<typeof fetchRecentOrgAgentPromptMessages>>,
  slackThreadId: string | null
) {
  const messages = page.messages;
  if (messages.length === 0) {
    return slackThreadId
      ? "scope=current_thread returned_items=0 has_more=false next_cursor=-"
      : "-";
  }
  const slackAliasById = new Map<string, string>();
  const slackAlias = (slackUserId: string) => {
    const existing = slackAliasById.get(slackUserId);
    if (existing) return existing;
    const next = `Slack participant ${slackAliasById.size + 1}`;
    slackAliasById.set(slackUserId, next);
    return next;
  };
  const rows = messages.map((message) => {
    const references = [
      ...message.mentions.map(
        (mention) =>
          `${clipPromptText(mention.displayName, 80)}[${mention.talentId}@${mention.roleId ?? "-"}]`
      ),
      (message.metadata.candidateConnectionConfirmations ?? [])
        .map((confirmation) =>
          [
            `decision=${confirmation.decision}`,
            `talent_id=${confirmation.talentId}`,
            `role_id=${confirmation.roleId}`,
            `recommendation_id=${confirmation.recommendationId}`,
            `connection_method=${confirmation.connectionMethod ?? "not_selected"}`,
            confirmation.meetingDraft
              ? `meeting_title=${clipPromptText(confirmation.meetingDraft.config.title, 200)};meeting_duration_minutes=${confirmation.meetingDraft.config.durationMinutes}`
              : "",
          ].join(";")
        )
        .map((value) => `candidate_decision_context{${value}}`)
        .join(","),
      message.metadata.contactDraftRef
        ? `candidate_contact_ref{contact_id=${message.metadata.contactDraftRef.contactId};revision=${message.metadata.contactDraftRef.revision}}`
        : "",
    ].filter(Boolean);
    const speaker =
      message.role === "assistant"
        ? "Harper"
        : message.metadata.slackUserName
          ? message.metadata.slackUserName
          : message.slackUserId
            ? slackAlias(message.slackUserId)
            : "user";
    const slackFileContext = (message.metadata.slackFileAttachments ?? [])
      .slice(0, 3)
      .map((attachment, index) => ({
        index: index + 1,
        name: clipPromptText(attachment.name, 240),
        text: clipPromptText(attachment.text, 2_400),
        truncated: Boolean(attachment.truncated),
      }));
    const messageContent = [
      stripSerializedMentionIds(message.content),
      slackFileContext.length > 0
        ? `<untrusted_slack_file_attachments>${JSON.stringify(slackFileContext)}</untrusted_slack_file_attachments>`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      cells: [
        speaker,
        references.join(",") || null,
        clipPromptText(messageContent, 4_000),
      ],
      id: message.id,
    };
  });

  // Keep newest turns when several messages are long. Older durable facts are
  // retained by the conversation summary.
  const selected: typeof rows = [];
  let totalChars = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    const rowChars = row.cells.reduce<number>(
      (sum, value) => sum + String(value ?? "").length,
      0
    );
    if (
      selected.length > 0 &&
      totalChars + rowChars > CONVERSATION_CONTEXT_MAX_CHARS
    )
      break;
    totalChars += rowChars;
    selected.unshift(row);
  }
  const table = formatPromptTable(
    ["speaker", "references", "message"],
    selected.map((row) => row.cells),
    [140, 500, 900]
  );
  if (!slackThreadId) return table;
  const hasMore = page.hasMore || selected.length < messages.length;
  const oldestVisible = selected[0];
  const nextCursor =
    hasMore && oldestVisible
      ? createOrgAgentConversationHistoryCursor({
          beforeId: oldestVisible.id,
          scope: "current_thread",
          slackThreadId,
        })
      : null;
  const pageMetadata = `scope=current_thread returned_items=${selected.length} has_more=${hasMore} next_cursor=${nextCursor ?? "-"}`;
  return `${pageMetadata}\n${table}`;
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

function formatContactDrafts(
  drafts: Awaited<ReturnType<typeof fetchCompanyTalentContactDraftsForScope>>
) {
  if (drafts.length === 0) return "-";
  return drafts
    .map((draft) =>
      [
        `contact_id=${draft.contactId} revision=${draft.revision}`,
        `talent_id=${draft.talentId} candidate=${JSON.stringify(draft.candidateName)}`,
        `role_id=${draft.roleId} role=${JSON.stringify(draft.roleName)}`,
        `kind=${draft.kind}`,
        `request_json=${JSON.stringify(draft.requestContext)}`,
        `subject_json=${JSON.stringify(draft.subject)}`,
        `body_json=${JSON.stringify(draft.body)}`,
      ].join("\n")
    )
    .join("\n---\n");
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
  currentUserMessageId?: number | null;
  messageType?: string | null;
  readAudience?: OrgAgentReadAudience;
  scopeKey?: string | null;
  slackThreadId?: string | null;
  slackHistoryTruncated?: boolean;
  user: User;
}) {
  const workspaceId = args.conversation.company_workspace_id;
  const isSlack = args.messageType === "slack" || Boolean(args.slackThreadId);
  const scope: OrgAgentPromptMessageScope = isSlack
    ? { kind: "slack", slackThreadId: text(args.slackThreadId) }
    : { kind: "chat" };
  if (scope.kind === "slack" && !scope.slackThreadId) {
    throw new OrgHttpError(400, "slackThreadId is required for Slack context");
  }
  const scopeKey =
    text(args.scopeKey) ||
    (scope.kind === "slack"
      ? `slack:${scope.slackThreadId}`
      : `chat:${args.conversation.id}`);
  const currentUserMessageId =
    args.currentUserMessageId ?? args.beforeMessageId ?? null;
  const workspace = await fetchWorkspaceForOrgAgent({
    admin: args.admin,
    workspaceId,
  });
  // Workspace identity, canonical internal role criteria, and memory presence
  // are authoritative. A failed read aborts rather than pretending there are
  // no roles or memories.
  const notes: string[] = [];
  let pendingUpdateUnavailable = false;
  const [
    roles,
    availability,
    summaries,
    messages,
    pendingUpdate,
    contactDrafts,
  ] = await Promise.all([
    fetchOrgAgentRoles({ admin: args.admin, workspaceId }),
    fetchOrgAgentWorkspaceAvailability({ admin: args.admin, workspace }),
    optionalContext({
      fallback: [],
      label: "conversation_summaries",
      onError: () =>
        notes.push(
          "conversation_summaries_unavailable=true; do not treat older context as empty"
        ),
      task: () =>
        fetchRecentOrgAgentSummaries({
          admin: args.admin,
          conversationId: args.conversation.id,
          limit: 2,
        }),
    }),
    optionalContext({
      fallback: { hasMore: false, messages: [], nextCursor: null },
      label: "recent_conversation",
      onError: () =>
        notes.push(
          "recent_conversation_unavailable=true; do not assume there was no prior discussion"
        ),
      task: () =>
        fetchRecentOrgAgentPromptMessages({
          admin: args.admin,
          beforeMessageId: currentUserMessageId,
          conversationId: args.conversation.id,
          limit: 14,
          scope,
        }),
    }),
    optionalContext({
      fallback: null,
      label: "pending_update",
      onError: () => {
        pendingUpdateUnavailable = true;
      },
      task: () =>
        fetchPendingOrgAgentUpdateProposal({
          admin: args.admin,
          scopeKey,
          workspaceId,
        }),
    }),
    optionalContext({
      fallback: [],
      label: "candidate_contact_drafts",
      onError: () =>
        notes.push(
          "candidate_contact_drafts_unavailable=true; do not assume that no contact draft is awaiting review"
        ),
      task: () =>
        fetchCompanyTalentContactDraftsForScope({
          admin: args.admin as any,
          conversationId: args.conversation.id,
          slackThreadId: scope.kind === "slack" ? scope.slackThreadId : null,
          workspaceId,
        }),
    }),
  ]);
  const inProgressRoleCreationsText =
    scope.kind === "slack"
      ? await optionalContext({
          fallback:
            "unavailable=true; do not claim there are no in-progress role creations",
          label: "in_progress_role_creations",
          task: () =>
            formatInProgressSlackRoleCreations({
              admin: args.admin as ReturnType<typeof getSupabaseAdmin>,
              workspaceId,
            }),
        })
      : "-";

  let pipeline: Awaited<
    ReturnType<typeof fetchOrgAgentPipelineSnapshot>
  > | null = null;
  try {
    pipeline = await fetchOrgAgentPipelineSnapshot({
      admin: args.admin,
      audience:
        args.readAudience ??
        (scope.kind === "slack" ? "company_safe" : "caller"),
      recentLimit: 20,
      roles,
      user: args.user,
      workspaceId,
    });
  } catch (error) {
    console.warn("[org/agent/context]", {
      error: getLlmErrorMessage(error) || String(error),
      label: "pipeline",
    });
    notes.push(
      "pipeline_unavailable=true reason=read_failed; do not report candidate counts as zero or exact"
    );
  }

  let retainedMoreData: OrgAgentMoreDataResult | null = null;
  if (currentUserMessageId) {
    try {
      const activations = await fetchActiveOrgAgentRetainedDataActivations({
        admin: args.admin,
        conversationId: args.conversation.id,
        currentUserMessageId,
        scope,
        scopeKey,
      });
      if (activations.length > 0) {
        const companyDetailsActivation = activations.find(
          (activation) => activation.kind === "company_details"
        );
        retainedMoreData = await getOrgAgentMoreData({
          admin: args.admin,
          fullTextKeys: companyDetailsActivation?.fullTextKeys ?? [],
          kinds: activations.map((activation) => activation.kind),
          workspaceId,
        });
      }
    } catch (error) {
      console.warn("[org/agent/context]", {
        error: getLlmErrorMessage(error) || String(error),
        label: "retained_more_data",
      });
      notes.push(
        "retained_more_data_unavailable=true reason=read_failed; do not treat the optional data as empty"
      );
    }
  }

  const formattedRoles = formatRoles(roles, pipeline?.countsByRoleId ?? null);
  const defaultLongTextObservations = buildDefaultOrgAgentLongTextObservations({
    pitch: workspace.pitch,
    roleObservations: formattedRoles.emptyLongTextObservations,
    workspaceMemoryAvailable: availability.workspaceMemoryAvailable,
    workspaceRequest: workspace.request,
  });
  const recentRecommendations = Object.assign(pipeline?.recentItems ?? [], {
    recentComplete: pipeline?.recentComplete ?? false,
    returnedItems: pipeline?.returnedItems ?? 0,
  }) as Awaited<ReturnType<typeof fetchRecentOrgAgentRecommendations>>;
  if (args.slackHistoryTruncated) {
    notes.push(
      "Slack API returned a partial thread page. Use only synchronized messages and do not claim unseen replies were reviewed."
    );
  }
  return enforceOrgAgentContextBudget({
    companyText: formatOrgAgentCompanyContext({
      companyDetailsAvailable: availability.companyDetailsAvailable,
      companyName: workspace.companyName,
      pitch: workspace.pitch,
      workspaceMemoryAvailable: availability.workspaceMemoryAvailable,
      workspaceRequestExists: Boolean(text(workspace.request)),
    }),
    completeRoleRequestIds: formattedRoles.completeRoleRequestIds,
    contactDraftsText: formatContactDrafts(contactDrafts),
    contextNotesText: notes.join("\n") || "-",
    conversationText: formatConversation(
      messages,
      scope.kind === "slack" ? scope.slackThreadId : null
    ),
    defaultLongTextObservations,
    inProgressRoleCreationsText,
    pendingUpdateText: pendingUpdateUnavailable
      ? "pending_update_unavailable=true; do not assume that no update is awaiting confirmation"
      : formatPendingOrgAgentUpdateProposal(pendingUpdate),
    recentRecommendationsText: formatRecentRecommendations(
      recentRecommendations
    ),
    retainedDataText: retainedMoreData
      ? serializeOrgAgentMoreData(retainedMoreData)
      : "-",
    retainedMoreData,
    roles,
    rolesText: formattedRoles.text,
    summariesText: formatSummaries(summaries),
    workspace,
  } satisfies OrgAgentPromptContext);
}

export async function searchOrgAgentMentionCandidates(args: {
  limit?: number;
  offset?: number;
  query?: string | null;
  roleId?: string | null;
  user: User;
  workspaceId: string;
}) {
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
    includeProfilePicture: true,
    limit: 200,
    limitCap: 200,
    query: args.query,
    roleId: args.roleId,
    user: args.user,
    workspaceId,
  });
  const candidates = filterOrgAgentMentionCandidates({
    candidates: result.items.flatMap((item): OrgAgentMentionCandidate[] => [
      {
        headline: item.candidate.headline,
        label: item.candidate.name,
        profilePicture: item.candidate.profilePicture ?? null,
        recommendedAt: item.recommendedAt,
        recommendationId: item.recommendationId,
        roleId: item.role.roleId,
        roleName: text(item.role.name) || "이름 없는 역할",
        stage: item.stage,
        stageLabel: humanizeOrgStage(item.stage, item.stageLabel),
        subtitle:
          [
            item.role.name,
            humanizeOrgStage(item.stage, item.stageLabel),
            item.candidate.headline,
            item.candidate.email,
          ]
            .filter(Boolean)
            .join(" · ") || item.candidate.talentId,
        talentId: item.candidate.talentId,
      },
    ]),
    query: args.query,
    roleId: args.roleId,
  });
  const limit = Math.max(1, Math.min(Math.floor(Number(args.limit) || 20), 20));
  const offset = Math.max(
    0,
    Math.min(Math.floor(Number(args.offset) || 0), 200)
  );
  const page = candidates.slice(offset, offset + limit);

  return {
    candidates: page,
    hasMore: offset + page.length < candidates.length,
    nextOffset:
      offset + page.length < candidates.length ? offset + page.length : null,
    totalCount: candidates.length,
  };
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

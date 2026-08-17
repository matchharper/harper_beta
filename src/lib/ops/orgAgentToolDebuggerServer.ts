import crypto from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getLlmErrorMessage } from "@/lib/llm/llm";
import { isInternalEmail } from "@/lib/internalAccess";
import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import {
  serializeOrgAgentToolError,
  serializeOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import {
  executeOrgAgentTool,
  OrgAgentToolInputError,
} from "@/lib/org/agent/toolExecution";
import { createOrgAgentToolExecutionStateFromSnapshot } from "@/lib/org/agent/toolState";
import {
  fitOrgAgentToolResultToBudget,
  ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS,
} from "@/lib/org/agent/toolResultBudget";
import { OrgHttpError } from "@/lib/org/server";
import {
  isOrgAgentDebugToolName,
  type OpsOrgAgentToolDebugActor,
  type OpsOrgAgentToolDebugActorsResponse,
  type OpsOrgAgentToolDebugOptionsResponse,
  type OpsOrgAgentToolDebugRole,
  type OpsOrgAgentToolDebugRunInput,
  type OpsOrgAgentToolDebugRunResponse,
  type OpsOrgAgentToolDebugWorkspace,
} from "@/lib/ops/orgAgentToolDebugger";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type WorkspaceRow = {
  company_name: string | null;
  company_workspace_id: string;
  updated_at: string;
};

type MembershipRow = {
  authority: string | null;
  company_user_id: string;
};

type CompanyUserRow = {
  email: string | null;
  name: string | null;
  user_id: string;
};

type RoleOptionRow = {
  name: string;
  role_id: string;
  status: string | null;
};

type LightweightRoleRow = {
  created_at: string;
  name: string;
  role_id: string;
  status: string | null;
  updated_at: string;
};

const AUTHORITY_ORDER: Record<string, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  viewer: 3,
};
const WORKSPACE_PAGE_SIZE = 1_000;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, min), max)
    : fallback;
}

export async function fetchOpsOrgAgentToolDebugWorkspaces(): Promise<OpsOrgAgentToolDebugOptionsResponse> {
  const admin = getSupabaseAdmin();
  const rows: WorkspaceRow[] = [];
  for (let from = 0; ; from += WORKSPACE_PAGE_SIZE) {
    const { data, error } = await (
      admin.from("company_workspace" as any) as any
    )
      .select("company_workspace_id, company_name, updated_at")
      .eq("is_internal", true)
      .order("company_name", { ascending: true })
      .range(from, from + WORKSPACE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as WorkspaceRow[];
    rows.push(...page);
    if (page.length < WORKSPACE_PAGE_SIZE) break;
  }

  const workspaces = rows
    .flatMap((row): OpsOrgAgentToolDebugWorkspace[] => {
      const workspaceId = text(row.company_workspace_id);
      if (!workspaceId) return [];
      return [
        {
          companyName: text(row.company_name) || "회사명 없음",
          updatedAt: text(row.updated_at),
          workspaceId,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.companyName.localeCompare(right.companyName, "ko") ||
        left.workspaceId.localeCompare(right.workspaceId)
    );

  return { workspaces };
}

async function loadInternalWorkspaceActors(args: {
  admin: AdminClient;
  workspaceId: string;
}) {
  const [workspaceResult, membershipResult] = await Promise.all([
    (args.admin.from("company_workspace" as any) as any)
      .select("company_workspace_id, company_name, updated_at")
      .eq("company_workspace_id", args.workspaceId)
      .eq("is_internal", true)
      .maybeSingle(),
    (args.admin.from("company_user_workspace" as any) as any)
      .select("company_user_id, authority")
      .eq("company_workspace_id", args.workspaceId),
  ]);
  if (workspaceResult.error) throw workspaceResult.error;
  if (!workspaceResult.data) {
    throw new OrgHttpError(404, "Internal workspace not found");
  }
  const workspace = workspaceResult.data as WorkspaceRow;
  const { data: membershipData, error: membershipError } = membershipResult;
  if (membershipError) throw membershipError;
  const memberships = (membershipData ?? []) as MembershipRow[];
  const userIds = Array.from(
    new Set(memberships.map((row) => text(row.company_user_id)).filter(Boolean))
  );
  const userById = new Map<string, CompanyUserRow>();

  if (userIds.length > 0) {
    const { data: userData, error: userError } = await (
      args.admin.from("company_users" as any) as any
    )
      .select("user_id, name, email")
      .in("user_id", userIds);
    if (userError) throw userError;
    for (const row of (userData ?? []) as CompanyUserRow[]) {
      userById.set(text(row.user_id), row);
    }
  }

  const actors = memberships
    .flatMap((membership): OpsOrgAgentToolDebugActor[] => {
      const userId = text(membership.company_user_id);
      const user = userById.get(userId);
      if (!userId || !user) return [];
      return [
        {
          authority: text(membership.authority) || "member",
          email: text(user.email) || null,
          name: text(user.name) || null,
          userId,
        },
      ];
    })
    .sort((left, right) => {
      const internalOrder =
        Number(isInternalEmail(left.email)) -
        Number(isInternalEmail(right.email));
      return (
        internalOrder ||
        (AUTHORITY_ORDER[left.authority] ?? 9) -
          (AUTHORITY_ORDER[right.authority] ?? 9) ||
        text(left.name || left.email).localeCompare(
          text(right.name || right.email),
          "ko"
        )
      );
    });

  return { actors, workspace };
}

export async function fetchOpsOrgAgentToolDebugActors(
  workspaceIdValue: unknown
): Promise<OpsOrgAgentToolDebugActorsResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = text(workspaceIdValue);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  const [actorResult, roleResult] = await Promise.all([
    loadInternalWorkspaceActors({ admin, workspaceId }),
    (admin.from("company_roles" as any) as any)
      .select("role_id, name, status")
      .eq("company_workspace_id", workspaceId)
      .eq("source_type", "internal")
      .not("is_expired", "is", true)
      .order("name", { ascending: true })
      .order("role_id", { ascending: true }),
  ]);
  if (roleResult.error) throw roleResult.error;
  const roles = ((roleResult.data ?? []) as RoleOptionRow[]).flatMap(
    (row): OpsOrgAgentToolDebugRole[] => {
      const roleId = text(row.role_id);
      if (!roleId) return [];
      return [
        {
          name: text(row.name) || "Role 이름 없음",
          roleId,
          status: text(row.status) || null,
        },
      ];
    }
  );
  return { actors: actorResult.actors, roles, workspaceId };
}

async function resolveActor(args: {
  actorId: unknown;
  admin: AdminClient;
  workspaceId: string;
}) {
  const { actors, workspace } = await loadInternalWorkspaceActors({
    admin: args.admin,
    workspaceId: args.workspaceId,
  });
  const requestedActorId = text(args.actorId);
  const actor = requestedActorId
    ? actors.find((item) => item.userId === requestedActorId)
    : actors[0];
  if (!actor) {
    throw new OrgHttpError(
      requestedActorId ? 400 : 404,
      requestedActorId
        ? "Selected actor is not a member of this workspace"
        : "This workspace has no company actor for an exact tool run"
    );
  }

  const user = {
    app_metadata: {},
    aud: "authenticated",
    created_at: "",
    email: actor.email ?? undefined,
    id: actor.userId,
    user_metadata: {
      full_name: actor.name ?? undefined,
      name: actor.name ?? undefined,
    },
  } as User;
  return { actor, user, workspace };
}

async function fetchDebugConversation(args: {
  admin: AdminClient;
  workspaceId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_conversations" as any) as any
  )
    .select("id, company_workspace_id, last_message_id")
    .eq("company_workspace_id", args.workspaceId)
    .is("role_id", null)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    const now = new Date().toISOString();
    return {
      conversation: {
        company_workspace_id: data.company_workspace_id,
        created_at: now,
        id: data.id,
        last_message_at: null,
        last_message_id: data.last_message_id,
        metadata: {},
        role_id: null,
        summary_cursor_message_id: null,
        title: null,
        updated_at: now,
      } as OrgAgentConversationRow,
      persisted: true,
    };
  }

  return createEphemeralDebugConversation(args.workspaceId);
}

function createEphemeralDebugConversation(workspaceId: string) {
  const now = new Date().toISOString();
  return {
    conversation: {
      company_workspace_id: workspaceId,
      created_at: now,
      id: crypto.randomUUID(),
      last_message_at: null,
      last_message_id: null,
      metadata: {},
      role_id: null,
      summary_cursor_message_id: null,
      title: null,
      updated_at: now,
    } as OrgAgentConversationRow,
    persisted: false,
  };
}

async function fetchLightweightDebugRoles(args: {
  admin: AdminClient;
  workspaceId: string;
}): Promise<OrgAgentPromptContext["roles"]> {
  const { data, error } = await (args.admin.from("company_roles" as any) as any)
    .select("role_id, name, status, created_at, updated_at")
    .eq("company_workspace_id", args.workspaceId)
    .eq("source_type", "internal")
    .not("is_expired", "is", true);
  if (error) throw error;
  return ((data ?? []) as LightweightRoleRow[]).map((role) => ({
    criteria: [],
    createdAt: role.created_at,
    description: null,
    employmentTypes: [],
    externalJdUrl: null,
    hasMemory: false,
    locationText: null,
    name: role.name,
    request: null,
    roleId: role.role_id,
    status: role.status,
    updatedAt: role.updated_at,
    workMode: null,
    workspaceId: args.workspaceId,
  }));
}

function debugToolStateWorkspace(
  workspace: WorkspaceRow
): OrgAgentPromptContext["workspace"] {
  return {
    brief: null,
    careerUrl: null,
    companyDescription: null,
    companyName: text(workspace.company_name) || "회사명 없음",
    homepageUrl: null,
    linkedinUrl: null,
    logoUrl: null,
    pitch: null,
    request: null,
    updatedAt: workspace.updated_at,
    workspaceId: workspace.company_workspace_id,
  };
}

function actorLabel(actor: OpsOrgAgentToolDebugActor) {
  return text(actor.name) || text(actor.email) || "회사 사용자";
}

function runtimeToolErrorText(error: unknown) {
  const visibleToModel =
    error instanceof OrgAgentToolInputError ||
    (error instanceof OrgHttpError && error.status < 500)
      ? error.message
      : "The tool could not be completed. Do not claim success.";
  return serializeOrgAgentToolError(visibleToModel);
}

export async function runOpsOrgAgentToolDebug(
  body: OpsOrgAgentToolDebugRunInput
): Promise<OpsOrgAgentToolDebugRunResponse> {
  const workspaceId = text(body.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  if (!isOrgAgentDebugToolName(body.toolName)) {
    throw new OrgHttpError(400, "A supported read-only toolName is required");
  }
  const toolName = body.toolName;
  const surface = body.surface === "slack" ? "slack" : "chat";
  const slackThreadId = text(body.slackThreadId) || null;
  if (surface === "slack" && !slackThreadId) {
    throw new OrgHttpError(400, "slackThreadId is required for a Slack run");
  }

  const startedAt = performance.now();
  const admin = getSupabaseAdmin();
  const needsConversation = toolName === "read_conversation_history";
  const needsRoles =
    toolName === "read_role" || toolName === "prepare_candidate_connection";
  const [actorResult, conversationResult, roles] = await Promise.all([
    resolveActor({ actorId: body.actorId, admin, workspaceId }),
    needsConversation
      ? fetchDebugConversation({ admin, workspaceId })
      : Promise.resolve(createEphemeralDebugConversation(workspaceId)),
    needsRoles
      ? fetchLightweightDebugRoles({ admin, workspaceId })
      : Promise.resolve([] as OrgAgentPromptContext["roles"]),
  ]);
  const { actor, user, workspace } = actorResult;
  const latestBoundary = Math.max(
    1,
    Number(conversationResult.conversation.last_message_id ?? 0) + 1
  );
  const currentUserMessageId = boundedInteger(
    body.currentUserMessageId,
    latestBoundary,
    1,
    Number.MAX_SAFE_INTEGER
  );
  const priorToolResultChars = boundedInteger(
    body.priorToolResultChars,
    0,
    0,
    ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS
  );
  const scopeKey =
    surface === "slack"
      ? `slack:${slackThreadId}`
      : `chat:${conversationResult.conversation.id}`;
  const state = createOrgAgentToolExecutionStateFromSnapshot({
    roles,
    workspace: debugToolStateWorkspace(workspace),
  });

  try {
    const result = await executeOrgAgentTool({
      actorId: actor.userId,
      actorLabel: actorLabel(actor),
      admin,
      audience: surface === "slack" ? "company_safe" : "caller",
      callId: `ops_debug_${crypto.randomUUID()}`,
      conversation: conversationResult.conversation,
      currentUserMessageId,
      input: body.input ?? {},
      name: toolName,
      scopeKey,
      slackThreadId,
      source: surface,
      state,
      user,
      userMessage: "",
    });
    const serializedResult = serializeOrgAgentToolResult(toolName, result);
    const fittedResult = fitOrgAgentToolResultToBudget({
      remainingChars:
        ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS - priorToolResultChars,
      serializedResult,
    });

    return {
      actor,
      budget: {
        complete: fittedResult.complete,
        deliveredChars: fittedResult.content.length,
        maxTotalChars: ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS,
        priorToolResultChars,
        serializedChars: serializedResult.length,
      },
      context: {
        conversationId: conversationResult.persisted
          ? conversationResult.conversation.id
          : null,
        currentUserMessageId,
        slackThreadId,
        surface,
        workspaceId,
      },
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      error: null,
      llmText: fittedResult.content,
      ok: true,
      resultJson: JSON.stringify(result, null, 2),
      toolName,
    };
  } catch (error) {
    const llmText = runtimeToolErrorText(error);
    return {
      actor,
      budget: {
        complete: true,
        deliveredChars: llmText.length,
        maxTotalChars: ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS,
        priorToolResultChars,
        serializedChars: llmText.length,
      },
      context: {
        conversationId: conversationResult.persisted
          ? conversationResult.conversation.id
          : null,
        currentUserMessageId,
        slackThreadId,
        surface,
        workspaceId,
      },
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      error: getLlmErrorMessage(error) || "Tool execution failed",
      llmText,
      ok: false,
      resultJson: null,
      toolName,
    };
  }
}

import type { User } from "@supabase/supabase-js";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  TODO_SUGGESTION_RULES,
  TodoSuggestionInputError,
  formatTodoSuggestionList,
  parseTodoSuggestionAdd,
  sameTodoSuggestion,
  type TodoSuggestionListRow,
} from "./todoSuggestionTool";

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Each named candidate's stage on the Role, from the board the To-do reads. */
export type ReadRoleStages = (args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  roleId: string;
  talentIds: string[];
}) => Promise<Map<string, string>>;

// The same read as the To-do: only candidates the company can see on this
// Role are found, so a suggestion can never name anyone else.
const readRoleStages: ReadRoleStages = async (args) => {
  const { fetchOrgBoard } = await import("./server");
  const board = await fetchOrgBoard({
    admin: args.admin,
    user: args.user,
    workspaceId: args.workspaceId,
    roleId: args.roleId,
    talentIds: args.talentIds,
    includeProfileLabels: false,
    includeInternalStages: false,
  });
  return new Map(board.items.map((item) => [item.talentId, String(item.stage)]));
};

const COLUMNS = "id,kind,title,plan,status,talent_ids,source,expires_at,decided_at,created_at";
const DAY_MS = 24 * 60 * 60 * 1000;

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "PGRST205" || code === "42P01";
}

/**
 * manage_todo_suggestions: Harper reads, adds or withdraws its own suggestions
 * on one Role's To-do. Only in runs Harper starts itself; the team answers in
 * the To-do (approve sends the plan to the Role chat as their request).
 */
export async function manageTodoSuggestions(args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  conversation: { id: string; role_id?: string | null };
  harperInitiated: boolean;
  input: Record<string, unknown>;
  now?: Date;
  readStages?: ReadRoleStages;
}): Promise<Record<string, unknown>> {
  const { OrgAgentToolInputError } = await import("./agent/toolAvailability");
  const refuse = (message: string): never => {
    throw new OrgAgentToolInputError(message);
  };
  if (!args.harperInitiated)
    refuse(
      "To-do suggestions are added only in runs Harper starts itself (scheduled work, reviews, company updates). In a conversation with the team, ask them directly. Nothing changed."
    );
  // A run answering a candidate's agent is not Harper's own work (it also lacks
  // this tool in its list; this holds if the list ever changes).
  const { companyAgentScope } = await import("@/lib/agentContacts/companyScope");
  const scope = companyAgentScope(args.admin);
  if (scope) {
    const { data: job, error: jobError } = await (args.admin.from as any)("company_agent_web_action_jobs")
      .select("action_name").eq("id", scope.jobId).maybeSingle();
    if (jobError) throw jobError;
    if (job?.action_name === "agent_contact_received")
      refuse("To-do suggestions are not added while answering a candidate's agent. Nothing changed.");
  }
  const roleId = String(args.input.roleId ?? args.conversation.role_id ?? "").trim();
  if (!roleId) return refuse("Name the Role (roleId): this conversation is not about one Role. Nothing changed.");
  const operation = String(args.input.operation ?? "").trim();
  if (!["list", "add", "withdraw"].includes(operation))
    refuse("operation must be list, add or withdraw. Nothing changed.");
  const now = args.now ?? new Date();
  const { admin, workspaceId } = args;
  const suggestions = () => (admin.from as any)("company_todo_suggestions");

  const { data: role, error: roleError } = await (admin.from as any)("company_roles")
    .select("role_id")
    .eq("role_id", roleId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) return refuse(`Role ${roleId} is not in this company. Nothing changed.`);

  const readState = async () => {
    const [rows, mutes] = await Promise.all([
      suggestions()
        .select(COLUMNS)
        .eq("company_workspace_id", workspaceId)
        .eq("role_id", roleId)
        .order("created_at", { ascending: false })
        .limit(50),
      (admin.from as any)("company_todo_suggestion_mutes").select("kind").eq("role_id", roleId),
    ]);
    if (isMissingTable(rows.error) || isMissingTable(mutes.error))
      return refuse("To-do suggestions are not available in this workspace yet. Nothing changed.");
    if (rows.error) throw rows.error;
    if (mutes.error) throw mutes.error;
    const all = (rows.data ?? []) as TodoSuggestionListRow[];
    const open = all.filter((row) => row.status === "pending" && Date.parse(row.expires_at) > now.getTime());
    const since = now.getTime() - TODO_SUGGESTION_RULES.dismissedMemoryDays * DAY_MS;
    const answered = all.filter(
      (row) => row.status !== "pending" && Date.parse(row.decided_at ?? row.created_at) >= since
    );
    const mutedKinds = [...new Set(((mutes.data ?? []) as Array<{ kind: string }>).map((row) => row.kind))].sort();
    // Harper names kinds freely, so it also sees what each stopped kind said.
    const lastTitle = new Map<string, string>();
    if (mutedKinds.length) {
      const { data, error } = await suggestions()
        .select("kind,title")
        .eq("company_workspace_id", workspaceId)
        .eq("role_id", roleId)
        .in("kind", mutedKinds)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      for (const row of (data ?? []) as Array<{ kind: string; title: string }>)
        if (!lastTitle.has(row.kind)) lastTitle.set(row.kind, row.title);
    }
    const muted = mutedKinds.map((kind) => ({ kind, title: lastTitle.get(kind) ?? null }));
    return { open, answered, mutedKinds, muted };
  };

  if (operation === "list") {
    const state = await readState();
    return {
      status: "listed",
      roleId,
      open: state.open.length,
      modelOutput: formatTodoSuggestionList({ roleId, ...state }),
    };
  }

  if (operation === "withdraw") {
    const id = String(args.input.suggestionId ?? "").trim();
    if (!id) return refuse("suggestionId is required to withdraw. Nothing changed.");
    const { data: row, error } = await suggestions()
      .select(COLUMNS)
      .eq("id", id)
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return refuse(`Suggestion ${id} is not on Role ${roleId}'s To-do. Nothing changed.`);
    if (row.status === "withdrawn")
      return { status: "already_withdrawn", suggestionId: id, modelOutput: `Suggestion ${id} was already withdrawn. Nothing changed.` };
    if (row.status !== "pending")
      return refuse(`Suggestion ${id} was already answered by the team (${row.status}). Nothing changed.`);
    // Only a still-open suggestion changes, so a repeated call withdraws once.
    const { data: updated, error: updateError } = await suggestions()
      .update({ status: "withdrawn", updated_at: now.toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return refuse(`Suggestion ${id} was answered while you were withdrawing it. Read the list again.`);
    return {
      status: "withdrawn",
      suggestionId: id,
      modelOutput: `Suggestion ${id} withdrawn; it left the Role's To-do.`,
    };
  }

  let add;
  try {
    add = parseTodoSuggestionAdd(args.input);
  } catch (error) {
    if (error instanceof TodoSuggestionInputError) return refuse(`${error.message} Nothing changed.`);
    throw error;
  }
  const state = await readState();
  if (state.mutedKinds.includes(add.kind))
    return refuse(`The team asked you to stop suggesting "${add.kind}" on this Role. Nothing changed.`);
  const already = state.open.find((row) => sameTodoSuggestion(row, add));
  if (already)
    return {
      status: "already_open",
      suggestionId: already.id,
      modelOutput: `Not added: suggestion ${already.id} (${already.kind}) about the same candidates is already open on the To-do. Nothing changed.`,
    };
  const dismissed = state.answered.find((row) => row.status === "dismissed" && sameTodoSuggestion(row, add));
  if (dismissed)
    return refuse(
      `The team answered "not now" to this suggestion (${dismissed.id}) on ${dismissed.decided_at}. Do not suggest it again before ${TODO_SUGGESTION_RULES.dismissedMemoryDays} days have passed. Nothing changed.`
    );
  if (state.open.length >= TODO_SUGGESTION_RULES.openPerRole)
    return refuse(
      `The Role already has ${state.open.length} open suggestions, the most it shows. Withdraw one that no longer applies first (${state.open.map((row) => row.id).join(", ")}). Nothing changed.`
    );

  let talentStages: Record<string, string> = {};
  if (add.talentIds.length) {
    const stages = await (args.readStages ?? readRoleStages)({
      admin, user: args.user, workspaceId, roleId, talentIds: add.talentIds,
    });
    const missing = add.talentIds.filter((id) => !stages.has(id));
    if (missing.length)
      return refuse(`Not on this Role's candidate list as the company sees it: ${missing.join(", ")}. Nothing changed.`);
    talentStages = Object.fromEntries(add.talentIds.map((id) => [id, stages.get(id)!]));
  }

  const expiresAt = new Date(now.getTime() + add.expiresInDays * DAY_MS).toISOString();
  const { data: created, error: insertError } = await suggestions()
    .insert({
      company_workspace_id: workspaceId,
      role_id: roleId,
      kind: add.kind,
      title: add.title,
      plan: add.plan,
      talent_ids: add.talentIds,
      talent_stages: talentStages,
      status: "pending",
      source: "harper",
      conversation_id: args.conversation.id,
      expires_at: expiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  const id = String(created.id);

  // Two runs can add at the same moment: the oldest copy stays, and the cap
  // holds. Our own row is withdrawn if it is the extra one.
  const after = await readState();
  const oldestFirst = (a: TodoSuggestionListRow, b: TodoSuggestionListRow) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  const copies = after.open.filter((row) => sameTodoSuggestion(row, add)).sort(oldestFirst);
  const kept = new Set(
    [...after.open].sort(oldestFirst).slice(0, TODO_SUGGESTION_RULES.openPerRole).map((row) => row.id)
  );
  const overCap = !kept.has(id);
  if ((copies.length > 1 && copies[0].id !== id) || overCap) {
    await suggestions()
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending");
    if (copies.length > 1 && copies[0].id !== id)
      return {
        status: "already_open",
        suggestionId: copies[0].id,
        modelOutput: `Not added: suggestion ${copies[0].id} about the same thing was added at the same time and stays open. Nothing else changed.`,
      };
    return refuse(
      `The Role reached ${TODO_SUGGESTION_RULES.openPerRole} open suggestions while you were adding this one. Nothing changed.`
    );
  }
  return {
    status: "created",
    suggestionId: id,
    modelOutput: [
      `Suggestion ${id} added to Role ${roleId}'s To-do: "${add.title}"`,
      `It waits for the team until ${expiresAt}. Approve sends your plan to the Role chat as their request; "not now" or "stop this kind" ends it. Nothing else changed.`,
    ].join("\n"),
  };
}

import "server-only";

import type { User } from "@supabase/supabase-js";
import type { buildOrgAgentPromptContext } from "@/lib/org/agent/context";
import type { OrgAgentLoopDependencies } from "@/lib/org/agent/chat";
import type { OrgAgentModelId } from "@/lib/org/agent/modelConfig";
import {
  criteriaProposalFromReview,
  CriteriaReviewInputError,
  describeCriteriaChange,
  criteriaReviewPrompt,
  criteriaReviewSnapshot,
  formatCriteriaReview,
  parseCriteriaReviewSnapshot,
  type CriteriaReviewSnapshot,
} from "@/lib/org/criteriaReview";
import {
  fileCriteriaProposal,
  readOpenCriteriaProposals,
  readConsolidationInput,
  type PreparedCriteriaReview,
} from "@/lib/org/criteriaProposals.server";
import {
  CRITERIA_PROPOSAL_RULES,
  criteriaProposalContentKey,
  criteriaProposalsOverlap,
  criteriaProposalText,
} from "@/lib/org/criteriaProposals";
import type { CompanyTermLocale } from "@/lib/org/terms";
import { scheduleRunMessages, type ScheduleRunMessages } from "@/lib/agentContacts/scheduleRun";
import { untypedTable } from "@/lib/org/untypedTable";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/**
 * Harper's review of pass reasons (S2 G). The consolidate_decisions job runs
 * the company Harper the way its other background events run (a Role-scoped
 * service principal, the Role conversation's context, the shared tool loop),
 * with the passes to read and three tools: read_role, read_talent and
 * propose_criteria_change. Harper decides whether the reasons call for a
 * stricter or a new criterion, or for a company memory note; the tool keeps
 * the suggestion to one existing criterion one level up, one new criterion
 * below required or one short note, backed by passes in this review, and
 * files it through the same To-do path as before. Silence is a valid outcome.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Json = Record<string, any>;

/** What a review run may call; the trusted caller's boundary. */
export const CRITERIA_REVIEW_TOOLS: ReadonlySet<string> = new Set([
  "get_more_data",
  "read_role",
  "read_talent",
  "propose_criteria_change",
]);

/** A review is a short read; the job's lease is far longer. */
const REVIEW_TIMEOUT_MS = 5 * 60_000;
/** Characters of Harper's closing words kept on the job for later review. */
const CRITERIA_REVIEW_REPLY_MAX = 2_000;

export type CriteriaReviewDependencies = {
  /** The company context every run reads (replaced in tests). */
  buildContext?: typeof buildOrgAgentPromptContext;
  /** Model and tool executor stand-ins (tests). */
  loop?: OrgAgentLoopDependencies;
  locale?: (workspaceId: string, admin: Admin) => Promise<CompanyTermLocale>;
  model?: OrgAgentModelId;
  /** ORG_AGENT_SCHEDULE_MESSAGES (tests pass it). */
  messages?: ScheduleRunMessages;
};

async function superseded(message: string): Promise<never> {
  // The queue treats this error as superseded, not as a failure to retry.
  const { AgentContactSupersededError } = await import("@/lib/agentContacts/store");
  throw new AgentContactSupersededError(message);
}

async function readJob(admin: Admin, jobId: string) {
  const { data, error } = await untypedTable(admin, "company_agent_web_action_jobs")
    .select("id,action_name,action_context,status,locked_by")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data as Json | null;
}

/** Merges into the job's action_context while this lease holds it. */
async function saveOnJob(admin: Admin, job: { id: string; locked_by: string }, patch: Json) {
  const current = await readJob(admin, job.id);
  if (!current || current.status !== "processing" || current.locked_by !== job.locked_by)
    return superseded("Criteria review lease changed");
  const { data, error } = await untypedTable(admin, "company_agent_web_action_jobs")
    .update({ action_context: { ...(current.action_context ?? {}), ...patch } })
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("locked_by", job.locked_by)
    .select("id");
  if (error) throw error;
  if (!(data as unknown[] | null)?.length) return superseded("Criteria review lease changed");
}

/**
 * Runs Harper on the prepared review. Returns the suggestion it added, if any.
 */
export async function runCriteriaReviewAgent(args: {
  admin: Admin;
  job: Json;
  prepared: PreparedCriteriaReview;
  dependencies?: CriteriaReviewDependencies;
}): Promise<{ proposalId: string | null }> {
  const { admin, job, prepared } = args;
  const dependencies = args.dependencies ?? {};
  const workspaceId = prepared.workspaceId;
  const roleId = prepared.roleId;
  const lease = { id: String(job.id), locked_by: String(job.locked_by) };

  const assertCurrent = async () => {
    const current = await readJob(admin, lease.id);
    if (
      !current ||
      current.status !== "processing" ||
      current.locked_by !== lease.locked_by ||
      current.action_name !== "consolidate_decisions"
    )
      return superseded("Criteria review lease changed");
    const { data: role, error } = await untypedTable(admin, "company_roles")
      .select("role_id,status,source_type,is_expired")
      .eq("role_id", roleId)
      .eq("company_workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    const open =
      role &&
      String((role as Json).source_type ?? "").trim().toLowerCase() === "internal" &&
      !["draft", "ended", "deleted"].includes(String((role as Json).status ?? "")) &&
      (role as Json).is_expired !== true;
    if (!open) return superseded("Role is no longer open for this review");
  };
  await assertCurrent();

  const locale = await (dependencies.locale ??
    (async (id: string, client: Admin) => {
      const { getOrgWorkspaceLocale } = await import("@/lib/org/workspaceLocale.server");
      return getOrgWorkspaceLocale(id, client);
    }))(workspaceId, admin);
  // What Harper may cite is fixed before it runs; the tool checks against it.
  await saveOnJob(admin, lease, { criteriaReview: criteriaReviewSnapshot(prepared.review, locale) });

  const [{ withCompanyAgentScope }, { runOrgAgentToolLoop }, { resolveOrgAgentModel }] = await Promise.all([
    import("@/lib/agentContacts/companyScope"),
    import("@/lib/org/agent/chat"),
    import("@/lib/org/agent/modelConfig"),
  ]);
  const scoped = withCompanyAgentScope(admin, {
    kind: "company_event",
    workspaceId,
    roleId,
    jobId: lease.id,
    leaseOwner: lease.locked_by,
    assertCurrent,
    companyMemory: true,
  });
  // This value carries no membership. All access comes from the server-created scope.
  const user = {
    id: lease.id,
    app_metadata: {},
    user_metadata: {},
    aud: "service",
    created_at: job.created_at,
  } as User;
  const { data: conversation, error } = await untypedTable(scoped, "company_conversations")
    .select("*")
    .eq("id", job.conversation_id)
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .single();
  if (error) throw error;
  const buildContext =
    dependencies.buildContext ?? (await import("@/lib/org/agent/context")).buildOrgAgentPromptContext;
  const context = await buildContext({
    admin: scoped,
    user,
    conversation: conversation as any,
    beforeMessageId: job.anchor_message_id,
    currentUserMessageId: job.anchor_message_id,
    includeSharedConversation: true,
    // The company memo too: what company memory already says is not suggested again.
    initialDataKinds: ["workspace_memory"],
    readAudience: "company_safe",
    scopeKey: `agent-event:${lease.id}`,
  });
  const roleTitle = context.roles?.find((role) => role.roleId === roleId)?.name ?? null;
  const model = dependencies.model ?? resolveOrgAgentModel(undefined).model;
  const result = await runOrgAgentToolLoop(
    {
      admin: scoped,
      user,
      conversation: conversation as any,
      context,
      actorId: lease.id,
      actorLabel: "Harper company agent",
      currentUserMessageId: Number(job.anchor_message_id),
      model,
      responseLocale: locale,
      allowSilentCompletion: true,
      throwOnToolExecutionError: true,
      harperInitiated: true,
      capabilityMode: "full",
      initialCapabilities: ["criteria_proposal"],
      allowedToolNames: CRITERIA_REVIEW_TOOLS,
      source: "chat",
      readAudience: "company_safe",
      scopeKey: `agent-event:${lease.id}`,
      slackThreadId: null,
      mentions: [],
      assertCanContinue: assertCurrent,
      signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
      userMessage: criteriaReviewPrompt(
        formatCriteriaReview({
          answeredKeys: prepared.answeredKeys,
          criteria: prepared.criteria,
          locale,
          openProposals: prepared.openProposals,
          review: prepared.review,
          roleId,
          roleTitle,
        })
      ),
    },
    dependencies.loop
  );
  await assertCurrent();
  const after = parseCriteriaReviewSnapshot((await readJob(admin, lease.id))?.action_context?.criteriaReview);
  if (after?.proposalId && !after.repeated)
    await tellCompanyOnce({
      admin,
      conversationId: String(conversation.id),
      messages: dependencies.messages ?? scheduleRunMessages(),
      model: result.model ?? model,
      proposalId: after.proposalId,
      roleId,
      workspaceId,
      jobId: lease.id,
    });
  await saveOnJob(admin, lease, {
    agentExecution: {
      completed: true,
      model: result.model ?? model,
      usage: result.usage,
      // Harper's own closing words are not delivered anywhere; keep them so a
      // review that ends without a suggestion can be explained afterwards.
      finalReply: String(result.reply ?? "").trim().slice(0, CRITERIA_REVIEW_REPLY_MAX) || null,
    },
  });
  return { proposalId: after?.proposalId ?? null };
}

/**
 * B17: the company also hears about a new suggestion once, in the Role's web
 * chat, with the card's sentence (Harper's own words and the counts). The
 * review has no Slack thread it was asked in, so like Harper's scheduled runs
 * it writes to the Role's web chat, and not at all when
 * ORG_AGENT_SCHEDULE_MESSAGES is off. One message per suggestion: a retry
 * finds the earlier one.
 */
async function tellCompanyOnce(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  conversationId: string;
  proposalId: string;
  jobId: string;
  model: string;
  messages: ScheduleRunMessages;
}) {
  if (args.messages === "off") return;
  const { data: proposal, error } = await untypedTable(args.admin, "company_agent_update_proposals")
    .select("id,status,summary")
    .eq("id", args.proposalId)
    .eq("workspace_id", args.workspaceId)
    .maybeSingle();
  if (error) throw error;
  const summary = String((proposal as Json | null)?.summary ?? "").trim();
  if ((proposal as Json | null)?.status !== "pending" || !summary) return;
  const { data: sent, error: sentError } = await untypedTable(args.admin, "company_messages")
    .select("id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("conversation_id", args.conversationId)
    .eq("metadata->>criteriaProposalId", args.proposalId)
    .limit(1);
  if (sentError) throw sentError;
  if ((sent as unknown[] | null)?.length) return;
  const { error: insertError } = await untypedTable(args.admin, "company_messages").insert({
    company_workspace_id: args.workspaceId,
    conversation_id: args.conversationId,
    role_id: args.roleId,
    role: "assistant",
    content: summary,
    message_type: "chat",
    status: "completed",
    model: args.model,
    metadata: { source: "criteria_review", criteriaProposalId: args.proposalId, webActionJobId: args.jobId },
  });
  if (insertError) throw insertError;
}

/**
 * What a memory note is checked against: the reviewed candidates' names (a
 * note never names them; the names are not shown to Harper) and the Role's
 * team (for a team note).
 */
async function readMemoryNoteContext(admin: Admin, roleId: string, snapshot: CriteriaReviewSnapshot) {
  const talentIds = [...new Set(snapshot.passes.map((pass) => pass.talentId).filter(Boolean))] as string[];
  const [people, role] = await Promise.all([
    talentIds.length
      ? untypedTable(admin, "talent_users").select("user_id,name").in("user_id", talentIds)
      : { data: [], error: null },
    untypedTable(admin, "company_internal_roles").select("team_id").eq("role_id", roleId).maybeSingle(),
  ]);
  if (people.error) throw people.error;
  if (role.error) throw role.error;
  return {
    candidateNames: ((people.data ?? []) as Json[]).flatMap((row) =>
      typeof row.name === "string" && row.name.trim() ? [row.name.trim()] : []
    ),
    roleTeamId: String((role.data as Json | null)?.team_id ?? "").trim() || null,
  };
}

/**
 * propose_criteria_change: one suggestion in the Role's To-do, from the
 * review this job is running. The result tells Harper what actually happened.
 */
export async function proposeCriteriaChange(args: {
  admin: Admin;
  input: Record<string, unknown>;
  now?: Date;
}) {
  const { OrgAgentToolInputError } = await import("@/lib/org/agent/toolAvailability");
  const { companyAgentScope } = await import("@/lib/agentContacts/companyScope");
  const scope = companyAgentScope(args.admin);
  const refuse = (message: string) => {
    throw new OrgAgentToolInputError(message);
  };
  if (!scope) return refuse("Criteria suggestions are added only in Harper's review of pass reasons.");
  await scope.assertCurrent();
  const job = await readJob(args.admin, scope.jobId);
  const snapshot: CriteriaReviewSnapshot | null =
    job?.action_name === "consolidate_decisions" ? parseCriteriaReviewSnapshot(job.action_context?.criteriaReview) : null;
  if (!job || !snapshot) return refuse("Criteria suggestions are added only in Harper's review of pass reasons.");
  const requestedRole = String(args.input.roleId ?? "").trim();
  if (requestedRole && requestedRole !== scope.roleId)
    return refuse(`This review covers Role ${scope.roleId} only. No suggestion was added.`);
  if (snapshot.proposalId)
    return {
      status: "already_added",
      proposalId: snapshot.proposalId,
      modelOutput: `Not added: this review already added suggestion ${snapshot.proposalId}; one suggestion per review. Nothing else changed.`,
    };

  const current = await readConsolidationInput(args.admin, scope.roleId, 1);
  if (!current || current.workspaceId !== scope.workspaceId) return refuse("This Role is not available to this review.");
  const memoryNote = args.input.memoryNote;
  const noteContext =
    memoryNote && typeof memoryNote === "object" ? await readMemoryNoteContext(args.admin, scope.roleId, snapshot) : {};
  let payload;
  try {
    payload = criteriaProposalFromReview({
      ...noteContext,
      criteria: current.criteria,
      criterionId: args.input.criterionId,
      newCriterion: args.input.newCriterion,
      memoryNote,
      decisionIds: args.input.decisionIds,
      messageIds: args.input.messageIds,
      rationale: args.input.reason,
      snapshot,
    });
  } catch (error) {
    if (error instanceof CriteriaReviewInputError) return refuse(error.message);
    throw error;
  }
  const open = await readOpenCriteriaProposals({
    admin: args.admin,
    workspaceId: scope.workspaceId,
    roleId: scope.roleId,
    now: args.now ?? new Date(),
  });
  const named = String(args.input.replacesProposalId ?? "").trim();
  if (named && !open.some((proposal) => proposal.id === named))
    return refuse(`${named} is not one of this Role's open suggestions${open.length ? `: ${open.map((proposal) => proposal.id).join(", ")}` : ""}. No suggestion was added.`);
  const overlapping = open.filter(
    (proposal) => proposal.id === named || (proposal.change && criteriaProposalsOverlap(proposal.change, payload.change))
  );
  const newKey = criteriaProposalContentKey(payload.change);
  const filed = await fileCriteriaProposal({
    admin: args.admin,
    briefRevision: current.briefRevision ?? null,
    now: args.now,
    payload,
    replaces: overlapping.map((proposal) => proposal.id),
    roleId: scope.roleId,
    workspaceId: scope.workspaceId,
  });
  const change = describeCriteriaChange(payload.change);
  if (filed.status === "created" && filed.proposalId) {
    await saveOnJob(args.admin, { id: scope.jobId, locked_by: scope.leaseOwner }, {
      criteriaReview: {
        ...snapshot,
        proposalId: filed.proposalId,
        ...(overlapping.some((proposal) => proposal.contentKey === newKey) ? { repeated: true } : {}),
      },
    });
    return {
      status: "created",
      proposalId: filed.proposalId,
      modelOutput: [
        `Suggestion ${filed.proposalId} added to the Role's To-do: ${change}, from ${payload.evidence.count} of the ${payload.evidence.window} candidates passed with a stated reason in this review.`,
        `The company sees: ${criteriaProposalText(payload, payload.locale ?? "ko").summary}`,
        ...(overlapping.length ? [`It replaced waiting suggestion ${overlapping.map((proposal) => proposal.id).join(", ")}, removed from the To-do.`] : []),
        `Nothing changed yet: a company member applies or dismisses it in the To-do${payload.change.type === "memory_note" ? " (applying saves the note to company memory as written)" : ""}. No further suggestion can be added in this review.`,
      ].join("\n"),
    };
  }
  return {
    status: filed.status,
    proposalId: null,
    modelOutput:
      filed.status === "limit_reached"
        ? `Not added: this Role already has ${CRITERIA_PROPOSAL_RULES.maxOpen} suggestions waiting and none of them is about the same thing. Nothing changed. If this one matters more, name the one it makes out of date with replacesProposalId; otherwise leave it.`
        : filed.status === "busy"
          ? "Not added: a company member is applying the suggestion this one would replace. Nothing changed."
          : filed.status === "answered_before"
            ? `Not added: the company already applied or dismissed ${change}. Nothing changed.`
            : "Not added: the suggestion was not saved. Nothing changed.",
  };
}

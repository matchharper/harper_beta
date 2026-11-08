import "server-only";

import type { User } from "@supabase/supabase-js";
import type { buildOrgAgentPromptContext } from "@/lib/org/agent/context";
import type { OrgAgentLoopDependencies } from "@/lib/org/agent/chat";
import type { OrgAgentModelId } from "@/lib/org/agent/modelConfig";
import {
  criteriaProposalFromReview,
  CriteriaReviewInputError,
  criteriaReviewPrompt,
  criteriaReviewSnapshot,
  formatCriteriaReview,
  parseCriteriaReviewSnapshot,
  type CriteriaReviewSnapshot,
} from "@/lib/org/criteriaReview";
import {
  fileCriteriaProposal,
  readConsolidationInput,
  type PreparedCriteriaReview,
} from "@/lib/org/criteriaProposals.server";
import { criteriaProposalText } from "@/lib/org/criteriaProposals";
import type { CompanyTermLocale } from "@/lib/org/terms";
import { untypedTable } from "@/lib/org/untypedTable";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/**
 * Harper's review of pass reasons (S2 G). The consolidate_decisions job runs
 * the company Harper the way its other background events run (a Role-scoped
 * service principal, the Role conversation's context, the shared tool loop),
 * with the passes to read and three tools: read_role, read_talent and
 * propose_criteria_change. Harper decides whether the reasons call for a
 * stricter or a new criterion; the tool keeps the suggestion to one existing
 * criterion one level up or one new criterion below required, backed by
 * passes in this review, and files it through the same To-do path as before.
 * Silence is a valid outcome.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Json = Record<string, any>;

/** What a review run may call; the trusted caller's boundary. */
export const CRITERIA_REVIEW_TOOLS: ReadonlySet<string> = new Set([
  "read_role",
  "read_talent",
  "propose_criteria_change",
]);

/** A review is a short read; the job's lease is far longer. */
const REVIEW_TIMEOUT_MS = 5 * 60_000;

export type CriteriaReviewDependencies = {
  /** The company context every run reads (replaced in tests). */
  buildContext?: typeof buildOrgAgentPromptContext;
  /** Model and tool executor stand-ins (tests). */
  loop?: OrgAgentLoopDependencies;
  locale?: (workspaceId: string, admin: Admin) => Promise<CompanyTermLocale>;
  model?: OrgAgentModelId;
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
  await saveOnJob(admin, lease, {
    agentExecution: { completed: true, model: result.model ?? model, usage: result.usage },
  });
  return { proposalId: after?.proposalId ?? null };
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
  let payload;
  try {
    payload = criteriaProposalFromReview({
      criteria: current.criteria,
      criterionId: args.input.criterionId,
      newCriterion: args.input.newCriterion,
      decisionIds: args.input.decisionIds,
      rationale: args.input.reason,
      snapshot,
    });
  } catch (error) {
    if (error instanceof CriteriaReviewInputError) return refuse(error.message);
    throw error;
  }
  const filed = await fileCriteriaProposal({
    admin: args.admin,
    briefRevision: current.briefRevision ?? null,
    now: args.now,
    payload,
    roleId: scope.roleId,
    workspaceId: scope.workspaceId,
  });
  const change =
    payload.change.type === "criterion_add"
      ? `new criterion ${payload.change.criterionName} (${payload.change.to})`
      : `${payload.change.criterionName}: ${payload.change.from} → ${payload.change.to}`;
  if (filed.status === "created" && filed.proposalId) {
    await saveOnJob(args.admin, { id: scope.jobId, locked_by: scope.leaseOwner }, {
      criteriaReview: { ...snapshot, proposalId: filed.proposalId },
    });
    return {
      status: "created",
      proposalId: filed.proposalId,
      modelOutput: [
        `Suggestion ${filed.proposalId} added to the Role's To-do: ${change}, from ${payload.evidence.count} of the ${payload.evidence.window} candidates passed with a stated reason in this review.`,
        `The company sees: ${criteriaProposalText(payload, payload.locale ?? "ko").summary}`,
        "Nothing changed yet: a company member applies or dismisses it in the To-do. No further suggestion can be added in this review.",
      ].join("\n"),
    };
  }
  return {
    status: filed.status,
    proposalId: null,
    modelOutput:
      filed.status === "pending_exists"
        ? "Not added: another suggestion for this Role is already waiting for the company. Nothing changed."
        : filed.status === "answered_before"
          ? `Not added: the company already applied or dismissed ${change}. Nothing changed.`
          : "Not added: the suggestion was not saved. Nothing changed.",
  };
}

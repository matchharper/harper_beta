import { throwBillingDbError } from "@/lib/org/billing/store";
import type { BillingSummary } from "@/lib/org/billing/types";
import type { OrgAgentAdminClient } from "./data";
import {
  decideExternalSourcing,
  externalSourcingEnabledFor,
  externalSourcingLimits,
  formatExternalCandidatesResult,
  formatExternalContactRequestResult,
  formatExternalSearchRequestResult,
  type ExternalCandidateRow,
  type ExternalCandidateStatusRow,
  type ExternalContactRow,
  type ExternalIntroRow,
  type ExternalRunRow,
  type ExternalSourcingHistory,
  type ExternalSourcingTrigger,
} from "./externalSourcing";
import { externalInviteSendingEnabled } from "./externalInvite";
import { currentCompanyRunId } from "./runRecords.server";

// Shadow runs are internal experiments: never counted for the company, shown or announced. Their
// shortlists are stored like any run, so every company-side read joins the run and excludes them.
// The address (external_candidate_contacts.email) and profile text are never selected for the company side.
const CANDIDATE_COLUMNS = "id,name,headline,current_company,location,linkedin_url,career_lines,evidence,verdict,rank,"
  + "company_decision,role_id,run_id,created_at,run:external_sourcing_runs!inner(trigger),"
  + "contact:external_candidate_contacts(status,email_kind,source_kind,finished_at),"
  + "intro:external_intro_requests(status,created_at,intro_recipient_emails,invited_at,opened_at,last_reply_at,reply_type,error_code,accepted_at,connected_at)";
const RUN_COLUMNS = "id,status,trigger,error_code,created_at,finished_at,counts";
const FINISHED = ["succeeded", "skipped", "failed"];

export type ShownExternalCandidate = ExternalCandidateRow & { role_id: string; run_id: string; created_at: string };

type CandidateQueryRow = Omit<ShownExternalCandidate, "contact" | "intro"> & {
  contact: ExternalContactRow | ExternalContactRow[] | null;
  intro: ExternalIntroRow | ExternalIntroRow[] | null;
  run: { trigger: string } | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function shown({ run: _run, ...row }: CandidateQueryRow): ShownExternalCandidate {
  return { ...row, contact: one(row.contact), intro: one(row.intro) };
}

// Filters first; callers end the chain with `.returns<CandidateQueryRow[]>()`.
function selectCandidates(admin: OrgAgentAdminClient) {
  return admin.from("external_candidates").select(CANDIDATE_COLUMNS).neq("run.trigger", "shadow");
}

/** Runs that are not searches (shadow tests; people copied in by Ops) do not use the daily search limits. */
const NOT_SEARCHES = "(shadow,ops_copy)";

async function loadHistory(admin: OrgAgentAdminClient, workspaceId: string, roleId: string, now: Date): Promise<ExternalSourcingHistory> {
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const runs = () => admin.from("external_sourcing_runs");
  const [active, roleDaily, workspaceDaily] = await Promise.all([
    runs().select("id").eq("role_id", roleId).in("status", ["queued", "running"]).limit(1),
    runs().select("id", { count: "exact", head: true }).eq("company_workspace_id", workspaceId).eq("role_id", roleId)
      .not("trigger", "in", NOT_SEARCHES).gte("created_at", dayAgo),
    runs().select("id", { count: "exact", head: true }).eq("company_workspace_id", workspaceId)
      .not("trigger", "in", NOT_SEARCHES).gte("created_at", dayAgo),
  ]);
  for (const result of [active, roleDaily, workspaceDaily]) if (result.error) throw result.error;
  return {
    activeRunId: active.data?.[0]?.id ?? null,
    roleRunsLast24h: roleDaily.count ?? 0,
    workspaceRunsLast24h: workspaceDaily.count ?? 0,
  };
}

type CreditSummary = Pick<BillingSummary, "model" | "creditSlots">;

/** The workspace's plan and connections left, from the same summary the billing page reads. */
async function loadCreditSummary(admin: OrgAgentAdminClient, workspaceId: string) {
  const { data, error } = await admin.rpc("workspace_billing_summary_v2" as never, { p_workspace: workspaceId } as never);
  throwBillingDbError(error);
  return data as unknown as CreditSummary | null;
}

/**
 * One connection is held for this person the moment the company asks, under the same plan rules as a member
 * Intro request, so everyone invited can still be introduced. The key makes a repeat harmless. The invitation
 * cron gives it back once the request can no longer end in an introduction.
 */
async function holdExternalConnection(admin: OrgAgentAdminClient, args: { workspaceId: string; roleId: string; userId: string; candidateRef: string }) {
  const { error } = await admin.rpc("workspace_billing_debit_v1" as never, {
    p_workspace: args.workspaceId, p_action: "intro_request", p_key: `external:${args.candidateRef}`,
    p_role: args.roleId, p_talent: args.candidateRef, p_actor: args.userId, p_payload: {}, p_complete: true,
  } as never);
  throwBillingDbError(error);
}

export async function requestExternalSourcing(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; roleName: string; userId: string;
  trigger: ExternalSourcingTrigger; reason: string; now?: Date;
}) {
  const now = args.now ?? new Date();
  const enabled = externalSourcingEnabledFor(args.workspaceId);
  const [history, plan] = enabled
    ? await Promise.all([loadHistory(args.admin, args.workspaceId, args.roleId, now),
      loadCreditSummary(args.admin, args.workspaceId).then((summary) => summary?.model ?? null)])
    : [{ activeRunId: null, roleRunsLast24h: 0, workspaceRunsLast24h: 0 }, null];
  const decision = decideExternalSourcing({ enabled, trigger: args.trigger, history, now, plan,
    limits: externalSourcingLimits(process.env, plan, args.workspaceId) });
  const base = { roleName: args.roleName, trigger: args.trigger };
  if (!decision.allowed) {
    const result = decision.status === "already_running"
      ? { ...base, status: "already_running", runId: decision.runId }
      : { ...base, status: "not_queued", reason: decision.reason };
    return { ...result, modelOutput: formatExternalSearchRequestResult(result) };
  }
  // Asked inside a company Harper run: the search's operation is linked to that run.
  const runId = currentCompanyRunId();
  const { data, error } = await args.admin.from("external_sourcing_runs").insert({
    company_workspace_id: args.workspaceId, role_id: args.roleId, trigger: args.trigger,
    requested_by: args.trigger === "agent_initiative" ? null : args.userId,
    input: { reason: args.reason.slice(0, 1_000), ...(runId ? { webActionJobId: runId } : {}) },
  }).select("id").single();
  if (error?.code === "23505") {
    // A concurrent request queued this Role first (one active run per Role).
    const { data: active, error: activeError } = await args.admin.from("external_sourcing_runs").select("id")
      .eq("role_id", args.roleId).in("status", ["queued", "running"]).limit(1);
    if (activeError) throw activeError;
    const result = { ...base, status: "already_running", runId: active?.[0]?.id ?? null };
    return { ...result, modelOutput: formatExternalSearchRequestResult(result) };
  }
  if (error) throw error;
  const result = { ...base, status: "queued", runId: data.id };
  return { ...result, modelOutput: formatExternalSearchRequestResult(result) };
}

/** Delivered people of one finished, non-shadow run (latest when runId is omitted). */
export async function loadExternalSearchResult(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; runId?: string | null;
}): Promise<{ run: ExternalRunRow | null; candidates: ShownExternalCandidate[] }> {
  let query = args.admin.from("external_sourcing_runs").select(RUN_COLUMNS).eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId).neq("trigger", "shadow").in("status", FINISHED);
  query = args.runId ? query.eq("id", args.runId) : query.order("finished_at", { ascending: false });
  const { data: runs, error } = await query.limit(1).returns<ExternalRunRow[]>();
  if (error) throw error;
  const run = runs?.[0] ?? null;
  if (!run) return { run: null, candidates: [] };
  const { data: candidates, error: candidatesError } = await selectCandidates(args.admin)
    .eq("run_id", run.id).eq("company_workspace_id", args.workspaceId).eq("delivered", true)
    .order("rank", { ascending: true }).returns<CandidateQueryRow[]>();
  if (candidatesError) throw candidatesError;
  return { run, candidates: (candidates ?? []).map(shown) };
}

/** Every person shown for a Role across its finished, non-shadow searches, newest search first. People the company passed are left out. */
export async function listShownExternalCandidates(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string;
}) {
  const [{ data: candidates, error }, { data: latest, error: latestError }] = await Promise.all([
    selectCandidates(args.admin).eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId)
      .eq("delivered", true).or("company_decision.is.null,company_decision.neq.passed")
      .order("created_at", { ascending: false }).order("rank", { ascending: true }).limit(60)
      .returns<CandidateQueryRow[]>(),
    args.admin.from("external_sourcing_runs").select(RUN_COLUMNS).eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId).neq("trigger", "shadow").order("created_at", { ascending: false }).limit(1)
      .returns<ExternalRunRow[]>(),
  ]);
  if (error) throw error;
  if (latestError) throw latestError;
  return { latestRun: latest?.[0] ?? null, candidates: (candidates ?? []).map(shown) };
}

const STATUS_COLUMNS = "id,name,headline,current_company,company_decision,company_decided_at,created_at,"
  + "run:external_sourcing_runs!inner(trigger),"
  + "contact:external_candidate_contacts(status,email_kind,source_kind,finished_at),"
  + "intro:external_intro_requests(status,created_at,invited_at,opened_at,last_reply_at,reply_type,error_code,accepted_at,connected_at)";

type StatusQueryRow = Omit<ExternalCandidateStatusRow, "contact" | "intro"> & {
  contact: ExternalContactRow | ExternalContactRow[] | null;
  intro: ExternalIntroRow | ExternalIntroRow[] | null;
  run: { trigger: string } | null;
};

/** Everyone shown for a Role, passed people included, with the company's decision; newest first. */
export async function listExternalCandidateStatuses(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; limit?: number;
}) {
  const { data, error, count } = await args.admin.from("external_candidates").select(STATUS_COLUMNS, { count: "exact" })
    .neq("run.trigger", "shadow").eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId)
    .eq("delivered", true).order("created_at", { ascending: false }).order("rank", { ascending: true })
    .limit(args.limit ?? 20).returns<StatusQueryRow[]>();
  if (error) throw error;
  const people = (data ?? []).map(({ run: _run, ...row }) => ({ ...row, contact: one(row.contact), intro: one(row.intro) }));
  return { total: count ?? people.length, people };
}

/** Where the company made an external-candidate decision. */
type ExternalDecisionChannel = "web" | "chat" | "slack";

/** Record the company's confirmed connection request for one shown person. Contacts nobody. */
export async function recordExternalIntroRequest(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; userId: string; candidateRef: string;
  companyAppeal: string; introRecipientEmails: string[]; channel: ExternalDecisionChannel;
}): Promise<{ status: "requested" | "already_requested"; intro: ExternalIntroRow | null }> {
  const { data, error } = await args.admin.from("external_intro_requests").insert({
    external_candidate_id: args.candidateRef, company_workspace_id: args.workspaceId, role_id: args.roleId,
    requested_by: args.userId, company_appeal: args.companyAppeal, intro_recipient_emails: args.introRecipientEmails,
  }).select("status,created_at,intro_recipient_emails").single();
  if (error?.code === "23505") {
    const existing = await loadShownExternalCandidate({ admin: args.admin, workspaceId: args.workspaceId,
      roleId: args.roleId, candidateRef: args.candidateRef });
    return { status: "already_requested", intro: existing?.intro ?? null };
  }
  if (error) throw error;
  // The company acted on this person: their profile text and evidence are kept past the 30-day purge.
  // The decision record is written in the same transaction.
  const { error: decisionError } = await args.admin.rpc("set_external_candidate_company_decision_v1" as never, {
    p_external_candidate_id: args.candidateRef, p_company_workspace_id: args.workspaceId,
    p_decision: "intro_requested", p_actor_user_id: args.userId, p_reason_text: args.companyAppeal,
    p_channel: args.channel,
  } as never);
  if (decisionError) throw decisionError;
  return { status: "requested", intro: data };
}

/**
 * The company's confirmed connection request, from chat or the Role page. With invitations on, an address
 * lookup starts now when none exists (a failed one is retried once per person); the invitation follows by cron.
 */
export async function requestExternalIntro(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; userId: string; candidate: ShownExternalCandidate;
  companyAppeal: string; introRecipientEmails: string[]; channel: ExternalDecisionChannel;
}) {
  // A finished lookup found no address: the person cannot be invited, so nothing is recorded.
  if (args.candidate.contact?.status === "not_found") {
    return { status: "no_email" as const, intro: null, emailLookup: undefined };
  }
  // An existing request is returned as is; a new one holds a connection before it is recorded.
  if (!args.candidate.intro) await holdExternalConnection(args.admin, { workspaceId: args.workspaceId, roleId: args.roleId,
    userId: args.userId, candidateRef: args.candidate.id });
  const recorded = await recordExternalIntroRequest({ admin: args.admin, workspaceId: args.workspaceId, roleId: args.roleId,
    userId: args.userId, candidateRef: args.candidate.id, companyAppeal: args.companyAppeal,
    introRecipientEmails: args.introRecipientEmails, channel: args.channel });
  let emailLookup: string | undefined;
  const contact = args.candidate.contact;
  if (recorded.status === "requested" && externalInviteSendingEnabled() && (!contact || contact.status === "failed")) {
    const lookup = await requestExternalEmailLookup({ admin: args.admin, workspaceId: args.workspaceId, roleId: args.roleId,
      userId: args.userId, candidateRef: args.candidate.id });
    emailLookup = lookup.status === "queued" ? "queued (about $0.12)"
      : lookup.status === "not_queued" ? `not started (${lookup.reason ?? "unknown"}); without an address the invitation will not go out` : "already exists";
  }
  return { ...recorded, emailLookup };
}

/** The company's Pass from the Role page: only an undecided shown person; the reason is kept. */
export async function passExternalCandidate(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; userId: string; candidateRef: string; reason: string;
}): Promise<{ status: "passed" | "unchanged" | "not_found"; inviteCancelled?: boolean }> {
  const person = await loadShownExternalCandidate(args);
  if (!person) return { status: "not_found" };
  if (person.company_decision === "passed") return { status: "unchanged" };
  // Pass works in every state, also after a connection request. After it Harper sends nothing more to this
  // person and stops telling the company about them (replies are still recorded).
  const now = new Date().toISOString();
  // Saved with its decision record in one transaction; only while undecided or requested.
  const { data: passed, error } = await args.admin.rpc("set_external_candidate_company_decision_v1" as never, {
    p_external_candidate_id: person.id, p_company_workspace_id: args.workspaceId, p_decision: "passed",
    p_actor_user_id: args.userId, p_reason_text: args.reason, p_channel: "web",
  } as never);
  if (error) throw error;
  if (passed !== true) return { status: "unchanged" };
  // An invitation that has not gone out is cancelled here; the dispatcher also re-checks before sending.
  if (person.intro?.status !== "requested") return { status: "passed" };
  const { data: cancelled, error: cancelError } = await args.admin.from("external_intro_requests")
    .update({ status: "cancelled", error_code: "company_passed", updated_at: now })
    .eq("external_candidate_id", person.id).eq("status", "requested").select("id").maybeSingle();
  if (cancelError) throw cancelError;
  return { status: "passed", inviteCancelled: Boolean(cancelled) };
}

/** One shown person (delivered) of this workspace and Role, with lookup and request status only. */
export async function loadShownExternalCandidate(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId?: string | null; candidateRef: string;
}): Promise<ShownExternalCandidate | null> {
  let query = selectCandidates(args.admin)
    .eq("id", args.candidateRef).eq("company_workspace_id", args.workspaceId).eq("delivered", true);
  if (args.roleId) query = query.eq("role_id", args.roleId);
  const { data, error } = await query.limit(1).returns<CandidateQueryRow[]>();
  if (error) throw error;
  return data?.[0] ? shown(data[0]) : null;
}

/**
 * Queue one email lookup for a shown person (about $0.12). Repeats return the existing state. A failed
 * lookup can be retried once per person (the retry is marked in result, which the Worker never rewrites).
 */
export async function requestExternalEmailLookup(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; userId: string; candidateRef: string; now?: Date;
}) {
  const candidate = await loadShownExternalCandidate(args);
  if (!candidate) throw new Error("External candidate not found in this Role");
  const base = { candidateRef: candidate.id, name: candidate.name };
  const existing = candidate.contact ?? null;
  const respond = (result: { status: string; contact?: ExternalContactRow | null; reason?: string }) =>
    ({ ...base, ...result, modelOutput: formatExternalContactRequestResult({ ...base, ...result }) });
  if (existing && existing.status !== "failed") return respond({ status: "existing", contact: existing });
  if (existing) {
    const { data: previous, error: previousError } = await args.admin.from("external_candidate_contacts")
      .select("result").eq("external_candidate_id", candidate.id).maybeSingle();
    if (previousError) throw previousError;
    const marked = previous?.result && typeof previous.result === "object" && !Array.isArray(previous.result)
      ? (previous.result as { retriedAt?: unknown }).retriedAt : null;
    if (marked) return respond({ status: "not_queued", reason: "retry_used", contact: existing });
  }
  const now = new Date().toISOString();
  const row = {
    external_candidate_id: candidate.id, company_workspace_id: args.workspaceId, role_id: candidate.role_id,
    requested_by: args.userId, status: "queued", available_at: now, attempt_count: 0, error_code: null,
    error_message: null, result: existing ? { retriedAt: now } : {}, updated_at: now,
  };
  // A failed lookup is retried on the same record; otherwise one record per person (unique index).
  const { error } = existing
    ? await args.admin.from("external_candidate_contacts").update(row)
      .eq("external_candidate_id", candidate.id).eq("status", "failed")
    : await args.admin.from("external_candidate_contacts").insert(row);
  if (error?.code === "23505") {
    const again = await loadShownExternalCandidate(args);
    return respond({ status: "existing", contact: again?.contact ?? null });
  }
  if (error) throw error;
  return respond({ status: "queued", contact: { status: "queued", email_kind: null, source_kind: null, finished_at: null } });
}

export async function readExternalCandidates(args: {
  admin: OrgAgentAdminClient; workspaceId: string; roleId: string; roleName: string; runId?: string | null;
}) {
  const loaded = await loadExternalSearchResult(args);
  return {
    roleName: args.roleName, runId: loaded.run?.id ?? null, runStatus: loaded.run?.status ?? null,
    shown: loaded.candidates.length,
    modelOutput: formatExternalCandidatesResult({ roleName: args.roleName, ...loaded }),
  };
}

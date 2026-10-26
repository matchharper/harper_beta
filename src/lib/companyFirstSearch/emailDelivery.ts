import type { CandidateDigestAction } from "./candidateDigestEmail";

/** Email branch of the role-matching delivery: every email row of one run becomes
 * one mail per recipient. Production wiring lives in emailDelivery.server.ts;
 * tests replace these boundaries, never the ordering and retry rules. */
export type EmailOutboxRow = {
  attempt_count: number;
  blocks: unknown;
  candidate_ids: string[];
  company_workspace_id: string;
  delivery_kind: string;
  id: string;
  role_ids: string[];
  run_id: string;
  status: string;
};
export type CandidateDigestRecipient = {
  user_id: string;
  email: string;
  name: string | null;
  locale: string;
  authority: string;
  is_assignee: boolean;
  /** Roles this recipient is authorized to receive, from the recipient RPC. */
  roleIds: string[];
};
export type CandidateDigestDelivery = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};
export type CandidateDigestLink = {
  tokenHash: string;
  introCandidateId: string;
  action: CandidateDigestAction;
};
export type CandidateDigestJob = {
  id: string;
  status: string;
  delivery: CandidateDigestDelivery | null;
  attempted_at: string | null;
};

export type CandidateDigestRecipientDependencies = {
  claim: (args: { userId: string; runId: string; owner: string; snapshot: { workspaceId: string; roleIds: string[]; outboxIds: string[] } }) => Promise<CandidateDigestJob | null>;
  build: (job: CandidateDigestJob, recipient: CandidateDigestRecipient) => Promise<{ delivery: CandidateDigestDelivery; links: CandidateDigestLink[] }>;
  prepare: (job: CandidateDigestJob, owner: string, delivery: CandidateDigestDelivery, links: CandidateDigestLink[]) => Promise<CandidateDigestJob | null>;
  send: (delivery: CandidateDigestDelivery) => Promise<{ id?: string }>;
  finish: (jobId: string, owner: string, providerId: string) => Promise<void>;
  release: (jobId: string, owner: string, error: unknown) => Promise<void>;
  /** A recipient that can never be authorized again stops without blocking others. */
  isPermanent: (error: unknown) => boolean;
  cancel: (jobId: string, owner: string, error: unknown) => Promise<void>;
};

export type CandidateDigestRecipientOutcome =
  | "sent"
  | "already_sent"
  | "cancelled"
  | "closed"
  /** Closed after a send attempt: the mail may have arrived, so it is never resent. */
  | "closed_after_attempt"
  | "busy";

/** Same lease, freeze-then-send and receipt order as the Slack connection mail. */
export async function deliverCandidateDigestToRecipient(args: {
  recipient: CandidateDigestRecipient;
  runId: string;
  owner: string;
  snapshot: { workspaceId: string; roleIds: string[]; outboxIds: string[] };
}, deps: CandidateDigestRecipientDependencies): Promise<CandidateDigestRecipientOutcome> {
  const job = await deps.claim({ userId: args.recipient.user_id, runId: args.runId, owner: args.owner, snapshot: args.snapshot });
  if (!job) return "busy";
  if (job.status === "sent") return "already_sent";
  if (job.status === "cancelled") return "cancelled";
  // failed / delivery_unknown are terminal: never resend outside safe retry conditions.
  if (job.status !== "processing") return job.attempted_at ? "closed_after_attempt" : "closed";
  try {
    let delivery = job.delivery;
    let links: CandidateDigestLink[] = [];
    if (!delivery) ({ delivery, links } = await deps.build(job, args.recipient));
    const prepared = await deps.prepare(job, args.owner, delivery, links);
    // Null means the lease ran out before freezing; the next retry takes it again.
    if (!prepared) return "busy";
    if (prepared.status === "cancelled") return "cancelled";
    if (prepared.status !== "sending") return prepared.attempted_at ? "closed_after_attempt" : "closed";
    // Send the persisted immutable payload, including Reply-To and idempotency key.
    const result = await deps.send(prepared.delivery!);
    if (!result.id) throw Error("Provider receipt missing; delivery uncertain");
    await deps.finish(job.id, args.owner, result.id);
    return "sent";
  } catch (error) {
    if (!job.attempted_at && !job.delivery && deps.isPermanent(error)) {
      await deps.cancel(job.id, args.owner, error);
      return "cancelled";
    }
    await deps.release(job.id, args.owner, error);
    throw error;
  }
}

export type CompanyFirstEmailRunDependencies = {
  /** Claims every pending/failed email row of the run in one statement, only while
   * the requested row is due. `requestedStatus` is set when it was not claimable. */
  claimRun: (request: EmailOutboxRequest) => Promise<{ rows: EmailOutboxRow[]; busy: boolean; requestedStatus?: string | null }>;
  recordAttempt: (row: EmailOutboxRow) => Promise<void>;
  isDeliverable: (row: EmailOutboxRow) => Promise<boolean>;
  cancel: (row: EmailOutboxRow, reason: string) => Promise<void>;
  markFailed: (row: EmailOutboxRow, error: unknown) => Promise<void>;
  /** Failed for a person to check; the worker never claims the row again. */
  markFailedFinal: (row: EmailOutboxRow, reason: string) => Promise<void>;
  markSent: (rows: EmailOutboxRow[]) => Promise<void>;
  finishRun: (runId: string) => Promise<void>;
  emailRoleIds: (roleIds: string[]) => Promise<string[]>;
  recipients: (roleIds: string[]) => Promise<CandidateDigestRecipient[]>;
  emailEnabled: () => boolean;
  newOwner: () => string;
  deliverToRecipient: (args: Parameters<typeof deliverCandidateDigestToRecipient>[0], rows: EmailOutboxRow[]) => Promise<CandidateDigestRecipientOutcome>;
};

export const EMAIL_NO_RECIPIENTS_REASON =
  "no email recipients: no role assignee or owner can receive candidate mail";
export const EMAIL_NOT_SENT_REASON =
  "no candidate mail was sent: every recipient mail ended without delivery";

export const EMAIL_DELIVERY_UNCERTAIN_REASON =
  "no candidate mail is confirmed sent, but a send was attempted: check delivery before resending";

/** Retry time of an email row ended "failed" for a person to check: never due again. */
export const EMAIL_FAILED_FINAL_AVAILABLE_AT = "infinity";

/** Due when its retry time has passed, compared as time values; unreadable is not due. */
export function outboxRowIsDue(availableAt: string | null | undefined, now = Date.now()) {
  return Date.parse(availableAt ?? "") <= now;
}

type RunOutboxRow = { status: string; available_at?: string | null; delivery_channel?: string | null };

/** The run's delivery result once no row can still be delivered, else null. An email
 * row ended "failed" for a person is never retried, so it counts as finished but keeps
 * its own status. Slack rows never get that retry time. */
export function companyFirstRunDeliveryStatus(rows: RunOutboxRow[]) {
  const failedFinal = (row: RunOutboxRow) => row.status === "failed" && row.delivery_channel === "email"
    && row.available_at === EMAIL_FAILED_FINAL_AVAILABLE_AT;
  if (!rows.length || rows.some((row) => ["pending", "failed", "sending"].includes(row.status) && !failedFinal(row)))
    return null;
  if (rows.some(failedFinal)) return "partially_failed";
  return rows.every((row) => row.status === "sent") ? "sent"
    : rows.every((row) => row.status === "canceled") ? "canceled" : "partially_canceled";
}

export type EmailOutboxRequest = { id: string; run_id: string; company_workspace_id: string };

export async function deliverCompanyFirstEmailRun(
  row: EmailOutboxRequest,
  deps: CompanyFirstEmailRunDependencies
): Promise<{ status: "sent" | "canceled" | "failed" | "busy" } | { status: "unclaimed"; requestedStatus: string | null }> {
  const { rows: claimed, busy, requestedStatus } = await deps.claimRun(row);
  if (requestedStatus !== undefined) return { status: "unclaimed", requestedStatus };
  if (busy) {
    // Another call holds part of this run. Retrying later keeps one mail per recipient.
    const error = new Error("Email delivery for this run is already in progress");
    for (const item of claimed) await deps.markFailed(item, error);
    return { status: "busy" };
  }
  const failAll = async (rows: EmailOutboxRow[], error: unknown) => {
    for (const item of rows) await deps.markFailed(item, error);
    return error;
  };
  const deliverable: EmailOutboxRow[] = [];
  try {
    for (const item of claimed) {
      item.attempt_count = Number(item.attempt_count ?? 0) + 1;
      await deps.recordAttempt(item);
    }
    for (const item of claimed) {
      if (await deps.isDeliverable(item)) deliverable.push(item);
      else await deps.cancel(item, "candidate state changed before email delivery");
    }
  } catch (error) {
    // Canceled rows are no longer `sending`, so markFailed leaves them unchanged.
    throw await failAll(claimed, error);
  }
  if (!deliverable.length) {
    await deps.finishRun(row.run_id);
    return { status: "canceled" };
  }

  let recipients: CandidateDigestRecipient[];
  let roleIds: string[];
  try {
    roleIds = await deps.emailRoleIds([...new Set(deliverable.flatMap((item) => item.role_ids))]);
    recipients = roleIds.length ? await deps.recipients(roleIds) : [];
  } catch (error) {
    throw await failAll(deliverable, error);
  }
  if (!recipients.length) {
    for (const item of deliverable) await deps.cancel(item, EMAIL_NO_RECIPIENTS_REASON);
    await deps.finishRun(row.run_id);
    return { status: "canceled" };
  }
  if (!deps.emailEnabled())
    throw await failAll(deliverable, new Error(
      "Company candidate email requires EMAIL_RUNTIME_TARGET=vercel_queue without an email dry run"));

  const owner = deps.newOwner();
  const outcomes: CandidateDigestRecipientOutcome[] = [];
  let failure: unknown = null;
  for (const recipient of recipients) {
    try {
      const recipientRoleIds = roleIds.filter(id => recipient.roleIds.includes(id));
      const recipientRows = deliverable.filter(item => item.role_ids.some(id => recipientRoleIds.includes(id)));
      if (!recipientRoleIds.length || !recipientRows.length) { outcomes.push("cancelled"); continue; }
      const snapshot = { workspaceId: row.company_workspace_id, roleIds: recipientRoleIds,
        outboxIds: recipientRows.map(item => item.id) };
      outcomes.push(await deps.deliverToRecipient({ recipient, runId: row.run_id, owner, snapshot }, recipientRows));
    } catch (error) {
      failure ??= error;
    }
  }
  if (!failure && outcomes.includes("busy"))
    failure = new Error("Another sender holds a recipient's candidate mail");
  // Partial failure: already-sent recipients are skipped on retry by (recipient, run).
  if (failure) throw await failAll(deliverable, failure);
  if (!outcomes.some((outcome) => outcome === "sent" || outcome === "already_sent")) {
    if (outcomes.includes("closed_after_attempt")) {
      for (const item of deliverable) await deps.markFailedFinal(item, EMAIL_DELIVERY_UNCERTAIN_REASON);
      // Never retried, so this is the last chance to finish the run.
      await deps.finishRun(row.run_id);
      return { status: "failed" };
    }
    const reason = outcomes.every((outcome) => outcome === "cancelled")
      ? EMAIL_NO_RECIPIENTS_REASON : EMAIL_NOT_SENT_REASON;
    for (const item of deliverable) await deps.cancel(item, reason);
    await deps.finishRun(row.run_id);
    return { status: "canceled" };
  }
  try {
    await deps.markSent(deliverable);
  } catch (error) {
    throw await failAll(deliverable, error);
  }
  await deps.finishRun(row.run_id);
  return { status: "sent" };
}

export function scopeCandidateDigestRows(
  rows: EmailOutboxRow[],
  intros: Array<{ id: string; role_id: string }>,
  allowedRoleIds: string[],
): EmailOutboxRow[] {
  const roles = new Set(allowedRoleIds);
  const candidates = new Set(intros.filter(intro => roles.has(intro.role_id)).map(intro => intro.id));
  return rows.flatMap(row => {
    const candidateIds = row.candidate_ids.filter(id => candidates.has(id));
    if (!candidateIds.length) return [];
    const complete = candidateIds.length === row.candidate_ids.length && row.role_ids.every(id => roles.has(id));
    const ids = new Set(candidateIds);
    const blocks = Array.isArray(row.blocks) ? row.blocks.filter(block => {
      const id = typeof block?.block_id === "string" && block.block_id.startsWith("company_intro_")
        ? block.block_id.slice("company_intro_".length) : null;
      return id ? ids.has(id) : complete;
    }) : row.blocks;
    return [{ ...row, candidate_ids: candidateIds, role_ids: row.role_ids.filter(id => roles.has(id)), blocks }];
  });
}

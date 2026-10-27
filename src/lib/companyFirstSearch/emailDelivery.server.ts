import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { createCompanyEmailReplyAlias } from "@/lib/email/company";
import { createReplyToken, hashReplyToken } from "@/lib/email/security";
import { getDefaultResendFromEmail, sendResendEmail } from "@/lib/email/send";
import { EmailPermanentError } from "@/lib/email/runtime/types";
import { loadSlackCandidateCards } from "@/lib/org/slackCandidateWorkObject.server";
import { slackCandidatePartsFromBlocks } from "@/lib/org/slackCandidateWorkObject";
import { getOrgPublicSiteUrl } from "@/lib/org/slackMessages";
import { getOrgWorkspaceLocale } from "@/lib/org/workspaceLocale.server";
import { fetchFitDetailsForBoard } from "@/lib/org/server";
import { recordAcceptedCandidateDelivery } from "./acceptedDelivery";
import { isGradedCriterion } from "./presentation";
import {
  buildCandidateDigestEmail,
  CANDIDATE_DIGEST_ACTIONS,
  type CandidateDigestCandidate,
  type CandidateDigestKind,
} from "./candidateDigestEmail";
import {
  deliverCandidateDigestToRecipient,
  scopeCandidateDigestRows,
  deliverCompanyFirstEmailRun,
  EMAIL_FAILED_FINAL_AVAILABLE_AT,
  outboxRowIsDue,
  type CandidateDigestDelivery,
  type CandidateDigestJob,
  type CandidateDigestLink,
  type CandidateDigestRecipient,
  type EmailOutboxRequest,
  type EmailOutboxRow,
} from "./emailDelivery";

type Admin = ReturnType<typeof getSupabaseAdmin>;
const OUTBOX_COLUMNS =
  "id, run_id, company_workspace_id, channel_id, idempotency_key, candidate_ids, role_ids, message_text, blocks, status, attempt_count, delivery_kind, delivery_channel";

const outbox = (admin: Admin) => admin.from("company_first_slack_outbox" as any) as any;

async function rpc<T>(admin: Admin, name: string, args: Record<string, unknown>) {
  const { data, error } = await (admin.rpc as any)(name, args);
  if (error) throw error;
  return data as T;
}

/** Existing company mail no-send controls apply to candidate mail as well. */
export function companyCandidateEmailEnabled() {
  return process.env.EMAIL_REPLY_DRY_RUN !== "true" &&
    process.env.COMPANY_EMAIL_DRY_RUN !== "true";
}

export async function claimRun(admin: Admin, request: EmailOutboxRequest) {
  const staleClaim = new Date(Date.now() - 15 * 60_000).toISOString();
  await outbox(admin)
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("run_id", request.run_id).eq("delivery_channel", "email")
    .eq("status", "sending").lt("claimed_at", staleClaim);
  const now = new Date().toISOString();
  const { data: requested, error: requestedError } = await outbox(admin)
    .select("status, available_at").eq("id", request.id).maybeSingle();
  if (requestedError) throw requestedError;
  if (!requested || !["pending", "failed"].includes(requested.status) || !outboxRowIsDue(requested.available_at))
    return { rows: [], busy: false, requestedStatus: requested?.status ?? null };
  // The run is the lock unit: one statement takes every email row of the run, so
  // a concurrent call for the sibling row gets none of them. Siblings are taken
  // even while backing off, so their candidates join this recipient's one mail.
  const { data: claimed, error } = await outbox(admin)
    .update({ claimed_at: now, last_error: null, status: "sending", updated_at: now })
    .eq("run_id", request.run_id).eq("delivery_channel", "email")
    .in("status", ["pending", "failed"])
    .select(OUTBOX_COLUMNS);
  if (error) throw error;
  const rows = (claimed ?? []) as EmailOutboxRow[];
  if (!rows.some((item) => item.id === request.id)) return { rows, busy: true };
  const claimedIds = new Set(rows.map((item) => item.id));
  const { data: sending, error: sendingError } = await outbox(admin)
    .select("id").eq("run_id", request.run_id).eq("delivery_channel", "email").eq("status", "sending");
  if (sendingError) throw sendingError;
  return { rows, busy: (sending ?? []).some((item: { id: string }) => !claimedIds.has(item.id)) };
}

export async function markEmailRowFailedFinal(admin: Admin, row: EmailOutboxRow, reason: string) {
  const { error } = await outbox(admin)
    .update({ available_at: EMAIL_FAILED_FINAL_AVAILABLE_AT, last_error: reason, status: "failed", updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", "sending");
  if (error) throw error;
}

/** Each candidate's ratings by the web card's rule (grades written after a criteria
 * change win). Ratings being judged again or not checked since a criteria change are
 * left out of the mail. */
export async function mailCriteriaByCandidate(admin: Admin, intros: Array<{ id: string; role_id: string; talent_id: string }>) {
  const { evaluationsByKey } = await fetchFitDetailsForBoard({ admin, recommendationRows: intros });
  return new Map(intros.map((intro) => [intro.id,
    (evaluationsByKey.get(`${intro.talent_id}:${intro.role_id}`) ?? [])
      .filter(isGradedCriterion).map(({ name, fitness }) => ({ name, fitness }))]));
}

export async function loadMailContext(admin: Admin, rows: EmailOutboxRow[], allowedRoleIds: string[]) {
  const workspaceId = rows[0]!.company_workspace_id;
  const requestedCandidateIds = [...new Set(rows.flatMap(row => row.candidate_ids))];
  const { data: intros, error: introError } = await (admin.from("company_intro_candidates" as any) as any)
    .select("id, role_id, talent_id").eq("company_workspace_id", workspaceId)
    .in("id", requestedCandidateIds).in("role_id", allowedRoleIds);
  if (introError) throw introError;
  rows = scopeCandidateDigestRows(rows, intros ?? [], allowedRoleIds);
  if (!rows.length) throw new EmailPermanentError("No authorized candidates remain for this recipient");
  const ordered = [...rows].sort((left, right) =>
    Number(right.delivery_kind === "accepted_connection") - Number(left.delivery_kind === "accepted_connection"));
  const roleIds = [...new Set(ordered.flatMap((row) => row.role_ids))];
  const candidateIds = [...new Set(ordered.flatMap((row) => row.candidate_ids))];
  const [locale, cards, roleResult] = await Promise.all([
    getOrgWorkspaceLocale(workspaceId, admin),
    loadSlackCandidateCards({ candidateIds, workspaceId }),
    (admin.from("company_roles" as any) as any).select("role_id, name")
      .eq("company_workspace_id", workspaceId).in("role_id", roleIds),
  ]);
  if (roleResult.error) throw roleResult.error;
  const criteriaById = await mailCriteriaByCandidate(admin, (intros ?? []).filter((intro: {id: string}) => candidateIds.includes(intro.id)));
  const names = new Map<string, string>((roleResult.data ?? []).map((role: { role_id: string; name: string | null }) => [role.role_id, role.name ?? ""]));
  const sections = ordered.map((row) => {
    const rowCards = cards.filter((card) => row.candidate_ids.includes(card.id));
    const parts = slackCandidatePartsFromBlocks(row.blocks, rowCards);
    if (!parts) throw new Error("Email outbox row has no candidate blocks");
    return { kind: row.delivery_kind as CandidateDigestKind, parts };
  });
  return {
    locale,
    workspaceId,
    roleNames: roleIds.map((id) => names.get(id) ?? "").filter(Boolean),
    sections,
    cards: cards.map((card) => {
      const url = new URL(card.profileUrl);
      url.searchParams.set("source", "email");
      return { id: card.id, webUrl: url.toString(), criteria: criteriaById.get(card.id) ?? [] };
    }),
  };
}

// Database errors are plain objects with a message, not Error; keep their message.
function failureReason(error: unknown, fallback: string) {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return ((typeof message === "string" && message.trim()) || fallback).slice(0, 1000);
}

export function digestDependencies(admin: Admin, loadContext: () => Promise<Awaited<ReturnType<typeof loadMailContext>>>) {
  return {
    claim: ({ userId, runId, owner, snapshot }: { userId: string; runId: string; owner: string; snapshot: Record<string, unknown> }) =>
      rpc<CandidateDigestJob | null>(admin, "claim_company_candidate_digest_email_v1", {
        p_user_id: userId, p_run_id: runId, p_owner: owner, p_snapshot: snapshot,
      }),
    build: async (job: CandidateDigestJob, recipient: CandidateDigestRecipient) => {
      const context = await loadContext();
      const links: CandidateDigestLink[] = [];
      const candidates: CandidateDigestCandidate[] = context.cards.map((card) => ({ ...card, actionUrls: {} }));
      for (const section of context.sections) {
        for (const part of section.parts) {
          const candidate = candidates.find((item) => item.id === part.candidateId);
          if (!candidate) continue;
          for (const action of CANDIDATE_DIGEST_ACTIONS[section.kind]) {
            const token = createReplyToken();
            links.push({ tokenHash: hashReplyToken(token), introCandidateId: candidate.id, action });
            candidate.actionUrls[action] = `${getOrgPublicSiteUrl()}/email-action/${token}`;
          }
        }
      }
      const email = buildCandidateDigestEmail({
        locale: context.locale,
        recipientName: recipient.name ?? "",
        roleNames: context.roleNames,
        sections: context.sections,
        candidates,
        workspaceId: context.workspaceId,
      });
      const route = await createCompanyEmailReplyAlias({
        userId: recipient.user_id, workspaceId: context.workspaceId,
        subject: email.subject, body: email.replyContext, admin,
        idempotencyKey: `company-notice/${job.id}/${createHash("sha256").update(JSON.stringify({
          workspaceId: context.workspaceId, recipient: recipient.email, subject: email.subject, body: email.replyContext,
        })).digest("hex")}`,
      });
      const delivery: CandidateDigestDelivery = {
        ...route, from: getDefaultResendFromEmail(), subject: email.subject,
        text: email.text, html: email.html, idempotencyKey: `company-notice/${job.id}`,
      };
      return { delivery, links };
    },
    prepare: (job: CandidateDigestJob, owner: string, delivery: CandidateDigestDelivery, links: CandidateDigestLink[]) =>
      rpc<CandidateDigestJob | null>(admin, "prepare_company_candidate_digest_send_v1", {
        p_id: job.id, p_owner: owner, p_delivery: delivery, p_links: links,
      }),
    send: (delivery: CandidateDigestDelivery) => sendResendEmail({ ...delivery, signal: AbortSignal.timeout(30_000) }),
    finish: async (jobId: string, owner: string, providerId: string) => {
      await rpc(admin, "finish_company_email_send_v1", { p_id: jobId, p_owner: owner, p_provider_id: providerId });
    },
    // Same release as the Slack connection mail: the frozen delivery is resent later.
    release: async (jobId: string, owner: string, error: unknown) => {
      const { error: releaseError } = await (admin.from("company_email_outbox" as any) as any)
        .update({ status: "queued", lease_owner: null, lease_until: null,
          available_at: new Date(Date.now() + 300_000).toISOString(),
          last_error: failureReason(error, "Company email failed") })
        .eq("id", jobId).eq("lease_owner", owner).in("status", ["processing", "sending"]);
      if (releaseError) throw releaseError;
    },
    isPermanent: (error: unknown) => error instanceof EmailPermanentError,
    cancel: async (jobId: string, owner: string, error: unknown) => {
      const { error: cancelError } = await (admin.from("company_email_outbox" as any) as any)
        .update({ status: "cancelled", lease_owner: null, lease_until: null,
          last_error: failureReason(error, "Recipient can no longer receive company mail") })
        .eq("id", jobId).eq("lease_owner", owner).eq("status", "processing").is("attempted_at", null);
      if (cancelError) throw cancelError;
    },
  };
}

export async function deliverCompanyFirstEmailRow(args: {
  admin: Admin;
  row: EmailOutboxRequest;
  markFailed: (row: EmailOutboxRow, error: unknown) => Promise<void>;
  finishRun: (runId: string) => Promise<void>;
}) {
  const { admin } = args;

  return deliverCompanyFirstEmailRun(args.row, {
    claimRun: (row) => claimRun(admin, row),
    recordAttempt: async (row) => {
      await outbox(admin).update({ attempt_count: row.attempt_count }).eq("id", row.id).eq("status", "sending");
    },
    isDeliverable: async (row) =>
      (await rpc<boolean>(admin, "company_first_outbox_is_deliverable_v1", { p_outbox_id: row.id })) === true,
    cancel: async (row, reason) => {
      await recordAcceptedCandidateDelivery(admin, row, "canceled", "email");
      const { error } = await outbox(admin)
        .update({ last_error: reason, status: "canceled", updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "sending");
      if (error) throw error;
    },
    markFailed: args.markFailed,
    markFailedFinal: (row, reason) => markEmailRowFailedFinal(admin, row, reason),
    markSent: async (rows) => {
      for (const row of rows) await recordAcceptedCandidateDelivery(admin, row, "sent", "email");
      const sentAt = new Date().toISOString();
      const { error } = await outbox(admin)
        .update({ last_error: null, sent_at: sentAt, status: "sent", updated_at: sentAt })
        .in("id", rows.map((row) => row.id)).eq("status", "sending");
      if (error) throw error;
    },
    finishRun: args.finishRun,
    emailRoleIds: async (roleIds) => {
      // The same rule gates Worker selection and the final database send check:
      // explicit email opt-in, or no usable Slack channel for this Role.
      const enabled = await Promise.all(roleIds.map((roleId) =>
        rpc<boolean>(admin, "company_role_candidate_email_enabled_v1", { p_role_id: roleId })));
      return roleIds.filter((_, index) => enabled[index] === true);
    },
    recipients: async (roleIds) => {
      const byUser = new Map<string, CandidateDigestRecipient>();
      for (const roleId of roleIds) {
        const people = await rpc<Array<Omit<CandidateDigestRecipient, "roleIds">> | null>(admin, "company_role_email_recipients_v1", { p_role_id: roleId });
        for (const person of people ?? []) {
          const existing = byUser.get(person.user_id);
          if (existing) existing.roleIds.push(roleId);
          else byUser.set(person.user_id, { ...person, roleIds: [roleId] });
        }
      }
      return [...byUser.values()];
    },
    emailEnabled: companyCandidateEmailEnabled,
    newOwner: randomUUID,
    deliverToRecipient: (recipientArgs, rows) =>
      deliverCandidateDigestToRecipient(recipientArgs,
        digestDependencies(admin, () => loadMailContext(admin, rows, recipientArgs.snapshot.roleIds))),
  });
}

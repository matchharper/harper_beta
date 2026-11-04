import "server-only";
import { randomUUID } from "node:crypto";
import type { AgentContactSource, AgentContactMessage } from "./contracts";
import {
  agentContactDatabase,
  assertAgentContactPair,
  assertAgentContactSource,
  AgentContactSupersededError,
} from "./store";
import { createCompanyEmailReplyAlias } from "@/lib/email/company";
import { renderCompanyReplyEmail } from "@/lib/email/runtime/format";
import { sendResendEmail } from "@/lib/email/send";
import type {
  Query,
  Database,
} from "@/lib/career/matching/internalScoring/database";

async function recipients(
  q: Query,
  workspaceId: string,
  roleId: string,
  rootId?: string
) {
  const [role] = await q(
    `SELECT r.role_id FROM public.company_roles r JOIN public.company_internal_roles i USING(role_id)
    JOIN public.company_workspace w ON w.company_workspace_id=r.company_workspace_id
    WHERE r.role_id=$1::uuid AND r.company_workspace_id=$2::uuid AND i.email_notifications_enabled
    AND NOT coalesce(w.is_reviewing,false)
    AND r.status IN ('active','paused','top_priority') AND NOT coalesce(r.is_expired,false)
    AND (r.expires_at IS NULL OR r.expires_at>now())`,
    [roleId, workspaceId]
  );
  if (!role) return [];
  if (rootId) {
    const [root] = await q(
      `SELECT m.* FROM public.agent_contact_messages m JOIN public.talent_opportunity_recommendation r ON r.agent_introduction_root_id=m.id
      WHERE m.id=$1::uuid AND m.id=m.root_id AND m.role_id=$2::uuid AND m.company_workspace_id=$3::uuid AND m.cancelled_at IS NULL AND r.feedback='like'`,
      [rootId, roleId, workspaceId]
    );
    if (!root) return [];
    try {
      await assertAgentContactPair(q, root as AgentContactMessage);
    } catch (error) {
      if (error instanceof AgentContactSupersededError) return [];
      throw error;
    }
  }
  return q("SELECT * FROM public.company_role_email_recipients_v1($1::uuid)", [
    roleId,
  ]);
}

/** Exact original-agent mail is frozen before I/O. An uncertain send is never blindly retried. */
type EmailTransport = {
  createReplyAlias: typeof createCompanyEmailReplyAlias;
  send: typeof sendResendEmail;
};
const transport: EmailTransport = {
  createReplyAlias: createCompanyEmailReplyAlias,
  send: sendResendEmail,
};
export async function deliverAgentCompanyEmail(
  id: string,
  db: Database = agentContactDatabase(),
  delivery: EmailTransport = transport
) {
  const owner = randomUUID();
  const row = await db.transaction(async (q) => {
    const [mail] = await q(
      "SELECT * FROM public.company_email_outbox WHERE id=$1::uuid AND topic='agent_contact_v1' FOR UPDATE",
      [id]
    );
    if (
      !mail ||
      mail.status === "sent" ||
      mail.status === "cancelled" ||
      mail.status === "delivery_unknown"
    )
      return null;
    if (mail.lease_until && new Date(mail.lease_until).getTime() > Date.now())
      return null;
    if (mail.attempted_at) {
      await q(
        "UPDATE public.company_email_outbox SET status='delivery_unknown',lease_owner=NULL,lease_until=NULL WHERE id=$1::uuid",
        [id]
      );
      return null;
    }
    const audience = await recipients(
      q,
      mail.snapshot.workspaceId,
      mail.snapshot.roleId,
      mail.snapshot.rootId
    );
    if (
      !audience.some(
        (r) =>
          r.user_id === mail.recipient_id && r.email === mail.snapshot.email
      )
    ) {
      await q(
        "UPDATE public.company_email_outbox SET status='cancelled',last_error='recipient_or_relationship_changed' WHERE id=$1::uuid",
        [id]
      );
      return null;
    }
    const [claimed] = await q(
      "UPDATE public.company_email_outbox SET lease_owner=$2::uuid,lease_until=now()+interval '2 minutes' WHERE id=$1::uuid RETURNING *",
      [id, owner]
    );
    return claimed;
  });
  if (!row) return;
  let attempted = false;
  try {
    const route = await delivery.createReplyAlias({
      userId: row.recipient_id,
      workspaceId: row.snapshot.workspaceId,
      subject: row.draft.subject,
      body: row.draft.body,
      idempotencyKey: `agent-company-email:${id}`,
    });
    const ready = await db.transaction(async (q) => {
      const audience = await recipients(
        q,
        row.snapshot.workspaceId,
        row.snapshot.roleId,
        row.snapshot.rootId
      );
      const eligible = audience.some(
        (r) =>
          r.user_id === row.recipient_id &&
          r.email === route.to &&
          r.email === row.snapshot.email
      );
      const rows = await q(
        `UPDATE public.company_email_outbox SET status=$3,attempted_at=CASE WHEN $4 THEN now() ELSE NULL END,
        attempt_count=attempt_count+1,delivery=$5::jsonb WHERE id=$1::uuid AND lease_owner=$2::uuid AND attempted_at IS NULL RETURNING id`,
        [
          id,
          owner,
          eligible ? "sending" : "cancelled",
          eligible,
          JSON.stringify(route),
        ]
      );
      return eligible && rows.length > 0;
    });
    if (!ready) return;
    attempted = true;
    const sent = await delivery.send({
      ...route,
      subject: row.draft.subject,
      ...renderCompanyReplyEmail(row.draft.body, row.snapshot.workspaceId),
      idempotencyKey: `agent-company-email:${id}`,
      signal: AbortSignal.timeout(45_000),
    });
    if (!sent.id && !sent.message_id)
      throw new Error("Email provider receipt missing");
    await db.query(
      "UPDATE public.company_email_outbox SET status='sent',provider_id=$3,sent_at=now(),lease_owner=NULL,lease_until=NULL WHERE id=$1::uuid AND lease_owner=$2::uuid",
      [id, owner, sent.id ?? sent.message_id]
    );
  } catch (error) {
    await db.query(
      "UPDATE public.company_email_outbox SET status=$3,last_error=$4,lease_owner=NULL,lease_until=NULL,available_at=now()+interval '5 minutes' WHERE id=$1::uuid AND lease_owner=$2::uuid",
      [
        id,
        owner,
        attempted ? "delivery_unknown" : "queued",
        error instanceof Error ? error.message : "delivery_failed",
      ]
    );
  }
}

export async function contactCompanyByEmail(
  args: {
    source: Exclude<AgentContactSource, { kind: "career" }>;
    operationKey: string;
    body: string;
    subject: string;
    roleId: string;
    rootId?: string;
  },
  db: Database = agentContactDatabase(),
  delivery: EmailTransport = transport
) {
  if (!args.subject.trim()) throw new Error("Email subject required");
  const ids = await db.transaction(async (q) => {
    await assertAgentContactSource(q, args.source, args.roleId);
    if (args.rootId) {
      const [root] = await q(
        "SELECT talent_id FROM public.agent_contact_messages WHERE id=$1::uuid AND root_id=id",
        [args.rootId]
      );
      if (!root) throw new Error("Introduction unavailable");
      await assertAgentContactSource(
        q,
        args.source,
        args.roleId,
        root.talent_id
      );
    }
    await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `agent-company-mail:${args.source.workspaceId}:${args.operationKey}`,
    ]);
    const previous = await q(
      "SELECT id FROM public.company_email_outbox WHERE topic='agent_contact_v1' AND snapshot->>'agentContactDeliveryKey'=$1",
      [`${args.source.workspaceId}:${args.operationKey}`]
    );
    if (previous.length) return previous.map((r) => r.id);
    const audience = await recipients(
      q,
      args.source.workspaceId,
      args.roleId,
      args.rootId
    );
    if (!audience.length)
      throw new Error(
        "No currently approved Role email recipient; use the company chat"
      );
    const saved = [];
    for (const person of audience.sort((a, b) =>
      a.user_id.localeCompare(b.user_id)
    )) {
      await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `company-email-recipient:${person.user_id}`,
      ]);
      const [row] = await q(
        `INSERT INTO public.company_email_outbox(recipient_id,topic,ordinal,snapshot,draft)
        SELECT $1::uuid,'agent_contact_v1',coalesce(max(ordinal),0)+1,$2::jsonb,$3::jsonb FROM public.company_email_outbox WHERE recipient_id=$1::uuid AND topic='agent_contact_v1' RETURNING id`,
        [
          person.user_id,
          JSON.stringify({
            workspaceId: args.source.workspaceId,
            roleId: args.roleId,
            rootId: args.rootId ?? null,
            email: person.email,
            source: args.source,
            agentContactDeliveryKey: `${args.source.workspaceId}:${args.operationKey}`,
          }),
          JSON.stringify({ subject: args.subject, body: args.body }),
        ]
      );
      saved.push(row.id);
    }
    return saved;
  });
  for (const id of ids) await deliverAgentCompanyEmail(id, db, delivery);
  const receipts = await db.query(
    "SELECT id,status,provider_id FROM public.company_email_outbox WHERE id=ANY($1::uuid[])",
    [ids]
  );
  return {
    status: "recorded",
    modelOutput: receipts
      .map(
        (r) =>
          `Company email ${r.id}: ${r.status}${r.provider_id ? `; provider receipt ${r.provider_id}` : ""}. Readership is unknown.`
      )
      .join("\n"),
  };
}

export async function recoverAgentCompanyEmail() {
  // This recovery shares the 60-second company dispatcher. A provider attempt
  // may consume 45 seconds; leave further durable rows for its next occurrence.
  const rows = await agentContactDatabase()
    .query(`SELECT id FROM public.company_email_outbox WHERE topic='agent_contact_v1' AND status IN ('queued','sending')
    AND available_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY available_at,id LIMIT 1`);
  for (const row of rows) await deliverAgentCompanyEmail(row.id);
  return rows.length;
}

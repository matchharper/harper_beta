import { createEmailReplyAlias } from "@/lib/email/inbound";
import {
  extractReplyAliasTokens,
  normalizeEmailAddress,
} from "@/lib/email/parse";
import { hashReplyToken } from "@/lib/email/security";
import type { TalentMessageRow } from "@/lib/talentOnboarding/server";
import {
  EmailBusyError,
  EmailPermanentError,
  asObject,
  emailRuntimeTable,
  nowIso,
  type EmailAdmin,
  type EmailRow,
  type EmailRuntimeKind,
} from "./types";

export async function readRow(
  admin: EmailAdmin,
  table: string,
  id: string,
  idColumn = "id",
  columns = "*"
): Promise<EmailRow | null> {
  const { data, error } = await (admin as any)
    .from(table)
    .select(columns)
    .eq(idColumn, id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function updateRow(
  admin: EmailAdmin,
  table: string,
  id: string,
  patch: EmailRow,
  idColumn = "id"
) {
  const { error } = await (admin as any)
    .from(table)
    .update(patch)
    .eq(idColumn, id);
  if (error) throw error;
}
export async function assertEmailLease(
  admin: EmailAdmin,
  kind: EmailRuntimeKind,
  id: string,
  owner: string
) {
  const row = await readRow(admin, emailRuntimeTable(kind), id);
  const owned =
    kind === "onboarding_review"
      ? row?.review_locked_by === owner &&
        row?.status === "active" &&
        row?.step === "profile_review_pending"
      : row?.locked_by === owner && row?.status === "processing";
  if (!owned || row?.worker_target !== "vercel_queue")
    throw new EmailBusyError("Email execution no longer owns this job");
  return row!;
}
export async function updateEmailJob(
  admin: EmailAdmin,
  kind: EmailRuntimeKind,
  id: string,
  owner: string,
  patch: EmailRow
) {
  const ownerColumn =
    kind === "onboarding_review" ? "review_locked_by" : "locked_by";
  const { data, error } = await (admin as any)
    .from(emailRuntimeTable(kind))
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", id)
    .eq(ownerColumn, owner)
    .eq("worker_target", "vercel_queue")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new EmailBusyError("Email execution lease was lost");
}
export async function persistReplyMessage(args: {
  admin: EmailAdmin;
  jobId: string;
  owner: string;
  talentId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: EmailRow;
}): Promise<TalentMessageRow> {
  const { data, error } = await (args.admin.rpc as any)(
    "persist_email_runtime_message_v1",
    {
      p_job_id: args.jobId,
      p_owner: args.owner,
      p_talent_id: args.talentId,
      p_conversation_id: args.conversationId,
      p_role: args.role,
      p_content: args.content,
      p_metadata: args.metadata ?? {},
    }
  );
  if (error) {
    if (
      error.message === "email_conversation_busy" ||
      error.message === "email_runtime_lease_lost"
    )
      throw new EmailBusyError(error.message);
    throw error;
  }
  return data as TalentMessageRow;
}
export async function ensureEmailConversation(
  admin: EmailAdmin,
  talentId: string,
  requestedId?: string | null
) {
  if (requestedId) {
    const row = await readRow(admin, "talent_conversations", requestedId);
    if (row?.user_id === talentId) return String(row.id);
    throw new EmailPermanentError(
      "Reply conversation is not owned by the candidate"
    );
  }
  const { data: recent, error: readError } = await (admin as any)
    .from("talent_conversations")
    .select("id")
    .eq("user_id", talentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  if (recent) return String(recent.id);
  const { data, error } = await (admin as any)
    .from("talent_conversations")
    .insert({ user_id: talentId, stage: "chat" })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}
export async function ensureReplyAlias(
  admin: EmailAdmin,
  talentId: string,
  conversationId: string,
  existing?: string | null
) {
  if (existing) return existing;
  return (
    await createEmailReplyAlias({ admin, conversationId, userId: talentId })
  ).address;
}
async function findSender(admin: EmailAdmin, sender: string) {
  const { data, error } = await (admin as any)
    .from("talent_users")
    .select("user_id,email")
    .ilike("email", sender.replace(/[\\%_]/g, "\\$&"))
    .is("deleted_at", null)
    .limit(2);
  if (error) throw error;
  if (data.length > 1) throw new EmailPermanentError("ambiguous_sender_email");
  return data[0] ?? null;
}
export async function resolveEmailIdentity(args: {
  admin: EmailAdmin;
  job: EmailRow;
  recipients: string[];
  sender: string;
}) {
  const { admin, job, sender } = args;
  const domain =
    process.env.EMAIL_REPLY_DOMAIN?.trim() || "reply.matchharper.com";
  const aliases = args.recipients
    .map(normalizeEmailAddress)
    .filter((v): v is string => Boolean(v));
  const { data: leads, error: leadError } = await (admin as any)
    .from("career_email_onboarding_leads")
    .select("*")
    .in("reply_alias", aliases.length ? aliases : [""])
    .in("status", ["active", "created"]);
  if (leadError) throw leadError;
  if (leads.length > 1)
    throw new EmailPermanentError("ambiguous_onboarding_alias");
  if (leads[0]?.talent_id)
    return {
      talentId: String(leads[0].talent_id),
      conversationId: leads[0].conversation_id,
      companyRequestId: null,
      alias: String(leads[0].reply_alias),
      lead: leads[0],
    };
  const tokens = extractReplyAliasTokens({ addresses: aliases, domain });
  if (tokens.length) {
    const hashes = tokens.map(hashReplyToken);
    const { data, error } = await (admin as any)
      .from("email_reply_aliases")
      .select("*")
      .in("token_hash", hashes);
    if (error) throw error;
    const valid: EmailRow[] = [];
    for (const a of data) {
      if (!a.company_talent_request_id) {
        if (!a.expires_at || Date.parse(a.expires_at) > Date.now())
          valid.push(a);
      } else {
        const { data: delivery, error: deliveryError } = await (admin as any)
          .from("contact_queue")
          .select("id")
          .eq("company_talent_request_id", a.company_talent_request_id)
          .eq("type", "company_request_candidate_delivery")
          .eq("status", "sent")
          .not("sent_at", "is", null)
          .limit(1)
          .maybeSingle();
        if (deliveryError) throw deliveryError;
        if (delivery) valid.push(a);
      }
    }
    if (valid.length !== 1)
      throw new EmailPermanentError("reply_alias_not_found_or_ambiguous");
    const alias = valid[0];
    if (alias.company_talent_request_id) {
      const candidate = await findSender(admin, sender);
      if (candidate?.user_id !== alias.talent_id)
        throw new EmailPermanentError("company_request_alias_sender_mismatch");
    }
    return {
      talentId: String(alias.talent_id),
      conversationId: alias.conversation_id,
      companyRequestId: alias.company_talent_request_id ?? null,
      alias: aliases.find((a) =>
        a.includes(`+${tokens[hashes.indexOf(alias.token_hash)]}@`)
      )!,
      lead: null,
    };
  }
  const candidate = await findSender(admin, sender);
  if (!candidate || (job.talent_id && candidate.user_id !== job.talent_id))
    throw new EmailPermanentError("unmatched_sender");
  return {
    talentId: String(candidate.user_id),
    conversationId: job.conversation_id ?? null,
    companyRequestId: null,
    alias: null,
    lead: null,
  };
}
export async function recordEmailAudit(admin: EmailAdmin, fields: EmailRow) {
  const row: EmailRow = {
    ...fields,
    occurred_at: fields.occurred_at ?? nowIso(),
  };
  // The existing message ID is the durable source; deterministic audit IDs
  // permit replay even after provider deduplication has expired.
  if (!row.id) throw new Error("Email audit requires a stable delivery ID");
  const { error } = await (admin.rpc as any)("record_email_runtime_audit_v1", {
    p_row: row,
  });
  if (error) throw error;
}
export function emailLocale(setting: EmailRow | null) {
  return String(
    setting?.setting_locale ?? setting?.preferred_locale ?? "ko"
  ).startsWith("en")
    ? "en"
    : "ko";
}
export function messageMetadata(job: EmailRow) {
  return asObject(job.metadata);
}

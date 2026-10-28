import type { User } from "@supabase/supabase-js";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { ensureOrgAgentConversation } from "@/lib/org/agent/store";
import { assertOrgWorkspacePermission } from "@/lib/org/server";
import { createReplyToken, hashReplyToken } from "./security";
import { normalizeEmailAddress } from "./parse";
import { sendResendEmail } from "./send";
import { renderCompanyReplyEmail } from "./runtime/format";
import { readRow } from "./runtime/store";
import { EmailPermanentError, type EmailAdmin } from "./runtime/types";

/** Sender must still be the verified account and a current workspace team member. */
export async function authorizeCompanyEmail(admin: EmailAdmin, userId: string, workspaceId: string, sender?: string) {
  const profile = await readRow(admin, "company_users", userId, "user_id");
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  const user = data.user;
  const email = normalizeEmailAddress(user?.email ?? "");
  if (!user || !user.email_confirmed_at || !email ||
      normalizeEmailAddress(profile?.email ?? "") !== email || (sender && sender !== email) ||
      (user.banned_until && Date.parse(user.banned_until) > Date.now()))
    throw new EmailPermanentError("company_email_account_mismatch");
  const { data: membership, error: membershipError } = await (admin as any).from("company_user_workspace")
    .select("company_user_id").eq("company_user_id", userId).eq("company_workspace_id", workspaceId).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new EmailPermanentError("company_email_membership_revoked");
  await assertOrgWorkspacePermission({ admin, user, workspaceId, permission: "manage_candidates" });
  return { user: user as User, email, locale: profile?.locale === "en" ? "en" as const : profile?.locale === "ko" ? "ko" as const : undefined };
}

/** Use this for new company-user mail that should accept company-side LLM replies.
 * Reusing the outbound idempotency key returns the same reply address.
 */
export async function createCompanyEmailReplyAlias(args: {
  userId: string; workspaceId: string; subject: string; body: string;
  idempotencyKey: string; expiresAt?: string; admin?: EmailAdmin;
}) {
  const admin = args.admin ?? getTalentSupabaseAdmin();
  const { user, email } = await authorizeCompanyEmail(admin, args.userId, args.workspaceId);
  const { conversation } = await ensureOrgAgentConversation({ user, workspaceId: args.workspaceId });
  const reuse = async () => {
    const { data, error } = await (admin as any).from("email_reply_aliases").select("*")
      .eq("metadata->>companyOutboundKey", args.idempotencyKey).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const original = data.metadata?.originalEmail;
    if (data.company_user_id !== user.id || data.company_workspace_id !== args.workspaceId ||
        data.company_conversation_id !== conversation.id || data.metadata?.recipient !== email || original?.subject !== args.subject || original?.body !== args.body ||
        !data.metadata?.replyAddress || (data.expires_at && Date.parse(data.expires_at) <= Date.now()))
      throw new EmailPermanentError("company_email_outbound_identity_changed");
    return { to: email, replyTo: String(data.metadata.replyAddress) };
  };
  if (!args.idempotencyKey.trim() || args.idempotencyKey.length > 256) throw new Error("Company email requires a durable idempotency key");
  const previous = await reuse();
  if (previous) return previous;
  const token = createReplyToken();
  const replyTo = `company+${token}@${(process.env.EMAIL_REPLY_DOMAIN?.trim() || "reply.matchharper.com").toLowerCase()}`;
  const { error } = await (admin as any).from("email_reply_aliases").insert({
    talent_id: null, company_user_id: user.id, company_workspace_id: args.workspaceId,
    company_conversation_id: conversation.id, token_hash: hashReplyToken(token),
    expires_at: args.expiresAt ?? null,
    metadata: { recipient: email, companyOutboundKey: args.idempotencyKey, replyAddress: replyTo, originalEmail: { subject: args.subject, body: args.body } },
  });
  if (error) {
    if (error.code === "23505") {
      const raced = await reuse();
      if (raced) return raced;
    }
    throw error;
  }
  return { to: email, replyTo };
}

/** One send entry point: stable company reply route, frozen original context and
 * provider idempotency all use the caller's durable outbound-event identity. */
export async function sendCompanyEmail(args: {
  userId: string; workspaceId: string; subject: string; body: string; idempotencyKey: string;
}) {
  const route = await createCompanyEmailReplyAlias(args);
  return sendResendEmail({ ...route, subject: args.subject,
    ...renderCompanyReplyEmail(args.body, args.workspaceId), idempotencyKey: args.idempotencyKey });
}

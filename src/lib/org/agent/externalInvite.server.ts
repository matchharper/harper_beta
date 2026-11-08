import { createReplyToken, hashReplyToken } from "@/lib/email/security";
import { normalizeEmailAddress } from "@/lib/email/parse";
import { renderEmailBodyHtml, renderEmailBodyText } from "@/lib/email/bodyFormat";
import { wrapEmailHtml } from "@/lib/email/runtime/format";
import { sendResendEmail } from "@/lib/email/send";
import { GTM_OUTREACH_RESEND_FROM } from "@/lib/contentsEngine/resend";
import { parseGtmResendDeliveryEvent, type ResendDeliveryEventPayload } from "@/lib/contentsEngine/resendDelivery";
import { parseResendEmailOpenedEvent, type ResendEmailOpenedEventPayload } from "@/lib/email/openTracking";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import type { Json } from "@/types/database.types";
import { throwBillingDbError } from "@/lib/org/billing/store";
import { billingErrorCode } from "@/lib/org/billing/types";
import type { OrgAgentAdminClient } from "./data";
import { enqueueCompanyUpdate } from "./companyUpdate.server";
import { externalSourcingEnabledFor } from "./externalSourcing";
import { requestExternalEmailLookup } from "./externalSourcing.server";
import {
  EXTERNAL_REPLY_LOCAL_PREFIX,
  externalInviteDailyLimit,
  externalInviteOutcomeFacts,
  externalInviteRecipientAllowed,
  externalInviteSendingEnabled,
  externalReplyDomain,
  inExternalInviteWindow,
  inviteLanguage,
  externalConnectNoticeFacts,
  renderExternalConnectEmail,
  renderExternalConnectLinkReply,
  renderExternalInvite,
  type InviteLanguage,
} from "./externalInvite";

type Admin = OrgAgentAdminClient;
type SendEmail = typeof sendResendEmail;
type Notify = typeof enqueueCompanyUpdate;
type Delivery = Parameters<SendEmail>[0];

const LEASE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
const LOOKUP_WAIT_MS = 10 * 60_000;
const GIVE_UP_LOOKUP_MS = 3 * 86_400_000;
const RECENT_INVITE_MS = 14 * 86_400_000;
export const EXTERNAL_INVITE_FROM = GTM_OUTREACH_RESEND_FROM;

function record(value: Json | undefined): { [key: string]: Json | undefined } {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Keyed hash of an address: enough to block it, not to recover it. */
export function externalEmailHash(email: string) {
  return hashReplyToken(`external-suppression:${normalizeEmailAddress(email) ?? email.trim().toLowerCase()}`);
}

/** The person's own "connect" link: a confirmation page; only confirming there connects (mail scanners only open it). */
export function externalConnectUrl(token: string) {
  const url = new URL("/api/email/external-connect", getConfiguredPublicSiteUrl());
  url.searchParams.set("t", token);
  return url.toString();
}

export function externalUnsubscribeUrl(token: string) {
  const url = new URL("/api/email/external-unsubscribe", getConfiguredPublicSiteUrl());
  url.searchParams.set("t", token);
  return url.toString();
}

async function suppress(admin: Admin, email: string | null, reason: string, requestId: string) {
  if (!email) return;
  const { error } = await admin.from("external_contact_suppressions")
    .upsert({ email_hash: externalEmailHash(email), reason, external_intro_request_id: requestId },
      { onConflict: "email_hash", ignoreDuplicates: true });
  if (error) throw error;
}

async function isSuppressed(admin: Admin, email: string) {
  const { data, error } = await admin.from("external_contact_suppressions").select("email_hash")
    .eq("email_hash", externalEmailHash(email)).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

type ClaimedRequest = {
  id: string; status: string; attempt_count: number; external_candidate_id: string; company_workspace_id: string;
  role_id: string; requested_by: string; company_appeal: string; result: Json; created_at: string;
};
const REQUEST_COLUMNS = "id,status,attempt_count,external_candidate_id,company_workspace_id,role_id,requested_by,company_appeal,result,created_at";

async function release(admin: Admin, row: ClaimedRequest, patch: { status: string; available_at?: string; error_code?: string | null; attempt_count?: number }) {
  const { error } = await admin.from("external_intro_requests")
    .update({ ...patch, lease_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", "sending").eq("attempt_count", row.attempt_count);
  if (error) throw error;
}

async function notifyOutcome(args: { row: ClaimedRequest; roleName: string; person: { ref: string; name: string | null };
  outcome: "not_sendable" | "failed" | "bounced" | "unsubscribed" | "connect_failed"; reason: string }, notify: Notify = enqueueCompanyUpdate) {
  await notify({
    workspaceId: args.row.company_workspace_id, roleId: args.row.role_id,
    eventKey: `external_invite:${args.row.id}:${args.outcome}`,
    purpose: args.outcome === "connect_failed"
      ? "Tell the company, in its hiring conversation, that the external person it asked to meet confirmed the connection but Harper could not send the introduction email, and what this means. Propose a next step only when one is real."
      : "Tell the company, in its hiring conversation, that the invitation for the external person it asked to meet did not go out or was not delivered, and what this means. Propose a next step only when one is real.",
    facts: externalInviteOutcomeFacts({ requestId: args.row.id, roleName: args.roleName, person: args.person,
      outcome: args.outcome, reason: args.reason }),
  });
}

async function loadContext(admin: Admin, row: ClaimedRequest) {
  const [candidate, contact, role, internal, workspace] = await Promise.all([
    admin.from("external_candidates").select("id,name,location,linkedin_url,company_decision").eq("id", row.external_candidate_id).maybeSingle(),
    admin.from("external_candidate_contacts").select("status,email,source_url,source_kind").eq("external_candidate_id", row.external_candidate_id).maybeSingle(),
    admin.from("company_roles").select("name,status,is_expired").eq("role_id", row.role_id).maybeSingle(),
    admin.from("company_internal_roles").select("is_anonymous").eq("role_id", row.role_id).maybeSingle(),
    admin.from("company_workspace").select("company_name,published_name,linkedin_url,homepage_url").eq("company_workspace_id", row.company_workspace_id).maybeSingle(),
  ]);
  for (const result of [candidate, contact, role, internal, workspace]) if (result.error) throw result.error;
  return {
    candidate: candidate.data, contact: contact.data, role: role.data,
    anonymous: internal.data?.is_anonymous === true,
    companyName: workspace.data?.published_name?.trim() || workspace.data?.company_name?.trim() || null,
    companyPages: { linkedinUrl: workspace.data?.linkedin_url?.trim() || null, homepageUrl: workspace.data?.homepage_url?.trim() || null },
  };
}

/** Why this request cannot get an invitation now: null = send, "wait" = try again later. */
async function blocker(admin: Admin, row: ClaimedRequest, ctx: Awaited<ReturnType<typeof loadContext>>, now: Date) {
  if (!ctx.candidate) return "person_removed";
  if (!ctx.role || ctx.role.status !== "active" || ctx.role.is_expired) return "role_not_active";
  const contact = ctx.contact;
  if (!contact || contact.status === "queued" || contact.status === "running") {
    if (now.getTime() - Date.parse(row.created_at) > GIVE_UP_LOOKUP_MS) return "no_email_found";
    // A request recorded while no lookup started (invitations were off then) gets one now; a queued one is only awaited.
    if (!contact) {
      await requestExternalEmailLookup({ admin, workspaceId: row.company_workspace_id, roleId: row.role_id,
        userId: row.requested_by, candidateRef: row.external_candidate_id, now });
    }
    return "wait";
  }
  if (contact.status === "failed") return "email_lookup_failed";
  if (contact.status !== "found") return "no_email_found";
  const email = normalizeEmailAddress(contact.email ?? "");
  if (!email) return "address_removed";
  if (!externalInviteRecipientAllowed(email)) return "test_recipients_only";
  if (await isSuppressed(admin, email)) return "opted_out";
  const member = await admin.from("talent_users").select("user_id").eq("email", email).is("deleted_at", null).limit(1);
  if (member.error) throw member.error;
  if (member.data?.length) return "harper_member";
  const recent = await admin.from("external_intro_requests").select("id").eq("recipient_email", email).neq("id", row.id)
    .gte("invited_at", new Date(now.getTime() - RECENT_INVITE_MS).toISOString()).limit(1);
  if (recent.error) throw recent.error;
  if (recent.data?.length) return "recently_invited";
  return null;
}

/** The site an address was found on, as the recipient can recognize it (host without "www."). */
function sourceHost(url: string | null | undefined) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") || null : null;
  } catch {
    return null;
  }
}

function buildDelivery(args: { row: ClaimedRequest; ctx: Awaited<ReturnType<typeof loadContext>>; email: string;
  replyToken: string; unsubscribeToken: string; acceptToken: string }): Delivery {
  const { row, ctx } = args;
  const unsubscribeUrl = externalUnsubscribeUrl(args.unsubscribeToken);
  const rendered = renderExternalInvite({
    language: inviteLanguage({ name: ctx.candidate?.name, location: ctx.candidate?.location }),
    personName: ctx.candidate?.name ?? null, companyName: ctx.anonymous ? null : ctx.companyName,
    roleName: ctx.role?.name ?? "", companyAppeal: row.company_appeal, unsubscribeUrl,
    connectUrl: externalConnectUrl(args.acceptToken),
    // Only a page where the Worker itself found the address next to the person (self_published) is named.
    addressSource: ctx.contact?.source_kind === "self_published" ? sourceHost(ctx.contact.source_url) : null,
  });
  return {
    from: EXTERNAL_INVITE_FROM, to: args.email, subject: rendered.subject,
    text: renderEmailBodyText(rendered.body), html: wrapEmailHtml(renderEmailBodyHtml(rendered.body)),
    replyTo: `${EXTERNAL_REPLY_LOCAL_PREFIX}${args.replyToken}@${externalReplyDomain()}`,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    idempotencyKey: `external-intro-invite/${row.id}`,
  };
}

async function processClaimed(admin: Admin, row: ClaimedRequest, now: Date, send: SendEmail) {
  const ctx = await loadContext(admin, row);
  // The company passed after asking: nothing goes out, also on a retry with a fixed payload.
  if (ctx.candidate?.company_decision === "passed") {
    await release(admin, row, { status: "cancelled", error_code: "company_passed" });
    return "cancelled";
  }
  const person = { ref: row.external_candidate_id, name: ctx.candidate?.name ?? null };
  const roleName = ctx.role?.name ?? "";
  const result = record(row.result);
  let delivery = record(result.delivery) as unknown as Delivery;
  if (!delivery.to) {
    const reason = await blocker(admin, row, ctx, now);
    if (reason === "wait") {
      // Waiting for the address is not a sending attempt.
      await release(admin, row, { status: "requested", attempt_count: row.attempt_count - 1,
        available_at: new Date(now.getTime() + LOOKUP_WAIT_MS).toISOString() });
      return "waiting";
    }
    if (reason) {
      await release(admin, row, { status: "not_sendable", error_code: reason });
      if (reason !== "person_removed" && reason !== "role_not_active") {
        await notifyOutcome({ row, roleName, person, outcome: "not_sendable", reason });
      }
      return "not_sendable";
    }
    const email = normalizeEmailAddress(ctx.contact?.email ?? "")!;
    const replyToken = createReplyToken();
    const unsubscribeToken = createReplyToken();
    const acceptToken = createReplyToken();
    delivery = buildDelivery({ row, ctx, email, replyToken, unsubscribeToken, acceptToken });
    // The exact payload (tokens, idempotency key) is fixed before the first send; retries resend it.
    const { data: saved, error } = await admin.from("external_intro_requests").update({
      recipient_email: email, reply_token_hash: hashReplyToken(replyToken), unsubscribe_token_hash: hashReplyToken(unsubscribeToken),
      accept_token_hash: hashReplyToken(acceptToken),
      // connectUrl is kept for Harper's one reply with the same link (the payload already carries it).
      result: { ...result, delivery: delivery as unknown as Json, language: inviteLanguage({ name: ctx.candidate?.name, location: ctx.candidate?.location }),
        connectUrl: externalConnectUrl(acceptToken) },
      updated_at: now.toISOString(),
    }).eq("id", row.id).eq("status", "sending").eq("attempt_count", row.attempt_count).select("id").maybeSingle();
    if (error) throw error;
    if (!saved) return "lease_lost";
  }
  // A payload fixed before the test list changed is checked again before every send.
  if (!externalInviteRecipientAllowed(delivery.to)) {
    await release(admin, row, { status: "not_sendable", error_code: "test_recipients_only" });
    return "not_sendable";
  }
  if (await isSuppressed(admin, delivery.to)) {
    await release(admin, row, { status: "not_sendable", error_code: "opted_out" });
    return "not_sendable";
  }
  let emailId: string;
  try {
    const sent = await send(delivery);
    emailId = String(sent.id ?? "").trim();
    if (!emailId) throw new Error("Resend did not return an email ID");
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "send failed";
    if (row.attempt_count >= MAX_ATTEMPTS) {
      await release(admin, row, { status: "failed", error_code: "send_failed" });
      await notifyOutcome({ row, roleName, person, outcome: "failed", reason: "send_failed" });
      return "failed";
    }
    await release(admin, row, { status: "requested", error_code: "send_retry",
      available_at: new Date(now.getTime() + 5 * 60_000 * 2 ** row.attempt_count).toISOString() });
    console.error("[external-invite] send failed, will retry", { requestId: row.id, message });
    return "retry";
  }
  const { error } = await admin.from("external_intro_requests").update({
    status: "invited", invite_email_id: emailId, invited_at: new Date().toISOString(), error_code: null,
    lease_expires_at: null, updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("status", "sending");
  if (error) throw error;
  return "invited";
}

/**
 * Cron: introductions the invited people confirmed (any time), then due invitations: off unless
 * ORG_EXTERNAL_INVITE_SENDING=on, Korean daytime only, global daily cap.
 */
export async function dispatchExternalInvites(args: { admin: Admin; now?: Date; limit?: number; send?: SendEmail; notify?: Notify }) {
  const now = args.now ?? new Date();
  if (process.env.EMAIL_REPLY_DRY_RUN === "true") return { disabled: true as const };
  const connected = await dispatchExternalConnections(args.admin, now, args.send ?? sendResendEmail, args.notify ?? enqueueCompanyUpdate);
  const connections = Object.keys(connected).length ? { connections: connected } : {};
  if (!externalInviteSendingEnabled()) return { disabled: true as const, ...connections };
  if (!inExternalInviteWindow(now)) return { outsideWindow: true as const, ...connections };
  const { admin } = args;
  const { count, error: countError } = await admin.from("external_intro_requests").select("id", { count: "exact", head: true })
    .gte("invited_at", new Date(now.getTime() - 86_400_000).toISOString());
  if (countError) throw countError;
  let room = externalInviteDailyLimit() - (count ?? 0);
  const nowIso = now.toISOString();
  const { data: due, error } = await admin.from("external_intro_requests")
    .select("id,status,attempt_count,company_workspace_id")
    .or(`and(status.eq.requested,available_at.lte.${nowIso}),and(status.eq.sending,lease_expires_at.lt.${nowIso})`)
    .order("available_at", { ascending: true }).limit(args.limit ?? 5);
  if (error) throw error;
  const outcomes: Record<string, number> = {};
  for (const item of due ?? []) {
    if (room <= 0) break;
    if (!externalSourcingEnabledFor(item.company_workspace_id)) continue;
    const { data: claimed, error: claimError } = await admin.from("external_intro_requests").update({
      status: "sending", attempt_count: item.attempt_count + 1,
      lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(), updated_at: nowIso,
    }).eq("id", item.id).eq("status", item.status).eq("attempt_count", item.attempt_count)
      .select(REQUEST_COLUMNS).maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    const outcome = await processClaimed(admin, claimed, now, args.send ?? sendResendEmail);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    if (outcome === "invited") room -= 1;
  }
  return { outcomes, ...connections };
}

/** Resend bounce / complaint / failure for an invitation. Returns handled=false for other emails. */
export async function ingestExternalInviteDeliveryEvent(args: { admin: Admin; event: ResendDeliveryEventPayload }) {
  const parsed = parseGtmResendDeliveryEvent(args.event);
  const { admin } = args;
  const { data: row, error } = await admin.from("external_intro_requests")
    .select("id,status,external_candidate_id,company_workspace_id,role_id,recipient_email,attempt_count,requested_by,company_appeal,result,created_at")
    .eq("invite_email_id", parsed.providerMessageId).maybeSingle();
  if (error) throw error;
  if (!row) return { handled: false as const };
  if (parsed.eventType === "email.delivery_delayed" || !parsed.permanent) return { handled: true as const, ignored: "not_final" };
  await suppress(admin, row.recipient_email, parsed.eventType === "email.complained" ? "complained" : "bounced", row.id);
  const { data: updated, error: updateError } = await admin.from("external_intro_requests")
    .update({ status: "bounced", error_code: parsed.eventType.replace("email.", ""), updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", "invited").select("id").maybeSingle();
  if (updateError) throw updateError;
  if (updated) {
    const [candidate, role] = await Promise.all([
      admin.from("external_candidates").select("name,company_decision").eq("id", row.external_candidate_id).maybeSingle(),
      admin.from("company_roles").select("name").eq("role_id", row.role_id).maybeSingle(),
    ]);
    // A person the company passed is not reported again.
    if (candidate.data?.company_decision === "passed") return { handled: true as const };
    await notifyOutcome({ row: { ...row, status: "bounced" }, roleName: role.data?.name ?? "",
      person: { ref: row.external_candidate_id, name: candidate.data?.name ?? null }, outcome: "bounced",
      reason: parsed.eventType.replace("email.", "") });
  }
  return { handled: true as const };
}

/**
 * First open of an invitation (Resend open tracking). Only the first open is kept; later opens and
 * opens after a reply change nothing. Returns handled=false for any other email so the caller can
 * pass the event on to career-email open tracking.
 */
export async function ingestExternalInviteOpenedEvent(args: { admin: Admin; event: ResendEmailOpenedEventPayload }) {
  const parsed = parseResendEmailOpenedEvent(args.event);
  const { data: row, error } = await args.admin.from("external_intro_requests")
    .select("id,opened_at").eq("invite_email_id", parsed.resendEmailId).maybeSingle();
  if (error) throw error;
  if (!row) return { handled: false as const };
  if (row.opened_at) return { handled: true as const, firstOpen: false };
  const { error: updateError } = await args.admin.from("external_intro_requests")
    .update({ opened_at: parsed.openedAt }).eq("id", row.id).is("opened_at", null);
  if (updateError) throw updateError;
  return { handled: true as const, firstOpen: true };
}

/** Opt-out from the invitation link (one-click POST or the confirmation form). Idempotent. */
export async function unsubscribeExternalInvite(args: { admin: Admin; token: string }) {
  const token = args.token.trim().toLowerCase();
  if (!/^[a-z0-9_-]{12,}$/.test(token)) return { ok: false as const };
  const { admin } = args;
  const { data: row, error } = await admin.from("external_intro_requests")
    .select("id,status,external_candidate_id,company_workspace_id,role_id,recipient_email,attempt_count,requested_by,company_appeal,result,created_at")
    .eq("unsubscribe_token_hash", hashReplyToken(token)).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false as const };
  await suppress(admin, row.recipient_email, "unsubscribed", row.id);
  if (["unsubscribed", "declined"].includes(row.status)) return { ok: true as const };
  const { data: updated, error: updateError } = await admin.from("external_intro_requests")
    .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", row.status).select("id").maybeSingle();
  if (updateError) throw updateError;
  if (updated) {
    const [candidate, role] = await Promise.all([
      admin.from("external_candidates").select("name,company_decision").eq("id", row.external_candidate_id).maybeSingle(),
      admin.from("company_roles").select("name").eq("role_id", row.role_id).maybeSingle(),
    ]);
    if (candidate.data?.company_decision === "passed") return { ok: true as const };
    await notifyOutcome({ row, roleName: role.data?.name ?? "", outcome: "unsubscribed", reason: "opt_out_link",
      person: { ref: row.external_candidate_id, name: candidate.data?.name ?? null } });
  }
  return { ok: true as const };
}

// ---- the person's own connect: confirmation page, then one CC introduction ------------------

/** The connect link works this long after the invitation went out. */
const CONNECT_LINK_VALID_MS = 30 * 86_400_000;
/** Requests whose person may still connect: invited, or answered without closing it. */
const CONNECTABLE = ["invited", "replied"];
const CONNECT_COLUMNS = `${REQUEST_COLUMNS},intro_recipient_emails,recipient_email,invited_at,accepted_at,connected_at,lease_expires_at`;
type ConnectRow = ClaimedRequest & {
  intro_recipient_emails: string[]; recipient_email: string | null; invited_at: string | null;
  accepted_at: string | null; connected_at: string | null; lease_expires_at: string | null;
};

export type ExternalConnectView =
  | { state: "not_found" }
  | { state: "ready" | "connecting" | "connected" | "closed"; language: InviteLanguage; personName: string | null;
      companyName: string | null; roleName: string };

async function findByAcceptToken(admin: Admin, token: string) {
  const value = token.trim().toLowerCase();
  if (!/^[a-z0-9_-]{12,}$/.test(value)) return null;
  const { data, error } = await admin.from("external_intro_requests").select(CONNECT_COLUMNS)
    .eq("accept_token_hash", hashReplyToken(value)).maybeSingle();
  if (error) throw error;
  return data as ConnectRow | null;
}

async function readConnectRow(admin: Admin, id: string) {
  const { data, error } = await admin.from("external_intro_requests").select(CONNECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ConnectRow | null;
}

/** Whether the person can still connect: the request, the company's decision and the Role decide. */
function connectState(row: ConnectRow, ctx: Awaited<ReturnType<typeof loadContext>>, now: Date): Exclude<ExternalConnectView["state"], "not_found"> {
  if (row.status === "connected") return "connected";
  if (row.status === "accepted" || row.status === "connecting") return "connecting";
  if (!CONNECTABLE.includes(row.status) || !row.invited_at) return "closed";
  if (now.getTime() - Date.parse(row.invited_at) > CONNECT_LINK_VALID_MS) return "closed";
  if (!ctx.candidate || ctx.candidate.company_decision === "passed") return "closed";
  if (!ctx.role || ctx.role.status !== "active" || ctx.role.is_expired) return "closed";
  return "ready";
}

function connectView(row: ConnectRow, ctx: Awaited<ReturnType<typeof loadContext>>, state: Exclude<ExternalConnectView["state"], "not_found">): ExternalConnectView {
  return {
    state, language: inviteLanguage({ name: ctx.candidate?.name, location: ctx.candidate?.location }),
    personName: ctx.candidate?.name ?? null, companyName: ctx.anonymous ? null : ctx.companyName, roleName: ctx.role?.name ?? "",
  };
}

/** The confirmation page: reads state only, so opening the link (or a mail scanner) records nothing. */
export async function getExternalConnectView(args: { admin: Admin; token: string; now?: Date }): Promise<ExternalConnectView> {
  const row = await findByAcceptToken(args.admin, args.token);
  if (!row) return { state: "not_found" };
  const ctx = await loadContext(args.admin, row);
  return connectView(row, ctx, connectState(row, ctx, args.now ?? new Date()));
}

/**
 * The person confirmed on the page: record it once, then send the introduction right away. A send that
 * fails here is retried by the invitation cron, so the page can already say the introduction is on its way.
 */
export async function acceptExternalInvite(args: { admin: Admin; token: string; now?: Date; send?: SendEmail; notify?: Notify }): Promise<ExternalConnectView> {
  const { admin } = args;
  const now = args.now ?? new Date();
  const row = await findByAcceptToken(admin, args.token);
  if (!row) return { state: "not_found" };
  const ctx = await loadContext(admin, row);
  const state = connectState(row, ctx, now);
  if (state !== "ready") return connectView(row, ctx, state);
  const { data: accepted, error } = await admin.from("external_intro_requests").update({
    status: "accepted", accepted_at: now.toISOString(), available_at: now.toISOString(), attempt_count: 0,
    lease_expires_at: null, error_code: null, updated_at: now.toISOString(),
  }).eq("id", row.id).eq("status", row.status).select("id").maybeSingle();
  if (error) throw error;
  if (accepted) {
    try {
      await connectAccepted(admin, row.id, now, args.send ?? sendResendEmail, args.notify ?? enqueueCompanyUpdate);
    } catch (connectError) {
      console.error("[external-invite] connect failed; the cron retries", { requestId: row.id, connectError });
    }
  }
  const latest = await readConnectRow(admin, row.id);
  return connectView(latest ?? row, ctx, latest?.status === "connected" ? "connected" : "connecting");
}

async function releaseConnect(admin: Admin, row: ConnectRow, patch: { status: string; available_at?: string; error_code?: string | null }) {
  const { error } = await admin.from("external_intro_requests")
    .update({ ...patch, lease_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", "connecting").eq("attempt_count", row.attempt_count);
  if (error) throw error;
}

/** Claim an accepted request (or one whose sender stopped mid-way) and send its introduction. */
async function connectAccepted(admin: Admin, id: string, now: Date, send: SendEmail, notify: Notify) {
  const row = await readConnectRow(admin, id);
  if (!row) return "missing";
  if (row.status !== "accepted" && row.status !== "connecting") return row.status;
  // A connecting row is taken over only when its sender's lease ran out.
  if (row.status === "connecting" && row.lease_expires_at && Date.parse(row.lease_expires_at) > now.getTime()) return "busy";
  const { data: claimed, error } = await admin.from("external_intro_requests").update({
    status: "connecting", attempt_count: row.attempt_count + 1,
    lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(), updated_at: now.toISOString(),
  }).eq("id", row.id).eq("status", row.status).eq("attempt_count", row.attempt_count)
    .select(CONNECT_COLUMNS).maybeSingle();
  if (error) throw error;
  if (!claimed) return "busy";
  return sendConnection(admin, claimed as ConnectRow, now, send, notify);
}

/** The connection credit for one outside person: the same debit as a member Intro request, keyed by the person. */
async function chargeConnection(admin: Admin, row: ConnectRow) {
  const { error } = await admin.rpc("workspace_billing_debit_v1" as never, {
    p_workspace: row.company_workspace_id, p_action: "intro_request", p_key: `external:${row.external_candidate_id}`,
    p_role: row.role_id, p_talent: row.external_candidate_id, p_actor: row.requested_by,
    p_payload: { externalIntroRequestId: row.id }, p_complete: true,
  } as never);
  throwBillingDbError(error);
}

/** One email To the person, CC the requesting member and the company recipients; replies reach all of them. */
async function sendConnection(admin: Admin, row: ConnectRow, now: Date, send: SendEmail, notify: Notify) {
  const ctx = await loadContext(admin, row);
  const roleName = ctx.role?.name ?? "";
  const person = { ref: row.external_candidate_id, name: ctx.candidate?.name ?? null };
  // The company passed between the person's click and this send: nobody is introduced.
  if (ctx.candidate?.company_decision === "passed") {
    await releaseConnect(admin, row, { status: "cancelled", error_code: "company_passed" });
    return "cancelled";
  }
  const to = normalizeEmailAddress(row.recipient_email ?? "");
  // The requester's name and address; the title is the one set for this workspace.
  const [{ data: requester, error: requesterError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.from("company_users").select("name,email").eq("user_id", row.requested_by).maybeSingle(),
    admin.from("company_user_workspace").select("role").eq("company_user_id", row.requested_by)
      .eq("company_workspace_id", row.company_workspace_id).maybeSingle(),
  ]);
  if (requesterError) throw requesterError;
  if (membershipError) throw membershipError;
  const cc = [...new Set([requester?.email, ...(row.intro_recipient_emails ?? [])]
    .map((email) => normalizeEmailAddress(email ?? "")).filter((email): email is string => Boolean(email) && email !== to))];
  if (!to || !cc.length) {
    await releaseConnect(admin, row, { status: "failed", error_code: "connect_no_recipients" });
    await notifyOutcome({ row, roleName, person, outcome: "connect_failed", reason: "connect_no_recipients" });
    return "failed";
  }
  // Test mode covers the person's address here too.
  if (!externalInviteRecipientAllowed(to)) {
    await releaseConnect(admin, row, { status: "failed", error_code: "connect_test_recipients_only" });
    return "failed";
  }
  // One connection credit, used when the introduction goes out: charged before the send, once per person,
  // so a retry reuses the same receipt. Without a credit nothing is sent; the person's confirmation stays.
  try {
    await chargeConnection(admin, row);
  } catch (error) {
    const code = billingErrorCode(error);
    if (code !== "credits_exhausted" && code !== "role_slot_required") throw error;
    const reason = code === "credits_exhausted" ? "credits_exhausted" : "role_not_active";
    await releaseConnect(admin, row, { status: "failed", error_code: `connect_${reason}` });
    await notifyOutcome({ row, roleName, person, outcome: "connect_failed", reason }, notify);
    return "failed";
  }
  const rendered = renderExternalConnectEmail({
    language: inviteLanguage({ name: ctx.candidate?.name, location: ctx.candidate?.location }),
    personName: ctx.candidate?.name ?? null, companyName: ctx.anonymous ? null : ctx.companyName, roleName,
    companyAppeal: row.company_appeal, linkedinUrl: ctx.candidate?.linkedin_url ?? null,
    company: { ...ctx.companyPages, contactName: requester?.name ?? null, contactTitle: membership?.role ?? null },
  });
  let emailId: string;
  try {
    const sent = await send({
      from: EXTERNAL_INVITE_FROM, to, cc, subject: rendered.subject,
      text: renderEmailBodyText(rendered.body), html: wrapEmailHtml(renderEmailBodyHtml(rendered.body)),
      replyTo: [to, ...cc], idempotencyKey: `external-intro-connect/${row.id}`,
    });
    emailId = String(sent.id ?? "").trim();
    if (!emailId) throw new Error("Resend did not return an email ID");
  } catch (error) {
    if (row.attempt_count >= MAX_ATTEMPTS) {
      await releaseConnect(admin, row, { status: "failed", error_code: "connect_send_failed" });
      await notifyOutcome({ row, roleName, person, outcome: "connect_failed", reason: "send_failed" });
      return "failed";
    }
    await releaseConnect(admin, row, { status: "accepted",
      available_at: new Date(now.getTime() + 5 * 60_000 * 2 ** row.attempt_count).toISOString() });
    console.error("[external-invite] introduction send failed, will retry", {
      requestId: row.id, message: error instanceof Error ? error.message.slice(0, 500) : "send failed" });
    return "retry";
  }
  const connectedAt = new Date().toISOString();
  const { data: connected, error } = await admin.from("external_intro_requests").update({
    status: "connected", connect_email_id: emailId, connected_at: connectedAt, error_code: null,
    lease_expires_at: null, updated_at: connectedAt,
  }).eq("id", row.id).eq("status", "connecting").select("id").maybeSingle();
  if (error) throw error;
  if (connected) {
    await notify({
      workspaceId: row.company_workspace_id, roleId: row.role_id, eventKey: `external_invite:${row.id}:connected`,
      purpose: "Tell the company, in its hiring conversation, that the external person it asked to meet confirmed the connection and Harper introduced them by email, so the conversation now continues directly in that email thread.",
      facts: externalConnectNoticeFacts({ requestId: row.id, roleName, connectedAt, companyRecipients: cc,
        person: { ...person, linkedinUrl: ctx.candidate?.linkedin_url ?? null } }),
    });
  }
  return "connected";
}

/** Due introductions: accepted ones, and ones whose sender stopped mid-way. Not held by the daytime window or the daily cap. */
async function dispatchExternalConnections(admin: Admin, now: Date, send: SendEmail, notify: Notify) {
  const { data: due, error } = await admin.from("external_intro_requests")
    .select("id,status,available_at,lease_expires_at,company_workspace_id")
    .in("status", ["accepted", "connecting"]).order("updated_at", { ascending: true }).limit(10);
  if (error) throw error;
  const outcomes: Record<string, number> = {};
  for (const item of due ?? []) {
    if (item.status !== "accepted" && item.status !== "connecting") continue;
    if (!externalSourcingEnabledFor(item.company_workspace_id)) continue;
    if (item.status === "accepted" && Date.parse(item.available_at) > now.getTime()) continue;
    if (item.status === "connecting" && item.lease_expires_at && Date.parse(item.lease_expires_at) > now.getTime()) continue;
    const outcome = await connectAccepted(admin, item.id, now, send, notify);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return outcomes;
}

/**
 * Step after an interested reply or a question from the invited address: one fixed reply in the same thread with the
 * connect link. Once per request, and only while the person can still connect. Connecting itself still
 * needs the person's confirmation on the page.
 */
export async function sendConnectLinkReply(args: { admin: Admin; requestId: string; headers?: Record<string, string>;
  now?: Date; send?: SendEmail }) {
  const { admin } = args;
  const now = args.now ?? new Date();
  const row = await readConnectRow(admin, args.requestId);
  if (!row) return "missing";
  const result = record(row.result);
  if (result.connectLinkReply) return "already_sent";
  const connectUrl = typeof result.connectUrl === "string" ? result.connectUrl : null;
  if (!connectUrl) return "no_link";
  const ctx = await loadContext(admin, row);
  if (connectState(row, ctx, now) !== "ready") return "not_connectable";
  const to = normalizeEmailAddress(row.recipient_email ?? "");
  if (!to) return "no_address";
  if (!externalInviteRecipientAllowed(to)) return "test_recipients_only";
  if (await isSuppressed(admin, to)) return "opted_out";
  const invitation = record(result.delivery);
  const subject = String(invitation.subject ?? "").trim();
  const body = renderExternalConnectLinkReply({
    language: inviteLanguage({ name: ctx.candidate?.name, location: ctx.candidate?.location }),
    personName: ctx.candidate?.name ?? null, companyName: ctx.anonymous ? null : ctx.companyName, connectUrl,
  });
  const sent = await (args.send ?? sendResendEmail)({
    from: EXTERNAL_INVITE_FROM, to, subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    text: renderEmailBodyText(body), html: wrapEmailHtml(renderEmailBodyHtml(body)),
    // Further replies keep reaching Harper through the invitation's reply address.
    ...(typeof invitation.replyTo === "string" ? { replyTo: invitation.replyTo } : {}),
    ...(args.headers ? { headers: args.headers } : {}),
    idempotencyKey: `external-connect-link-reply/${row.id}`,
  });
  const { error } = await admin.from("external_intro_requests").update({
    result: { ...result, connectLinkReply: { sentAt: now.toISOString(), emailId: String(sent.id ?? "") } },
    updated_at: now.toISOString(),
  }).eq("id", row.id);
  if (error) throw error;
  return "sent";
}


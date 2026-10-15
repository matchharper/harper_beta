import { createHash } from "crypto";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { normalizeEmailAddress } from "@/lib/email/parse";
import { getDefaultResendFromEmail } from "@/lib/email/send";
import { getReferralIntroAddresses } from "@/lib/email/inbound";
import { emailCopy } from "./copy";
import { renderReplyEmail } from "./format";
import { deliverEmail, replyHeaders, type EmailDelivery } from "./transport";
import { assertEmailLease, readRow, updateEmailJob } from "./store";
import {
  asObject,
  nowIso,
  type EmailAdmin,
  type EmailRow,
  type ReceivedEmail,
} from "./types";

export function emailAuditId(sourceId: string, direction: string) {
  const hash = createHash("sha256")
    .update(`email-runtime:${sourceId}:${direction}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
type SpecialContext = {
  admin: EmailAdmin;
  job: EmailRow;
  owner: string;
  inbound: EmailRow;
  received: ReceivedEmail;
  body: string;
  sender: string;
  recipients: string[];
  subject: string;
};

export async function processIntroCapture(ctx: SpecialContext) {
  const addresses = ctx.recipients
    .map(normalizeEmailAddress)
    .filter((v): v is string => Boolean(v));
  const { data: rows, error } = await (ctx.admin as any)
    .from("org_intro_email_threads")
    .select("*")
    .in("capture_address", addresses)
    .eq("status", "active")
    .limit(2);
  if (error) throw error;
  if (
    rows.length !== 1 ||
    !(rows[0].participant_emails ?? [])
      .map(normalizeEmailAddress)
      .includes(ctx.sender)
  ) {
    await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
      status: "skipped",
      skip_reason: "org_intro_capture_sender_not_participant",
      processed_at: nowIso(),
      locked_at: null,
      locked_by: null,
    });
    return;
  }
  const thread = rows[0];
  // The existing worker used job.id as the capture audit ID; retain it during
  // migration so replay never increments the thread count twice.
  const { error: captureError } = await (ctx.admin.rpc as any)(
    "record_email_intro_capture_v1",
    {
      p_job_id: ctx.job.id,
      p_owner: ctx.owner,
      p_thread_id: thread.id,
      p_row: {
        id: ctx.job.id,
        talent_id: thread.talent_id,
        inbound_event_id: ctx.inbound.id,
        reply_job_id: ctx.job.id,
        direction: "inbound",
        mail_type: "org_intro_reply",
        status: "received",
        from_email: ctx.sender,
        to_email: thread.capture_address,
        subject: ctx.subject,
        body_text: ctx.body,
        occurred_at: ctx.inbound.received_at,
        metadata: {
          source: "org_intro_capture",
          threadId: thread.id,
          companyWorkspaceId: thread.company_workspace_id,
          roleId: thread.role_id,
          recommendationId: thread.recommendation_id,
          attachments: ctx.received.attachments ?? [],
        },
      },
    }
  );
  if (captureError) throw captureError;
}

export async function processReferralIntro(ctx: SpecialContext) {
  const excluded = new Set([
    ctx.sender,
    normalizeEmailAddress(getDefaultResendFromEmail()),
    ...getReferralIntroAddresses(),
  ]);
  const replyDomain = process.env.EMAIL_REPLY_DOMAIN || "reply.matchharper.com";
  const candidates = [
    ...new Set(
      ctx.recipients
        .map(normalizeEmailAddress)
        .filter(
          (v): v is string =>
            Boolean(v) && !excluded.has(v) && !v!.endsWith(`@${replyDomain}`)
        )
    ),
  ];
  if (candidates.length !== 1) {
    await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
      status: "skipped",
      skip_reason: candidates.length
        ? "multiple_candidate_emails"
        : "missing_candidate_email",
      processed_at: nowIso(),
      locked_at: null,
      locked_by: null,
    });
    return;
  }
  const candidateEmail = candidates[0];
  if (process.env.EMAIL_REPLY_DRY_RUN === "true") {
    await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
      status: "skipped",
      skip_reason: "dry_run",
      processed_at: nowIso(),
      locked_at: null,
      locked_by: null,
    });
    return;
  }
  const metadata = asObject(ctx.job.metadata);
  const frozen = asObject(metadata.referralDeliveries);
  let deliveries: Array<{ key: string; delivery: EmailDelivery }> =
    Array.isArray(frozen.items) ? frozen.items : [];
  if (!deliveries.length) {
    const names = [String(ctx.received.from ?? ""), ...ctx.recipients];
    const displayName = (email: string) => {
      const raw = names.find((v) => normalizeEmailAddress(v) === email);
      return raw?.includes("<")
        ? raw.slice(0, raw.indexOf("<")).trim().replace(/^"|"$/g, "") || email
        : email;
    };
    const values = {
      baseUrl: getConfiguredPublicSiteUrl(),
      introExcerpt:
        ctx.body.length > 900
          ? `${ctx.body.slice(0, 900).trimEnd()}...`
          : ctx.body,
      candidateName: displayName(candidateEmail),
      candidateEmail,
      referrerName: displayName(ctx.sender),
      referrerEmail: ctx.sender,
    };
    const candidateBody = emailCopy("runtime.referral_candidate", "ko", values);
    const ackBody = emailCopy("runtime.referral_ack", "ko", values);
    deliveries = [
      {
        key: "candidate",
        delivery: {
          to: candidateEmail,
          subject: "Harper에 소개받으셨습니다",
          ...renderReplyEmail(candidateBody),
          headers: replyHeaders(ctx.received, ctx.inbound.message_id),
          idempotencyKey: `referral-intro/${ctx.job.id}/candidate`,
        },
      },
      {
        key: "referrer",
        delivery: {
          to: ctx.sender,
          subject: "Harper 소개를 받았습니다",
          ...renderReplyEmail(ackBody),
          headers: replyHeaders(ctx.received, ctx.inbound.message_id),
          idempotencyKey: `referral-intro/${ctx.job.id}/referrer`,
        },
      },
    ];
    await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
      metadata: {
        ...metadata,
        referralDeliveries: { items: deliveries },
        referralIntro: {
          ...asObject(metadata.referralIntro),
          candidateEmail,
          referrerEmail: ctx.sender,
        },
      },
    });
  }
  const saved = await readRow(ctx.admin, "email_reply_jobs", ctx.job.id);
  if (!saved) throw new Error("Referral delivery disappeared");
  await deliverSavedReferral(ctx.admin, saved, ctx.owner);
}

export async function deliverSavedReferral(
  admin: EmailAdmin,
  job: EmailRow,
  owner: string,
  send: typeof deliverEmail = deliverEmail
) {
  const metadata = asObject(job.metadata);
  const deliveries = asObject(metadata.referralDeliveries).items as Array<{
    key: string;
    delivery: EmailDelivery;
  }>;
  if (!Array.isArray(deliveries) || deliveries.length !== 2)
    throw new Error("Saved referral delivery is invalid");
  if (process.env.EMAIL_REPLY_DRY_RUN === "true")
    throw new Error("Referral delivery is disabled by dry_run");
  const ids = asObject(metadata.referralProviderIds);
  for (const item of deliveries) {
    if (ids[item.key]) continue;
    await assertEmailLease(admin, "reply", job.id, owner);
    ids[item.key] = await send(item.delivery);
    const current = await readRow(admin, "email_reply_jobs", job.id);
    await updateEmailJob(admin, "reply", job.id, owner, {
      metadata: { ...asObject(current?.metadata), referralProviderIds: ids },
    });
  }
  await updateEmailJob(admin, "reply", job.id, owner, {
    status: "sent",
    resend_email_id: ids.candidate,
    processed_at: nowIso(),
    skip_reason: null,
    locked_at: null,
    locked_by: null,
  });
}

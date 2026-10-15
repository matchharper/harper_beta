import { runCareerChatAssistant } from "@/lib/career/llm";
import { emailAssistantModel } from "./model";
import { buildCareerConversationPromptPlan } from "@/lib/career/prompts";
import {
  buildTalentProfileContext,
  buildTalentMemoryRetrievalQuery,
  fetchTalentUserProfile,
  fetchTalentStructuredProfile,
  fetchTalentContextPromptSnapshot,
  renderTalentContextPrompt,
  fetchRecentMessages,
} from "@/lib/talentOnboarding/server";
import { getCareerOnboardingChecklistCoverage } from "@/lib/talentOnboarding/calls";
import { getOnboardingQuestionChecklist } from "@/lib/talentOnboarding/insightChecklist";
import { completeOnboardingAndQueueInitialOpportunityRun } from "@/lib/opportunityDiscovery/store";
import { createReplyToken, hashReplyToken } from "@/lib/email/security";
import { getDefaultResendFromEmail } from "@/lib/email/send";
import { htmlToPlainText } from "@/lib/email/parse";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import {
  buildHarperEmailFooterHtml,
  HARPER_EMAIL_FOOTER_TEXT,
} from "@/lib/email/harperFooter";
import { generateCandidateContactDraft } from "@/lib/companyTalentRequests/copy";
import {
  assertEmailLease,
  emailLocale,
  ensureEmailConversation,
  ensureReplyAlias,
  readRow,
  updateRow,
  updateEmailJob,
} from "./store";
import { renderReplyEmail, wrapEmailHtml } from "./format";
import { adaptEmailPromptBlocks } from "./prompt";
import { emailCopy } from "./copy";
import { callEmailInternalApi } from "./internalApi";
import { deliverEmail, type EmailDelivery } from "./transport";
import {
  companyRequestWaitUntil,
  connectionNoticeWaitUntil,
  crmRecipientBlock,
  isInternalStageTag,
  meetingDeliveryBlock,
} from "./contactPolicy";
import { asObject, nowIso, type EmailAdmin, type EmailRow } from "./types";

type Context = {
  admin: EmailAdmin;
  job: EmailRow;
  owner: string;
  profile: EmailRow;
  setting: EmailRow | null;
  locale: string;
};
type ContactCopy = {
  body: string;
  emailBody?: string;
  subject: string;
  mailType: string;
  metadata?: EmailRow;
  html?: string;
  text?: string;
  replyAlias?: string;
  conversationId?: string;
  allowCompleted?: boolean;
};
const SIGNUP = "career_signup_no_profile_submit";
const PROFILE = "career_profile_submitted_no_answer";
async function cancel(ctx: Context, reason: string) {
  if (ctx.job.type === "meeting_schedule_candidate_invitation") {
    const id = String(asObject(ctx.job.payload).meetingScheduleRoundId ?? "");
    if (id)
      await (ctx.admin as any)
        .from("meeting_schedule_rounds")
        .update({ status: "delivery_failed", updated_at: nowIso() })
        .eq("id", id)
        .eq("delivery_queue_id", ctx.job.id)
        .eq("status", "queued");
  }
  await updateEmailJob(ctx.admin, "contact", ctx.job.id, ctx.owner, {
    status: "cancelled",
    cancelled_at: nowIso(),
    last_error: reason,
    locked_at: null,
    locked_by: null,
  });
}
async function reschedule(ctx: Context, reason: string, at: string) {
  await updateEmailJob(ctx.admin, "contact", ctx.job.id, ctx.owner, {
    status: "queued",
    scheduled_at: at,
    last_error: reason,
    locked_at: null,
    locked_by: null,
    queue_dispatched_at: null,
    attempts: Math.max(0, Number(ctx.job.attempts) - 1),
  });
}
function greeting(ctx: Context) {
  const name = String(ctx.profile.name ?? "").trim();
  return ctx.locale === "en"
    ? {
        greeting: name ? `Hi ${name}, this is Harper.` : "Hi, this is Harper.",
        member_label: "you",
      }
    : {
        greeting: name
          ? `안녕하세요, ${name}님. Harper입니다.`
          : "안녕하세요, Harper입니다.",
        member_label: name ? `${name}님` : "회원님",
      };
}
async function submitted(ctx: Context) {
  if (
    ctx.profile.resume_text ||
    ctx.profile.resume_file_name ||
    ctx.profile.resume_storage_path ||
    ctx.profile.resume_links?.length
  )
    return true;
  const { data, error } = await (ctx.admin as any)
    .from("talent_messages")
    .select("id")
    .eq("user_id", ctx.job.user_id)
    .eq("role", "user")
    .eq("message_type", "profile_submit")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
async function recentActivity(ctx: Context) {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const a = await (ctx.admin as any)
    .from("talent_messages")
    .select("id")
    .eq("user_id", ctx.job.user_id)
    .eq("role", "user")
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();
  const b = await (ctx.admin as any)
    .from("talent_calls")
    .select("id")
    .eq("user_id", ctx.job.user_id)
    .eq("status", "active")
    .gte("last_active_at", cutoff)
    .limit(1)
    .maybeSingle();
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return Boolean(a.data || b.data);
}
async function recommendationContext(ctx: Context) {
  const rec = await readRow(
    ctx.admin,
    "talent_opportunity_recommendation",
    String(ctx.job.recommendation_id ?? "")
  );
  if (
    !rec ||
    rec.talent_id !== ctx.job.user_id ||
    rec.role_id !== ctx.job.role_id
  )
    return null;
  const role = await readRow(
    ctx.admin,
    "company_roles",
    rec.role_id,
    "role_id"
  );
  const workspace = role
    ? await readRow(
        ctx.admin,
        "company_workspace",
        role.company_workspace_id,
        "company_workspace_id"
      )
    : null;
  return { rec, role, workspace };
}
async function connectionCopy(ctx: Context): Promise<ContactCopy | null> {
  const data = await recommendationContext(ctx);
  if (!data) {
    await cancel(ctx, "missing_connection_context");
    return null;
  }
  if (
    !["like", "positive"].includes(data.rec.feedback) &&
    data.rec.saved_stage !== "accepted"
  ) {
    await cancel(ctx, "recommendation_not_accepted");
    return null;
  }
  const { data: tags, error } = await (ctx.admin as any)
    .from("talent_opportunity_tag")
    .select("tag")
    .eq("talent_id", ctx.job.user_id)
    .eq("opportunity_id", ctx.job.role_id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (
    tags.find((r: EmailRow) => isInternalStageTag(r.tag))?.tag !==
    "내부:연결대기"
  ) {
    await cancel(ctx, "stage_not_pending_connection");
    return null;
  }
  const wait = connectionNoticeWaitUntil(ctx.job, data.rec);
  if (wait) {
    await reschedule(ctx, "outside_connection_delivery_window", wait);
    return null;
  }
  const company = String(
    data.workspace?.company_name ??
      (ctx.locale === "ko" ? "회사" : "the company")
  );
  const position = String(
    data.role?.name ?? (ctx.locale === "ko" ? "포지션" : "the role")
  );
  const url = new URL("/career/history", getConfiguredPublicSiteUrl());
  url.search = new URLSearchParams({
    historyTab: "new",
    id: ctx.job.role_id,
    source: "connection_confirmed_email",
  }).toString();
  const base = emailCopy(
    "contact_queue.connection_confirmed_body",
    ctx.locale,
    {
      name: ctx.profile.name || (ctx.locale === "ko" ? "회원" : "there"),
      company,
      position,
    }
  );
  return {
    subject: emailCopy(
      "contact_queue.connection_confirmed_subject",
      ctx.locale,
      { company }
    ),
    body: base.replace(
      `${company} · ${position}`,
      `[${company} · ${position}](${url})`
    ),
    mailType: "internal_connection_confirmed",
    allowCompleted: true,
    metadata: {
      companyName: company,
      roleName: position,
      roleId: ctx.job.role_id,
      recommendationId: ctx.job.recommendation_id,
      contactQueueAction: "internal_connection_confirmed",
    },
  };
}
async function roleChangedCopy(ctx: Context): Promise<ContactCopy | null> {
  const payload = asObject(ctx.job.payload),
    data = await recommendationContext(ctx);
  if (!data || data.rec.saved_stage !== "connected" || !payload.transferId) {
    await cancel(ctx, "candidate_role_move_superseded");
    return null;
  }
  const { data: progress, error } = await (ctx.admin as any)
    .from("talent_progress")
    .select("id")
    .eq("recommendation_id", ctx.job.recommendation_id)
    .eq("talent_id", ctx.job.user_id)
    .eq("role_id", ctx.job.role_id)
    .eq("kind", "org_candidate_role_move")
    .contains("metadata", { direction: "in", transferId: payload.transferId })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!progress) {
    await cancel(ctx, "candidate_role_move_superseded");
    return null;
  }
  if (
    !payload.companyName ||
    !payload.sourceRoleName ||
    !payload.targetRoleName
  ) {
    await cancel(ctx, "missing_candidate_role_move_snapshot");
    return null;
  }
  const url = new URL("/career/history", getConfiguredPublicSiteUrl());
  url.search = new URLSearchParams({
    historyTab: "new",
    id: ctx.job.role_id,
    source: "candidate_role_changed_email",
  }).toString();
  const cta = emailCopy(
    "contact_queue.candidate_role_changed_cta",
    ctx.locale,
    { target_role: payload.targetRoleName }
  );
  return {
    subject: emailCopy(
      "contact_queue.candidate_role_changed_subject",
      ctx.locale,
      { company: payload.companyName }
    ),
    body: emailCopy("contact_queue.candidate_role_changed_body", ctx.locale, {
      name: ctx.profile.name || (ctx.locale === "ko" ? "회원" : "there"),
      company: payload.companyName,
      source_role: payload.sourceRoleName,
      target_role: payload.targetRoleName,
      cta: `[${cta}](${url})`,
    }),
    mailType: "internal_candidate_role_changed",
    allowCompleted: true,
    metadata: {
      ...payload,
      roleId: ctx.job.role_id,
      recommendationId: ctx.job.recommendation_id,
    },
  };
}
async function profileFollowupCopy(ctx: Context): Promise<ContactCopy | null> {
  const hasProfile = await submitted(ctx);
  if (ctx.job.type === SIGNUP && hasProfile) {
    await cancel(ctx, "profile_submitted");
    return null;
  }
  if (ctx.job.type === PROFILE && !hasProfile) {
    await cancel(ctx, "profile_not_submitted");
    return null;
  }
  if (await recentActivity(ctx)) {
    await reschedule(
      ctx,
      "recent_activity",
      new Date(
        Date.now() + (1 + Math.floor(Math.random() * 3)) * 3_600_000
      ).toISOString()
    );
    return null;
  }
  if (ctx.job.type === SIGNUP)
    return {
      subject: emailCopy(
        "contact_queue.subjects.signup_no_profile",
        ctx.locale
      ),
      body: emailCopy("contact_queue.signup_body", ctx.locale, {
        ...greeting(ctx),
        onboarding_link: new URL(
          "/career/onboarding",
          getConfiguredPublicSiteUrl()
        ).href,
      }),
      mailType: "onboarding",
    };
  const conversationId = await ensureEmailConversation(
    ctx.admin,
    ctx.job.user_id,
    asObject(ctx.job.payload).conversationId
  );
  const coverage = await getCareerOnboardingChecklistCoverage({
    admin: ctx.admin,
    conversationId,
    userId: ctx.job.user_id,
  });
  const covered = Object.keys(coverage ?? {}).filter(
    (k) => coverage?.[k] === "covered"
  );
  // This seven-item completion belongs to the existing scheduled profile
  // follow-up contract, not to the ordinary conversation completion rule.
  if (covered.length >= 7) {
    const run = await completeOnboardingAndQueueInitialOpportunityRun({
      admin: ctx.admin,
      conversationId,
      completionReason: "question_checklist_covered",
      source: "contact_queue_auto_completion",
      userId: ctx.job.user_id,
    });
    const payload = {
      ...asObject(ctx.job.payload),
      autoCompletion: {
        conversationId,
        coveredChecklistKeys: covered,
        completion: {
          isOnboardingDone: true,
          opportunityDiscoveryRunId: run?.id ?? null,
        },
      },
    };
    await updateEmailJob(ctx.admin, "contact", ctx.job.id, ctx.owner, {
      payload,
    });
    ctx.job.payload = payload;
    return {
      subject: emailCopy(
        "contact_queue.subjects.profile_auto_completed_onboarding",
        ctx.locale
      ),
      body: emailCopy(
        "contact_queue.profile_auto_completed_body",
        ctx.locale,
        greeting(ctx)
      ),
      conversationId,
      mailType: "onboarding",
      allowCompleted: true,
      metadata: { autoCompletion: payload.autoCompletion },
    };
  }
  const missing = getOnboardingQuestionChecklist(ctx.profile).filter(
    (i) => coverage?.[i.key] !== "covered"
  );
  const profile = await fetchTalentUserProfile({
    admin: ctx.admin,
    userId: ctx.job.user_id,
  });
  const structured = await fetchTalentStructuredProfile({
    admin: ctx.admin,
    userId: ctx.job.user_id,
  });
  const recent = await fetchRecentMessages({
    admin: ctx.admin,
    conversationId,
    limit: 12,
  });
  const memory = await fetchTalentContextPromptSnapshot({
    admin: ctx.admin,
    userId: ctx.job.user_id,
    query: buildTalentMemoryRetrievalQuery([
      ...recent.map((m) => m.content),
      "Onboarding follow-up",
    ]),
  });
  const prompt = buildCareerConversationPromptPlan({
    channel: "chat",
    profile,
    structuredProfileText: buildTalentProfileContext({
      profile,
      structuredProfile: structured,
    }),
    talentContextSection: renderTalentContextPrompt(memory),
    isOnboardingDone: false,
    onboardingChecklistCoverage: coverage,
    currentPreferences: { preferredLocale: ctx.locale },
    toolNames: [],
  });
  const text = await runCareerChatAssistant({
    ...emailAssistantModel(),
    systemBlocks: adaptEmailPromptBlocks(
      prompt.promptBlocks,
      { subject: "Onboarding follow-up", thread: "", attachments: [] },
      `Write the existing scheduled profile follow-up email. Explain that Harper has the submitted profile and offer continuing the 5-minute call/chat at ${new URL("/career/onboarding", getConfiguredPublicSiteUrl())}. Ask only these remaining questions when useful: ${JSON.stringify(missing.map((i) => i.promptHint))}. Do not invent profile details or changes, declare onboarding complete, or promise a staff review.`
    ),
    messages: [
      {
        role: "user",
        content:
          "Write the follow-up email now using the saved profile and remaining interview questions.",
      },
    ],
    tools: [],
    executeTool: async () => {
      throw new Error("Unexpected follow-up tool");
    },
    isOnboardingActive: true,
    responseLocale: ctx.locale,
    usageLabel: "email-profile-followup",
  });
  return {
    subject: emailCopy(
      missing.length >= 1 && missing.length <= 4
        ? "contact_queue.subjects.profile_partial_onboarding"
        : "contact_queue.subjects.profile_submitted_no_answer",
      ctx.locale
    ),
    body: text,
    conversationId,
    mailType: "onboarding",
  };
}
async function meetingCopy(ctx: Context): Promise<ContactCopy | null> {
  const payload = asObject(ctx.job.payload),
    round = await readRow(
      ctx.admin,
      "meeting_schedule_rounds",
      String(payload.meetingScheduleRoundId ?? "")
    );
  const schedule = round
    ? await readRow(ctx.admin, "meeting_schedules", round.schedule_id)
    : null;
  const reason = meetingDeliveryBlock(ctx.job, round, schedule, ctx.profile);
  if (reason) {
    await cancel(ctx, reason);
    return null;
  }
  if (!payload.subject || !payload.body)
    throw new Error("meeting_invitation_copy_missing");
  return {
    subject: payload.subject,
    body: payload.body,
    mailType: "meeting_schedule_candidate_invitation",
    allowCompleted: true,
    metadata: {
      meetingScheduleRoundId: round!.id,
      meetingScheduleId: schedule!.id,
    },
  };
}
async function crmCopy(ctx: Context): Promise<ContactCopy | null> {
  const p = asObject(ctx.job.payload),
    broadcast = await readRow(
      ctx.admin,
      "crm_email_broadcasts",
      String(p.crmBroadcastId ?? "")
    );
  if (broadcast?.status === "paused") {
    await reschedule(
      ctx,
      "broadcast_paused",
      new Date(Date.now() + 3_600_000).toISOString()
    );
    return null;
  }
  if (broadcast?.status !== "queued") {
    await cancel(ctx, "broadcast_not_sendable");
    return null;
  }
  const block = crmRecipientBlock(
    broadcast,
    ctx.profile,
    ctx.setting,
    String(p.to ?? "")
  );
  if (block) {
    await cancel(ctx, block);
    return null;
  }
  if (!p.subject || !p.htmlBody) throw new Error("crm_broadcast_copy_missing");
  const plain = htmlToPlainText(p.htmlBody);
  return {
    subject: p.subject,
    body: plain,
    html: wrapEmailHtml(p.htmlBody + buildHarperEmailFooterHtml()),
    text: `${plain}\n\n${HARPER_EMAIL_FOOTER_TEXT}`,
    mailType: "crm_broadcast",
    allowCompleted: true,
    metadata: {
      crmBroadcastId: p.crmBroadcastId,
      crmBroadcastDeliveryId: ctx.job.id,
    },
  };
}
async function candidateRequestCopy(ctx: Context): Promise<ContactCopy | null> {
  const request = await readRow(
    ctx.admin,
    "company_talent_requests",
    String(ctx.job.company_talent_request_id ?? "")
  );
  if (!request || request.talent_id !== ctx.job.user_id) {
    await cancel(ctx, "company_talent_request_not_found");
    return null;
  }
  if (request.workflow_status !== "queued") {
    await cancel(ctx, "company_talent_request_not_sendable");
    return null;
  }
  if (
    request.expires_at !== "infinity" &&
    Date.parse(request.expires_at) <= Date.now()
  ) {
    await updateRow(ctx.admin, "company_talent_requests", request.id, {
      workflow_status: "closed",
    });
    await cancel(ctx, "company_talent_request_expired");
    return null;
  }
  const wait = companyRequestWaitUntil(ctx.job, request);
  if (wait) {
    await reschedule(ctx, "company_request_delivery_window", wait);
    return null;
  }
  if (!request.in_reply_to_company_talent_relay_id) {
    const { data: active, error } = await (ctx.admin.rpc as any)(
      "company_talent_request_target_is_active_v1",
      { p_request_id: request.id }
    );
    if (error) throw error;
    if (active !== true) {
      await updateRow(ctx.admin, "company_talent_requests", request.id, {
        workflow_status: "closed",
      });
      await cancel(ctx, "stage_changed_before_send");
      return null;
    }
  }
  const payload = asObject(ctx.job.payload),
    frozen = asObject(payload.delivery);
  const conversationId = await ensureEmailConversation(
    ctx.admin,
    ctx.job.user_id,
    frozen.conversationId
  );
  let replyAlias = String(frozen.replyTo ?? "");
  if (!replyAlias) {
    const token = createReplyToken();
    replyAlias = `reply+${token}@${process.env.EMAIL_REPLY_DOMAIN || "reply.matchharper.com"}`;
    const { error } = await (ctx.admin as any)
      .from("email_reply_aliases")
      .insert({
        talent_id: ctx.job.user_id,
        conversation_id: conversationId,
        company_talent_request_id: request.id,
        token_hash: hashReplyToken(token),
        expires_at: null,
      });
    if (error) throw error;
    ctx.job.payload = {
      ...payload,
      delivery: { ...frozen, replyTo: replyAlias, conversationId },
    };
    await updateEmailJob(ctx.admin, "contact", ctx.job.id, ctx.owner, {
      payload: ctx.job.payload,
    });
  }
  let body = String(frozen.chatText ?? request.delivery_body ?? "").trim(),
    subject = String(frozen.subject ?? request.delivery_subject ?? "").trim();
  if (!body || !subject) {
    const role = await readRow(
        ctx.admin,
        "company_roles",
        request.role_id,
        "role_id"
      ),
      company = await readRow(
        ctx.admin,
        "company_workspace",
        request.company_workspace_id,
        "company_workspace_id"
      );
    const draft = await generateCandidateContactDraft({
      candidateName: String(ctx.profile.name ?? ""),
      companyName: String(company?.company_name ?? ""),
      roleName: String(role?.name ?? ""),
      requestContext: request.request_context,
      currentInstruction: request.request_context,
      requestId: request.id,
      profileUrl: request.expects_document
        ? new URL(
            "/career/profile?profileSection=links",
            getConfiguredPublicSiteUrl()
          ).href
        : null,
      recentConversation: "",
      locale: ctx.locale,
      deliveryIntent: "direct_reply",
    });
    body = draft.body;
    subject = draft.subject;
  }
  const footerIndex = body.indexOf(
    "If you have any issues, feedback or want to talk to a human email"
  );
  if (footerIndex >= 0) body = body.slice(0, footerIndex).trimEnd();
  const cta = emailCopy("company_talent_request.email_career_cta", ctx.locale);
  return {
    subject,
    body,
    emailBody: `${body}\n\n[${cta}](${new URL("/career", getConfiguredPublicSiteUrl())})`,
    mailType: "company_talent_request",
    conversationId,
    replyAlias,
    allowCompleted: true,
    metadata: {
      companyTalentRequestId: request.id,
      templateVersion: "company-talent-request-v3",
      draftRevision: frozen.draftRevision ?? request.draft_revision,
    },
  };
}

const HANDLERS: Record<string, (ctx: Context) => Promise<ContactCopy | null>> =
  {
    [SIGNUP]: profileFollowupCopy,
    [PROFILE]: profileFollowupCopy,
    internal_connection_confirmed: connectionCopy,
    internal_candidate_role_changed: roleChangedCopy,
    meeting_schedule_candidate_invitation: meetingCopy,
    crm_broadcast: crmCopy,
    company_request_candidate_delivery: candidateRequestCopy,
  };

export async function processEmailContact(
  admin: EmailAdmin,
  job: EmailRow,
  owner: string,
  send: typeof deliverEmail = deliverEmail
) {
  const savedPayload = asObject(job.payload);
  if (job.resend_email_id && asObject(savedPayload.runtimeDelivery).to) {
    await assertEmailLease(admin, "contact", job.id, owner);
    const { error } = await (admin.rpc as any)(
      "finalize_email_contact_delivery_v1",
      {
        p_job_id: job.id,
        p_owner: owner,
        p_provider_id: job.resend_email_id,
        p_delivery: savedPayload.runtimeDelivery,
        p_copy: savedPayload.runtimeCopy,
      }
    );
    if (error) throw error;
    return;
  }
  const profile = await readRow(admin, "talent_users", job.user_id, "user_id"),
    setting = await readRow(admin, "talent_setting", job.user_id, "user_id");
  const ctx: Context = {
    admin,
    job,
    owner,
    profile: profile ?? {},
    setting,
    locale:
      job.type === "meeting_schedule_candidate_invitation"
        ? asObject(job.payload).locale === "ko"
          ? "ko"
          : "en"
        : emailLocale(setting),
  };
  if (!profile || profile.deleted_at) {
    await cancel(ctx, "talent_account_deleted");
    return;
  }
  if (
    [
      "company_request_company_delivery",
      "company_contact_company_delivery",
    ].includes(job.type)
  ) {
    await assertEmailLease(admin, "contact", job.id, owner);
    if (process.env.EMAIL_REPLY_DRY_RUN === "true") {
      await reschedule(
        ctx,
        "dry_run",
        new Date(Date.now() + 3_600_000).toISOString()
      );
      return;
    }
    await callEmailInternalApi(
      "/api/internal/company-talent-requests/deliver",
      job.company_talent_relay_id
        ? { relayId: job.company_talent_relay_id }
        : { requestId: job.company_talent_request_id }
    );
    const current = await readRow(admin, "contact_queue", job.id);
    if (current?.status === "processing")
      await updateEmailJob(admin, "contact", job.id, owner, {
        status: "sent",
        sent_at: nowIso(),
        locked_at: null,
        locked_by: null,
        last_error: null,
      });
    return;
  }
  const payload = asObject(job.payload),
    frozen = asObject(payload.runtimeDelivery);
  let delivery = frozen as EmailDelivery,
    copy = asObject(payload.runtimeCopy) as ContactCopy;
  if (!delivery.to) {
    if (
      (job.type === SIGNUP || job.type === PROFILE) &&
      setting?.is_onboarding_done &&
      !payload.autoCompletion
    ) {
      await cancel(ctx, "onboarding_done");
      return;
    }
    const handler = HANDLERS[job.type];
    if (!handler) {
      await cancel(ctx, `unsupported_type:${job.type}`);
      return;
    }
    const generated = await handler(ctx);
    if (!generated) return;
    copy = generated;
    if (!profile.email) {
      await cancel(ctx, "missing_email");
      return;
    }
    const conversationId =
      copy.conversationId ??
      (await ensureEmailConversation(admin, job.user_id));
    const alias = await ensureReplyAlias(
      admin,
      job.user_id,
      conversationId,
      copy.replyAlias
    );
    delivery = {
      from: getDefaultResendFromEmail(),
      to: profile.email,
      subject: copy.subject,
      ...(copy.html
        ? { html: copy.html, text: copy.text ?? htmlToPlainText(copy.html) }
        : renderReplyEmail(copy.emailBody ?? copy.body, { footer: true })),
      replyTo: alias,
      idempotencyKey:
        job.type === "crm_broadcast"
          ? `crm-broadcast/${job.id}`
          : job.type === "company_request_candidate_delivery"
            ? String(
                asObject(asObject(ctx.job.payload).delivery).idempotencyKey ||
                  `company-talent-request/${job.company_talent_request_id}`
              )
            : `contact-queue/${job.id}`,
    };
    ctx.job.payload = {
      ...asObject(ctx.job.payload),
      runtimeDelivery: delivery,
      runtimeCopy: { ...copy, conversationId },
    };
    await updateEmailJob(admin, "contact", job.id, owner, {
      payload: ctx.job.payload,
    });
    copy = { ...copy, conversationId };
  }
  await assertEmailLease(admin, "contact", job.id, owner);
  // Re-read mutable authorization immediately before sending a frozen body.
  const currentProfile = await readRow(
    admin,
    "talent_users",
    job.user_id,
    "user_id"
  );
  if (
    !currentProfile ||
    currentProfile.deleted_at ||
    currentProfile.email?.trim().toLowerCase() !== delivery.to.toLowerCase()
  ) {
    await cancel(ctx, "candidate_email_changed");
    return;
  }
  if (
    job.type === "meeting_schedule_candidate_invitation" &&
    !(await meetingCopy(ctx))
  )
    return;
  if (
    job.type === "crm_broadcast" &&
    !(await crmCopy({
      ...ctx,
      profile: currentProfile,
      setting: await readRow(admin, "talent_setting", job.user_id, "user_id"),
    }))
  )
    return;
  if (
    job.type === "company_request_candidate_delivery" &&
    !(await candidateRequestCopy({ ...ctx, profile: currentProfile }))
  )
    return;
  if (
    job.type === "internal_connection_confirmed" &&
    !(await connectionCopy(ctx))
  )
    return;
  if (
    job.type === "internal_candidate_role_changed" &&
    !(await roleChangedCopy(ctx))
  )
    return;
  if (
    !copy.allowCompleted &&
    (await readRow(admin, "talent_setting", job.user_id, "user_id"))
      ?.is_onboarding_done
  ) {
    await cancel(ctx, "onboarding_done_before_send");
    return;
  }
  if (process.env.EMAIL_REPLY_DRY_RUN === "true") {
    await reschedule(
      ctx,
      "dry_run",
      new Date(Date.now() + 3_600_000).toISOString()
    );
    return;
  }
  const providerId = job.resend_email_id || (await send(delivery));
  // Provider acceptance is irreversible. Save it before conversation history so
  // even a later database error never causes another provider send.
  await updateRow(admin, "contact_queue", job.id, {
    resend_email_id: providerId,
    updated_at: nowIso(),
  });
  const { error } = await (admin.rpc as any)(
    "finalize_email_contact_delivery_v1",
    {
      p_job_id: job.id,
      p_owner: owner,
      p_provider_id: providerId,
      p_delivery: delivery,
      p_copy: copy,
    }
  );
  if (error) throw error;
}

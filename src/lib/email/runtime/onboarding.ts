import { runCareerChatAssistant } from "@/lib/career/llm";
import { emailAssistantModel } from "./model";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { buildCareerEmailOnboardingToken } from "@/lib/careerEmailOnboarding/token";
import { getDefaultResendFromEmail } from "@/lib/email/send";
import { emailCopy } from "./copy";
import firstPrompts from "./onboardingPrompts.json";
import signupPrompt from "./signupPrompt.json";
import { hashCareerEmailForLogs } from "@/lib/careerEmailOnboarding/server";
import { callEmailInternalApi } from "./internalApi";
import { renderReplyEmail } from "./format";
import { deliverEmail, type EmailDelivery } from "./transport";
import {
  assertEmailLease,
  emailLocale,
  ensureEmailConversation,
  readRow,
  updateEmailJob,
  updateRow,
} from "./store";
import {
  asObject,
  EmailBusyError,
  nowIso,
  type EmailAdmin,
  type EmailJobContext,
  type EmailRow,
} from "./types";

async function structuredEmailExtraction(
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  label: string,
  materialTool?: Pick<
    Parameters<typeof runCareerChatAssistant>[0],
    "tools" | "executeTool"
  >
) {
  const body = await runCareerChatAssistant({
    ...emailAssistantModel(),
    systemBlocks: [{ key: "email_onboarding_extraction", text: system }],
    messages,
    tools: materialTool?.tools ?? [],
    executeTool:
      materialTool?.executeTool ??
      (async () => {
        throw new Error("Unexpected extraction tool");
      }),
    isOnboardingActive: true,
    usageLabel: label,
    temperature: 0,
  });
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("Email onboarding returned invalid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Email onboarding requires a JSON object");
  return value as EmailRow;
}
function safeLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => {
          try {
            return ["http:", "https:"].includes(new URL(v).protocol);
          } catch {
            return false;
          }
        })
    ),
  ].slice(0, 20);
}
function engagementTypes(value: unknown) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((v): v is string =>
            ["full_time", "fractional", "advisor"].includes(String(v))
          )
        ),
      ]
    : [];
}
function materialAttachments(ctx: EmailJobContext) {
  return ctx.attachments.filter(
    (a) =>
      [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
      ].includes(a.contentType) || /\.(pdf|docx?|txt|md)$/i.test(a.filename)
  );
}

export function profileIngestionSucceeded(result: EmailRow) {
  if (result.ok !== true) return false;
  const stats = asObject(result.stats);
  return (
    Boolean(String(result.linkedinUrl ?? "").trim()) ||
    [
      "experiencesSaved",
      "educationsSaved",
      "extrasSaved",
      "experiencesFromLinkedin",
      "educationsFromLinkedin",
      "extrasFromLinkedin",
      "experiencesFromLlm",
      "educationsFromLlm",
      "extrasFromLlm",
    ].some((key) => Number(stats[key]) > 0)
  );
}
async function recordLeadEvent(
  ctx: EmailJobContext,
  lead: EmailRow,
  eventType: string,
  metadata: EmailRow
) {
  const { error } = await (ctx.admin as any)
    .from("career_email_onboarding_events")
    .insert({
      lead_id: lead.id,
      local_id: lead.local_id,
      normalized_email_hash: hashCareerEmailForLogs(
        lead.normalized_email ?? lead.email
      ),
      event_type: eventType,
      metadata,
    });
  if (error) throw error;
}

export async function processEmailFirstOnboarding(
  ctx: EmailJobContext,
  lead: EmailRow
): Promise<{ body: string | null; deferred?: boolean } | null> {
  if (
    !["awaiting_start", "awaiting_profile", "profile_review_pending"].includes(
      lead.step
    )
  )
    return null;
  const setting = await readRow(
    ctx.admin,
    "talent_setting",
    ctx.talentId,
    "user_id"
  );
  const locale = emailLocale(setting);
  const metadata = asObject(lead.metadata);
  const previous = asObject(metadata.emailFirstProfile);
  const { data: history, error } = await (ctx.admin as any)
    .from("talent_messages")
    .select("role,message_type,content")
    .eq("user_id", ctx.talentId)
    .eq("conversation_id", ctx.conversationId)
    .in("message_type", ["mail", "email_onboarding"])
    .order("id", { ascending: false })
    .limit(8);
  if (error) throw error;
  const prompts = firstPrompts[locale];
  const system =
    prompts
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n") +
    "\nReturn only the stated JSON. Also return pause=true only if the latest user explicitly asks to stop this onboarding, and hasResumeText=true only if the latest body itself contains their resume/CV. These are commands/material indicators for this existing onboarding flow. No keyword classifier runs after you.";
  const parsed = await structuredEmailExtraction(
    system,
    [
      ...prompts
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      {
        role: "user",
        content: JSON.stringify({
          attachmentMetadata: ctx.attachments.map((a) => ({
            contentType: a.contentType,
            fileName: a.filename,
          })),
          hasResumeAttachment: materialAttachments(ctx).length > 0,
          existingParsedProfile: {
            links: previous.profileLinks ?? [],
            location: previous.currentLocation,
            name: previous.name,
            engagementType: previous.engagementTypes ?? [],
            hasResumeOrLinkedIn: previous.hasResumeOrLinkedIn === true,
          },
          locale,
          recentOnboardingMessages: [...history].reverse(),
          userReply: ctx.body.slice(0, 12_000),
        }),
      },
    ],
    "email-first-onboarding:extract"
  );
  if (parsed.pause === true) {
    await updateRow(ctx.admin, "career_email_onboarding_leads", lead.id, {
      step: "paused",
      status: "paused",
      paused_at: nowIso(),
      updated_at: nowIso(),
    });
    await recordLeadEvent(ctx, lead, "paused", {});
    return { body: emailCopy("runtime.paused", locale) };
  }
  const links = [
    ...new Set([
      ...safeLinks(previous.profileLinks),
      ...safeLinks(parsed.links),
    ]),
  ].slice(0, 20);
  const name =
    typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim().slice(0, 240)
      : previous.name;
  const location =
    typeof parsed.location === "string" && parsed.location.trim()
      ? parsed.location.trim().slice(0, 240)
      : previous.currentLocation;
  const kinds = engagementTypes(parsed.engagementType ?? parsed.engagementTypes)
    .length
    ? engagementTypes(parsed.engagementType ?? parsed.engagementTypes)
    : engagementTypes(previous.engagementTypes);
  const hasMaterial =
    links.length > 0 ||
    materialAttachments(ctx).length > 0 ||
    parsed.hasResumeText === true ||
    previous.hasResumeOrLinkedIn === true ||
    Boolean(lead.resume_text);
  const missingFields = [
    ...(!name ? ["name"] : []),
    ...(!location ? ["currentLocation"] : []),
    ...(!kinds.length ? ["engagementTypes"] : []),
    ...(!hasMaterial ? ["profileMaterial"] : []),
  ];
  const saved = {
    ...previous,
    name,
    currentLocation: location,
    engagementTypes: kinds,
    profileLinks: links,
    hasResumeOrLinkedIn: hasMaterial,
    missingFields,
    locale,
    lastParsedAt: nowIso(),
  };
  const profile = await readRow(
    ctx.admin,
    "talent_users",
    ctx.talentId,
    "user_id"
  );
  await updateRow(
    ctx.admin,
    "talent_users",
    ctx.talentId,
    {
      ...(name ? { name } : {}),
      ...(location
        ? {
            current_location: location,
            ...(!profile?.location ? { location } : {}),
          }
        : {}),
      ...(links.length
        ? {
            resume_links: [
              ...new Set([...(profile?.resume_links ?? []), ...links]),
            ],
          }
        : {}),
      updated_at: nowIso(),
    },
    "user_id"
  );
  if (kinds.length) {
    const { error: settingError } = await (ctx.admin as any)
      .from("talent_setting")
      .upsert(
        { user_id: ctx.talentId, engagement_types: kinds },
        { onConflict: "user_id" }
      );
    if (settingError) throw settingError;
  }
  const nextMetadata: EmailRow = {
    ...metadata,
    emailFirstProfile: saved,
    emailFirstReplyDraft: String(parsed.reply ?? ""),
    ...(ctx.attachments.length
      ? {
          emailAttachments: ctx.attachments.map((a) => ({
            ...a,
            fileName: a.filename,
          })),
        }
      : {}),
  };
  const newMaterial =
    ctx.attachments.length > 0 ||
    parsed.hasResumeText === true ||
    JSON.stringify(links) !== JSON.stringify(safeLinks(previous.profileLinks));
  const freshReview =
    !missingFields.length &&
    (lead.step !== "profile_review_pending" || newMaterial);
  if (freshReview)
    for (const key of [
      "reviewDelivery",
      "reviewBody",
      "reviewProviderId",
      "reviewMessageId",
      "profileIngested",
    ])
      delete nextMetadata[key];
  await updateRow(ctx.admin, "career_email_onboarding_leads", lead.id, {
    display_name: name ?? lead.display_name,
    profile_links: links,
    ...(parsed.hasResumeText === true
      ? { resume_text: ctx.body.slice(0, 20_000) }
      : {}),
    metadata: nextMetadata,
    first_inbound_at: lead.first_inbound_at ?? nowIso(),
    ...(hasMaterial
      ? { profile_received_at: lead.profile_received_at ?? nowIso() }
      : {}),
    ...(freshReview
      ? {
          review_attempts: 0,
          review_locked_at: null,
          review_locked_by: null,
          queue_dispatched_at: null,
        }
      : {}),
    step: missingFields.length ? "awaiting_profile" : "profile_review_pending",
    status: "active",
    worker_target: "vercel_queue",
    updated_at: nowIso(),
  });
  if (missingFields.length) {
    if (typeof parsed.reply !== "string" || !parsed.reply.trim())
      throw new Error("Email onboarding did not explain its missing fields");
    await recordLeadEvent(ctx, lead, "email_first_profile_missing", {
      locale,
      missingFields,
    });
    return { body: parsed.reply.trim() };
  }
  if (lead.step === "profile_review_pending")
    return {
      body: emailCopy(
        newMaterial
          ? "email_onboarding.additional_material_received"
          : "runtime.review_pending",
        locale,
        { suffix: "" }
      ),
    };
  await recordLeadEvent(ctx, lead, "email_profile_complete", {
    locale,
    profile: saved,
  });
  return { body: null, deferred: true };
}

export function onboardingContinueUrl(lead: EmailRow) {
  const metadata = asObject(lead.metadata);
  if (typeof metadata.continueUrl === "string" && metadata.continueUrl.trim()) {
    const url = new URL(metadata.continueUrl);
    url.searchParams.delete("mail");
    return url.href;
  }
  const url = new URL(
    String(metadata.loginUrl || "/career_login"),
    getConfiguredPublicSiteUrl()
  );
  const token =
    url.searchParams.get("email_onboarding") ||
    buildCareerEmailOnboardingToken({
      email: lead.normalized_email ?? lead.email,
      leadId: lead.id,
    });
  const next = new URLSearchParams({
    email_onboarding: token,
    source: "email_onboarding_review",
  });
  url.searchParams.delete("mail");
  url.searchParams.set("next", `/career/email-onboarding?${next}`);
  url.searchParams.set("source", "email_onboarding_review");
  return url.href;
}

export async function processOnboardingReview(
  admin: EmailAdmin,
  lead: EmailRow,
  owner: string
) {
  await assertEmailLease(admin, "onboarding_review", lead.id, owner);
  if (asObject(lead.metadata).reviewProviderId) {
    const { error } = await (admin.rpc as any)(
      "finalize_email_onboarding_review_v1",
      {
        p_lead_id: lead.id,
        p_owner: owner,
        p_provider_id: asObject(lead.metadata).reviewProviderId,
      }
    );
    if (error) throw error;
    return;
  }
  const profile = await readRow(
    admin,
    "talent_users",
    lead.talent_id,
    "user_id"
  );
  if (!profile || profile.deleted_at) {
    await updateEmailJob(admin, "onboarding_review", lead.id, owner, {
      status: "failed",
      last_error: "talent_account_deleted",
      review_locked_at: null,
      review_locked_by: null,
    });
    return;
  }
  const setting = await readRow(
    admin,
    "talent_setting",
    lead.talent_id,
    "user_id"
  );
  const locale = emailLocale(setting);
  let metadata = asObject(lead.metadata);
  let delivery = asObject(metadata.reviewDelivery) as EmailDelivery;
  if (!delivery.to) {
    const result = await callEmailInternalApi(
      "/api/internal/career/email-onboarding/ingest-profile",
      {
        userId: lead.talent_id,
        leadId: lead.id,
        links: lead.profile_links ?? [],
        resumeText: lead.resume_text ?? "",
        attachments: metadata.emailAttachments ?? [],
      }
    );
    const ok = profileIngestionSucceeded(result);
    const nameLabel = profile.name
      ? locale === "ko"
        ? `${profile.name}님`
        : profile.name
      : locale === "ko"
        ? "회원님"
        : "there";
    const body = emailCopy(
      ok ? "runtime.email_first_complete" : "runtime.profile_ingestion_failed",
      locale,
      {
        nameLabel,
        continueUrl: `[${locale === "ko" ? "Harper에서 이어가기" : "Continue in Harper"}](${onboardingContinueUrl(lead)})`,
      }
    );
    const subject = emailCopy(
      ok
        ? "review_onboarding.email_first_subject"
        : "review_onboarding.profile_ingestion_failed_subject",
      locale,
      {
        name_prefix: profile.name
          ? locale === "ko"
            ? `${profile.name}님, `
            : `${profile.name}, `
          : "",
      }
    );
    delivery = {
      from: getDefaultResendFromEmail(),
      to: lead.normalized_email ?? lead.email,
      subject,
      ...renderReplyEmail(body),
      replyTo: lead.reply_alias,
      idempotencyKey: `career-email-onboarding/${ok ? "review" : "profile-ingestion-failed"}/${lead.id}`,
    };
    metadata = {
      ...metadata,
      reviewDelivery: delivery,
      reviewBody: body,
      profileIngested: ok,
      reviewEventEmailHash: hashCareerEmailForLogs(
        lead.normalized_email ?? lead.email
      ),
      reviewEventData: {
        continueUrl: onboardingContinueUrl(lead),
        ingestionOk: ok,
        locale,
        ingestion: result,
      },
    };
    await updateEmailJob(admin, "onboarding_review", lead.id, owner, {
      metadata,
    });
  }
  await assertEmailLease(admin, "onboarding_review", lead.id, owner);
  if (process.env.EMAIL_REPLY_DRY_RUN === "true")
    throw new EmailBusyError("Email review delivery is disabled by dry_run");
  const providerId =
    metadata.reviewProviderId || (await deliverEmail(delivery));
  await updateEmailJob(admin, "onboarding_review", lead.id, owner, {
    metadata: { ...metadata, reviewProviderId: providerId },
  });
  const { error: finalizeError } = await (admin.rpc as any)(
    "finalize_email_onboarding_review_v1",
    { p_lead_id: lead.id, p_owner: owner, p_provider_id: providerId }
  );
  if (finalizeError) throw finalizeError;
}

export async function signupFollowupContext(ctx: EmailJobContext) {
  const { data: sent, error } = await (ctx.admin as any)
    .from("career_email_messages")
    .select("id")
    .eq("talent_id", ctx.talentId)
    .eq("direction", "outbound")
    .eq("mail_type", "sign_up_followup")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const setting = await readRow(
    ctx.admin,
    "talent_setting",
    ctx.talentId,
    "user_id"
  );
  if (
    (!sent && ctx.job.kind !== "signup_followup_reply") ||
    setting?.is_onboarding_done
  )
    return "";
  return "This is a reply to the one-time signup follow-up. Use the shared profile/document tools to save explicitly supplied facts or attachments. Ask for a LinkedIn profile or resume/CV if still missing. Once materials are saved, link to https://matchharper.com/career/onboarding to answer only the remaining interview questions. Never claim a staff review or promise another automatic follow-up. Treat a document upload failure as receipt without completed processing.";
}

export async function processSignupFollowup(
  ctx: EmailJobContext
): Promise<string | null> {
  if (ctx.companyRequestId) return null;
  const setting = await readRow(
    ctx.admin,
    "talent_setting",
    ctx.talentId,
    "user_id"
  );
  if (setting?.is_onboarding_done) return null;
  const profile = await readRow(
    ctx.admin,
    "talent_users",
    ctx.talentId,
    "user_id"
  );
  const hasSavedMaterial = Boolean(
    profile?.resume_text ||
    profile?.resume_file_name ||
    profile?.resume_storage_path ||
    profile?.resume_links?.length
  );
  const { data: followup, error } = await (ctx.admin as any)
    .from("career_email_messages")
    .select("id")
    .eq("talent_id", ctx.talentId)
    .eq("direction", "outbound")
    .eq("mail_type", "sign_up_followup")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (
    ctx.job.kind !== "signup_followup_reply" &&
    (!followup || hasSavedMaterial)
  )
    return null;
  await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
    kind: "signup_followup_reply",
  });
  ctx.job.kind = "signup_followup_reply";
  const links = safeLinks(ctx.body.match(/https?:\/\/[^\s<>"']+/g) ?? []);
  let ingestion = asObject(asObject(ctx.job.metadata).signupIngestResult);
  if (
    !Object.keys(ingestion).length &&
    (links.length || ctx.attachments.length)
  ) {
    try {
      ingestion = await callEmailInternalApi(
        "/api/internal/career/email-onboarding/ingest-profile",
        {
          userId: ctx.talentId,
          inboundEventId: ctx.inbound.id,
          links,
          attachments: ctx.attachments.map((a) => ({
            ...a,
            fileName: a.filename,
          })),
          resumeText: "",
          source: "signup_followup_reply",
        }
      );
    } catch {
      ingestion = {
        ok: false,
        error: "Profile materials could not be processed",
      };
    }
    const current = await readRow(ctx.admin, "email_reply_jobs", ctx.job.id);
    await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
      metadata: {
        ...asObject(current?.metadata),
        signupIngestResult: ingestion,
      },
    });
  }
  const locale = emailLocale(setting);
  const parsed = await structuredEmailExtraction(
    `${signupPrompt}\nIf the latest email body itself contains resume/CV material that has not been processed, call ingest_email_profile with includeBodyAsResume=true before writing the final JSON. The tool saves the exact original body, without inventing or reconstructing resume text. Use its result to describe receipt and processing accurately. Ordinary questions or preference answers are not resume material.`,
    [
      {
        role: "user",
        content: JSON.stringify({
          requestedLocale: locale,
          latestInboundBody: ctx.body,
          latestLinks: links,
          attachments: ctx.attachments.map((a) => ({
            fileName: a.filename,
            contentType: a.contentType,
          })),
          profileIngestResult: {
            ok: ingestion.ok,
            skipped: ingestion.skipped,
            error: ingestion.error,
          },
          detectedRequiredProfileMaterial:
            hasSavedMaterial || ctx.attachments.length > 0,
          savedProfile: {
            email: profile?.email,
            name: profile?.name,
            location: profile?.location,
            current_location: profile?.current_location,
            headline: profile?.headline,
            resume_file_name: profile?.resume_file_name,
            resume_storage_path: profile?.resume_storage_path,
            resume_links: profile?.resume_links,
            has_resume_text: Boolean(profile?.resume_text),
          },
          savedSetting: {
            engagement_types: setting?.engagement_types,
            is_onboarding_done: setting?.is_onboarding_done,
            preferred_locale: setting?.preferred_locale,
            setting_locale: setting?.setting_locale,
          },
          earlierThreadContext: ctx.thread.slice(0, 4000),
        }),
      },
    ],
    "email-signup-followup",
    {
      tools: [
        {
          type: "function",
          function: {
            name: "ingest_email_profile",
            description:
              "Process the actual resume/CV text pasted in this onboarding email. Use only when the original body contains profile material.",
            parameters: {
              type: "object",
              properties: { includeBodyAsResume: { type: "boolean" } },
              required: ["includeBodyAsResume"],
              additionalProperties: false,
            },
          },
        },
      ],
      executeTool: async ({ name, input }) => {
        if (
          name !== "ingest_email_profile" ||
          input.includeBodyAsResume !== true
        )
          return { ok: false, error: "resume_body_required" };
        const current = await assertEmailLease(
          ctx.admin,
          "reply",
          ctx.job.id,
          ctx.owner
        );
        const saved = asObject(
          asObject(current.metadata).signupBodyIngestResult
        );
        if (Object.keys(saved).length) {
          ingestion = saved;
          return saved;
        }
        ingestion = await callEmailInternalApi(
          "/api/internal/career/email-onboarding/ingest-profile",
          {
            userId: ctx.talentId,
            inboundEventId: ctx.inbound.id,
            links,
            resumeText: ctx.body,
            attachments: [],
            source: "signup_followup_reply",
          }
        );
        await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
          metadata: {
            ...asObject(current.metadata),
            signupBodyIngestResult: ingestion,
          },
        });
        return {
          ok: ingestion.ok,
          skipped: ingestion.skipped,
          error: ingestion.error,
        };
      },
    }
  );
  const patch = asObject(parsed.profilePatch);
  if (
    typeof patch.name === "string" ||
    typeof patch.currentLocation === "string"
  )
    await updateRow(
      ctx.admin,
      "talent_users",
      ctx.talentId,
      {
        ...(typeof patch.name === "string" && patch.name.trim()
          ? { name: patch.name.trim().slice(0, 240) }
          : {}),
        ...(typeof patch.currentLocation === "string" &&
        patch.currentLocation.trim()
          ? {
              current_location: patch.currentLocation.trim().slice(0, 240),
              ...(!profile?.location
                ? { location: patch.currentLocation.trim().slice(0, 240) }
                : {}),
            }
          : {}),
        updated_at: nowIso(),
      },
      "user_id"
    );
  const kinds = engagementTypes(patch.engagementTypes);
  if (kinds.length) {
    const { error: saveError } = await (ctx.admin as any)
      .from("talent_setting")
      .upsert(
        { user_id: ctx.talentId, engagement_types: kinds },
        { onConflict: "user_id" }
      );
    if (saveError) throw saveError;
  }
  if (parsed.hasRequiredProfileMaterial === true && ingestion.ok === true)
    await callEmailInternalApi(
      "/api/internal/career/email-onboarding/seed-profile-submit",
      {
        userId: ctx.talentId,
        conversationId: ctx.conversationId,
        links,
        source: "signup_followup_reply",
      }
    );
  if (typeof parsed.replyBody !== "string" || !parsed.replyBody.trim())
    throw new Error("Signup follow-up returned an empty email");
  return parsed.replyBody.trim();
}

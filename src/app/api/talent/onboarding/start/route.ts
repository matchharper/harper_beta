import { after, NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRunRow } from "@/lib/opportunityDiscovery/types";
import { scheduleCareerConversationContinuation } from "@/lib/career/onboardingContinuation.server";
import {
  getSlackActivityDeviceLabel,
  notifySlackActivity,
} from "@/lib/slackActivity";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TalentConversationRow,
  TalentMessageRow,
  ensureTalentUserRecord,
  fetchTalentDocument,
  fetchTalentDocuments,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
  toTalentDisplayName,
  serializeTalentDocuments,
  updateTalentDocumentExtractedText,
} from "@/lib/talentOnboarding/server";
import { insertTalentProfileSourceErrorLog } from "@/lib/talentOnboarding/errorLogs";
import {
  buildProfileMaterialActivity,
  insertTalentActivityEvent,
} from "@/lib/talentOnboarding/activityEvents";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import { isMobileRequest } from "@/lib/requestDevice";
import {
  cancelSignupNoProfileSubmit,
  cancelCareerOnboardingContactQueue,
} from "@/lib/contactQueue";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  sanitizeMultilineDbText,
  sanitizeSingleLineDbText,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";

export const runtime = "nodejs";
export const maxDuration = 800;

type Body = {
  applyProfileSources?: boolean;
  conversationId?: string;
  locale?: string;
  name?: string;
  resumeFileName?: string;
  resumeDocumentId?: string;
  resumeStoragePath?: string;
  resumeText?: string;
  links?: string[];
  officialJobSlug?: string;
  officialJobTitle?: string;
};

type TalentProfileUpdatePayload = {
  resume_links: string[];
  updated_at: string;
  email?: string;
  name?: string;
  resume_text?: string;
  resume_file_name?: string;
  resume_storage_path?: string;
};

type ProfileIngestionSummary = {
  ok: boolean;
  queued?: boolean;
  status?: string;
  linkedinUrl?: string;
  stats?: Record<string, number>;
  warnings?: Array<{
    code: string;
    message: string;
    detail?: string | null;
  }>;
  error?: string;
};

type AtomicOnboardingResult = {
  inserted?: boolean;
  conversation?: TalentConversationRow | null;
  userMessage?: TalentMessageRow | null;
  run: OpportunityRunRow;
};

const ONBOARDING_SUBMITTED_EVENT_TYPE = "career_onboarding_submitted";
const PROFILE_INGESTION_RETRY_AFTER_MS = 800_000;

const isStaleProfileIngestion = (updatedAt?: string | null) => {
  const updatedAtMs = Date.parse(String(updatedAt ?? ""));
  return (
    !Number.isFinite(updatedAtMs) ||
    Date.now() - updatedAtMs >= PROFILE_INGESTION_RETRY_AFTER_MS
  );
};

const normalizeLink = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isLinkedinLink = (value: string) => {
  const normalized = normalizeLink(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
};

const getSubmittedLinkLabel = (
  value: string,
  preferredLocale?: string | null
) => {
  const normalized = normalizeLink(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();

    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      return careerT(
        preferredLocale,
        "career.onboarding.link.linkedin",
        "링크드인"
      );
    }
    if (host === "github.com" || host.endsWith(".github.com")) {
      return careerT(preferredLocale, "career.onboarding.link.github", "깃헙");
    }
    if (host === "huggingface.co" || host.endsWith(".huggingface.co")) {
      return "Hugging Face";
    }
    if (host.includes("scholar.google.")) {
      return "Scholar";
    }
    if (
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com")
    ) {
      return "X";
    }

    return careerT(
      preferredLocale,
      "career.onboarding.link.personal_website",
      "개인 웹사이트"
    );
  } catch {
    return careerT(preferredLocale, "career.onboarding.link.other", "기타");
  }
};

const buildProfileSubmitMessage = (args: {
  hasResume: boolean;
  links: string[];
  preferredLocale?: string | null;
}) => {
  const linkLabels = args.links.reduce<string[]>((acc, link) => {
    const label = getSubmittedLinkLabel(link, args.preferredLocale);
    if (label && !acc.includes(label)) {
      acc.push(label);
    }
    return acc;
  }, []);
  const linkPart =
    linkLabels.length === 1
      ? careerT(
          args.preferredLocale,
          "career.onboarding.submitted.link_part_one",
          "{labels} 링크",
          { values: { labels: linkLabels.join("/") } }
        )
      : linkLabels.length > 1
        ? careerT(
            args.preferredLocale,
            "career.onboarding.submitted.link_part_many",
            "{labels} 링크",
            { values: { labels: linkLabels.join("/") } }
          )
        : "";

  if (args.hasResume && linkPart) {
    return careerT(
      args.preferredLocale,
      "career.onboarding.submitted.resume_and_links",
      "이력서와 {linkPart}를 제출했습니다.",
      { values: { linkPart } }
    );
  }
  if (args.hasResume) {
    return careerT(
      args.preferredLocale,
      "career.onboarding.submitted.resume_only",
      "이력서를 제출했습니다."
    );
  }
  if (linkPart) {
    return careerT(
      args.preferredLocale,
      "career.onboarding.submitted.links_only",
      "{linkPart}를 제출했습니다.",
      { values: { linkPart } }
    );
  }
  return careerT(
    args.preferredLocale,
    "career.onboarding.submitted.without_materials",
    "자료 없이 Harper와 시작할게요."
  );
};

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversationId = sanitizeSingleLineDbText(
      req.nextUrl.searchParams.get("conversationId"),
      80
    );
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error } = await admin
      .from("talent_conversations")
      .select(
        "id, profile_ingestion_status, profile_ingestion_error, profile_ingestion_updated_at"
      )
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to read profile ingestion status" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      profileIngestion: {
        error: conversation.profile_ingestion_error ?? null,
        status:
          conversation.profile_ingestion_status === "processing" &&
          isStaleProfileIngestion(conversation.profile_ingestion_updated_at)
            ? "failed"
            : conversation.profile_ingestion_status?.trim() || null,
        updatedAt: conversation.profile_ingestion_updated_at ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to read profile ingestion status",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let pendingAdmission: {
    admin: ReturnType<typeof getTalentSupabaseAdmin>;
    userId: string;
    conversationId: string;
  } | null = null;
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const isMobile = isMobileRequest(req);
    const cookieLocale = req.cookies.get("NEXT_LOCALE")?.value;
    const conversationId = sanitizeSingleLineDbText(body.conversationId, 80);
    const submittedName = sanitizeSingleLineDbText(body.name, 240);
    const verifiedEmail = sanitizeSingleLineDbText(
      user.email,
      320
    )?.toLowerCase();
    const resumeFileName = sanitizeSingleLineDbText(body.resumeFileName, 240);
    const resumeStoragePath = sanitizeSingleLineDbText(
      body.resumeStoragePath,
      2000
    );
    let resumeText =
      sanitizeMultilineDbText(
        body.resumeText,
        typeof body.resumeText === "string" ? body.resumeText.length : 0
      ) ?? "";
    const resumeDocumentId = sanitizeSingleLineDbText(
      body.resumeDocumentId,
      100
    );
    const applyProfileSources = body.applyProfileSources !== false;
    const links = (body.links ?? [])
      .map((link) => sanitizeSingleLineDbText(link, 2000) ?? "")
      .filter(Boolean);
    const officialJobSlug = sanitizeSingleLineDbText(body.officialJobSlug, 240);
    const hasResume = Boolean(
      resumeFileName || resumeStoragePath || resumeText || resumeDocumentId
    );
    const hasLinkedin = links.some(isLinkedinLink);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    if (resumeStoragePath && !resumeStoragePath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Resume unavailable" },
        { status: 403 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        { error: conversationError.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // A transport retry after durable admission must not re-ingest or overwrite
    // materials. The admission's outbox owns recovery of its original-agent run.
    if (conversation.stage === "completed") {
      return NextResponse.json({
        ok: true,
        conversation: { id: conversation.id, stage: conversation.stage },
        profileIngestion: { ok: true, status: "completed" },
        assistantMessages: [],
      });
    }
    const processingResponse = () =>
      NextResponse.json(
        {
          ok: false,
          conversation: { id: conversation.id, stage: conversation.stage },
          profileIngestion: { status: "processing" },
        },
        { status: 202 }
      );
    if (
      conversation.profile_ingestion_status === "processing" &&
      !isStaleProfileIngestion(conversation.profile_ingestion_updated_at)
    ) {
      return processingResponse();
    }

    const previousProfile = await fetchTalentUserProfile({
      admin,
      userId: user.id,
    });
    if (resumeDocumentId) {
      const resumeDocument = await fetchTalentDocument({
        admin,
        documentId: resumeDocumentId,
        userId: user.id,
      });
      if (!resumeDocument || resumeDocument.kind !== "resume") {
        return NextResponse.json(
          { error: "Resume document not found" },
          { status: 404 }
        );
      }
      if (
        resumeStoragePath &&
        resumeDocument.storage_path !== resumeStoragePath
      ) {
        return NextResponse.json(
          { error: "Resume source changed" },
          { status: 409 }
        );
      }
      const storedText = resumeDocument.extracted_text?.trim();
      if (storedText) {
        resumeText = storedText;
      } else if (resumeText) {
        await updateTalentDocumentExtractedText({
          admin,
          documentId: resumeDocument.id,
          extractedText: resumeText,
          userId: user.id,
        });
      }
    }

    if (applyProfileSources && hasResume && !resumeText) {
      return NextResponse.json(
        {
          code: "resume_text_required",
          error: "Resume text could not be read",
        },
        { status: 422 }
      );
    }

    let claim = admin
      .from("talent_conversations")
      .update({
        profile_ingestion_status: "processing",
        profile_ingestion_error: null,
        profile_ingestion_updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .eq("stage", "profile");
    claim = conversation.profile_ingestion_updated_at
      ? claim.eq(
          "profile_ingestion_updated_at",
          conversation.profile_ingestion_updated_at
        )
      : claim.is("profile_ingestion_updated_at", null);
    const { data: claimed, error: claimError } = await claim
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return processingResponse();

    pendingAdmission = { admin, userId: user.id, conversationId };
    const now = new Date().toISOString();

    const profileUpdatePayload: TalentProfileUpdatePayload = {
      resume_links: Array.from(
        new Set([...(previousProfile?.resume_links ?? []), ...links])
      ),
      updated_at: now,
    };

    if (resumeText) {
      profileUpdatePayload.resume_text = resumeText;
    }
    if (resumeFileName) {
      profileUpdatePayload.resume_file_name = resumeFileName;
    }
    if (resumeStoragePath) {
      profileUpdatePayload.resume_storage_path = resumeStoragePath;
    }
    if (submittedName) {
      profileUpdatePayload.name = submittedName.slice(0, 240);
    }
    if (verifiedEmail) {
      profileUpdatePayload.email = verifiedEmail.slice(0, 320);
    }

    const { error: profileUpdateError } = await admin
      .from("talent_users")
      .update(profileUpdatePayload)
      .eq("user_id", user.id);

    if (profileUpdateError) {
      const alertMetadata = {
        conversationId,
        hasLinkedin,
        hasResume,
        hasResumeText: Boolean(resumeText),
        linkCount: links.length,
        resumeFileName: resumeFileName ?? null,
      };
      await insertTalentProfileSourceErrorLog({
        admin,
        error: profileUpdateError,
        stage: "onboarding_profile_update",
        userId: user.id,
        metadata: alertMetadata,
      });
      await notifyUnsupportedUnicodeEscapeError({
        conversationId,
        error: profileUpdateError,
        metadata: alertMetadata,
        route: "/api/talent/onboarding/start",
        stage: "talent_users.update:onboarding_profile_update",
        userId: user.id,
      });
      throw new Error(
        profileUpdateError.message ?? "Failed to update talent profile"
      );
    }

    const displayName = submittedName || toTalentDisplayName(user);
    const talentSetting = await fetchTalentSetting({ admin, userId: user.id });
    const preferredLocale =
      talentSetting?.preferred_locale ?? body.locale ?? cookieLocale;
    const shouldRunProfileIngestion =
      applyProfileSources && Boolean(resumeText || hasLinkedin);
    // Finish source extraction before the agent's durable admission. The same
    // request already waits for extraction in the UI; no second kickoff model is needed.
    if (shouldRunProfileIngestion) {
      try {
        await ingestTalentProfileFromLinkedin({
          admin,
          userId: user.id,
          links,
          resumeText,
          resumeFileName,
          resumeStoragePath,
        });
      } catch (error) {
        await admin
          .from("talent_conversations")
          .update({
            profile_ingestion_status: "failed",
            profile_ingestion_error:
              error instanceof Error
                ? error.message
                : "Profile extraction failed",
            profile_ingestion_updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId)
          .eq("user_id", user.id)
          .eq("stage", "profile")
          .throwOnError();
        await insertTalentProfileSourceErrorLog({
          admin,
          error,
          stage: "onboarding_profile_ingest",
          userId: user.id,
          metadata: { conversationId, hasLinkedin, hasResume },
        });
        return NextResponse.json(
          {
            code: "profile_ingestion_failed",
            error: "Profile extraction failed",
          },
          { status: 422 }
        );
      }
    }
    const profileSubmitContent = buildProfileSubmitMessage({
      hasResume,
      links,
      preferredLocale,
    });
    const { data: atomicData, error: atomicError } = await (
      admin as SupabaseClient
    ).rpc("finalize_career_entry", {
      p_user_id: user.id,
      p_conversation_id: conversationId,
      p_receipt: profileSubmitContent,
      p_official_job_slug: officialJobSlug || null,
      p_is_mobile: isMobile,
    });

    if (atomicError) {
      await notifyUnsupportedUnicodeEscapeError({
        conversationId,
        error: atomicError,
        metadata: {
          hasResume,
          hasResumeText: Boolean(resumeText),
          linkCount: links.length,
        },
        route: "/api/talent/onboarding/start",
        stage: "finalize_career_entry",
        userId: user.id,
      });
      throw new Error(atomicError.message ?? "Failed to finalize onboarding");
    }

    const atomicResult = atomicData as unknown as AtomicOnboardingResult;
    const updatedConversation = atomicResult?.conversation;
    const insertedUserMessage = atomicResult?.userMessage;
    if (!updatedConversation?.id || !insertedUserMessage?.id) {
      throw new Error("Failed to finalize onboarding messages");
    }

    pendingAdmission = null;
    scheduleCareerConversationContinuation(atomicResult.run);
    await cancelCareerOnboardingContactQueue({ admin, userId: user.id });

    const toResponseMessage = (message: TalentMessageRow) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      messageType: message.message_type ?? "chat",
      createdAt: message.created_at,
    });

    const [profile, documents] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      applyProfileSources
        ? Promise.resolve([])
        : fetchTalentDocuments({ admin, userId: user.id }),
    ]);
    const talentProfile = applyProfileSources
      ? null
      : await fetchTalentStructuredProfile({
          admin,
          userId: user.id,
          talentUser: profile,
        });
    const serializedDocuments = await serializeTalentDocuments({
      admin,
      documents,
    });
    const latestResume = serializedDocuments.find(
      (document) => document.kind === "resume"
    );
    const resumeDownloadUrl = applyProfileSources
      ? null
      : await getTalentResumeSignedUrl({
          admin,
          storagePath:
            latestResume?.storagePath ?? profile?.resume_storage_path,
        });

    if (atomicResult.inserted !== false) {
      const runBackgroundOnboardingWork = async () => {
        try {
          const backgroundProfile = await fetchTalentUserProfile({
            admin,
            userId: user.id,
          });
          const materialActivity = buildProfileMaterialActivity({
            previous: {
              resumeFileName: previousProfile?.resume_file_name ?? null,
              resumeLinks: previousProfile?.resume_links ?? [],
              resumeStoragePath: previousProfile?.resume_storage_path ?? null,
              resumeText: previousProfile?.resume_text ?? null,
            },
            next: {
              resumeFileName: backgroundProfile?.resume_file_name ?? null,
              resumeLinks: backgroundProfile?.resume_links ?? [],
              resumeStoragePath: backgroundProfile?.resume_storage_path ?? null,
              resumeText: backgroundProfile?.resume_text ?? null,
            },
          });
          if (materialActivity) {
            await insertTalentActivityEvent({
              admin,
              changedDomains: materialActivity.changedDomains,
              conversationId,
              eventType: "profile_materials_updated",
              impactLevel: materialActivity.impactLevel,
              source: "onboarding",
              summary: materialActivity.summary,
              userId: user.id,
            });
          }
          const submittedProfileVisibility = talentSetting?.profile_visibility;
          const { error: logInsertError } = await admin.from("logs").insert({
            type: ONBOARDING_SUBMITTED_EVENT_TYPE,
            user_id: user.id,
            ...(submittedProfileVisibility === "open_to_matches" ||
            submittedProfileVisibility === "exceptional_only"
              ? { meta_data: { profileVisibility: submittedProfileVisibility } }
              : {}),
          });
          if (logInsertError) {
            console.error(
              "[TalentOnboardingStart] log insert failed:",
              logInsertError
            );
          }

          await cancelSignupNoProfileSubmit({ admin, userId: user.id });

          await notifySlackActivity({
            action: "/career/onboarding 제출 완료",
            details: [
              { label: "Device", value: getSlackActivityDeviceLabel(req) },
              { label: "Headline", value: backgroundProfile?.headline },
            ],
            email: verifiedEmail || backgroundProfile?.email || user.email,
            name: submittedName || backgroundProfile?.name || displayName,
            user,
          });
        } catch (backgroundError) {
          console.error(
            "[TalentOnboardingStart] background work failed:",
            backgroundError
          );
        }
      };

      try {
        after(runBackgroundOnboardingWork);
      } catch {
        void runBackgroundOnboardingWork();
      }
    }

    return NextResponse.json({
      ok: true,
      conversation: {
        id: updatedConversation.id,
        stage: updatedConversation.stage,
        resumeFileName:
          latestResume?.fileName ?? profile?.resume_file_name ?? null,
        resumeStoragePath:
          latestResume?.storagePath ?? profile?.resume_storage_path ?? null,
        resumeDownloadUrl: latestResume?.downloadUrl ?? resumeDownloadUrl,
        resumeLinks: profile?.resume_links ?? [],
        documents: serializedDocuments,
      },
      talentProfile,
      userMessage: toResponseMessage(insertedUserMessage),
      profileSubmitMessage: insertedUserMessage.content,
      kickoff: null,
      assistantMessages: [],
      profileIngestion: {
        ok: true,
        status: "completed",
      } satisfies ProfileIngestionSummary,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start talent onboarding";
    if (pendingAdmission) {
      // Release the claim for a retry. "failed" is reserved for unreadable
      // sources, which the client answers by asking for pasted text.
      const { admin, userId, conversationId } = pendingAdmission;
      await admin
        .from("talent_conversations")
        .update({
          profile_ingestion_status: null,
          profile_ingestion_error: message,
          profile_ingestion_updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
        .eq("user_id", userId)
        .eq("stage", "profile");
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { after, NextRequest, NextResponse } from "next/server";
import {
  getSlackActivityDeviceLabel,
  notifySlackActivity,
} from "@/lib/slackActivity";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_PENDING_QUESTION_PREFIX,
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
import {
  getTalentProfileVisibilityLabel,
  normalizeTalentBlockedCompanies,
} from "@/lib/talentOnboarding/server";
import { insertTalentProfileSourceErrorLog } from "@/lib/talentOnboarding/errorLogs";
import {
  buildProfileMaterialActivity,
  insertTalentActivityEvent,
} from "@/lib/talentOnboarding/activityEvents";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import {
  buildTalentKickoffOpeningMessage,
  generateTalentKickoff,
} from "@/lib/talentOnboarding/kickoff";
import { logger } from "@/utils/logger";
import { isMobileRequest } from "@/lib/requestDevice";
import {
  cancelSignupNoProfileSubmit,
  enqueueProfileSubmittedNoAnswer,
} from "@/lib/contactQueue";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  sanitizeMultilineDbText,
  sanitizeSingleLineDbText,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";
import {
  buildOfficialJobsOnboardingIntentPrompt,
  normalizeOfficialJobsRoleTitle,
  OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
} from "@/lib/officialJobs";

export const runtime = "nodejs";
export const maxDuration = 240;

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
  assistantMessages?: Array<TalentMessageRow | null>;
};

const ONBOARDING_SUBMITTED_EVENT_TYPE = "career_onboarding_submitted";
const PROFILE_INGESTION_RETRY_AFTER_MS = 3 * 60_000;

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
    "career.onboarding.submitted.profile_information",
    "프로필 정보를 제출했습니다."
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
        status: conversation.profile_ingestion_status?.trim() || null,
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
    const resumeText = sanitizeMultilineDbText(body.resumeText, 20000) ?? "";
    const resumeDocumentId = sanitizeSingleLineDbText(
      body.resumeDocumentId,
      100
    );
    const applyProfileSources = body.applyProfileSources !== false;
    const links = (body.links ?? [])
      .map((link) => sanitizeSingleLineDbText(link, 2000) ?? "")
      .filter(Boolean);
    const officialJobTitle = normalizeOfficialJobsRoleTitle(
      sanitizeSingleLineDbText(body.officialJobTitle, 240)
    );
    const officialJobSlug = sanitizeSingleLineDbText(body.officialJobSlug, 240);
    const officialJobSignupIntentPrompt =
      buildOfficialJobsOnboardingIntentPrompt(officialJobTitle);
    const hasResume = Boolean(
      resumeFileName || resumeStoragePath || resumeText
    );
    const hasProfileLink = links.length > 0;
    const hasLinkedin = links.some(isLinkedinLink);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!hasResume && !hasProfileLink) {
      return NextResponse.json(
        {
          error: careerT(
            cookieLocale,
            "career.onboarding.submit.resume_or_link_required",
            "이력서나 주요 링크 중 하나는 꼭 입력해주세요."
          ),
        },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });
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
      if (resumeText) {
        await updateTalentDocumentExtractedText({
          admin,
          documentId: resumeDocument.id,
          extractedText: resumeText,
          userId: user.id,
        });
      }
    }
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

    const now = new Date().toISOString();

    const profileUpdatePayload: TalentProfileUpdatePayload = {
      resume_links: links,
      updated_at: now,
    };

    if (typeof body.resumeText === "string") {
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
      return NextResponse.json(
        {
          error:
            profileUpdateError.message ?? "Failed to update talent profile",
        },
        { status: 500 }
      );
    }

    const displayName = submittedName || toTalentDisplayName(user);
    const talentSetting = await fetchTalentSetting({ admin, userId: user.id });
    const preferredLocale =
      talentSetting?.preferred_locale ?? body.locale ?? cookieLocale;
    const kickoff = await generateTalentKickoff({
      displayName,
      links,
      preferredLocale,
      talentPreferences: {
        profileVisibilityLabel: getTalentProfileVisibilityLabel(
          talentSetting?.profile_visibility
        ),
        blockedCompanies: normalizeTalentBlockedCompanies(
          talentSetting?.blocked_companies ?? []
        ),
        insightContent: null,
      },
      resumeFileName,
      resumeText,
    });
    const shouldRunProfileIngestion =
      applyProfileSources && Boolean(resumeText || hasLinkedin);
    const profileSubmitContent = buildProfileSubmitMessage({
      hasResume,
      links,
      preferredLocale,
    });
    const pendingQuestionContent = `${TALENT_PENDING_QUESTION_PREFIX}${buildTalentKickoffOpeningMessage(
      displayName,
      preferredLocale
    )}`;
    const { data: atomicData, error: atomicError } = await admin.rpc(
      "finalize_talent_onboarding_submission_v1",
      {
        p_conversation_id: conversationId,
        p_is_mobile: isMobile,
        p_kickoff_content: `${kickoff.acknowledgement}\n\n${kickoff.insight}`,
        p_pending_question_content: pendingQuestionContent,
        p_profile_submit_content: profileSubmitContent,
        p_user_id: user.id,
      }
    );

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
        stage: "finalize_talent_onboarding_submission_v1",
        userId: user.id,
      });
      return NextResponse.json(
        {
          error: atomicError.message ?? "Failed to finalize onboarding",
        },
        { status: 500 }
      );
    }

    const atomicResult = atomicData as unknown as AtomicOnboardingResult;
    let updatedConversation = atomicResult?.conversation;
    const insertedUserMessage = atomicResult?.userMessage;
    const assistantRows = (atomicResult?.assistantMessages ?? []).filter(
      (message): message is TalentMessageRow => Boolean(message?.id)
    );
    if (!updatedConversation?.id || !insertedUserMessage?.id) {
      return NextResponse.json(
        { error: "Failed to finalize onboarding messages" },
        { status: 500 }
      );
    }

    const existingIngestionStatus =
      updatedConversation.profile_ingestion_status?.trim() ?? "";
    const shouldScheduleProfileIngestion =
      shouldRunProfileIngestion &&
      (atomicResult.inserted !== false ||
        !existingIngestionStatus ||
        existingIngestionStatus === "failed" ||
        (existingIngestionStatus === "processing" &&
          isStaleProfileIngestion(
            updatedConversation.profile_ingestion_updated_at
          )));

    if (shouldScheduleProfileIngestion) {
      const profileIngestionStartedAt = new Date().toISOString();
      const { data: processingConversation, error: processingStatusError } =
        await admin
          .from("talent_conversations")
          .update({
            profile_ingestion_error: null,
            profile_ingestion_status: "processing",
            profile_ingestion_updated_at: profileIngestionStartedAt,
          })
          .eq("id", conversationId)
          .eq("user_id", user.id)
          .select("*")
          .single();

      if (processingStatusError || !processingConversation) {
        return NextResponse.json(
          {
            error:
              processingStatusError?.message ??
              "Failed to start profile ingestion",
          },
          { status: 500 }
        );
      }
      updatedConversation = processingConversation as TalentConversationRow;
    }

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

    if (atomicResult.inserted !== false || shouldScheduleProfileIngestion) {
      const runBackgroundOnboardingWork = async () => {
        try {
          if (shouldScheduleProfileIngestion) {
            try {
              await ingestTalentProfileFromLinkedin({
                admin,
                userId: user.id,
                links,
                resumeText,
                resumeFileName,
                resumeStoragePath,
              });
              const { error: completedStatusError } = await admin
                .from("talent_conversations")
                .update({
                  profile_ingestion_error: null,
                  profile_ingestion_status: "completed",
                  profile_ingestion_updated_at: new Date().toISOString(),
                })
                .eq("id", conversationId)
                .eq("user_id", user.id);
              if (completedStatusError) {
                throw completedStatusError;
              }
            } catch (ingestionError) {
              const ingestionMessage =
                ingestionError instanceof Error
                  ? ingestionError.message
                  : "Failed to ingest talent profile";
              logger.log("[TalentOnboardingStart] profile ingestion failed", {
                userId: user.id,
                error: ingestionMessage,
              });
              await insertTalentProfileSourceErrorLog({
                admin,
                error: ingestionError,
                stage: "onboarding_profile_ingest",
                userId: user.id,
                metadata: {
                  conversationId,
                  hasLinkedin,
                  hasResume,
                  hasResumeText: Boolean(resumeText),
                  linkCount: links.length,
                  resumeFileName: resumeFileName ?? null,
                },
              });
              await admin
                .from("talent_conversations")
                .update({
                  profile_ingestion_error: ingestionMessage.slice(0, 2000),
                  profile_ingestion_status: "failed",
                  profile_ingestion_updated_at: new Date().toISOString(),
                })
                .eq("id", conversationId)
                .eq("user_id", user.id);
            }
          }

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
          if (officialJobSignupIntentPrompt) {
            await insertTalentActivityEvent({
              admin,
              changedDomains: ["official_job_intent", "onboarding"],
              conversationId,
              eventType: OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE,
              impactLevel: "high",
              source: officialJobSlug
                ? `official_jobs_onboarding:${officialJobSlug}`
                : "official_jobs_onboarding",
              summary: officialJobSignupIntentPrompt,
              userId: user.id,
            });
          }

          const { error: logInsertError } = await admin.from("logs").insert({
            type: ONBOARDING_SUBMITTED_EVENT_TYPE,
            user_id: user.id,
          });
          if (logInsertError) {
            console.error(
              "[TalentOnboardingStart] log insert failed:",
              logInsertError
            );
          }

          await Promise.all([
            cancelSignupNoProfileSubmit({ admin, userId: user.id }),
            enqueueProfileSubmittedNoAnswer({
              admin,
              conversationId,
              payload: {
                hasLinkedin,
                hasResume,
                linkCount: links.length,
                resumeFileName: resumeFileName ?? null,
              },
              userId: user.id,
            }),
          ]).catch((queueError) => {
            console.error(
              "[TalentOnboardingStart] contact queue update failed:",
              queueError
            );
          });

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

    const responseIngestionStatus = shouldRunProfileIngestion
      ? shouldScheduleProfileIngestion
        ? "processing"
        : existingIngestionStatus || "processing"
      : "completed";
    const profileIngestion: ProfileIngestionSummary = shouldRunProfileIngestion
      ? {
          ok: responseIngestionStatus !== "failed",
          queued: responseIngestionStatus === "processing",
          status: responseIngestionStatus,
        }
      : { ok: true };

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
      profileSubmitMessage: profileSubmitContent,
      kickoff: atomicResult.inserted === false ? null : kickoff,
      assistantMessages: assistantRows
        .filter(
          (item) =>
            item.role === "assistant" &&
            !item.content.startsWith(TALENT_PENDING_QUESTION_PREFIX)
        )
        .map(toResponseMessage),
      profileIngestion,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start talent onboarding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

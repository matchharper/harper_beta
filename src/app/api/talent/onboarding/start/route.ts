import { NextRequest, NextResponse } from "next/server";
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
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
  toTalentDisplayName,
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
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
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
  conversationId?: string;
  email?: string;
  locale?: string;
  name?: string;
  resumeFileName?: string;
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
  linkedinUrl?: string;
  stats?: Record<string, number>;
  warnings?: Array<{
    code: string;
    message: string;
    detail?: string | null;
  }>;
  error?: string;
};

const ONBOARDING_SUBMITTED_EVENT_TYPE = "career_onboarding_submitted";

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
    const submittedEmail = sanitizeSingleLineDbText(
      body.email,
      320
    )?.toLowerCase();
    const resumeFileName = sanitizeSingleLineDbText(body.resumeFileName, 240);
    const resumeStoragePath = sanitizeSingleLineDbText(
      body.resumeStoragePath,
      2000
    );
    const resumeText = sanitizeMultilineDbText(body.resumeText, 20000) ?? "";
    const links = (body.links ?? [])
      .map((link) => sanitizeSingleLineDbText(link, 2000) ?? "")
      .filter(Boolean);
    const officialJobTitle = normalizeOfficialJobsRoleTitle(
      sanitizeSingleLineDbText(body.officialJobTitle, 240)
    );
    const officialJobSlug = sanitizeSingleLineDbText(
      body.officialJobSlug,
      240
    );
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
    if (submittedEmail) {
      profileUpdatePayload.email = submittedEmail.slice(0, 320);
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
    const kickoffLlmPromise = generateTalentKickoff({
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

    const shouldRunProfileIngestion = Boolean(resumeText || hasLinkedin);
    const profileIngestionPromise = shouldRunProfileIngestion
      ? (async () => {
          try {
            const ingestion = await ingestTalentProfileFromLinkedin({
              admin,
              userId: user.id,
              links,
              resumeText,
              resumeFileName,
              resumeStoragePath,
            });
            return {
              ok: true,
              linkedinUrl: ingestion.linkedinUrl,
              stats: ingestion.stats,
              warnings: ingestion.warnings,
            } as ProfileIngestionSummary;
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
            return {
              ok: false,
              error: ingestionMessage,
            };
          }
        })()
      : Promise.resolve({
          ok: true,
        } as ProfileIngestionSummary);

    const [llmRaw, profileIngestion] = await Promise.all([
      kickoffLlmPromise,
      profileIngestionPromise,
    ]);

    const submittedIdentityPayload: {
      email?: string;
      name?: string;
      updated_at: string;
    } = { updated_at: now };
    if (submittedName) {
      submittedIdentityPayload.name = submittedName.slice(0, 240);
    }
    if (submittedEmail) {
      submittedIdentityPayload.email = submittedEmail.slice(0, 320);
    }

    if (submittedIdentityPayload.name || submittedIdentityPayload.email) {
      const { error: submittedIdentityUpdateError } = await admin
        .from("talent_users")
        .update(submittedIdentityPayload)
        .eq("user_id", user.id);

      if (submittedIdentityUpdateError) {
        await notifyUnsupportedUnicodeEscapeError({
          conversationId,
          error: submittedIdentityUpdateError,
          metadata: {
            hasSubmittedEmail: Boolean(submittedEmail),
            hasSubmittedName: Boolean(submittedName),
          },
          route: "/api/talent/onboarding/start",
          stage: "talent_users.update:submitted_identity",
          userId: user.id,
        });
        return NextResponse.json(
          {
            error:
              submittedIdentityUpdateError.message ??
              "Failed to save submitted identity",
          },
          { status: 500 }
        );
      }
    }

    const kickoff = llmRaw;
    const profileSubmitContent = buildProfileSubmitMessage({
      hasResume,
      links,
      preferredLocale,
    });

    const messagePayloads = [
      withIsMobile(
        {
          conversation_id: conversationId,
          user_id: user.id,
          role: "user",
          content: profileSubmitContent,
          message_type: "profile_submit",
        },
        isMobile
      ),
      withIsMobile(
        {
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: `${kickoff.acknowledgement}\n\n${kickoff.insight}`,
          message_type: "system",
        },
        isMobile
      ),
      withIsMobile(
        {
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: `${TALENT_PENDING_QUESTION_PREFIX}${buildTalentKickoffOpeningMessage(
            displayName,
            preferredLocale
          )}`,
          message_type: "system",
        },
        isMobile
      ),
    ];

    const { data: insertedMessages, error: messageInsertError } = await admin
      .from("talent_messages")
      .insert(messagePayloads)
      .select("*");

    if (messageInsertError) {
      await notifyUnsupportedUnicodeEscapeError({
        conversationId,
        error: messageInsertError,
        metadata: {
          assistantMessageCount: messagePayloads.filter(
            (item) => item.role === "assistant"
          ).length,
          hasResume,
          hasResumeText: Boolean(resumeText),
          linkCount: links.length,
          userMessageCount: messagePayloads.filter(
            (item) => item.role === "user"
          ).length,
        },
        route: "/api/talent/onboarding/start",
        stage: "talent_messages.insert:onboarding_messages",
        userId: user.id,
      });
      return NextResponse.json(
        {
          error:
            messageInsertError.message ??
            "Failed to insert onboarding messages",
        },
        { status: 500 }
      );
    }

    const insertedRows = (insertedMessages ?? []) as TalentMessageRow[];

    const { data: updatedConversation, error: conversationUpdateError } =
      await admin
        .from("talent_conversations")
        .update({
          stage: "chat",
          updated_at: now,
        })
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .select("*")
        .single();

    if (conversationUpdateError) {
      const insertedIds = insertedRows.map((item) => item.id);
      if (insertedIds.length > 0) {
        await admin.from("talent_messages").delete().in("id", insertedIds);
      }
      return NextResponse.json(
        {
          error:
            conversationUpdateError.message ?? "Failed to update conversation",
        },
        { status: 500 }
      );
    }

    const toResponseMessage = (message: TalentMessageRow) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      messageType: message.message_type ?? "chat",
      createdAt: message.created_at,
    });

    const profile = await fetchTalentUserProfile({ admin, userId: user.id });
    const materialActivity = buildProfileMaterialActivity({
      previous: {
        resumeFileName: previousProfile?.resume_file_name ?? null,
        resumeLinks: previousProfile?.resume_links ?? [],
        resumeStoragePath: previousProfile?.resume_storage_path ?? null,
        resumeText: previousProfile?.resume_text ?? null,
      },
      next: {
        resumeFileName: profile?.resume_file_name ?? null,
        resumeLinks: profile?.resume_links ?? [],
        resumeStoragePath: profile?.resume_storage_path ?? null,
        resumeText: profile?.resume_text ?? null,
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
    const talentProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const resumeDownloadUrl = await getTalentResumeSignedUrl({
      admin,
      storagePath: profile?.resume_storage_path,
    });
    const insertedUserMessage = insertedRows.find(
      (item) => item.role === "user"
    );
    if (!insertedUserMessage) {
      return NextResponse.json(
        { error: "Failed to create profile submit message" },
        { status: 500 }
      );
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

    await cancelSignupNoProfileSubmit({
      admin,
      userId: user.id,
    }).catch((queueError) => {
      console.error(
        "[TalentOnboardingStart] signup contact queue cancel failed:",
        queueError
      );
    });
    await enqueueProfileSubmittedNoAnswer({
      admin,
      conversationId,
      payload: {
        hasLinkedin,
        hasResume,
        linkCount: links.length,
        resumeFileName: resumeFileName ?? null,
      },
      userId: user.id,
    }).catch((queueError) => {
      console.error(
        "[TalentOnboardingStart] profile contact queue enqueue failed:",
        queueError
      );
    });

    try {
      await notifySlackActivity({
        action: "/career/onboarding 제출 완료",
        details: [
          { label: "Device", value: getSlackActivityDeviceLabel(req) },
          { label: "Headline", value: profile?.headline },
        ],
        email: submittedEmail || profile?.email || user.email,
        name: submittedName || profile?.name || displayName,
        user,
      });
    } catch (slackError) {
      console.error(
        "[TalentOnboardingStart] onboarding slack notify error:",
        slackError
      );
    }

    return NextResponse.json({
      ok: true,
      conversation: {
        id: (updatedConversation as TalentConversationRow).id,
        stage: (updatedConversation as TalentConversationRow).stage,
        resumeFileName: profile?.resume_file_name ?? null,
        resumeStoragePath: profile?.resume_storage_path ?? null,
        resumeDownloadUrl,
        resumeLinks: profile?.resume_links ?? [],
      },
      talentProfile,
      userMessage: toResponseMessage(insertedUserMessage),
      profileSubmitMessage: profileSubmitContent,
      kickoff,
      assistantMessages: insertedRows
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

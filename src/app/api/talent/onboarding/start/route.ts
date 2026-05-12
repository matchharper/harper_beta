import { NextRequest, NextResponse } from "next/server";
import { notifySlackActivity } from "@/lib/slackActivity";
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
import { getTalentEngagementLabels } from "@/lib/talentNetworkOptions";
import {
  getTalentProfileVisibilityLabel,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
} from "@/lib/talentOnboarding/server";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import {
  buildTalentKickoffOpeningMessage,
  generateTalentKickoff,
} from "@/lib/talentOnboarding/kickoff";
import { logger } from "@/utils/logger";

type Body = {
  conversationId?: string;
  email?: string;
  name?: string;
  resumeFileName?: string;
  resumeStoragePath?: string;
  resumeText?: string;
  links?: string[];
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

const getSubmittedLinkLabel = (value: string) => {
  const normalized = normalizeLink(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();

    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      return "링크드인";
    }
    if (host === "github.com" || host.endsWith(".github.com")) {
      return "깃헙";
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

    return "개인 웹사이트";
  } catch {
    return "기타";
  }
};

const buildProfileSubmitMessage = (args: {
  hasResume: boolean;
  links: string[];
}) => {
  const linkLabels = args.links.reduce<string[]>((acc, link) => {
    const label = getSubmittedLinkLabel(link);
    if (label && !acc.includes(label)) {
      acc.push(label);
    }
    return acc;
  }, []);
  const linkPart =
    linkLabels.length > 0 ? `${linkLabels.join("/")} 링크` : "";

  if (args.hasResume && linkPart) {
    return `이력서와 ${linkPart}를 제출했습니다.`;
  }
  if (args.hasResume) {
    return "이력서를 제출했습니다.";
  }
  if (linkPart) {
    return `${linkPart}를 제출했습니다.`;
  }
  return "프로필 정보를 제출했습니다.";
};

const summarizeSubmittedProfile = (args: {
  linkCount: number;
  resumeFileName?: string;
}) => {
  const parts: string[] = [];
  if (args.linkCount > 0) {
    parts.push(`${args.linkCount} link${args.linkCount === 1 ? "" : "s"}`);
  }
  if (args.resumeFileName) {
    parts.push("resume");
  }
  return parts.join(", ") || "profile info";
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const submittedName = body.name?.trim();
    const submittedEmail = body.email?.trim().toLowerCase();
    const resumeFileName = body.resumeFileName?.trim();
    const resumeStoragePath = body.resumeStoragePath?.trim();
    const resumeText = body.resumeText?.trim() ?? "";
    const links = (body.links ?? [])
      .map((link) => String(link).trim())
      .filter(Boolean);
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
        { error: "이력서나 주요 링크 중 하나는 꼭 입력해주세요." },
        { status: 400 }
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

    const now = new Date().toISOString();

    const profileUpdatePayload: TalentProfileUpdatePayload = {
      resume_links: links,
      updated_at: now,
    };

    if (typeof body.resumeText === "string") {
      profileUpdatePayload.resume_text = resumeText.slice(0, 20000);
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
    const kickoffLlmPromise = generateTalentKickoff({
      displayName,
      links,
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
            } as {
              ok: boolean;
              linkedinUrl?: string;
              stats?: Record<string, number>;
              error?: string;
            };
          } catch (ingestionError) {
            const ingestionMessage =
              ingestionError instanceof Error
                ? ingestionError.message
                : "Failed to ingest talent profile";
            logger.log("[TalentOnboardingStart] profile ingestion failed", {
              userId: user.id,
              error: ingestionMessage,
            });
            return {
              ok: false,
              error: ingestionMessage,
            };
          }
        })()
      : Promise.resolve({
          ok: true,
        } as {
          ok: boolean;
          linkedinUrl?: string;
          stats?: Record<string, number>;
          error?: string;
        });

    const [llmRaw, profileIngestion] = await Promise.all([
      kickoffLlmPromise,
      profileIngestionPromise,
    ]);

    const kickoff = llmRaw;
    const profileSubmitContent = buildProfileSubmitMessage({
      hasResume,
      links,
    });

    const messagePayloads = [
      {
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: profileSubmitContent,
        message_type: "profile_submit",
      },
      {
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: `${kickoff.acknowledgement}\n\n${kickoff.insight}`,
        message_type: "system",
      },
      {
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: `${TALENT_PENDING_QUESTION_PREFIX}${buildTalentKickoffOpeningMessage(
          displayName
        )}`,
        message_type: "system",
      },
    ];

    const { data: insertedMessages, error: messageInsertError } = await admin
      .from("talent_messages")
      .insert(messagePayloads)
      .select("*");

    if (messageInsertError) {
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

    try {
      await notifySlackActivity({
        action: "/career/onboarding 제출 완료",
        details: [
          {
            label: "Submitted",
            value: summarizeSubmittedProfile({
              linkCount: links.length,
              resumeFileName,
            }),
          },
          {
            label: "Looking for",
            value: getTalentEngagementLabels(
              normalizeTalentEngagementTypes(
                talentSetting?.engagement_types ?? []
              )
            ).join(", "),
          },
          {
            label: "Visibility",
            value: getTalentProfileVisibilityLabel(
              talentSetting?.profile_visibility
            ),
          },
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

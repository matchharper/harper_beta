import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentProfileVisibilityLabel,
  getTalentSupabaseAdmin,
  normalizeTalentBlockedCompanies,
  normalizeTalentInsightContent,
  type TalentAdminClient,
  type TalentConversationRow,
  type TalentMessageRow,
  type TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";
import {
  buildTalentKickoffOpeningMessage,
  generateTalentKickoff,
} from "@/lib/talentOnboarding/kickoff";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  cancelSignupNoProfileSubmit,
  enqueueProfileSubmittedNoAnswer,
} from "@/lib/contactQueue";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";

const ONBOARDING_SUBMITTED_EVENT_TYPE = "career_onboarding_submitted";

type UntypedAdmin = TalentAdminClient & {
  from: (table: string) => any;
};

function toUntypedAdmin(admin: TalentAdminClient): UntypedAdmin {
  return admin as unknown as UntypedAdmin;
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => normalizeLink(String(item ?? "")))
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

function getSubmittedLinkLabel(
  value: string,
  preferredLocale?: string | null
) {
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
}

function buildProfileSubmitMessage(args: {
  hasResume: boolean;
  links: string[];
  preferredLocale?: string | null;
}) {
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
}

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function hasProfileMaterial(profile: TalentUserProfileRow | null) {
  if (!profile) return false;
  return Boolean(
    hasText(profile.resume_file_name) ||
      hasText(profile.resume_storage_path) ||
      hasText(profile.resume_text) ||
      (profile.resume_links ?? []).some((link) => hasText(link))
  );
}

function displayName(profile: TalentUserProfileRow | null) {
  const name = String(profile?.name ?? "").trim();
  if (name) return name;
  const email = String(profile?.email ?? "").trim();
  if (email.includes("@")) return email.split("@")[0] || "Candidate";
  return "Candidate";
}

async function mergeSubmittedLinks(args: {
  admin: UntypedAdmin;
  links: string[];
  userId: string;
}) {
  if (args.links.length === 0) return;
  const { data, error } = await args.admin
    .from("talent_users")
    .select("resume_links")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load submitted links");
  }

  const current = Array.isArray(data?.resume_links) ? data.resume_links : [];
  const merged = Array.from(
    new Set([...current, ...args.links].map((link) => String(link ?? "").trim()).filter(Boolean))
  );
  if (merged.length === current.length) return;

  const { error: updateError } = await args.admin
    .from("talent_users")
    .update({
      resume_links: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId);
  if (updateError) {
    throw new Error(updateError.message ?? "Failed to save submitted links");
  }
}

async function ensureConversation(args: {
  admin: UntypedAdmin;
  conversationId: string;
  userId: string;
}) {
  const conversationId = args.conversationId.trim();
  if (conversationId) {
    const { data, error } = await args.admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message ?? "Failed to load conversation");
    }
    if (!data) {
      throw new Error("Conversation not found");
    }
    return data as TalentConversationRow;
  }

  const { data: existing, error: existingError } = await args.admin
    .from("talent_conversations")
    .select("*")
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    throw new Error(existingError.message ?? "Failed to load conversation");
  }
  if (existing) return existing as TalentConversationRow;

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await args.admin
    .from("talent_conversations")
    .insert({
      created_at: now,
      relief_nudge_sent: false,
      stage: "chat",
      updated_at: now,
      user_id: args.userId,
    })
    .select("*")
    .single();
  if (insertError) {
    throw new Error(insertError.message ?? "Failed to create conversation");
  }
  return inserted as TalentConversationRow;
}

async function hasProfileSubmitMessage(args: {
  admin: UntypedAdmin;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("id")
    .eq("user_id", args.userId)
    .eq("message_type", "profile_submit")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to inspect profile submit messages");
  }
  return Boolean(data?.id);
}

async function seedProfileSubmit(args: {
  admin: TalentAdminClient;
  conversationId: string;
  links: string[];
  source: string;
  userId: string;
}) {
  const admin = toUntypedAdmin(args.admin);
  await mergeSubmittedLinks({
    admin,
    links: args.links,
    userId: args.userId,
  });

  if (await hasProfileSubmitMessage({ admin, userId: args.userId })) {
    return {
      seeded: false,
      skipped: "profile_submit_exists",
    };
  }

  const conversation = await ensureConversation({
    admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });
  const profile = await fetchTalentUserProfile({
    admin: args.admin,
    userId: args.userId,
  });
  if (!hasProfileMaterial(profile)) {
    return {
      seeded: false,
      skipped: "missing_profile_material",
    };
  }

  const [talentSetting, talentInsights, structuredProfile] = await Promise.all([
    fetchTalentSetting({
      admin: args.admin,
      userId: args.userId,
    }),
    fetchTalentInsights({
      admin: args.admin,
      userId: args.userId,
    }),
    fetchTalentStructuredProfile({
      admin: args.admin,
      userId: args.userId,
      talentUser: profile,
    }),
  ]);
  const preferredLocale = talentSetting?.preferred_locale ?? null;
  const normalizedInsights = normalizeTalentInsightContent(
    talentInsights?.content
  );
  const profileVisibilityLabel = getTalentProfileVisibilityLabel(
    talentSetting?.profile_visibility
  );
  const blockedCompanies = normalizeTalentBlockedCompanies(
    talentSetting?.blocked_companies ?? []
  );
  const profileContext = buildTalentProfileContext({
    includeResumeText: false,
    profile,
    setting: talentSetting,
    structuredProfile,
  });
  const resumeTextForKickoff = [profile?.resume_text, profileContext]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  const links = Array.from(
    new Set([...(profile?.resume_links ?? []), ...args.links].filter(Boolean))
  );
  const hasResume = Boolean(
    hasText(profile?.resume_file_name) ||
      hasText(profile?.resume_storage_path) ||
      hasText(profile?.resume_text)
  );
  const kickoff = await generateTalentKickoff({
    displayName: displayName(profile),
    links,
    preferredLocale,
    talentPreferences: {
      blockedCompanies,
      insightContent: normalizedInsights,
      profileVisibilityLabel,
    },
    resumeFileName: profile?.resume_file_name,
    resumeText: resumeTextForKickoff,
  });
  const profileSubmitContent = buildProfileSubmitMessage({
    hasResume,
    links,
    preferredLocale,
  });
  const messagePayloads = [
    {
      conversation_id: conversation.id,
      content: profileSubmitContent,
      message_type: "profile_submit",
      role: "user",
      user_id: args.userId,
    },
    {
      conversation_id: conversation.id,
      content: `${kickoff.acknowledgement}\n\n${kickoff.insight}`,
      message_type: "system",
      role: "assistant",
      user_id: args.userId,
    },
    {
      conversation_id: conversation.id,
      content: `${TALENT_PENDING_QUESTION_PREFIX}${buildTalentKickoffOpeningMessage(
        displayName(profile),
        preferredLocale
      )}`,
      message_type: "system",
      role: "assistant",
      user_id: args.userId,
    },
  ];
  const { data: insertedMessages, error: insertError } = await admin
    .from("talent_messages")
    .insert(messagePayloads)
    .select("*");
  if (insertError) {
    throw new Error(insertError.message ?? "Failed to insert onboarding seed messages");
  }

  const now = new Date().toISOString();
  const { data: updatedConversation, error: updateError } = await admin
    .from("talent_conversations")
    .update({
      stage: "chat",
      updated_at: now,
    })
    .eq("id", conversation.id)
    .eq("user_id", args.userId)
    .select("*")
    .single();
  if (updateError) {
    throw new Error(updateError.message ?? "Failed to update conversation");
  }

  const { error: logError } = await admin.from("logs").insert({
    type: ONBOARDING_SUBMITTED_EVENT_TYPE,
    user_id: args.userId,
  });
  if (logError) {
    console.error("[EmailOnboardingSeed] log insert failed", {
      error: logError.message,
      userId: args.userId,
    });
  }

  await cancelSignupNoProfileSubmit({
    admin: args.admin,
    userId: args.userId,
  }).catch((error) => {
    console.error("[EmailOnboardingSeed] signup queue cancel failed", {
      error,
      userId: args.userId,
    });
  });
  await enqueueProfileSubmittedNoAnswer({
    admin: args.admin,
    conversationId: conversation.id,
    payload: {
      hasResume,
      linkCount: links.length,
      resumeFileName: profile?.resume_file_name ?? null,
      source: args.source,
    },
    userId: args.userId,
  }).catch((error) => {
    console.error("[EmailOnboardingSeed] profile queue enqueue failed", {
      error,
      userId: args.userId,
    });
  });

  const insertedRows = (insertedMessages ?? []) as TalentMessageRow[];
  return {
    assistantMessageIds: insertedRows
      .filter((row) => row.role === "assistant")
      .map((row) => row.id),
    conversationId: (updatedConversation as TalentConversationRow).id,
    profileSubmitMessageId:
      insertedRows.find((row) => row.message_type === "profile_submit")?.id ??
      null,
    seeded: true,
  };
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: unknown;
      links?: unknown;
      source?: unknown;
      userId?: unknown;
    };
    const userId = String(body.userId ?? "").trim();
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const result = await seedProfileSubmit({
      admin: getTalentSupabaseAdmin(),
      conversationId: String(body.conversationId ?? "").trim(),
      links: normalizeLinks(body.links),
      source: String(body.source ?? "email_signup_followup").trim(),
      userId,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to seed email profile submission"
    );
  }
}

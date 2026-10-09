import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import type { CareerCoachingActivity } from "../careerCoachingActivitySchema";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import {
  fetchCurrentCareerCoachingActivity,
  expireCurrentCareerCoachingActivity,
} from "../careerCoachingActivity";
import {
  buildTalentProfileContext,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  fetchTalentSetting,
  fetchTalentContextPromptSnapshot,
  renderTalentContextPrompt,
} from "@/lib/talentOnboarding/server";
import {
  CAREER_CAPABILITY_MAX_TURNS,
  type CareerCapabilityId,
  type CareerCapabilityMode,
} from "./registry";
import {
  CAREER_CAPABILITY_PAYLOAD_KEY,
  parseCareerCapabilityTurn,
  restoreCareerCapabilityLeases,
} from "./lease";
import {
  CareerCapabilityRuntime,
  type CareerCapabilityPromptArgs,
} from "./runtime";

export function isCareerCapabilityTurn(args: {
  channel: string;
  isOnboardingDone: boolean;
  allowedToolNames?: readonly string[] | null;
}) {
  return (
    args.channel === "chat" &&
    args.isOnboardingDone &&
    (!Array.isArray(args.allowedToolNames) || args.allowedToolNames.length > 0)
  );
}

export async function readCareerCapabilityLeases(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  beforeId?: number;
  currentCreatedAt: string;
}) {
  try {
    let query = args.admin
      .from("talent_messages")
      .select("id,created_at,payload")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .eq("role", "user")
      .not(`payload->${CAREER_CAPABILITY_PAYLOAD_KEY}`, "is", null);
    if (args.beforeId !== undefined) query = query.lt("id", args.beforeId);
    const { data, error } = await query
      .order("id", { ascending: false })
      .limit(CAREER_CAPABILITY_MAX_TURNS);
    if (error) throw error;
    return restoreCareerCapabilityLeases({
      currentCreatedAt: args.currentCreatedAt,
      rows: data ?? [],
    });
  } catch {
    console.warn("[career-capabilities] lease read failed; using cold tools", {
      sourceMessageId: args.beforeId,
    });
    return new Set<CareerCapabilityId>();
  }
}

export async function readCareerCapabilityCoaching(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  expire?: boolean;
}) {
  const { data, error } = await args.admin
    .from("talent_conversations")
    .select("career_coaching_activity_message_id")
    .eq("id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) throw error;
  const activityMessageId = data?.career_coaching_activity_message_id;
  if (!activityMessageId) return null;
  // Expiration is only requested BEFORE inserting the new source user message.
  if (
    args.expire &&
    (await expireCurrentCareerCoachingActivity({ ...args, activityMessageId }))
  )
    return null;
  return fetchCurrentCareerCoachingActivity({ ...args, activityMessageId });
}

export async function createCareerCapabilityTurn(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  sourceMessage: TalentMessageRow | null;
  mode: CareerCapabilityMode;
  eligibleTools: readonly TalentChatTool[];
  promptArgs: CareerCapabilityPromptArgs;
  preloads?: readonly CareerCapabilityId[];
  origin?: "web" | "server";
}) {
  const { admin, userId, conversationId, sourceMessage } = args;
  if (
    sourceMessage &&
    (sourceMessage.user_id !== userId ||
      sourceMessage.conversation_id !== conversationId ||
      sourceMessage.role !== "user" ||
      !parseCareerCapabilityTurn(sourceMessage.payload))
  )
    throw new Error("Invalid Career capability source message");
  const scope = () =>
    admin
      .from("talent_messages")
      .select("id,created_at,payload")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("role", "user");
  const remembered =
    sourceMessage && args.mode === "progressive"
      ? await readCareerCapabilityLeases({
          admin,
          userId,
          conversationId,
          beforeId: sourceMessage.id,
          currentCreatedAt: sourceMessage.created_at,
        })
      : new Set<CareerCapabilityId>();
  const promptArgs = { ...args.promptArgs };
  const readCoaching = async () => {
    promptArgs.careerCoachingActivity = await readCareerCapabilityCoaching({
      admin,
      userId,
      conversationId,
    });
    promptArgs.conversationMode =
      promptArgs.careerCoachingActivity?.status === "active"
        ? "career_coaching"
        : args.promptArgs.conversationMode === "career_coaching"
          ? "default"
          : args.promptArgs.conversationMode;
  };
  // Server text turns need the same saved activity facts as the web route.
  if (
    !Object.prototype.hasOwnProperty.call(promptArgs, "careerCoachingActivity")
  )
    await readCoaching();
  const preloads = [...(args.preloads ?? [])];
  if (promptArgs.careerCoachingActivity?.status === "active")
    preloads.push("career_coaching");
  const runtime = new CareerCapabilityRuntime({
    mode: args.mode,
    eligibleTools: args.eligibleTools,
    promptArgs: () => promptArgs,
    remembered,
    preloads,
    usageContext: {
      careerChannel: "chat",
      careerOrigin: args.origin,
      userId,
      conversationId,
      ...(sourceMessage ? { sourceMessageId: sourceMessage.id } : {}),
    },
    refreshAfterTool: async (name, result) => {
      if (name === "manage_career_coaching_activity") {
        // Keep the executor's verified state even if the follow-up read fails.
        const receipt = result as {
          activityMessage?: { coachingActivity?: CareerCoachingActivity };
          currentActivity?: CareerCoachingActivity | null;
        } | null;
        if (receipt?.activityMessage?.coachingActivity)
          promptArgs.careerCoachingActivity =
            receipt.activityMessage.coachingActivity;
        else if (
          receipt &&
          Object.prototype.hasOwnProperty.call(receipt, "currentActivity")
        )
          promptArgs.careerCoachingActivity = receipt.currentActivity ?? null;
        promptArgs.conversationMode =
          promptArgs.careerCoachingActivity?.status === "active"
            ? "career_coaching"
            : args.promptArgs.conversationMode === "career_coaching"
              ? "default"
              : args.promptArgs.conversationMode;
        await readCoaching();
      }
      if (
        [
          "update_talent_profile",
          "write_talent_context",
          "update_setting",
          "update_language_setting",
        ].includes(name)
      ) {
        const [profile, setting, context] = await Promise.all([
          fetchTalentUserProfile({ admin, userId }),
          fetchTalentSetting({ admin, userId }),
          fetchTalentContextPromptSnapshot({
            admin,
            userId,
            query: sourceMessage?.content ?? "career conversation",
          }),
        ]);
        const structuredProfile = await fetchTalentStructuredProfile({
          admin,
          userId,
          talentUser: profile,
        });
        promptArgs.profile = profile;
        promptArgs.structuredProfileText = buildTalentProfileContext({
          profile,
          setting,
          structuredProfile,
          maxResumeChars: 3000,
        });
        promptArgs.talentContextSection = renderTalentContextPrompt(context);
        promptArgs.currentPreferences = {
          ...promptArgs.currentPreferences,
          preferredLocale: setting?.preferred_locale,
          getExternalRecommendation: setting?.get_external_recommendation,
          profileVisibility: setting?.profile_visibility,
          talentSettingStatus: setting?.status,
          periodicIntervalDays: setting
            ? normalizeTalentPeriodicIntervalDays(
                setting.periodic_interval_days
              )
            : null,
          recommendationBatchSize: setting
            ? normalizeTalentRecommendationBatchSize(
                setting.recommendation_batch_size
              )
            : null,
        };
      }
    },
    onStep: (data) =>
      console.info("[career-capabilities:step]", {
        sourceMessageId: sourceMessage?.id,
        conversationId,
        userId,
        ...data,
      }),
    onEvent: (data) =>
      console.info("[career-capabilities:event]", {
        sourceMessageId: sourceMessage?.id,
        conversationId,
        userId,
        ...data,
      }),
  });
  let completed = false;
  const complete = async () => {
    if (completed || !sourceMessage) return;
    // Compare-and-swap preserves concurrent writers' unrelated payload fields.
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: row, error } = await scope()
          .eq("id", sourceMessage.id)
          .maybeSingle();
        if (error || !row) throw error ?? new Error("Source message missing");
        const record = parseCareerCapabilityTurn(row.payload);
        if (!record || record.mode !== args.mode) return;
        if (record.status === "completed") {
          completed = true;
          return;
        }
        const payload = {
          ...(row.payload as Record<string, unknown>),
          [CAREER_CAPABILITY_PAYLOAD_KEY]: runtime.completedRecord(),
        };
        const { data, error: updateError } = await admin
          .from("talent_messages")
          .update({ payload: payload as TalentMessageRow["payload"] })
          .eq("id", sourceMessage.id)
          .eq("user_id", userId)
          .eq("conversation_id", conversationId)
          .eq("role", "user")
          .filter("payload", "eq", JSON.stringify(row.payload))
          .select("id");
        if (updateError) throw updateError;
        if (data?.length) {
          completed = true;
          return;
        }
      }
      throw new Error("Concurrent message payload changes");
    } catch {
      console.warn(
        "[career-capabilities] completion record failed; next turn starts cold",
        { sourceMessageId: sourceMessage.id }
      );
    }
  };
  return { runtime, complete };
}

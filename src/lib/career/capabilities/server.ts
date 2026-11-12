import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { listCareerActionItems } from "../actionItems.server";
import type { CareerActionItem } from "../actionItems";
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
  type CareerAgentRuntimeState,
  type CareerReplyCheckpoint,
} from "./runtime";
import { selectCareerPreloads, type CareerPreloadSelection, type CareerSelectorInput } from "./decisions";
import { normalizeCareerHandbookLeases, type CareerHandbookLease } from "../handbooks/registry";
import type { CareerCapabilityTurnRecord } from "./lease";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { readCareerConversationVersion } from "../conversationVersion";
import { readCareerPromptExperiment } from "../prompts/promptExperiment";

export function isCareerCapabilityTurn(args: {
  applicationStartRequested?: boolean;
  applicationActive?: boolean;
  applicationInputSubmitted?: boolean;
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
  workId?: string;
  observePendingWork?: ConstructorParameters<typeof CareerCapabilityRuntime>[0]["observePendingWork"];
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  sourceMessage: TalentMessageRow | null;
  mode: CareerCapabilityMode;
  eligibleTools: readonly TalentChatTool[];
  getEligibleTools?: () => readonly TalentChatTool[];
  promptArgs: CareerCapabilityPromptArgs;
  adaptPromptBlocks?: ConstructorParameters<typeof CareerCapabilityRuntime>[0]["adaptPromptBlocks"];
  getPromptArgs?: () => CareerCapabilityPromptArgs;
  preloads?: readonly CareerCapabilityId[];
  origin?: "web" | "server";
  replyId?: string;
  agentState?: CareerAgentRuntimeState;
  selectorInput?: CareerSelectorInput;
  selectionSnapshot?: CareerPreloadSelection | Promise<CareerPreloadSelection | undefined>;
  actionItemsRead?: Promise<CareerActionItem[] | null | undefined>;
  usageRequestId?: string;
  abortSignal?: AbortSignal;
  checkCancellation?: () => Promise<void>;
  deadlineAt?: number;
  allowLoaders?: boolean;
  resume?: CareerReplyCheckpoint;
  continuation?: CareerReplyCheckpoint["continuation"];
  checkpoint?: (checkpoint: CareerReplyCheckpoint) => Promise<void>;
  inputInbox?: ConstructorParameters<typeof CareerCapabilityRuntime>[0]["inputInbox"];
  resumeDependenciesPending?: boolean;
  /** Return true when the same transaction also persisted the source-message trace. */
  persistCompletion?: (record: CareerCapabilityTurnRecord, handbooks: CareerHandbookLease[]) => Promise<void | boolean>;
}) {
  const { admin, userId, conversationId, sourceMessage } = args;
  if (
    sourceMessage &&
    (sourceMessage.user_id !== userId ||
      sourceMessage.conversation_id !== conversationId ||
      sourceMessage.role !== "user")
  )
    throw new Error("Invalid Career capability source message");
  const scope = () =>
    admin
      .from("talent_messages")
      .select("id,created_at,payload")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("role", "user");
  const promptArgs = { ...args.promptArgs };
  let actionItems: CareerActionItem[] | null = null;
  const readActionItems = async () => {
    try { actionItems = await listCareerActionItems({ admin, userId }); }
    catch { actionItems = null; }
  };
  const initialActionItemsRead = args.eligibleTools.some(tool => tool.function.name === "manage_action_items")
    ? args.actionItemsRead
      ? args.actionItemsRead.then(items => { actionItems = items ?? null; }).catch(() => { actionItems = null; })
      : readActionItems()
    : Promise.resolve();
  const conversationVersion = sourceMessage
    ? readCareerConversationVersion(sourceMessage.payload)
    : promptArgs.conversationVersion;
  const promptExperiment = promptArgs.channel === "chat" && promptArgs.isOnboardingDone && !promptArgs.backgroundInvocation
    ? readCareerPromptExperiment(sourceMessage?.payload) : undefined;
  let refreshedUserContext: Partial<CareerCapabilityPromptArgs> = {};
  let coachingRefreshed = false;
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
  const initialCoachingRead = !Object.prototype.hasOwnProperty.call(promptArgs, "careerCoachingActivity")
    ? readCoaching() : Promise.resolve();
  void initialCoachingRead.catch(() => undefined);
  const replyId = args.replyId ?? (sourceMessage ? `message:${sourceMessage.id}` : crypto.randomUUID());
  const requestId = args.usageRequestId ?? crypto.randomUUID();
  const usageContext = { requestId, careerChannel: "chat" as const, careerOrigin: args.origin, userId, conversationId,
    ...(sourceMessage ? { sourceMessageId: sourceMessage.id } : {}) };
  const handbooks = normalizeCareerHandbookLeases(args.agentState?.handbooks)
    .filter(book => book.id !== "proactive_career" || Boolean(promptArgs.backgroundInvocation));
  const selectionRead = (async () => (await args.selectionSnapshot) ?? (args.resume ? {
    capabilityIds: args.resume.capabilityIds, handbookIds: [], status: "selected" as const, elapsedMs: 0,
  } : await withLlmUsageContext(usageContext, () => selectCareerPreloads({
    eligibleNames: new Set(args.eligibleTools.map(tool => tool.function.name)),
    eligibleTools: args.eligibleTools,
    input: args.selectorInput ?? { messages: sourceMessage ? [{ role: "user", content: sourceMessage.content }] : [] },
    activeHandbooks: handbooks, signal: args.abortSignal,
    promptExperiment, background: Boolean(promptArgs.backgroundInvocation),
  }))))();
  const [selection] = await Promise.all([selectionRead, initialActionItemsRead, initialCoachingRead]);
  const runtime = new CareerCapabilityRuntime({
    mode: args.mode,
    eligibleTools: args.eligibleTools,
    adaptPromptBlocks: args.adaptPromptBlocks,
    getEligibleTools: args.getEligibleTools,
    promptArgs: () => {
      const current = { ...promptArgs, ...args.getPromptArgs?.(), ...refreshedUserContext,
        actionItems,
        isMobile: promptArgs.isMobile ?? sourceMessage?.is_mobile,
        conversationVersion,
        ...(promptExperiment ? { promptExperiment } : {}),
      };
      if (coachingRefreshed) {
        current.careerCoachingActivity = promptArgs.careerCoachingActivity;
        if (current.simulationSession?.status !== "active")
          current.conversationMode = promptArgs.careerCoachingActivity?.status === "active"
            ? "career_coaching" : current.conversationMode === "career_coaching" ? "default" : current.conversationMode;
      }
      return current;
    },
    // Structural caller preloads are available only as a failure fallback.
    preloads: selection.status === "unavailable" ? args.preloads : [],
    replyId, requestId, handbooks, selection, allowLoaders: args.allowLoaders,
    abortSignal: args.abortSignal, checkCancellation: args.checkCancellation,
    deadlineAt: args.deadlineAt, resume: args.resume, checkpoint: args.checkpoint,
    continuation: args.continuation,
    inputInbox: args.inputInbox,
    observePendingWork: args.observePendingWork,
    delegated: Boolean(args.workId),
    resumeDependenciesPending: args.resumeDependenciesPending,
    usageContext,
    refreshAfterTool: async (name, result) => {
      if (name === "manage_action_items") await readActionItems();
      if (name === "manage_career_coaching_activity") {
        coachingRefreshed = true;
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
        refreshedUserContext = {
          profile: promptArgs.profile,
          structuredProfileText: promptArgs.structuredProfileText,
          talentContextSection: promptArgs.talentContextSection,
          currentPreferences: promptArgs.currentPreferences,
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
  const complete = async (outcome: { delivered?: boolean } = {}) => {
    if (completed) return;
    const completionRecord = runtime.completedRecord();
    const sourceTracePersisted = await args.persistCompletion?.(completionRecord, outcome.delivered === false
      ? runtime.handbooks.snapshot() : runtime.handbooks.afterDeliveredReply());
    completed = true;
    if (sourceTracePersisted === true || !sourceMessage || args.workId) return;
    // Compare-and-swap preserves concurrent writers' unrelated payload fields.
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: row, error } = await scope()
          .eq("id", sourceMessage.id)
          .maybeSingle();
        if (error || !row) throw error ?? new Error("Source message missing");
        const record = parseCareerCapabilityTurn(row.payload);
        if (record?.status === "completed" && record.replyId === replyId) return;
        const payload = {
          ...(row.payload as Record<string, unknown>),
          [CAREER_CAPABILITY_PAYLOAD_KEY]: completionRecord,
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
        "[career-capabilities] completion trace unavailable; conversation handbook state is authoritative",
        { sourceMessageId: sourceMessage.id }
      );
    }
  };
  return { runtime, complete, selection };
}

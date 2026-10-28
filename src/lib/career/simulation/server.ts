import { runApplicationInspection } from "./applicationInspection";
import { inspectApplicationForm } from "./applicationFormInspection";
import { applicationFormText } from "./applicationFormText";
import { createPreparation } from "./preparation";
import { askApplicationInput } from "./applicationInput";
import { writeApplicationSuggestions } from "./suggestionWriter";
import type { CareerTextChatModelId } from "@/lib/career/textChatModelConfig";
import {
  fetchTalentContextPromptSnapshot,
  renderTalentContextPrompt,
} from "@/lib/talentOnboarding/talentContexts";
import {
  executeSharedWebSearch,
  executeSharedOpenUrl,
} from "@/lib/agentTools/web";
import { readSimulationJdSource, buildSimulationRoleInput } from "./jdSource";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  createSimulationSession,
  endSimulationSession,
  finishSimulationAnalysis,
} from "./session";
import { sessionOperation, saveSession } from "./sessionStore";

import { SIMULATION_TIMEOUT_MS } from "./completion";

import {
  fetchTalentDocuments,
  fetchTalentDocument,
} from "@/lib/talentOnboarding/documentStore";
import {
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
} from "@/lib/talentOnboarding/profileStore";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
  type TalentMessageResponse,
} from "@/lib/talentOnboarding/models";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { Json } from "@/types/database.types";
import { SIMULATION_MESSAGE_TYPE, type ApplicationSimulation } from "./types";
import { simulationProfileSnapshot } from "./profileSnapshot";

const productionDependencies = {
  fetchTalentStructuredProfile,
  fetchTalentDocuments,
  fetchTalentDocument,
  fetchTalentContextPromptSnapshot,
  fetchTalentUserProfile,
  executeSharedWebSearch,
  executeSharedOpenUrl,
  inspectApplicationForm,
  writeApplicationSuggestions,
};

export async function executeApplicationSimulation(
  args: {
    admin: TalentAdminClient;
    userId: string;
    conversationId: string;
    documentId?: string;
    profileOnly?: boolean;
    roleName: string;
    roleRef: string;
    requestKey: string;
    startOfferId?: number;
    emailSourceMessageId?: number;
    deferPreparation?: boolean;
    resumeMessageId?: number;
    role: Record<string, unknown>;
    loadSavedRole?: () => Promise<Record<string, unknown>>;
    locale?: string | null;
    textChatModel?: CareerTextChatModelId;
    signal?: AbortSignal;
    scheduleAfter?: (task: () => Promise<void>) => void;
    onMessage?: (message: TalentMessageResponse) => void;
  },
  dependencies: typeof productionDependencies = productionDependencies
) {
  const {
    fetchTalentStructuredProfile,
    fetchTalentDocuments,
    fetchTalentDocument,
    fetchTalentContextPromptSnapshot,
    fetchTalentUserProfile,
    executeSharedWebSearch,
    executeSharedOpenUrl,
    inspectApplicationForm,
    writeApplicationSuggestions,
  } = dependencies;
  // Scope every read and write to the authenticated user. The tool cannot choose an owner.
  const { data: conversation, error } = await args.admin
    .from("talent_conversations")
    .select("id")
    .eq("id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error || !conversation)
    throw new Error("Simulation conversation is unavailable");
  const profile = await fetchTalentStructuredProfile({
    admin: args.admin,
    userId: args.userId,
  });
  const documents =
    args.documentId || args.profileOnly
      ? []
      : await fetchTalentDocuments({
          admin: args.admin,
          userId: args.userId,
          kind: "resume",
        });
  const document = args.profileOnly
    ? null
    : args.documentId
      ? await fetchTalentDocument({
          admin: args.admin,
          userId: args.userId,
          documentId: args.documentId,
        })
      : (documents.find((d) => d.is_primary) ?? documents[0] ?? null);
  if (args.emailSourceMessageId && !document)
    return { ok: false, reason: "A readable resume is required for email application preparation. Use existing document reads, or create a resume from confirmed facts with the user’s authorization before starting." };
  if (args.documentId && !document)
    return {
      ok: false,
      reason:
        "The selected document is unavailable. Choose an active document belonging to the user.",
    };
  const resume = document?.extracted_text?.trim() ?? "";
  if (document && !resume)
    return {
      ok: false,
      reason:
        "The selected document has no readable extracted text. Ask for a readable resume or use the profile only after clarifying the source.",
    };
  if (
    !resume &&
    !profile.talentExperiences.length &&
    !profile.talentEducations.length &&
    !profile.talentExtras.length &&
    !profile.talentUser?.headline &&
    !profile.talentUser?.bio
  ) {
    return {
      ok: false,
      reason:
        "No career information is available yet. Ask for a resume or career profile before starting an analysis.",
    };
  }
  const store = {
    admin: args.admin,
    userId: args.userId,
    conversationId: args.conversationId,
  };
  let current = await sessionOperation({ ...store, operation: "read", messageId: args.resumeMessageId });
  const email = Boolean(args.emailSourceMessageId);
  if (args.resumeMessageId && (!current || current.state.status !== "active" || current.state.activity?.sourceMessageId !== args.emailSourceMessageId))
    throw new Error("Application continuation unavailable");
  if (args.resumeMessageId && current) {
    if (current.state.analysisStatus === "completed") return { ok: true, alreadyStarted: true, status: "completed", sessionMessageId: current.messageId };
  } else if (current?.state.status === "active") {
    if (
      current.state.roleRef !== args.roleRef ||
      current.state.documentId !== (document?.id ?? null)
    )
      return {
        ok: false,
        reason:
          "A different role or source resume is active. A clear request to switch authorizes ending that preparation with manage_simulation_session before starting this one. Preserve its saved work; do not treat it as the requested target or ask for redundant switch confirmation.",
      };
    if (
      (args.startOfferId && current.state.activity?.offerId === args.startOfferId) ||
      (email && current.state.activity?.sourceMessageId === args.emailSourceMessageId)
    )
      return {
        ok: true,
        alreadyStarted: true,
        status: current.state.analysisStatus,
        sessionMessageId: current.messageId,
      };
    if (current.state.analysisStatus === "running")
      return {
        ok: false,
        reason: "This analysis is already running. Do not start another.",
      };
    current = await saveSession(
      store,
      current,
      {
        ...current.state,
        analysisStatus: "running",
        analysisStartedAt: new Date().toISOString(),
        proposal: null,
        activity: {
          ...current.state.activity!,
          batches: current.state.activity!.batches.map((b) =>
            b.status === "waiting" ? { ...b, status: "cancelled" as const } : b
          ),
        },
      },
      args.requestKey + ":retry"
    );
  } else {
    if (!args.startOfferId && !email) throw new Error("Start card required");
    current = await sessionOperation({
      ...store,
      operation: "begin",
      key: args.requestKey,
      state: {
        ...createSimulationSession({
          locale: args.locale ?? undefined,
          roleRef: args.roleRef,
          roleName: args.roleName,
          documentId: document?.id ?? null,
          documentName: document?.file_name ?? null,
          documentOriginType: document?.origin_type ?? null,
        }),
        preparation: createPreparation(),
        activity: {
          version: 1,
          offerId: args.startOfferId,
          ...(email ? { channel: "email" as const, sourceMessageId: args.emailSourceMessageId,
            preparationRequest: { role: await (args.loadSavedRole ?? (async () => args.role))(), requestKey: args.requestKey } } : {}),
          outputs: {},
          batches: [],
        },
      },
    });
    if (current && !current.created) {
      if (current.state.roleRef !== args.roleRef || current.state.documentId !== (document?.id ?? null))
        throw new Error("Application start returned a different role or source resume");
      return {
        ok: true,
        alreadyStarted: true,
        status: current.state.analysisStatus,
        sessionStatus: current.state.status,
        sessionMessageId: current.messageId,
      };
    }
  }
  if (!current) throw new Error("Could not start simulation session");
  args.onMessage?.(current.message);
  if (args.deferPreparation) return { ok: true, preparationPending: true, sessionMessageId: current.messageId };
  const startedAt = Date.now();
  let phase = "candidate";
  try {
    if (!current.state.analysisMessageId) {
    const { data: notice, error: noticeError } = await args.admin
      .from("talent_messages")
      .insert({
        user_id: args.userId,
        conversation_id: args.conversationId,
        role: "assistant",
        message_type: "simulation_notice",
        content: careerT(
          args.locale,
          "career.sim_session.start_notice",
          "이 포지션과 이력 정보를 분석해볼게요. 분석이 끝나면 다음 준비를 함께 진행할 수 있어요."
        ),
      })
      .select("*")
      .single();
    if (noticeError) throw new Error("Failed to save simulation introduction");
    if (notice)
      args.onMessage?.(toTalentMessageResponse(notice as TalentMessageRow));
    }
    const state: ApplicationSimulation = {
      version: 6,
      progress: "candidate",
      roleName: args.roleName,
      documentName: document?.file_name ?? null,
      status: "running",
      updatedAt: new Date().toISOString(),
      steps: [{ key: "review", status: "running" }],
    };
    const previousOutput = current.state.activity?.outputs[String(current.state.analysisMessageId)];
    const { data: message, error: insertError } = previousOutput ? { data: { id: current.state.analysisMessageId!, created_at: previousOutput.createdAt, content: previousOutput.content }, error: null } : await args.admin
      .from("talent_messages")
      .insert({
        conversation_id: args.conversationId,
        user_id: args.userId,
        role: "assistant",
        content: "",
        message_type: "application_activity",
        payload: {
          activityId: current.state.sessionId,
          view: "analysis",
          runId: args.requestKey,
        },
      })
      .select("*")
      .single();
    if (insertError || !message)
      throw new Error("Failed to save simulation card");
    current = await saveSession(
      store,
      current,
      {
        ...current.state,
        analysisMessageId: Number(message.id),
        applicationUrl:
          typeof args.role.externalJdUrl === "string"
            ? args.role.externalJdUrl
            : undefined,
        activity: {
          ...current.state.activity!,
          outputs: {
            ...current.state.activity!.outputs,
            [message.id]: {
              messageType: SIMULATION_MESSAGE_TYPE,
              createdAt: message.created_at,
              content: message.content,
              payload: state,
            },
          },
        },
      },
      args.requestKey + ":linked"
    );
    args.onMessage?.(current.message);
    args.onMessage?.(
      toTalentMessageResponse({
        ...message,
        message_type: SIMULATION_MESSAGE_TYPE,
        payload: state as unknown as Json,
      } as TalentMessageRow)
    );
    const timeout = AbortSignal.timeout(SIMULATION_TIMEOUT_MS);
    const signal = args.signal
      ? AbortSignal.any([args.signal, timeout])
      : timeout;
    const publish = async (snapshot: ApplicationSimulation) => {
      const content = [
        `Apply with Harper: ${args.roleName}`,
        `Status: ${snapshot.status}`,
        ...snapshot.steps.flatMap((s) =>
          s.result ? [`${s.key}: ${s.result.report}`] : []
        ),
      ].join("\n\n");
      current = await saveSession(
        store,
        current!,
        {
          ...current!.state,
          activity: {
            ...current!.state.activity!,
            outputs: {
              ...current!.state.activity!.outputs,
              [message.id]: {
                messageType: SIMULATION_MESSAGE_TYPE,
                createdAt: message.created_at,
                content,
                payload: snapshot,
              },
            },
          },
        },
        `${args.requestKey}:progress:${crypto.randomUUID()}`
      );
      args.onMessage?.(current.message);
      args.onMessage?.(
        toTalentMessageResponse({
          ...message,
          message_type: SIMULATION_MESSAGE_TYPE,
          content,
          payload: snapshot as unknown as Json,
        } as TalentMessageRow)
      );
    };
    const progress = async (
      nextPhase: NonNullable<ApplicationSimulation["progress"]>
    ) => {
      phase = nextPhase;
      state.progress = nextPhase;
      console.info("[application-preparation] stage", JSON.stringify({ sessionMessageId: current!.messageId, phase, durationMs: Date.now() - startedAt }));
      state.updatedAt = new Date().toISOString();
      await publish(structuredClone(state));
    };
    await progress("candidate");
    const [memorySnapshot, userProfile] = await Promise.all([
      fetchTalentContextPromptSnapshot({
        admin: args.admin,
        userId: args.userId,
        query: args.roleName,
        memoryTokenBudget: 4000,
      }),
      fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    ]);
    const candidate = [
      simulationProfileSnapshot(profile),
      JSON.stringify({
        name: userProfile?.name,
        email: userProfile?.email,
        phone: userProfile?.phone_number,
        links: userProfile?.resume_links,
      }),
      renderTalentContextPrompt(memorySnapshot),
    ].join("\n\n");
    signal.throwIfAborted();
    await progress("role");
    const savedRole = await (args.loadSavedRole ?? (async () => args.role))();
    const company =
      typeof savedRole.company === "string"
        ? savedRole.company
        : (savedRole.company as { name?: string } | undefined)?.name;
    const [jdSource, research] = await Promise.all([
      savedRole.description && !email
        ? Promise.resolve({
            status: "unavailable",
            reason: "Saved JD supplied.",
          })
        : readSimulationJdSource(args.role.externalJdUrl, (url) =>
            executeSharedOpenUrl({
              admin: args.admin,
              input: { url, maxMarkdownChars: 30000 },
            })
          ),
      company
        ? executeSharedWebSearch(
            {
              query: `${company} company official products mission`,
              maxResults: 3,
            },
            { admin: args.admin }
          ).catch(() => ({
            status: "unavailable",
            reason:
              "Company research could not be completed; use saved company context.",
          }))
        : Promise.resolve({
            status: "unavailable",
            reason: "Company not identified",
          }),
    ]);
    let role = await buildSimulationRoleInput(
      args.roleName,
      jdSource,
      async () => savedRole
    );
    if (email) {
      // Read the live JD and inventory before proposing any changes in email.
      if (jdSource.status === "read") role += "\nLive JD:\n" + JSON.stringify(jdSource);
      if (!current.state.applicationInspection) {
        current = await saveSession(store, current, { ...current.state,
          applicationUrl: String(args.role.externalJdUrl ?? ""),
          applicationInspection: { status: "queued", runId: crypto.randomUUID() },
        }, args.requestKey + ":inspection");
      }
      await runApplicationInspection(store, current.messageId, inspectApplicationForm);
      current = (await sessionOperation({ ...store, operation: "read", messageId: current.messageId }))!;
      if (["queued", "running"].includes(current.state.applicationInspection?.status ?? ""))
        return { ok: true, preparationPending: true, sessionMessageId: current.messageId };
    }
    signal.throwIfAborted();
    await progress("suggestions");
    state.suggestions = await writeApplicationSuggestions({
      admin: args.admin,
      userId: args.userId,
      candidate,
      resume,
      role: role + "\nCompany research:\n" + JSON.stringify(research),
      application: email ? applicationFormText(current.state.applicationForm) : JSON.stringify({ status: "pending", url: current.state.applicationUrl, instruction: "Application requirements are being inspected separately. Focus this first batch on meaningful resume improvements and important role-related experience gaps. Do not ask about application fields or draft additional materials before they are observed." }),
      language: getCareerPromptLanguageName(args.locale),
      model: args.textChatModel,
      signal,
    });
    state.status = "completed";
    state.updatedAt = new Date().toISOString();
    state.steps = [
      {
        key: "review",
        status: "completed",
        result: { summary: "Application suggestions prepared", report: "" },
      },
    ];
    await publish(state);
    const result = state;
    let prepared = finishSimulationAnalysis(
      current!.state,
      result,
      Number(message.id)
    );
    if (prepared.actions.length)
      prepared = askApplicationInput(
        prepared,
        {
          purpose: "suggestions",
          items: prepared.actions.map((a) => ({ actionId: a.id })),
        },
        args.requestKey + ":suggestions"
      );

    if (!email) prepared.applicationInspection = { status: "queued", runId: crypto.randomUUID() };
    if (prepared.activity) delete prepared.activity.preparationRequest;
    const saved = await saveSession(
      store,
      current,
      prepared,
      args.requestKey + ":result"
    );
    current = saved;
    args.onMessage?.(saved.message);
    const inspect = async () => {
      await runApplicationInspection(store, saved.messageId, inspectApplicationForm);
    };
    if (email) { /* Inspection already persisted before suggestions. */ }
    else if (prepared.actions.length && args.scheduleAfter) args.scheduleAfter(inspect);
    else {
      await inspect();
      current = (await sessionOperation({ ...store, operation: "read", messageId: saved.messageId })) ?? saved;
      args.onMessage?.((current as typeof saved).message ?? saved.message);
    }
    return {
      ok: result.status === "completed",
      status: result.status,
      completedStages: result.steps.filter((s) => s.status === "completed")
        .length,
      summary:
        result.steps.at(-1)?.result?.summary ??
        result.steps.findLast((s) => s.result)?.result?.summary ??
        null,
      resultsDisplayedInChat: true,
      awaitingUserInput: prepared.actions.length > 0,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message.trim() : String(error ?? "");
    console.error("[application-preparation] failed", JSON.stringify({
      sessionMessageId: current.messageId, phase, durationMs: Date.now() - startedAt,
      name: error instanceof Error ? error.name : "Error", reason,
      requestAborted: args.signal?.aborted ?? false,
      abortReason: args.signal?.reason instanceof Error ? { name: args.signal.reason.name, message: args.signal.reason.message } : undefined,
    }));
    // A concurrent stop or newer run owns its state; never overwrite it with this run's failure.
    const latest = await sessionOperation({ ...store, operation: "read" });
    if (
      latest?.messageId === current.messageId &&
      latest.state.revision === current.state.revision
    ) {
      const failedState = structuredClone(latest.state);
      const output =
        failedState.activity?.outputs[String(failedState.analysisMessageId)];
      if (output && output.payload && typeof output.payload === "object") {
        const analysis = output.payload as ApplicationSimulation;
        analysis.status = args.signal?.aborted ? "cancelled" : "failed";
        analysis.updatedAt = new Date().toISOString();
        analysis.steps = analysis.steps.map((step) => ({
          ...step,
          status: analysis.status === "cancelled" ? "cancelled" : "failed",
        }));
      }
      const saved = await saveSession(
        store,
        latest,
        {
          ...endSimulationSession(failedState, "failed"),
          analysisStatus: args.signal?.aborted ? "cancelled" : "failed",
          lastActivityAt: new Date().toISOString(),
        },
        args.requestKey + ":failure"
      );
      args.onMessage?.(saved.message);
    }
    return {
      ok: false,
      status: args.signal?.aborted ? "cancelled" : "failed",
      startCardDisplayed: true,
      preparationStarted: true,
      reason: reason || (args.signal?.aborted ? "The request connection was interrupted during preparation." : "Preparation stopped before suggestions were produced."),
      failedStage: phase,
      applicationUrl: current.state.applicationUrl,
    };
  }
}

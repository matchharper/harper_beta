import { createPreparation } from "./preparation";
import { executeSharedOpenUrl } from "@/lib/agentTools/web";
import { readSimulationJdSource, buildSimulationRoleInput } from "./jdSource";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { createSimulationSession, finishSimulationAnalysis } from "./session";
import { sessionOperation, saveSession } from "./sessionStore";

import { completeSimulationStage, SIMULATION_TIMEOUT_MS } from "./completion";

import {
  fetchTalentDocuments,
  fetchTalentDocument,
} from "@/lib/talentOnboarding/documentStore";
import { fetchTalentStructuredProfile } from "@/lib/talentOnboarding/profileStore";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
  type TalentMessageResponse,
} from "@/lib/talentOnboarding/models";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { Json } from "@/types/database.types";
import {
  SIMULATION_MESSAGE_TYPE,
  LIGHT_SIMULATION_STEPS,
  type ApplicationSimulation,
} from "./types";
import { simulationProfileSnapshot } from "./profileSnapshot";
import { runSimulationWorkflow } from "./workflow";

export async function executeApplicationSimulation(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  documentId?: string;
  profileOnly?: boolean;
  roleName: string;
  roleRef: string;
  requestKey: string;
  startOfferId?: number;
  role: Record<string, unknown>;
  loadSavedRole?: () => Promise<Record<string, unknown>>;
  locale?: string | null;
  signal?: AbortSignal;
  onMessage?: (message: TalentMessageResponse) => void;
}) {
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
  let current = await sessionOperation({ ...store, operation: "read" });
  if (current?.state.status === "active") {
    if (
      args.startOfferId &&
      current.state.activity?.offerId === args.startOfferId
    )
      return {
        ok: true,
        alreadyStarted: true,
        status: current.state.analysisStatus,
      };
    if (
      current.state.roleRef !== args.roleRef ||
      current.state.documentId !== (document?.id ?? null)
    )
      return {
        ok: false,
        reason:
          "A different simulation is active. Ask whether to switch, then end the current session before retrying.",
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
    if (!args.startOfferId) throw new Error("Start card required");
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
          offerId: args.startOfferId!,
          outputs: {},
          batches: [],
        },
      },
    });
  }
  if (!current) throw new Error("Could not start simulation session");
  if (args.startOfferId && !current.created)
    return {
      ok: true,
      alreadyStarted: true,
      status: current.state.analysisStatus,
    };
  args.onMessage?.(current.message);
  try {
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
    const state: ApplicationSimulation = {
      version: 4,
      roleName: args.roleName,
      documentName: document?.file_name ?? null,
      status: "running",
      updatedAt: new Date().toISOString(),
      steps: LIGHT_SIMULATION_STEPS.map((key) => ({ key, status: "pending" })),
    };
    const { data: message, error: insertError } = await args.admin
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
        applicationUrl: typeof args.role.externalJdUrl === "string" ? args.role.externalJdUrl : undefined,
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
    // A bounded snapshot is frozen once; later stages use exactly these same facts.
    const bounded = (text: string, limit: number) =>
      text.length <= limit
        ? text
        : `${text.slice(0, limit)}\n[Source truncated; absence beyond this point is unknown.]`;
    const jdSource = await readSimulationJdSource(
      args.role.externalJdUrl,
      (url) =>
        executeSharedOpenUrl({
          admin: args.admin,
          input: { url, maxMarkdownChars: 20000 },
        })
    );
    signal?.throwIfAborted();
    const result = await runSimulationWorkflow({
      state,
      signal,
      input: {
        role: await buildSimulationRoleInput(
          args.roleName,
          jdSource,
          args.loadSavedRole ?? (async () => args.role)
        ),
        candidate: bounded(simulationProfileSnapshot(profile), 60000),
        resume: resume
          ? bounded(resume, 40000)
          : "No resume selected or available. Evaluate the profile and disclose this limitation.",
        language: getCareerPromptLanguageName(args.locale),
      },
      complete: completeSimulationStage,
      publish: async (snapshot) => {
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
      },
    });
    const saved = await saveSession(
      store,
      current,
      finishSimulationAnalysis(current.state, result, Number(message.id)),
      args.requestKey + ":result"
    );
    args.onMessage?.(saved.message);
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
    };
  } catch (error) {
    // A concurrent stop or newer run owns its state; never overwrite it with this run's failure.
    const latest = await sessionOperation({ ...store, operation: "read" });
    if (
      latest?.messageId === current.messageId &&
      latest.state.revision === current.state.revision
    ) {
      const saved = await saveSession(
        store,
        latest,
        {
          ...latest.state,
          analysisStatus: args.signal?.aborted ? "cancelled" : "failed",
          lastActivityAt: new Date().toISOString(),
        },
        args.requestKey + ":failure"
      );
      args.onMessage?.(saved.message);
    }
    throw error;
  }
}

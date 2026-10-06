import { simulationSchemaForInput } from "./structured";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import { GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";
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
  SIMULATION_STEPS,
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
  role: Record<string, unknown>;
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
  const state: ApplicationSimulation = {
    version: 2,
    roleName: args.roleName,
    documentName: document?.file_name ?? null,
    status: "running",
    updatedAt: new Date().toISOString(),
    steps: SIMULATION_STEPS.map((key) => ({ key, status: "pending" })),
  };
  const { data: message, error: insertError } = await args.admin
    .from("talent_messages")
    .insert({
      conversation_id: args.conversationId,
      user_id: args.userId,
      role: "assistant",
      content: `Simulate: ${args.roleName}`,
      message_type: SIMULATION_MESSAGE_TYPE,
      payload: state as unknown as Json,
    })
    .select("*")
    .single();
  if (insertError || !message)
    throw new Error("Failed to save simulation card");
  args.onMessage?.(toTalentMessageResponse(message as TalentMessageRow));
  const timeout = AbortSignal.timeout(180_000);
  const signal = args.signal
    ? AbortSignal.any([args.signal, timeout])
    : timeout;
  // A bounded snapshot is frozen once; later stages use exactly these same facts.
  const bounded = (text: string, limit: number) =>
    text.length <= limit
      ? text
      : `${text.slice(0, limit)}\n[Source truncated; absence beyond this point is unknown.]`;
  const result = await runSimulationWorkflow({
    state,
    signal,
    input: {
      role: bounded(JSON.stringify(args.role), 40000),
      candidate: bounded(simulationProfileSnapshot(profile), 60000),
      resume: resume
        ? bounded(resume, 40000)
        : "No resume selected or available. Evaluate the profile and disclose this limitation.",
      language: getCareerPromptLanguageName(args.locale),
    },
    complete: ({ key, system, input, signal }) =>
      runTalentAssistantCompletion({
        primaryModel: GPT_56_LUNA_MODEL,
        abortSignal: signal,
        openAIResponsesReasoningEffort: "medium",
        temperature: 0.2,
        maxTokens: 6500,
        jsonMode: true,
        jsonSchema: {
          name: "application_simulation_stage",
          strict: true,
          schema: simulationSchemaForInput(key, JSON.parse(input)),
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: input },
        ],
        usageLabel: `career_tool:simulate_application:${key}`,
      }),
    publish: async (snapshot) => {
      const content = [
        `Simulate: ${args.roleName}`,
        `Status: ${snapshot.status}`,
        ...snapshot.steps.flatMap((s) =>
          s.result ? [`${s.key}: ${s.result.report}`] : []
        ),
      ].join("\n\n");
      const { data, error: updateError } = await args.admin
        .from("talent_messages")
        .update({ payload: snapshot as unknown as Json, content })
        .eq("id", message.id)
        .eq("user_id", args.userId)
        .eq("conversation_id", args.conversationId)
        .select("*")
        .single();
      if (updateError || !data)
        throw new Error("Failed to save simulation progress");
      args.onMessage?.(toTalentMessageResponse(data as TalentMessageRow));
    },
  });
  return {
    ok: result.status === "completed",
    status: result.status,
    completedStages: result.steps.filter((s) => s.status === "completed")
      .length,
    summary:
      result.steps[2].result?.summary ??
      result.steps.findLast((s) => s.result)?.result?.summary ??
      null,
    resultsDisplayedInChat: true,
    documentsChanged: false,
    applicationSubmitted: false,
  };
}

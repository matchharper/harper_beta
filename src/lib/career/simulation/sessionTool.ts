import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import type { SimulationSession } from "./session";
export const SIMULATION_SESSION_TOOL = "manage_simulation_session";

export function applicationSessionToolResult(
  session: SimulationSession,
  action: string
) {
  return {
    ok: true,
    sessionStatus: session.status,
    ...(session.status === "ended" ? {
      preparationSaved: true,
      canResume: !!session.preparation && !!session.activity && session.analysisStatus === "completed",
      roleName: session.roleName,
      sourceDocumentId: session.documentId,
      submissionPerformedByThisAction: false,
    } : {}),
    ...(action === "request_switch"
      ? { awaitingWrapUpConfirmation: true, modeChanged: false }
      : {}),
    ...(session.status === "ended"
      ? {
          progressRecorded: false,
          assistantInstruction:
            "The preparation was saved and the mode ended; ending performs no submission. If the user requested another task, continue it in this same turn using the current tools and capability catalog; load a deferred capability when needed. An already clear request needs no further wrap-up confirmation. Help the user understand what work remains available, how to return to it when canResume is true (by asking Harper), and the next step. If presenting a new application start card, carry this explanation in its introduction. If they only asked to stop, acknowledge the outcome briefly. Keep the explanation scoped to this preparation. This receipt describes saving/leaving it; it does not establish the submission status of this or other applications.",
          skipCommonAssistantInstruction: true,
          ...(session.endReason === "switched" && session.switchRequest
            ? {
                nextUserRequest: session.switchRequest.text,
              }
            : {}),
        }
      : {}),
  };
}
export const APPLICATION_COMMON_TOOL_NAMES = [
  "read_talent_context",
  "write_talent_context",
  "update_talent_profile",
] as const;
export const SIMULATION_TOOL_NAMES: readonly string[] = [
  ...APPLICATION_COMMON_TOOL_NAMES,
  SIMULATION_SESSION_TOOL,
  "manage_application_suggestions",
  "ready_for_role",
  "save_application",
  "apply_for_role",
  "get_role_context",
  "get_internal_roles",
  "read_recommended_opportunities",
  "list_documents",
  "read_document",
  "upsert_document",
  "web_search",
  "open_url",
];
export const savedApplicationSessionTool = {
  name: SIMULATION_SESSION_TOOL,
  description: TOOL_DESCRIPTIONS.manage_simulation_session_saved,
  parameters: {
    type: "object", additionalProperties: false, required: ["action"],
    properties: {
      action: { type: "string", enum: ["list", "resume"] },
      sessionMessageId: { type: "integer", description: "Exact saved preparation from list, required for resume." },
      beforeMessageId: { type: "integer", description: "Read the next older page using nextBeforeMessageId from list." },
    },
  },
};
export const simulationSessionTool = {
  type: "function" as const,
  function: {
    name: SIMULATION_SESSION_TOOL,
    description:
      TOOL_DESCRIPTIONS.manage_simulation_session_active,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: [
            "select",
            "respond",
            "revise_item",
            "update_action",
            "save_fact",
            "remove_fact",
            "propose",
            "add_action",
            "request_switch",
            "cancel_switch",
            "end",
          ],
        },
        reconsiderResponse: { type: "boolean" },
        response: {
          type: "object",
          additionalProperties: false,
          properties: {
            decision: {
              type: "string",
              enum: ["accept", "ignore", "answer", "document", "help", "skip"],
            },
            text: { type: "string" },
            documentId: { type: "string" },
          },
          required: ["decision"],
        },
        actionId: { type: "string" },
        status: {
          type: "string",
          enum: [
            "pending",
            "in_progress",
            "needs_confirmation",
            "completed",
            "skipped",
          ],
        },
        reason: { type: "string" },
        factId: { type: "string" },
        text: { type: "string" },
        title: { type: "string" },
        request: {
          type: "string",
          description: "A natural user request for the proposed next step.",
        },
        endReason: { type: "string", enum: ["user", "switched"] },
        newAction: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "category",
            "title",
            "target",
            "proposal",
            "reason",
            "requirementIds",
            "evidenceIds",
            "needsConfirmation",
            "questions",
            "executionPrompt",
          ],
          properties: {
            id: { type: "string" },
            inputKind: {
              type: "string",
              enum: ["change", "question", "material"],
            },
            linkedActionIds: { type: "array", items: { type: "string" } },
            category: {
              type: "string",
              enum: [
                "content",
                "wording",
                "structure",
                "consistency",
                "materials",
              ],
            },
            title: { type: "string" },
            target: { type: "string" },
            proposal: { type: "string" },
            originalText: { type: "string" },
            suggestedText: { type: "string" },
            edits: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["target", "originalText", "suggestedText"],
                properties: {
                  target: { type: "string" },
                  originalText: { type: "string" },
                  suggestedText: { type: "string" },
                },
              },
            },
            reason: { type: "string" },
            requirementIds: { type: "array", items: { type: "string" } },
            evidenceIds: { type: "array", items: { type: "string" } },
            needsConfirmation: { type: "boolean" },
            questions: { type: "array", items: { type: "string" } },
            executionPrompt: { type: "string" },
          },
        },
      },
    },
  },
};

// Preparation suggestions and document writes each have one owner. Keep the legacy
// action graph available only to older sessions without preparation state.
export const APPLICATION_PREPARATION_SESSION_ACTIONS: readonly string[] = [
  "list",
  "resume",
  "inspect",
  "save_fact",
  "remove_fact",
  "request_switch",
  "cancel_switch",
  "end",
];
export const applicationPreparationSessionTool = {
  type: "function" as const,
  function: {
    name: SIMULATION_SESSION_TOOL,
    description:
      TOOL_DESCRIPTIONS.manage_simulation_session_preparation,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: APPLICATION_PREPARATION_SESSION_ACTIONS,
        },
        factId: { type: "string" },
        sessionMessageId: { type: "integer" },
        beforeMessageId: { type: "integer" },
        text: { type: "string" },
        request: { type: "string" },
        endReason: { type: "string", enum: ["user", "switched"] },
      },
    },
  },
};

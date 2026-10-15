import type { SimulationSession } from "./session";
export const SIMULATION_SESSION_TOOL = "manage_simulation_session";

export function applicationSessionToolResult(
  session: SimulationSession,
  action: string
) {
  return {
    ok: true,
    sessionStatus: session.status,
    ...(action === "request_switch"
      ? { awaitingWrapUpConfirmation: true, modeChanged: false }
      : {}),
    ...(session.status === "ended"
      ? {
          progressRecorded: false,
          assistantInstruction:
            "Apply with Harper mode has ended. If the latest user message also requests another task, continue it in this same turn using the tools and capability catalog offered in the next completion. Load a deferred capability when needed. Do not treat the previous mode's tool list as a permanent limitation or ask the user to repeat an already clear request. If they only asked to stop, briefly confirm that it ended.",
          skipCommonAssistantInstruction: true,
          ...(session.endReason === "switched" && session.switchRequest
            ? {
                nextUserRequest: session.switchRequest.text,
                assistantInstruction:
                  "The user confirmed ending Apply with Harper mode. Continue their saved nextUserRequest in this same turn using the tools and capability catalog actually offered in the next completion. Load a deferred capability if needed. Do not deny an available capability based on the previous mode, ask the user to repeat the request, or claim work is complete before its tool succeeds.",
                skipCommonAssistantInstruction: true,
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
  "apply_for_role",
  "get_role_context",
  "get_internal_roles",
  "read_recommended_opportunities",
  "list_documents",
  "read_document",
  "generate_resume",
];
export const simulationSessionTool = {
  type: "function" as const,
  function: {
    name: SIMULATION_SESSION_TOOL,
    description:
      "Manage the current application-simulation session: select an action, record progress backed by the conversation, correct session facts, propose one next action, add a user-requested action or end the session. Does not edit documents or save long-term memory. Only use for the current active session. For preparation mode, use respond with actionId and response to save the user’s explicit decision or answer, Use ordinary chat to write revised resume or cover letter text. Use revise_item with newAction to update an existing preparation item by its stable ID or add a user-requested item. Existing answers are retained; reconsiderResponse=true clears only that item’s answer when a correction invalidates it. Documents are checked for ownership. These operations do not submit applications. For propose, supply actionId, title, reason and request. For update_action, supply actionId, status and an evidence-based reason. completed means the action was addressed through a successful edit or useful bullet/direction suggestion; it does not require the user to have applied the suggestion. The reason records the actual edit or concrete suggestion and distinguishes guidance from an applied change. For save_fact, supply text and use factId only when correcting an existing fact. For request_switch, supply the requested task outside this mode's scope or available capabilities in request, even if it concerns the same role and wait for the user to confirm ending; cancel_switch clears a declined switch. For end, text may contain a concise evidence-grounded closing summary. Ending releases the current mode; role progress archival is currently disabled. After a confirmed switch ends, continue the saved new request using the normal tools. After a change, continue the conversation from the returned state.",
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
      "Manage the active application's lifecycle or correct its confirmed session facts. save_fact records a confirmed fact; factId identifies a fact to correct or remove. Use shared Profile/Brief/Memory tools for durable user information. request_switch records the user's next task and waits for confirmation to leave this application; cancel_switch keeps the application active. end releases the mode, then continue an already confirmed switch in the same turn. Suggestions are managed only with manage_application_suggestions; resume changes are saved with ready_for_role.",
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
        text: { type: "string" },
        request: { type: "string" },
        endReason: { type: "string", enum: ["user", "switched"] },
      },
    },
  },
};

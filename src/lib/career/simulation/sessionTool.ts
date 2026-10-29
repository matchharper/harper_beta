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
  "apply_for_role",
  "get_role_context",
  "get_internal_roles",
  "read_recommended_opportunities",
  "list_documents",
  "read_document",
  "generate_resume",
  "write_document",
  "web_search",
  "open_url",
];
export const savedApplicationSessionTool = {
  name: SIMULATION_SESSION_TOOL,
  description: "Find saved Apply with Harper preparations with action=list, then resume one on the user's request with action=resume and its sessionMessageId. Returns a compact index, not document bodies. Resuming restores saved answers, suggestions and documents in this conversation; it does not submit or restart a website browser. End an active application first when the user asks to switch. Use before starting a new preparation when the user wants to continue earlier work.",
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
      "Manage the current application-simulation session: select an action, record progress backed by the conversation, correct session facts, propose one next action, add a user-requested action or end the session. Does not edit documents or save long-term memory. Only use for the current active session. For preparation mode, use respond with actionId and response to save the user’s explicit decision or answer, Use write_document to save ordinary documents and cover letters needed by this delegated application; no extra permission question is needed. Show the saved document UI, not a long draft in chat. web_search/open_url can verify public information within this mode. Use revise_item with newAction to update an existing preparation item by its stable ID or add a user-requested item. Existing answers are retained; reconsiderResponse=true clears only that item’s answer when a correction invalidates it. Documents are checked for ownership. These operations do not submit applications. For propose, supply actionId, title, reason and request. For update_action, supply actionId, status and an evidence-based reason. completed means the action was addressed through a successful edit or useful bullet/direction suggestion; it does not require the user to have applied the suggestion. The reason records the actual edit or concrete suggestion and distinguishes guidance from an applied change. For save_fact, supply text and use factId only when correcting an existing fact. A clear instruction to stop or start another task authorizes end directly; a recorded switch request is optional and needs no separate confirmation. Use request_switch only for a proposed change the user has not chosen; cancel_switch clears it. For end, text may contain a concise evidence-grounded closing summary. Ending preserves the session and documents without submitting. Continue a requested next task using the normal tools in the same turn. After a change, continue the conversation from the returned state.",
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
      "Manage application preparations. list returns a compact index of saved preparations; resume restores an exact sessionMessageId after ending any other active application. inspect checks the current application's live form and access again, including after a failed or stale inspection; it waits for the result, preserves answers and documents, and never fills or submits. Review its requirements and call ready_for_role again before applying. end saves the current preparation and leaves the mode WITHOUT submitting; saved answers, suggestions and documents can be resumed later. It stops an active website browser; resuming preparation does not restart that browser or repeat a submission. A clear request to stop or start another application authorizes end directly, without request_switch or another confirmation. request_switch is only for a proposed change the user has not chosen; cancel_switch keeps this application active. Continue a requested switch in the same turn. save_fact records a confirmed session fact; factId identifies a correction/removal. Use shared Profile/Brief/Memory tools for durable user information, manage_application_suggestions for suggestions and ready_for_role for resume edits.",
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

import { applicationAnswerContext, unbatchedApplicationResponses } from "./applicationAnswerContext";
import { applicationFormSchema } from "./applicationForm";
import { browserStateSchema, browserQuestionRefSchema } from "./applicationBrowser";
import {
  preparationSchema,
  preparationResponseSchema,
  createPreparation,
  respondToPreparation,
} from "./preparation";
import { z } from "zod";
import type { ApplicationSimulation } from "./types";

export const SESSION_TYPE = "simulation_session";
export const ACTION_CARD_TYPE = "simulation_action";
export const SESSION_IDLE_MS = 60 * 60 * 1000;
export const actionStatusSchema = z.enum([
  "pending",
  "in_progress",
  "needs_confirmation",
  "completed",
  "skipped",
]);
export const actionSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "content",
    "wording",
    "structure",
    "consistency",
    "materials",
  ]),
  title: z.string().min(1),
  target: z.string(),
  proposal: z.string(),
  originalText: z.string().optional(),
  suggestedText: z.string().optional(),
  edits: z
    .array(
      z.object({
        target: z.string(),
        originalText: z.string(),
        suggestedText: z.string(),
      })
    )
    .optional(),
  reason: z.string(),
  requirementIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  needsConfirmation: z.boolean(),
  questions: z.array(z.string()),
  executionPrompt: z.string(),
  documentPurpose: z.enum(["final_resume", "supporting"]).optional(),
  documentId: z.string().optional(),
  documentName: z.string().optional(),
  documentFingerprint: z.string().optional(),
  inputKind: z.enum(["change", "question", "material", "choice"]).optional(),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
      })
    )
    .optional(),
  linkedActionIds: z.array(z.string()).optional(),
});
export const sessionSchema = z.object({
  version: z.literal(1),
  preparation: preparationSchema.optional(),
  browser: browserStateSchema.optional(),
  applicationUrl: z.string().optional(),
  applicationForm: applicationFormSchema.optional(),
  activity: z
    .object({
      version: z.literal(1),
      offerId: z.number(),
      outputs: z.record(
        z.string(),
        z.object({
          messageType: z.string(),
          createdAt: z.string(),
          content: z.string(),
          payload: z.unknown(),
        })
      ),
      batches: z.array(
        z.object({
          id: z.string(),
          key: z.string(),
          purpose: z.string(),
          browser: browserQuestionRefSchema.optional(),
          introduction: z.string().optional(),
          review: z.object({ id: z.string(), version: z.number().int().positive(), markdown: z.string() }).optional(),
          introMessageId: z.number().optional(),
          itemIds: z.array(z.string()),
          items: z.array(actionSchema).optional(),
          status: z.enum(["waiting", "submitted", "cancelled"]),
          continuation: z.enum(["pending", "running", "done", "failed"]),
          responses: z.record(z.string(), preparationResponseSchema),
          createdAt: z.string(),
          continuationStartedAt: z.string().optional(),
        })
      ),
    })
    .optional(),
  sessionId: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(["active", "ended"]),
  endReason: z
    .enum(["user", "completed", "empty", "expired", "switched"])
    .nullable(),
  startedAt: z.string(),
  lastActivityAt: z.string(),
  endedAt: z.string().nullable(),
  locale: z.string().optional(),
  closingSummary: z.string().optional(),
  switchRequest: z
    .object({ text: z.string(), messageId: z.number() })
    .nullable()
    .optional(),
  roleRef: z.string(),
  roleName: z.string(),
  documentId: z.string().nullable(),
  documentName: z.string().nullable(),
  documentOriginType: z.string().nullable().optional(),
  analysisMessageId: z.number().nullable(),
  analysisStatus: z.enum(["running", "completed", "failed", "cancelled"]),
  analysisStartedAt: z.string(),
  actions: z.array(
    actionSchema.extend({
      status: actionStatusSchema,
      resolution: z.string(),
      evidenceMessageId: z.number().nullable(),
    })
  ),
  facts: z.array(
    z.object({ id: z.string(), text: z.string(), messageId: z.number() })
  ),
  currentActionId: z.string().nullable(),
  proposedActionId: z.string().nullable(),
  proposal: z
    .object({
      actionId: z.string(),
      title: z.string(),
      reason: z.string(),
      request: z.string(),
    })
    .nullable(),
  requirements: z.array(z.unknown()),
  diagnoses: z.array(z.unknown()),
});
export type SimulationSession = z.infer<typeof sessionSchema>;
export type SessionAction = SimulationSession["actions"][number];
export type SimulationCardRef = {
  sessionMessageId: number;
  revision: number;
  actionId: string;
};
export const cardRequestSchema = z
  .object({
    sessionMessageId: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    actionId: z.string().optional(),
    action: z.enum(["select", "select_analysis", "skip", "end", "start"]),
    documentId: z.string().nullable().optional(),
    analysisMessageId: z.number().int().positive().optional(),
  })
  .strict();
export type SimulationCardRequest = z.infer<typeof cardRequestSchema>;
export function parseSimulationSession(value: unknown) {
  const r = sessionSchema.safeParse(value);
  return r.success ? r.data : undefined;
}
export function parseSimulationCard(
  value: unknown
): SimulationCardRef | undefined {
  const r = z
    .object({
      sessionMessageId: z.number().int().positive(),
      revision: z.number().int().positive(),
      actionId: z.string(),
    })
    .safeParse(value);
  return r.success ? r.data : undefined;
}
export function createSimulationSession(
  args: {
    locale?: string;
    roleRef: string;
    roleName: string;
    documentId: string | null;
    documentName: string | null;
    documentOriginType?: string | null;
  },
  now = new Date().toISOString()
): SimulationSession {
  return {
    ...args,
    version: 1,
    sessionId: crypto.randomUUID(),
    revision: 1,
    status: "active",
    endReason: null,
    startedAt: now,
    lastActivityAt: now,
    endedAt: null,
    analysisMessageId: null,
    analysisStatus: "running",
    analysisStartedAt: now,
    actions: [],
    facts: [],
    currentActionId: null,
    proposedActionId: null,
    proposal: null,
    requirements: [],
    diagnoses: [],
  };
}
export function endSimulationSession(
  s: SimulationSession,
  reason: SimulationSession["endReason"],
  now = new Date().toISOString()
): SimulationSession {
  return {
    ...s,
    status: "ended",
    ...(s.browser && ["queued", "running", "waiting"].includes(s.browser.status) ? {browser: {...s.browser, status: "cancelled" as const}} : {}),
    endReason: reason,
    endedAt: now,
    ...(s.activity
      ? {
          activity: {
            ...s.activity,
            batches: s.activity.batches.map((b) =>
              b.status === "waiting"
                ? { ...b, status: "cancelled" as const }
                : b
            ),
          },
        }
      : {}),
    proposal: null,
    currentActionId: null,
  };
}
export function finishSimulationAnalysis(
  s: SimulationSession,
  analysis: ApplicationSimulation,
  messageId: number,
  now = new Date().toISOString()
): SimulationSession {
  const review = analysis.steps.find((step) => step.key === "review")?.result
    ?.data;
  const role = analysis.steps[0].result?.data;
  const comparison =
    review?.kind === "review" && review.comparison
      ? review.comparison
      : analysis.steps.find((step) => step.key === "comparison")?.result?.data;
  const next: SimulationSession = {
    ...s,
    analysisMessageId: messageId,
    analysisStatus: analysis.status,
    lastActivityAt: now,
    requirements: role?.kind === "role" ? role.requirements : [],
    diagnoses: comparison?.kind === "comparison" ? comparison.diagnoses : [],
    actions:
      review?.kind === "review"
        ? review.actions.map((a) => ({
            ...a,
            status: a.needsConfirmation ? "needs_confirmation" : "pending",
            resolution: "",
            evidenceMessageId: null,
          }))
        : [],
    currentActionId: null,
    proposedActionId: null,
    proposal: null,
  };
  if (analysis.version >= 3 && analysis.status === "completed") {
    next.preparation = createPreparation();
    next.preparation.currentItemId = next.actions[0]?.id ?? null;
    if (next.activity) next.preparation.showInputs = false;
  }
  return !next.preparation &&
    analysis.status === "completed" &&
    !next.actions.length
    ? endSimulationSession(next, "empty", now)
    : next;
}
export const sessionMutationSchema = z
  .object({
    action: z.enum([
      "select",
      "respond",
      "revise_item",
      "show_inputs",
      "generate_draft",
      "update_action",
      "save_fact",
      "remove_fact",
      "propose",
      "nudge",
      "add_action",
      "request_switch",
      "cancel_switch",
      "end",
    ]),
    actionId: z.string().optional(),
    response: preparationResponseSchema.optional(),
    reconsiderResponse: z.boolean().optional(),
    status: actionStatusSchema.optional(),
    reason: z.string().max(3000).optional(),
    factId: z.string().optional(),
    text: z.string().max(6000).optional(),
    title: z.string().max(300).optional(),
    request: z.string().max(1500).optional(),
    newAction: actionSchema.optional(),
    endReason: z.enum(["user", "switched"]).optional(),
  })
  .strict();
export type SessionMutation = z.infer<typeof sessionMutationSchema>;
export function mutateSimulationSession(
  s: SimulationSession,
  input: SessionMutation,
  evidenceMessageId: number,
  now = new Date().toISOString()
): SimulationSession {
  if (s.status !== "active") throw new Error("Session has ended");
  if (s.analysisStatus === "running" && input.action !== "end")
    throw new Error("Analysis is still running");
  let next = structuredClone(s);
  if (
    next.preparation &&
    ["select", "update_action", "propose", "nudge", "add_action"].includes(
      input.action
    )
  )
    throw new Error("Use preparation responses and show_inputs in this mode");
  if (input.action === "respond") {
    if (!next.preparation || !input.actionId || !input.response)
      throw new Error("Preparation response required");
    next.preparation = respondToPreparation(
      next.preparation,
      next.actions,
      input.actionId,
      { ...input.response, evidenceMessageId }
    );
  }
  if (input.action === "revise_item") {
    const p = next.preparation;
    const item = input.newAction;
    if (!p || !item?.inputKind || p.generation.status === "running")
      throw new Error("Preparation item unavailable");
    if (
      item.requirementIds.some(
        (id) => !next.requirements.some((r) => (r as { id?: string }).id === id)
      )
    )
      throw new Error("Unknown requirement");
    const index = next.actions.findIndex((a) => a.id === item.id);
    const previous = next.actions[index];
    if (
      item.linkedActionIds?.some(
        (id) => id === item.id || !next.actions.some((a) => a.id === id)
      )
    )
      throw new Error("Unknown linked item");
    if (
      previous &&
      previous.inputKind !== item.inputKind &&
      !input.reconsiderResponse
    )
      throw new Error("Changing item kind requires reconsideration");
    const updated = {
      ...item,
      status: previous?.status ?? ("pending" as const),
      resolution: previous?.resolution ?? "",
      evidenceMessageId,
    };
    if (index >= 0) next.actions[index] = updated;
    else next.actions.push(updated);
    if (input.reconsiderResponse) delete p.responses[item.id];
    p.inputRevision++;
    p.approvedVersion = null;
    p.finalDocumentId = null;
    p.currentItemId = item.id;
    p.showInputs = true;
  }
  if (input.action === "show_inputs") {
    if (!next.preparation) throw new Error("Preparation unavailable");
    if (input.actionId && !next.actions.some((a) => a.id === input.actionId))
      throw new Error("Unknown item");
    next.preparation.showInputs = true;
    if (input.actionId) next.preparation.currentItemId = input.actionId;
  }
  if (next.preparation && ["save_fact", "remove_fact"].includes(input.action)) {
    if (next.preparation.generation.status === "running")
      throw new Error("Draft generation is running");
    next.preparation.inputRevision++;
    next.preparation.approvedVersion = null;
    next.preparation.finalDocumentId = null;
  }
  const action = next.actions.find((a) => a.id === input.actionId);
  if (
    ["select", "update_action", "propose", "nudge"].includes(input.action) &&
    !action
  )
    throw new Error("Unknown action");
  if (input.action === "end") {
    if (
      next.switchRequest &&
      next.switchRequest.messageId === evidenceMessageId
    )
      throw new Error(
        "Wait for the user's reply before ending for a proposed switch"
      );
    if (input.text?.trim()) next.closingSummary = input.text.trim();
    return endSimulationSession(next, input.endReason ?? "user", now);
  }
  if (input.action === "request_switch") {
    if (!input.request?.trim())
      throw new Error("The user's new request is required");
    next.switchRequest = {
      text: input.request.trim(),
      messageId: evidenceMessageId,
    };
    next.proposal = null;
  }
  if (input.action === "cancel_switch") next.switchRequest = null;
  if (input.action === "select") {
    if (action!.status === "completed" || action!.status === "skipped")
      throw new Error("Action already resolved");
    next.currentActionId = action!.id;
    action!.status = action!.needsConfirmation
      ? "needs_confirmation"
      : "in_progress";
    next.proposal = null;
  }
  if (input.action === "update_action") {
    if (!input.status || !input.reason?.trim())
      throw new Error("A status and evidence-based reason are required");
    action!.status = input.status;
    action!.resolution = input.reason;
    action!.evidenceMessageId = evidenceMessageId;
    if (next.proposal?.actionId === action!.id) next.proposal = null;
  }
  if (input.action === "save_fact") {
    if (!input.text?.trim()) throw new Error("Fact text is required");
    const id = input.factId ?? crypto.randomUUID();
    if (input.factId && !next.facts.some((f) => f.id === id))
      throw new Error("Unknown fact");
    next.facts = next.facts
      .filter((f) => f.id !== id)
      .concat({ id, text: input.text, messageId: evidenceMessageId });
  }
  if (input.action === "remove_fact") {
    if (!next.facts.some((f) => f.id === input.factId))
      throw new Error("Unknown fact");
    next.facts = next.facts.filter((f) => f.id !== input.factId);
  }
  if (input.action === "nudge") {
    if (["completed", "skipped"].includes(action!.status))
      throw new Error("Action already resolved");
    // Remember a conversational invitation without selecting, completing or rendering a card.
    next.proposedActionId = action!.id;
    next.proposal = null;
  }
  if (input.action === "propose") {
    if (["completed", "skipped"].includes(action!.status))
      throw new Error("Action already resolved");
    if (!input.title?.trim() || !input.reason?.trim() || !input.request?.trim())
      throw new Error("Proposal requires title, reason and request");
    next.proposal = {
      actionId: action!.id,
      title: input.title,
      reason: input.reason,
      request: input.request,
    };
    next.proposedActionId = action!.id;
  }
  if (input.action === "add_action") {
    if (
      !input.newAction ||
      next.actions.some((a) => a.id === input.newAction!.id)
    )
      throw new Error("A new unique action is required");
    next.actions.push({
      ...input.newAction,
      status: "pending",
      resolution: input.reason ?? "",
      evidenceMessageId,
    });
  }
  next.lastActivityAt = now;
  if (
    !next.preparation &&
    next.actions.length &&
    next.actions.every((a) => ["completed", "skipped"].includes(a.status))
  )
    next = endSimulationSession(next, "completed", now);
  return next;
}
// Project current activity state; immutable question snapshots own recorded responses.
export function simulationSessionContext(s: SimulationSession, toolNames?: readonly string[]) {
  return {
    preparation: s.preparation ? { responses: unbatchedApplicationResponses(s), applicationMethod: s.preparation.applicationMethod, finalDocumentId: s.preparation.finalDocumentId } : undefined,
    application: s.browser ? { status: s.browser.status, result: s.browser.result } : undefined,
    questionBatches: applicationAnswerContext(s, true),
    role: s.roleName,
    document: s.documentName,
    workingResume: s.preparation?.workingResume,
    selectedResume: {
      documentId: s.documentId,
      source: s.documentOriginType ?? "uploaded_or_unknown",
      // Enable only when an actual content editor is integrated and exposed in this mode.
      directEditingAvailable: toolNames?.includes("generate_resume"),
    },
    status: s.status,
    endReason: s.endReason,
    analysisStatus: s.analysisStatus,
    requirements: s.requirements,
    applicationForm: s.applicationForm,
    actions: s.actions.map(({ executionPrompt, ...a }) => a),
    facts: s.facts,
    pendingNewRequest: s.switchRequest?.text ?? null,
    currentActionId: s.currentActionId,
    lastProposedActionId: s.proposedActionId,
    currentEvidence: s.diagnoses.filter((d) => {
      const item = d as { requirementId?: string };
      return s.actions
        .find(
          (a) => a.id === (s.preparation?.currentItemId ?? s.currentActionId)
        )
        ?.requirementIds.includes(item.requirementId ?? "");
    }),
  };
}

export function resolveAnalysisCardAction(
  session: SimulationSession,
  request: SimulationCardRequest
) {
  if (
    request.action !== "select_analysis" ||
    session.status !== "active" ||
    session.analysisStatus !== "completed" ||
    request.analysisMessageId !== session.analysisMessageId ||
    request.expectedRevision !== session.revision
  )
    return undefined;
  return session.actions.find(
    (action) =>
      action.id === request.actionId &&
      !["completed", "skipped"].includes(action.status)
  );
}

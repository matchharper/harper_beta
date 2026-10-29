import { browserProgressEntrySchema } from "./browserProgress";
import { applicationReviewSchema } from "./applicationReview";
import { z } from "zod";
import { browserRequestSchema } from "./applicationBrowserActions";
import { applicationBrowserRuntimeRefSchema } from "./applicationBrowserRuntimeRef";

export const APPLY_TO_ROLE = "apply_for_role";
const browserAttemptSchema = z.object({
  id: z.string(),
  status: z.enum([
    "queued",
    "running",
    "waiting",
    "succeeded",
    "failed",
    "uncertain",
    "cancelled",
  ]),
  engine: z.literal("browser-use-agents").optional(),
  managed: z.object({
    workspaceId: z.string().optional(),
    runId: z.string().optional(),
    sessionId: z.string().optional(),
    dispatchStarted: z.boolean().optional(),
    task: z.string().optional(),
    reviewFingerprint: z.string().optional(),
    filePaths: z.array(z.object({ documentId: z.string(), name: z.string(), path: z.string() })).optional(),
    totalCostUsd: z.string().optional(),
  }).optional(),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  environmentId: z.string().optional(),
  driver: applicationBrowserRuntimeRefSchema.optional(),
  pendingRequest: browserRequestSchema.optional(),
  files: z
    .array(
      z.object({
        documentId: z.string(),
        hash: z.string(),
        contentHash: z.string().optional(),
        path: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
  documentId: z.string(),
  documentHash: z.string(),
  url: z.string(),
  purpose: z.string(),
  reviewedApplication: applicationReviewSchema.optional(),
  sourceMessageId: z.number().int().positive().optional(),
  progress: browserProgressEntrySchema.array().max(40).optional(),
  cursor: z.string().optional(),
  usageLoggedCount: z.number().int().nonnegative().optional(),
  leaseUntil: z.string().optional(),
  taskSent: z.boolean().optional(),
  stage: z.string().optional(),
  // Written before releasing any approved website request; never cleared by a later question.
  transmissionAttemptedAt: z.string().optional(),
  failure: z.object({ stage: z.string(), error: z.string() }).optional(),
  recoveryTurnId: z.string().optional(),
  diagnostic: z.object({
    turnId: z.string().optional(),
    status: z.string().optional(),
    error: z.string().optional(),
    items: z.string().optional(),
  }).optional(),
  approval: z
    .object({
      fingerprint: z.string(),
      approved: z.boolean(),
      summary: z.string(),
      requestId: z.string().optional(),
      evidenceMessageId: z.number().optional(),
      executed: z.boolean().optional(),
    })
    .optional(),
  result: z
    .object({
      summary: z.string(),
      url: z.string(),
      evidence: z.string(),
      emailNotice: z.boolean().optional(),
    })
    .optional(),
  resultMessageId: z.number().optional(),
});
export const browserStateSchema = browserAttemptSchema.extend({
  previousAttempts: browserAttemptSchema.omit({ driver: true, files: true, progress: true, pendingRequest: true }).array().optional(),
});
export const browserQuestionRefSchema = z.object({
  runId: z.string(),
  sessionId: z.string(),
  turnId: z.string(),
  callId: z.string(),
  kind: z.enum(["information", "submission", "origin"]),
  origin: z.string().optional(),
  fingerprint: z.string().optional(),
  summary: z.string().optional(),
});
export type ApplicationBrowserState = z.infer<typeof browserStateSchema>;
export const applyToRoleSchema = z
  .object({ purpose: z.string().min(1), restart: z.boolean().optional() })
  .strict();
export const applyToRoleTool = {
  type: "function" as const,
  function: {
    name: APPLY_TO_ROLE,
    description:
      "Fill the current role's public application form using the user's selected final resume and confirmed answers after ready_for_role and authorization to apply. Prepare known required materials first. Reuses an in-progress run; retries a failed attempt when no submission was sent. Returns the recorded outcome when submission succeeded or may have happened. Set restart=true only when the user explicitly requests a NEW attempt knowing that prior outcome; a retry request after a known pre-submission failure needs no extra confirmation. Resuming saved preparation preserves the prior outcome. A saved-stage applied label alone is not a website receipt. New attempts preserve previous outcomes and require fresh approval of the answers and files before website entry and submission. Login/CAPTCHA are unsupported. Yields only while a run or question is pending; otherwise use the returned facts to answer the user.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["purpose"],
      properties: {
        purpose: { type: "string" },
        restart: { type: "boolean", description: "Explicit user authorization for a new attempt despite a confirmed or uncertain prior submission. Does not override running work or grant final submission approval." },
      },
    },
  },
};
export function browserIsExecuting(browser?: ApplicationBrowserState) {
  return !!browser && ["queued", "running"].includes(browser.status);
}

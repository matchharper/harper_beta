import { browserProgressEntrySchema } from "./browserProgress";
import { z } from "zod";
import { browserRequestSchema } from "./applicationBrowserActions";
import { applicationBrowserRuntimeRefSchema } from "./applicationBrowserRuntimeRef";

export const APPLY_TO_ROLE = "apply_for_role";
export const browserStateSchema = z.object({
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
  sourceMessageId: z.number().int().positive().optional(),
  progress: browserProgressEntrySchema.array().max(40).optional(),
  cursor: z.string().optional(),
  leaseUntil: z.string().optional(),
  taskSent: z.boolean().optional(),
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
  .object({ purpose: z.string().min(1).max(4000) })
  .strict();
export const applyToRoleTool = {
  type: "function" as const,
  function: {
    name: APPLY_TO_ROLE,
    description:
      "Fill the current role's public application form using the user's selected final resume and confirmed answers. Available only in Apply with Harper after ready_for_role and the user authorizes applying with the prepared resume, plus review of all known required supporting documents and substantive written answers. Prepare missing materials before invoking this tool. Saves a resumable browser run, can ask for missing information, and requires user confirmation before final submission. Login and CAPTCHA are unsupported. Ends this turn; the application delivers questions or a verified outcome later.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["purpose"],
      properties: { purpose: { type: "string" } },
    },
  },
};
export function browserIsExecuting(browser?: ApplicationBrowserState) {
  return !!browser && ["queued", "running"].includes(browser.status);
}

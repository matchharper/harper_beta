import { z } from "zod";

// Model commands contain identifiers and data, never executable source code.
export const applicationBrowserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect") }).strict(),
  z.object({ action: z.literal("navigate"), url: z.string().url() }).strict(),
  z
    .object({
      action: z.literal("fill"),
      ref: z.string().regex(/^\d+$/),
      value: z.string().max(60000),
    })
    .strict(),
  z
    .object({
      action: z.literal("select"),
      ref: z.string().regex(/^\d+$/),
      value: z.string().max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("check"),
      ref: z.string().regex(/^\d+$/),
      checked: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("attach"),
      ref: z.string().regex(/^\d+$/),
      documentId: z.string(),
    })
    .strict(),
  z
    .object({ action: z.literal("click"), ref: z.string().regex(/^\d+$/) })
    .strict(),
]);
export type ApplicationBrowserAction = z.infer<
  typeof applicationBrowserActionSchema
>;
export const browserRequestSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  method: z.string(),
  bodyHash: z.string(),
  formHash: z.string(),
  pageUrl: z.string(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  bodyPreview: z.string().optional(),
});
export type BrowserPendingRequest = z.infer<typeof browserRequestSchema>;
export type ControlledBrowserResult = {
  snapshot?: { url: string; title: string; text: string; elements: unknown[] };
  pendingRequest?: BrowserPendingRequest;
  error?: string;
  executed?: boolean;
};
export const APPLICATION_BROWSER_ACTION = "perform_application_browser_action";
export const applicationBrowserActionTool = {
  type: "function" as const,
  name: APPLICATION_BROWSER_ACTION,
  description:
    "Inspect and operate the current application browser through observed element refs. Inspect returns public page text and current form controls. Use documentId only from supplied attachments. Navigation beyond the supplied initial URL and website requests after personal input are held for user approval. A pendingRequest pauses this browser task; do not retry the action. Continue from its tool result after the user answers. Executable code, shell commands, arbitrary HTTP calls, and approval commands are unavailable.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: {
        type: "string",
        enum: [
          "inspect",
          "navigate",
          "fill",
          "select",
          "check",
          "attach",
          "click",
        ],
      },
      ref: {
        type: "string",
        description: "Exact element ref from the latest inspection.",
      },
      url: { type: "string" },
      value: { type: "string" },
      checked: { type: "boolean" },
      documentId: { type: "string" },
    },
  },
};

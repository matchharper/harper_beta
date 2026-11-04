import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { z } from "zod";

export const applicationBrowserReadActionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({ action: z.literal("inspect"), frameRef: z.string().regex(/^\d+$/).optional() }).strict(),
    z.object({ action: z.literal("navigate"), url: z.string().url() }).strict(),
    z
      .object({ action: z.literal("click"), ref: z.string().regex(/^\d+$/) })
      .strict(),
  ]
);

// Model commands contain identifiers and data, never executable source code.
const fieldActions = [
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
] as const;
export const applicationBrowserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), frameRef: z.string().regex(/^\d+$/).optional() }).strict(),
  z.object({ action: z.literal("navigate"), url: z.string().url() }).strict(),
  ...fieldActions,
  z.object({
    action: z.literal("fill_fields"),
    fields: z.array(z.discriminatedUnion("action", fieldActions)).min(1).max(50)
      .refine(fields => new Set(fields.map(field => field.ref)).size === fields.length,
        "Each form control may be updated only once per batch"),
  }).strict(),
  z.object({ action: z.literal("click"), ref: z.string().regex(/^\d+$/) }).strict(),
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
  snapshot?: {
    url: string; title: string; text: string; elements: unknown[];
    frames?: { ref: string; url: string; name: string; inspected: boolean }[];
    readErrors?: { frameRef: string | null; error: string }[];
  };
  pendingRequest?: BrowserPendingRequest;
  error?: string;
  executed?: boolean;
  completedFields?: number;
};
export const APPLICATION_BROWSER_ACTION = "perform_application_browser_action";
export const applicationBrowserReadActionTool = {
  type: "function" as const,
  name: APPLICATION_BROWSER_ACTION,
  description:
    TOOL_DESCRIPTIONS.perform_application_browser_action_read,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: { type: "string", enum: ["inspect", "navigate", "click"] },
      ref: { type: "string", description: "Exact current element ref." },
      url: { type: "string" },
      frameRef: { type: "string", description: "Inspect only: ref from the current frames index to additionally read. Omit for the current scopes." },
    },
  },
};
export const applicationBrowserActionTool = {
  type: "function" as const,
  name: APPLICATION_BROWSER_ACTION,
  description:
    TOOL_DESCRIPTIONS.perform_application_browser_action_operate,
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
          "fill_fields",
          "click",
        ],
      },
      ref: {
        type: "string",
        description: "Exact element ref from the latest inspection.",
      },
      url: { type: "string" },
      frameRef: { type: "string", description: "Inspect only: ref from the current frames index to additionally read. Omit for the current scopes." },
      value: { type: "string" },
      checked: { type: "boolean" },
      documentId: { type: "string" },
      fields: {
        type: "array", minItems: 1, maxItems: 50,
        items: {
          type: "object", additionalProperties: false, required: ["action", "ref"],
          properties: {
            action: { type: "string", enum: ["fill", "select", "check", "attach"] },
            ref: { type: "string" }, value: { type: "string" },
            checked: { type: "boolean" }, documentId: { type: "string" },
          },
        },
      },
    },
  },
};

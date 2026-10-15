import { z } from "zod";

export const applicationBrowserRuntimeRefSchema = z.object({
  name: z.string(),
  expiresAt: z.string(),
  provider: z.literal("openai").optional(),
  sessionId: z.string().optional(),
  environmentId: z.string().optional(),
  readOnly: z.boolean().optional(),
});
export type ApplicationBrowserRuntimeRef = z.infer<
  typeof applicationBrowserRuntimeRefSchema
>;

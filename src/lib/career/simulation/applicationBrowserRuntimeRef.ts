import { z } from "zod";

export const applicationBrowserRuntimeRefSchema = z.object({
  name: z.string(),
  expiresAt: z.string(),
  provider: z.enum(["openai", "browserbase", "browser-use"]).optional(),
  sessionId: z.string().optional(),
  browserSessionId: z.string().optional(),
  environmentId: z.string().optional(),
  readOnly: z.boolean().optional(),
});
export type ApplicationBrowserRuntimeRef = z.infer<
  typeof applicationBrowserRuntimeRefSchema
>;

export function isStagehandBrowser(ref?: ApplicationBrowserRuntimeRef): ref is ApplicationBrowserRuntimeRef & { provider: "browserbase" | "browser-use" } {
  return ref?.provider === "browserbase" || ref?.provider === "browser-use";
}

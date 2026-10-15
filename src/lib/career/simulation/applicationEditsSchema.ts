import { z } from "zod";

// Shared machine contract; importing it must not initialize session/tool modules.
export const applicationEditsSchema = z
  .array(
    z.object({
      target: z.string(),
      originalText: z.string(),
      suggestedText: z.string(),
    })
  )
  .optional();

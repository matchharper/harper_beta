import { z } from "zod";

export const applicationFormSchema = z.object({
  status: z.enum(["read", "partial", "unavailable"]),
  url: z.string(),
  checkedAt: z.string(),
  limitations: z.array(z.string()),
  fields: z.array(z.object({
    label: z.string(),
    type: z.string(),
    required: z.boolean().nullable(),
    options: z.array(z.string()),
    instructions: z.string(),
    fileTypes: z.array(z.string()),
    maxLength: z.number().nullable(),
  })).max(150),
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

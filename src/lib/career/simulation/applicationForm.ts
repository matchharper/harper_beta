import { z } from "zod";

export const applicationSubmissionSchema = z.object({
  status: z.enum(["supported", "unsupported", "unknown"]),
  reason: z.string(),
});

export const applicationInspectionSchema = z.object({
  status: z.enum(["queued", "running", "completed", "failed"]),
  runId: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export function isApplicationInspectionPending(state: {
  applicationInspection?: z.infer<typeof applicationInspectionSchema>;
}) {
  return state.applicationInspection?.status === "queued" ||
    state.applicationInspection?.status === "running";
}

export const applicationFormSchema = z.object({
  status: z.enum(["read", "partial", "unavailable"]),
  url: z.string(),
  checkedAt: z.string(),
  limitations: z.array(z.string()),
  submission: applicationSubmissionSchema.optional(),
  // Public source text preserves form-wide instructions outside any single input.
  text: z.string().max(40000).optional(),
  fields: z
    .array(
      z.object({
        label: z.string(),
        type: z.string(),
        required: z.boolean().nullable(),
        options: z.array(z.string()),
        instructions: z.string(),
        fileTypes: z.array(z.string()),
        maxLength: z.number().nullable(),
      })
    )
    .max(150),
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

import { z } from "zod";

export const applicationSubmissionSchema = z.object({
  status: z.enum(["supported", "unsupported", "unknown"]),
  // Read compatibility for saved inspections; new producers use limitations.
  reason: z.string().optional(),
});

export const applicationInspectionSchema = z.object({
  status: z.enum(["queued", "running", "completed", "failed"]),
  runId: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  resolveOfficialLink: z.boolean().optional(),
  browserUseSessionId: z.string().optional(),
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
  text: z.string().optional(),
  fields: z
    .array(
      z.object({
        label: z.string(),
        type: z.string(),
        multiple: z.boolean().nullable().optional(),
        name: z.string().optional(),
        optionValue: z.string().optional(),
        required: z.boolean().nullable(),
        options: z.array(z.string()),
        instructions: z.string(),
        fileTypes: z.array(z.string()),
        maxLength: z.number().nullable(),
      })
    ),
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

/** Preserve old saved access evidence while presenting one combined list. */
export function applicationLimitations(form: ApplicationForm): string[] {
  const legacyReason = form.submission?.reason;
  return legacyReason && !form.limitations.includes(legacyReason)
    ? [...form.limitations, legacyReason]
    : form.limitations;
}

import { z } from "zod";
export const applicationStartOfferSchema = z.object({
  version: z.literal(1),
  replyId: z.number().int().positive().optional(),
  status: z.enum(["ready", "started"]),
  roleName: z.string(),
  roleTitle: z.string().optional(),
  companyName: z.string().optional(),
  companyLogoUrl: z.string().nullable().optional(),
  roleId: z.string().optional(),
  official_job_slug: z.string().optional(),
  selectedDocumentId: z.string().optional(),
  resumes: z.array(
    z.object({ id: z.string(), name: z.string(), primary: z.boolean() })
  ),
});
export type ApplicationStartOffer = z.infer<typeof applicationStartOfferSchema>;
export function parseApplicationStartOffer(value: unknown) {
  const parsed = applicationStartOfferSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
export const applicationStartRequestSchema = z
  .object({
    action: z.literal("start"),
    sessionMessageId: z.number().int().positive(),
    expectedRevision: z.literal(1),
    documentId: z.string().min(1),
  })
  .strict();

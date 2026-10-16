import { z } from "zod";
import { countriesSchema } from "./countries";

const planFields = {
  searchIntentSummary: z.string().max(4000),
  roleTitles: z.array(z.string().trim().min(1).max(300)).min(1).max(24),
  ftsKeywords: z
    .array(
      z
        .object({
          terms: z.array(z.string().min(1).max(300)).min(1).max(8),
          weight: z.number().finite().min(0).max(5),
        })
        .strict()
    )
    .max(8),
  includeContract: z.boolean(),
  includeParttime: z.boolean(),
  includeIntern: z.boolean(),
  includeRemote: z.boolean(),
  remoteOnly: z.boolean(),
  isPreferEntry: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  postingRecency: z
    .object({
      maxAgeDays: z.number().int().min(1).max(3650).nullable(),
      recentDays: z.number().int().min(1).max(3650).nullable(),
      recentWeight: z.number().min(0).max(20).nullable(),
      olderWeight: z.number().min(0).max(20).nullable(),
    })
    .strict()
    .nullable(),
};
export const countrySearchPlanSchema = z
  .object({ ...planFields, countries: countriesSchema })
  .strict();
export const externalRetrievalRequestSchema = z
  .object({
    userId: z.string().uuid(),
    plan: countrySearchPlanSchema,
    targetSalaryKrw: z.number().finite().positive().nullable().default(null),
    blockedCompanies: z
      .array(z.string().trim().min(1).max(100))
      .max(20)
      .default([]),
    excludeRoleIds: z.array(z.string().uuid()).default([]),
    limit: z.number().int().min(1).max(500).default(500),
  })
  .strict();

import { z } from "zod";

const employerRefKinds = ["role", "posting", "opportunity"] as const;
const targetRefKinds = [
  "company",
  "company_workspace",
  ...employerRefKinds,
] as const;
const nonempty = z.string().trim().min(1);
export const officialCompanySchema = z
  .object({
    name: nonempty,
    officialWebsite: z.string().url().optional(),
    linkedinUrl: z.string().url().optional(),
    linkedinCompanyId: z.string().regex(/^\d+$/).optional(),
  })
  .strict();
export const publicCompanyTargetSchema = z.union([
  z
    .object({
      kind: z.enum(targetRefKinds),
      id: nonempty,
      revision: nonempty.optional(),
    })
    .strict(),
  officialCompanySchema,
]);
export type PublicCompanyTarget = z.infer<typeof publicCompanyTargetSchema>;

export const officialCompanyInput = {
  type: "object",
  properties: {
    name: { type: "string" },
    officialWebsite: { type: "string" },
    linkedinUrl: { type: "string" },
    linkedinCompanyId: { type: "string" },
  },
  required: ["name"],
  additionalProperties: false,
};

export const publicCompanyTargetInput = {
  description:
    "Use a company, workspace or public employer ref you already have, or the company's public name. Add its official website or LinkedIn company identity when another company shares the name.",
  anyOf: [
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: targetRefKinds },
        id: { type: "string" },
        revision: { type: "string" },
      },
      required: ["kind", "id"],
      additionalProperties: false,
    },
    officialCompanyInput,
  ],
};

export const isEmployerTarget = (target: PublicCompanyTarget) =>
  "kind" in target &&
  (target.kind === "role" ||
    target.kind === "posting" ||
    target.kind === "opportunity");

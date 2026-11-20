import { z } from "zod";
import { readCompanyProjections, formatCompanyTargets } from "../resources/companyData";
import type { TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import { profileToolContext } from "../profiles/tools";
import { resourceRefSchema } from "../resources/types";
import { readOpportunity, listOpportunities, formatOpportunity } from "./store";
import { str, num, resourceRefInput } from "../resources/toolSchemas";

/** Every recommendation is a talent_opportunity_recommendation row (a Role or a
 * company). The model reads an existing opportunity reference; it never creates a
 * separate personal opportunity record. */
export const generalOpportunityProperties = {
  labels: { type: "array", items: str, description: "Public employer data to include on read, by label." },
  opportunityRef: resourceRefInput,
  cursor: str,
  limit: num,
};
export async function executeGeneralOpportunity(
  input: Record<string, unknown>,
  context?: TalentToolExecutionContext
) {
  const scope = profileToolContext(context, "upsert_opportunities", input, { readOnly: true });
  const parsed = z
    .object({
      action: z.literal("read"),
      opportunityRef: resourceRefSchema.optional(),
      cursor: z.string().optional(),
      limit: z.number().optional(),
      labels: z.array(z.string()).optional(),
    })
    .passthrough()
    .parse(input);
  if (parsed.opportunityRef && parsed.opportunityRef.kind !== "opportunity")
    throw new Error("Expected an opportunity reference.");
  let items;
  let page: { nextCursor?: string | null; total?: number | null } = {};
  if (parsed.opportunityRef) items = [await readOpportunity(scope, parsed.opportunityRef.id)];
  else {
    const result = await listOpportunities(scope, parsed);
    items = result.items;
    page = result;
  }
  const companyText = formatCompanyTargets(await readCompanyProjections(scope,
    items.map(item => ({ kind: "opportunity", id: item.id })), { mode: parsed.opportunityRef ? "detail" : "list",
      refresh: Boolean(parsed.opportunityRef) && !parsed.labels?.length, labels: parsed.labels, signal: context?.abortSignal }));
  return {
    opportunities: items,
    nextCursor: page.nextCursor,
    total: page.total,
    modelOutput: [
      ...items.map(formatOpportunity),
      ...(companyText ? [companyText] : []),
      ...(page.total === undefined
        ? []
        : [`Total ${page.total}; next cursor ${page.nextCursor ?? "none"}`]),
    ].join("\n\n"),
  };
}

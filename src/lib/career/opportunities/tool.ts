import { z } from "zod";
import type { TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import { profileToolContext } from "../profiles/tools";
import {
  databaseError,
  resourceDb,
  resourceRefSchema,
} from "../resources/types";
import {
  privateApplicationStage,
  writeOpportunity,
  readOpportunity,
  listOpportunities,
  formatOpportunity,
} from "./store";
import {
  str,
  num,
  resourceRefInput,
  refsInput,
} from "../resources/toolSchemas";

export const generalOpportunityProperties = {
  opportunityRef: resourceRefInput,
  primaryRef: resourceRefInput,
  relatedRefs: refsInput,
  evidenceRefs: refsInput,
  title: str,
  body: str,
  presentation: {
    type: "object",
    properties: {
      action: {
        type: "object",
        properties: { id: str, label: str, request: str },
        required: ["id", "label", "request"],
      },
    },
  },
  applicationStage: {
    type: ["string", "null"],
    enum: [...privateApplicationStage.options, null],
    description: "Observed progress for a private opportunity without a linked Role recommendation. Use applied for a receipt, connected for an active process, offer for a final offer and closed for an ended process. Omit to keep existing progress or pass null to clear a mistaken stage. Include the source in evidenceRefs.",
  },
  displayOrder: { type: "number", description: "Ascending order in the opportunity list: smaller values appear first. Omission preserves an existing order; new items default to 0. A user's manual order takes precedence over agent updates." },
  saved: { type: "boolean" },
  archived: { type: "boolean" },
  mergeIntoRef: resourceRefInput,
  mergeIntoRevision: num,
  cursor: str,
  limit: num,
};
export async function executeGeneralOpportunity(
  input: Record<string, unknown>,
  context?: TalentToolExecutionContext
) {
  const scope = profileToolContext(context, "upsert_opportunities", input, {
    readOnly: input.action === "read",
  });
  const parsed = z
    .object({
      action: z.enum(["upsert", "read", "merge"]),
      opportunityRef: resourceRefSchema.optional(),
      primaryRef: resourceRefSchema.optional(),
      relatedRefs: z.array(resourceRefSchema).optional(),
      evidenceRefs: z.array(resourceRefSchema).optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      presentation: z.record(z.unknown()).optional(),
      displayOrder: z.number().optional(),
      applicationStage: privateApplicationStage.nullable().optional(),
      saved: z.boolean().optional(),
      archived: z.boolean().optional(),
      expectedRevision: z.coerce.number().int().optional(),
      mergeIntoRef: resourceRefSchema.optional(),
      mergeIntoRevision: z.number().int().optional(),
      cursor: z.string().optional(),
      limit: z.number().optional(),
    })
    .parse(input);
  if (parsed.opportunityRef && parsed.opportunityRef.kind !== "opportunity")
    throw new Error("Expected an opportunity reference.");
  let items;
  let page: { nextCursor?: string | null; total?: number | null } = {};
  if (parsed.action === "read") {
    if (parsed.opportunityRef)
      items = [await readOpportunity(scope, parsed.opportunityRef.id)];
    else {
      const result = await listOpportunities(scope, parsed);
      items = result.items;
      page = result;
    }
  } else if (parsed.action === "merge") {
    if (
      !parsed.opportunityRef ||
      parsed.mergeIntoRef?.kind !== "opportunity" ||
      parsed.expectedRevision === undefined ||
      parsed.mergeIntoRevision === undefined
    )
      throw new Error(
        "Merge requires both opportunity refs and their revisions."
      );
    const merged = await resourceDb(scope.admin).rpc(
      "career_merge_opportunities_v1",
      {
        p_user: scope.userId,
        p_from: parsed.opportunityRef.id,
        p_to: parsed.mergeIntoRef.id,
        p_from_revision: parsed.expectedRevision,
        p_to_revision: parsed.mergeIntoRevision,
      }
    );
    databaseError(merged.error);
    items = [await readOpportunity(scope, parsed.mergeIntoRef.id)];
  } else {
    items = [
      await writeOpportunity(scope, {
        id: parsed.opportunityRef?.id,
        expectedRevision: parsed.expectedRevision,
        requestId: scope.operationId,
        patch: {
          title: parsed.title,
          body: parsed.body,
          primary_ref: parsed.primaryRef,
          related_refs: parsed.relatedRefs,
          evidence_refs: parsed.evidenceRefs,
          presentation: parsed.presentation,
          display_order: parsed.displayOrder,
          application_stage: parsed.applicationStage,
          saved: parsed.saved,
          archived: parsed.archived,
        },
      }),
    ];
  }
  return {
    opportunities: items,
    nextCursor: page.nextCursor,
    total: page.total,
    modelOutput: [
      ...items.map(formatOpportunity),
      ...(page.total === undefined
        ? []
        : [`Total ${page.total}; next cursor ${page.nextCursor ?? "none"}`]),
    ].join("\n\n"),
  };
}

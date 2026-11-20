import { z } from "zod";
import {
  databaseError,
  pageInput,
  record,
  resourceDb,
  ResourceError,
  resourceRefSchema,
  requestUuid,
  rows,
  type ResourceContext,
} from "../resources/types";
import { resourceAvailable } from "../resources/read";

export const privateApplicationStage = z.enum(["applied", "connected", "offer", "closed"]);
export const applicationShelf = z.enum(["applied", "hidden"]);
export type ApplicationShelf = z.infer<typeof applicationShelf>;

export const opportunitySchema = z.object({
  id: z.string().uuid(),
  talent_id: z.string().uuid(),
  revision: z.number(),
  primary_ref: resourceRefSchema,
  related_refs: z.array(resourceRefSchema),
  title: z.string(),
  body: z.string(),
  evidence_refs: z.array(resourceRefSchema),
  presentation: z.record(z.unknown()),
  recommendation_id: z.string().nullable(),
  merged_into_id: z.string().nullable(),
  display_order: z.number(),
  order_source: z.string(),
  published_at: z.string(),
  saved_at: z.string().nullable(),
  archived_at: z.string().nullable(),
  application_stage: privateApplicationStage.nullish(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  legacy_role_id: z.string().optional(),
  work: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        title: z.string(),
        note: z.string(),
        conversationId: z.string().nullable(),
      })
    )
    .optional(),
});
export type CareerOpportunity = z.infer<typeof opportunitySchema>;
const patchSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    primary_ref: resourceRefSchema.optional(),
    related_refs: z.array(resourceRefSchema).optional(),
    evidence_refs: z.array(resourceRefSchema).optional(),
    presentation: z.record(z.unknown()).optional(),
    recommendation_id: z.string().uuid().optional(),
    display_order: z.number().finite().optional(),
    saved: z.boolean().optional(),
    archived: z.boolean().optional(),
    application_stage: privateApplicationStage.nullable().optional(),
  })
  .strict();

export async function readOpportunity(
  context: ResourceContext,
  id: string
): Promise<CareerOpportunity> {
  const visited = new Set<string>();
  while (!visited.has(id)) {
    visited.add(id);
    const { data, error } = await resourceDb(context.admin)
      .from("career_opportunities")
      .select("*")
      .eq("id", id)
      .eq("talent_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    databaseError(error);
    if (!data) throw new ResourceError("Opportunity unavailable.", 404);
    const item = opportunitySchema.parse(data);
    if (item.merged_into_id) {
      id = item.merged_into_id;
      continue;
    }
    if (item.recommendation_id) {
      const resolved = await resourceDb(context.admin).rpc(
        "career_wrap_legacy_opportunity_v1",
        { p_user: context.userId, p_recommendation: item.recommendation_id }
      );
      databaseError(resolved.error);
      if (resolved.data !== id) {
        id = String(resolved.data);
        continue;
      }
      const binding = await resourceDb(context.admin)
        .from("career_opportunities")
        .select("recommendation_id,revision")
        .eq("talent_id", context.userId)
        .eq("id", id)
        .single();
      databaseError(binding.error);
      if (!binding.data)
        throw new ResourceError("Opportunity unavailable.", 404);
      item.recommendation_id = binding.data.recommendation_id;
      item.revision = binding.data.revision;
    }
    // Never expose a retained private projection after its original source was removed.
    const sources = [
      item.primary_ref,
      ...item.related_refs,
      ...item.evidence_refs,
    ];
    const access = await Promise.all(
      sources.map((ref) => resourceAvailable(context, ref))
    );
    if (access.some((allowed) => !allowed))
      return {
        ...item,
        title: "Unavailable source",
        application_stage: null,
        body: "",
        presentation: {},
        related_refs: [],
        evidence_refs: [],
      };
    if (item.recommendation_id) {
      const legacy = await resourceDb(context.admin)
        .from("talent_opportunity_recommendation")
        .select("role_id,saved_stage,feedback_at,created_at")
        .eq("id", item.recommendation_id)
        .eq("talent_id", context.userId)
        .maybeSingle();
      databaseError(legacy.error);
      const state = record(legacy.data);
      const progress = privateApplicationStage.safeParse(state.saved_stage);
      item.application_stage = progress.success ? progress.data : null;
      if (typeof state.role_id === "string")
        item.legacy_role_id = state.role_id;
      item.saved_at =
        state.saved_stage && state.saved_stage !== "hidden"
          ? String(state.feedback_at ?? state.created_at)
          : null;
    }
    item.work = [];
    for (let offset = 0; ; offset += 50) {
      const response = await resourceDb(context.admin).rpc(
        "career_opportunity_work_v1",
        {
          p_user: context.userId,
          p_id: item.id,
          p_active: false,
          p_offset: offset,
          p_limit: 50,
        }
      );
      databaseError(response.error);
      const page = rows(response.data);
      item.work.push(
        ...page.map((work) => ({
          id: String(work.id),
          status: String(work.status),
          title: String(record(work.request).instruction ?? ""),
          note: String(record(work.result).note ?? ""),
          conversationId:
            typeof work.conversation_id === "string"
              ? work.conversation_id
              : null,
        }))
      );
      if (page.length < 50) break;
    }
    return item;
  }
  throw new ResourceError("Opportunity alias cycle.", 409);
}
type OpportunityFilters = {
  unbound?: boolean;
  applicationShelf?: ApplicationShelf;
  saved?: boolean;
  archived?: boolean;
};

async function readOpportunityPage(
  context: ResourceContext,
  input: OpportunityFilters,
  offset: number,
  limit: number
) {
  if (input.applicationShelf) {
    const stages = input.applicationShelf === "hidden" ? ["closed"] : ["applied", "connected", "offer"];
    const { data, error, count } = await resourceDb(context.admin)
      .from("career_opportunities")
      .select("id", { count: "exact" })
      .eq("talent_id", context.userId)
      .is("recommendation_id", null)
      .is("merged_into_id", null)
      .is("deleted_at", null)
      .is("archived_at", null)
      .in("application_stage", stages)
      .order("display_order").order("id")
      .range(offset, offset + limit - 1);
    databaseError(error);
    return { selected: rows(data), total: count ?? 0 };
  }
  const result = await resourceDb(context.admin).rpc(
    "career_list_opportunities_v1",
    {
      p_user: context.userId,
      p_saved: input.saved ?? null,
      p_archived: input.archived ?? false,
      p_offset: offset,
      p_limit: limit,
      p_unbound: input.unbound ?? false,
    }
  );
  databaseError(result.error);
  const selected = rows(result.data);
  return { selected, total: Number(selected[0]?.total_count ?? 0) };
}

export async function countUnboundOpportunities(context: ResourceContext) {
  const [fresh, saved, applied, hidden] = await Promise.all([
    readOpportunityPage(context, { unbound: true, saved: false }, 0, 1),
    readOpportunityPage(context, { unbound: true, saved: true }, 0, 1),
    readOpportunityPage(context, { applicationShelf: "applied" }, 0, 1),
    readOpportunityPage(context, { applicationShelf: "hidden" }, 0, 1),
  ]);
  return { new: fresh.total, saved: saved.total, applied: applied.total, hidden: hidden.total };
}

export async function listOpportunities(
  context: ResourceContext,
  input: OpportunityFilters & { cursor?: string; limit?: number } = {}
) {
  const { offset, limit } = pageInput(input.cursor, input.limit);
  const { selected, total } = await readOpportunityPage(
    context,
    input,
    offset,
    limit + 1
  );
  const items = await Promise.all(
    selected
      .slice(0, limit)
      .map((row) => readOpportunity(context, String(row.id)))
  );
  return {
    items,
    total,
    nextCursor: selected.length > limit ? String(offset + limit) : null,
  };
}
export async function wrapLegacyOpportunity(
  context: ResourceContext,
  recommendationId: string
) {
  const result = await resourceDb(context.admin).rpc(
    "career_wrap_legacy_opportunity_v1",
    { p_user: context.userId, p_recommendation: recommendationId }
  );
  databaseError(result.error);
  return readOpportunity(context, String(result.data));
}
/** Lazy adaptation leaves legacy progress with its owning recommendation. */
export async function legacyOpportunityReferences(
  context: ResourceContext,
  recommendationIds: string[]
) {
  const result = await Promise.all(
    [...new Set(recommendationIds)].map(async (recommendationId) => {
      const wrapped = await resourceDb(context.admin).rpc(
        "career_wrap_legacy_opportunity_v1",
        { p_user: context.userId, p_recommendation: recommendationId }
      );
      if (wrapped.error)
        return { recommendationId, error: wrapped.error.message };
      return {
        recommendationId,
        opportunityRef: {
          kind: "opportunity" as const,
          id: String(wrapped.data),
        },
      };
    })
  );
  return result;
}

export async function writeOpportunity(
  context: ResourceContext,
  input: {
    id?: string;
    expectedRevision?: number;
    requestId: string;
    patch: unknown;
    actor?: "user" | "agent";
  }
) {
  const patch = patchSchema.parse(input.patch),
    id =
      input.id ??
      requestUuid(`${context.userId}:opportunity:${input.requestId}`);
  if (!input.id && (!patch.title || !patch.primary_ref))
    throw new ResourceError(
      "A new opportunity requires title and primary_ref."
    );
  if (input.id && input.expectedRevision === undefined)
    throw new ResourceError("Read the opportunity revision before updating.");
  // A replay of the same creation is an exact stored result, not a second proposal.
  if (!input.id) {
    const existing = await resourceDb(context.admin)
      .from("career_opportunities")
      .select("id")
      .eq("id", id)
      .eq("talent_id", context.userId)
      .maybeSingle();
    databaseError(existing.error);
    if (existing.data) return readOpportunity(context, id);
  }
  const { data, error } = await resourceDb(context.admin).rpc(
    "career_write_opportunity_v1",
    {
      p_user: context.userId,
      p_id: id,
      p_expected_revision: input.expectedRevision ?? 0,
      p_patch: patch,
      p_actor: input.actor ?? "agent",
    }
  );
  databaseError(error);
  return readOpportunity(
    context,
    String(record(Array.isArray(data) ? data[0] : data).id)
  );
}
export function formatOpportunity(item: CareerOpportunity) {
  return [
    `Opportunity ${item.id} revision ${item.revision}: ${item.title}`,
    `Workspace path: /career/opportunities/${encodeURIComponent(item.id)}`,
    item.body,
    item.application_stage ? `Application stage: ${item.application_stage}` : "",
    `Target: ${item.primary_ref.kind}:${item.primary_ref.id}`,
    `Saved: ${Boolean(item.saved_at)}; archived: ${Boolean(item.archived_at)}`,
    ...(item.work ?? []).map(
      (work) =>
        `Existing work ${work.id}; ${work.status}; origin conversation ${work.conversationId ?? "unavailable"}${work.note ? `; observed outcome: ${work.note}` : ""}`
    ),
    item.recommendation_id
      ? `Existing recommendation: ${item.recommendation_id}`
      : "",
    ...item.evidence_refs.map(
      (ref) =>
        `Evidence: ${ref.kind}:${ref.id}${ref.revision ? ` revision ${ref.revision}` : ""}`
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

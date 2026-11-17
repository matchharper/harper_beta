import { z } from "zod";
import { readView } from "./views";
import { readOpportunity } from "../opportunities/store";
import { publishSet, readSet, type ResultItem } from "./sets";
import {
  databaseError,
  record,
  requestUuid,
  resourceDb,
  ResourceError,
  type ResourceContext,
  type Selection,
} from "./types";
import { readResource } from "./read";
import { ensureEmailConversation } from "@/lib/email/runtime/store";
import { initialCareerCapabilityPayload } from "../capabilities/lease";
import { getCareerCapabilityMode } from "../capabilities/registry";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";

export const interactionSchema = z
  .object({
    requestId: z.string().uuid(),
    kind: z.enum(["view", "opportunity"]),
    id: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    actionId: z.string(),
    conversationId: z.string().uuid().optional(),
    selection: z
      .object({
        itemIds: z.array(z.string()).optional(),
        excludeItemIds: z.array(z.string()).optional(),
      })
      .optional(),
    message: z.string().optional(),
  })
  .strict();
export async function admitResourceInteraction(
  context: ResourceContext,
  raw: unknown
) {
  const input = interactionSchema.parse(raw),
    db = resourceDb(context.admin);
  const prior = await db
    .from("talent_external_operations")
    .select("result,conversation_id")
    .eq("user_id", context.userId)
    .eq("kind", "resource_interaction")
    .eq("idempotency_key", `resource-interaction:${input.requestId}`)
    .maybeSingle();
  databaseError(prior.error);
  if (prior.data)
    return {
      message: record(prior.data).result as TalentMessageRow,
      conversationId: String(record(prior.data).conversation_id),
    };
  let allowed: Selection | undefined;
  if (input.kind === "view") {
    const view = await readView(context, input.id);
    if (view.revision !== input.expectedRevision)
      throw new ResourceError("View revision conflict.", 409);
    const block = view.definition.blocks.find(
      (b) => b.type === "collection" && b.action?.id === input.actionId
    );
    if (!block || block.type !== "collection")
      throw new ResourceError("Action unavailable.", 404);
    allowed = block.selection;
  } else {
    const opportunity = await readOpportunity(context, input.id);
    if (opportunity.revision !== input.expectedRevision)
      throw new ResourceError("Opportunity revision conflict.", 409);
    if (record(opportunity.presentation.action).id !== input.actionId)
      throw new ResourceError("Action unavailable.", 404);
  }
  let selectionRef: Extract<Selection, { setId: string }> | null = null;
  if (input.selection && !allowed)
    throw new ResourceError("This action has no collection selection.");
  if (allowed) {
    const items: ResultItem[] = [];
    let manifest: Record<string, unknown> = {};
    if ("setId" in allowed) {
      let cursor: string | undefined;
      do {
        const page = await readSet(context, { ...allowed, cursor, limit: 500 });
        items.push(...page.items);
        manifest = page.manifest;
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    } else {
      for (const ref of allowed.refs) {
        const source = await readResource(context, ref);
        items.push({
          itemId: requestUuid(JSON.stringify(ref)),
          ref: source.ref,
          projection: { title: source.title },
          unavailable: source.status !== "available",
        });
      }
      manifest = { fields: ["title"] };
    }
    const include = input.selection?.itemIds
        ? new Set(input.selection.itemIds)
        : null,
      exclude = new Set(input.selection?.excludeItemIds ?? []);
    const allIds = new Set(items.map((item) => item.itemId));
    if ([...(include ?? []), ...exclude].some((id) => !allIds.has(id)))
      throw new ResourceError(
        "Selection no longer belongs to this collection.",
        409
      );
    const selected = items.filter(
      (item) =>
        (!include || include.has(item.itemId)) && !exclude.has(item.itemId)
    );
    if (!selected.length) throw new ResourceError("Select at least one item.");
    if (selected.some((item) => item.unavailable))
      throw new ResourceError(
        "Selected evidence is unavailable. Refresh the collection.",
        409
      );
    const setId = requestUuid(
      `${context.userId}:interaction-selection:${input.requestId}`
    );
    const existing = await db
      .from("career_result_sets")
      .select("id")
      .eq("id", setId)
      .eq("talent_id", context.userId)
      .eq("revision", 1)
      .maybeSingle();
    databaseError(existing.error);
    if (!existing.data)
      await publishSet(context, {
        id: setId,
        expectedRevision: 0,
        title: "Selected resources",
        manifest: { ...manifest, selectedFrom: allowed },
        items: selected,
      });
    selectionRef = { setId, revision: 1 };
  }
  const conversationId = await ensureEmailConversation(
    context.admin,
    context.userId,
    input.conversationId
  );
  const result = await db.rpc("career_resource_interaction_v1", {
    p_user: context.userId,
    p_conversation: conversationId,
    p_request: input.requestId,
    p_kind: input.kind,
    p_id: input.id,
    p_revision: input.expectedRevision,
    p_action: input.actionId,
    p_selection: selectionRef,
    p_message: input.message ?? "",
    p_payload: initialCareerCapabilityPayload(getCareerCapabilityMode()),
  });
  databaseError(result.error);
  return { message: result.data as TalentMessageRow, conversationId };
}

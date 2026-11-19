import { z } from "zod";
import { formatPromptText } from "@/lib/llm/promptText";
import { readSet } from "./sets";
import { resourceAvailable } from "./read";
import {
  databaseError,
  pageInput,
  record,
  requestUuid,
  resourceDb,
  ResourceError,
  resourceRefSchema,
  rows,
  selectionSchema,
  type ResourceContext,
} from "./types";

const actionSchema = z.object({
  id: z.string(),
  label: z.string(),
  request: z.string(),
});
export const viewBlockSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("narrative"),
    title: z.string().optional(),
    markdown: z.string(),
    sourceRefs: z.array(resourceRefSchema).default([]),
  }),
  z.object({
    id: z.string(),
    type: z.literal("collection"),
    title: z.string().optional(),
    selection: selectionSchema,
    layout: z.enum(["list", "table"]),
    columns: z.array(z.string()).optional(),
    action: actionSchema.optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("document"),
    ref: resourceRefSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("activity"),
    refs: z.array(resourceRefSchema),
  }),
]);
export const viewDefinitionSchema = z.object({
  blocks: z.array(viewBlockSchema),
});

export function formatCareerView(
  view: Pick<
    CareerView,
    "id" | "revision" | "title" | "description" | "definition"
  >
) {
  return [
    `View ${view.id} revision ${view.revision}: ${view.title}`,
    `Workspace path: /career/views/${encodeURIComponent(view.id)}`,
    view.description,
    ...view.definition.blocks.map((block) => {
      if (block.type === "narrative")
        return [
          `Section ${block.id}${block.title ? `: ${block.title}` : ""}`,
          block.markdown,
          block.sourceRefs.length
            ? `Evidence: ${block.sourceRefs.map((ref) => `${ref.kind}:${ref.id}${ref.revision ? ` revision ${ref.revision}` : ""}`).join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      if (block.type === "collection")
        return [
          `Collection ${block.id}${block.title ? `: ${block.title}` : ""}; layout ${block.layout}`,
          `Selection: ${formatPromptText(block.selection)}`,
          block.columns?.length ? `Columns: ${block.columns.join(", ")}` : "",
          block.action
            ? `Action ${block.action.id}: ${block.action.label}\nUser request on activation: ${block.action.request}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      return `${block.type} ${block.id}: ${formatPromptText("ref" in block ? block.ref : block.refs)}`;
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export const viewSchema = z.object({
  id: z.string(),
  talent_id: z.string(),
  revision: z.number(),
  title: z.string(),
  description: z.string(),
  definition: viewDefinitionSchema,
  display_order: z.number(),
  order_source: z.string(),
  archived_at: z.string().nullable(),
});
export type CareerView = z.infer<typeof viewSchema>;
export async function validateView(context: ResourceContext, raw: unknown) {
  const definition = viewDefinitionSchema.parse(raw);
  if (
    new Set(definition.blocks.map((block) => block.id)).size !==
    definition.blocks.length
  )
    throw new ResourceError("View block IDs must be unique.");
  const actionIds = definition.blocks.flatMap((block) =>
    block.type === "collection" && block.action ? [block.action.id] : []
  );
  if (new Set(actionIds).size !== actionIds.length)
    throw new ResourceError("View action IDs must be unique.");
  for (const block of definition.blocks) {
    if (block.type === "document" && block.ref.kind !== "document")
      throw new ResourceError(
        "A document block requires a document reference."
      );
    const refs =
      block.type === "narrative"
        ? block.sourceRefs
        : block.type === "document"
          ? [block.ref]
          : block.type === "activity"
            ? block.refs
            : "refs" in block.selection
              ? block.selection.refs
              : [];
    for (const ref of refs)
      if (!(await resourceAvailable(context, ref)))
        throw new ResourceError("View source unavailable.", 404);
    if (block.type === "collection" && "setId" in block.selection) {
      const set = await readSet(context, { ...block.selection, limit: 1 });
      const fields = Array.isArray(set.manifest.fields)
        ? set.manifest.fields
        : [];
      if (block.columns?.some((column) => !fields.includes(column)))
        throw new ResourceError(
          "Column is not present in the source field catalog."
        );
    }
  }
  return definition;
}
export async function readView(context: ResourceContext, id: string) {
  const { data, error } = await resourceDb(context.admin)
    .from("career_views")
    .select("*")
    .eq("id", id)
    .eq("talent_id", context.userId)
    .maybeSingle();
  databaseError(error);
  if (!data) throw new ResourceError("View unavailable.", 404);
  const view = viewSchema.parse(data);
  // Narrative may contain private extracts. Suppress the block after source loss.
  const blocks = await Promise.all(
    view.definition.blocks.map(async (block) => {
      if (
        block.type === "narrative" &&
        (
          await Promise.all(
            block.sourceRefs.map((ref) => resourceAvailable(context, ref))
          )
        ).some((available) => !available)
      )
        return { ...block, markdown: "", sourceRefs: [] };
      return block;
    })
  );
  return { ...view, definition: { blocks } };
}
export async function listViews(
  context: ResourceContext,
  input: { cursor?: string; limit?: number; archived?: boolean } = {}
) {
  const { offset, limit } = pageInput(input.cursor, input.limit);
  let query = resourceDb(context.admin)
    .from("career_views")
    .select("id")
    .eq("talent_id", context.userId);
  query = input.archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  const { data, error } = await query
    .order("display_order")
    .order("id")
    .range(offset, offset + limit);
  databaseError(error);
  const found = rows(data);
  return {
    items: await Promise.all(
      found.slice(0, limit).map((row) => readView(context, String(row.id)))
    ),
    nextCursor: found.length > limit ? String(offset + limit) : null,
  };
}
export async function writeView(
  context: ResourceContext,
  input: {
    id?: string;
    expectedRevision?: number;
    requestId: string;
    title?: string;
    description?: string;
    definition?: unknown;
    archived?: boolean;
    displayOrder?: number;
    actor?: "agent" | "user";
  }
) {
  const id =
    input.id ?? requestUuid(`${context.userId}:view:${input.requestId}`);
  const definition =
    input.definition === undefined
      ? undefined
      : await validateView(context, input.definition);
  if (!input.id && (!input.title || !definition))
    throw new ResourceError("A new view requires title and definition.");
  const patch = {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(definition ? { definition } : {}),
    ...(input.archived === undefined
      ? {}
      : { archived_at: input.archived ? new Date().toISOString() : null }),
    updated_at: new Date().toISOString(),
  };
  const db = resourceDb(context.admin);
  if (!input.id) {
    const existing = await db
      .from("career_views")
      .select("id")
      .eq("id", id)
      .eq("talent_id", context.userId)
      .maybeSingle();
    databaseError(existing.error);
    if (existing.data) return readView(context, id);
    const result = await db
      .from("career_views")
      .insert({
        id,
        talent_id: context.userId,
        ...patch,
        display_order: input.displayOrder ?? 0,
      })
      .select("*")
      .single();
    databaseError(result.error);
    return viewSchema.parse(result.data);
  }
  const before = await readView(context, id);
  if (before.revision !== input.expectedRevision)
    throw new ResourceError("View revision conflict.", 409);
  const orderPatch =
    input.displayOrder !== undefined &&
    (input.actor === "user" || before.order_source !== "user")
      ? {
          display_order: input.displayOrder,
          order_source: input.actor ?? "agent",
        }
      : {};
  const result = await db
    .from("career_views")
    .update({ ...patch, ...orderPatch, revision: before.revision + 1 })
    .eq("id", id)
    .eq("talent_id", context.userId)
    .eq("revision", input.expectedRevision)
    .select("*")
    .maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ResourceError("View revision conflict.", 409);
  return viewSchema.parse(result.data);
}

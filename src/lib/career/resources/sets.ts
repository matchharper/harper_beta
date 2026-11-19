import { z } from "zod";
import { resourceAvailable } from "./read";
import {
  databaseError,
  pageInput,
  record,
  resourceDb,
  ResourceError,
  resourceRefSchema,
  rows,
  selectionSchema,
  type ResourceContext,
  type ResourceRef,
  type Selection,
} from "./types";

export type ResultItem = {
  itemId: string;
  ref: ResourceRef;
  projection: Record<string, unknown>;
  evaluationRef?: ResourceRef;
  unavailable?: boolean;
};
const itemFromRow = (row: Record<string, unknown>): ResultItem => ({
  itemId: String(row.item_id),
  ref: resourceRefSchema.parse(row.resource_ref),
  projection: record(row.projection),
  ...(row.evaluation_ref
    ? { evaluationRef: resourceRefSchema.parse(row.evaluation_ref) }
    : {}),
});

/** An owned catalog of saved revisions. Reading it needs neither a conversation nor an earlier set ID. */
export async function listSets(
  context: ResourceContext,
  input: { cursor?: string; limit?: number }
) {
  const { offset, limit } = pageInput(input.cursor, input.limit);
  const { data, error } = await resourceDb(context.admin)
    .from("career_result_sets")
    .select("id,revision,title,created_at,source:manifest->>source,queries:manifest->queries,career_result_items(count)")
    .eq("talent_id", context.userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .order("revision", { ascending: false })
    .range(offset, offset + limit);
  databaseError(error);
  const found = rows(data);
  return {
    sets: found.slice(0, limit).map(row => ({
      setId: row.id,
      revision: row.revision,
      title: row.title,
      createdAt: row.created_at,
      source: row.source,
      queries: row.queries,
      count: rows(row.career_result_items)[0]?.count,
    })),
    nextCursor: found.length > limit ? String(offset + limit) : null,
  };
}

export async function publishSet(
  context: ResourceContext,
  input: {
    id?: string;
    expectedRevision?: number;
    title?: string;
    manifest: Record<string, unknown>;
    items: Array<{
      itemId?: string;
      ref: ResourceRef;
      projection: Record<string, unknown>;
      evaluationRef?: ResourceRef;
    }>;
    operationId?: string;
  }
) {
  const { data, error } = await resourceDb(context.admin).rpc(
    "career_publish_result_set_v1",
    {
      p_user_id: context.userId,
      p_id: input.id ?? crypto.randomUUID(),
      p_expected_revision: input.expectedRevision ?? 0,
      p_title: input.title ?? null,
      p_manifest: {
        ...input.manifest,
        fields: [
          ...new Set(
            input.items.flatMap((item) => Object.keys(item.projection))
          ),
        ],
      },
      p_items: input.items,
      p_operation_id: input.operationId ?? null,
    }
  );
  databaseError(error);
  return z
    .object({ setId: z.string(), revision: z.number(), count: z.number() })
    .parse(data);
}
export async function readSet(
  context: ResourceContext,
  input: {
    setId: string;
    revision: number;
    cursor?: string;
    limit?: number;
    selector?: Extract<Selection, { setId: string }>["selector"];
  }
) {
  const db = resourceDb(context.admin),
    page = pageInput(input.cursor, input.limit);
  const meta = await db
    .from("career_result_sets")
    .select("*")
    .eq("id", input.setId)
    .eq("revision", input.revision)
    .eq("talent_id", context.userId)
    .maybeSingle();
  databaseError(meta.error);
  if (!meta.data) throw new ResourceError("Set unavailable.", 404);
  const { data, error } = await db.rpc("career_read_result_items_v1", {
    p_user: context.userId,
    p_set: input.setId,
    p_revision: input.revision,
    p_selector: input.selector ?? {},
    p_offset: page.offset,
    p_limit: page.limit + 1,
  });
  databaseError(error);
  const result = rows(data),
    visible = result.slice(0, page.limit).map(itemFromRow);
  const items = await Promise.all(
    visible.map(async (item) => {
      if (
        !(await resourceAvailable(context, item.ref)) ||
        (item.evaluationRef &&
          !(await resourceAvailable(context, item.evaluationRef)))
      )
        return {
          ...item,
          projection: {},
          evaluationRef: undefined,
          unavailable: true,
        };
      return item;
    })
  );
  return {
    setId: input.setId,
    revision: input.revision,
    title: String(record(meta.data).title ?? ""),
    manifest: record(record(meta.data).manifest),
    items,
    total: result.length
      ? Number(result[0].total_count)
      : page.offset === 0
        ? 0
        : null,
    nextCursor:
      result.length > page.limit ? String(page.offset + page.limit) : null,
  };
}
export async function resolveSelection(
  context: ResourceContext,
  raw: Selection,
  signal?: AbortSignal
): Promise<ResourceRef[]> {
  const selection = selectionSchema.parse(raw);
  if ("refs" in selection) {
    for (const ref of selection.refs)
      if (!(await resourceAvailable(context, ref)))
        throw new ResourceError("Selected resource unavailable.", 404);
    return selection.refs;
  }
  const refs: ResourceRef[] = [];
  let cursor: string | undefined;
  do {
    signal?.throwIfAborted();
    const page = await readSet(context, { ...selection, cursor, limit: 500 });
    if (page.items.some((item) => item.unavailable))
      throw new ResourceError(
        "Selection includes an unavailable source. Read the set before executing.",
        409
      );
    refs.push(...page.items.map((item) => item.ref));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return refs;
}
export async function deriveSet(
  context: ResourceContext,
  input: { selection: Extract<Selection, { setId: string }>; title?: string }
) {
  const items: ResultItem[] = [];
  let cursor: string | undefined;
  let manifest: Record<string, unknown> = {};
  do {
    const page = await readSet(context, {
      ...input.selection,
      cursor,
      limit: 500,
    });
    manifest = page.manifest;
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  if (items.some((item) => item.unavailable))
    throw new ResourceError("Selection includes unavailable sources.", 409);
  return publishSet(context, {
    title: input.title,
    manifest: { ...manifest, derivedFrom: input.selection },
    items,
  });
}

export async function readCollection(
  context: ResourceContext,
  selection: Selection,
  cursor?: string
) {
  if ("setId" in selection)
    return readSet(context, { ...selection, cursor, limit: 50 });
  const { readResource } = await import("./read");
  const { requestUuid } = await import("./types");
  const { offset, limit } = pageInput(cursor, 50);
  const items = await Promise.all(
    selection.refs.slice(offset, offset + limit).map(async (ref) => {
      const source = await readResource(context, ref);
      return {
        itemId: requestUuid(JSON.stringify(ref)),
        ref: source.ref,
        projection: { title: source.title, ...source.facts },
        unavailable: source.status !== "available",
      };
    })
  );
  return {
    items,
    title: "",
    manifest: { fields: ["title"] },
    total: selection.refs.length,
    nextCursor:
      offset + limit < selection.refs.length ? String(offset + limit) : null,
  };
}

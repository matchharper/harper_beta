import { createHash, randomUUID } from "crypto";
import { client as openaiClient } from "@/lib/llm/llm";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export const TALENT_CONTEXT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_TALENT_MEMORY_CONTEXT_TOKEN_BUDGET = 1_000;
const DEFAULT_MEMORY_READ_LIMIT = 12;
const MAX_MEMORY_READ_LIMIT = 40;
const MAX_AGENT_CONTEXT_READ_TOKEN_BUDGET = 6_000;
const UNINDEXED_MEMORY_PRIORITY_LIMIT = 4;

export const TALENT_CONTEXT_READ_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    collection: {
      type: "string",
      enum: ["brief", "memory"],
      description:
        "Which saved context collection to read. Defaults to memory.",
    },
    query: {
      type: "string",
      maxLength: 4000,
      description:
        "Natural-language description of the context needed for the current conversation or opportunity. Prefer this for Memory search.",
    },
    refs: {
      type: "array",
      maxItems: 12,
      items: { type: "integer", minimum: 1 },
      description:
        "Exact short refs shown in the current context or a previous read result.",
    },
    cursor: {
      type: "integer",
      minimum: 1,
      description:
        "nextCursor from a previous result when more rows are needed.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 40,
    },
  },
  additionalProperties: false,
} as const;

export const TALENT_CONTEXT_WRITE_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      description:
        "All context changes from the current user message, applied atomically.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "update", "delete"] },
          collection: {
            type: "string",
            enum: ["brief", "memory"],
            description: "Required only for add.",
          },
          ref: {
            type: "integer",
            minimum: 1,
            description:
              "Required for update or delete; use a shown short ref.",
          },
          label: {
            type: "string",
            maxLength: 160,
            description:
              "Free-form user-readable title. Required for a new Brief; optional when renaming an existing Brief. Never create a key or choose from a fixed category list.",
          },
          content: {
            type: "string",
            maxLength: 8000,
            description:
              "Complete saved wording. Required for add; for update provide the complete new row content, not a partial edit.",
          },
        },
        required: ["op"],
        additionalProperties: false,
      },
    },
  },
  required: ["changes"],
  additionalProperties: false,
} as const;

export type TalentContextCollection = "brief" | "memory";

export type TalentContextSourceRef = {
  conversationId?: string | null;
  messageId?: number | string | null;
  type: string;
};

export type TalentContextRow = {
  collection: TalentContextCollection;
  content: string;
  created_at: string;
  deleted_at: string | null;
  id: number;
  key: string | null;
  label: string | null;
  ref: number;
  revision: number;
  source_refs: TalentContextSourceRef[];
  talent_id: string;
  updated_at: string;
};

export type TalentContextResponse = {
  collection: TalentContextCollection;
  content: string;
  createdAt: string;
  id: number;
  key: string | null;
  label: string | null;
  ref: number;
  revision: number;
  updatedAt: string;
};

export type TalentContextAgentChange =
  | {
      collection: TalentContextCollection;
      content: string;
      key?: string | null;
      label?: string | null;
      op: "add";
    }
  | {
      content?: string;
      label?: string;
      op: "update";
      ref: number;
    }
  | { op: "delete"; ref: number };

export type TalentContextDirectChange =
  | {
      collection: TalentContextCollection;
      content: string;
      key?: string | null;
      label?: string | null;
      op: "add";
    }
  | {
      content?: string;
      expectedRevision: number;
      id: number;
      label?: string;
      op: "update";
    }
  | {
      expectedRevision: number;
      id: number;
      op: "delete";
    };

export type TalentContextPromptSnapshot = {
  allBriefs: TalentContextRow[];
  briefs: TalentContextRow[];
  memories: TalentContextRow[];
  memorySelection: "all" | "semantic" | "recent_fallback";
  memoryTruncated: boolean;
};

type TalentContextMutationRow = Omit<TalentContextRow, "source_refs"> & {
  change_index?: number;
  op?: string;
  source_refs: unknown;
};

const normalizeText = (value: unknown, maxLength: number) =>
  typeof value === "string"
    ? value.replace(/\r/g, "").trim().slice(0, maxLength)
    : "";

function normalizeWritableText(
  value: unknown,
  maxLength: number,
  fieldName: string
) {
  const text = typeof value === "string" ? value.replace(/\r/g, "").trim() : "";
  if (Array.from(text).length > maxLength) {
    throw new Error(`${fieldName} exceeds the maximum length of ${maxLength}`);
  }
  return text;
}

const normalizeCollection = (value: unknown): TalentContextCollection | null =>
  value === "brief" || value === "memory" ? value : null;

const normalizeSourceRefs = (value: unknown): TalentContextSourceRef[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const type = normalizeText(record.type, 100);
    if (!type) return [];
    return [
      {
        type,
        ...(record.conversationId === undefined
          ? {}
          : { conversationId: String(record.conversationId ?? "") || null }),
        ...(record.messageId === undefined
          ? {}
          : {
              messageId: (record.messageId as number | string | null) ?? null,
            }),
      },
    ];
  });
};

export function normalizeTalentContextRow(
  value: unknown
): TalentContextRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const collection = normalizeCollection(row.collection);
  const id = Number(row.id);
  const ref = Number(row.ref);
  const revision = Number(row.revision);
  const content = normalizeText(row.content, 8_000);
  const label = normalizeText(row.label, 160) || null;
  const talentId = normalizeText(row.talent_id, 100);
  if (
    !collection ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    !Number.isSafeInteger(ref) ||
    ref <= 0 ||
    !content ||
    !talentId ||
    (collection === "brief" && !label)
  ) {
    return null;
  }
  return {
    collection,
    content,
    created_at: normalizeText(row.created_at, 100),
    deleted_at: normalizeText(row.deleted_at, 100) || null,
    id,
    key: normalizeText(row.key, 160) || null,
    label: collection === "brief" ? label : null,
    ref,
    revision,
    source_refs: normalizeSourceRefs(row.source_refs),
    talent_id: talentId,
    updated_at: normalizeText(row.updated_at, 100),
  };
}

export function toTalentContextResponse(
  row: TalentContextRow
): TalentContextResponse {
  return {
    collection: row.collection,
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    key: row.key,
    label: row.label,
    ref: row.ref,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function normalizeRows(value: unknown): TalentContextRow[] {
  return Array.isArray(value)
    ? value
        .map(normalizeTalentContextRow)
        .filter((row): row is TalentContextRow => Boolean(row))
    : [];
}

const TALENT_CONTEXT_SELECT =
  "id, talent_id, ref, collection, label, key, content, source_refs, revision, created_at, updated_at, deleted_at";

export async function fetchTalentContexts(args: {
  admin: TalentAdminClient;
  beforeId?: number | null;
  collection?: TalentContextCollection | null;
  includeDeleted?: boolean;
  limit?: number;
  order?: "id" | "updated_at";
  userId: string;
}) {
  const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
  let query = (args.admin.from("talent_contexts" as never) as any)
    .select(TALENT_CONTEXT_SELECT)
    .eq("talent_id", args.userId);
  if (args.collection) query = query.eq("collection", args.collection);
  if (!args.includeDeleted) query = query.is("deleted_at", null);
  if (args.beforeId) query = query.lt("id", args.beforeId);
  const orderedQuery =
    args.order === "id"
      ? query.order("id", { ascending: false })
      : query
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false });
  const { data, error } = await orderedQuery.limit(limit);
  if (error) {
    throw new Error(error.message ?? "Failed to load talent contexts");
  }
  return normalizeRows(data);
}

export async function fetchAllTalentContexts(args: {
  admin: TalentAdminClient;
  collection?: TalentContextCollection | null;
  includeDeleted?: boolean;
  userId: string;
}) {
  const rows: TalentContextRow[] = [];
  let beforeId: number | null = null;
  do {
    const page = await fetchTalentContexts({
      admin: args.admin,
      beforeId,
      collection: args.collection,
      includeDeleted: args.includeDeleted,
      limit: 500,
      order: "id",
      userId: args.userId,
    });
    rows.push(...page);
    beforeId = page.length === 500 ? (page.at(-1)?.id ?? null) : null;
  } while (beforeId);
  // Brief is a compact user-visible document. Keep its stable ref order so
  // prompt and UI do not reshuffle when an existing item is edited.
  return args.collection === "brief"
    ? rows.sort((left, right) => left.ref - right.ref)
    : rows;
}

export async function fetchTalentContextsUpdatedAt(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { data, error } = await (
    args.admin.from("talent_contexts" as never) as any
  )
    .select("updated_at")
    .eq("talent_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load talent context timestamp");
  }
  return normalizeText(data?.updated_at, 100) || null;
}

export async function fetchTalentContextsByRefs(args: {
  admin: TalentAdminClient;
  refs: number[];
  userId: string;
}) {
  const refs = Array.from(
    new Set(args.refs.filter((ref) => Number.isSafeInteger(ref) && ref > 0))
  ).slice(0, 40);
  if (refs.length === 0) return [];
  const { data, error } = await (
    args.admin.from("talent_contexts" as never) as any
  )
    .select(TALENT_CONTEXT_SELECT)
    .eq("talent_id", args.userId)
    .is("deleted_at", null)
    .in("ref", refs);
  if (error) {
    throw new Error(error.message ?? "Failed to load talent context refs");
  }
  const rows = normalizeRows(data);
  const order = new Map(refs.map((ref, index) => [ref, index]));
  return rows.sort(
    (left, right) =>
      (order.get(left.ref) ?? 999) - (order.get(right.ref) ?? 999)
  );
}

export function projectBriefsToLegacyInsights(rows: TalentContextRow[]) {
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.collection !== "brief" || !row.key || row.deleted_at) continue;
    result[row.key] = row.content;
  }
  return result;
}

export function getTalentContextsUpdatedAt(rows: TalentContextRow[]) {
  return (
    rows
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  );
}

function estimateTalentContextTextTokens(text: string) {
  let estimate = 0;
  for (const character of text) {
    estimate += character.codePointAt(0)! <= 0x7f ? 0.25 : 1;
  }
  return Math.max(1, Math.ceil(estimate));
}

function estimateTalentContextTokens(row: TalentContextRow) {
  const text =
    row.collection === "brief" ? `${row.label}: ${row.content}` : row.content;
  return estimateTalentContextTextTokens(text);
}

function fitRowsToTokenBudget(
  rows: TalentContextRow[],
  budget: number,
  options?: { preserveFirstRow?: boolean }
) {
  const selected: TalentContextRow[] = [];
  let used = 0;
  for (const row of rows) {
    const cost = estimateTalentContextTokens(row);
    if (selected.length === 0 && cost > budget) {
      if (options?.preserveFirstRow) {
        return { rows: [row], truncated: rows.length > 1 };
      }
      const suffix = "… [일부 생략됨; 전체 내용은 이 ref로 다시 조회]";
      const characters = Array.from(row.content);
      let low = 1;
      let high = characters.length;
      let contentChars = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = {
          ...row,
          content: `${characters.slice(0, middle).join("").trimEnd()}${suffix}`,
        };
        if (estimateTalentContextTokens(candidate) <= budget) {
          contentChars = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      selected.push({
        ...row,
        content: `${characters
          .slice(0, contentChars)
          .join("")
          .trimEnd()}${suffix}`,
      });
      return { rows: selected, truncated: true };
    }
    if (selected.length > 0 && used + cost > budget) break;
    selected.push(row);
    used += cost;
    if (used >= budget) break;
  }
  return { rows: selected, truncated: selected.length < rows.length };
}

export function normalizeTalentContextEmbeddingInput(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function buildTalentMemoryRetrievalQuery(
  parts: Array<string | null | undefined>,
  maxLength = 8_000
) {
  const normalized = parts
    .map((part) => normalizeTalentContextEmbeddingInput(String(part ?? "")))
    .filter(Boolean)
    .join("\n");
  const characters = Array.from(normalized);
  if (characters.length <= maxLength) return normalized;
  // Retrieval context is ordered oldest to newest. Preserve the latest turn and
  // the nearest preceding context when a long conversation exceeds the bound.
  return characters.slice(-maxLength).join("");
}

export function hashTalentContextEmbeddingInput(value: string) {
  return createHash("sha256")
    .update(normalizeTalentContextEmbeddingInput(value), "utf8")
    .digest("hex");
}

export function createTalentContextMutationRequestId(parts: unknown[]) {
  return createHash("sha256")
    .update(JSON.stringify(parts), "utf8")
    .digest("hex")
    .slice(0, 40);
}

async function embedTalentContextTexts(values: string[]) {
  const inputs = values
    .map(normalizeTalentContextEmbeddingInput)
    .filter(Boolean);
  if (inputs.length === 0) return [];
  const response = await openaiClient.embeddings.create({
    input: inputs,
    model: TALENT_CONTEXT_EMBEDDING_MODEL,
  });
  return response.data.map((item) => item.embedding);
}

async function semanticMemoryLookup(args: {
  admin: TalentAdminClient;
  limit: number;
  query: string;
  userId: string;
}) {
  const [embedding] = await embedTalentContextTexts([args.query]);
  if (!embedding?.length) return [];
  const { data, error } = await args.admin.rpc(
    "match_talent_context_memories",
    {
      p_embedding_model: TALENT_CONTEXT_EMBEDDING_MODEL,
      p_match_count: args.limit,
      p_query_embedding: embedding,
      p_talent_id: args.userId,
    }
  );
  if (error)
    throw new Error(error.message ?? "Failed to search talent memories");
  return normalizeRows(data);
}

async function fetchUnindexedMemoryContexts(args: {
  admin: TalentAdminClient;
  limit?: number;
  userId: string;
}) {
  const limit = Math.max(
    1,
    Math.min(
      args.limit ?? UNINDEXED_MEMORY_PRIORITY_LIMIT,
      MAX_MEMORY_READ_LIMIT
    )
  );
  const { data, error } = await (
    args.admin.from("talent_contexts" as never) as any
  )
    .select(TALENT_CONTEXT_SELECT)
    .eq("talent_id", args.userId)
    .eq("collection", "memory")
    .is("deleted_at", null)
    .or(
      `embedding.is.null,embedding_model.is.null,embedding_model.neq.${TALENT_CONTEXT_EMBEDDING_MODEL}`
    )
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message ?? "Failed to load unindexed memories");
  }
  return normalizeRows(data);
}

function mergeUniqueTalentContextRows(...groups: TalentContextRow[][]) {
  const seen = new Set<number>();
  return groups.flatMap((rows) =>
    rows.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
  );
}

export async function fetchTalentContextPromptSnapshot(args: {
  admin: TalentAdminClient;
  memoryTokenBudget?: number;
  query?: string | null;
  userId: string;
}): Promise<TalentContextPromptSnapshot> {
  const memoryTokenBudget = Math.max(
    200,
    Math.min(
      args.memoryTokenBudget ?? DEFAULT_TALENT_MEMORY_CONTEXT_TOKEN_BUDGET,
      4_000
    )
  );
  const [allBriefs, recentMemories, unindexedMemories] = await Promise.all([
    fetchAllTalentContexts({
      admin: args.admin,
      collection: "brief",
      userId: args.userId,
    }),
    fetchTalentContexts({
      admin: args.admin,
      collection: "memory",
      limit: MAX_MEMORY_READ_LIMIT + 1,
      userId: args.userId,
    }),
    fetchUnindexedMemoryContexts({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);
  const briefs = allBriefs;
  const allFit =
    recentMemories.length <= MAX_MEMORY_READ_LIMIT &&
    recentMemories.reduce(
      (sum, row) => sum + estimateTalentContextTokens(row),
      0
    ) <= memoryTokenBudget;
  if (allFit) {
    return {
      allBriefs,
      briefs,
      memories: recentMemories,
      memorySelection: "all",
      memoryTruncated: false,
    };
  }

  const query = buildTalentMemoryRetrievalQuery([args.query]);
  if (query) {
    try {
      const semanticRows = await semanticMemoryLookup({
        admin: args.admin,
        limit: DEFAULT_MEMORY_READ_LIMIT * 2,
        query,
        userId: args.userId,
      });
      const fitted = fitRowsToTokenBudget(
        mergeUniqueTalentContextRows(unindexedMemories, semanticRows),
        memoryTokenBudget
      );
      if (fitted.rows.length > 0) {
        return {
          allBriefs,
          briefs,
          memories: fitted.rows,
          memorySelection: "semantic",
          memoryTruncated:
            fitted.truncated || recentMemories.length > fitted.rows.length,
        };
      }
    } catch (error) {
      console.error("[talent-contexts] semantic memory lookup failed", error);
    }
  }

  const fitted = fitRowsToTokenBudget(recentMemories, memoryTokenBudget);
  return {
    allBriefs,
    briefs,
    memories: fitted.rows,
    memorySelection: "recent_fallback",
    memoryTruncated: true,
  };
}

export function renderTalentContextPrompt(
  snapshot: TalentContextPromptSnapshot,
  options?: { includeCompatibilityKeys?: boolean }
) {
  const briefLines = snapshot.briefs.map((row) => {
    const compatibilityKey =
      options?.includeCompatibilityKeys && row.key
        ? ` (onboarding key: ${row.key})`
        : "";
    return `[${row.ref}] ${row.label}${compatibilityKey}: ${row.content}`;
  });
  const memoryLines = snapshot.memories.map(
    (row) => `[${row.ref}] ${row.content}`
  );
  const memoryHeading =
    snapshot.memorySelection === "recent_fallback"
      ? "Recent memories — 관련 검색을 사용할 수 없어 최근 맥락 일부를 제공함"
      : "Relevant memories — 참고 맥락";
  return [
    "Search Brief — 현재 탐색 기준",
    briefLines.length > 0 ? briefLines.join("\n") : "(저장된 탐색 기준 없음)",
    "",
    memoryHeading,
    memoryLines.length > 0 ? memoryLines.join("\n") : "(제공된 기억 없음)",
    snapshot.memoryTruncated
      ? "Memory는 일부만 제공됐다. 더 필요한 맥락은 read_talent_context로 조회할 수 있다."
      : "",
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n")
    .trim();
}

function normalizeDirectChanges(
  changes: TalentContextDirectChange[],
  sourceRefs: TalentContextSourceRef[]
) {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 20) {
    throw new Error("changes must contain between 1 and 20 items");
  }
  return changes.map((change) => {
    if (change.op === "add") {
      const collection = normalizeCollection(change.collection);
      const content = normalizeWritableText(change.content, 8_000, "content");
      const label = normalizeWritableText(change.label, 160, "label");
      const key =
        normalizeWritableText(change.key, 160, "compatibility key") || null;
      if (!collection || !content || (collection === "brief" && !label)) {
        throw new Error("Invalid talent context add change");
      }
      return {
        collection,
        content,
        ...(collection === "brief" ? { label, ...(key ? { key } : {}) } : {}),
        op: "add",
        source_refs: sourceRefs,
      };
    }
    const id = Number(change.id);
    const expectedRevision = Number(change.expectedRevision);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision <= 0
    ) {
      throw new Error("Invalid talent context row or revision");
    }
    if (change.op === "delete") {
      return { expected_revision: expectedRevision, id, op: "delete" };
    }
    const hasContent = Object.prototype.hasOwnProperty.call(change, "content");
    const hasLabel = Object.prototype.hasOwnProperty.call(change, "label");
    const content = hasContent
      ? normalizeWritableText(change.content, 8_000, "content")
      : undefined;
    const label = hasLabel
      ? normalizeWritableText(change.label, 160, "label")
      : undefined;
    if (
      (!hasContent && !hasLabel) ||
      (hasContent && !content) ||
      (hasLabel && !label)
    ) {
      throw new Error("Invalid talent context update change");
    }
    return {
      ...(hasContent ? { content } : {}),
      expected_revision: expectedRevision,
      id,
      ...(hasLabel ? { label } : {}),
      op: "update",
      ...(sourceRefs.length > 0 ? { source_refs: sourceRefs } : {}),
    };
  });
}

export async function mutateTalentContexts(args: {
  admin: TalentAdminClient;
  changes: TalentContextDirectChange[];
  requestId?: string;
  sourceRefs?: TalentContextSourceRef[];
  userId: string;
}) {
  const changes = normalizeDirectChanges(args.changes, args.sourceRefs ?? []);
  const requestId =
    normalizeWritableText(args.requestId, 240, "requestId") || randomUUID();
  const { data, error } = await args.admin.rpc("mutate_talent_contexts", {
    p_changes: changes,
    p_request_id: requestId,
    p_talent_id: args.userId,
  });
  if (error)
    throw new Error(error.message ?? "Failed to update talent contexts");
  const applied = normalizeRows(
    (data as { applied?: unknown } | null)?.applied
  );
  return { applied, requestId };
}

export async function mutateTalentContextsFromAgent(args: {
  admin: TalentAdminClient;
  changes: TalentContextAgentChange[];
  referencedRows: TalentContextRow[];
  requestId: string;
  sourceRefs?: TalentContextSourceRef[];
  userId: string;
}) {
  const directChanges: TalentContextDirectChange[] = args.changes.map(
    (change) => {
      if (change.op === "add") return change;
      const row = args.referencedRows.find(
        (candidate) => candidate.ref === Number(change.ref)
      );
      if (!row || row.deleted_at) {
        throw new Error(
          `Unknown or unavailable talent context ref: ${change.ref}`
        );
      }
      if (change.op === "delete") {
        return {
          expectedRevision: row.revision,
          id: row.id,
          op: "delete",
        };
      }
      return {
        ...(Object.prototype.hasOwnProperty.call(change, "content")
          ? { content: change.content }
          : {}),
        expectedRevision: row.revision,
        id: row.id,
        ...(Object.prototype.hasOwnProperty.call(change, "label")
          ? { label: change.label }
          : {}),
        op: "update",
      };
    }
  );
  const result = await mutateTalentContexts({
    admin: args.admin,
    changes: directChanges,
    requestId: args.requestId,
    sourceRefs: args.sourceRefs,
    userId: args.userId,
  });
  return {
    applied: result.applied.map((row) => ({ ref: row.ref })),
    changedIds: result.applied.map((row) => row.id),
  };
}

export async function readTalentContextsForAgent(args: {
  admin: TalentAdminClient;
  beforeId?: number | null;
  collection?: TalentContextCollection | null;
  limit?: number;
  query?: string | null;
  refs?: number[];
  userId: string;
}) {
  let rows: TalentContextRow[];
  const refs = Array.isArray(args.refs) ? args.refs : [];
  const exactRefRead = refs.length > 0;
  const semanticRead =
    !exactRefRead &&
    (args.collection ?? "memory") === "memory" &&
    Boolean(normalizeText(args.query, 4_000));
  let semanticReadIsPartial = false;
  if (exactRefRead) {
    rows = await fetchTalentContextsByRefs({
      admin: args.admin,
      refs: refs.map(Number),
      userId: args.userId,
    });
  } else if (semanticRead) {
    try {
      const limit = Math.max(
        1,
        Math.min(args.limit ?? DEFAULT_MEMORY_READ_LIMIT, MAX_MEMORY_READ_LIMIT)
      );
      const [semanticRows, recentRows, unindexedRows] = await Promise.all([
        semanticMemoryLookup({
          admin: args.admin,
          limit,
          query: normalizeText(args.query, 4_000),
          userId: args.userId,
        }),
        fetchTalentContexts({
          admin: args.admin,
          collection: "memory",
          limit: limit + 1,
          userId: args.userId,
        }),
        fetchUnindexedMemoryContexts({
          admin: args.admin,
          limit: Math.min(limit, UNINDEXED_MEMORY_PRIORITY_LIMIT),
          userId: args.userId,
        }),
      ]);
      semanticReadIsPartial = recentRows.length > limit;
      rows = semanticReadIsPartial
        ? mergeUniqueTalentContextRows(unindexedRows, semanticRows).slice(
            0,
            limit
          )
        : recentRows;
    } catch (error) {
      console.error("[talent-contexts] agent memory search failed", error);
      rows = await fetchTalentContexts({
        admin: args.admin,
        beforeId: args.beforeId,
        collection: "memory",
        limit: args.limit ?? DEFAULT_MEMORY_READ_LIMIT,
        order: "id",
        userId: args.userId,
      });
      semanticReadIsPartial =
        rows.length >=
        Math.max(
          1,
          Math.min(
            args.limit ?? DEFAULT_MEMORY_READ_LIMIT,
            MAX_MEMORY_READ_LIMIT
          )
        );
    }
  } else {
    rows = await fetchTalentContexts({
      admin: args.admin,
      beforeId: args.beforeId,
      collection: args.collection ?? "memory",
      limit: args.limit ?? DEFAULT_MEMORY_READ_LIMIT,
      order: "id",
      userId: args.userId,
    });
  }
  const paginatedRead = !exactRefRead && !semanticRead;
  const fitted = fitRowsToTokenBudget(
    rows,
    MAX_AGENT_CONTEXT_READ_TOKEN_BUDGET,
    {
      // An exact ref read is the escape hatch for a row that was shortened in
      // default context. Preserve at least that full row instead of returning the
      // same shortened text indefinitely.
      preserveFirstRow: exactRefRead,
    }
  );
  return {
    hasMore:
      fitted.truncated ||
      semanticReadIsPartial ||
      (paginatedRead &&
        rows.length >=
          Math.max(
            1,
            Math.min(
              args.limit ?? DEFAULT_MEMORY_READ_LIMIT,
              MAX_MEMORY_READ_LIMIT
            )
          )),
    items: fitted.rows.map((row) => ({
      collection: row.collection,
      content: row.content,
      ...(row.label ? { label: row.label } : {}),
      ref: row.ref,
    })),
    nextCursor: paginatedRead ? (fitted.rows.at(-1)?.id ?? null) : null,
    truncated: fitted.truncated,
  };
}

async function refreshTalentContextEmbeddingsOnce(args: {
  admin: TalentAdminClient;
  ids: number[];
  userId: string;
}) {
  const ids = Array.from(
    new Set(args.ids.filter((id) => Number.isSafeInteger(id) && id > 0))
  ).slice(0, 20);
  if (ids.length === 0) return;
  const { data, error } = await (
    args.admin.from("talent_contexts" as never) as any
  )
    .select("id, content, embedding_content_hash")
    .eq("talent_id", args.userId)
    .eq("collection", "memory")
    .is("deleted_at", null)
    .in("id", ids);
  if (error)
    throw new Error(error.message ?? "Failed to load memory embeddings");
  const rows = Array.isArray(data)
    ? data
        .map((row) => ({
          content: String(row.content ?? ""),
          embeddingInput: normalizeTalentContextEmbeddingInput(
            String(row.content ?? "")
          ),
          embeddingHash: normalizeText(row.embedding_content_hash, 100),
          id: Number(row.id),
        }))
        .filter((row) => row.embeddingInput && Number.isSafeInteger(row.id))
    : [];
  const pending = rows.filter(
    (row) =>
      row.embeddingHash !== hashTalentContextEmbeddingInput(row.embeddingInput)
  );
  if (pending.length === 0) return;
  const embeddings = await embedTalentContextTexts(
    pending.map((row) => row.embeddingInput)
  );
  await Promise.all(
    pending.map(async (row, index) => {
      const embedding = embeddings[index];
      if (!embedding?.length) return;
      const { error: updateError } = await (
        args.admin.from("talent_contexts" as never) as any
      )
        .update({
          embedding,
          embedding_content_hash: hashTalentContextEmbeddingInput(
            row.embeddingInput
          ),
          embedding_model: TALENT_CONTEXT_EMBEDDING_MODEL,
          embedding_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("talent_id", args.userId)
        .eq("content", row.content)
        .is("deleted_at", null);
      if (updateError) {
        throw new Error(
          updateError.message ?? "Failed to save memory embedding"
        );
      }
    })
  );
}

export async function refreshTalentContextEmbeddings(args: {
  admin: TalentAdminClient;
  ids: number[];
  userId: string;
}) {
  try {
    await refreshTalentContextEmbeddingsOnce(args);
  } catch (firstError) {
    console.warn(
      "[talent-contexts] embedding refresh failed; retrying once",
      firstError
    );
    await refreshTalentContextEmbeddingsOnce(args);
  }
}

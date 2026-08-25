import {
  ANSWER_EXAMPLE_EMBEDDING_MODEL,
  embedAnswerExampleUserText,
  hashAnswerExampleUserText,
  normalizeAnswerExampleEmbeddingInput,
  type ServiceAnswerExampleAudience,
} from "@/lib/serviceAnswerExamples";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_USER_EXAMPLE_TEXT_LENGTH = 4000;
const MAX_ANSWER_EXAMPLE_TEXT_LENGTH = 12000;
const MAX_NOTES_LENGTH = 4000;

const ANSWER_EXAMPLE_SELECT_COLUMNS = [
  "id",
  "audience",
  "user_example_text",
  "answer_example_text",
  "tags",
  "enabled",
  "notes",
  "embedding_model",
  "user_example_hash",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type ServiceAnswerExampleRow = {
  answer_example_text: string;
  audience: ServiceAnswerExampleAudience;
  created_at: string;
  created_by: string | null;
  enabled: boolean;
  embedding_model: string;
  id: string;
  notes: string | null;
  tags: string[] | null;
  updated_at: string;
  updated_by: string | null;
  user_example_hash: string;
  user_example_text: string;
};

export type OpsAnswerExampleItem = {
  answerExampleText: string;
  audience: ServiceAnswerExampleAudience;
  createdAt: string;
  createdBy: string | null;
  enabled: boolean;
  embeddingModel: string;
  id: string;
  notes: string | null;
  tags: string[];
  updatedAt: string;
  updatedBy: string | null;
  userExampleHash: string;
  userExampleText: string;
};

export type OpsAnswerExamplesResponse = {
  examples: OpsAnswerExampleItem[];
};

export type OpsAnswerExampleSaveInput = {
  answerExampleText?: unknown;
  audience?: unknown;
  enabled?: unknown;
  id?: unknown;
  notes?: unknown;
  tags?: unknown;
  userExampleText?: unknown;
};

export type OpsAnswerExampleSaveResponse = {
  embeddingUpdated: boolean;
  example: OpsAnswerExampleItem;
  ok: true;
};

function getUntypedAdmin(admin?: AdminClient) {
  return (admin ?? getTalentSupabaseAdmin()) as unknown as {
    from: (table: string) => any;
  };
}

function normalizeOptionalString(value: unknown, maxLength?: number) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (maxLength && trimmed.length > maxLength) {
    throw new Error(`Value must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function normalizeRequiredText(
  value: unknown,
  field: string,
  maxLength: number
) {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizeTags(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawValue of rawValues) {
    const tag = String(rawValue ?? "").trim();
    const lookupKey = tag.toLowerCase();
    if (!tag || seen.has(lookupKey)) continue;
    seen.add(lookupKey);
    tags.push(tag.slice(0, 64));
  }
  return tags.slice(0, 20);
}

function normalizeEnabled(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "enabled"].includes(normalized)) return true;
    if (["false", "0", "no", "disabled"].includes(normalized)) return false;
  }
  return true;
}

function normalizeAudience(value: unknown): ServiceAnswerExampleAudience {
  if (value === "company" || value === "career") return value;
  throw new Error("audience must be company or career");
}

function toOpsAnswerExampleItem(row: ServiceAnswerExampleRow) {
  return {
    answerExampleText: row.answer_example_text,
    audience: row.audience,
    createdAt: row.created_at,
    createdBy: row.created_by,
    enabled: row.enabled,
    embeddingModel: row.embedding_model,
    id: row.id,
    notes: row.notes,
    tags: Array.isArray(row.tags) ? row.tags : [],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    userExampleHash: row.user_example_hash,
    userExampleText: row.user_example_text,
  } satisfies OpsAnswerExampleItem;
}

export async function fetchOpsAnswerExamples(args?: {
  admin?: AdminClient;
  limit?: number;
  query?: string | null;
}): Promise<OpsAnswerExamplesResponse> {
  const admin = getUntypedAdmin(args?.admin);
  const limit = Math.max(1, Math.min(args?.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const normalizedQuery = normalizeOptionalString(args?.query);

  const { data, error } = await admin
    .from("service_answer_examples")
    .select(ANSWER_EXAMPLE_SELECT_COLUMNS)
    .order("enabled", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load answer examples");
  }

  let examples = ((data ?? []) as ServiceAnswerExampleRow[]).map(
    toOpsAnswerExampleItem
  );

  if (normalizedQuery) {
    const lowerQuery = normalizedQuery.toLowerCase();
    examples = examples.filter((example) =>
      [
        example.userExampleText,
        example.answerExampleText,
        example.audience,
        example.notes ?? "",
        example.tags.join(" "),
      ]
        .join("\n")
        .toLowerCase()
        .includes(lowerQuery)
    );
  }

  return { examples };
}

export async function saveOpsAnswerExample(args: {
  admin?: AdminClient;
  actorEmail?: string | null;
  input: OpsAnswerExampleSaveInput;
}): Promise<OpsAnswerExampleSaveResponse> {
  const admin = getUntypedAdmin(args.admin);
  const id = normalizeOptionalString(args.input.id);
  const userExampleText = normalizeRequiredText(
    args.input.userExampleText,
    "userExampleText",
    MAX_USER_EXAMPLE_TEXT_LENGTH
  );
  const answerExampleText = normalizeRequiredText(
    args.input.answerExampleText,
    "answerExampleText",
    MAX_ANSWER_EXAMPLE_TEXT_LENGTH
  );
  const audience = normalizeAudience(args.input.audience);
  const notes = normalizeOptionalString(args.input.notes, MAX_NOTES_LENGTH);
  const tags = normalizeTags(args.input.tags);
  const enabled =
    args.input.enabled === undefined
      ? true
      : normalizeEnabled(args.input.enabled);
  const actorEmail = normalizeOptionalString(args.actorEmail);
  const userExampleHash = hashAnswerExampleUserText(userExampleText);

  let existing: ServiceAnswerExampleRow | null = null;
  if (id) {
    const { data, error } = await admin
      .from("service_answer_examples")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message ?? "Failed to load answer example");
    }
    if (!data) {
      throw new Error("Answer example not found");
    }
    existing = data as ServiceAnswerExampleRow;
  }

  const shouldRefreshEmbedding =
    !existing ||
    existing.user_example_hash !== userExampleHash ||
    existing.embedding_model !== ANSWER_EXAMPLE_EMBEDDING_MODEL;

  let embeddingPayload: {
    embedding: number[];
    embeddingModel: string;
    userExampleHash: string;
  } | null = null;

  if (shouldRefreshEmbedding) {
    embeddingPayload = await embedAnswerExampleUserText(userExampleText);
  }

  const basePayload = {
    answer_example_text: answerExampleText,
    audience,
    enabled,
    notes,
    tags,
    updated_by: actorEmail,
    user_example_hash: userExampleHash,
    user_example_text: normalizeAnswerExampleEmbeddingInput(userExampleText),
  };

  const payload = embeddingPayload
    ? {
        ...basePayload,
        embedding: embeddingPayload.embedding as unknown as string,
        embedding_model: embeddingPayload.embeddingModel,
        user_example_hash: embeddingPayload.userExampleHash,
      }
    : basePayload;

  const query = existing
    ? admin
        .from("service_answer_examples")
        .update(payload)
        .eq("id", existing.id)
        .select(ANSWER_EXAMPLE_SELECT_COLUMNS)
        .single()
    : admin
        .from("service_answer_examples")
        .insert({
          ...payload,
          created_by: actorEmail,
          updated_by: actorEmail,
        })
        .select(ANSWER_EXAMPLE_SELECT_COLUMNS)
        .single();

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to save answer example");
  }

  return {
    embeddingUpdated: shouldRefreshEmbedding,
    example: toOpsAnswerExampleItem(data as ServiceAnswerExampleRow),
    ok: true,
  };
}

export async function deleteOpsAnswerExample(args: {
  admin?: AdminClient;
  id: string;
}) {
  const id = normalizeOptionalString(args.id);
  if (!id) {
    throw new Error("id is required");
  }

  const admin = getUntypedAdmin(args.admin);
  const { error } = await admin
    .from("service_answer_examples")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message ?? "Failed to delete answer example");
  }

  return { id, ok: true };
}

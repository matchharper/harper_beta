import { client as openaiClient } from "@/lib/llm/llm";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TOP_K = 5;

export type ServiceHelpChunkResult = {
  chunk_text: string;
  ui_target: string | null;
  source_doc_title: string | null;
  score: number;
};

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type MatchRow = {
  chunk_text: string;
  ui_target: string | null;
  source_doc_title: string | null;
  score: number | null;
};

/**
 * Embed the user question and retrieve the top-K most similar chunks
 * from the `service_help_chunks` corpus via the
 * `match_service_help_chunks` RPC (cosine distance).
 *
 * Graceful degradation: on embed/query failure, returns
 * `{ chunks: [] }` so the LLM can naturally explain the miss.
 */
export async function lookupServiceHelp(
  question: string,
  options?: { admin?: AdminClient; topK?: number }
): Promise<{ chunks: ServiceHelpChunkResult[] }> {
  const trimmed = (question ?? "").trim();
  if (!trimmed) {
    return { chunks: [] };
  }

  const topK = options?.topK ?? DEFAULT_TOP_K;
  const admin = options?.admin ?? getTalentSupabaseAdmin();

  let embedding: number[];
  try {
    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
    });
    embedding = response.data[0]?.embedding ?? [];
    if (embedding.length === 0) {
      throw new Error("OpenAI returned empty embedding");
    }
  } catch (error) {
    console.error("[serviceHelpRag] embedding failed:", error);
    return { chunks: [] };
  }

  const { data, error } = (await (admin as any).rpc(
    "match_service_help_chunks",
    {
      query_embedding: embedding,
      match_count: topK,
    }
  )) as {
    data: MatchRow[] | null;
    error: { message?: string } | null;
  };

  if (error) {
    console.error(
      "[serviceHelpRag] match_service_help_chunks failed:",
      error.message ?? "unknown"
    );
    return { chunks: [] };
  }

  const rows = (data ?? []) as MatchRow[];
  const chunks: ServiceHelpChunkResult[] = rows.map((row) => ({
    chunk_text: row.chunk_text,
    ui_target: row.ui_target,
    source_doc_title: row.source_doc_title,
    score:
      typeof row.score === "number" && Number.isFinite(row.score)
        ? row.score
        : 0,
  }));

  return { chunks };
}

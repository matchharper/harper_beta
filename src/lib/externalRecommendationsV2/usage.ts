import { getLlmUsageContext } from "../llm/usageContext";
import { getTalentSupabaseAdmin } from "../talentOnboarding/admin";

// Decisions has endpoint-specific pricing; never price it as a normal Luna completion.
export function directUsageCost(
  endpoint: "openai_decisions" | "jev_decisions" | "embeddings",
  usage: any
) {
  const reported =
    typeof usage?.cost === "number" && Number.isFinite(usage.cost)
      ? usage.cost
      : null;
  if (reported !== null)
    return { usd: reported, status: "provider_reported" as const };
  const input =
    typeof usage?.input_tokens === "number"
      ? usage.input_tokens
      : usage?.prompt_tokens;
  const cached = Number(usage?.input_tokens_details?.cached_tokens ?? 0);
  if (
    endpoint === "embeddings" &&
    typeof input === "number" &&
    Number.isFinite(input) &&
    input >= 0
  )
    return { usd: (input * 0.02) / 1_000_000, status: "estimated" as const };
  if (
    endpoint === "openai_decisions" &&
    typeof input === "number" &&
    Number.isFinite(input)
  )
    return {
      usd: (Math.max(0, input - cached) * 0.1) / 1000000,
      status: "estimated" as const,
    };
  return { usd: null, status: "unpriced" as const };
}
export async function recordDirectUsage(
  endpoint: "openai_decisions" | "jev_decisions" | "embeddings",
  model: string,
  usage: unknown,
  elapsedMs: number
) {
  const context = getLlmUsageContext();
  if (!context) return; // Offline evaluation owns its own private receipt.
  const cost = directUsageCost(endpoint, usage);
  const { error } = await (
    getTalentSupabaseAdmin().from("llm_logs") as any
  ).insert({
    source: "career_tool",
    model,
    user_id: context.userId,
    estimated_cost_usd: cost.usd ?? 0,
    cost_status: cost.status,
    meta: {
      ...context,
      label: `career_tool:recommend_job_postings:v2_${endpoint}`,
      endpoint,
      usage,
      elapsedMs,
      costStatus: cost.status,
      costKnown: cost.usd !== null,
    },
  });
  if (error)
    console.warn("[external-recommendations] usage receipt unavailable", {
      endpoint,
    });
}

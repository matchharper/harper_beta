import { after } from "next/server";
import { getLlmUsageContext } from "@/lib/llm/usageContext";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import type { Json } from "@/types/database.types";

/** Provider calls have actual attribution and explicit unpriced cost. No mail,
 * calendar payload, credentials, or private search text is copied into usage. */
export async function withProviderUsage<T>(
  provider: string,
  endpoint: string,
  work: () => Promise<T>,
  receipt?: (value: T) => {
    reportedCostUsd?: number | null;
    itemCount?: number;
    version?: string;
  }
) {
  const context = getLlmUsageContext(),
    startedAt = new Date().toISOString(),
    started = Date.now();
  let value: T | undefined;
  let succeeded = false;
  try {
    value = await work();
    succeeded = true;
    return value;
  } finally {
    if (context) {
      const facts =
        succeeded && value !== undefined ? receipt?.(value) : undefined;
      const reportedCost =
        typeof facts?.reportedCostUsd === "number" &&
        Number.isFinite(facts.reportedCostUsd)
          ? facts.reportedCostUsd
          : null;
      const pending = Promise.resolve()
        .then(async () => {
          const { error } = await getTalentSupabaseAdmin()
            .from("logs")
            .insert({
              type: "career_provider_usage",
              user_id: context.userId ?? null,
              meta_data: {
                ...context,
                previewUsage: undefined,
                companyRunUsage: undefined,
                provider,
                endpoint,
                version: facts?.version ?? null,
                executionId: crypto.randomUUID(),
                startedAt,
                completedAt: new Date().toISOString(),
                elapsedMs: Date.now() - started,
                status: succeeded ? "responded" : "failed_or_unknown",
                calls: 1,
                itemCount: facts?.itemCount ?? null,
                costUsd: reportedCost,
                costStatus:
                  reportedCost === null ? "unpriced" : "provider_reported",
              } as unknown as Json,
            });
          if (error) throw error;
        })
        .catch(() =>
          console.warn("[career-provider-usage] receipt unavailable", {
            provider,
            endpoint,
          })
        );
      try {
        after(() => pending);
      } catch {
        await pending;
      }
    }
  }
}

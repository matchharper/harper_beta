import { EXTERNAL_MEASUREMENT_VERSION } from "./measurement";
import { dayKey } from "./calendar";
import { randomUUID } from "node:crypto";
import { send } from "@vercel/queue";
import { after } from "next/server";
import { z } from "zod";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "../talentOnboarding/admin";
import { fetchActiveInitialConversationRun } from "../talentOnboarding/initialRecommendationGuard";
import { fetchTalentPostingCardsByRoleIds } from "../talentOpportunity";
import { withLlmUsageContext } from "../llm/usageContext";
import { updateRun, externalRunContext } from "./runs";
import { loadExternalContext } from "./context";
import { runExternalV2, type EngineArgs } from "./engine";
import { saveSelected } from "./web";
import { V2_RUN_VERSION } from "./contract";

export const DAILY_EXTERNAL_TOPIC = "career-daily-external-v1";

export async function publishDailyRun(runId: string, dispatchKey = runId) {
  if (
    process.env.HARPER_LOCAL_E2E === "1" &&
    process.env.NODE_ENV === "development"
  ) {
    after(() => processDailyRun({ runId }));
    return;
  }
  await send(
    DAILY_EXTERNAL_TOPIC,
    { runId },
    { idempotencyKey: `daily-external:${dispatchKey}`, retentionSeconds: 86400 }
  );
}
export async function startDailyRun(
  admin: TalentAdminClient,
  userId: string,
  timeZone: string,
  locale: string
) {
  // Career's original agent now owns proactive search and list publication.
  // Keep this compatibility export for old clients without producing new daily runs.
  void admin; void userId; void timeZone; void locale;
  return;

}
export async function processDailyRun(
  message: unknown,
  admin = getTalentSupabaseAdmin()
) {
  const { runId } = z.object({ runId: z.string().uuid() }).parse(message);
  const token = randomUUID();
  const { data, error } = await admin.rpc(
    "claim_daily_external_run" as never,
    { p_run_id: runId, p_token: token } as never
  );
  if (error) throw new Error(error.message);
  const run = data as any;
  if (!run?.id) return;
  const patch = async (values: Record<string, unknown>) => {
    const { error } = await (
      admin.from("external_recommendation_runs" as never) as any
    )
      .update({
        ...values,
        ...(values.metrics
          ? {
              metrics: {
                ...(values.metrics as object),
                measurementVersion: EXTERNAL_MEASUREMENT_VERSION,
              },
            }
          : {}),
      })
      .eq("id", runId)
      .eq("lease_token", token);
    if (error) throw new Error(error.message);
  };
  if (run.day_key !== dayKey(run.time_zone)) {
    await patch({ status: "skipped", finished_at: new Date().toISOString() });
    return;
  }
  return withLlmUsageContext({ requestId: runId, userId: run.talent_id }, () =>
    externalRunContext.run({ id: runId, leaseToken: token }, async () => {
      const began = Date.now();
      try {
        const loaded = await loadExternalContext(admin, run.talent_id);
        if (
          !loaded.dailyEnabled ||
          (await fetchActiveInitialConversationRun({
            admin,
            userId: run.talent_id,
          }))
        ) {
          await patch({
            status: "skipped",
            finished_at: new Date().toISOString(),
          });
          return;
        }
        const args: EngineArgs = {
          admin,
          userId: run.talent_id,
          surface: "daily",
          language: run.locale?.startsWith("en") ? "en" : "ko",
          targetCount: 5,
          reuseDefault: true,
          provider: run.provider,
        };
        // A queued control run keeps its lease and daily identity but executes V2.
        await patch({ variant: "v2", experiment: V2_RUN_VERSION });
        let result = await runExternalV2({ ...args, cachedOnly: true });
        const cacheProbe = result.metrics;
        const cacheOnly =
          !result.metrics.cacheInsufficient && result.selected.length > 0;
        if (!cacheOnly) result = await runExternalV2(args);
        await saveSelected(admin, runId, result.selected);
        await patch({
          provider: result.provider,
          metrics: {
            ...result.metrics,
            ...(!cacheOnly ? { cacheProbe } : {}),
            cacheOnly,
            durationMs: Date.now() - began,
          },
          plan: result.plan
            ? { ...result.plan, titleVectors: undefined }
            : null,
        });
      } catch (error) {
        // Bounded retries preserve fit caches and the once-per-day execution identity.
        const { data: current } = await (
          admin.from("external_recommendation_runs" as never) as any
        )
          .select("status")
          .eq("id", runId)
          .single();
        if (current?.status === "completed" || current?.status === "skipped")
          return;
        await patch({
          status: run.attempts >= 3 ? "failed" : "running",
          error: error instanceof Error ? error.message : "Daily search failed",
          finished_at: run.attempts >= 3 ? new Date().toISOString() : null,
          lease_expires_at: new Date().toISOString(),
        });
        throw error;
      }
    })
  );
}
export async function dispatchDailyRuns(admin = getTalentSupabaseAdmin()) {
  const { data, error } = await (
    admin.from("external_recommendation_runs" as never) as any
  )
    .select("id,attempts,lease_expires_at")
    .eq("surface", "daily")
    .eq("status", "running")
    .or(
      `lease_expires_at.is.null,lease_expires_at.lte.${new Date().toISOString()}`
    )
    .limit(50);
  if (error) throw new Error(error.message);
  for (const run of data ?? []) {
    if (run.attempts >= 3) {
      await updateRun(admin, run.id, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error: "Daily search retry limit reached",
      });
      continue;
    }
    await publishDailyRun(
      run.id,
      `${run.id}:${Math.floor(Date.now() / 300000)}`
    );
  }
  return { dispatched: data?.length ?? 0 };
}
export async function dailySnapshot(
  admin: TalentAdminClient,
  userId: string,
  timeZone: string,
  locale: string
) {
  const today = dayKey(timeZone);
  // All completed recommendation surfaces feed the same today-only task spotlight.
  const { data, error } = await (
    admin.from("external_recommendation_runs" as never) as any
  )
    .select(
      "id,status,role_ids,surface,day_key,created_at,finished_at,lease_expires_at"
    )
    .eq("talent_id", userId)
    .gte("created_at", new Date(Date.now() - 48 * 3600000).toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const runs = (data ?? []).filter((r: any) =>
    r.surface === "daily"
      ? r.day_key === today
      : dayKey(timeZone, new Date(r.finished_at ?? r.created_at)) === today
  );
  const running = runs.some(
    (r: any) =>
      r.surface === "daily" &&
      r.status === "running" &&
      r.lease_expires_at != null &&
      new Date(r.lease_expires_at).getTime() > Date.now()
  );
  const roleIds = [
    ...new Set<string>(
      runs
        .filter((r: any) => r.status === "completed")
        .flatMap((r: any) => r.role_ids)
    ),
  ].slice(0, 5);
  const cards = await fetchTalentPostingCardsByRoleIds({
    admin,
    userId,
    locale,
    roleIds,
  });
  return {
    day: today,
    timeZone,
    running,
    roles: cards.map((c) => ({
      roleId: c.roleId,
      companyName: c.companyName,
      companyLogoUrl: c.companyLogoUrl,
      roleTitle: c.title,
    })),
  };
}

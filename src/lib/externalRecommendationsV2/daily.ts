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
import {
  fetchExternalFitCache,
  runCareerJobPostingRecommendations,
  sqlLiteral,
} from "../talentOnboarding/jobPostingRecommendations";
import { withLlmUsageContext } from "../llm/usageContext";
import { createRun, updateRun, externalRunContext, completeRun } from "./runs";
import { loadExternalContext } from "./context";
import {
  hydrate,
  rerankCandidates,
  runExternalV2,
  summary,
  type EngineArgs,
} from "./engine";
import { saveSelected } from "./web";
import {
  eligibilitySql,
  executeSql,
  ROLE_SELECT,
  ROLE_JOINS,
} from "./retrieval";
import { fitProvider, externalVariant } from "./contract";

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
  if (process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT === "off") return;
  const { data: existing, error } = await (
    admin.from("external_recommendation_runs" as never) as any
  )
    .select("id")
    .eq("talent_id", userId)
    .eq("day_key", dayKey(timeZone))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return;
  const loaded = await loadExternalContext(admin, userId);
  if (
    !loaded.dailyEnabled ||
    (await fetchActiveInitialConversationRun({ admin, userId }))
  )
    return;
  try {
    const run = await createRun(admin, userId, "daily", {
      day_key: dayKey(timeZone),
      time_zone: timeZone,
      locale,
      provider: externalVariant(userId) === "v2" ? fitProvider() : null,
    });
    try {
      await publishDailyRun(run.id);
    } catch {
      /* The dispatcher recovers a durable run if queue publishing fails. */
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
  }
}
async function controlCached(args: EngineArgs) {
  const loaded = await loadExternalContext(args.admin, args.userId);
  const rows = await executeSql(
    args.admin,
    `SELECT ${ROLE_SELECT} FROM public.talent_external_fit f JOIN public.company_roles cr ON cr.role_id=f.role_id ${ROLE_JOINS}
    WHERE f.talent_id=${sqlLiteral(args.userId)}::uuid AND f.created_at>now()-interval '30 days'
      AND f.meta<>'{}'::jsonb AND ${eligibilitySql({ userId: args.userId, blockedCompanies: loaded.blockedCompanies })}
    ORDER BY f.created_at DESC`,
    200
  );
  const cards = await hydrate(args, rows);
  const cache = await fetchExternalFitCache({
    admin: args.admin,
    userId: args.userId,
    roleIds: cards.map((c) => c.roleId),
  });
  // Legacy uses a much higher numeric scale. Do not apply this threshold to Decisions.
  const ranked = cards
    .flatMap((card) => {
      const fit = cache.get(card.roleId);
      return fit?.hasScore && fit.score100 >= 70 && summary(card, args.language)
        ? [{ card, fit: { legacyScore: fit.score100 }, score: fit.score100 }]
        : [];
    })
    .sort((a, b) => b.score - a.score);
  if (new Set(ranked.map((r) => r.card.companyWorkspaceId)).size < 5)
    return null;
  return rerankCandidates(args, loaded.context, ranked);
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
  if (
    run.day_key !== dayKey(run.time_zone) ||
    process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT === "off"
  ) {
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
        if (run.variant === "v2") {
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
        } else {
          const cached = await controlCached(args);
          if (cached?.length) await saveSelected(admin, runId, cached);
          else {
            const { data: conversation, error: conversationError } = await admin
              .from("talent_conversations")
              .select("id")
              .eq("user_id", run.talent_id)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (conversationError || !conversation)
              throw new Error("No active career conversation");
            await runCareerJobPostingRecommendations({
              admin,
              userId: run.talent_id,
              conversationId: conversation.id,
              preferredLocale: run.locale,
              request:
                args.language === "ko"
                  ? "현재 프로필과 전체 Search Brief를 기준으로 지금 살펴볼 만한 외부 공고를 최대 5개 추천해주세요."
                  : "Recommend up to five external opportunities worth considering now, based on my current profile and complete Search Brief.",
              strategy: "legacy",
            });
            // Zero results still consume today's attempt and must clear Searching.
            const { data } = await (
              admin.from("external_recommendation_runs" as never) as any
            )
              .select("status")
              .eq("id", runId)
              .single();
            if (data?.status !== "completed")
              await completeRun(admin, runId, []);
          }
          await patch({
            metrics: {
              durationMs: Date.now() - began,
              cacheOnly: Boolean(cached?.length),
            },
          });
        }
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

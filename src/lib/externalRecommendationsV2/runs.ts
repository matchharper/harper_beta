import { EXTERNAL_MEASUREMENT_VERSION } from "./measurement";
import { AsyncLocalStorage } from "node:async_hooks";
import type { TalentAdminClient } from "../talentOnboarding/admin";
import { EXPERIMENT, externalVariant } from "./contract";
export const externalRunContext = new AsyncLocalStorage<{
  id: string;
  leaseToken?: string;
}>();
export async function createRun(
  admin: TalentAdminClient,
  userId: string,
  surface: "web" | "worker" | "daily",
  extra: Record<string, unknown> = {}
) {
  const { data, error } = await (
    admin.from("external_recommendation_runs" as never) as any
  )
    .insert({
      talent_id: userId,
      experiment: EXPERIMENT,
      variant: externalVariant(userId),
      surface,
      ...extra,
      metrics: {
        ...((extra.metrics as object) ?? {}),
        measurementVersion: EXTERNAL_MEASUREMENT_VERSION,
      },
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
export async function updateRun(
  admin: TalentAdminClient,
  id: string,
  patch: Record<string, unknown>
) {
  const { error } = await (
    admin.from("external_recommendation_runs" as never) as any
  )
    .update({
      ...patch,
      ...(patch.metrics
        ? {
            metrics: {
              ...(patch.metrics as object),
              measurementVersion: EXTERNAL_MEASUREMENT_VERSION,
            },
          }
        : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
export async function completeRun(
  admin: TalentAdminClient,
  runId: string,
  rows: unknown[]
) {
  const { data, error } = await admin.rpc(
    "complete_external_recommendation_run" as never,
    {
      p_run_id: runId,
      p_rows: rows,
      p_lease_token: externalRunContext.getStore()?.leaseToken ?? null,
    } as never
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; role_id: string }>;
}

export async function failRun(
  admin: TalentAdminClient,
  id: string,
  error: unknown
) {
  const { error: dbError } = await (
    admin.from("external_recommendation_runs" as never) as any
  )
    .update({
      status: "failed",
      error: error instanceof Error ? error.message : "Search failed",
      finished_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "completed");
  if (dbError)
    console.error("[external-recommendations] failure recording failed", {
      id,
    });
}

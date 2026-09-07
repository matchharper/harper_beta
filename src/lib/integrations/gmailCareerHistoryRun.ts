import "server-only";

import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

export const GMAIL_CAREER_HISTORY_RUN_LOG_TYPE =
  "gmail_career_history_analysis_run";

export type GmailCareerHistoryRunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "completed"
  | "failed";

type GmailCareerHistoryRun = {
  createdAt: string;
  id: number;
  status: GmailCareerHistoryRunStatus;
  updatedAt: string;
};

const RUN_STATUSES = new Set<GmailCareerHistoryRunStatus>([
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
]);
const ACTIVE_RUN_STALE_MS = 60 * 60 * 1_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseRunStatus(value: unknown): GmailCareerHistoryRunStatus | null {
  return typeof value === "string" &&
    RUN_STATUSES.has(value as GmailCareerHistoryRunStatus)
    ? (value as GmailCareerHistoryRunStatus)
    : null;
}

export async function createGmailCareerHistoryRun(args: {
  admin: TalentAdminClient;
  talentId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("logs")
    .insert({
      meta_data: { status: "queued", updatedAt: now },
      type: GMAIL_CAREER_HISTORY_RUN_LOG_TYPE,
      user_id: args.talentId,
    })
    .select("id,created_at")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create Gmail analysis run");
  }
  return { createdAt: data.created_at, id: data.id };
}

export async function updateGmailCareerHistoryRun(args: {
  admin: TalentAdminClient;
  deliveryCount?: number;
  reason?: string;
  runId: number | null;
  status: GmailCareerHistoryRunStatus;
  talentId: string;
}) {
  if (!args.runId) return;
  const updatedAt = new Date().toISOString();
  const { error } = await args.admin
    .from("logs")
    .update({
      meta_data: {
        ...(typeof args.deliveryCount === "number"
          ? { deliveryCount: args.deliveryCount }
          : {}),
        ...(args.reason ? { reason: args.reason.slice(0, 100) } : {}),
        status: args.status,
        updatedAt,
      },
    })
    .eq("id", args.runId)
    .eq("user_id", args.talentId)
    .eq("type", GMAIL_CAREER_HISTORY_RUN_LOG_TYPE);
  if (error) {
    console.warn("[gmail-career-history/run] status update failed", {
      code: error.code,
      runId: args.runId,
      status: args.status,
    });
  }
}

export async function fetchLatestGmailCareerHistoryRun(args: {
  admin: TalentAdminClient;
  talentId: string;
}): Promise<GmailCareerHistoryRun | null> {
  const { data, error } = await args.admin
    .from("logs")
    .select("id,created_at,meta_data")
    .eq("user_id", args.talentId)
    .eq("type", GMAIL_CAREER_HISTORY_RUN_LOG_TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const metadata = asRecord(data.meta_data);
  const status = parseRunStatus(metadata?.status);
  if (!status) return null;
  const updatedAt =
    typeof metadata?.updatedAt === "string" &&
    !Number.isNaN(new Date(metadata.updatedAt).getTime())
      ? metadata.updatedAt
      : data.created_at;
  const isStale =
    (status === "queued" || status === "running" || status === "retrying") &&
    Date.now() - new Date(updatedAt).getTime() > ACTIVE_RUN_STALE_MS;
  return {
    createdAt: data.created_at,
    id: data.id,
    status: isStale ? "failed" : status,
    updatedAt,
  };
}

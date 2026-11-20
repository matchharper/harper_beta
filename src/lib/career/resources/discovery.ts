import { z } from "zod";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  resourceRefSchema,
  resourceDb,
  databaseError,
  record,
  text,
  type ResourceContext,
} from "./types";
import { readResource, formatResource } from "./read";
import type { SourceJob } from "./indexing";

export const discoverySchema = z
  .object({
    delivery_mode: z.enum(["on_change", "scheduled"]),
    queries: z.array(z.string().min(1)).default([]),
    source_refs: z.array(resourceRefSchema).default([]),
    context_refs: z.array(resourceRefSchema).default([]),
  })
  .passthrough();

export async function validateDiscovery(
  context: ResourceContext,
  input: unknown
) {
  const discovery = discoverySchema.parse(input);
  for (const ref of [...discovery.source_refs, ...discovery.context_refs]) {
    if ((await readResource(context, ref)).status !== "available")
      throw new Error("Discovery source unavailable.");
  }
  return discovery;
}

/** This private index is only read by the dispatcher, never by another user's tool. */
export async function discoveryIndexText(
  admin: TalentAdminClient,
  job: SourceJob
) {
  if (!job.ownerId) return null;
  const result = await resourceDb(admin)
    .from("talent_agent_schedules")
    .select("id,title,instruction,target_refs,status")
    .eq("id", job.id)
    .eq("talent_id", job.ownerId)
    .eq("status", "active")
    .maybeSingle();
  databaseError(result.error);
  if (!result.data) return null;
  const row = record(result.data),
    parsed = discoverySchema.safeParse(record(row.target_refs).discovery);
  if (!parsed.success) return null;
  const parts = [
    text(row.title),
    text(row.instruction),
    ...parsed.data.queries,
  ];
  for (const ref of [...parsed.data.source_refs, ...parsed.data.context_refs]) {
    let source = await readResource({ admin, userId: job.ownerId }, ref);
    if (source.status === "version_unavailable" && source.latestRef)
      source = await readResource(
        { admin, userId: job.ownerId },
        source.latestRef
      );
    if (source.status !== "available") return null;
    parts.push(formatResource(source));
  }
  return parts.join("\n\n");
}

export async function dispatchPublicSource(
  admin: TalentAdminClient,
  job: SourceJob,
  lease: string
) {
  const result = await resourceDb(admin).rpc(
    "career_dispatch_public_source_v1",
    {
      p_kind: job.resourceKind,
      p_id: job.id,
      p_revision: job.revision,
      p_lease: lease,
      p_limit: 50,
    }
  );
  databaseError(result.error);
  return record(result.data);
}

export async function admitDiscoveryEvents(
  admin: TalentAdminClient,
  userId: string,
  runId?: string
) {
  const result = await resourceDb(admin).rpc(
    "career_admit_discovery_events_v1",
    { p_user: userId, p_run: runId ?? null }
  );
  databaseError(result.error);
  return result.data;
}

export async function recoverDiscoveryEvents(admin: TalentAdminClient) {
  const result = await resourceDb(admin).rpc(
    "career_pending_discovery_owners_v1",
    { p_limit: 50 }
  );
  databaseError(result.error);
  let admitted = 0;
  for (const row of (result.data ?? []) as Array<{ user_id: string }>) {
    if (await admitDiscoveryEvents(admin, row.user_id)) admitted++;
  }
  return admitted;
}

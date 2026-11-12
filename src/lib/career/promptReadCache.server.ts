import { AsyncLocalStorage } from "node:async_hooks";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type Snapshot = { values: Map<string, Promise<unknown>>; expiresAt: number };
type Scope = { userId: string; snapshot: Promise<Snapshot | undefined>; resources: Promise<Snapshot | undefined>; local: Snapshot; bypass: boolean };
const scope = new AsyncLocalStorage<Scope>();
const snapshots = new Map<string, Snapshot>();
// Bound retention of personal data in a warm process. Freshness comes from the
// DB revision, not this lifetime; cold instances simply load the same sources.
const RETENTION_MS = 5 * 60_000;

export async function withCareerPromptReadCache<T>(admin: TalentAdminClient, userId: string, work: () => Promise<T>) {
  if (scope.getStore()?.userId === userId) return work();
  // Revision validation runs alongside history/eligibility. It must not delay
  // Decisions, which does not consume the cached profile or Memory.
  const snapshot = readSnapshot(admin, userId).catch(() => undefined);
  const resources = readResourceSnapshot(admin, userId).catch(() => undefined);
  return scope.run({ userId, snapshot, resources, local: { values: new Map(), expiresAt: 0 }, bypass: false }, work);
}

async function readSnapshot(admin: TalentAdminClient, userId: string) {
  const { data, error } = await admin.from("talent_users")
    .select("career_context_revision").eq("user_id", userId).maybeSingle();
  if (error || !data?.career_context_revision) return undefined;
  return snapshotFor(`profile:${userId}:${data.career_context_revision}`);
}

async function readResourceSnapshot(admin: TalentAdminClient, userId: string) {
  const { data, error } = await (admin.from as any)("talent_career_resource_revisions")
    .select("revision").eq("user_id", userId).maybeSingle();
  if (error || (data && typeof data.revision !== "string")) return undefined;
  // No row means none of the tracked resources has changed since migration.
  return snapshotFor(`resources:${userId}:${data?.revision ?? "initial"}`);
}

function snapshotFor(key: string) {
  const now = Date.now();
  for (const [key, value] of snapshots) if (value.expiresAt <= now) snapshots.delete(key);
  let snapshot = snapshots.get(key);
  if (!snapshot) {
    snapshot = { values: new Map(), expiresAt: now + RETENTION_MS };
    snapshots.set(key, snapshot);
  }
  return snapshot;
}

export async function readCareerPromptValue<T>(userId: string, key: string, load: () => Promise<T>): Promise<T> {
  return readValue(userId, `profile:${key}`, "snapshot", load);
}

/** Only readers whose complete dependencies have DB revision triggers belong
 * here. Time-dependent schedules and live browser observations stay uncached. */
export async function readCareerResourceValue<T>(userId: string, key: string, load: () => Promise<T>): Promise<T> {
  return readValue(userId, `resources:${key}`, "resources", load);
}

async function readValue<T>(userId: string, key: string, domain: "snapshot" | "resources", load: () => Promise<T>): Promise<T> {
  const current = scope.getStore();
  if (!current || current.userId !== userId || current.bypass) return load();
  // A failed revision read forbids cross-request reuse, not deduplication of
  // source reads within this request.
  const snapshot = await current[domain] ?? current.local;
  if (current.bypass) return load();
  let value = snapshot.values.get(key);
  if (!value) {
    value = load();
    snapshot.values.set(key, value);
    void value.catch(() => {
      if (snapshot.values.get(key) === value) snapshot.values.delete(key);
    });
  }
  // Callers may transform their rows. Never let one turn mutate another's cache.
  return structuredClone(await value as T);
}

export function invalidateCareerPromptReadCache() {
  const current = scope.getStore();
  if (current) {
    current.bypass = true;
    current.local.values.clear();
    for (const read of [current.snapshot, current.resources]) void read.then(snapshot => snapshot?.values.clear());
  }
}

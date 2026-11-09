import assert from "node:assert/strict";
import test from "node:test";
import { closeCheckpointPreparationBrowsers } from "./devCheckpointBrowserCleanup.server";
import { browserUseAgents } from "./simulation/browserUseAgents";
import type { CareerCheckpoint } from "./devCheckpointData";

test("checkpoint cleanup accepts an already reconciled close but never a changed active state", async t => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const sessionId = "00000000-0000-4000-8000-000000000002";
  const originalEnv = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  let concurrentStatus = "closed";
  let row: Record<string, unknown>;
  let stops = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const changes = JSON.parse(String(init.body));
      if (changes.status === "closed") return Response.json(null); // The observer advanced the revision.
      Object.assign(row, changes);
      return Response.json(row);
    }
    return Response.json([row]);
  });
  t.mock.method(browserUseAgents, "stop", async () => {
    stops++;
    row = { ...row, status: concurrentStatus, revision: Number(row.revision) + 1 };
  });
  const snapshot = { user: { id: userId }, tables: { talent_external_operations: [] } } as unknown as CareerCheckpoint;
  try {
    for (concurrentStatus of ["closed", "human", "running"]) {
      row = { id: sessionId, user_id: userId, conversation_id: null, kind: "browser_session",
        parent_id: null, idempotency_key: "fixture", status: "idle", revision: 1,
        request: {}, result: {}, provider_refs: { session_id: sessionId },
        created_at: "2026-11-09T00:00:00Z", updated_at: "2026-11-09T00:00:00Z" };
      if (concurrentStatus === "closed") await closeCheckpointPreparationBrowsers(snapshot);
      else await assert.rejects(closeCheckpointPreparationBrowsers(snapshot), /External operation changed/);
    }
    assert.equal(stops, 3);
  } finally {
    if (originalEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
    if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
  }
});

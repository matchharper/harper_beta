import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCareerLiveSyncTopic,
  readCareerLiveSyncScope,
} from "@/lib/career/liveSync";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260911130000_talent_career_live_sync.sql",
    import.meta.url
  ),
  "utf8"
);

test("career live sync uses one private user-scoped topic", () => {
  assert.equal(
    buildCareerLiveSyncTopic("talent-123"),
    "talent-career:talent-123"
  );
  assert.match(migration, /on realtime\.messages[\s\S]*for select/i);
  assert.match(
    migration,
    /'talent-career:' \|\| \(select auth\.uid\(\)\)::text/i
  );
  assert.match(
    migration,
    /realtime\.send\([\s\S]*'career_changed'[\s\S]*true[\s\S]*\)/i
  );
});

test("career live sync broadcasts only invalidation scope", () => {
  assert.equal(
    readCareerLiveSyncScope({ payload: { scope: "messages" } }),
    "messages"
  );
  assert.equal(
    readCareerLiveSyncScope({ payload: { scope: "opportunities" } }),
    "opportunities"
  );
  assert.equal(readCareerLiveSyncScope({ payload: { scope: "runs" } }), "runs");
  assert.equal(readCareerLiveSyncScope({ payload: { scope: "unknown" } }), "all");
  assert.doesNotMatch(migration, /realtime\.broadcast_changes/i);
  assert.doesNotMatch(migration, /to_jsonb\s*\(\s*new/i);
});

test("career live sync covers worker-created messages, recommendations, and runs", () => {
  assert.match(
    migration,
    /after insert on public\.talent_messages[\s\S]*broadcast_talent_career_live_sync/i
  );
  assert.match(
    migration,
    /after insert on public\.talent_opportunity_recommendation[\s\S]*broadcast_talent_career_live_sync/i
  );
  assert.match(
    migration,
    /after insert or update of status, completed_at[\s\S]*on public\.opportunity_discovery_run/i
  );
  assert.match(migration, /coalesce\(new\.role, ''\) <> 'assistant'/i);
  assert.doesNotMatch(migration, /create\s+table/i);
});

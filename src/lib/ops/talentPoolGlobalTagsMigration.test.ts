import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260907160000_talent_pool_global_tags.sql",
    import.meta.url
  ),
  "utf8"
);

test("talent pool tags can exist without an opportunity", () => {
  assert.match(migration, /alter column opportunity_id drop not null/i);
});

test("global and role tag uniqueness are enforced independently", () => {
  assert.match(
    migration,
    /talent_opportunity_tag_role_unique_lower_idx[\s\S]*where opportunity_id is not null/i
  );
  assert.match(
    migration,
    /talent_opportunity_tag_talent_unique_lower_idx[\s\S]*where opportunity_id is null/i
  );
});

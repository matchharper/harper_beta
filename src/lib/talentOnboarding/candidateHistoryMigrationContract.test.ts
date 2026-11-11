import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Candidate versions (Q4): Brief/Memory, Behavior Context and settings each
// leave an immutable history row, written only by triggers.
const migration = readFileSync(
  "supabase/migrations/20261111010000_candidate_history_tables.sql",
  "utf8"
);

const functionSql = (name: string) =>
  migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`)
  )?.[0] ?? "";

const triggerSql = (name: string) =>
  migration.match(new RegExp(`create trigger ${name}\\n[\\s\\S]*?;`))?.[0] ?? "";

const historyTables = [
  "talent_context_revisions",
  "talent_behavior_context_revisions",
  "talent_setting_revisions",
];

test("runs in one transaction with a short lock wait", () => {
  assert.match(migration, /^begin;\n\nset local lock_timeout = '5s';\nset local statement_timeout = '\d+s';/m);
  assert.match(migration, /\ncommit;\n?$/);
});

test("the three history tables exist and go with the talent", () => {
  for (const table of historyTables) {
    assert.match(
      migration,
      new RegExp(
        `create table if not exists public\\.${table} \\(\\n  id bigint generated always as identity primary key,\\n` +
          `  talent_id uuid not null references public\\.talent_users\\(user_id\\) on delete cascade,`
      ),
      table
    );
  }
});

test("only service_role reads history; anon and authenticated get nothing", () => {
  for (const table of historyTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`), table);
    assert.match(
      migration,
      new RegExp(`revoke all on public\\.${table} from public, anon, authenticated, service_role;`),
      table
    );
    assert.match(migration, new RegExp(`grant select on public\\.${table} to service_role;`), table);
  }
  assert.doesNotMatch(migration, /grant [^;]*\bto [^;]*\b(anon|authenticated|public)\b/);
  for (const signature of [
    "talent_contexts_for_version_v1\\(uuid, bigint\\)",
    "talent_versions_v1\\(uuid, timestamptz\\)",
    "talent_state_as_of_v1\\(uuid, timestamptz\\)",
    "talent_setting_snapshot_v1\\(uuid\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated;`),
      signature
    );
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role;`), signature);
  }
  for (const capture of [
    "capture_talent_context_revision_v1\\(\\)",
    "capture_talent_behavior_context_revision_v1\\(\\)",
    "capture_talent_setting_revision_v1\\(uuid\\)",
    "capture_talent_setting_revision_trigger_v1\\(\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${capture}\\s+from public, anon, authenticated, service_role;`),
      capture
    );
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${capture}`), capture);
  }
});

test("history is written by triggers on the three source tables", () => {
  const triggers: Array<[string, RegExp, string]> = [
    ["talent_contexts_revision", /after insert on public\.talent_contexts/, "capture_talent_context_revision_v1"],
    [
      "talent_contexts_revision_update",
      /after update of collection, key, label, content, importance, source_refs, deleted_at\s+on public\.talent_contexts/,
      "capture_talent_context_revision_v1",
    ],
    ["talent_contexts_revision_delete", /after delete on public\.talent_contexts/, "capture_talent_context_revision_v1"],
    [
      "talent_behavior_contexts_revision",
      /after insert on public\.talent_behavior_contexts/,
      "capture_talent_behavior_context_revision_v1",
    ],
    [
      "talent_behavior_contexts_revision_update",
      /after update of context_version, context_hash on public\.talent_behavior_contexts/,
      "capture_talent_behavior_context_revision_v1",
    ],
    ["talent_setting_revision", /after insert on public\.talent_setting/, "capture_talent_setting_revision_trigger_v1"],
    [
      "talent_setting_revision_update",
      /on public\.talent_setting\n  for each row/,
      "capture_talent_setting_revision_trigger_v1",
    ],
  ];
  for (const [name, timing, fn] of triggers) {
    const sql = triggerSql(name);
    assert.match(sql, timing, name);
    assert.match(sql, /for each row/, name);
    assert.match(sql, new RegExp(`execute function public\\.${fn}\\(\\);$`), name);
    assert.match(migration, new RegExp(`drop trigger if exists ${name} on public\\.`), name);
  }
  for (const fn of [
    "capture_talent_context_revision_v1",
    "capture_talent_behavior_context_revision_v1",
    "capture_talent_setting_revision_trigger_v1",
  ]) {
    assert.match(functionSql(fn), /returns trigger\nlanguage plpgsql\nsecurity definer\nset search_path = ''/, fn);
  }
});

test("the setting snapshot includes is_onboarding_done and every snapshot field is watched", () => {
  const snapshot = functionSql("talent_setting_snapshot_v1");
  assert.match(snapshot, /'is_onboarding_done', setting\.is_onboarding_done,/);
  const fields = [...snapshot.matchAll(/'(\w+)', setting\.(\w+)/g)].map(([, key, column]) => {
    assert.equal(key, column);
    return key;
  });
  for (const field of [
    "profile_visibility",
    "blocked_companies",
    "get_internal_recommendation",
    "get_external_recommendation",
    "is_onboarding_done",
    "status",
  ]) {
    assert.ok(fields.includes(field), field);
  }

  const update = triggerSql("talent_setting_revision_update");
  const watched = update.match(/after update of ([\s\S]*?)\n  on public\.talent_setting/)?.[1] ?? "";
  assert.deepEqual(
    watched.split(",").map(column => column.trim()).sort(),
    [...fields].sort()
  );
  for (const field of fields) {
    assert.match(update, new RegExp(`old\\.${field}\\b`), field);
    assert.match(update, new RegExp(`new\\.${field}\\b`), field);
  }
});

test("backfill and live capture hash the same snapshot", () => {
  assert.match(
    functionSql("capture_talent_setting_revision_v1"),
    /v_snapshot := public\.talent_setting_snapshot_v1\(p_talent_id\);\n  if v_snapshot is null then\n    return;\n  end if;\n  v_hash := md5\(v_snapshot::text\);/
  );
  assert.match(
    migration,
    /select setting\.user_id, 1, snapshot\.value, md5\(snapshot\.value::text\)\nfrom public\.talent_setting setting\ncross join lateral \(select public\.talent_setting_snapshot_v1\(setting\.user_id\) as value\) snapshot/
  );
});

test("talent_versions_v1 is PL/pgSQL with the same signature and access", () => {
  const versions = functionSql("talent_versions_v1");
  assert.match(
    versions,
    /^create or replace function public\.talent_versions_v1\(p_talent_id uuid, p_at timestamptz default null\)\nreturns jsonb\nlanguage plpgsql\nstable\nsecurity definer\nset search_path = ''\nas \$\$\nbegin\n  return jsonb_build_object\(/
  );
  assert.match(versions, /\n  \);\nend;\n\$\$;$/);
  for (const key of ["context", "behavior", "setting", "profile"]) {
    assert.match(versions, new RegExp(`'${key}', \\(`), key);
  }
});

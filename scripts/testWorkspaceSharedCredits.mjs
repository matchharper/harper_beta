// Real concurrent PostgreSQL sessions against a disposable local-only cluster.
// No .env, network services, Stripe, candidates or production database are used.
// Run: node scripts/testWorkspaceSharedCredits.mjs [--pg-bin=/path/to/postgres/bin]
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { createWorkspaceBillingFixture } from "./lib/workspaceBillingFixture.mjs";

const pgBin =
  process.argv.find((v) => v.startsWith("--pg-bin="))?.slice(9) ??
  "/usr/local/opt/postgresql@17/bin";
const directory = mkdtempSync(path.join(tmpdir(), "harper-shared-credits-"));
const data = path.join(directory, "db");
const port = 55489; // Unique Unix socket directory; TCP is disabled.
let started = false,
  sql;
try {
  execFileSync(
    path.join(pgBin, "initdb"),
    ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale"],
    { stdio: "ignore" }
  );
  execFileSync(
    path.join(pgBin, "pg_ctl"),
    [
      "-D",
      data,
      "-l",
      path.join(directory, "server.log"),
      "-o",
      `-F -k ${directory} -h '' -p ${port}`,
      "-w",
      "start",
    ],
    { stdio: "ignore" }
  );
  started = true;
  sql = postgres({
    host: directory,
    port,
    user: "postgres",
    database: "postgres",
    max: 1,
    onnotice: () => {},
  });
  const db = {
    exec: (q) => sql.unsafe(q),
    query: async (q, args = []) => ({ rows: await sql.unsafe(q, args) }),
  };
  await createWorkspaceBillingFixture(db);
  await sql.end();
  sql = postgres({
    host: directory,
    port,
    user: "postgres",
    database: "postgres",
    max: 16,
    onnotice: () => {},
  });
  const scalar = async (q, args = []) =>
    Object.values((await sql.unsafe(q, args))[0])[0];
  const fixture = async (count) => {
    const workspace = randomUUID(),
      roles = Array.from({ length: count }, () => randomUUID());
    await sql`insert into company_workspace(company_workspace_id,billing_started_at,billing_free_anchor_at) values(${workspace},now(),now())`;
    for (const role of roles) {
      await sql`insert into company_roles(role_id,company_workspace_id,status,information) values(${role},${workspace},'active',${sql.json({ testOnly: true, testFixture: "shared-credits-concurrency" })})`;
      await sql`insert into company_internal_roles(role_id) values(${role})`;
    }
    return {
      workspace,
      roles,
      summary: () =>
        scalar("select workspace_billing_summary_v2($1)", [workspace]),
    };
  };
  const actor = randomUUID(),
    talent = randomUUID();
  const debit = (f, role, key, action = "intro_request") =>
    scalar("select workspace_billing_debit_v1($1,$2,$3,$4,$5,$6,'{}',true)", [
      f.workspace,
      action,
      key,
      role,
      talent,
      actor,
    ]);
  const free = await fixture(30);
  assert.equal((await free.summary()).activeRoles, 30);
  assert.equal((await free.summary()).capacity, null);
  const attempts = await Promise.allSettled(
    free.roles.map((role, i) => debit(free, role, `parallel-${i}`))
  );
  assert.equal(
    attempts.filter((v) => v.status === "fulfilled").length,
    10,
    "only ten concurrent cross-Role spends succeed"
  );
  for (const result of attempts.filter((v) => v.status === "rejected"))
    assert.match(result.reason.message, /workspace_credits_exhausted/);
  assert.equal((await free.summary()).creditSlots[0].remaining, 0);
  await sql`insert into company_roles(role_id,company_workspace_id,status,information) values(${randomUUID()},${free.workspace},'active',${sql.json({ testOnly: true, testFixture: "shared-credits-after-exhaustion" })})`;
  assert.equal(
    (await free.summary()).activeRoles,
    31,
    "credit exhaustion never prevents starting another Role"
  );
  console.log(
    "PASS: concurrent cross-Role spending cannot overdraw shared credits; exhausted Free still allows unlimited Roles"
  );

  const paid = await fixture(3);
  const sharedBefore = (await paid.summary()).creditSlots[0];
  await debit(paid, paid.roles[2], "before-upgrade");
  await scalar(
    "select workspace_billing_grant_slots_v1($1,$2,2,'fixture@example.invalid','Local shared allowance test')",
    [paid.workspace, randomUUID()]
  );
  let summary = await paid.summary();
  const assigned = summary.slots.find((s) => s.roleId === paid.roles[0]);
  const other = summary.slots.find((s) => s.id !== assigned.id);
  assert.equal(
    summary.creditSlots[0].remaining,
    9,
    "upgrade retains prior shared usage"
  );
  assert.equal(
    summary.creditSlots[0].renewsAt,
    sharedBefore.renewsAt,
    "upgrade does not reset the shared cycle"
  );
  assert.equal(
    await scalar("select role_matching_slot_type_v1($1)", [paid.roles[2]]),
    "free",
    "unassigned Role remains eligible for Free matching in paid workspace"
  );
  assert.equal(
    await scalar("select role_matching_slot_type_v1($1)", [paid.roles[0]]),
    "paid"
  );
  const duplicate = await Promise.all(
    Array.from({ length: 20 }, () => debit(paid, paid.roles[0], "same-action"))
  );
  assert.equal(new Set(duplicate).size, 1);
  summary = await paid.summary();
  assert.equal(summary.slots.find((s) => s.id === assigned.id).remaining, 49);
  assert.equal(
    summary.creditSlots[0].remaining,
    9,
    "paid allowance is preferred"
  );
  await sql`update company_workspace_credit_periods set remaining=0 where slot_id=${assigned.id}`;
  await debit(paid, paid.roles[0], "paid-fallback", "connect");
  await debit(paid, paid.roles[2], "free-with-paid");
  summary = await paid.summary();
  assert.equal(
    summary.creditSlots[0].remaining,
    7,
    "assigned and unassigned Roles share the same fallback pool"
  );
  assert.equal(
    summary.slots.find((s) => s.id === other.id).remaining,
    50,
    "another Slot cannot be charged"
  );
  await assert.rejects(
    debit(paid, paid.roles[2], "no-free-connect", "connect"),
    /workspace_feature_unavailable/
  );
  assert.equal((await paid.summary()).creditSlots[0].remaining, 7);
  await sql`update company_workspace_slots set cancel_at=now()-interval '1 second' where company_workspace_id=${paid.workspace}`;
  summary = await paid.summary();
  assert.equal(summary.model, "free");
  assert.equal(summary.activeRoles, 3);
  assert.equal(summary.creditSlots.length, 1);
  assert.equal(
    summary.creditSlots[0].remaining,
    7,
    "cancellation neither destroys nor refills shared credits"
  );
  await debit(paid, paid.roles[0], "after-expiry");
  assert.equal((await paid.summary()).creditSlots[0].remaining, 6);
  assert.equal(
    await debit(paid, paid.roles[0], "same-action"),
    duplicate[0],
    "retry retains the original paid event after expiry"
  );
  console.log(
    "PASS: independent shared pool, paid-first/fallback spending, paid feature boundary, Free matching, cancellation and retries"
  );
} finally {
  if (sql) await sql.end();
  if (started)
    execFileSync(
      path.join(pgBin, "pg_ctl"),
      ["-D", data, "-m", "fast", "-w", "stop"],
      { stdio: "ignore" }
    );
  rmSync(directory, { recursive: true, force: true });
}

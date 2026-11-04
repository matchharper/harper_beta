import assert from "node:assert/strict";
import test from "node:test";
import { transactionDatabaseUrl } from "./transactionDatabaseUrl";

test("shared Supabase sessions use transaction pooling without changing credentials or options", () => {
  for (const port of [":5432", ""]) {
    const before = new URL(`postgresql://postgres.project:p%40ss%3Aword@aws-1-ap-south-1.pooler.supabase.com${port}/postgres?sslmode=require&application_name=web`);
    const after = new URL(transactionDatabaseUrl(before.toString()));
    assert.equal(after.port, "6543");
    for (const key of ["protocol", "username", "password", "hostname", "pathname", "search"] as const)
      assert.equal(after[key], before[key]);
  }
});

test("transaction, direct, local and custom endpoints are preserved", () => {
  for (const url of [
    "postgres://u:p@aws-1-ap-south-1.pooler.supabase.com:6543/postgres",
    "postgres://u:p@db.project.supabase.co:5432/postgres",
    "postgres://u:p@localhost:5432/test",
    "postgres://u:p@custom.example:5432/db",
    "postgres://u:p@aws-1-ap-south-1.pooler.supabase.com:6432/postgres",
    "postgres://u:p@pooler.supabase.com.example:5432/db",
  ]) assert.equal(transactionDatabaseUrl(url), url);
});

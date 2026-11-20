import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import type { CareerMatchingNote } from "@/lib/career/matching/listTypes";

const matchingId = "00000000-0000-4000-8000-000000000007";
const fullBody = `${"긴 조사 기록\n".repeat(1000)}마지막 문장`;

function harness({ development = true, anonymous = false, owned = true } = {}) {
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  let authReads = 0;
  const notes: CareerMatchingNote["notes"] = [{
    id: "note-1",
    kind: "work",
    title: "Backend search",
    content: fullBody,
    revision: 3,
    created_at: "2026-11-18T00:00:00Z",
    updated_at: "2026-11-19T00:00:00Z",
  }];
  const dependencies: Record<string, unknown> = {
    zod: { z },
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    "@/lib/supabaseServer": {
      getRequestUser: async () => {
        authReads++;
        return anonymous ? null : { id: "owner" };
      },
    },
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => ({}) },
    "@/lib/career/matching/store": {
      matchingTable: (_admin: unknown, table: string) => {
        const filters: Record<string, unknown> = {};
        reads.push({ table, filters });
        const query = {
          select: () => query,
          eq: (key: string, value: unknown) => {
            filters[key] = value;
            return query;
          },
          order: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: owned ? { id: matchingId } : null,
            error: null,
          }),
          then: (
            resolve: (value: {
              data: CareerMatchingNote["notes"];
              error: null;
            }) => unknown
          ) => Promise.resolve(resolve({ data: notes, error: null })),
        };
        return query;
      },
    },
  };
  const source = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const loaded = {
    exports: {} as {
      GET: (req: {
        nextUrl: URL;
      }) => Promise<{ status: number; body: CareerMatchingNote }>;
    },
  };
  vm.runInNewContext(source, {
    module: loaded,
    exports: loaded.exports,
    console,
    process: { env: { NODE_ENV: development ? "development" : "production" } },
    require: (name: string) => {
      assert.ok(name in dependencies);
      return dependencies[name];
    },
  });
  return {
    get: (id = matchingId) =>
      loaded.exports.GET({
        nextUrl: new URL(
          `http://localhost/api/talent/matchings/note?matchingId=${id}`
        ),
      }),
    reads,
    authReads: () => authReads,
  };
}

test("notes are unavailable in production and require an authenticated matching owner locally", async () => {
  const production = harness({ development: false });
  assert.equal((await production.get()).status, 404);
  assert.equal(production.authReads(), 0);
  assert.equal(production.reads.length, 0);
  const anonymous = harness({ anonymous: true });
  assert.equal((await anonymous.get()).status, 401);
  assert.equal(anonymous.reads.length, 0);
  const invalid = harness();
  assert.equal((await invalid.get("invalid")).status, 400);
  assert.equal(invalid.reads.length, 0);
  const otherOwner = harness({ owned: false });
  assert.equal((await otherOwner.get()).status, 404);
  assert.deepEqual(otherOwner.reads, [
    {
      table: "talent_matchings",
      filters: { id: matchingId, talent_id: "owner" },
    },
  ]);
});

test("notes linked to the matching return with their complete text", async () => {
  const h = harness();
  const result = await h.get();
  assert.equal(result.status, 200);
  assert.equal(result.body.notes.length, 1);
  assert.equal(result.body.notes[0].content, fullBody);
  assert.deepEqual(h.reads.at(-1), {
    table: "talent_notes",
    filters: { talent_id: "owner", matching_id: matchingId },
  });
});

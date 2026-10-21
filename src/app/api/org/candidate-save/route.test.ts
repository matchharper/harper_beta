import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import type { NextRequest } from "next/server";
import {
  candidateSaveId,
  readOrgCandidateSaves,
} from "@/lib/org/candidateSaved.server";
import type { OrgBoardItem } from "@/lib/org/server";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
const talentId = "30000000-0000-4000-8000-000000000001";
const item = {
  roleId,
  talentId,
  recommendationId: "company-intro:fixture",
  source: "company_intro",
  stage: "company_intro",
} as OrgBoardItem;
let allowed = true;
let visible = true;
let stage = "company_intro";
const writes: Record<string, unknown>[] = [];
class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
const admin = {
  from(table: string) {
    assert.equal(table, "talent_progress");
    return {
      async upsert(row: Record<string, unknown>) {
        writes.push(row);
        return { error: null };
      },
    };
  },
};
let POST: typeof import("./route").POST;
before(async () => {
  const mod = Module as any;
  const original = mod._load;
  const mocks: Record<string, unknown> = {
    "@/lib/server/candidateAccess": {
      requireAuthenticatedUser: async () => ({
        id: "member",
        email: "member@example.invalid",
      }),
      getSupabaseAdmin: () => admin,
    },
    "@/lib/org/server": {
      OrgHttpError: HttpError,
      assertOrgRoleAccess: async (args: any) => {
        assert.equal(args.roleId, roleId);
        if (!allowed) throw new HttpError(403, "Forbidden");
      },
      fetchOrgBoard: async () => ({
        items: visible ? [{ ...item, stage }] : [],
      }),
    },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks
      ? mocks[request]
      : original.call(this, request, parent, isMain);
  };
  try {
    ({ POST } = await import("./route"));
  } finally {
    mod._load = original;
  }
});

const submit = (saved: boolean) =>
  POST({
    json: async () => ({
      workspaceId,
      roleId,
      talentId,
      recommendationId: item.recommendationId,
      saved,
    }),
  } as NextRequest);

test("bookmark preserves the intro lifecycle and uses an idempotent private progress record", async () => {
  assert.equal((await submit(true)).status, 200);
  assert.equal((await submit(false)).status, 200);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].id, writes[1].id);
  assert.equal(writes[0].recommendation_id, null);
  assert.equal(writes[0].open_to_talent, false);
  assert.equal(writes[0].open_to_company, false);
  assert.equal((writes[1].metadata as any).saved, false);
  assert.equal((writes[0].metadata as any).stage, "company_intro");
});

test("role permissions, candidate visibility and current stage are checked before writing", async () => {
  const count = writes.length;
  allowed = false;
  assert.equal((await submit(true)).status, 403);
  allowed = true;
  visible = false;
  assert.equal((await submit(true)).status, 404);
  visible = true;
  stage = "connected";
  assert.equal((await submit(true)).status, 409);
  stage = "company_intro";
  assert.equal(writes.length, count);
});

test("a bookmark does not move an accepted or rejected candidate back into Saved", async () => {
  const id = candidateSaveId(workspaceId, item);
  const query: any = {
    select: () => query,
    eq: () => query,
    in: async (_: string, ids: string[]) => {
      assert.deepEqual(ids, [id]);
      return {
        data: [
          {
            id,
            created_at: "2026-10-21T00:00:00Z",
            metadata: { saved: true, stage: "company_intro" },
          },
        ],
        error: null,
      };
    },
  };
  const db = { from: () => query } as any;
  assert.equal(
    (await readOrgCandidateSaves(db, workspaceId, [item]))[0].savedAt,
    "2026-10-21T00:00:00Z"
  );
  const connected = { ...item, stage: "connected" } as OrgBoardItem;
  assert.equal(
    (await readOrgCandidateSaves(db, workspaceId, [connected]))[0].savedAt,
    null
  );
  assert.notEqual(
    candidateSaveId(workspaceId, item),
    candidateSaveId(workspaceId, { ...item, recommendationId: "new-proposal" })
  );
});

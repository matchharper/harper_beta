import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import type { OrgBoardItem, OrgBoardResponse } from "@/lib/org/server";

test("inbox API filters and orders before paging, returns only ten profiles, and counts without profiles", async (t) => {
  const rows = (stage: string, count: number) =>
    Array.from(
      { length: count },
      (_, i) =>
        ({
          recommendationId: `${stage}-${String(i).padStart(2, "0")}`,
          talentId: `${stage}-talent-${i}`,
          roleId: "role",
          stage,
          savedAt: null,
          source: "company_intro",
          companyPresentedAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
          recommendedAt: "2026-10-01T00:00:00Z",
          recommendationScore: 100 - i,
          talent: {
            name: `Synthetic ${i}`,
            recentCompanies: [],
            recentSchools: [],
          },
        }) as unknown as OrgBoardItem
    );
  const board = {
    workspaceId: "workspace",
    roleId: "role",
    stages: [],
    totalCount: 40,
    items: [
      ...rows("pending_connection", 23),
      ...rows("company_intro", 12),
      ...rows("connected", 5),
    ],
  } as OrgBoardResponse;
  board.items[0].savedAt = "2026-10-27T00:00:00Z";
  const profileReads: string[][] = [];
  const detailReads: string[] = [];
  let blockedTalent: string | null = null;
  let authorized = true;
  class OrgHttpError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  const nodeModule = Module as any;
  const originalLoad = nodeModule._load;
  t.mock.method(
    nodeModule,
    "_load",
    function (this: unknown, name: string, ...args: unknown[]) {
      if (name === "@/lib/server/candidateAccess")
        return {
          getSupabaseAdmin: () => ({}),
          requireAuthenticatedUser: async () => {
            if (!authorized) throw new Error("Unauthorized");
            return { id: "fixture-user" };
          },
        };
      if (name === "@/lib/org/server")
        return {
          OrgHttpError,
          fetchOrgBoard: async (args: any) => {
            assert.equal(args.user.id, "fixture-user");
            assert.equal(args.workspaceId, "workspace");
            assert.equal(args.includeProfileLabels, false);
            return board;
          },
          fetchBoardProfileLabels: async ({
            talentIds,
          }: {
            talentIds: string[];
          }) => {
            profileReads.push(talentIds);
            return { recentCompanies: new Map(), recentSchools: new Map() };
          },
        };
      if (name === "@/lib/org/candidateSaved.server")
        return {
          readOrgCandidateSaves: async (
            _a: unknown,
            _w: string,
            items: OrgBoardItem[]
          ) => items,
        };
      if (name === "@/lib/org/candidatePreview.server")
        return {
          readOrgCandidateDetail: async (args: any) => {
            assert.equal(args.user.id, "fixture-user");
            assert.equal(args.workspaceId, "workspace");
            assert.equal(args.roleId, "role");
            detailReads.push(args.talentId);
            if (args.talentId === blockedTalent)
              throw new OrgHttpError(403, "Forbidden");
            return {
              talent: { userId: args.talentId },
              recommendation: { recommendationId: args.recommendationId },
              profile: {
                experiences: [{ role: "Synthetic engineer" }],
                educations: [{ school: "Synthetic school" }],
              },
            };
          },
        };
      return originalLoad.call(this, name, ...args);
    }
  );
  const { GET } = await import("./route");
  const read = (params: string) =>
    GET(
      new NextRequest(
        `https://fixture.invalid/api/org/board?workspaceId=workspace&roleId=role&${params}`
      )
    );
  const page = async (params: string) => {
    const response = await read(params);
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await page("inboxStage=pending_connection");
  assert.equal(
    detailReads.length,
    10,
    "first response prepares ten complete details"
  );
  assert.equal(Object.keys(first.details).length, 10);
  assert.equal(
    first.details[first.items[0].recommendationId].profile.experiences[0].role,
    "Synthetic engineer"
  );
  const second = await page("inboxStage=pending_connection&offset=10");
  const last = await page("inboxStage=pending_connection&offset=20");
  assert.deepEqual(
    [first.items.length, second.items.length, last.items.length],
    [10, 10, 2]
  );
  assert.deepEqual(
    [first.nextOffset, second.nextOffset, last.nextOffset],
    [10, 20, null]
  );
  const ids = [...first.items, ...second.items, ...last.items].map(
    (item) => item.recommendationId
  );
  assert.equal(new Set(ids).size, 22);
  assert.equal(ids[0], "pending_connection-22");
  assert.equal(ids.at(-1), "pending_connection-01");
  assert.equal(first.totalCount, 22);
  assert.deepEqual(first.counts, {
    pending_connection: 22,
    company_intro: 12,
    saved: 1,
  });
  assert.ok(profileReads.every((ids) => ids.length <= 10));
  assert.ok(first.items.every((item: any) => !("recommendationScore" in item)));
  const recommended = await page(
    "inboxStage=pending_connection&sort=recommended"
  );
  assert.equal(recommended.items[0].recommendationId, "pending_connection-01");
  const suggested = await page("inboxStage=company_intro");
  assert.equal(suggested.totalCount, 12);
  assert.ok(
    suggested.items.every((item: any) => item.stage === "company_intro")
  );
  const saved = await page("inboxStage=saved");
  assert.equal(saved.items.length, 1);
  const before = profileReads.length;
  const detailsBeforeCounts = detailReads.length;
  const counts = await page("inboxCounts=true");
  assert.deepEqual(counts.items, []);
  assert.deepEqual(counts.counts, first.counts);
  assert.equal(profileReads.length, before);
  assert.equal(
    detailReads.length,
    detailsBeforeCounts,
    "badge counts never preload profiles"
  );
  assert.deepEqual(
    (await page("inboxStage=company_intro&offset=100")).items,
    []
  );
  for (const invalid of [
    "inboxStage=unknown",
    "inboxStage=company_intro&offset=-1",
    "inboxStage=company_intro&offset=1.5",
  ]) {
    assert.equal((await read(invalid)).status, 400);
  }
  blockedTalent = "company_intro-talent-11";
  assert.equal(
    (await read("inboxStage=company_intro")).status,
    403,
    "every batch member keeps the detail access boundary"
  );
  const beforeUnauthorized = detailReads.length;
  authorized = false;
  assert.equal((await read("inboxStage=company_intro")).status, 401);
  assert.equal(detailReads.length, beforeUnauthorized);
});

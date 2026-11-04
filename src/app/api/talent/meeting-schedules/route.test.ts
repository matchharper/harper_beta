import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  readTalentSchedules,
  writeTalentSchedule,
} from "@/lib/career/meetings/server";
import {
  setupMeetings,
  meetingAdmin,
  owner,
  other,
  role,
} from "@/lib/career/meetings/testSupport";

function route(admin: unknown, userId: string | null) {
  const dependencies: Record<string, unknown> = {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: { status: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    "@/lib/supabaseServer": {
      getRequestUser: async () => (userId ? { id: userId } : null),
    },
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => admin },
    "@/lib/career/meetings/server": {
      readTalentSchedules,
      writeTalentSchedule,
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
  const routeModule = {
    exports: {} as {
      POST: (request: {
        json: () => Promise<unknown>;
      }) => Promise<{ status: number; body: any }>;
      GET: (request: {
        nextUrl: URL;
      }) => Promise<{ status: number; body: any }>;
    },
  };
  vm.runInNewContext(source, {
    module: routeModule,
    exports: routeModule.exports,
    require: (name: string) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
  });
  return Object.assign(
    (query = "") =>
      routeModule.exports.GET({
        nextUrl: new URL(
          `http://localhost/api/talent/meeting-schedules${query}`
        ),
      }),
    {
      post: (body: unknown) =>
        routeModule.exports.POST({ json: async () => body }),
    }
  );
}

test("manual appointment creates one owned SQL record, survives retry and rejects inaccessible roles and invalid times", async () => {
  const db = await setupMeetings();
  try {
    await db.exec(
      "create table talent_effective_opportunity_recommendations_v1(id uuid, talent_id uuid, role_id uuid)"
    );
    await db.query(
      "insert into talent_effective_opportunity_recommendations_v1 values(gen_random_uuid(),$1,$2)",
      [owner, role]
    );
    const admin = meetingAdmin(db);
    const body = {
      requestId: "ca460b94-6dd8-45c4-8270-e070cf74e288",
      roleId: role,
      title: "팀 인터뷰",
      startsAt: "2030-01-07T05:00:00Z",
      endsAt: "2030-01-07T06:00:00Z",
      timezone: "Asia/Seoul",
      content: "제품 사례 준비",
    };
    assert.equal((await route(admin, null).post(body)).status, 401);
    assert.equal((await route(admin, other).post(body)).status, 404);
    assert.equal(
      (
        await route(admin, owner).post({
          ...body,
          endsAt: "2030-01-06T05:00:00Z",
        })
      ).status,
      400
    );
    assert.equal(
      (await route(admin, owner).post({ ...body, timezone: "Missing/Zone" }))
        .status,
      400
    );
    const first = await route(admin, owner).post({ ...body, userId: other });
    assert.equal(first.status, 201);
    assert.equal(first.body.schedule.talent_id, owner);
    assert.equal(first.body.schedule.scheduling_source, "external");
    const retry = await route(admin, owner).post(body);
    assert.equal(retry.body.schedule.id, first.body.schedule.id);
    const rows = (
      await db.query<{ content: string }>("select * from meeting_schedules")
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].content, "제품 사례 준비");
    const read = await route(admin, owner)(`?roleId=${role}`);
    assert.equal(read.body.schedules[0].id, first.body.schedule.id);
    assert.equal(
      (await db.query("select * from meeting_test_effects")).rows.length,
      0
    );
    assert.equal(
      (await route(admin, owner).post({ ...body, title: "Changed payload" }))
        .status,
      503
    );
  } finally {
    await db.close();
  }
});

test("appointment HTTP route enforces authentication and owner scope while paging/filtering real SQL rows", async () => {
  const db = await setupMeetings();
  try {
    await db.query(
      `insert into meeting_schedules(talent_id,role_id,scheduling_source,title,status,confirmed_start_at,source_key,idempotency_key)
      select $1,case when n<33 then $2::uuid else null end,'external','Appointment '||n,'confirmed','2030-01-07T00:00Z'::timestamptz+n*interval '1 hour','source:'||n,'request:'||n from generate_series(1,33) n`,
      [owner, role]
    );
    const admin = meetingAdmin(db),
      get = route(admin, owner);
    assert.equal((await route(admin, null)()).status, 401);
    assert.equal((await get("?offset=-1")).status, 400);
    assert.equal((await get("?roleId=not-a-role")).status, 400);
    const first = await get(`?userId=${other}`);
    assert.equal(first.status, 200);
    assert.equal(first.body.schedules.length, 30);
    assert.equal(first.body.nextOffset, 30);
    assert.ok(
      first.body.schedules.every((row: any) => row.talent_id === owner)
    );
    const second = await get("?offset=30");
    assert.equal(second.body.schedules.length, 3);
    assert.equal(second.body.nextOffset, null);
    assert.equal(
      (await get(`?roleId=${role}&offset=30`)).body.schedules.length,
      2
    );
    assert.equal((await route(admin, other)()).body.schedules.length, 0);
    await db.query(
      "update meeting_schedules set status='cancelled' where source_key='source:33'"
    );
    assert.equal((await get("?offset=30")).body.schedules.length, 2);
    const failed = await route(
      {
        from() {
          throw new Error("database offline");
        },
      },
      owner
    )();
    assert.equal(failed.status, 503);
    assert.equal(failed.body.schedules, undefined);
  } finally {
    await db.close();
  }
});

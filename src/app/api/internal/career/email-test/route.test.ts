import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { NextRequest, NextResponse } from "next/server";

let runRoute: typeof import("./run/route");
let route: typeof import("./route");
let allowed = true;
const calls: unknown[] = [];
before(async () => {
  const mod = Module as any,
    load = mod._load;
  mod._load = function (name: string, parent: unknown, main: boolean) {
    if (name === "@/lib/internalApi")
      return {
        requireInternalApiUser: async () => {
          if (!allowed) throw new Error("Forbidden");
          return { id: "operator" };
        },
        toInternalApiErrorResponse: () =>
          NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    if (name === "@/lib/ops/careerEmailTest.server")
      return {
        runOpsEmailTest: async (...args: unknown[]) => {
          calls.push(args);
          return { pending: false };
        },
        createOpsEmailTest: async (...args: unknown[]) => {
          calls.push(args);
          return { jobId: "job" };
        },
        fetchOpsEmailTests: async (...args: unknown[]) => {
          calls.push(args);
          return { items: [] };
        },
      };
    return load.call(this, name, parent, main);
  };
  try {
    route = await import("./route");
    runRoute = await import("./run/route");
  } finally {
    mod._load = load;
  }
});
const input = {
  userId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  subject: "문의",
  content: "지원해 주세요.",
};
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/internal/career/email-test", {
    method: "POST",
    body: JSON.stringify(body),
  });

test("only authenticated teammates can start or read an email test", async () => {
  calls.length = 0;
  allowed = false;
  assert.equal((await route.POST(request(input))).status, 403);
  assert.equal(
    (
      await route.GET(
        new NextRequest(
          `http://localhost/api/internal/career/email-test?userId=${input.userId}`
        )
      )
    ).status,
    403
  );
  assert.equal(calls.length, 0);
  allowed = true;
  assert.equal((await route.POST(request(input))).status, 200);
  assert.deepEqual(calls[0], [input, "operator"]);
});

test("client cannot override transport, actor, ownership or external-delivery policy", async () => {
  calls.length = 0;
  for (const override of [
    { metadata: { opsEmailTest: false } },
    { actorId: "other" },
    { kind: "reply" },
    { userId: "invalid" },
  ])
    assert.equal(
      (await route.POST(request({ ...input, ...override }))).status,
      400
    );
  assert.equal(calls.length, 0);
});

test("run endpoint authenticates teammates and only accepts the account and job identifiers", async () => {
  calls.length = 0;
  const command = { userId: input.userId, jobId: input.requestId };
  allowed = false;
  assert.equal((await runRoute.POST(request(command))).status, 403);
  assert.equal(calls.length, 0);
  allowed = true;
  assert.equal(
    (await runRoute.POST(request({ ...command, kind: "reply" }))).status,
    400
  );
  assert.equal((await runRoute.POST(request(command))).status, 200);
  assert.deepEqual(calls, [[command.userId, command.jobId]]);
});

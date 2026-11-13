import assert from "node:assert/strict";
import test from "node:test";
import { extractTalentProfileDraftFromSources } from "./profileIngestion";

test("LinkedIn-only ingestion preserves provider failures without reporting a completed profile", async t => {
  const oldKey = process.env.APIFY_CLIENT_KEY;
  process.env.APIFY_CLIENT_KEY = "synthetic-no-network";
  t.after(() => { if (oldKey === undefined) delete process.env.APIFY_CLIENT_KEY; else process.env.APIFY_CLIENT_KEY = oldKey; });
  const logs: any[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  for (const failure of ["authentication", "empty dataset"]) {
    const calls: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
      calls.push(String(url));
      if (init?.method === "POST") {
        assert.equal(new URL(String(url)).searchParams.get("waitForFinish"), "60");
        return failure === "authentication"
          ? Response.json({error: {message: "Invalid token"}}, {status: 401})
          : Response.json({data: {id: "run", status: "SUCCEEDED", defaultDatasetId: "dataset"}});
      }
      return Response.json([]);
    });
    await assert.rejects(extractTalentProfileDraftFromSources({admin: {} as never, userId: "synthetic-owner", links: ["https://www.linkedin.com/in/synthetic-profile"], resumeText: null}), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /LinkedIn 프로필 정보를 가져오지 못했습니다/);
      assert.ok(error.cause instanceof Error);
      assert.match(error.cause.message, failure === "authentication" ? /401 Invalid token/ : /empty LinkedIn dataset/);
      return true;
    });
    assert.equal(calls.length, failure === "authentication" ? 1 : 2);
  }
  assert.equal(logs.length, 2);
  assert.match(logs[0][1].error, /401/);
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-no-network/);
});

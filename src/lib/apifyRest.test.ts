import assert from "node:assert/strict";
import test from "node:test";
import { callApifyActor } from "./apifyRest";
import { insertTalentProfileSourceErrorLog } from "./talentOnboarding/errorLogs";

test("a 90-second actor budget uses valid REST waits and polls the same run", async t => {
  const requests: {url: URL; method: string}[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    requests.push({url: new URL(url), method: init.method ?? "GET"});
    assert.ok(init.signal instanceof AbortSignal);
    assert.ok(Number(new URL(url).searchParams.get("waitForFinish")) <= 60);
    return Response.json({data: {id: "existing-run", status: requests.length === 1 ? "RUNNING" : "SUCCEEDED", defaultDatasetId: "dataset"}});
  });
  const result = await callApifyActor({actorId: "actor", token: "synthetic", input: {}, waitForFinishSeconds: 90, maxRunWaitSeconds: 90});
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
  assert.equal(requests[1].url.pathname, "/v2/actor-runs/existing-run");
});

test("provider authentication failure remains available in the existing profile error log", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({error: {message: "Invalid token"}}, {status: 401}));
  let cause: unknown;
  try { await callApifyActor({actorId: "actor", token: "synthetic", input: {}, waitForFinishSeconds: 60}); }
  catch (error) { cause = error; }
  let logged: any;
  const admin = {from: () => ({insert: async (row: unknown) => { logged = row; return {error: null}; }})};
  await insertTalentProfileSourceErrorLog({admin: admin as never, userId: "owner", stage: "onboarding_profile_ingest", error: new Error("LinkedIn profile unavailable", {cause})});
  assert.match(logged.meta_data.cause, /401 Invalid token/);
  assert.equal(logged.meta_data.error, "LinkedIn profile unavailable");
  assert.doesNotMatch(JSON.stringify(logged), /synthetic/);
});

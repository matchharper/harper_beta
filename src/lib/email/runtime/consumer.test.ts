import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";

let consume: typeof import("./consumer").processEmailRuntimeMessage;
const handled: string[] = [];
before(async () => {
  const mod = Module as any, load = mod._load;
  mod._load = function (name: string, parent: any, main: boolean) {
    if (parent?.filename?.endsWith("/email/runtime/consumer.ts")) {
      if (name === "@/lib/talentOnboarding/server") return {};
      if (name === "./store") return {};
      if (name === "./reply") return { processEmailReply: async () => { handled.push("reply"); } };
      if (name === "./contact") return { processEmailContact: async () => { handled.push("contact"); } };
      if (name === "./onboarding") return { processOnboardingReview: async () => { handled.push("onboarding_review"); } };
    }
    return load.call(this, name, parent, main);
  };
  try { consume = (await import("./consumer")).processEmailRuntimeMessage; }
  finally { mod._load = load; }
});

test("Queue deliveries claim and execute all email job kinds without an activation setting", async () => {
  delete process.env.EMAIL_RUNTIME_TARGET;
  const claims: string[] = [];
  const jobId = "00000000-0000-4000-8000-000000000001";
  const admin: any = { rpc: async (name: string, args: any) => {
    assert.equal(name, "claim_email_runtime_job_v1");
    claims.push(args.p_kind);
    return { data: { state: "claimed", job: { id: jobId } }, error: null };
  } };
  for (const kind of ["reply", "contact", "onboarding_review"])
    await consume({ version: 1, kind, jobId }, admin);
  assert.deepEqual(claims, ["reply", "contact", "onboarding_review"]);
  assert.deepEqual(handled, claims);
});

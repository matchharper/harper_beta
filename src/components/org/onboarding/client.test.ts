import assert from "node:assert/strict";
import test from "node:test";
import {
  OrgOnboardingResultUnconfirmedError,
  submitOrgOnboardingCompany,
  type OrgOnboardingCompanyStatus,
} from "./client";

const submission = {
  message: "Company context",
  responseLocale: "en",
  submissionId: "5dbf94c8-cb7d-43d9-a6f2-7423bfb36da0",
  workspaceId: "workspace-1",
};

test("recovers the committed reply when the original HTTP response is lost", async () => {
  let clock = 0;
  let reads = 0;
  let posts = 0;
  const reply = await submitOrgOnboardingCompany(submission, {
    post: async (_workspaceId, body) => {
      posts += 1;
      assert.equal(body.submissionId, submission.submissionId);
      throw new TypeError("Failed to fetch");
    },
    getStatus: async (): Promise<OrgOnboardingCompanyStatus> =>
      ++reads === 1
        ? { ok: true, status: "pending" }
        : { ok: true, status: "completed", reply: "Saved company context" },
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
  });
  assert.equal(reply, "Saved company context");
  assert.equal(posts, 1);
  assert.equal(reads, 2);
});

test("does not send another update while an earlier submission remains pending", async () => {
  let clock = 0;
  let posts = 0;
  await assert.rejects(
    submitOrgOnboardingCompany(submission, {
      post: async () => {
        posts += 1;
        return { ok: true, status: "pending" };
      },
      getStatus: async () => ({ ok: true, status: "pending" }),
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
    }),
    OrgOnboardingResultUnconfirmedError
  );
  assert.equal(posts, 1);
});

test("does not mistake an absent submission for a completed save", async () => {
  let clock = 0;
  await assert.rejects(
    submitOrgOnboardingCompany(submission, {
      post: async () => {
        throw new TypeError("Failed to fetch");
      },
      getStatus: async () => ({ ok: true, status: "missing" }),
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
    }),
    OrgOnboardingResultUnconfirmedError
  );
  assert.ok(clock >= 8_000);
  assert.ok(clock < 15_000);
});

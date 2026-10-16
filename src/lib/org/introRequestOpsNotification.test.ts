import assert from "node:assert/strict";
import test from "node:test";
import { notifyIntroAcceptanceForOps, notifyIntroRequestForOps } from "./introRequestOpsNotification";

function fixture() {
  const reads: string[] = [];
  const posts: Array<{ text: string; id: string }> = [];
  const rows: Record<string, unknown> = {
    company_intro_candidates: { role_id: "role", talent_id: "talent", requested_at: "2026-10-15" },
    company_workspace: { company_name: "Company & Co" },
    company_roles: { name: "Engineer" },
    talent_users: { name: "<@someone>" },
  };
  const admin = { from(table: string) {
    reads.push(table);
    return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: rows[table], error: null }; },
    };
  } };
  return { reads, posts, rows, args: {
    admin, workspaceId: "workspace", introCandidateId: "intro", status: "requested",
    post: async (text: string, id: string) => { posts.push({ text, id }); },
  } };
}

test("new Intro emits only compact internal facts and a stable message identity", async () => {
  const f = fixture();
  await notifyIntroRequestForOps(f.args);
  assert.equal(f.posts.length, 1);
  assert.match(f.posts[0].text, /^Intro 요청 · /);
  assert.match(f.posts[0].text, /Company &amp; Co : Engineer/);
  assert.match(f.posts[0].text, /→ &lt;@someone&gt;$/);
  assert.doesNotMatch(f.posts[0].text, /발송|연결 완료|수락/);
  await notifyIntroRequestForOps(f.args);
  assert.equal(f.posts[0].id, f.posts[1].id);
});

test("duplicate request and existing pipeline do not emit new notifications", async () => {
  const f = fixture();
  for (const status of ["already_requested", "already_in_pipeline", "role_unavailable", "talent_unavailable"]) {
    await notifyIntroRequestForOps({ ...f.args, status });
  }
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.posts, []);
});

test("unconfirmed request has no notification", async () => {
  const f = fixture();
  f.rows.company_intro_candidates = { requested_at: null };
  await notifyIntroRequestForOps(f.args);
  assert.deepEqual(f.posts, []);
});

test("Slack failure does not fail the completed Intro request", async () => {
  const f = fixture();
  const old = console.error;
  const errors: unknown[] = [];
  console.error = (...values) => { errors.push(values); };
  try {
    await assert.doesNotReject(notifyIntroRequestForOps({ ...f.args, post: async () => { throw new Error("Slack down"); } }));
    assert.equal(errors.length, 1);
  } finally { console.error = old; }
});

test("candidate acceptance has a separate internal identity and does not claim email delivery", async () => {
  const f = fixture();
  f.rows.company_intro_candidates = {
    role_id: "role", talent_id: "talent", requested_at: "2026-10-15",
    talent_decision_at: "2026-10-15", status: "connecting",
  };
  await notifyIntroRequestForOps(f.args);
  await notifyIntroAcceptanceForOps({ ...f.args, decisionChanged: true });
  assert.equal(f.posts.length, 2);
  assert.match(f.posts[1].text, /^후보자 Intro 수락 · /);
  assert.match(f.posts[1].text, /Company &amp; Co : Engineer/);
  assert.match(f.posts[1].text, /→ &lt;@someone&gt;$/);
  assert.doesNotMatch(f.posts[1].text, /발송|연결 완료/);
  assert.notEqual(f.posts[0].id, f.posts[1].id);
});

test("connection retries and declined decisions do not notify acceptance", async () => {
  const f = fixture();
  await notifyIntroAcceptanceForOps({ ...f.args, decisionChanged: false });
  assert.deepEqual(f.reads, []);
  f.rows.company_intro_candidates = { requested_at: "2026-10-15", talent_decision_at: "2026-10-15", status: "closed" };
  await notifyIntroAcceptanceForOps({ ...f.args, decisionChanged: true });
  assert.deepEqual(f.posts, []);
});

test("internal acceptance notification failure does not interrupt connection", async () => {
  const f = fixture();
  f.rows.company_intro_candidates = {
    role_id: "role", talent_id: "talent", requested_at: "2026-10-15",
    talent_decision_at: "2026-10-15", status: "connected",
  };
  const old = console.error;
  const errors: unknown[] = [];
  console.error = (...values) => { errors.push(values); };
  try {
    await assert.doesNotReject(notifyIntroAcceptanceForOps({ ...f.args, decisionChanged: true,
      post: async () => { throw new Error("Slack down"); } }));
    assert.equal(errors.length, 1);
  } finally { console.error = old; }
});

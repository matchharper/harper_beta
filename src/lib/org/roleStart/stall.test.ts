import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-only-not-used";
const session = () => import("./session");

test("a background step with no write for three minutes counts as stopped", async () => {
  const { isRoleStartStalled, ROLE_START_STALL_MS } = await session();
  const now = Date.parse("2026-10-21T00:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(isRoleStartStalled({ phase: "searching", updatedAt: at(ROLE_START_STALL_MS + 1) }, now), true);
  assert.equal(isRoleStartStalled({ phase: "drafting", updatedAt: at(ROLE_START_STALL_MS + 1) }, now), true);
  assert.equal(isRoleStartStalled({ phase: "batch", updatedAt: at(ROLE_START_STALL_MS + 1) }, now), true);
  assert.equal(isRoleStartStalled({ phase: "searching", updatedAt: at(60_000) }, now), false);
  assert.equal(isRoleStartStalled({ phase: "review", updatedAt: at(ROLE_START_STALL_MS * 10) }, now), false);
});

test("answers whose refinement never finished count as stopped after three minutes", async () => {
  const { isRoleStartStalled, ROLE_START_STALL_MS } = await session();
  const now = Date.parse("2026-10-21T00:00:00Z");
  const old = new Date(now - ROLE_START_STALL_MS - 1).toISOString();
  const questions = { history: [{}, {}] } as never;
  assert.equal(isRoleStartStalled({ phase: "questions", updatedAt: old, refinedAnswers: 1, questions }, now), true);
  assert.equal(isRoleStartStalled({ phase: "questions", updatedAt: old, refinedAnswers: 2, questions }, now), false);
});

test("the start flow holds the Role only while it can move forward", async () => {
  const { roleStartOwnsRole, ROLE_START_STALL_MS } = await session();
  const now = Date.parse("2026-10-21T00:00:00Z");
  const fresh = new Date(now - 60_000).toISOString();
  const old = new Date(now - ROLE_START_STALL_MS - 1).toISOString();
  assert.equal(roleStartOwnsRole({ phase: "drafting", updatedAt: fresh }, now), true);
  assert.equal(roleStartOwnsRole({ phase: "evaluating", updatedAt: old, firstCandidates: [{}] }, now), true);
  // Released: failed, no progress for three minutes, no one to rate, ended another way, finished.
  assert.equal(roleStartOwnsRole({ phase: "failed", updatedAt: fresh }, now), false);
  assert.equal(roleStartOwnsRole({ phase: "drafting", updatedAt: old }, now), false);
  assert.equal(roleStartOwnsRole({ phase: "registering", updatedAt: old }, now), true, "the pick may still be running");
  assert.equal(roleStartOwnsRole({ phase: "registering", updatedAt: new Date(now - 5 * 60_000 - 1).toISOString() }, now), false);
  assert.equal(roleStartOwnsRole({ phase: "evaluating", updatedAt: fresh, firstCandidates: [] }, now), false);
  assert.equal(roleStartOwnsRole({ phase: "superseded", updatedAt: fresh }, now), false);
  assert.equal(roleStartOwnsRole({ phase: "done", updatedAt: fresh }, now), false);
  assert.equal(roleStartOwnsRole(null, now), false);
});

test("the screen uses the same rule with its own stalled flag", async () => {
  const { roleStartOwnsRole } = await import("./ownership");
  assert.equal(roleStartOwnsRole({ phase: "searching", stalled: false, firstCandidates: [] }), true);
  assert.equal(roleStartOwnsRole({ phase: "searching", stalled: true }), false);
  assert.equal(roleStartOwnsRole({ phase: "evaluating", stalled: false, firstCandidates: [] }), false);
});

test("a flow ended another way reads like a failed one: its late results are not used", async () => {
  const { isRoleStartEnded } = await session();
  assert.equal(isRoleStartEnded("superseded"), true);
  assert.equal(isRoleStartEnded("failed"), true);
  for (const phase of ["drafting", "questions", "review", "searching", "evaluating", "registering", "done"]) {
    assert.equal(isRoleStartEnded(phase), false, phase);
  }
});

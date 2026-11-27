import assert from "node:assert/strict";
import test from "node:test";
import {
  PREPARATION_LIST_CONCURRENCY, PREPARATION_RULE, browserContinuation, browserInputSchema, executePreparationList,
  executeUseBrowser, formatBrowserToolResult,
} from "./tool";
import { careerToolCallGroups } from "./concurrentPreparation";
import type { ExternalOperation, ExternalToolContext } from "../externalOperations/store";

const context = { userId: "u", conversationId: "c", requestId: "reply:use_browser:hash" } as ExternalToolContext;
const list = (runs: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  browserInputSchema.parse({ action: "run", runs, ...extra });
const run = (id: string, status = "running") => ({ id, kind: "browser_run", status, request: { mode: "prepare" }, result: {} }) as unknown as ExternalOperation;

/** A fake single run that records how many run at once and finishes when released. */
function browsers() {
  let active = 0;
  const seen = { max: 0, started: [] as Array<{ raw: Record<string, unknown>; requestId: string }> };
  const waiting: Array<() => void> = [];
  const runOne = async (raw: unknown, runContext: ExternalToolContext) => {
    seen.started.push({ raw: raw as Record<string, unknown>, requestId: runContext.requestId });
    active++; seen.max = Math.max(seen.max, active);
    await new Promise<void>(resolve => waiting.push(resolve));
    active--;
    return { operation: run(`run-${seen.started.length}`, "completed"), modelOutput: `report ${(raw as { task: string }).task}` };
  };
  const releaseAll = async () => { while (true) { await new Promise(resolve => setImmediate(resolve)); const next = waiting.shift(); if (!next) return; next(); } };
  return { seen, runOne, releaseAll };
}

test("a preparation list starts every application together, each with its own request identity", async () => {
  const fake = browsers();
  const pending = executePreparationList(list([
    { task: "A", url: "https://jobs.example.test/a", role_refs: ["a"] },
    { task: "B", role_refs: ["b"], ignore_closed: true },
    { task: "C" },
  ], { work_id: "00000000-0000-4000-8000-000000000001" }), context, undefined, fake.runOne);
  await new Promise(resolve => setImmediate(resolve));
  // All three started before any finished.
  assert.equal(fake.seen.started.length, 3);
  assert.equal(fake.seen.max, 3);
  await fake.releaseAll();
  const result = await pending;
  assert.deepEqual(fake.seen.started.map(start => start.requestId), [0, 1, 2].map(index => `reply:use_browser:hash:run:${index}`));
  assert.deepEqual(fake.seen.started[1].raw, { action: "run", mode: "prepare", work_id: "00000000-0000-4000-8000-000000000001", task: "B", role_refs: ["b"], ignore_closed: true });
  assert.match(result.modelOutput, /^Preparation 1 of 3 \(role a\): https:\/\/jobs\.example\.test\/a\nreport A/);
  assert.match(result.modelOutput, /Preparation 3 of 3\nreport C$/);
  assert.equal(result.operations.length, 3);
  assert.deepEqual(result.careerContinuations, [], "finished runs leave nothing to wait for");
});

test(`more than ${PREPARATION_LIST_CONCURRENCY} preparations never run more than ${PREPARATION_LIST_CONCURRENCY} browsers at once`, async () => {
  const fake = browsers();
  const pending = executePreparationList(list(Array.from({ length: 8 }, (_, index) => ({ task: `T${index}`, role_refs: [`r${index}`] }))),
    context, undefined, fake.runOne);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fake.seen.started.length, PREPARATION_LIST_CONCURRENCY);
  await fake.releaseAll();
  const result = await pending;
  assert.equal(fake.seen.started.length, 8);
  assert.equal(fake.seen.max, PREPARATION_LIST_CONCURRENCY);
  assert.equal(result.modelOutput.match(/^Preparation \d of 8/gm)?.length, 8);
});

test("at the host deadline the started runs keep their browsers and the rest wait, so the limit still holds", async () => {
  const started: string[] = [];
  const deadlineAt = Date.now() + 50;
  const result = await executePreparationList(list(Array.from({ length: 7 }, (_, index) => ({ task: `T${index}` }))),
    { ...context, deadlineAt }, undefined, async (raw) => {
      started.push((raw as { task: string }).task);
      // A browser still working when the host deadline arrives returns its running receipt.
      await new Promise(resolve => setTimeout(resolve, Math.max(0, deadlineAt - Date.now()) + 5));
      return { operation: run(`run-${started.length}`), modelOutput: "still running" };
    });
  assert.equal(started.length, PREPARATION_LIST_CONCURRENCY);
  assert.equal(result.careerContinuations.length, PREPARATION_LIST_CONCURRENCY, "the reply waits for every started run");
  assert.ok(result.careerContinuations.every(wait => wait.kind === "browser_run"));
  assert.match(result.modelOutput, /Preparation 6 of 7\nNot started yet: .*same runs list/);
  assert.match(result.modelOutput, /Preparation 7 of 7\nNot started yet/);
});

test("one failed preparation does not hide the others, and the reply waits for each started run", async () => {
  const result = await executePreparationList(list([{ task: "A" }, { task: "B" }, { task: "C" }]), context, undefined, async (raw) => {
    const task = (raw as { task: string }).task;
    if (task === "B") throw new Error("Browser session is not ready");
    if (task === "C") return { operation: { ...run("cap", "capacity_wait") }, careerContinuation: { kind: "external_capacity", id: "cap" }, modelOutput: "capacity" };
    return { operation: run("run-a"), modelOutput: "running" };
  });
  assert.deepEqual(result.careerContinuations, [{ kind: "browser_run", id: "run-a" }, { kind: "external_capacity", id: "cap" }]);
  assert.match(result.modelOutput, /Preparation 2 of 3\nFailed: Browser session is not ready\. Read use_browser list/);
  await assert.rejects(executePreparationList(list([{ task: "A" }]), context, undefined, async () => { throw new Error("down"); }), /down/);
});

test("a list that would prepare one role twice, mix in a single run or submit starts nothing", async () => {
  let calls = 0;
  const runOne = async () => { calls++; return { modelOutput: "" }; };
  await assert.rejects(executePreparationList(list([{ task: "A", role_refs: ["a"] }, { task: "B", role_refs: ["a"] }]), context, undefined, runOne), /role a more than once/);
  await assert.rejects(executePreparationList(list([{ task: "A" }, { task: "A" }]), context, undefined, runOne), /repeats the same preparation/);
  await assert.rejects(executePreparationList(list([{ task: "A" }], { task: "top" }), context, undefined, runOne), /omit session_id/);
  await assert.rejects(executePreparationList(list([{ task: "A" }], { save_login: true }), context, undefined, runOne), /omit session_id/);
  await assert.rejects(executePreparationList(list([{ task: "A" }], { mode: "execute" }), context, undefined, runOne), /only for action=run in prepare mode/);
  assert.equal(calls, 0);
});

test("closed postings in a list open no browser", async (t) => {
  process.env.BROWSER_USE_API_KEY = "fixture-key";
  const providerCalls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => { providerCalls.push(String(url)); return new Response(null, { status: 500 }); });
  const ids = ["00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000000011"];
  const rows = ids.map(role_id => ({ role_id, name: "Data Engineer", status: "ended", is_expired: true, external_jd_url: "https://careers.example.com/x" }));
  const chain: any = { select: () => chain, in: async (_key: string, wanted: string[]) => ({ data: rows.filter(row => wanted.includes(row.role_id)), error: null }) };
  const closedContext = { admin: { from: (table: string) => { assert.equal(table, "company_roles"); return chain; } },
    userId: "00000000-0000-4000-8000-000000000001", conversationId: "00000000-0000-4000-8000-000000000099", requestId: "list" } as unknown as ExternalToolContext;
  const result = await executePreparationList({ action: "run", runs: ids.map(id => ({ task: "Prepare the application", role_refs: [id] })) }, closedContext);
  assert.equal((result as { modelOutput: string }).modelOutput.match(/already closed in Harper\. No browser was opened/g)?.length, 2);
  assert.deepEqual(providerCalls, []);
  // A single-run caller never takes a list.
  await assert.rejects(executeUseBrowser({ action: "run", runs: [{ task: "A" }] }, closedContext), /preparation list/);
});

test("preparation fills known facts but never attaches, consents, verifies or submits", () => {
  assert.match(PREPARATION_RULE, /fill the form with the facts the task supplies/);
  assert.match(PREPARATION_RULE, /Do not upload files, check consent boxes, request or enter verification codes, or press the final submit or send button/);
  assert.match(PREPARATION_RULE, /Leave a field empty when the task does not supply its answer; do not guess/);
  const submitted = { ...run("p", "completed"), result: { summary: "Done", submitted: "yes" } } as ExternalOperation;
  assert.match(formatBrowserToolResult([submitted]), /This was a preparation run, which must not submit, yet it reports a submission/);
  const executed = { ...submitted, request: { mode: "execute" } } as ExternalOperation;
  assert.doesNotMatch(formatBrowserToolResult([executed]), /This was a preparation run/);
  const notSubmitted = { ...submitted, result: { summary: "Done", submitted: "no" } } as ExternalOperation;
  assert.doesNotMatch(formatBrowserToolResult([notSubmitted]), /This was a preparation run/);
});

test("the reply waits for a running browser run, else for a recorded capacity retry", () => {
  assert.deepEqual(browserContinuation({ operation: run("r1") }), { kind: "browser_run", id: "r1" });
  assert.deepEqual(browserContinuation({ operations: [run("done", "completed"), run("r2", "cancelling")] }), { kind: "browser_run", id: "r2" });
  assert.deepEqual(browserContinuation({ operation: run("c", "capacity_wait"), careerContinuation: { kind: "external_capacity", id: "c" } }), { kind: "external_capacity", id: "c" });
  assert.equal(browserContinuation({ operation: run("done", "completed") }), undefined);
});

test("a preparation list holds every role it prepares when grouped with other calls in one step", () => {
  const listCall = { name: "use_browser", input: { action: "run", runs: [{ task: "A", role_refs: ["a"] }, { task: "B", role_refs: ["b"] }] } };
  const single = (role: string) => ({ name: "use_browser", input: { action: "run", task: "X", role_refs: [role] } });
  assert.deepEqual(careerToolCallGroups([listCall, single("c")]), [[0, 1]]);
  assert.deepEqual(careerToolCallGroups([listCall, single("b")]), [[0], [1]]);
  assert.deepEqual(careerToolCallGroups([{ name: "use_browser", input: { action: "run", runs: [{ task: "A", role_refs: "a" }] } }, single("c")]), [[0], [1]]);
});

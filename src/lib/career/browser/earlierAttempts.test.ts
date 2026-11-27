import assert from "node:assert/strict";
import test from "node:test";
import { boundEffectRefusal, earlierSubmitAttempts, executeUseBrowser, preparationSubmissionRefusal } from "./tool";
import type { ExternalOperation } from "../externalOperations/store";

const userId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000099";
const run = (id: string, roles: string[], result: Record<string, unknown>, provider_refs: Record<string, unknown> = {}, mode = "execute",
  updated_at = "2026-11-27T05:00:00.000000+00:00") =>
  ({ id, user_id: userId, kind: "browser_run", status: "completed", request: { mode, role_refs: roles }, result, provider_refs, updated_at });
const message = (id: number, created_at: string, extra: Record<string, unknown> = {}) =>
  ({ id, user_id: userId, conversation_id: conversationId, role: "user", created_at, ...extra });

/** Reads rows by column or by one JSON path (request->>mode, result->>submitted), as PostgREST filters them. */
function admin(rows: Record<string, any>[], failed = false, messages: Record<string, any>[] = []) {
  return {
    from: (table: string) => {
      const filters: ((row: Record<string, any>) => boolean)[] = [];
      const value = (row: Record<string, any>, key: string) => {
        const [column, field] = key.split("->>");
        return field ? row[column]?.[field] : row[column];
      };
      const found = () => (table === "talent_messages" ? messages : rows).filter((row) => filters.every((keep) => keep(row)));
      const chain: any = {
        select: () => chain, order: () => chain,
        eq: (key: string, wanted: unknown) => { filters.push((row) => value(row, key) === wanted); return chain; },
        in: (key: string, wanted: unknown[]) => { filters.push((row) => wanted.includes(value(row, key))); return chain; },
        gt: (key: string, after: string) => { filters.push((row) => Date.parse(value(row, key)) > Date.parse(after)); return chain; },
        limit: async () => failed ? { data: null, error: { message: "down" } } : { data: found(), error: null },
        maybeSingle: async () => ({ data: found()[0] ?? null, error: null }),
      };
      return chain;
    },
    rpc: async (name: string) => { throw new Error(`reached ${name}`); },
  } as any;
}

test("an execute run is told Harper's receipts of earlier submit attempts and preparation visits for the same posting", async () => {
  const rows = [
    run("now", ["role-a"], {}),
    run("no", ["role-a"], { submitted: "no" }, { run_id: "r1" }),
    run("cut", ["role-a", "role-b"], {}, { run_id: "r2" }),
    run("never", ["role-a"], {}),
    run("other", ["role-z"], { submitted: "yes" }, { run_id: "r3" }),
    run("prepared", ["role-a"], { submitted: "no" }, { run_id: "r4" }, "prepare"),
  ];
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, ["role-a"], "now"),
    "Harper's records for this application: 3 earlier submit attempts (1 did not submit, 1 was cut off before its receipt, 1 never reached a browser); 1 preparation visit (preparation may fill answers but does not submit, so answers already on the page are not by themselves a submission).");
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, ["role-q"], "now"), "");
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, [], "now"), "");
});

test("a reported submission is called out, and a failed read only leaves the line out", async () => {
  const rows = [run("yes", ["role-a"], { submitted: "Yes" }, { run_id: "r1" }), run("unclear", ["role-a"], { submitted: "unclear" }, { run_id: "r2" })];
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, ["role-a"], "now"),
    "Harper's records for this application: 2 earlier submit attempts (1 reported a submission, 1 pressed submit without a confirmed receipt). One reported a submission: do not submit again; report what the site shows about it.");
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows, true), userId }, ["role-a"], "now"), "");
});

test("a first submit after preparation hears that the answers on the page are the preparation's, not a submission", async () => {
  // 11/27: preparation now fills the answers it knows, so a site that keeps drafts shows them to the submit run.
  const rows = [
    run("filled", ["role-a"], { submitted: "no" }, { run_id: "r1" }, "prepare"),
    run("pressed", ["role-a"], { submitted: "unclear" }, { run_id: "r2" }, "prepare"),
  ];
  assert.equal(await earlierSubmitAttempts({ admin: admin(rows), userId }, ["role-a"], "now"),
    "Harper's records for this application: 2 preparation visits (preparation may fill answers but does not submit, so answers already on the page are not by themselves a submission; 1 of them pressed a final button without a confirmed receipt).");
});

const context = (rows: Record<string, any>[], messages: Record<string, any>[] = []) =>
  ({ admin: admin(rows, false, messages), userId, conversationId, requestId: "submit" });
const submit = (extra: Record<string, unknown> = {}) =>
  ({ action: "run", mode: "execute", effect_key: "apply:role-a", role_refs: ["role-a"], task: "Submit the approved application", ...extra });

test("a preparation that reports it submitted holds every later submit of that posting", async () => {
  // Preparation reserves no effect, so nothing but Harper's reading of its receipt used to stand in the way.
  const rows = [run("stray", ["role-a"], { submitted: "yes" }, { run_id: "r1" }, "prepare")];
  const result = await executeUseBrowser(submit({ resubmit_confirmed_by: 7 }), context(rows, [message(7, "2026-11-27T06:00:00Z")])) as any;
  assert.equal(result.status, "submission_reported");
  assert.equal(result.modelOutput, "Not started, nothing was submitted now: preparation run stray for this posting reports that it submitted the application. Report that receipt; do not submit again.");
  // Another posting, and a preparation that reported no submission, hold nothing: the submit goes on to its reservation.
  await assert.rejects(executeUseBrowser(submit({ role_refs: ["role-b"], effect_key: "apply:role-b" }), context(rows)), /reached create_talent_external_operation/);
  await assert.rejects(executeUseBrowser(submit(), context([run("filled", ["role-a"], { submitted: "no" }, { run_id: "r1" }, "prepare")])),
    /reached create_talent_external_operation/);
});

test("a preparation with an unclear receipt holds the submit until the person asks again in this chat after it", async () => {
  const rows = [run("pressed", ["role-a"], { submitted: "unclear" }, { run_id: "r1" }, "prepare", "2026-11-27T05:00:00.000000+00:00")];
  const held = await executeUseBrowser(submit(), context(rows)) as any;
  assert.equal(held.status, "submission_unknown");
  assert.match(held.modelOutput, /^Not started, nothing was submitted now: preparation run pressed for this posting pressed a final button without a confirmed receipt, so the application may have gone in\. Do not submit again on your own judgment: tell the person/);
  const messages = [
    message(1, "2026-11-27T04:59:00Z"),
    message(2, "2026-11-27T05:10:00Z", { conversation_id: "00000000-0000-4000-8000-000000000098" }),
    message(3, "2026-11-27T05:10:00Z", { role: "assistant" }),
    message(4, "2026-11-27T05:10:00Z"),
  ];
  for (const [id, why] of [[1, "written before the preparation ended"], [2, "in another chat"], [3, "Harper's own message"], [9, "not a message"]] as const) {
    const refused = await executeUseBrowser(submit({ resubmit_confirmed_by: id }), context(rows, messages)) as any;
    assert.equal(refused.status, "submission_unknown", why);
    assert.match(refused.modelOutput, new RegExp(`Message ${id} was not accepted as the person's request to submit again: it has to be their own message in this conversation, written after that attempt ended \\(2026-11-27T05:00:00\\.000000\\+00:00\\)\\. Do not pick another message yourself\\.`), why);
  }
  await assert.rejects(executeUseBrowser(submit({ resubmit_confirmed_by: 4 }), context(rows, messages)), /reached create_talent_external_operation/);
  await assert.rejects(preparationSubmissionRefusal({ ...context(rows), admin: admin(rows, true) } as never, ["role-a"]), /Browser runs unavailable/);
});

test("a submit refused after a confirmation the database did not take says why", () => {
  const cut = { ...run("cut", ["role-a"], { summary: "cancelled" }, { run_id: "r1" }), status: "cancelled", revision: 1 } as unknown as ExternalOperation;
  assert.equal(boundEffectRefusal(cut), "Not started: this application was already sent as browser_run cut (status cancelled). Whether it reached the company is unknown. Do not submit again on your own judgment: tell the person the earlier attempt may have gone in and how they can check (the company's confirmation mail, the site's own list of applications). If they then ask to submit again, run execute once more with resubmit_confirmed_by set to that message's ID.");
  assert.equal(boundEffectRefusal(cut, 12), "Not started: this application was already sent as browser_run cut (status cancelled). Whether it reached the company is unknown. Message 12 was not accepted as the person's request to submit again: it has to be their own message in this conversation, written after that attempt ended (2026-11-27T05:00:00.000000+00:00). Do not pick another message yourself. Do not submit again on your own judgment: tell the person the earlier attempt may have gone in and how they can check (the company's confirmation mail, the site's own list of applications). If they then ask to submit again, run execute once more with resubmit_confirmed_by set to that message's ID.");
  const sent = { ...cut, status: "completed", result: { submitted: "yes" } } as ExternalOperation;
  assert.equal(boundEffectRefusal(sent, 12), "Not started: this application was already sent as browser_run cut (status completed). Its receipt says it was submitted. Report that receipt; do not submit again.");
});

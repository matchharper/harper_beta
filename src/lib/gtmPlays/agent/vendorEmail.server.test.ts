/**
 * Asking treg about one person (vendorEmail.server.ts askVendor) with treg's answers faked (fetch) and no database:
 * the order of the asks, an answer still to come (tried again later), the stored answers a retry gets back with their
 * first charge, no time left in the tick, and treg refusing every ask. Synthetic people only.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import type { AgentPerson } from "./types";

let server: typeof import("./vendorEmail.server");
const alerts: string[] = [];
const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;
const originalFetch = globalThis.fetch;
before(async () => {
  loader._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "../db.server") return { gtmRead: async () => [{ n: 0 }] };
    if (request === "./alerts.server") return { agentAlert: async (kind: string) => { alerts.push(kind); return true; } };
    return originalLoad.call(this, request, parent, isMain);
  };
  server = await import("./vendorEmail.server");
});
after(() => {
  loader._load = originalLoad;
  globalThis.fetch = originalFetch;
});

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "timeout";

/** treg answering `replies` in turn; returns the calls made (tool and Idempotency-Key). */
function fakeTreg(replies: Reply[]): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push(`${String(url).split("/").pop()} ${headers["Idempotency-Key"]}`);
    const reply = replies.shift();
    if (!reply || reply === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status, headers: reply.headers });
  }) as typeof fetch;
  return calls;
}

const person = {
  id: "11111111-1111-1111-1111-111111111111", name: "Jane Doe", profileUrl: "https://www.linkedin.com/in/jane-doe-1a2b", contactUrl: null,
  currentCompany: "Acme Labs", method: "signal_post", source: "linkedin", emailLookup: { runId: "r", startedAt: "2026-11-26T00:00:00.000Z", state: "done" },
} as unknown as AgentPerson;
const plenty = () => 300_000;
const found = (email: string | null, verdict = "valid", charged = 40_000) => ({
  output: { email }, raw: {}, _treg: { served_by: "vendor-a", charged_micro: charged, verification: { verdict } },
});
const cost = (micro: number) => ({ "x-treg-cost-micro": String(micro) });
const replay = (original: number) => ({ "x-treg-cost-micro": "0", "x-treg-idempotent-replay": "true", "x-treg-original-cost-micro": String(original) });

test("a usable personal address ends it in one ask; a miss goes on to the current company's address", async () => {
  let calls = fakeTreg([{ status: 200, body: found("jane.doe@gmail.com"), headers: cost(42_000) }]);
  assert.deepEqual(await server.askVendor(person, true, "token", plenty), {
    kind: "asked", email: "jane.doe@gmail.com",
    asks: [{ ask: "personal", verdict: "valid", servedBy: "vendor-a", costUsd: 0.042, reason: null }],
  });
  assert.deepEqual(calls, [`treg.people.email.find.personal harper-gtm-agent-${person.id}-personal`]);
  calls = fakeTreg([
    { status: 200, body: found(null), headers: cost(30_000) },
    { status: 200, body: found("jane.doe@acmelabs.com", "valid", 10_000), headers: cost(12_000) },
  ]);
  const work = await server.askVendor(person, true, "token", plenty);
  assert.equal(work.kind === "asked" && work.email, "jane.doe@acmelabs.com");
  assert.deepEqual(work.kind === "asked" && work.asks.map((ask) => [ask.ask, ask.reason, ask.costUsd]), [["personal", "not_found", 0.03], ["work", null, 0.012]]);
  assert.equal(calls[1], `treg.people.email.find harper-gtm-agent-${person.id}-work`);
  // No LinkedIn profile: nothing asked.
  calls = fakeTreg([]);
  assert.deepEqual(await server.askVendor({ ...person, profileUrl: "https://janedoe.dev" }, true, "token", plenty), { kind: "asked", email: null, asks: [] });
  assert.equal(calls.length, 0);
});

test("no answer yet is tried again later, and the retry's stored answers count their first charge once", async () => {
  // A timeout (the vendor may have answered and been paid): nothing kept, tried again with the same key.
  fakeTreg(["timeout"]);
  const timedOut = await server.askVendor(person, true, "token", plenty);
  assert.equal(timedOut.kind, "retry");
  assert.ok(timedOut.kind === "retry" && timedOut.error instanceof server.VendorRetry);
  // The personal ask answered, then the work ask got no answer: the person waits for the retry (nothing logged yet).
  fakeTreg([{ status: 200, body: found("jane.doe@gmail.com", "accept_all"), headers: cost(42_000) }, { status: 503, body: { detail: "upstream_busy" } }]);
  const half = await server.askVendor(person, true, "token", plenty);
  assert.deepEqual(half.kind === "retry" && half.asks.map((ask) => [ask.ask, ask.reason, ask.costUsd]), [["personal", "not_verified", 0.042]]);
  // The retry: treg hands back the stored answer at cost 0 with the first charge, which is what is kept.
  const calls = fakeTreg([
    { status: 200, body: found("jane.doe@gmail.com", "accept_all"), headers: replay(42_000) },
    { status: 200, body: found("jane.doe@acmelabs.com", "valid", 10_000), headers: cost(12_000) },
  ]);
  const retried = await server.askVendor(person, true, "token", plenty);
  assert.deepEqual(retried.kind === "asked" && retried.asks.map((ask) => ask.costUsd), [0.042, 0.012]);
  assert.equal(calls[0], `treg.people.email.find.personal harper-gtm-agent-${person.id}-personal`);
  // 409 (the same ask still running) and a busy 429 wait too.
  for (const reply of [{ status: 409, body: { error: "idempotency_in_progress" } }, { status: 429, body: { error: "share_busy" } }]) {
    fakeTreg([reply]);
    assert.equal((await server.askVendor(person, true, "token", plenty)).kind, "retry", String(reply.status));
  }
});

test("no time left in the tick for an ask: the person waits for the next tick", async () => {
  let calls = fakeTreg([]);
  assert.deepEqual(await server.askVendor(person, true, "token", () => server.TREG_TIMEOUT_MS + server.TREG_END_MARGIN_MS - 1), { kind: "deferred" });
  assert.equal(calls.length, 0);
  // The personal ask took the time the work ask needed: nothing is kept (the next tick gets the first answer back).
  let left = 300_000;
  calls = fakeTreg([{ status: 200, body: found(null), headers: cost(30_000) }]);
  assert.deepEqual(await server.askVendor(person, true, "token", () => { const now = left; left = 60_000; return now; }), { kind: "deferred" });
  assert.equal(calls.length, 1);
});

test("treg refusing every ask (the key, the balance, today's trial pool) stops, tells Ops and is not tried again", async () => {
  for (const reply of [
    { status: 402, body: { error: "insufficient_balance" } }, { status: 403, body: { error: "funds_required" } },
    { status: 429, body: { error: "trial_allowance_reached" } }, { status: 429, body: { error: "member_spend_cap_reached" } },
  ]) {
    alerts.length = 0;
    const calls = fakeTreg([reply]);
    const result = await server.askVendor(person, true, "token", plenty);
    assert.deepEqual(result, {
      kind: "asked", email: null, asks: [{ ask: "personal", verdict: null, servedBy: null, costUsd: 0, reason: "failed", httpStatus: reply.status }],
    }, JSON.stringify(reply.body));
    assert.deepEqual(alerts, ["vendor_refused"]);
    assert.equal(calls.length, 1);
  }
  // Over the ceiling (402 route_max_cost) is not the key: no alert, and the work ask is still made.
  alerts.length = 0;
  const calls = fakeTreg([{ status: 402, body: { error: "route_max_cost" } }, { status: 200, body: found(null), headers: cost(0) }]);
  const result = await server.askVendor(person, true, "token", plenty);
  assert.deepEqual(result.kind === "asked" && result.asks.map((ask) => [ask.reason, ask.httpStatus ?? null]), [["failed", 402], ["not_found", null]]);
  assert.deepEqual(alerts, []);
  assert.equal(calls.length, 2);
});

test("a vendor still working (202) counts at what it holds, and the work ask goes on", async () => {
  fakeTreg([
    { status: 202, body: { _treg: { outcome: "pending", reserved_micro: 300_000, charged_micro: null } }, headers: cost(0) },
    { status: 200, body: found(null), headers: cost(0) },
  ]);
  const result = await server.askVendor(person, true, "token", plenty);
  assert.deepEqual(result.kind === "asked" && result.asks.map((ask) => [ask.ask, ask.reason, ask.httpStatus ?? null, ask.costUsd]), [
    ["personal", "failed", 202, 0.3], ["work", "not_found", null, 0],
  ]);
});

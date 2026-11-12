import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { CareerInvocationDelivery } from "./work/invocations";

// Isolate the transport from the real queue/model executors; use the production
// stream implementation and its Next after/disconnect contract below.
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
let execute: (delivery: CareerInvocationDelivery) => Promise<void | false>;
let publications = 0;
Module._load = function (name: string, ...args: unknown[]) {
  if (name === "./work/invocations") return {
    processCareerInvocation: async (_scope: unknown, _id: string, delivery: CareerInvocationDelivery) => execute(delivery),
    publishCareerInvocations: async () => { publications++; },
  };
  return originalLoad.call(this, name, ...args);
};
const { streamCareerReply, startCareerReply } = require("./directReply.server") as typeof import("./directReply.server");
Module._load = originalLoad;

for (const disconnect of [false, true]) test(`direct reply starts without queue delivery and completes ${disconnect ? "after disconnect" : "over the open stream"}`, async () => {
  publications = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = false, completed = false;
  const source = { id: 1, user_id: "owner", conversation_id: "conversation", role: "user", content: "Hello", message_type: "chat", payload: null, created_at: new Date().toISOString() } as any;
  execute = async delivery => {
    started = true;
    assert.equal(delivery.initialSourceMessage, source, "reuse the admitted source row");
    delivery.onLiveMessage?.({ id: "live:reply", role: "assistant", content: "Hello ", messageType: "career_turn_activity" } as any);
    await gate;
    completed = true;
    delivery.onArtifactMessage?.({ id: 2, role: "assistant", content: "Hello there!", messageType: "chat" } as any);
  };
  const filters: unknown[] = [];
  const query: any = { maybeSingle: async () => ({ data: { id: "invocation" }, error: null }) };
  for (const name of ["select", "eq", "is", "neq", "contains", "order", "limit"]) query[name] = (...args: unknown[]) => { filters.push([name, ...args]); return query; };
  const after: Array<() => Promise<void>> = [];
  const response = streamCareerReply({ admin: { from: () => query } as any, userId: "owner", conversationId: "conversation" }, source, work => after.push(work));
  const reader = response.body!.getReader();
  let text = new TextDecoder().decode((await reader.read()).value);
  assert.ok(text.includes("event: admitted"));
  assert.equal(started, true);
  assert.equal(publications, 0, "the initial executor never waits for a queue consumer");
  assert.ok(filters.some(filter => JSON.stringify(filter) === JSON.stringify(["eq", "user_id", "owner"])));
  if (disconnect) await reader.cancel();
  release();
  await Promise.all(after.map(work => work()));
  assert.equal(completed, true, "a detached browser cannot abandon admitted work");
  assert.equal(publications, 0, "completed direct replies do not publish redundant queue work");
  if (!disconnect) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    assert.ok(text.includes("event: activity"));
    assert.ok(text.includes("Hello there!"));
    assert.ok(text.includes("event: done"));
  }
  reader.releaseLock();
});

for (const outcome of ["completed", "busy", "failed"] as const) test(`JSON admission starts immediately and queues only recovery: ${outcome}`, async () => {
  publications = 0;
  let started = false;
  const row = { id: "invocation" };
  const query: any = { maybeSingle: async () => ({ data: row, error: null }) };
  for (const name of ["select", "eq", "is", "neq", "contains", "order", "limit"]) query[name] = () => query;
  const after: Array<() => Promise<void>> = [];
  execute = async delivery => {
    started = true;
    assert.equal(delivery.initialInvocation, row, "the executor reuses its scoped invocation read");
    if (outcome === "failed") throw new Error("Simulated executor failure");
    return outcome === "busy" ? false : undefined;
  };
  const result = startCareerReply({ admin: { from: () => query } as any, userId: "owner", conversationId: "conversation" }, { id: 1 } as any, work => after.push(work));
  await result;
  assert.equal(started, true, "execution does not wait for after or a queue consumer");
  assert.equal(publications, 0);
  await Promise.all(after.map(work => work()));
  assert.equal(publications, outcome === "completed" ? 0 : 1);
});

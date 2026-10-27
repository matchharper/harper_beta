import assert from "node:assert/strict";
import test from "node:test";
import { formatToolError, normalizeToolErrorResult, toolErrorResult, serializeToolResultForModel } from "./toolError";

test("plain database errors retain message, code, details and hint", () => {
  const text = formatToolError({ message: "query failed", code: "42703", details: "column absent", hint: "refresh schema" });
  for (const value of ["query failed", "42703", "column absent", "refresh schema"]) assert.ok(text.includes(value));
  assert.ok(!text.includes("[object Object]"));
});
test("domain codes preserve evidence without adding a guessed diagnosis", () => {
  const text = formatToolError({ code: "P0002", message: "candidate_relay_document_not_found" });
  assert.ok(!text.includes("public, non-deleted"));
  assert.match(text, /candidate_relay_document_not_found/);
  assert.match(formatToolError(new Error("company_talent_request_draft_stale")), /company_talent_request_draft_stale/);
});
test("unknown errors and nested causes remain informative", () => {
  const error = new Error("upstream failed", { cause: { message: "timeout", code: "ETIMEDOUT" } });
  assert.match(formatToolError(error), /upstream failed/);
  assert.match(formatToolError(error), /ETIMEDOUT/);
  assert.equal(toolErrorResult("new_provider_failure").error, "new_provider_failure");
});
test("circular values, bigint and unusual throws always produce text", () => {
  const error: Record<string, unknown> = { message: "failed", details: BigInt(42) }; error.cause = error;
  const text = formatToolError(error);
  assert.match(text, /Circular/); assert.match(text, /42/);
  for (const value of [null, undefined, 5, Symbol("failure"), Object.create(null)]) assert.equal(typeof formatToolError(value), "string");
  assert.doesNotThrow(() => JSON.stringify(toolErrorResult(error)));
});
test("transport credentials and stacks are excluded", () => {
  const text = formatToolError({ message: "failed", headers: { authorization: "private" }, config: { secret: "private" }, stack: "private" });
  assert.ok(!text.includes("private"));
});
test("returned failures retain partial results and existing recovery text", () => {
  const result = normalizeToolErrorResult({ ok: false, error: { message: "failed", details: "connection reset" }, sentIds: [1], message: "Read the saved contact first" }) as Record<string, unknown>;
  assert.deepEqual(result.sentIds, [1]); assert.equal(result.message, "Read the saved contact first");
  assert.match(serializeToolResultForModel(result), /connection reset/);
  const success = { ok: true, value: 1 }; assert.equal(normalizeToolErrorResult(success), success);
});

test("compact model output cannot hide a returned error", () => {
  const result = normalizeToolErrorResult({ ok: false, error: { message: "read failed", code: "EIO" }, modelOutput: "Unable to read document" }) as Record<string, unknown>;
  assert.match(result.modelOutput as string, /Unable to read document/);
  assert.match(serializeToolResultForModel(result, value => (value as typeof result).modelOutput as string), /EIO/);
});

test("provider response details survive without request headers", () => {
  const error = new Error("provider request failed") as Error & { response: unknown };
  error.response = { status: 429, data: { error: { message: "quota exceeded", code: "quota" } }, headers: { authorization: "hidden" } };
  const text = formatToolError(error);
  assert.match(text, /quota exceeded/);
  assert.match(text, /429/);
  assert.ok(!text.includes("hidden"));
});

 test("unknown attributes, token counts, aggregate errors and safe provider diagnostics survive", () => {
  const error = new AggregateError([new Error("child")], "batch failed") as AggregateError & { failedItems: number[]; token_count: number };
  error.failedItems = [2, 4]; error.token_count = 17;
  const text = formatToolError(error);
  for (const key of ["child", "batch failed", "failedItems", "token_count", "17"]) assert.ok(text.includes(key));
 });
 test("credential strings and diagnostic payloads are sanitized at the delivery boundary", () => {
  const result = { ok: false, error: { message: "Authorization=abc Bearer tokenvalue", apiKey: "private-value", details: "postgres://me:password@host/db" }, assistantInstruction: "기존 안내" };
  const output = serializeToolResultForModel(result);
  assert.ok(!output.includes("private-value")); assert.ok(!output.includes("tokenvalue")); assert.ok(!output.includes("me:password"));
  assert.equal(result.error.apiKey, "private-value"); assert.match(output, /assistantInstruction: 기존 안내/);
 });
 test("getters never execute and wide/deep diagnostic traversal is bounded", () => {
  let reads = 0; const error = { message: "failure", huge: Array.from({length: 10000}, (_, i) => i) };
  Object.defineProperty(error, "danger", { enumerable: true, get() { reads++; throw new Error("getter ran"); } });
  const output = formatToolError(error); assert.equal(reads, 0); assert.match(output, /limit|Incomplete/);
  assert.ok(output.length < 66000);
 });

test("existing supplemental field values are never overwritten", () => {
  const result = { ok: false, error: "failed", additionalToolDiagnostics: "기존 원문" };
  const output = serializeToolResultForModel(result);
  assert.match(output, /additionalToolDiagnostics: 기존 원문/);
  assert.match(output, /Additional tool diagnostics:\nfailed/);
});
test("undefined tool results and inherited accessors cannot break transport", () => {
  assert.equal(typeof serializeToolResultForModel(undefined), "string");
  let reads = 0;
  const prototype = Object.create(Error.prototype, { name: { get() { reads++; return "secret"; } } });
  const error = Object.setPrototypeOf(new Error("failed"), prototype);
  assert.ok(formatToolError(error).includes("failed")); assert.equal(reads, 0);
});

test("returned Error objects remain readable and an explicit empty error flag adds no diagnostic", () => {
  assert.match(serializeToolResultForModel(new Error("returned SDK error")), /returned SDK error/);
  const clear = { ok: true, error: false };
  assert.equal(serializeToolResultForModel(clear), "ok: 예\nerror: 아니요");
});

test("native DOM errors retain their message without evaluating custom accessors", () => {
  assert.match(formatToolError(new DOMException("native read failed", "SecurityError")), /native read failed/);
});
test("source-owned billing privacy remains intact while UI code stays available", async () => {
  const { WorkspaceBillingError, billingActionNotice } = await import("@/lib/org/billing/types");
  const error = new WorkspaceBillingError("credits_exhausted");
  const text = formatToolError(error);
  assert.ok(text.includes(error.message)); assert.ok(!text.includes("credits_exhausted"));
  assert.ok(!text.includes("WorkspaceBillingError"));
  assert.deepEqual(billingActionNotice(error), { code: "credits_exhausted" });
});
test("large property names cannot bypass diagnostic output limits", () => {
  const error = { code: "E_KEY", message: "failed", ["k".repeat(100000)]: "value" };
  const output = formatToolError(error); assert.match(output, /E_KEY/); assert.ok(output.length < 66000);
});

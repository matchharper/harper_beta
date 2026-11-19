import assert from "node:assert/strict";
import test from "node:test";
import { AgentSendError, classifySendError } from "./sendErrors";

// What src/lib/email/send.ts throws for a provider answer.
const http = (status: number, body: Record<string, unknown>) =>
  new Error(`Failed to send email: HTTP ${status} ${JSON.stringify({ statusCode: status, ...body })}`);

test("sender settings and the account: refused (sending stops for the tick, the person stays approved)", () => {
  for (const error of [
    http(401, { name: "missing_api_key", message: "Missing API key in the authorization header." }),
    http(403, { name: "validation_error", message: "The example.com domain is not verified." }),
    http(403, { name: "invalid_api_key", message: "API key is invalid" }),
    http(422, { name: "invalid_from_address", message: "Invalid `from` field." }),
    http(429, { name: "rate_limit_exceeded", message: "Too many requests." }),
    http(429, { name: "daily_quota_exceeded", message: "You have reached your daily email sending quota." }),
    new Error("RESEND_API_KEY is required"),
  ]) {
    const kind = classifySendError(error).kind;
    assert.equal(kind, "refused", error.message);
  }
});

test("no answer or a server error: unknown (the row stays sending, asked again with the same key)", () => {
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  const reset = new TypeError("fetch failed");
  for (const error of [
    http(500, { name: "internal_server_error", message: "Unexpected error" }),
    http(503, { message: "Service unavailable" }),
    http(409, { name: "concurrent_idempotent_requests", message: "Same idempotency key request is in progress." }),
    timeout,
    reset,
    new Error("socket hang up"),
  ]) {
    assert.equal(classifySendError(error).kind, "unknown", error.message);
  }
  assert.match(classifySendError(timeout).reason, /제때/);
});

test("the address or this mail itself: recipient (the person fails, the others go on)", () => {
  for (const error of [
    http(422, { name: "validation_error", message: "Invalid `to` field. The email address needs to follow the `email@example.com` format." }),
    http(422, { name: "invalid_to_address", message: "Invalid to address" }),
    http(400, { name: "validation_error", message: "The `html` field is too large." }),
    http(409, { name: "invalid_idempotent_request", message: "Same idempotency key used with a different request payload." }),
  ]) {
    assert.equal(classifySendError(error).kind, "recipient", error.message);
  }
});

test("a reason fit for the run's error line, with the status", () => {
  const info = classifySendError(http(403, { name: "validation_error", message: "The example.com domain is not verified." }));
  assert.equal(info.status, 403);
  assert.match(info.reason, /403/);
  assert.match(info.reason, /not verified/);
  assert.ok(info.reason.length < 300);
  const raw = classifySendError(new Error("Failed to send email: HTTP 502 <html>bad gateway</html>"));
  assert.equal(raw.kind, "unknown");
  assert.equal(raw.status, 502);
});

test("AgentSendError carries the kind and the mail", () => {
  const error = new AgentSendError(classifySendError(http(429, { message: "slow down" })), "mail-1");
  assert.equal(error.kind, "refused");
  assert.equal(error.mailId, "mail-1");
  assert.ok(error instanceof Error);
});

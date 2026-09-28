import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { prepareDirectCandidateMessage } from "./directMessage";

const input = { messageContent: "Hi Daniel,\nWould Tuesday work?\nThanks!", messageSubject: "Availability", requestContext: "Tuesday availability" };
test("direct contact preserves authored subject, body and topic without a writer", () => {
  assert.deepEqual(prepareDirectCandidateMessage(input, null), { body: input.messageContent, subject: input.messageSubject, requestContext: input.requestContext, reason: null });
});
test("only the explicit upload slot is bound to its verified signed destination", () => {
  const url = "https://matchharper.com/career/profile?resumeRequest=exact-signed-id";
  assert.equal(prepareDirectCandidateMessage({ ...input, messageContent: "[이력서 올리기]({{resume_upload_url}})" }, url).body, `[이력서 올리기](${url})`);
  assert.throws(() => prepareDirectCandidateMessage({ ...input, messageContent: "{{resume_upload_url}}" }, null));
  assert.throws(() => prepareDirectCandidateMessage({ ...input, messageContent: "https://matchharper.com/career/profile?resumeRequest=wrong" }, url));
});
test("reject missing fields, header injection and oversized machine fields", () => {
  assert.throws(() => prepareDirectCandidateMessage({ ...input, messageSubject: undefined }, null));
  assert.throws(() => prepareDirectCandidateMessage({ ...input, messageSubject: "hello\nBcc: other@example.com" }, null));
  assert.throws(() => prepareDirectCandidateMessage({ ...input, requestContext: "x".repeat(801) }, null));
});
test("both new-message and relay send paths use the single writer contract", () => {
  const source = readFileSync(new URL("../org/agent/toolExecution.ts", import.meta.url), "utf8");
  const relay = source.slice(source.indexOf('if (action === "send" && has(args.input, "relayId"))'), source.indexOf('if (action === "create_draft" || action === "send")'));
  assert.match(relay, /prepareDirectCandidateMessage/);
  assert.doesNotMatch(relay, /generateCandidateContactDraft/);
  assert.match(source, /directSend\s*\? prepareDirectCandidateMessage/);
});

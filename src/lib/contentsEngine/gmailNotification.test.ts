import assert from "node:assert/strict";
import test from "node:test";
import { decodeGmailNotification } from "./gmailNotification";
const encode = (historyId: unknown) =>
  Buffer.from(
    JSON.stringify({ emailAddress: "daniel@matchharper.com", historyId })
  ).toString("base64");
test("accepts Gmail numeric push cursors and lossless 64-bit strings", () => {
  assert.equal(decodeGmailNotification(encode(201847)).historyId, "201847");
  assert.equal(
    decodeGmailNotification(encode("18446744073709551615")).historyId,
    "18446744073709551615"
  );
  for (const value of [null, {}, 1.25, -4, "bad", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => decodeGmailNotification(encode(value)));
});

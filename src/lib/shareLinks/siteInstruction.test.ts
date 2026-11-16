import assert from "node:assert/strict";
import test from "node:test";
import { siteProfileLinkInstruction } from "./siteInstruction";

test("site instruction names the link once and the three placement rules in order", () => {
  const text = siteProfileLinkInstruction("https://matchharper.com/c/abc");
  assert.equal(text.split("https://matchharper.com/c/abc").length - 1, 1);
  const order = ["1. An empty optional field", "2. Otherwise, a free-text field", "3. Otherwise, do not add it"].map((part) => text.indexOf(part));
  assert.ok(order.every((index) => index > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(text, /Never replace, shorten or remove the candidate's own answers or links/);
  assert.match(text, /quoting the URL/);
});

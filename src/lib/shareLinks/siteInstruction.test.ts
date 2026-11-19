import assert from "node:assert/strict";
import test from "node:test";
import { siteProfileLinkInstruction } from "./siteInstruction";

test("site instruction names the link once and the three placement rules in order", () => {
  const text = siteProfileLinkInstruction("https://matchharper.com/c/abc");
  assert.equal(text.split("https://matchharper.com/c/abc").length - 1, 1);
  const order = ["1. An empty optional field", "2. Otherwise, an optional free-text field", "3. Otherwise, do not add it"].map((part) => text.indexOf(part));
  assert.ok(order.every((index) => index > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(text, /Never replace, shorten or remove the candidate's own answers or links/);
  assert.match(text, /quoting the URL/);
  assert.match(text, /left out, say that and why without writing the URL/);
  assert.match(text, /Set profileLink to added only when the link is in a field of the form you submitted/);
});

test("a field the reviewed answers left blank may take the link; a field left for the user may not", () => {
  const text = siteProfileLinkInstruction("https://matchharper.com/c/abc");
  assert.match(text, /including one the reviewed answers left blank/);
  assert.match(text, /filled or blank: add one line at its end \(or as its only line when it is blank\)/);
  assert.match(text, /A blank answer in the reviewed form only means nothing was written there/);
  assert.match(text, /never add it to a field the reviewed answers say the user will fill in themselves/);
  assert.match(text, /not a LinkedIn, GitHub or other named profile field/);
});

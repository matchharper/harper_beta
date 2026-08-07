import assert from "node:assert/strict";
import test from "node:test";
import { safeSlice } from "@/lib/textSanitization";

test("safeSlice keeps ordinary string length limits", () => {
  assert.equal(safeSlice("abcdef", 4), "abcd");
  assert.equal(safeSlice("abc", 4), "abc");
  assert.equal(safeSlice("abc", 0), "");
});

test("safeSlice does not split a surrogate pair at the limit", () => {
  const prefix = "a".repeat(1199);
  const value = `${prefix}\u{1d600}tail`;

  assert.equal(safeSlice(value, 1200), prefix);
  assert.equal(safeSlice(value, 1201), `${prefix}\u{1d600}`);
});

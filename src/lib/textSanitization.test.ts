import assert from "node:assert/strict";
import test from "node:test";
import { safeSlice, stripPostgresUnsafeChars, stripPostgresUnsafeCharsDeep } from "@/lib/textSanitization";

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
test("DB text removes NUL and lone surrogates but preserves Korean and emoji", () => {
  assert.equal(
    stripPostgresUnsafeChars("김\u0000윤철\ud800 경력 🧑‍💻\udc00\n학력"),
    "김윤철 경력 🧑‍💻\n학력"
  );
});

test("a JSON value for jsonb loses NUL and lone surrogates in every string and key, and the input stays as it was (#95)", () => {
  const value = { messages: [{ role: "tool", content: "Publication time unavailable.\u0000 Senior Engineer 🧑‍💻\ud800" }],
    ["note\u0000"]: { count: 2, ok: true, missing: null }, list: ["a\udc00b", 3] };
  const clean = stripPostgresUnsafeCharsDeep(value);
  assert.deepEqual(clean, { messages: [{ role: "tool", content: "Publication time unavailable. Senior Engineer 🧑‍💻" }],
    note: { count: 2, ok: true, missing: null }, list: ["ab", 3] });
  assert.equal(value.messages[0].content.includes("\u0000"), true);
  assert.deepEqual(stripPostgresUnsafeCharsDeep({ text: "그대로\n둠" }), { text: "그대로\n둠" });
});

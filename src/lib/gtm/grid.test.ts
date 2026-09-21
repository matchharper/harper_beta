import assert from "node:assert/strict";
import test from "node:test";
import {
  cellColor,
  columnLetter,
  displayValue,
  matchesRule,
  moveColumn,
  parseCell,
} from "./grid";

test("empty measurements stay null and zero remains an observed zero", () => {
  assert.equal(parseCell("", "number"), null);
  assert.equal(parseCell("0", "number"), 0);
  assert.equal(displayValue(null), "");
  assert.equal(displayValue(0), "0");
  assert.throws(() => parseCell("12abc", "number"));
  assert.throws(() => parseCell("Infinity", "number"));
  assert.throws(() => parseCell("not a date", "date"));
});
test("edits preserve Korean, newlines, explicit false and structured arrays", () => {
  assert.equal(parseCell(" 한글\n긴 메모 ", "text"), " 한글\n긴 메모 ");
  assert.equal(parseCell("FALSE", "boolean"), false);
  assert.throws(() => parseCell("yes", "boolean"));
  assert.deepEqual(parseCell('["디자인, 도구", "커리어"]', "array"), [
    "디자인, 도구",
    "커리어",
  ]);
  assert.throws(() => parseCell('[{"value":1}]', "array"));
});
test("color rules do not turn an empty value into a zero measurement", () => {
  const rule = { operator: "lte" as const, value: "3", color: "#ff0000" };
  assert.equal(matchesRule(null, rule), false);
  assert.equal(matchesRule("", rule), false);
  assert.equal(matchesRule(0, rule), true);
  assert.equal(
    cellColor(4, {
      key: "score",
      label: "점수",
      width: 120,
      color: "#ffffff",
      rules: [rule],
    }),
    "#ffffff"
  );
});
test("column movement preserves identities and hidden configuration", () => {
  const cols = [
    { key: "name", label: "이름", width: 200 },
    { key: "note", label: "메모", width: 400, hidden: true },
    { key: "score", label: "점수", width: 90 },
  ];
  const moved = moveColumn(cols, "score", "name");
  assert.deepEqual(
    moved.map((column) => column.key),
    ["score", "name", "note"]
  );
  assert.equal(moved[2].hidden, true);
  assert.equal(cols[0].key, "name");
  assert.deepEqual(
    moveColumn(cols, "name", "score", "after").map((column) => column.key),
    ["note", "score", "name"]
  );
  assert.strictEqual(moveColumn(cols, "note", "score", "before"), cols);
  assert.deepEqual(
    [columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(51)],
    ["A", "Z", "AA", "AZ"]
  );
});

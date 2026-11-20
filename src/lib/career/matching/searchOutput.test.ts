import assert from "node:assert/strict";
import test from "node:test";
import { formatCompanyFill } from "./searchOutput";

test("a search says which companies near the top were brought up to date and which are still being gathered", () => {
  const numbers = new Map([["a", 3], ["b", 7], ["c", 20]]);
  const numberOf = (id: string) => numbers.get(id);
  assert.equal(formatCompanyFill(undefined, numberOf), "");
  assert.equal(formatCompanyFill({ ready: ["a", "b"], pending: ["c"], failed: [], deferred: ["d"], judgedAgain: 2 }, numberOf), [
    "Company overview and hiring signals brought up to date before ranking: [3] [7].",
    "Still being gathered, so judged with what was on record (a later search uses what is found): [20].",
    "Not gathered within this search's time, so judged with what was on record: 1 company.",
  ].join("\n"));
  // Without option numbers (no matching), a count.
  assert.equal(formatCompanyFill({ ready: [], pending: ["x", "y"] }, () => undefined),
    "Still being gathered, so judged with what was on record (a later search uses what is found): 2 companies.");
  assert.equal(formatCompanyFill({ error: "provider down" }, numberOf), "Company information near the top could not be updated: provider down");
});

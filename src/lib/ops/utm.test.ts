import assert from "node:assert/strict";
import test from "node:test";
import { parseOpsUtmGranularity, parseOpsUtmPeriod } from "@/lib/ops/utm";

test("UTM date controls accept supported values", () => {
  assert.equal(parseOpsUtmPeriod("7d"), "7d");
  assert.equal(parseOpsUtmPeriod("12m"), "12m");
  assert.equal(parseOpsUtmGranularity("week"), "week");
});

test("UTM date controls fall back safely", () => {
  assert.equal(parseOpsUtmPeriod("forever"), "30d");
  assert.equal(parseOpsUtmGranularity("month"), "day");
});

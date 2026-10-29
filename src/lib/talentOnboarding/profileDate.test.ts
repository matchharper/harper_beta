import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProfileDate } from "./profileDate";

test("normalizes partial calendar periods across common profile formats", () => {
  for (const input of ["2026-10", "2026/10", "2026.10.", "2026년 10월", "2026年10月", "202610", "October 2026", "Oct. 2026", "2026 Oct", "10/2026", "10월 2026", "２０２６－１０"]) {
    assert.equal(normalizeProfileDate(input, "start"), "2026-10-01", input);
    assert.equal(normalizeProfileDate(input, "end"), "2026-10-31", input);
  }
  assert.equal(normalizeProfileDate("2024년", "start"), "2024-01-01");
  assert.equal(normalizeProfileDate("2024", "end"), "2024-12-31");
  assert.equal(normalizeProfileDate("2024-02", "end"), "2024-02-29");
  assert.equal(normalizeProfileDate("2025-02", "end"), "2025-02-28");
});

test("retains explicit days and the calendar day written in timestamps", () => {
  for (const input of ["2026-10-28", "2026/10/28", "2026. 10. 28.", "2026년 10월 28일", "2026年10月28日", "20261028", "Oct 28, 2026", "28th October 2026", "2026 Oct 28", "28/10/2026", "10/28/2026", "2026-10-28T23:59:59.123-08:00"]) {
    assert.equal(normalizeProfileDate(input, "end"), "2026-10-28", input);
  }
});

test("handles open dates without inventing dates for ambiguous or invalid input", () => {
  for (const input of [null, undefined, "", " ", "Present", "Current", "재직 중", "재학중", "현재", "至今"]) {
    assert.equal(normalizeProfileDate(input, "end"), null);
  }
  for (const input of ["2026-02-30", "2025-02-29", "2026-00", "2026-13", "2026-10-00", "03/04/2026", "10월", "last employer", "2026-2027"]) {
    assert.throws(() => normalizeProfileDate(input), /calendar date/, input);
  }
});

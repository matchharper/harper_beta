import assert from "node:assert/strict";
import test from "node:test";
import { formatEmployeeCountRange } from "./watchlistFormatters";

test("unknown upper employee limits display an open-ended range", () => {
  for (const start of [1001, 5001, 10001]) {
    for (const end of [0, null, undefined, "", "0"]) {
      assert.equal(formatEmployeeCountRange({ start, end }), `${start.toLocaleString("ko-KR")}명 이상`);
    }
  }
  assert.equal(formatEmployeeCountRange({ start: 51, end: 200 }), "51-200명");
  assert.equal(formatEmployeeCountRange({ start: null, end: 50 }), "50명 이하");
  assert.equal(formatEmployeeCountRange({ start: null, end: null }), "");
});

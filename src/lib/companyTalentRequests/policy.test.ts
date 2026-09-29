import assert from "node:assert/strict";
import test from "node:test";
import { validateCompanyContactContext } from "./policy";

test("the contact contract preserves meaning without keyword classification", () => {
  for (const content of [
    "어떤 역할을 선택하실지, 희망 조건이 있다면 알려 주세요.",
    "Thank you. No reply is needed.",
    "Please share a resume, or let us know if you prefer to wait.",
    "가족 건강 때문에 일정 변경을 요청하셨으니 가능한 시간을 여쭤봐 주세요.",
  ])
    assert.equal(validateCompanyContactContext(content), content);
});
test("only structural context limits are enforced", () => {
  assert.throws(() => validateCompanyContactContext(""));
  assert.throws(() => validateCompanyContactContext(null));
  assert.throws(() => validateCompanyContactContext("a".repeat(801)));
  assert.equal(validateCompanyContactContext("a".repeat(800)).length, 800);
});

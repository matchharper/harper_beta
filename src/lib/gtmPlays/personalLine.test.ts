import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanPersonalLine,
  gtmCandidateGreeting,
  gtmCandidateOpening,
} from "./personalLine";

test("the line comes right after the greeting (ko, en)", () => {
  assert.deepEqual(
    gtmCandidateOpening("ko", "김하준", "결제 백엔드를 4년 하신 경험이 이 자리와 잘 맞아 보여 연락드려요."),
    ["김하준님, 안녕하세요.", "결제 백엔드를 4년 하신 경험이 이 자리와 잘 맞아 보여 연락드려요."],
  );
  assert.deepEqual(
    gtmCandidateOpening("en", "Hajun Kim", "Your four years building payments backends look like a close fit for this role."),
    ["Hi Hajun,", "Your four years building payments backends look like a close fit for this role."],
  );
});

test("no line: only the greeting", () => {
  assert.deepEqual(gtmCandidateOpening("ko", "김하준", null), ["김하준님, 안녕하세요."]);
  assert.deepEqual(gtmCandidateOpening("ko", null, "   "), ["안녕하세요."]);
  assert.deepEqual(gtmCandidateOpening("en", "", undefined), ["Hi,"]);
  assert.equal(gtmCandidateGreeting("en", "  Hajun  "), "Hi Hajun,");
});

test("a line is cleaned to one plain sentence", () => {
  assert.equal(cleanPersonalLine('  "결제 백엔드를\n 4년 하셨어요."  '), "결제 백엔드를 4년 하셨어요.");
  assert.equal(cleanPersonalLine("“Your payments work fits.”"), "Your payments work fits.");
  assert.equal(cleanPersonalLine(""), null);
  assert.equal(cleanPersonalLine(null), null);
});

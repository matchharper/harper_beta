import assert from "node:assert/strict";
import test from "node:test";
import { visibleReengagementStreamText } from "./reengagementStreamText";

test("split control markers and action JSON never appear in live prose", () => {
  const prose = "다시 오셨네요. [포지션 보기](/career/history)";
  const text = `${prose}\n[[CAREER_REENGAGEMENT_ACTIONS]]\n{"actions":[]}\n[[/CAREER_REENGAGEMENT_ACTIONS]]`;
  for (let length = 0; length <= text.length; length++) {
    const visible = visibleReengagementStreamText(text.slice(0, length));
    assert.ok(prose.startsWith(visible), JSON.stringify(visible));
  }
  assert.equal(visibleReengagementStreamText(text), prose);
  for (const marker of [
    "__NO_SESSION_GREETING__",
    "`__NO_SESSION_GREETING__`",
    '"__NO_SESSION_GREETING__".',
  ]) {
    for (let length = 0; length <= marker.length; length++) {
      assert.equal(visibleReengagementStreamText(marker.slice(0, length)), "");
    }
  }
  const completion = `${prose}[[HARPER_ONBOARDING_DONE]]`;
  for (let length = prose.length; length <= completion.length; length++) {
    assert.equal(
      visibleReengagementStreamText(completion.slice(0, length)),
      prose
    );
  }
});

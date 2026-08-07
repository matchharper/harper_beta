import assert from "node:assert/strict";
import test from "node:test";
import { formatOrgAgentKstDateTime } from "@/lib/org/agent/dateTime";

test("KST midnight uses hour 00 instead of hour 24", () => {
  const formatted = formatOrgAgentKstDateTime("2026-08-06T15:37:00.000Z", {
    includeYear: true,
  });

  assert.equal(formatted, "2026. 8. 7. 00:37");
});

test("invalid timestamps stay absent", () => {
  assert.equal(formatOrgAgentKstDateTime("not-a-date"), null);
});

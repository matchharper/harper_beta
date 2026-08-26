import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessionRoute = readFileSync(
  new URL("./route.ts", import.meta.url),
  "utf8"
);
const reengagementRoute = readFileSync(
  new URL("./reengagement/route.ts", import.meta.url),
  "utf8"
);
const chatRoute = readFileSync(
  new URL("../chat/route.ts", import.meta.url),
  "utf8"
);
const chatTurn = readFileSync(
  new URL("../../../../lib/career/chatTurn.ts", import.meta.url),
  "utf8"
);
const debugPrompts = readFileSync(
  new URL("../../../../lib/career/debugPrompts.ts", import.meta.url),
  "utf8"
);

test("session start and re-engagement turns expose no career tools", () => {
  assert.match(sessionRoute, /allowedToolNames:\s*\[\]/);
  assert.match(reengagementRoute, /allowedToolNames:\s*\[\]/);
  assert.doesNotMatch(
    `${sessionRoute}\n${reengagementRoute}`,
    /TALENT_TOOL_NAMES\.RECOMMEND_JOB_POSTINGS/
  );
});

test("dedicated re-engagement overrides the model without changing legacy session start", () => {
  assert.match(reengagementRoute, /assistantModel:\s*GPT_56_LUNA_MODEL/);
  assert.doesNotMatch(sessionRoute, /GPT_56_LUNA_MODEL/);
});

test("dedicated re-engagement configures temperature 0.8", () => {
  assert.match(reengagementRoute, /REENGAGEMENT_TEMPERATURE\s*=\s*0\.8/);
  assert.match(
    reengagementRoute,
    /assistantTemperature:\s*REENGAGEMENT_TEMPERATURE/
  );
  assert.doesNotMatch(sessionRoute, /REENGAGEMENT_TEMPERATURE/);
});

test("dedicated re-engagement loads fresh pending actions into the turn instruction", () => {
  assert.match(reengagementRoute, /fetchCareerReengagementPendingActions\s*\(/);
  assert.match(reengagementRoute, /pendingActions:\s*pendingActionsForTurn/);
});

test("dedicated re-engagement makes one 50 percent decision and includes at most one action", () => {
  assert.match(
    reengagementRoute,
    /REENGAGEMENT_PENDING_ACTION_PROBABILITY\s*=\s*0\.5/
  );
  assert.equal((reengagementRoute.match(/Math\.random\(\)/g) ?? []).length, 1);
  assert.match(
    reengagementRoute,
    /pendingActionsSnapshot\.promptActions\.slice\(0, 1\)/
  );
});

test("dedicated re-engagement converts a call link into the rendered call-card marker", () => {
  assert.match(
    reengagementRoute,
    /replaceReengagementCallLinkWithCardMarker\s*\(/
  );
  assert.equal(
    (reengagementRoute.match(/transformAssistantTextBeforeInsert,/g) ?? [])
      .length,
    2
  );
});

test("normal career and re-engagement LLM context both keep at least 16 recent messages", () => {
  for (const source of [chatRoute, chatTurn, debugPrompts]) {
    assert.match(source, /recentLimit:\s*16/);
    assert.doesNotMatch(source, /recentLimit:\s*12/);
  }
});

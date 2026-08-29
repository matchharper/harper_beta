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
const reengagementPendingActions = readFileSync(
  new URL(
    "../../../../lib/career/reengagementPendingActions.server.ts",
    import.meta.url
  ),
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

test("session and dedicated re-engagement both require 12 idle hours", () => {
  for (const source of [sessionRoute, reengagementRoute]) {
    assert.match(
      source,
      /REENGAGEMENT_IDLE_MS\s*=\s*12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/
    );
  }
});

test("dedicated re-engagement loads fresh pending actions into the turn instruction", () => {
  assert.match(reengagementRoute, /fetchCareerReengagementPendingActions\s*\(/);
  assert.match(reengagementRoute, /pendingActions:\s*pendingActionsForTurn/);
});

test("dedicated re-engagement does not load talent calls", () => {
  assert.doesNotMatch(
    reengagementRoute,
    /REENGAGEMENT_TALENT_CALL_PROBABILITY/
  );
  assert.doesNotMatch(reengagementRoute, /Math\.random\(\)/);
  assert.match(
    reengagementRoute,
    /pendingActionsForTurn\s*=\s*pendingActionsSnapshot\.promptActions/
  );
  assert.doesNotMatch(reengagementRoute, /selectedCallAction/);
  assert.doesNotMatch(
    reengagementRoute,
    /replaceReengagementCallLinkWithCardMarker/
  );
  assert.doesNotMatch(
    reengagementPendingActions,
    /fetchPendingInternalOpportunityCallRequests|talent_call/
  );
});

test("dedicated re-engagement resolves prompt action keys to signed refs before insert", () => {
  assert.match(reengagementRoute, /resolveCareerReengagementActionKeys\s*\(/);
  assert.match(sessionRoute, /resolveCareerReengagementActionKeys\s*\(/);
  assert.match(reengagementRoute, /createCareerPendingActionRef\s*\(/);
  assert.equal(
    (reengagementRoute.match(/transformAssistantTextBeforeInsert,/g) ?? [])
      .length,
    2
  );
  assert.match(chatTurn, /stripCareerReengagementActions\s*\(/);
});

test("normal career and re-engagement LLM context both keep at least 16 recent messages", () => {
  for (const source of [chatRoute, chatTurn, debugPrompts]) {
    assert.match(source, /recentLimit:\s*16/);
    assert.doesNotMatch(source, /recentLimit:\s*12/);
  }
});

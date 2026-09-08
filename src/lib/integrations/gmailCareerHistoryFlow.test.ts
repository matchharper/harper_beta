import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const connectRouteSource = readSource(
  "../../app/api/talent/integrations/gmail/connect/route.ts"
);
const completeRouteSource = readSource(
  "../../app/api/talent/integrations/gmail/complete/route.ts"
);
const analyzeRouteSource = readSource(
  "../../app/api/talent/integrations/gmail/analyze/route.ts"
);
const settingsRowSource = readSource(
  "../../components/career/settings/CareerGmailSettingsRow.tsx"
);
const workspacePageSource = readSource(
  "../../components/career/CareerWorkspacePage.tsx"
);
const flowProviderSource = readSource(
  "../../components/career/CareerFlowProvider.tsx"
);

test("returns from Gmail OAuth to My Information and opens the import modal without starting an import", () => {
  assert.match(
    connectRouteSource,
    /searchParams\.set\("profileSection", "links"\)/
  );
  assert.match(completeRouteSource, /upsertTalentGmailIntegration/);
  assert.doesNotMatch(
    completeRouteSource,
    /scheduleGmailCareerHistoryAnalysis/
  );
  assert.match(
    workspacePageSource,
    /nextQuery\[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM\] = "success"/
  );
  assert.match(settingsRowSource, /open=\{gmailConnectionSucceeded\}/);
});

test("starts the import only from the explicit import action", () => {
  assert.match(analyzeRouteSource, /scheduleGmailCareerHistoryAnalysis/);
  assert.match(
    settingsRowSource,
    /const started = await handleGmailAnalyze\(\)/
  );
  assert.match(
    settingsRowSource,
    /onImport=\{\(\) => void handleGmailConnectionSuccessImport\(\)\}/
  );
});

test("does not offer another Gmail import after a completed analysis", () => {
  assert.match(settingsRowSource, /!gmailIntegration\.analysisUpdatedAt/);
  assert.doesNotMatch(settingsRowSource, /gmail_resync/);
  assert.doesNotMatch(settingsRowSource, /다시 읽어오기/);
});

test("refreshes the session after an observed Gmail import completes", () => {
  assert.match(
    flowProviderSource,
    /gmailAnalysisObservedRunningRef\.current = true/
  );
  assert.match(flowProviderSource, /loadSession\(\{ force: true \}\)/);
  assert.match(flowProviderSource, /hydrateSession\(payload\)/);
});

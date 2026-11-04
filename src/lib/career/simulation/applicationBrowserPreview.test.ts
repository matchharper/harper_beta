import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationSession } from "./session";
import { applicationBrowserPreviewSession } from "./applicationBrowserPreview";

test("preview follows inspection and submission, and disappears while waiting or after completion", () => {
  const state = createSimulationSession({
    roleName: "Fixture",
    roleRef: "job:fixture",
    documentId: null,
    documentName: null,
  });
  assert.equal(applicationBrowserPreviewSession(state), null);
  state.applicationInspection = {
    status: "running",
    runId: "inspection",
    browserUseSessionId: "inspector",
  };
  assert.equal(applicationBrowserPreviewSession(state), "inspector");
  state.applicationInspection.status = "completed";
  assert.equal(applicationBrowserPreviewSession(state), null);
  state.browser = {
    id: "application",
    engine: "browser-use-agents",
    status: "running",
    managed: { sessionId: "submitter" },
    startedAt: state.startedAt,
    updatedAt: state.startedAt,
    documentId: "resume",
    documentHash: "hash",
    url: "https://example.test",
    purpose: "apply",
  };
  assert.equal(applicationBrowserPreviewSession(state), "submitter");
  for (const status of [
    "waiting",
    "succeeded",
    "failed",
    "uncertain",
    "cancelled",
  ] as const) {
    state.browser.status = status;
    assert.equal(applicationBrowserPreviewSession(state), null);
  }
  state.browser.status = "running";
  state.status = "ended";
  assert.equal(applicationBrowserPreviewSession(state), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getLiveCallTimeoutAction,
  LIVE_IDLE_PROMPT_MS,
  LIVE_IDLE_RESPONSE_MS,
  LIVE_MAX_DURATION_MS,
} from "./liveCallTimeout";

const connectedAt = 1_000_000;

test("asks after five idle minutes and ends after three more without activity", () => {
  const base = {
    connectedAt,
    lastActivityAt: connectedAt,
    warningAt: null,
    busy: false,
  };
  assert.equal(
    getLiveCallTimeoutAction({
      ...base,
      now: connectedAt + LIVE_IDLE_PROMPT_MS - 1,
    }),
    "none"
  );
  assert.equal(
    getLiveCallTimeoutAction({
      ...base,
      now: connectedAt + LIVE_IDLE_PROMPT_MS,
    }),
    "warn"
  );
  assert.equal(
    getLiveCallTimeoutAction({
      ...base,
      now: connectedAt + LIVE_IDLE_PROMPT_MS + LIVE_IDLE_RESPONSE_MS - 1,
      warningAt: connectedAt + LIVE_IDLE_PROMPT_MS,
    }),
    "none"
  );
  assert.equal(
    getLiveCallTimeoutAction({
      ...base,
      now: connectedAt + LIVE_IDLE_PROMPT_MS + LIVE_IDLE_RESPONSE_MS,
      warningAt: connectedAt + LIVE_IDLE_PROMPT_MS,
    }),
    "end"
  );
});

test("speech or work resets idle time while the sixty-minute cap still wins", () => {
  assert.equal(
    getLiveCallTimeoutAction({
      connectedAt,
      lastActivityAt: connectedAt,
      warningAt: null,
      busy: true,
      now: connectedAt + LIVE_IDLE_PROMPT_MS,
    }),
    "active"
  );
  assert.equal(
    getLiveCallTimeoutAction({
      connectedAt,
      lastActivityAt: connectedAt + LIVE_IDLE_PROMPT_MS,
      warningAt: null,
      busy: false,
      now: connectedAt + LIVE_IDLE_PROMPT_MS + 1,
    }),
    "none"
  );
  assert.equal(
    getLiveCallTimeoutAction({
      connectedAt,
      lastActivityAt: connectedAt + LIVE_MAX_DURATION_MS - 1,
      warningAt: null,
      busy: true,
      now: connectedAt + LIVE_MAX_DURATION_MS,
    }),
    "end"
  );
});

test("ends an overdue idle call when the browser resumes after sleeping", () => {
  assert.equal(
    getLiveCallTimeoutAction({
      connectedAt,
      lastActivityAt: connectedAt,
      warningAt: null,
      busy: false,
      now: connectedAt + LIVE_IDLE_PROMPT_MS + LIVE_IDLE_RESPONSE_MS,
    }),
    "end"
  );
});

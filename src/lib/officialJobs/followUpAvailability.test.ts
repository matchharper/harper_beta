import assert from "node:assert/strict";
import test from "node:test";
import { isOfficialJobFollowUpRoleAvailable } from "./followUpAvailability";

const NOW_MS = Date.parse("2026-09-04T00:00:00.000Z");

test("official job follow-up allows active and paused roles", () => {
  for (const status of ["active", "paused"]) {
    assert.equal(
      isOfficialJobFollowUpRoleAvailable({
        expiresAt: null,
        isExpired: false,
        nowMs: NOW_MS,
        status,
      }),
      true
    );
  }
});

test("official job follow-up rejects roles outside the allowed statuses", () => {
  assert.equal(
    isOfficialJobFollowUpRoleAvailable({
      expiresAt: null,
      isExpired: false,
      nowMs: NOW_MS,
      status: "ended",
    }),
    false
  );
});

test("official job follow-up rejects roles marked expired", () => {
  assert.equal(
    isOfficialJobFollowUpRoleAvailable({
      expiresAt: null,
      isExpired: true,
      nowMs: NOW_MS,
      status: "active",
    }),
    false
  );
});

test("official job follow-up rejects roles whose expiry has passed", () => {
  assert.equal(
    isOfficialJobFollowUpRoleAvailable({
      expiresAt: "2026-09-03T23:59:59.999Z",
      isExpired: false,
      nowMs: NOW_MS,
      status: "active",
    }),
    false
  );
  assert.equal(
    isOfficialJobFollowUpRoleAvailable({
      expiresAt: "2026-09-04T00:00:00.001Z",
      isExpired: false,
      nowMs: NOW_MS,
      status: "active",
    }),
    true
  );
});

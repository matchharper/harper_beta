import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpsUtmAccessSessionToken,
  matchesOpsUtmAccessUuid,
  normalizeOpsUtmAccessUuid,
  OPS_UTM_ACCESS_MAX_AGE_SECONDS,
  verifyOpsUtmAccessSessionToken,
} from "@/lib/ops/utmAccessServer";

const ACCESS_UUID = "1f359d4e-45da-4daa-8754-f7e9468bcf22";

test("normalizes canonical UUID access credentials", () => {
  assert.equal(
    normalizeOpsUtmAccessUuid(`  ${ACCESS_UUID.toUpperCase()}  `),
    ACCESS_UUID
  );
  assert.equal(normalizeOpsUtmAccessUuid("not-a-uuid"), null);
  assert.equal(matchesOpsUtmAccessUuid(ACCESS_UUID, ACCESS_UUID), true);
  assert.equal(
    matchesOpsUtmAccessUuid(
      "7a3229bd-1ccd-4c5d-a9d1-920f2670f13c",
      ACCESS_UUID
    ),
    false
  );
});

test("signed UTM access sessions expire and reject tampering", () => {
  const now = Date.UTC(2026, 8, 9);
  const token = createOpsUtmAccessSessionToken({
    accessUuid: ACCESS_UUID,
    now,
  });

  assert.equal(
    verifyOpsUtmAccessSessionToken({
      accessUuid: ACCESS_UUID,
      now: now + (OPS_UTM_ACCESS_MAX_AGE_SECONDS - 1) * 1000,
      token,
    }),
    true
  );
  assert.equal(
    verifyOpsUtmAccessSessionToken({
      accessUuid: ACCESS_UUID,
      now: now + OPS_UTM_ACCESS_MAX_AGE_SECONDS * 1000,
      token,
    }),
    false
  );
  assert.equal(
    verifyOpsUtmAccessSessionToken({
      accessUuid: ACCESS_UUID,
      now,
      token: `${token.slice(0, -1)}x`,
    }),
    false
  );
});

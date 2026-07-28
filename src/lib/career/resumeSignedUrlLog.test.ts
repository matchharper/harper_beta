import assert from "node:assert/strict";
import test from "node:test";
import { getResumeSignedUrlLogMetadata } from "./resumeSignedUrlLog";

function createSignedUrl(claims: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `https://example.com/storage/object?token=${header}.${payload}.signature`;
}

test("logs signed URL timing without including the URL", () => {
  const metadata = getResumeSignedUrlLogMetadata({
    hasStoragePath: true,
    nowMs: 1_700_000_300_000,
    signedUrl: createSignedUrl({
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    }),
  });

  assert.deepEqual(metadata, {
    hasResumeStoragePath: true,
    resumeUrlExpiresAtEpochSeconds: 1_700_003_600,
    resumeUrlIssuedAtEpochSeconds: 1_700_000_000,
    resumeUrlRemainingSeconds: 3_300,
    resumeUrlState: "valid",
    resumeUrlTtlSeconds: 3_600,
  });
  assert.equal(JSON.stringify(metadata).includes("example.com"), false);
});

test("marks an expired signed URL", () => {
  assert.equal(
    getResumeSignedUrlLogMetadata({
      hasStoragePath: true,
      nowMs: 1_700_003_601_000,
      signedUrl: createSignedUrl({
        iat: 1_700_000_000,
        exp: 1_700_003_600,
      }),
    }).resumeUrlState,
    "expired"
  );
});

test("handles a URL without inspectable JWT claims", () => {
  assert.deepEqual(
    getResumeSignedUrlLogMetadata({
      hasStoragePath: false,
      nowMs: 1_700_000_000_000,
      signedUrl: "#",
    }),
    {
      hasResumeStoragePath: false,
      resumeUrlExpiresAtEpochSeconds: null,
      resumeUrlIssuedAtEpochSeconds: null,
      resumeUrlRemainingSeconds: null,
      resumeUrlState: "uninspectable",
      resumeUrlTtlSeconds: null,
    }
  );
});

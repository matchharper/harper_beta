import type { LogEventMetadata } from "@/lib/logEvent";

type ResumeSignedUrlClaims = {
  exp?: unknown;
  iat?: unknown;
};

function decodeBase64Url(value: string) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return atob(base64);
}

function readSignedUrlClaims(signedUrl: string): ResumeSignedUrlClaims | null {
  try {
    const token = new URL(signedUrl).searchParams.get("token");
    const payload = token?.split(".")[1];
    if (!payload) return null;

    const claims = JSON.parse(decodeBase64Url(payload));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
      return null;
    }

    return claims as ResumeSignedUrlClaims;
  } catch {
    return null;
  }
}

function readEpochSeconds(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function getResumeSignedUrlLogMetadata(args: {
  hasStoragePath: boolean;
  nowMs?: number;
  signedUrl: string;
}): LogEventMetadata {
  const claims = readSignedUrlClaims(args.signedUrl);
  const issuedAt = readEpochSeconds(claims?.iat);
  const expiresAt = readEpochSeconds(claims?.exp);
  const now = Math.floor((args.nowMs ?? Date.now()) / 1000);

  return {
    hasResumeStoragePath: args.hasStoragePath,
    resumeUrlExpiresAtEpochSeconds: expiresAt,
    resumeUrlIssuedAtEpochSeconds: issuedAt,
    resumeUrlRemainingSeconds: expiresAt === null ? null : expiresAt - now,
    resumeUrlState:
      expiresAt === null
        ? "uninspectable"
        : expiresAt <= now
          ? "expired"
          : "valid",
    resumeUrlTtlSeconds:
      issuedAt === null || expiresAt === null ? null : expiresAt - issuedAt,
  };
}

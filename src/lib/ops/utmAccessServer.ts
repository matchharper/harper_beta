import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const OPS_UTM_ACCESS_COOKIE_NAME = "harper_ops_utm_access";
export const OPS_UTM_ACCESS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_TOKEN_VERSION = "v1";

export function normalizeOpsUtmAccessUuid(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function getConfiguredOpsUtmAccessUuid() {
  return normalizeOpsUtmAccessUuid(process.env.OPS_UTM_ACCESS_UUID);
}

export function isOpsUtmUuidAccessEnabled() {
  return Boolean(getConfiguredOpsUtmAccessUuid());
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function matchesOpsUtmAccessUuid(
  providedValue: unknown,
  configuredValue = getConfiguredOpsUtmAccessUuid()
) {
  const provided = normalizeOpsUtmAccessUuid(providedValue);
  const configured = normalizeOpsUtmAccessUuid(configuredValue);
  return Boolean(provided && configured && safeEqual(provided, configured));
}

function signSessionExpiry(expiresAt: string, accessUuid: string) {
  return createHmac("sha256", accessUuid)
    .update(`ops-utm-access:${SESSION_TOKEN_VERSION}:${expiresAt}`)
    .digest("base64url");
}

export function createOpsUtmAccessSessionToken(args: {
  accessUuid: string;
  now?: number;
}) {
  const accessUuid = normalizeOpsUtmAccessUuid(args.accessUuid);
  if (!accessUuid) throw new Error("A valid OPS UTM access UUID is required");

  const expiresAt = String(
    Math.floor((args.now ?? Date.now()) / 1000) + OPS_UTM_ACCESS_MAX_AGE_SECONDS
  );
  const signature = signSessionExpiry(expiresAt, accessUuid);
  return `${SESSION_TOKEN_VERSION}.${expiresAt}.${signature}`;
}

export function verifyOpsUtmAccessSessionToken(args: {
  accessUuid: string | null;
  now?: number;
  token: string | null | undefined;
}) {
  const accessUuid = normalizeOpsUtmAccessUuid(args.accessUuid);
  const [version, expiresAt, signature, ...rest] = String(
    args.token ?? ""
  ).split(".");
  if (
    !accessUuid ||
    version !== SESSION_TOKEN_VERSION ||
    !/^\d+$/.test(expiresAt ?? "") ||
    !signature ||
    rest.length > 0
  ) {
    return false;
  }

  const expiresAtSeconds = Number(expiresAt);
  const nowSeconds = Math.floor((args.now ?? Date.now()) / 1000);
  if (
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= nowSeconds
  ) {
    return false;
  }

  return safeEqual(signature, signSessionExpiry(expiresAt, accessUuid));
}

export function hasOpsUtmUuidAccess(req: NextRequest) {
  return verifyOpsUtmAccessSessionToken({
    accessUuid: getConfiguredOpsUtmAccessUuid(),
    token: req.cookies.get(OPS_UTM_ACCESS_COOKIE_NAME)?.value,
  });
}

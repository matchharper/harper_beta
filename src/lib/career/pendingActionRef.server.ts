import { createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizeCareerOpenablePendingActionReference,
  type CareerOpenablePendingActionReference,
} from "@/lib/career/pendingActions";

const DEFAULT_PENDING_ACTION_REF_TTL_SECONDS = 30 * 24 * 60 * 60;

function pendingActionRefSecret() {
  const secret =
    process.env.CAREER_PENDING_ACTION_TOKEN_SECRET ||
    process.env.COMPANY_TALENT_REQUEST_TOKEN_SECRET ||
    process.env.EMAIL_REPLY_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Career pending action token secret is missing");
  return secret;
}

function encodePayload(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createCareerPendingActionRef(args: {
  reference: CareerOpenablePendingActionReference;
  talentId: string;
  ttlSeconds?: number;
}) {
  const reference = normalizeCareerOpenablePendingActionReference(
    args.reference
  );
  const talentId = args.talentId.trim();
  if (!reference || !talentId) {
    throw new Error("Career pending action reference is invalid");
  }

  const ttlSeconds = Number.isFinite(args.ttlSeconds)
    ? Number(args.ttlSeconds)
    : DEFAULT_PENDING_ACTION_REF_TTL_SECONDS;
  const payload = encodePayload({
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    id: reference.id,
    kind: reference.kind,
    talentId,
    version: 1,
  });
  const signature = createHmac("sha256", pendingActionRefSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyCareerPendingActionRef(value: unknown) {
  const token = String(value ?? "").trim();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = createHmac("sha256", pendingActionRefSecret())
    .update(payload)
    .digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const reference = normalizeCareerOpenablePendingActionReference(parsed);
    if (
      parsed.version !== 1 ||
      !reference ||
      typeof parsed.talentId !== "string" ||
      !parsed.talentId.trim() ||
      !Number.isFinite(parsed.exp) ||
      Number(parsed.exp) <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      exp: Number(parsed.exp),
      reference,
      talentId: parsed.talentId.trim(),
      version: 1 as const,
    };
  } catch {
    return null;
  }
}

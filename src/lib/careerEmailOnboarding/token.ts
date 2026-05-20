import crypto from "crypto";

type CareerEmailOnboardingPayload = {
  email: string;
  exp: number;
  iat: number;
  leadId: string;
  purpose?: "login" | "calendar";
};

const DEFAULT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function readSecret() {
  const secret =
    process.env.TALENT_NETWORK_INVITE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error(
      "TALENT_NETWORK_INVITE_SECRET or SUPABASE_SERVICE_ROLE_KEY is required"
    );
  }
  return secret;
}

function sign(payload: string) {
  return crypto
    .createHmac("sha256", readSecret())
    .update(payload)
    .digest("base64url");
}

export function buildCareerEmailOnboardingToken(args: {
  email: string;
  expiresInSeconds?: number;
  leadId: string;
  purpose?: "login" | "calendar";
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const ttl = Math.max(
    60,
    Math.min(
      args.expiresInSeconds ?? DEFAULT_TOKEN_TTL_SECONDS,
      DEFAULT_TOKEN_TTL_SECONDS
    )
  );
  const payload = Buffer.from(
    JSON.stringify({
      email: normalizeEmail(args.email),
      exp: issuedAt + ttl,
      iat: issuedAt,
      leadId: args.leadId,
      purpose: args.purpose ?? "login",
    } satisfies CareerEmailOnboardingPayload),
    "utf8"
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function parseCareerEmailOnboardingToken(
  token: string,
  expectedPurpose?: "login" | "calendar"
) {
  const normalized = token.trim();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= normalized.length - 1) {
    throw new Error("Invalid email onboarding token");
  }

  const payload = normalized.slice(0, dotIndex);
  const signature = normalized.slice(dotIndex + 1);
  const expected = sign(payload);

  try {
    if (
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new Error("Invalid email onboarding token");
    }
  } catch {
    throw new Error("Invalid email onboarding token");
  }

  let parsed: Partial<CareerEmailOnboardingPayload>;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid email onboarding token");
  }

  const email = normalizeEmail(String(parsed.email ?? ""));
  const exp = Number(parsed.exp);
  const iat = Number(parsed.iat);
  const leadId = String(parsed.leadId ?? "").trim();
  const purpose = parsed.purpose ?? "login";

  if (!email || !leadId || !Number.isFinite(exp) || !Number.isFinite(iat)) {
    throw new Error("Invalid email onboarding token");
  }
  if (Date.now() / 1000 > exp) {
    throw new Error("Expired email onboarding token");
  }
  if (expectedPurpose && purpose !== expectedPurpose) {
    throw new Error("Invalid email onboarding token purpose");
  }

  return {
    email,
    exp,
    iat,
    leadId,
    purpose,
  } satisfies CareerEmailOnboardingPayload;
}

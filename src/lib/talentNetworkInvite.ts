import crypto from "crypto";

type TalentNetworkInvitePayload = {
  email: string;
  waitlistId: number;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function readSecret() {
  const secret =
    process.env.TALENT_NETWORK_INVITE_SECRET?.trim() ??
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

export function buildTalentNetworkInviteToken(args: {
  email: string;
  waitlistId: number;
}) {
  const payload = Buffer.from(
    JSON.stringify({
      email: normalizeEmail(args.email),
      waitlistId: args.waitlistId,
    } satisfies TalentNetworkInvitePayload),
    "utf8"
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function parseTalentNetworkInviteToken(token: string) {
  const normalized = token.trim();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= normalized.length - 1) {
    throw new Error("Invalid invite token");
  }

  const payload = normalized.slice(0, dotIndex);
  const signature = normalized.slice(dotIndex + 1);
  const expected = sign(payload);

  try {
    if (
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new Error("Invalid invite token");
    }
  } catch {
    throw new Error("Invalid invite token");
  }

  let parsed: Partial<TalentNetworkInvitePayload>;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid invite token");
  }

  const email = normalizeEmail(String(parsed.email ?? ""));
  const waitlistId = Number(parsed.waitlistId ?? "");

  if (!email || !Number.isInteger(waitlistId) || waitlistId <= 0) {
    throw new Error("Invalid invite token");
  }

  return {
    email,
    waitlistId,
  } satisfies TalentNetworkInvitePayload;
}

export function buildTalentNetworkInviteUrl(args: {
  baseUrl: string;
  token: string;
}) {
  const url = new URL("/career_login", args.baseUrl.replace(/\/+$/, ""));
  url.searchParams.set("invite", args.token);
  return url.toString();
}

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

function readTokenSecret() {
  const secret =
    process.env.EMAIL_REPLY_TOKEN_SECRET?.trim() ||
    process.env.RESEND_WEBHOOK_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error(
      "EMAIL_REPLY_TOKEN_SECRET, RESEND_WEBHOOK_SECRET, or SUPABASE_SERVICE_ROLE_KEY is required"
    );
  }
  return secret;
}

export function createReplyToken() {
  return randomBytes(18).toString("base64url").toLowerCase();
}

export function hashReplyToken(token: string) {
  return createHmac("sha256", readTokenSecret())
    .update(String(token ?? "").trim())
    .digest("hex");
}

function decodeSvixSecret(secret: string) {
  const normalized = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(normalized, "base64");
}

function parseSignatureHeader(value: string | null) {
  return String(value ?? "")
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("v1,") ? part.slice(3) : part))
    .map((part) => (part.startsWith("v1=") ? part.slice(3) : part));
}

export function verifyResendWebhookSignature(args: {
  id: string | null;
  payload: string;
  secret?: string | null;
  signature: string | null;
  timestamp: string | null;
}) {
  const secret = String(
    args.secret ?? process.env.RESEND_WEBHOOK_SECRET ?? ""
  ).trim();
  if (!secret) {
    throw new Error("RESEND_WEBHOOK_SECRET is required");
  }

  const id = String(args.id ?? "").trim();
  const timestamp = String(args.timestamp ?? "").trim();
  if (!id || !timestamp || !args.signature) return false;

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > 300
  ) {
    return false;
  }

  const signedPayload = `${id}.${timestamp}.${args.payload}`;
  const expected = createHmac("sha256", decodeSvixSecret(secret))
    .update(signedPayload)
    .digest();
  const candidates = parseSignatureHeader(args.signature);

  return candidates.some((candidate) => {
    try {
      const actual = Buffer.from(candidate, "base64");
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    } catch {
      return false;
    }
  });
}

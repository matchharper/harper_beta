import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const MINIMUM_SECRET_LENGTH = 32;

function getEncryptionKey() {
  const secret = process.env.REFERRAL_PAYOUT_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      "REFERRAL_PAYOUT_ENCRYPTION_KEY must be configured with at least 32 characters"
    );
  }
  return createHash("sha256").update(secret).digest();
}

function getAdditionalAuthenticatedData(recordId: string, field: string) {
  return Buffer.from(`referral-payout:${recordId}:${field}`, "utf8");
}

export function createReferralPayoutAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function hashReferralPayoutAccessToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function encryptReferralPayoutValue(args: {
  field: string;
  recordId: string;
  value: string;
}) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  cipher.setAAD(getAdditionalAuthenticatedData(args.recordId, args.field));
  const ciphertext = Buffer.concat([
    cipher.update(args.value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptReferralPayoutValue(args: {
  ciphertext: string;
  field: string;
  recordId: string;
}) {
  const [version, ivValue, authTagValue, ciphertextValue] =
    args.ciphertext.split(":");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !authTagValue ||
    !ciphertextValue
  ) {
    throw new Error("Unsupported referral payout ciphertext");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAAD(getAdditionalAuthenticatedData(args.recordId, args.field));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

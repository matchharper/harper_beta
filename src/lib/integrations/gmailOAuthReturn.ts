import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const gmailReturnPath = "/api/talent/integrations/gmail/complete";
export const gmailReturnTtl = 10 * 60;

type ConnectionIntent = {
  userId: string;
  accountId: string;
  previousConnection: string;
  conversationId?: string;
  capability: "read" | "write";
};

export function gmailCareerReturnUrl(requested: unknown, origin: string) {
  const fallback = new URL("/career", origin);
  if (typeof requested !== "string") return fallback;
  try {
    const url = new URL(requested, origin);
    return url.origin === origin &&
      (url.pathname === "/career" || url.pathname.startsWith("/career/"))
      ? url
      : fallback;
  } catch {
    return fallback;
  }
}

export function gmailReturnCookieName(accountId: string) {
  return (
    "harper_gmail_" + createHash("sha256").update(accountId).digest("base64url")
  );
}

function signature(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Service credentials unavailable");
  return createHmac("sha256", key)
    .update("harper.career.gmail.return:" + payload)
    .digest();
}

export function encodeGmailReturn(intent: ConnectionIntent) {
  const payload = Buffer.from(
    JSON.stringify({ ...intent, expiresAt: Date.now() + gmailReturnTtl * 1000 })
  ).toString("base64url");
  return payload + "." + signature(payload).toString("base64url");
}

export function readGmailReturn(
  cookie: string | undefined,
  accountId: string
): ConnectionIntent | null {
  if (!cookie) return null;
  const [payload, mac, extra] = cookie.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const actual = Buffer.from(mac, "base64url"),
    expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  const intent = JSON.parse(
    Buffer.from(payload, "base64url").toString()
  ) as ConnectionIntent & { expiresAt: number };
  return intent.accountId === accountId && intent.expiresAt > Date.now()
    ? intent
    : null;
}

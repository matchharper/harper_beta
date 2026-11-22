import "server-only";

import { gmailServiceAccountConfigured, workspaceUserAuthorization } from "@/lib/contentsEngine/gmail";
import {
  isScopeNotAllowed, parseSpamRates, POSTMASTER_API, POSTMASTER_SCOPE, SCOPE_NOT_ALLOWED, setupStepMissing, spamRateQuery,
  type GmailSpam,
} from "./postmaster";

/**
 * Reads Gmail's spam rate for the sender's domain from Postmaster Tools (agent/postmaster.ts), as the Workspace user
 * who registered the domain there: the sender mailbox (Ashley) unless GTM_POSTMASTER_USER names another, through the
 * service account's domain-wide delegation. Never throws: a missing step or a failed read comes back as such, and
 * /ops shows it. Google updates the numbers once a day, so a read is kept an hour (a failure 10 minutes).
 */

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown error"));
const TIMEOUT_MS = 5_000;
const KEEP_MS = 60 * 60_000;
const KEEP_FAILED_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: GmailSpam }>();

export async function readGmailSpam(senderEmail: string | null, now = new Date()): Promise<GmailSpam | null> {
  const user = (process.env.GTM_POSTMASTER_USER?.trim() || senderEmail?.trim() || "").toLowerCase();
  const domain = ((senderEmail?.trim() || user).toLowerCase().split("@")[1] ?? "").trim();
  if (!domain) return null;
  const key = `${user}|${domain}`;
  const kept = cache.get(key);
  if (kept && now.getTime() - kept.at < (kept.value.status === "ok" ? KEEP_MS : KEEP_FAILED_MS)) return kept.value;
  const value = await query(user, domain, now);
  cache.set(key, { at: now.getTime(), value });
  return value;
}

async function query(user: string, domain: string, now: Date): Promise<GmailSpam> {
  if (!gmailServiceAccountConfigured()) return { status: "setup", domain, reason: "이 서버에 Google 서비스 계정이 없어요" };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let authorization: string;
  try {
    authorization = await Promise.race([
      workspaceUserAuthorization(user, [POSTMASTER_SCOPE]),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Google 로그인 시간 초과")))),
    ]);
  } catch (error) {
    if (isScopeNotAllowed(error)) return { status: "setup", domain, reason: SCOPE_NOT_ALLOWED };
    return { status: "error", domain, reason: errorText(error).slice(0, 300) };
  }
  try {
    const response = await fetch(`${POSTMASTER_API}/domains/${encodeURIComponent(domain)}/domainStats:query`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(spamRateQuery(now)),
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const step = setupStepMissing(response.status, body);
      if (step) return { status: "setup", domain, reason: step };
      return { status: "error", domain, reason: `Postmaster ${response.status}: ${JSON.stringify(body).slice(0, 300)}` };
    }
    return { status: "ok", domain, days: parseSpamRates(body) };
  } catch (error) {
    console.warn("[gtm-agent] postmaster read failed", errorText(error).slice(0, 300));
    return { status: "error", domain, reason: errorText(error).slice(0, 300) };
  }
}

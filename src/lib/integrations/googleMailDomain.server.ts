import { resolveMx } from "node:dns/promises";

const GOOGLE_MAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
// Google Workspace mail is received by Google's MX hosts (aspmx.l.google.com, smtp.google.com).
const GOOGLE_MX_HOST = /(^|\.)(google|googlemail)\.com\.?$/i;
const LOOKUP_TIMEOUT_MS = 1500;
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { value: boolean; at: number }>();

/** Whether this address's mailbox is on Google, so connecting Gmail can read its mail. */
export async function isGoogleMailAddress(
  email: string | null | undefined,
  lookup: (domain: string) => Promise<Array<{ exchange: string }>> = resolveMx,
  now = Date.now()
) {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  if (GOOGLE_MAIL_DOMAINS.has(domain)) return true;
  const cached = cache.get(domain);
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const value = await Promise.race([
    lookup(domain).then(records => records.some(record => GOOGLE_MX_HOST.test(record.exchange))),
    new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS); }),
  ]).catch((error: { code?: string }) =>
    // A domain without mail records is a definite "no"; other failures are retried later.
    error?.code === "ENOTFOUND" || error?.code === "ENODATA" ? false : null
  ).finally(() => clearTimeout(timer));
  if (value === null) return false;
  cache.set(domain, { value, at: now });
  return value;
}

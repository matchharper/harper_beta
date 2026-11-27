import { Resolver } from "node:dns/promises";
import { normalizeEmailAddress } from "@/lib/email/parse";
import { opensReplyCompose } from "@/lib/email/choiceLinks";

/**
 * A school or company address whose mail Google hosts (Google Workspace) is read in the same Gmail web and app that
 * open a prefilled reply for gmail.com, so its answer options reply to the email too (Shaun 11/27: of the 8 people
 * whose options opened the web, 6 had such an address). Only when every MX host is Google's: a gateway in front
 * (Proofpoint, say) hides which mailbox is behind it. A lookup that fails or is slow keeps the web link.
 */
const GOOGLE_MX_HOST = /(^|\.)(google\.com|googlemail\.com)\.?$/i;
const LOOKUP_TIMEOUT_MS = 1500;
const CACHE_MS = 6 * 60 * 60 * 1000;
const FAILED_CACHE_MS = 10 * 60 * 1000;

type MxLookup = (domain: string) => Promise<string[]>;

const cache = new Map<string, { google: boolean; until: number }>();

const resolveMxHosts: MxLookup = async (domain) => {
  const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 1 });
  return (await resolver.resolveMx(domain)).map((record) => record.exchange);
};

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("mx_lookup_timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export async function opensReplyComposeFor(
  recipient: string | null | undefined,
  args: { lookup?: MxLookup; nowMs?: number } = {}
) {
  if (opensReplyCompose(recipient)) return true;
  const domain = normalizeEmailAddress(String(recipient ?? ""))?.split("@")[1];
  if (!domain) return false;
  const nowMs = args.nowMs ?? Date.now();
  const cached = cache.get(domain);
  if (cached && cached.until > nowMs) return cached.google;
  let google = false;
  let failed = false;
  try {
    const hosts = await withTimeout((args.lookup ?? resolveMxHosts)(domain), LOOKUP_TIMEOUT_MS);
    google = hosts.length > 0 && hosts.every((host) => GOOGLE_MX_HOST.test(String(host ?? "").trim()));
  } catch {
    failed = true;
  }
  cache.set(domain, { google, until: nowMs + (failed ? FAILED_CACHE_MS : CACHE_MS) });
  return google;
}

export function clearReplyComposeMxCacheForTest() {
  cache.clear();
}

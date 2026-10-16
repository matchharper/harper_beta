import { normalizeEmailAddress } from "./parse";

/** Namespace identifies the audience; possession alone never authorizes company actions. */
export function companyReplyAddresses(addresses: readonly string[]) {
  const domain = (process.env.EMAIL_REPLY_DOMAIN?.trim() || "reply.matchharper.com").toLowerCase();
  return [...new Set(addresses.map(normalizeEmailAddress).filter((address): address is string =>
    Boolean(address && address.split("@")[1] === domain && address.startsWith("company+"))))];
}

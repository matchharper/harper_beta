/**
 * #5: which address the agent may mail and from which sender. Pure, so the run, the Ops screen and the tests agree.
 */
import { isHarperMailAddress, isPersonalMailAddress, mailDomain } from "../personalMail";
import type { AgentSettings } from "./types";

/**
 * Whether the agent may mail this address.
 * - A free personal mailbox (gmail.com, naver.com, …): yes.
 * - Harper's own (matchharper.com): yes, the team's tests.
 * - Anything else is a company or an own-name domain. A work address belongs to the employer (team decision
 *   11/16, as #4), so only an address the person published themselves in their post (source 'post') counts as
 *   their own, and only when settings allow own-name domains. An address from an application or a lookup on
 *   another domain is treated as a work address.
 */
export function agentMailableAddress(
  email: string | null | undefined,
  source: "import" | "post" | "lookup" | null,
  settings: Pick<AgentSettings, "ownDomainAllowed">,
): boolean {
  if (!email) return false;
  if (isPersonalMailAddress(email) || isHarperMailAddress(email)) return true;
  return settings.ownDomainAllowed && source === "post" && Boolean(mailDomain(email));
}

/**
 * Why the agent cannot send mail at all right now (shown on /ops #5), or null. The sender is chris@matchharper.com
 * by default, as #1 and #4 (Shaun 11/17), and can be changed on /ops #5 to an address on another domain once that
 * domain is set up for sending.
 */
export function agentSenderProblem(settings: Pick<AgentSettings, "senderEmail" | "senderName">): string | null {
  const email = settings.senderEmail?.trim().toLowerCase() ?? "";
  if (!email) return "보내는 주소가 없어요";
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(email)) return "보내는 주소를 확인해 주세요";
  if (!settings.senderName?.trim()) return "보내는 사람 이름이 없어요";
  return null;
}

/** The human channel a profile URL belongs to (LinkedIn / X / Threads), or null. */
export function channelOfProfile(url: string | null | undefined): "linkedin" | "x" | "threads" | null {
  const host = String(url ?? "").trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0]
    .replace(/^www\./, "");
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "threads.net" || host === "threads.com") return "threads";
  return null;
}

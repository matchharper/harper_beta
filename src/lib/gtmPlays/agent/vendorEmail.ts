/**
 * 수정 4 (Shaun 11/26: "스위치 두 개를 처음부터 다 켜면 돼요"): treg (treg.to), one key in front of many people-data
 * vendors, for a person whose paid lookup (emailLookup.ts) gave no address the agent may mail: one call, right before
 * they would be excluded for it (run.server.ts handleMatched). Nothing changes for anyone else.
 *
 * - Asked by their LinkedIn profile address only: their personal mailbox first (treg.people.email.find.personal: treg
 *   asks its vendors cheapest first and moves on after a miss; a miss can be billed too, so X-Treg-Route-Max-Cost bounds
 *   the whole call), then, only with 회사 주소 쓰기 on, a current company known and not for someone the layoff search
 *   found, their work address (treg.people.email.find).
 * - treg checks the mailbox of each address it gives in the same call (X-Treg-Route-Verify). An address is used only
 *   when that check says it takes mail, its name part holds a piece of their name of 4 letters or more
 *   (mailRules.ts addressHoldsNamePiece: a vendor's address has no page to check it on) and the address rule allows it
 *   (mailRules.ts agentMailableAddress, source 'vendor': a work address only on their current company's domain, never a
 *   team's address).
 * - Never for the applicant file, the purchased DB or a job-page request (only the addresses they came with). No daily
 *   max (Shaun 11/26, after the past-data test found 9 of 9 at $0.08 each): the day's cost cap bounds it.
 * Pure, so the run and the tests agree; the call itself is vendorEmail.server.ts.
 */
import { applicantListCompany } from "./applicantList";
import { personNames } from "./emailLookup";
import { addressHoldsNamePiece, agentMailableAddress, profileHandles, workAddressRule } from "./mailRules";
import { cleanEmail } from "./people";
import type { AgentPerson, AgentVendorLookup, AgentVendorReason } from "./types";

/** treg's routed tools (one call asks its vendors in turn, cheapest first). */
export const VENDOR_TOOLS = { personal: "treg.people.email.find.personal", work: "treg.people.email.find" } as const;
export type VendorAsk = keyof typeof VENDOR_TOOLS;

/**
 * The most one ask may cost (X-Treg-Route-Max-Cost: treg leaves out a vendor whose price would pass it; the mailbox
 * check counts too). Personal (treg catalog 11/26): Fiber $0.04, Aviato $0.08, LimaData $0.10, ContactOut $0.25, not
 * Sixtyfour ($0.60 and about a minute a call). Work: the vendors that take a LinkedIn profile ask $0.001-$0.02.
 */
export const VENDOR_MAX_USD: Record<VendorAsk, number> = { personal: 0.3, work: 0.05 };

/** treg's mailbox check words for "this mailbox takes mail"; anything else (invalid, accept_all, unknown …) is not used. */
const TAKES_MAIL = new Set(["valid", "deliverable", "ok"]);

/** A LinkedIn profile on any of its hosts (www., kr., m. …). */
const LINKEDIN_PROFILE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*linkedin\.com\/in\/([^/?#\s]+)/i;

/** Their LinkedIn profile as treg takes it (https://www.linkedin.com/in/<handle>), or null when they have none. */
export function vendorProfileUrl(person: Pick<AgentPerson, "profileUrl" | "contactUrl">): string | null {
  for (const url of [person.profileUrl, person.contactUrl]) {
    const match = LINKEDIN_PROFILE.exec(String(url ?? "").trim());
    if (match) return `https://www.linkedin.com/in/${match[1]}`;
  }
  return null;
}

/**
 * Why treg is not asked about this person (null: ask): treg 쓰기 is off; they came with the addresses to use (the
 * applicant file, a company's applicant list, the purchased DB, a job-page request); treg was asked already; no
 * LinkedIn profile to ask by.
 */
export function vendorSkip(
  person: Pick<AgentPerson, "method" | "source" | "profileUrl" | "contactUrl" | "emailLookup">,
  vendorLookup: boolean,
): "off" | "own_addresses_only" | "asked" | "no_profile" | null {
  if (!vendorLookup) return "off";
  if (person.method === "applicant" || person.method === "db" || person.method === "request" || applicantListCompany(person.source)) {
    return "own_addresses_only";
  }
  if (person.emailLookup?.vendor) return "asked";
  return vendorProfileUrl(person) ? null : "no_profile";
}

/**
 * What to ask for, in order: the personal mailbox, then the work address when it could be used (see the top). A company
 * name without a Latin letter or digit (쿠팡) can never be tied to a domain (mailRules.ts domainIsCompany), so its work
 * address would be paid for and thrown away: not asked.
 */
export function vendorAsks(person: Pick<AgentPerson, "method" | "currentCompany">, workAddresses: boolean): VendorAsk[] {
  const work = workAddresses && person.method !== "layoff_company" && /[a-z0-9]/i.test(person.currentCompany ?? "");
  return work ? ["personal", "work"] : ["personal"];
}

/** One answer from treg, as the run reads it. */
export type VendorAnswer = {
  email: string | null;
  /** treg's mailbox check of that address, lower case; null when it made none (or it is still running). */
  verdict: string | null;
  servedBy: string | null;
  /**
   * What treg charged (its X-Treg-Cost-Micro). A replay (the same Idempotency-Key: an earlier try's answer, handed back
   * at no cost) counts that try's charge (X-Treg-Original-Cost-Micro), which the run has not logged yet (it logs only once
   * the person is written: run.server.ts tryVendorLookup). A vendor still working (202) counts at what it holds.
   */
  costUsd: number;
};

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

const micro = (value: string | null | undefined) => (value == null || value.trim() === "" ? Number.NaN : Number(value));

/**
 * treg's answer ({ output, raw, _treg }, status 200) as the run reads it. Any other status gives no address: 202 is a
 * vendor still working (treg's guide: do not ask again, it may still charge), the rest the run handles before this
 * (vendorEmail.server.ts).
 */
export function readVendorAnswer(
  status: number,
  body: unknown,
  headers: { costMicro?: string | null; originalCostMicro?: string | null; replayed?: boolean; servedBy?: string | null } = {},
): VendorAnswer {
  const record = asRecord(body);
  const meta = asRecord(record._treg);
  const check = asRecord(meta.verification);
  const answered = status === 200;
  const output = asRecord(record.output);
  const email = answered ? cleanEmail(typeof output.email === "string" ? output.email : null) : null;
  const verdict = email && check.pending !== true && typeof check.verdict === "string" ? check.verdict.trim().toLowerCase() || null : null;
  const header = micro(headers.replayed ? headers.originalCostMicro : headers.costMicro);
  const body_ = Number(meta.charged_micro ?? 0) + Number(check.cost_micro ?? 0);
  let charged = Number.isFinite(header) ? header : Number.isFinite(body_) ? body_ : 0;
  if (status === 202) charged = Math.max(charged, Number(meta.reserved_micro ?? 0) || 0);
  const servedBy = headers.servedBy?.trim() || (typeof meta.served_by === "string" ? meta.served_by.trim() : "") || null;
  return { email, verdict, servedBy, costUsd: Math.max(0, charged) / 1_000_000 };
}

/** Why an address treg gave is not used (null: use it). */
export function vendorAddressProblem(
  answer: Pick<VendorAnswer, "email" | "verdict">,
  person: Pick<AgentPerson, "name" | "profileUrl" | "contactUrl" | "currentCompany" | "method">,
  workAddresses: boolean,
): AgentVendorReason | null {
  if (!answer.email) return "not_found";
  if (!answer.verdict || !TAKES_MAIL.has(answer.verdict)) return "not_verified";
  if (!addressHoldsNamePiece(answer.email, personNames(person))) return "no_name";
  const handles = profileHandles([person.profileUrl, person.contactUrl]);
  return agentMailableAddress(answer.email, "vendor", [], handles, workAddressRule(person, workAddresses)) ? null : "not_mailable";
}

/** Plain Korean for the timeline and /ops #5. */
export const VENDOR_REASON_LABEL: Record<AgentVendorReason, string> = {
  not_found: "treg도 주소를 못 찾았어요",
  not_verified: "treg가 준 주소가 메일함 확인을 통과하지 못했어요",
  no_name: "treg가 준 주소에 이름이 없어 본인 것인지 몰라요",
  not_mailable: "treg가 준 주소가 보낼 수 없는 주소예요 (지금 회사가 아닌 회사 주소, 공용 주소)",
  failed: "treg가 답하지 않았어요",
};

/** One ask as the person keeps it. */
export type VendorAskResult = AgentVendorLookup["asks"][number];

const ASK_LABEL: Record<VendorAsk, string> = { personal: "개인 메일", work: "지금 회사 메일" };

/**
 * The person's treg record and its timeline line, from the asks made (in order; the used one, if any, is last): "treg로
 * 개인 메일을 찾았어요 · fiber · $0.040", or each ask's reason ("개인 메일: treg도 주소를 못 찾았어요 / 지금 회사 메일: …").
 */
export function settleVendorLookup(at: Date, asks: readonly VendorAskResult[]): { record: AgentVendorLookup; note: string } {
  const used = asks.find((ask) => ask.reason === null) ?? null;
  const costUsd = Math.round(asks.reduce((sum, ask) => sum + ask.costUsd, 0) * 1_000_000) / 1_000_000;
  const record: AgentVendorLookup = { at: at.toISOString(), asks: [...asks], used: Boolean(used), kind: used?.ask ?? null, costUsd };
  const cost = costUsd > 0 ? ` · $${costUsd.toFixed(3)}` : "";
  if (used) return { record, note: `treg로 ${ASK_LABEL[used.ask]}을 찾았어요${used.servedBy ? ` · ${used.servedBy}` : ""}${cost}` };
  const why = (ask: VendorAskResult) => {
    const detail = ask.httpStatus ? ` (${ask.httpStatus})` : ask.verdict ? ` (확인 결과 ${ask.verdict})` : "";
    return `${VENDOR_REASON_LABEL[ask.reason ?? "not_found"]}${detail}`;
  };
  const lines = asks.length > 1 ? asks.map((ask) => `${ASK_LABEL[ask.ask]}: ${why(ask)}`) : asks.map(why);
  return { record, note: `${lines.join(" / ") || VENDOR_REASON_LABEL.not_found}${cost}` };
}

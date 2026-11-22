/**
 * #5 수치 · 회사 (Shaun 11/22): what the period's candidates led to on the company side, one row per company under a 합계
 * row, in two tables:
 *   하퍼 밖 회사  outside postings' companies (not on Harper): Ashley's company mails (agent/companyMail.ts) and what
 *                came of them (the company's reply, its words passed on, its sign-up, its connection request);
 *   하퍼 고객사    customers already on Harper: everything happens inside Harper (the candidate's saved / applied posting,
 *                the connection request and messages between the candidate's Harper and the company, the connection).
 * Basis (Shaun 11/22): only what came from the people 수치 · 후보 counts (found in the period, test people never), so
 * every number here is part of the candidate numbers and opens those people (gtm_agent_people ids) in the log.
 *
 * A cell is a number and the people behind it. Its unit is people (n = ids.length), mails (a company mail counts once,
 * its people are the candidates it was about) or messages. A person interested in two companies is in both rows and
 * once in 합계; a mail or a message belongs to one company, so 합계 is the sum of the rows. Pure: rows in, tallies out.
 */
import { interestByPosting, postingKey } from "./companyMail";
import type { InterestSignal } from "./conversation";
import { companyKey } from "./match";
import type { AgentPostingKind } from "./types";

export type CompanyCell = { n: number; ids: string[] };

export const OUTSIDE_COLUMNS = [
  "interested", "agreed", "mails", "clicked", "replied", "relayed", "signedUp", "introRequested", "bounced", "complained", "unsubscribed",
] as const;
export type OutsideColumn = (typeof OUTSIDE_COLUMNS)[number];

export const CUSTOMER_COLUMNS = ["received", "interested", "requested", "toCompany", "toTalent", "answered", "connected"] as const;
export type CustomerColumn = (typeof CUSTOMER_COLUMNS)[number];

/** What a cell's number counts: people (the number is its ids), or mails / messages (the ids are the people behind them). */
export type CompanyCellUnit = "people" | "mails" | "messages";

export const OUTSIDE_UNIT: Record<OutsideColumn, CompanyCellUnit> = {
  interested: "people", agreed: "people", mails: "mails", clicked: "mails", replied: "mails", relayed: "people",
  signedUp: "mails", introRequested: "people", bounced: "mails", complained: "mails", unsubscribed: "mails",
};
export const CUSTOMER_UNIT: Record<CustomerColumn, CompanyCellUnit> = {
  received: "people", interested: "people", requested: "people", toCompany: "messages", toTalent: "messages",
  answered: "people", connected: "people",
};

export type CompanyRow<C extends string> = {
  /** A customer's workspace (ws:<id>) or the company's name as one key (name:<companyKey>). */
  key: string;
  /** As the screen shows it elsewhere (the posting's company in the candidates' mails). */
  name: string;
  /** A customer's name on Harper when it differs from the shown one (an anonymous posting); else null. */
  registeredName: string | null;
  cells: Record<C, CompanyCell>;
};
export type CompanyTable<C extends string> = { total: Record<C, CompanyCell>; companies: Array<CompanyRow<C>> };
export type CompanyNumbers = { outside: CompanyTable<OutsideColumn>; customers: CompanyTable<CustomerColumn> };

/** A posting a candidate's first mail carried; a customer's comes with its Role's workspace (company_roles). */
export type CompanyPostingRef = {
  kind: AgentPostingKind;
  roleId: string | null;
  url: string | null;
  companyName: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
};

export type CompanyNumbersInput = {
  /** The period's mailed candidates (as 수치 · 후보 counts them; test people never), with their mail's postings. */
  people: ReadonlyArray<{ personId: string; postings: readonly CompanyPostingRef[] }>;
  /** Interest signals Ashley read from their mails (gtm_agent_messages.signals; agent/conversationRules.ts flattenSignals). */
  signals: readonly InterestSignal[];
  /** Company mails that went out, each with the candidates it was about (company_mail.newPersonIds and the mail's own). */
  companyMails: ReadonlyArray<{
    id: string; companyName: string; personIds: readonly string[];
    /** The Harper page its button opens was on screen; the company answered it; the company signed up from it. */
    clicked: boolean; replied: boolean; signedUp: boolean;
    /** bounced / failed / complained (gtm_mails.delivery_status), and the opt-out (link or reply). */
    deliveryStatus: string | null; unsubscribed: boolean;
  }>;
  /** A company's words passed on to a candidate (gtm_agent_relays, the relay mail sent), with the company mail's company. */
  relays: ReadonlyArray<{ personId: string; companyName: string }>;
  /** A company that signed up from its mail asked to connect with the candidate (external_intro_requests). */
  introRequests: ReadonlyArray<{ personId: string; companyName: string }>;
  /** Per candidate and customer Role: what their Harper account did with it (talentId: the account their mail claimed). */
  harper: ReadonlyArray<{
    personId: string; talentId: string; roleId: string;
    interested: boolean; requested: boolean; answered: boolean; connected: boolean;
    /** Messages inside Harper that are not cancelled: the candidate's side to the company, the company to the candidate. */
    toCompany: number; toTalent: number;
  }>;
};

/** One cell being counted: units seen (a person, a mail, a talent's Role) and the people behind them. */
type Tally = { n: number; units: Set<string>; ids: Set<string> };
const tally = (): Tally => ({ n: 0, units: new Set(), ids: new Set() });

/** Counts a unit once (`weight` its number: 1, or a message count) and its people every time. */
function add(cell: Tally, unit: string, people: readonly string[], weight = 1) {
  if (!cell.units.has(unit)) {
    cell.units.add(unit);
    cell.n += weight;
  }
  for (const id of people) cell.ids.add(id);
}

const done = (cell: Tally): CompanyCell => ({ n: cell.n, ids: [...cell.ids].sort() });

type Building<C extends string> = { key: string; name: string; registeredName: string | null; cells: Record<C, Tally> };

/** A table being built: 합계 and the rows, each cell counted into its row and into 합계 alike. */
function table<C extends string>(columns: readonly C[]) {
  const blank = () => Object.fromEntries(columns.map((column) => [column, tally()])) as Record<C, Tally>;
  const total = blank();
  const rows = new Map<string, Building<C>>();
  return {
    count(company: { key: string; name: string; registeredName?: string | null }, column: C, unit: string, people: readonly string[], weight = 1) {
      let row = rows.get(company.key);
      if (!row) {
        row = { key: company.key, name: "", registeredName: company.registeredName ?? null, cells: blank() };
        rows.set(company.key, row);
      }
      // The first name seen: a posting's (the candidates' mails show it), before a company mail's.
      row.name ||= company.name.trim();
      add(row.cells[column], unit, people, weight);
      add(total[column], unit, people, weight);
    },
    /** Rows by their first column, most first, then by name. */
    finish(): CompanyTable<C> {
      const companies = [...rows.values()].map((row): CompanyRow<C> => {
        const name = row.name;
        const registeredName = row.registeredName?.trim() && row.registeredName.trim() !== name ? row.registeredName.trim() : null;
        return {
          key: row.key, name, registeredName,
          cells: Object.fromEntries(columns.map((column) => [column, done(row.cells[column])])) as Record<C, CompanyCell>,
        };
      });
      const first = columns[0];
      companies.sort((a, b) => b.cells[first].n - a.cells[first].n || a.name.localeCompare(b.name));
      return { total: Object.fromEntries(columns.map((column) => [column, done(total[column])])) as Record<C, CompanyCell>, companies };
    },
  };
}

/** An outside company as one key: its name (agent/match.ts companyKey, as the one-mail-a-day rule compares companies). */
const outsideCompany = (name: string) => ({ key: `name:${companyKey(name)}`, name });

/** A customer as one key: its workspace (the company on Harper), else its name. */
const customerCompany = (posting: CompanyPostingRef) => ({
  key: posting.workspaceId ? `ws:${posting.workspaceId}` : `name:${companyKey(posting.companyName)}`,
  name: posting.companyName,
  registeredName: posting.workspaceName ?? null,
});

export function tallyCompanyNumbers(input: CompanyNumbersInput): CompanyNumbers {
  const people = new Set(input.people.map((person) => person.personId));
  const ours = (ids: readonly string[]) => [...new Set(ids.filter((id) => people.has(id)))];

  // ---- 하퍼 밖 회사
  const outside = table(OUTSIDE_COLUMNS);
  // A signal names one of the postings the person was sent (ashleyAgent.ts sentPostings): its kind says whether the
  // company is outside (a customer's or a Harper posting never gets a company mail).
  const postingsOf = new Map(input.people.map((person) => [
    person.personId, new Map(person.postings.filter((posting) => posting.url).map((posting) => [postingKey(posting.url), posting])),
  ]));
  const outsideSignals = input.signals.filter((signal) => people.has(signal.personId)
    && postingsOf.get(signal.personId)?.get(postingKey(signal.postingUrl))?.kind === "external");
  // Per posting, each person's latest signal (the company mail's own reading: its consent is the latest).
  for (const group of interestByPosting(outsideSignals, "").values()) {
    for (const signal of group) {
      const posting = postingsOf.get(signal.personId)?.get(postingKey(signal.postingUrl));
      const company = outsideCompany(posting?.companyName || signal.companyName);
      outside.count(company, "interested", signal.personId, [signal.personId]);
      if (signal.summaryConsent) outside.count(company, "agreed", signal.personId, [signal.personId]);
    }
  }
  const seenMails = new Set<string>();
  for (const mail of input.companyMails) {
    const about = ours(mail.personIds);
    // A mail about none of the period's candidates is not this panel's.
    if (!about.length || seenMails.has(mail.id)) continue;
    seenMails.add(mail.id);
    const company = outsideCompany(mail.companyName);
    outside.count(company, "mails", mail.id, about);
    if (mail.clicked) outside.count(company, "clicked", mail.id, about);
    if (mail.replied) outside.count(company, "replied", mail.id, about);
    if (mail.signedUp) outside.count(company, "signedUp", mail.id, about);
    // As 수치 · 후보 reads delivery_status (funnel.ts): a complaint, else any other failure is a bounce.
    if (mail.deliveryStatus === "complained") outside.count(company, "complained", mail.id, about);
    else if (mail.deliveryStatus) outside.count(company, "bounced", mail.id, about);
    if (mail.unsubscribed) outside.count(company, "unsubscribed", mail.id, about);
  }
  for (const relay of input.relays) {
    if (people.has(relay.personId)) outside.count(outsideCompany(relay.companyName), "relayed", relay.personId, [relay.personId]);
  }
  for (const ask of input.introRequests) {
    if (people.has(ask.personId)) outside.count(outsideCompany(ask.companyName), "introRequested", ask.personId, [ask.personId]);
  }

  // ---- 하퍼 고객사
  const customers = table(CUSTOMER_COLUMNS);
  // Each customer Role belongs to one company (the first posting that named it).
  const roleCompany = new Map<string, ReturnType<typeof customerCompany>>();
  for (const person of input.people) {
    for (const posting of person.postings) {
      if (posting.kind !== "customer" || !posting.roleId) continue;
      const company = roleCompany.get(posting.roleId) ?? customerCompany(posting);
      roleCompany.set(posting.roleId, company);
      customers.count(company, "received", person.personId, [person.personId]);
    }
  }
  for (const fact of input.harper) {
    const company = roleCompany.get(fact.roleId);
    if (!company || !people.has(fact.personId)) continue;
    const who = [fact.personId];
    if (fact.interested) customers.count(company, "interested", fact.personId, who);
    if (fact.requested) customers.count(company, "requested", fact.personId, who);
    if (fact.answered) customers.count(company, "answered", fact.personId, who);
    if (fact.connected) customers.count(company, "connected", fact.personId, who);
    // A Harper account's messages on a Role count once, even when two of the period's person rows claimed that account.
    const thread = `${fact.talentId}|${fact.roleId}`;
    if (fact.toCompany > 0) customers.count(company, "toCompany", thread, who, fact.toCompany);
    if (fact.toTalent > 0) customers.count(company, "toTalent", thread, who, fact.toTalent);
  }

  return { outside: outside.finish(), customers: customers.finish() };
}

/**
 * #5 수치 · 회사 (Shaun 11/22): what the period's candidates led to on the company side, one row per company under a 합계
 * row, in two tables:
 *   하퍼 밖 회사  outside postings' companies (not on Harper): Ashley's company mails (agent/companyMail.ts) and what
 *                came of them (the company's reply, its words passed on, its sign-up, its connection request);
 *   하퍼 고객사    customers already on Harper: everything happens inside Harper (the candidate's saved / applied posting,
 *                the candidate's side contacting the company, the company's request, the connection).
 * Basis (Shaun 11/22): only what came from the people 수치 · 후보 counts (found in the period, test people never), so
 * every number here is part of the candidate numbers and opens those people (gtm_agent_people ids) in the log.
 *
 * The same step has the same name in both tables (Shaun 11/22 16:38): 공고 받은 후보, 회사 답, 회사가 연결 요청, 회사
 * 연결, in the same order. Each table still counts what happens on its side (16:54 "언제나 비교가능성이 있어야 되는 건
 * 아님 … 각자의 현상을 명확하게"): outside, what happens to a company mail (회사 메일, 회사 클릭, 회사 답, 회사 가입,
 * 반송 …) counts mails, everything else candidates. Before, "연결 요청" named opposite directions in the two tables (the
 * candidate's side contacting a customer; an outside company asking for the candidate): now 회사에 알린 후보 (customer)
 * and 회사가 연결 요청 (both). A reply's interest is not counted (16:43: no need to track it), so the old 관심 보인 후보 /
 * 동의 are gone (a company mail goes only with consent anyway).
 *
 * A cell is a number and the people behind it. Its unit is people (n = ids.length), mails (a company mail counts once,
 * its people are the candidates it was about) or messages. A person in two companies' rows is once in 합계; a mail or
 * a message belongs to one company, so 합계 is the sum of the rows. Pure: rows in, tallies out.
 */
import { companyKey } from "./match";
import type { AgentPostingKind } from "./types";

export type CompanyCell = { n: number; ids: string[] };

export const OUTSIDE_COLUMNS = [
  "received", "mails", "clicked", "answered", "relayed", "signedUp", "companyRequested", "connected", "bounced", "complained", "unsubscribed",
] as const;
export type OutsideColumn = (typeof OUTSIDE_COLUMNS)[number];

export const CUSTOMER_COLUMNS = ["received", "interested", "told", "answered", "companyRequested", "connected", "toCompany", "toTalent"] as const;
export type CustomerColumn = (typeof CUSTOMER_COLUMNS)[number];

/** What a cell's number counts: people (the number is its ids), or mails / messages (the ids are the people behind them). */
export type CompanyCellUnit = "people" | "mails" | "messages";

export const OUTSIDE_UNIT: Record<OutsideColumn, CompanyCellUnit> = {
  received: "people", mails: "mails", clicked: "mails", answered: "mails", relayed: "people", signedUp: "mails",
  companyRequested: "people", connected: "people", bounced: "mails", complained: "mails", unsubscribed: "mails",
};
export const CUSTOMER_UNIT: Record<CustomerColumn, CompanyCellUnit> = {
  received: "people", interested: "people", told: "people", answered: "people", companyRequested: "people", connected: "people",
  toCompany: "messages", toTalent: "messages",
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
  /**
   * A company that signed up from its mail asked to connect with the candidate: on Ashley's 외부 후보 card
   * (external_intro_requests; connected: the candidate confirmed it), or, the candidate being a Harper member by then,
   * through Harper's own request on the Role the mail made (company_intro_candidates). One candidate may have both
   * (a request that went on as a member request): counted once per company.
   */
  introRequests: ReadonlyArray<{ personId: string; companyName: string; connected: boolean }>;
  /** Per candidate and customer Role: what their Harper account did with it (talentId: the account their mail claimed). */
  harper: ReadonlyArray<{
    personId: string; talentId: string; roleId: string;
    /**
     * interested: saved / applied (관심·지원); told: the candidate's side started a thread to the company (회사에 알린
     * 후보); answered: the company wrote back in one; companyRequested: the company asked to connect on Harper
     * (company_intro_candidates.requested_at); connected: connected.
     */
    interested: boolean; told: boolean; answered: boolean; companyRequested: boolean; connected: boolean;
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
    /** Rows by `sortBy` (the first column unless said), most first, then by name; only the rows `keep` keeps. */
    finish(opts: { sortBy?: C; keep?: (cells: Record<C, CompanyCell>) => boolean } = {}): CompanyTable<C> {
      const all = [...rows.values()].map((row): CompanyRow<C> => {
        const name = row.name;
        const registeredName = row.registeredName?.trim() && row.registeredName.trim() !== name ? row.registeredName.trim() : null;
        return {
          key: row.key, name, registeredName,
          cells: Object.fromEntries(columns.map((column) => [column, done(row.cells[column])])) as Record<C, CompanyCell>,
        };
      });
      const companies = opts.keep ? all.filter((row) => opts.keep!(row.cells)) : all;
      const first = opts.sortBy ?? columns[0];
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
  // 공고 받은 후보: an outside posting in the candidate's mail (a customer's or Harper's own posting never gets a company mail).
  for (const person of input.people) {
    for (const posting of person.postings) {
      if (posting.kind === "external" && posting.companyName.trim()) {
        outside.count(outsideCompany(posting.companyName), "received", person.personId, [person.personId]);
      }
    }
  }
  const seenMails = new Set<string>();
  for (const mail of input.companyMails) {
    const about = ours(mail.personIds);
    // A mail about none of the period's candidates is not this panel's.
    if (!about.length || seenMails.has(mail.id)) continue;
    seenMails.add(mail.id);
    const company = outsideCompany(mail.companyName);
    // The mail counts once; its people are the candidates it was about.
    const count = (column: OutsideColumn) => outside.count(company, column, mail.id, about);
    count("mails");
    if (mail.clicked) count("clicked");
    if (mail.replied) count("answered");
    if (mail.signedUp) count("signedUp");
    // As 수치 · 후보 reads delivery_status (funnel.ts): a complaint, else any other failure is a bounce.
    if (mail.deliveryStatus === "complained") count("complained");
    else if (mail.deliveryStatus) count("bounced");
    if (mail.unsubscribed) count("unsubscribed");
  }
  for (const relay of input.relays) {
    if (people.has(relay.personId)) outside.count(outsideCompany(relay.companyName), "relayed", relay.personId, [relay.personId]);
  }
  for (const ask of input.introRequests) {
    if (!people.has(ask.personId)) continue;
    const company = outsideCompany(ask.companyName);
    outside.count(company, "companyRequested", ask.personId, [ask.personId]);
    if (ask.connected) outside.count(company, "connected", ask.personId, [ask.personId]);
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
    if (fact.told) customers.count(company, "told", fact.personId, who);
    if (fact.answered) customers.count(company, "answered", fact.personId, who);
    if (fact.companyRequested) customers.count(company, "companyRequested", fact.personId, who);
    if (fact.connected) customers.count(company, "connected", fact.personId, who);
    // A Harper account's messages on a Role count once, even when two of the period's person rows claimed that account.
    const thread = `${fact.talentId}|${fact.roleId}`;
    if (fact.toCompany > 0) customers.count(company, "toCompany", thread, who, fact.toCompany);
    if (fact.toTalent > 0) customers.count(company, "toTalent", thread, who, fact.toTalent);
  }

  return {
    // An outside company is a row once a company mail went to it (or more); one whose posting was only mailed to
    // candidates is in 합계's 공고 받은 후보 only (11/22: 142 such companies in 30 days would bury the rest).
    outside: outside.finish({
      sortBy: "mails",
      keep: (cells) => OUTSIDE_COLUMNS.some((column) => column !== "received" && cells[column].n > 0),
    }),
    customers: customers.finish(),
  };
}

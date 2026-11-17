import "server-only";

import { gtmRead } from "../db.server";
import { parseApplicants, type ImportedPerson } from "./importRows";
import { cleanEmail, kstClock, personKey, personKeys } from "./people";
import { createAgentRun, insertAgentPeople, type NewAgentPerson } from "./store.server";

export type ApplicantImport = {
  runId: string | null;
  /** New people added to the import run. */
  added: number;
  /** Of those, people with an email. */
  addedWithEmail: number;
  /** The same person twice in this list. */
  duplicates: number;
  /** People #5 already has (an earlier upload, paste or search; test rows only count for a test import). */
  alreadyKnown: number;
};

/**
 * #5 pilot 1: LinkedIn Recruiter applicants (pasted, or read from an uploaded export) become an import run of the
 * people #5 has not found before. The Apply starters export is the whole list every time, so people already known by
 * email or profile URL are left out here; duplicates within the list too. The run (dispatcher) then excludes, matches,
 * writes and sends as for any source, checking everything else (members, recent mails, opt-outs, quiet period).
 */
export async function importApplicantPeople(
  applicants: readonly ImportedPerson[],
  args: { isTest: boolean; userId: string },
): Promise<ApplicantImport> {
  const seen = new Set<string>();
  const candidates: Array<{ keys: string[]; person: Omit<NewAgentPerson, "runId"> }> = [];
  let duplicates = 0;
  for (const person of applicants) {
    const keys = personKeys({ email: person.email, profileUrl: person.profileUrl });
    const key = personKey({ email: person.email, profileUrl: person.profileUrl });
    if (!key) continue;
    if (keys.some((item) => seen.has(item))) { duplicates += 1; continue; }
    keys.forEach((item) => seen.add(item));
    candidates.push({
      keys,
      person: {
        source: "recruiter",
        personKey: key,
        email: person.email,
        emailSource: person.email ? "import" : null,
        isTest: args.isTest,
        name: person.name,
        headline: person.headline,
        location: person.location,
        currentCompany: person.currentCompany,
        profileUrl: person.profileUrl,
        profileText: person.extra,
        signalText: person.appliedJob ? `링크드인에서 지원: ${person.appliedJob}` : "링크드인에서 하퍼 공고에 지원",
        signalUrl: null,
        signalAt: person.appliedAt && !Number.isNaN(Date.parse(person.appliedAt)) ? new Date(person.appliedAt).toISOString() : null,
      },
    });
  }
  const known = await knownPersonKeys(candidates.flatMap((candidate) => candidate.keys), args.isTest);
  const fresh = candidates.filter((candidate) => !candidate.keys.some((key) => known.has(key))).map((candidate) => candidate.person);
  const alreadyKnown = candidates.length - fresh.length;
  if (!fresh.length) return { runId: null, added: 0, addedWithEmail: 0, duplicates, alreadyKnown };
  const run = await createAgentRun({ kind: "import", runDate: kstClock(new Date()).day, isTest: args.isTest, createdBy: args.userId });
  const inserted = await insertAgentPeople(fresh.map((person) => ({ ...person, runId: run.id })), args.userId);
  return {
    runId: run.id, added: inserted.length, addedWithEmail: inserted.filter((person) => person.email).length, duplicates, alreadyKnown,
  };
}

/**
 * Which of these keys (email:… / url:…) #5 already has, by its person key or by an email found later. Rows of the
 * other kind (test vs real) do not count, so a test upload never hides people from the real one.
 */
async function knownPersonKeys(keys: string[], isTest: boolean): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const emails = keys.filter((key) => key.startsWith("email:")).map((key) => key.slice("email:".length));
  const rows = await gtmRead((sql) => sql<Array<{ person_key: string; email: string | null }>>`
    select person_key, email from public.gtm_agent_people
    where is_test = ${isTest} and (person_key = any(${keys}::text[]) or lower(email) = any(${emails}::text[]))
  `);
  const known = new Set<string>();
  for (const row of rows) {
    known.add(row.person_key);
    const email = cleanEmail(row.email);
    if (email) known.add(`email:${email}`);
  }
  return known;
}

/** Pasted applicants (CSV or tab-separated, header first) → an import run. */
export async function importRecruiterApplicants(args: { text: string; isTest: boolean; userId: string }): Promise<
  ApplicantImport & { skipped: Array<{ line: number; reason: string }>; columns: string[] }
> {
  const parsed = parseApplicants(args.text);
  const result = await importApplicantPeople(parsed.people, args);
  return { ...result, skipped: parsed.skipped, columns: parsed.columns };
}

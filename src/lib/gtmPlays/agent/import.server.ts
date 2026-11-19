import "server-only";

import { gtmRead } from "../db.server";
import { ensureAgentConfig } from "./config.server";
import { applicantListCompany, applicantListSource } from "./applicantList";
import { applicantSignal, type ImportedPerson } from "./importRows";
import { cleanEmail, kstClock, personKey, personKeys } from "./people";
import { PROFILE_LABEL, profileTextFrom } from "./profile";
import { createAgentRun, insertAgentPeople, readAgentSettings, type NewAgentPerson } from "./store.server";

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
  /** A company's list only: people without an email, left out (the agent does not look up what the company gave none for). */
  noEmail: number;
};

/**
 * #5 pilot 1: LinkedIn Recruiter applicants (pasted, or read from an uploaded export), or a company's own applicant
 * list (`source` from applicantList.ts), become an import run of the people #5 has not found before. The Apply starters export is the whole list every time, so people already known by
 * email or profile URL are left out here; duplicates within the list too. The run (dispatcher) then excludes, matches,
 * writes and sends as for any source, checking everything else (members, recent mails, opt-outs, quiet period).
 * An applicant's signal is when they applied (the export's "Date Applied"), so the run handles the newest first.
 */
export async function importApplicantPeople(
  applicants: readonly ImportedPerson[],
  args: { isTest: boolean; userId: string; source?: string },
): Promise<ApplicantImport> {
  // "linkedin" (Recruiter Apply starters), or a company's own list (applicantList.ts).
  const source = args.source ?? "linkedin";
  const listCompany = applicantListCompany(source);
  const settings = await readAgentSettings();
  const { version } = settings;
  const now = new Date();
  const seen = new Set<string>();
  const candidates: Array<{ keys: string[]; person: Omit<NewAgentPerson, "runId" | "configId"> }> = [];
  let duplicates = 0;
  let noEmail = 0;
  for (const person of applicants) {
    if (listCompany && !person.email) { noEmail += 1; continue; }
    const keys = personKeys({ email: person.email, profileUrl: person.profileUrl });
    const key = personKey({ email: person.email, profileUrl: person.profileUrl });
    if (!key) continue;
    if (keys.some((item) => seen.has(item))) { duplicates += 1; continue; }
    keys.forEach((item) => seen.add(item));
    candidates.push({
      keys,
      person: {
        source,
        method: "applicant",
        settingsVersion: version,
        personKey: key,
        email: person.email,
        emailSource: person.email ? "import" : null,
        isTest: args.isTest,
        name: person.name,
        headline: person.headline,
        location: person.location,
        currentCompany: person.currentCompany,
        profileUrl: person.profileUrl,
        // The file's profile columns, labelled (profile.ts); their public LinkedIn profile is read before matching.
        profileText: profileTextFrom([{ label: PROFILE_LABEL.file, text: person.extra }]),
        ...applicantSignal(person, now, listCompany),
        signalUrl: null,
      },
    });
  }
  const known = await knownPersonKeys(candidates.flatMap((candidate) => candidate.keys), args.isTest);
  const fresh = candidates.filter((candidate) => !candidate.keys.some((key) => known.has(key))).map((candidate) => candidate.person);
  const alreadyKnown = candidates.length - fresh.length;
  if (!fresh.length) return { runId: null, added: 0, addedWithEmail: 0, duplicates, alreadyKnown, noEmail };
  // The upload's people carry the 설정 묶음 of the moment they are added (their run starts with it too).
  const config = await ensureAgentConfig(settings);
  const run = await createAgentRun({
    kind: "import", runDate: kstClock(new Date()).day, isTest: args.isTest, createdBy: args.userId, configId: config.id,
  });
  const inserted = await insertAgentPeople(fresh.map((person) => ({ ...person, runId: run.id, configId: config.id })), args.userId);
  return {
    runId: run.id, added: inserted.length, addedWithEmail: inserted.filter((person) => person.email).length, duplicates, alreadyKnown,
    noEmail,
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

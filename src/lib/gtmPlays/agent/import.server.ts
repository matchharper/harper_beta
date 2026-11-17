import "server-only";

import { parseApplicants } from "./importRows";
import { kstClock, personKey, personKeys } from "./people";
import { createAgentRun, insertAgentPeople, type NewAgentPerson } from "./store.server";

/**
 * #5 pilot 1: pasted LinkedIn Recruiter applicants become an import run of found people. The run (dispatcher)
 * then excludes, matches, writes and sends as for any source. Duplicates within the paste are dropped here; the run
 * checks everything else (members, recent mails, opt-outs, quiet period).
 */
export async function importRecruiterApplicants(args: { text: string; isTest: boolean; userId: string }): Promise<{
  runId: string | null; added: number; duplicates: number; skipped: Array<{ line: number; reason: string }>; columns: string[];
}> {
  const parsed = parseApplicants(args.text);
  const seen = new Set<string>();
  const people: Array<Omit<NewAgentPerson, "runId">> = [];
  let duplicates = 0;
  for (const person of parsed.people) {
    const keys = personKeys({ email: person.email, profileUrl: person.profileUrl });
    const key = personKey({ email: person.email, profileUrl: person.profileUrl });
    if (!key) continue;
    if (keys.some((item) => seen.has(item))) { duplicates += 1; continue; }
    keys.forEach((item) => seen.add(item));
    people.push({
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
    });
  }
  if (!people.length) return { runId: null, added: 0, duplicates, skipped: parsed.skipped, columns: parsed.columns };
  const run = await createAgentRun({ kind: "import", runDate: kstClock(new Date()).day, isTest: args.isTest, createdBy: args.userId });
  const inserted = await insertAgentPeople(people.map((person) => ({ ...person, runId: run.id })), args.userId);
  return { runId: run.id, added: inserted.length, duplicates, skipped: parsed.skipped, columns: parsed.columns };
}

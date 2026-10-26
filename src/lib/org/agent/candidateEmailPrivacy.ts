/** Model-input privacy only. Never change stored correspondence or delivery addresses. */
export function protectsCandidateEmail(stage: unknown) {
  return stage === "pending_connection" || stage === "company_intro" || stage === "intro_requested";
}

// Stored email addresses use ordinary mailbox/domain syntax. In Korean prose,
// a following particle ("주소로") is not part of the address.
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?/g;
const OMITTED = "[candidate email withheld]";

/** Traverse transport data, including tool arguments and diagnostic supplements.
 * This is an address/privacy boundary, not a classifier of conversational meaning.
 */
function mapStrings<T>(value: T, transform: (text: string) => string): T {
  if (typeof value === "string") return transform(value) as T;
  if (Array.isArray(value)) return value.map(item => mapStrings(item, transform)) as T;
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [transform(key), mapStrings(item, transform)])
  ) as T;
  return value;
}

export function omitCandidateEmails<T>(value: T, emails: Iterable<string>): T {
  const blocked = new Set([...emails].map(email => email.toLowerCase()));
  if (!blocked.size) return value;
  const addresses = [...blocked].sort((a, b) => b.length - a.length)
    .map(email => email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const exactAddresses = new RegExp(
    "(?<![a-zA-Z0-9._%+-])(?:" + addresses.join("|") + ")(?![a-zA-Z0-9_-]|\\.[a-zA-Z0-9])", "gi"
  );
  return mapStrings(value, text => text.replace(exactAddresses, OMITTED));
}

/** Primary projection: remove known private addresses before formatting/truncation.
 * Mixed Role reads use the stricter position so one Role cannot disclose another's email.
 */
export function projectCandidateEmailPrivacy<T>(value: T): T {
  const emails = new Set<string>();
  function visit(item: any) {
    if (!item || typeof item !== "object") return;
    const privateCandidate = protectsCandidateEmail(item.stage) ||
      protectsCandidateEmail(item.currentStage) ||
      protectsCandidateEmail(item.currentCompanyStage?.id) ||
      (Array.isArray(item.positions) && item.positions.some((position: any) => protectsCandidateEmail(position?.stage)));
    if (privateCandidate) {
      for (const email of [item.candidate?.email, item.talent?.email, item.candidateEmail]) {
        if (typeof email === "string" && email) emails.add(email);
      }
    }
    for (const nested of Object.values(item)) visit(nested);
  }
  visit(value);
  return omitCandidateEmails(value, emails);
}

/** Per-turn suppression is monotonic: connecting during this turn cannot reveal
 * an address previously withheld. Nonblocked addresses are rechecked each call.
 */
export function createCandidateEmailPrivacy(
  resolve: (emails: string[]) => Promise<Iterable<string>>
) {
  const blocked = new Set<string>();
  return async <T>(value: T): Promise<T> => {
    const found = new Set<string>();
    mapStrings(value, text => {
      for (const match of text.matchAll(EMAIL)) {
        const email = match[0].toLowerCase();
        if (!blocked.has(email)) found.add(email);
      }
      return text;
    });
    if (found.size) {
      // Fail closed: callers must not invoke the model if the privacy read fails.
      for (const email of await resolve([...found])) blocked.add(email.toLowerCase());
    }
    return omitCandidateEmails(value, blocked);
  };
}

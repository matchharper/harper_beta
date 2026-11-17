import type { GmailSearchResult } from "@/lib/integrations/gmail";

type Mail = GmailSearchResult["emails"][number] & { labels?: string[] };
type Predicate = (mail: Mail) => boolean;

// A closed mailbox for the evaluation. Unknown Gmail syntax must not turn into
// a successful empty search or false evidence about the candidate.
export function compileFixtureGmailQuery(query: string, now: string): Predicate {
  const tokens = query.toLowerCase().match(/"[^"]*"|[(){}]|-|[^\s(){}":]+:|[^\s(){}"]+/g) ?? [];
  let index = 0;
  function term(field: string, value: string, mail: Mail) {
    const received = Date.parse(mail.receivedAt ?? "");
    const labels = (mail.labels ?? ["inbox", "personal"]).map(label => label.toLowerCase());
    if (["subject", "from", "to", "cc"].includes(field)) {
      return (mail[field as "subject" | "from" | "to" | "cc"] ?? "").toLowerCase().includes(value);
    }
    if (field === "in" || field === "category" || field === "label") {
      return value === "anywhere" || labels.includes(value) || (value === "primary" && labels.includes("personal"));
    }
    if (["after", "before", "newer", "older"].includes(field)) {
      const time = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value.replaceAll("/", "-"));
      if (!Number.isFinite(time)) throw Error("Unsupported date in fixture mailbox: " + value);
      return field === "after" || field === "newer" ? received >= time : received < time;
    }
    if (field === "newer_than" || field === "older_than") {
      const amount = /^(\d+)([dmy])$/.exec(value);
      if (!amount) throw Error("Unsupported relative date in fixture mailbox: " + value);
      const cutoff = new Date(now);
      if (amount[2] === "d") cutoff.setUTCDate(cutoff.getUTCDate() - Number(amount[1]));
      if (amount[2] === "m") cutoff.setUTCMonth(cutoff.getUTCMonth() - Number(amount[1]));
      if (amount[2] === "y") cutoff.setUTCFullYear(cutoff.getUTCFullYear() - Number(amount[1]));
      return field === "newer_than" ? received >= cutoff.getTime() : received < cutoff.getTime();
    }
    if (field) throw Error("Unsupported search operator in fixture mailbox: " + field);
    return [mail.subject, mail.from, mail.to, mail.cc, mail.snippet, mail.content]
      .some(text => text?.toLowerCase().includes(value));
  }
  function atom(field: string): Predicate {
    const token = tokens[index++];
    if (!token || token === "}" || token === ")") throw Error("Incomplete fixture mailbox query");
    if (token === "-") {
      const next = atom(field);
      return mail => !next(mail);
    }
    if (token.endsWith(":")) return atom(token.slice(0, -1));
    if (token === "(" || token === "{") return group(field, token === "(" ? ")" : "}", token === "{");
    return mail => term(field, token.replace(/^"|"$/g, ""), mail);
  }
  function group(field: string, end: string | null, alternatives: boolean): Predicate {
    const parts: Predicate[][] = [[]];
    while (index < tokens.length && tokens[index] !== end) {
      if (tokens[index] === "or") { index++; parts.push([]); continue; }
      if (tokens[index] === "and") { index++; continue; }
      parts[parts.length - 1].push(atom(field));
      if (alternatives) parts.push([]);
    }
    if (end && tokens[index++] !== end) throw Error("Unclosed group in fixture mailbox query");
    const groups = parts.filter(part => part.length);
    return mail => !groups.length || groups.some(part => part.every(match => match(mail)));
  }
  return group("", null, false);
}

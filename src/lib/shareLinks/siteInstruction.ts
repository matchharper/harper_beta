/**
 * What the browser is told about the candidate summary link in a web application, in this order:
 * an empty optional link field (website, portfolio, other link) gets the URL; else an optional free-text field (cover
 * letter, additional information) gets one line at its end, or as its only line when it is empty; else the link is left
 * out. A field the reviewed answers left blank counts as empty (Shaun 11/18: in the first runs 6 of 7 links were left out
 * because a blank portfolio or cover-letter answer was read as "keep it empty"); only a field the reviewed answers leave
 * for the user to fill in themselves is off limits. The candidate's own answers and links are never replaced. The run answers profileLink (added / left_out) in its structured result, which is how Ops
 * counts it (readApplyFunnelLinks); the report quotes the link where it went, or says it was left out without the URL.
 */
export function siteProfileLinkInstruction(url: string) {
  return [
    `Candidate summary link (the user approved adding it to this application): ${url}`,
    "Add it at most once, by the first rule that fits, and only to an optional field:",
    "1. An empty optional field for a website, portfolio or other link, including one the reviewed answers left blank (not a LinkedIn, GitHub or other named profile field): enter only this URL there.",
    "2. Otherwise, an optional free-text field such as a cover letter, additional information or a message to the hiring team, filled or blank: add one line at its end (or as its only line when it is blank), \"Harper 후보 요약: <URL>\" on a Korean form or \"Harper candidate summary: <URL>\" otherwise, keeping any approved text above it unchanged.",
    "3. Otherwise, do not add it anywhere.",
    "A blank answer in the reviewed form only means nothing was written there, so such a field may take the link by the rules above. Never replace, shorten or remove the candidate's own answers or links, never use a required field meant for something else, and never add it to a field the reviewed answers say the user will fill in themselves. In the report, say which field got it, quoting the URL. If it was left out, say that and why without writing the URL.",
    "Set profileLink to added only when the link is in a field of the form you submitted, otherwise left_out.",
  ].join("\n");
}

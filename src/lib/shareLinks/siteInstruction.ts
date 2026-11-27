/**
 * What the browser is told about the candidate summary link in a web application, in this order:
 * a question asking how the applicant heard of the role is answered "Harper (<URL>)" as free text, or "Harper" from a
 * list, else "Other"/"기타" with "Harper (<URL>)" in its text box (in prod 7 of these answers said only "Harper", and
 * applications stopped when a form had no "Harper" choice or no place for the link); an answer holding the URL is the
 * link's one place. Else an empty optional link field (website, portfolio, other link) gets the URL; else an optional
 * free-text field (cover letter, additional information) gets one line at its end, or as its only line when it is
 * empty; else the link is left out, which never stops the application. A field the reviewed answers left blank counts
 * as empty (Shaun 11/18: in the first runs 6 of 7 links were left out because a blank portfolio or cover-letter answer
 * was read as "keep it empty"); only a field the reviewed answers leave for the user to fill in themselves is off
 * limits. The candidate's own answers and links are never replaced. The run answers profileLink (added / left_out) in its structured result, which is how Ops
 * counts it (readApplyFunnelLinks); the report quotes the link where it went, or says it was left out without the URL.
 */
export function siteProfileLinkInstruction(url: string) {
  return [
    `Candidate summary link (the user approved adding it to this application): ${url}`,
    "Add it at most once, by the first rule that fits:",
    "1. A question asking how the applicant heard about this role or company, unless the reviewed answers give another source: as free text, answer \"Harper (<URL>)\" (an approved answer \"Harper\" becomes \"Harper (<URL>)\"); as a list, choose \"Harper\" when offered, otherwise \"Other\" or \"기타\" (with neither, the closest truthful choice) and write \"Harper (<URL>)\" in its text box when it has one. An answer that holds the URL is its one place; when the answer cannot hold it, the next rules decide.",
    "2. Otherwise, an empty optional field for a website, portfolio or other link, including one the reviewed answers left blank (not a LinkedIn, GitHub or other named profile field): enter only this URL there.",
    "3. Otherwise, an optional free-text field such as a cover letter, additional information or a message to the hiring team, filled or blank: add one line at its end (or as its only line when it is blank), \"Harper 후보 요약: <URL>\" on a Korean form or \"Harper candidate summary: <URL>\" otherwise, keeping any approved text above it unchanged.",
    "4. Otherwise, do not add it anywhere and continue: having no place for the link is never a reason to stop or ask.",
    "A blank answer in the reviewed form only means nothing was written there, so such a field may take the link by the rules above. Never write the URL in two places. Never replace, shorten or remove the candidate's own answers or links, never use a required field meant for something else, and never add it to a field the reviewed answers say the user will fill in themselves. In the report, say which field got it, quoting the URL. If it was left out, say that and why without writing the URL.",
    "Set profileLink to added only when the link is in a field of the form you submitted, otherwise left_out.",
  ].join("\n");
}

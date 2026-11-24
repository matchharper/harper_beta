// A Markdown link whose URL may hold one level of parentheses.
const LINK = String.raw`\[[^\]\n]*\]\((?:[^()\s]|\([^()\s]*\))*\)`;
const LINK_RUN = String.raw`${LINK}(?:[ \t]*(?:[,;·]|및|and)?[ \t]*${LINK})*`;
const NUMBERED_CITATION = new RegExp(
  String.raw`[ \t]*\[\d+\](?:\((?:[^()\s]|\([^()\s]*\))*\))?`,
  "g"
);
const PARENTHESIZED_CITATION = new RegExp(
  String.raw`[ \t]*\([ \t]*${LINK_RUN}[ \t]*\)`,
  "g"
);
const TRAILING_CITATION = new RegExp(
  String.raw`(^|[.!?。][ \t]*)(?:(?:Sources?|출처|근거)[ \t]*[:：][ \t]*)?${LINK_RUN}[.,;]?(?=[ \t]|$)`,
  "gim"
);

/**
 * Company research keeps its sources beside each claim for the model. On the
 * company screen the sentences read without them: numbered markers, links in
 * parentheses, and links trailing a sentence are dropped, while a link that is
 * part of a sentence stays.
 */
export const stripSentenceSourceLinks = (markdown: string) =>
  markdown
    .replace(NUMBERED_CITATION, "")
    .replace(PARENTHESIZED_CITATION, "")
    .replace(TRAILING_CITATION, (_match, before: string) => before.trimEnd())
    .replace(/[ \t]+$/gm, "");

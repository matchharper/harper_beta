/**
 * #5 mail: the words around the 2-3 postings and the mail in Harper's mail layout (as #4's candidate mail: greeting,
 * body, buttons, closing, opt-out line). Pure: the composer, the sender, the Ops preview and tests share it.
 */
import { candidateDigestActionRowHtml, candidateDigestActionRowText } from "@/lib/companyFirstSearch/candidateDigestEmail";
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { gtmCandidateOpening } from "../personalLine";
import { gtmOptOutMarkdown } from "../shared";
import type { AgentPosting } from "./types";

export type AgentMailLanguage = "ko" | "en";

const COPY = {
  ko: {
    open: "공고 보기",
    reply: "답장하기",
    harper: "하퍼는 원하시는 방향을 듣고 맞는 회사를 찾아 이어 드리는 서비스예요. 버튼을 누르면 하퍼에서 공고를 먼저 보실 수 있고, 가입하시면 이 공고들이 '내 기회'에 담겨요. 이 메일에 답장하셔도 돼요.",
    signOff: (name: string) => `${name} 드림\nHarper`,
  },
  en: {
    open: "See the roles",
    reply: "Reply",
    harper: "Harper listens to where you want to go next and connects you with companies that fit. The button shows you these roles on Harper first; sign up and they will be waiting in your opportunities. You can also just reply to this email.",
    signOff: (name: string) => `${name}\nHarper`,
  },
} as const;

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

/**
 * The why as the candidate reads it in a cold mail and Ops reads it on the log: the fit itself, without the reviewer's
 * caveat that production's picker often adds ("다만 …", "However …"). Not needed for GTM (Shaun 11/17).
 */
export function mailWhy(why: string): string {
  const text = why.trim();
  const cut = text.search(/(?:^|[.!?。]\s+|\s)(?:다만|단,|하지만|However|But)[\s,]/);
  const kept = (cut > 0 ? text.slice(0, cut + 1) : text).trim();
  return kept.length >= 10 ? kept : text;
}

/** One posting as a list item: "**Company** · Title (Location)" and its why on the next line. */
export function agentPostingLine(posting: AgentPosting): string {
  const where = posting.location?.trim() ? ` (${escapeMarkdown(posting.location.trim())})` : "";
  const head = `- **${escapeMarkdown(posting.companyName.trim())}** · ${escapeMarkdown(posting.title.trim())}${where}`;
  // A hard line break: the why reads as its own line under the company and title, not run into it.
  return posting.why.trim() ? `${head}  \n  ${escapeMarkdown(mailWhy(posting.why))}` : head;
}

/** The postings as a markdown list (the composer puts it in the body; the renderer adds it when the body lost it). */
export function agentPostingList(postings: readonly AgentPosting[]): string {
  return postings.map(agentPostingLine).join("\n");
}

/** Whether every posting's title is already in the body (an edited body may have dropped the list). */
export function bodyListsPostings(body: string, postings: readonly AgentPosting[]): boolean {
  return postings.every((posting) => body.includes(escapeMarkdown(posting.title.trim())) || body.includes(posting.title.trim()));
}

/** The lines under the button: what Harper is and the sign-off. */
export function agentMailClosing(language: AgentMailLanguage, senderName: string): string {
  const copy = COPY[language];
  return `${copy.harper}\n\n${copy.signOff(senderName)}`;
}

/** The body without a greeting at its very start ("안녕하세요, ", "안녕하세요. ", "Hi, ", "Hello! "). */
export function dropLeadingGreeting(body: string): string {
  return body.replace(/^(?:안녕하세요|안녕하십니까|hi|hello)\s*[,.!]?\s*/i, "").trim();
}

const ACTION_MARKER = "HARPERGTMAGENTACTIONSX";

/**
 * The #5 mail: greeting, body (with the postings list; added when missing), the button to Harper and a reply
 * button, the closing (what Harper is, sign-off), the opt-out line.
 */
export function renderAgentMail(input: {
  language: AgentMailLanguage; subject: string; body: string; name: string | null; harperUrl: string;
  postings: readonly AgentPosting[]; senderName: string; senderEmail: string; unsubscribeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const copy = COPY[input.language];
  const subject = input.subject.trim();
  // The greeting is added per person: drop one the writer put at the start anyway ("안녕하세요, …").
  const body = dropLeadingGreeting(input.body.trim());
  const withList = input.postings.length && !bodyListsPostings(body, input.postings)
    ? `${body}\n\n${agentPostingList(input.postings)}`
    : body;
  const row = {
    criteria: [],
    primary: { label: copy.open, url: input.harperUrl },
    secondary: { label: copy.reply, url: `mailto:${input.senderEmail}?subject=${encodeURIComponent(`Re: ${subject}`)}` },
  };
  const markdown = [
    ...gtmCandidateOpening(input.language, input.name).map(escapeMarkdown),
    withList,
    ACTION_MARKER,
    escapeMarkdown(agentMailClosing(input.language, input.senderName)),
    gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ].filter(Boolean).join("\n\n");
  const rendered = renderReplyEmail(markdown, { audience: "talent" });
  const marker = new RegExp(`<p[^>]*>${ACTION_MARKER}</p>`);
  if (!marker.test(rendered.html) || !rendered.text.includes(ACTION_MARKER)) {
    throw new Error("GTM agent mail buttons could not be placed");
  }
  return {
    subject,
    html: rendered.html.replace(marker, () => candidateDigestActionRowHtml(row)),
    text: rendered.text.replace(ACTION_MARKER, () => candidateDigestActionRowText(row)),
  };
}

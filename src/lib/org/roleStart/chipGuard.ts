import type { OrgLocale } from "@/i18n/org/locale";
import { formatPromptText } from "@/lib/llm/promptText";
import "server-only";

import { callRoleStartJson, ROLE_START_FAST_MODEL, type RoleStartLlmUsage } from "./llm";

/**
 * Every question the hiring team sees comes with 4-5 answer chips (they can
 * also type). The prompts and schemas ask for that; this is the server side
 * that holds it when a model answer falls short: a short question gets its
 * chips filled instead of being dropped, and a question the role chat wrote
 * as plain text becomes a chip card.
 */

export const MIN_CHIPS = 4;
export const MAX_CHIPS = 5;

type Ask = typeof callRoleStartJson;

/** Distinct, trimmed labels in order, at most five. */
export function distinctChips(labels: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim().slice(0, 80);
    const key = label.replace(/\s+/g, " ").toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.slice(0, MAX_CHIPS);
}

/** When filling fails: a question that still offers a choice (2+ chips) stays; one with fewer goes. */
export function keptWithoutFill<T extends { chips: unknown[] }>(question: T): T | null {
  return question.chips.length >= 2 ? question : null;
}

const FILL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chips"],
  properties: { chips: { type: "array", minItems: MIN_CHIPS, maxItems: MAX_CHIPS, items: { type: "string" } } },
};

/** Chips and the chat's question card are worded in the member's language (company_users.locale); Korean when not given. */
const CHIP_WORDING: Record<OrgLocale, { chips: string; undecided: string; none: string; question: string; why: string }> = {
  ko: {
    chips: "4-5 short Korean answers",
    undecided: '"아직 정하지 않았어요"',
    none: '"없어요" / "아직 정하지 않았어요"',
    question: "one short Korean question",
    why: "one short Korean sentence",
  },
  en: {
    chips: "4-5 short English answers",
    undecided: '"Not decided yet"',
    none: '"None" / "Not decided yet"',
    question: "one short English question",
    why: "one short English sentence",
  },
};

function fillSystem(language: OrgLocale) {
  const wording = CHIP_WORDING[language];
  return `You write answer chips for one question Harper asks a hiring team.
Return ${wording.chips} the team could pick, each a different meaning (no rewording of another), covering the realistic range including an honest ${wording.undecided} style answer when that is a real answer.
Keep every given chip first and unchanged, then add new ones. No chip for typing a custom answer or skipping; the product offers both.`;
}

/** The labels with new ones added so there are 4-5; the given ones stay first. */
export async function fillChips(
  args: { question: string; chips: string[]; context?: string; ask?: Ask; signal?: AbortSignal; language?: OrgLocale }
): Promise<{ chips: string[]; usage: RoleStartLlmUsage | null }> {
  const given = distinctChips(args.chips);
  if (given.length >= MIN_CHIPS) return { chips: given, usage: null };
  const ask = args.ask ?? callRoleStartJson;
  const { data, usage } = await ask<{ chips: string[] }>({
    label: "chip_fill",
    model: ROLE_START_FAST_MODEL,
    reasoningEffort: "low",
    maxOutputTokens: 600,
    schema: FILL_SCHEMA,
    system: fillSystem(args.language ?? "ko"),
    user: formatPromptText({ question: args.question, givenChips: given, context: args.context ?? "" }),
    signal: args.signal,
  });
  const chips = distinctChips([...given, ...(data.chips ?? [])]);
  if (chips.length < MIN_CHIPS) throw new Error("chip fill returned too few answers");
  return { chips, usage };
}

const CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["asks", "question", "why", "chips", "reply"],
  properties: {
    asks: { type: "boolean" },
    question: { type: "string" },
    why: { type: "string" },
    chips: { type: "array", maxItems: MAX_CHIPS, items: { type: "string" } },
    reply: { type: "string" },
  },
};

function cardSystem(language: OrgLocale) {
  const wording = CHIP_WORDING[language];
  return `You check one message Harper is about to send a hiring team in the role setup chat.
asks: true when the message asks the team to answer, choose, share or tell something (a question, or a request such as "알려주세요" / "공유해 주세요"); false otherwise.
When asks is true:
- question: that ask as ${wording.question} (keep its meaning; if there are several asks, the most important one).
- why: ${wording.why} on why Harper asks (what it changes), or "".
- chips: ${wording.chips} the team could pick, each a different meaning, including an honest ${wording.none} style answer when that is a real answer. No chip for typing or skipping.
- reply: the message without that ask (keep everything else exactly, including formatting); "" if nothing else remains.
When asks is false: question "", why "", chips [], reply = the message unchanged.`;
}

/**
 * Whether a reply may ask the team something: a question mark, or a Korean
 * question or request ending. Only then is the model asked to make a card,
 * so a reply that asks nothing costs no extra call.
 */
export function mayAsk(reply: string) {
  if (/[?？]/.test(reply)) return true;
  return /(까요|나요|가요|인가요|을까요|ㄹ까요|주세요|주시면|알려 ?주|말씀해|공유해|골라|선택해|어떠세요|있으신가요|계신가요|있을까요)\s*[.!…]*\s*(\n|$)/m.test(reply);
}

export type ReplyCard = { question: string; why: string; chips: string[]; reply: string };

/**
 * The role chat's reply split into the text and one chip card, when the reply
 * asks the team something. Null when it asks nothing.
 */
export async function questionCardFromReply(
  args: { reply: string; ask?: Ask; language?: OrgLocale }
): Promise<{ card: ReplyCard | null; usage: RoleStartLlmUsage }> {
  const ask = args.ask ?? callRoleStartJson;
  const { data, usage } = await ask<{ asks: boolean; question: string; why: string; chips: string[]; reply: string }>({
    label: "chat_question_card",
    model: ROLE_START_FAST_MODEL,
    reasoningEffort: "low",
    maxOutputTokens: 4_000,
    schema: CARD_SCHEMA,
    system: cardSystem(args.language ?? "ko"),
    user: args.reply,
  });
  if (!data.asks || !data.question.trim()) return { card: null, usage };
  const filled = await fillChips({ question: data.question, chips: data.chips ?? [], context: args.reply, ask, language: args.language });
  return {
    card: { question: data.question.trim(), why: (data.why ?? "").trim(), chips: filled.chips, reply: (data.reply ?? "").trim() },
    usage,
  };
}

const COVERED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["covered", "repeated"],
  properties: {
    covered: { type: "array", items: { type: "integer" } },
    repeated: { type: "array", items: { type: "integer" } },
  },
};

const COVERED_SYSTEM = `Harper is about to ask a hiring team questions while setting up a role. ASKED are questions Harper's chat already wrote; DRAFTED are questions prepared from the job description.
ANSWERED are questions from Harper's chat the team already answered, each with the team's answer (null when it cannot be used).
covered: the indexes (0-based) of ASKED questions that ask for the same decision as some DRAFTED question (same thing to decide, even if worded differently). Do not include an ASKED question that asks for something no DRAFTED question asks.
repeated: the indexes (0-based) of DRAFTED questions that ask for the same decision as some ANSWERED question, or whose decision some ANSWERED answer already makes clear. Do not include a DRAFTED question the answers leave open.`;

/**
 * Questions the role chat already asked that a drafted question covers
 * (indexes into `asked`), and drafted questions that repeat one the team
 * already answered in the chat or that its answer already settles (indexes
 * into `drafted`), so the team is not asked the same thing twice.
 */
export async function coveredQuestions(args: {
  asked: string[];
  drafted: string[];
  /** A bare question, or the question with the team's answer (null: not usable to settle another). */
  answered?: Array<string | { question: string; answer: string | null }>;
  ask?: Ask;
}) {
  const ask = args.ask ?? callRoleStartJson;
  const { data, usage } = await ask<{ covered: number[]; repeated?: number[] }>({
    label: "question_overlap",
    model: ROLE_START_FAST_MODEL,
    reasoningEffort: "low",
    maxOutputTokens: 300,
    schema: COVERED_SCHEMA,
    system: COVERED_SYSTEM,
    user: formatPromptText({
      ASKED: args.asked,
      DRAFTED: args.drafted,
      ANSWERED: (args.answered ?? []).map((item) => (typeof item === "string" ? { question: item, answer: null } : item)),
    }),
  });
  const within = (length: number) => (index: number) => Number.isInteger(index) && index >= 0 && index < length;
  const covered = (data.covered ?? []).filter(within(args.asked.length));
  const repeated = (args.answered?.length ? data.repeated ?? [] : []).filter(within(args.drafted.length));
  return { covered: [...new Set(covered)], repeated: [...new Set(repeated)], usage };
}

import { getEncoding } from "js-tiktoken";
import { MODEL_MAX_INPUT_TOKENS, modelMaxInputTokens } from "@/lib/llm/modelConfig";

/**
 * One input (a user message, an email, a pasted page) may use at most a quarter
 * of the smallest documented Career model input. The rest of a turn needs room
 * for system and tool definitions, recent history, tool results accumulated
 * over several steps, and the reply. This is a resource bound, not a writing
 * length rule: in 90 days only one Career message (a 2 MB HTML page) reached it.
 */
export const CAREER_SINGLE_INPUT_TOKEN_LIMIT = Math.floor(
  Math.min(...Object.values(MODEL_MAX_INPUT_TOKENS)) / 4
);

/** Room kept for the model's reply and its own tool calls within one request. */
const REPLY_RESERVE_TOKENS = 128_000;

let tokenizer: ReturnType<typeof getEncoding> | null = null;

const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");

/** Longest piece handed to the tokenizer at once. */
const COUNT_CHUNK_CHARS = 256;

/**
 * Token count, measured in short pieces. One long run without spaces (an
 * embedded base64 image) makes BPE on the whole string take minutes; pieces
 * cut at a space where possible keep it linear, and a cut inside a word can
 * only add a token, so the sum never undercounts. Counting stops past `stopAt`.
 */
function countTokens(text: string, stopAt = Infinity) {
  tokenizer ??= getEncoding("o200k_base");
  let total = 0;
  for (let start = 0; start < text.length && total <= stopAt;) {
    let end = Math.min(text.length, start + COUNT_CHUNK_CHARS);
    if (end < text.length) {
      const space = text.lastIndexOf(" ", end);
      if (space > start + COUNT_CHUNK_CHARS / 2) end = space;
      // Never split a surrogate pair.
      else if (/[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end -= 1;
    }
    total += tokenizer.encode(text.slice(start, end)).length;
    start = end;
  }
  return total;
}

/**
 * Every o200k token covers at least one UTF-8 byte, so the byte count is an
 * upper bound. Only text that could exceed `limit` is tokenized.
 */
export function exceedsTokens(text: string, limit: number) {
  if (utf8Bytes(text) <= limit) return false;
  return countTokens(text, limit) > limit;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
};

/**
 * The words a person would read on a page: markup, style and script code and
 * embedded binary data are removed. Plain text passes through apart from
 * whitespace and embedded data URIs. `stripped` says whether anything other
 * than whitespace was removed.
 */
export function readableTextOf(text: string) {
  let value = text.replace(/data:[a-z0-9.+/-]+;base64,[a-z0-9+/=\s]+/gi, "[embedded file removed]");
  let stripped = value !== text;
  if (/<(?:!doctype|html|head|body|div|p|span|table|section|article|style|script)\b/i.test(value)) {
    stripped = true;
    value = value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(style|script|svg|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|header|footer|table|ul|ol|blockquote|pre)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
        if (name.startsWith("#")) {
          const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
        }
        return ENTITIES[name.toLowerCase()] ?? entity;
      });
  }
  return {
    text: value
      .replace(/[ \t\f\v\u00a0]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    stripped,
  };
}

/** The longest prefix of `text` that stays within `limit` tokens. */
function prefixWithin(text: string, limit: number) {
  let end = Math.min(text.length, limit);
  while (end > 0 && exceedsTokens(text.slice(0, end), limit)) end = Math.floor(end / 2);
  return text.slice(0, end);
}

export type CareerInputFit = {
  text: string;
  /** Present only when the text sent to the model differs from the original. */
  reduced?: { originalChars: number; keptChars: number; readableOnly: boolean };
};

/**
 * What a model can receive of one input. Text whose byte size is within the
 * limit (nearly every message) is returned unchanged without tokenizing.
 * Larger text first loses markup and embedded data, which is cheap and keeps
 * the tokenizer away from long base64 runs; only the remaining readable words
 * are counted. If they still do not fit, the model receives their beginning
 * with a note saying how much was left out.
 */
export function fitCareerInputText(text: string, limit = CAREER_SINGLE_INPUT_TOKEN_LIMIT): CareerInputFit {
  if (utf8Bytes(text) <= limit) return { text };
  const readable = readableTextOf(text);
  if (!exceedsTokens(readable.text, limit)) {
    return readable.stripped
      ? { text: readable.text, reduced: { originalChars: text.length, keptChars: readable.text.length, readableOnly: true } }
      : { text };
  }
  const kept = prefixWithin(readable.text, limit);
  return { text: kept, reduced: { originalChars: text.length, keptChars: kept.length, readableOnly: false } };
}

/** The model-facing form of a reduced input: the fact of the reduction stays visible. */
export function describeCareerInputFit(fit: CareerInputFit) {
  if (!fit.reduced) return fit.text;
  const { originalChars, keptChars, readableOnly } = fit.reduced;
  const note = readableOnly
    ? `[Harper: this input was ${originalChars.toLocaleString("en-US")} characters, more than one model input can hold. Page markup, style code and embedded files were removed; all ${keptChars.toLocaleString("en-US")} characters of readable text follow.]`
    : `[Harper: this input was ${originalChars.toLocaleString("en-US")} characters, more than one model input can hold. Only its first ${keptChars.toLocaleString("en-US")} readable characters follow; the rest was not included, so ask the person if a missing part matters.]`;
  return `${note}\n${fit.text}`;
}

/** Shortcut for callers that only need the model-facing text. */
export function fitCareerInputForModel(text: string, limit?: number) {
  return describeCareerInputFit(fitCareerInputText(text, limit));
}

type FitMessage = { role: string; content: string };

/**
 * Keeps a turn within the model's documented input limit by leaving out the
 * oldest history first. The latest message (the current input) and a leading
 * conversation summary are kept. Unknown models are returned unchanged: their
 * limit is not documented, and a failure still ends through the retry limit.
 */
export function fitCareerHistoryToModel<T extends FitMessage>(args: {
  model: string | null | undefined;
  systemText: string;
  toolsText: string;
  messages: T[];
  isSummary?: (message: T) => boolean;
}) {
  const maxInput = modelMaxInputTokens(args.model);
  if (!maxInput) return { messages: args.messages, omitted: 0 };
  const budget = maxInput - REPLY_RESERVE_TOKENS;
  // Bytes bound tokens from above: an ordinary turn stops here untokenized.
  const bytes = utf8Bytes(args.systemText) + utf8Bytes(args.toolsText) +
    args.messages.reduce((sum, message) => sum + utf8Bytes(message.content), 0);
  if (bytes <= budget) return { messages: args.messages, omitted: 0 };
  // Each part is measured once. Small parts count by bytes, an upper bound,
  // so only large parts are tokenized.
  const cost = (text: string) => {
    const bytes = utf8Bytes(text);
    return bytes <= 64_000 ? bytes : countTokens(text);
  };
  const fixedCost = cost(args.systemText) + cost(args.toolsText);
  const costs = args.messages.map(message => cost(message.content));
  let total = fixedCost + costs.reduce((sum, value) => sum + value, 0);
  if (total <= budget) return { messages: args.messages, omitted: 0 };
  const messages = [...args.messages];
  let omitted = 0;
  while (total > budget) {
    const index = messages.findIndex((message, position) =>
      position < messages.length - 1 && !(args.isSummary?.(message) ?? false));
    if (index < 0) break;
    total -= costs[index];
    messages.splice(index, 1);
    costs.splice(index, 1);
    omitted += 1;
  }
  if (omitted > 0) {
    const index = messages.findIndex(message => !(args.isSummary?.(message) ?? false));
    if (index >= 0) messages[index] = {
      ...messages[index],
      content: `[Harper: ${omitted} earlier message${omitted === 1 ? " was" : "s were"} left out of this conversation history to fit the model input limit.]\n${messages[index].content}`,
    };
  }
  return { messages, omitted };
}

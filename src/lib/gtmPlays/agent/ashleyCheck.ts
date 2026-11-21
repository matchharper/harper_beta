/**
 * #5 the check right before an Ashley mail goes out (design 4장 "보내기 전 점검"). Pure: the caller reads the facts
 * (opt-out list, human-owned thread, the clock) right before and passes them in. Any failure holds the mail and hands
 * the thread to a person; outside the sending hours the mail waits (it is not dropped).
 *
 * What it looks at in the text, facts only (Shaun 11/21 12:02: code keeps facts the text shows and safety limits;
 * what a sentence means is Ashley's):
 * - links: only Harper's (matchharper.com and its subdomains; the signup link is one);
 * - email addresses and phone numbers: none but Harper's own addresses;
 * - pay: an amount in a sentence about pay must be in the posting text the writer was given (a question is not a claim).
 *
 * Whether a sentence promises to ask the company, states a visa / remote / relocation fact or only says the posting is
 * silent, asks leave to send a summary, or says she is a person is meaning. Word lists for those held correct replies
 * ("the posting is silent on visas", "I can't ask the company for you": 4-5 of the 9 real replies Ashley answered in
 * the 11/21 replay 3, differently each run) and let both wrong replies of replays 1 and 2 through, so they are Ashley's
 * prompt (ashleyPrompt.ts) and the replay's 0-wrong-send bar before a deploy.
 */

export type PreSendInput = {
  draft: string;
  /** The posting texts and facts the writer was given (read_posting results and the postings sent). */
  postingTexts: readonly string[];
  /** Fixed copy (a relay of the company's own words, the company branches): the pay check is off. */
  fixedCopy?: boolean;
  /** The address is on the shared opt-out list (read right before). */
  suppressed: boolean;
  /** Inside the sending hours (sendWeekdays / sendStartHour / sendEndHour, Korea time). */
  windowOpen: boolean;
  /** A person answered in this thread from Ashley's Gmail (read right before). */
  humanOwned: boolean;
};

export type PreSendResult =
  | { status: "ok" }
  /** Outside the sending hours: the mail waits for the next open tick. */
  | { status: "wait"; reasons: string[] }
  | { status: "fail"; reasons: string[] };

const HARPER_HOST = /(?:^|\.)matchharper\.com$/i;
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()"'“”]+|\bwww\.[^\s<>()"'“”]+/gi;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** A bare domain ("example.com/jobs"); file names and versions are not domains (a known top-level part is needed). */
const BARE_DOMAIN = /(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|co|ai|dev|app|me|kr|jp|cn|uk|de|us|info|biz|xyz|ly|gg|to|so)(?:\/[^\s]*)?(?![\w-])/gi;
/** A phone number: 9-15 digits with spaces, dots, dashes or brackets between, maybe a leading +. */
const PHONE = /(?<![\w,.])\+?\d[\d\s().-]{7,}\d(?![\w,])/g;

/** A sentence about pay (an amount in it must be in the posting). */
const SALARY = /연봉|급여|보수|처우|월급|\d\s*(?:만\s*원|억|원)|salary|compensation|\bpay(?:ing|s)?\b|wage|\$\s?\d|\d+\s?[kK]\b|\bUSD\b|\bKRW\b|\bEUR\b|equity|stock option|스톡옵션/i;

/** Sentences of a text (line breaks and . ! ? 。 end one). */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?。？！])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** Amounts in a sentence ("$120k", "6,000만 원", "120,000"), as digit strings, for "is it in the posting". */
function amounts(sentence: string): string[] {
  return (sentence.match(/\d[\d,.]*/g) ?? []).map(digitsOf).filter((digits) => digits.length >= 2);
}

function isHarperLink(link: string): boolean {
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    return HARPER_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** Curly and other apostrophes as the plain one, so "doesn’t" and "I’m" read as the patterns spell them. */
const plainApostrophes = (text: string) => text.replace(/[\u2018\u2019\u02BC\u2032`]/g, "'");

export function checkBeforeSend(input: PreSendInput): PreSendResult {
  const reasons: string[] = [];
  const draft = plainApostrophes(input.draft.trim());
  if (!draft) reasons.push("쓴 내용이 없어요");
  if (input.suppressed) reasons.push("연락 받지 않기 목록에 있어요");
  if (input.humanOwned) reasons.push("사람이 이미 답한 스레드예요");

  const links = [...(draft.match(URL_IN_TEXT) ?? []), ...(draft.replace(URL_IN_TEXT, " ").replace(EMAIL_IN_TEXT, " ").match(BARE_DOMAIN) ?? [])];
  const foreign = links.filter((link) => !isHarperLink(link.replace(/[.,!?)]+$/, "")));
  if (foreign.length) reasons.push(`하퍼 밖 링크가 있어요 (${foreign.slice(0, 2).join(", ")})`);

  const emails = (draft.match(EMAIL_IN_TEXT) ?? []).filter((email) => !HARPER_HOST.test(email.split("@")[1] ?? ""));
  if (emails.length) reasons.push(`메일 주소가 들어 있어요 (${emails.slice(0, 2).join(", ")})`);
  const phones = (draft.replace(URL_IN_TEXT, " ").match(PHONE) ?? []).filter((phone) => {
    const digits = digitsOf(phone).length;
    return digits >= 9 && digits <= 15;
  });
  if (phones.length) reasons.push("전화번호가 들어 있어요");

  if (!input.fixedCopy) {
    const posting = input.postingTexts.join("\n");
    const postingDigits = (posting.match(/\d[\d,.]*/g) ?? []).map(digitsOf);
    const amountMissing = (sentence: string) =>
      amounts(sentence).some((amount) => !postingDigits.some((digits) => digits.includes(amount)));
    // A link's words are not a sentence about the role (the signup link carries the question: "…question=What+is+the+pay").
    const unsupportedPay = sentences(draft.replace(URL_IN_TEXT, " "))
      .some((sentence) => !/[?？]/.test(sentence) && SALARY.test(sentence) && amountMissing(sentence));
    if (unsupportedPay) reasons.push("공고에 없는 연봉 금액이 있어요");
  }

  if (reasons.length) return { status: "fail", reasons };
  if (!input.windowOpen) return { status: "wait", reasons: ["보내는 시간이 아니에요"] };
  return { status: "ok" };
}

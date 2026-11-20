/**
 * #5 the check right before an Ashley mail goes out (design 4장 "보내기 전 점검"). Pure: the caller reads the facts
 * (opt-out list, human-owned thread, the clock) right before and passes them in. Any failure holds the mail and hands
 * the thread to a person; outside the sending hours the mail waits (it is not dropped).
 *
 * What it looks at in the text:
 * - links: only Harper's (matchharper.com and its subdomains; the signup link is one);
 * - email addresses and phone numbers: none but Harper's own addresses;
 * - salary / visa / remote / relocation: a sentence that states one of them must have that topic in the posting text the
 *   writer was given (a question back, "not in the posting", or "I'll ask" is fine), and an amount must be in it too;
 * - a promise to ask the company now ("회사에 이름 없이 물어볼게요") only when a company mail can actually go;
 *   "once you're on Harper I'll ask" is fine either way;
 * - Ashley saying she is a person, or calling herself an AI or a bot.
 */

export type PreSendInput = {
  draft: string;
  /** The posting texts and facts the writer was given (read_posting results and the postings sent). */
  postingTexts: readonly string[];
  /** Fixed copy (a relay of the company's own words, the company branches): the salary/visa promise check is off. */
  fixedCopy?: boolean;
  /** A company mail can go for a question this mail answers (canAskCompany for a recorded question). */
  canAskCompany: boolean;
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

const TOPICS: Array<{ topic: string; label: string; words: RegExp }> = [
  {
    topic: "salary",
    label: "연봉",
    words: /연봉|급여|보수|처우|월급|\d\s*(?:만\s*원|억|원)|salary|compensation|\bpay(?:ing|s)?\b|wage|\$\s?\d|\d+\s?[kK]\b|\bUSD\b|\bKRW\b|\bEUR\b|equity|stock option|스톡옵션/i,
  },
  { topic: "visa", label: "비자", words: /비자|visa|sponsor|스폰서|work permit|취업 ?허가/i },
  { topic: "remote", label: "원격", words: /원격|재택|리모트|remote|work from home|\bwfh\b|hybrid|하이브리드/i },
  { topic: "relocation", label: "이주", words: /이주|이사 지원|relocat|정착 지원|moving (?:cost|support)/i },
];

/**
 * A sentence that does not state the fact: a question back, "the posting does not say", or a promise to ask (now or
 * once they are on Harper). "물어보신 연봉은 …" (you asked) states it, so only the asking forms count.
 */
const NOT_A_CLAIM = new RegExp([
  "\\?", "？",
  "물어(?:볼게|보겠|봐 ?드릴|봐 ?드리겠)", "여쭤(?:볼게|보겠|봐 ?드릴)", "확인해 ?(?:볼게|보겠|드릴게|드리겠)", "확인하겠",
  "알아(?:볼게|보겠|봐 ?드릴)", "공고에(?:는)?[^.!?\\n]{0,30}(?:없|나와 ?있지 ?않|적혀 ?있지 ?않|안 ?나와)", "모르겠", "알 수 없",
  "I(?:'ll| will) (?:ask|check|find out|confirm)", "ask (?:the |their )?(?:company|team)", "find out",
  "not (?:listed|mentioned|stated|specified|in the posting)", "(?:doesn't|does not|didn't) (?:say|mention|list|specify)",
  "isn't (?:listed|mentioned|stated|in the posting)", "don't know", "not sure",
].join("|"), "i");

/** A promise to ask the company now (not tied to their joining Harper). */
const ASK_COMPANY = /(?:회사|팀|채용 ?담당자)(?:에|에게|측에|쪽에)\s*(?:이름 없이\s*|익명으로\s*)?(?:바로\s*|직접\s*)?(?:물어|여쭤|확인해|문의)|I(?:'ll| will) (?:ask|check with|reach out to) (?:the |their )?(?:company|team|hiring)|ask (?:the |their )?(?:company|team) (?:for you|without|on your behalf)/i;
/** …once they are on Harper (the customer-posting answer): not a promise of a company mail now. */
const AFTER_SIGNUP = /가입|Harper(?:로|에) (?:오|들어오|와)|하퍼(?:로|에) (?:오|들어오|와)|소개하면서|소개할 때|once you(?:'re| are)? (?:on|join|sign)|when you (?:join|sign)|after you (?:join|sign)|if you (?:join|sign)|introduc/i;

const SELF_HUMAN = /(?:저는|제가)\s*(?:진짜\s*|실제\s*)?사람|(?:I am|I'm) (?:a )?(?:real )?(?:human|person)|not a (?:bot|robot|machine)|봇이 아니|로봇이 아니/i;
const SELF_AI = /(?:저는|제가)\s*(?:AI|인공지능|봇|챗봇)|(?:I am|I'm)\s+(?:an?\s+)?(?:AI|bot|chatbot)\b/i;

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

export function checkBeforeSend(input: PreSendInput): PreSendResult {
  const reasons: string[] = [];
  const draft = input.draft.trim();
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
    const unsupported = new Set<string>();
    for (const sentence of sentences(draft)) {
      if (NOT_A_CLAIM.test(sentence)) continue;
      for (const { topic, label, words } of TOPICS) {
        if (!words.test(sentence)) continue;
        if (!words.test(posting)) unsupported.add(label);
        else if (topic === "salary" && amounts(sentence).some((amount) => !postingDigits.some((digits) => digits.includes(amount)))) {
          unsupported.add(`${label} 금액`);
        }
      }
    }
    if (unsupported.size) reasons.push(`공고에 없는 ${[...unsupported].join("·")} 이야기가 있어요`);
    if (!input.canAskCompany && sentences(draft).some((sentence) => ASK_COMPANY.test(sentence) && !AFTER_SIGNUP.test(sentence))) {
      reasons.push("회사에 메일을 보낼 수 없는데 회사에 물어보겠다고 했어요");
    }
  }
  if (SELF_HUMAN.test(draft)) reasons.push("사람이라고 했어요");
  if (SELF_AI.test(draft)) reasons.push("스스로 AI라고 했어요");

  if (reasons.length) return { status: "fail", reasons };
  if (!input.windowOpen) return { status: "wait", reasons: ["보내는 시간이 아니에요"] };
  return { status: "ok" };
}

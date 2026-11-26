import { KOREAN_SURNAMES } from "@/lib/gtmPlays/agent/companySourcing";

const LATIN_WORD = /^\p{Script=Latin}[\p{Script=Latin}'’.-]*$/u;
const TITLE = /^(dr|mr|mrs|ms|miss|prof|sir)\.?$/i;

/**
 * How Harper's company mails call a person (mail-tone review, 2026-11-26). A name in Latin
 * letters goes by its first word ("Dana Lee" → "Dana님", "Hi Dana,"); a Hangul or any other
 * name stays whole ("김하늘님"). A Latin name that starts with a Korean surname, a title or an
 * initial ("Kim Minji", "Dr. Jane Doe", "J. Smith") also stays whole, so nobody is called by a
 * surname, a title or a letter alone.
 */
export function mailCallName(name: string | null | undefined) {
  const text = (name ?? "").trim().replace(/\s+/g, " ");
  const words = text.split(" ").filter(Boolean);
  if (words.length < 2 || !words.every((word) => LATIN_WORD.test(word))) return text;
  const first = words[0];
  const whole =
    KOREAN_SURNAMES.has(first.toLowerCase()) ||
    TITLE.test(first) ||
    first.replace(/[.'’-]/g, "").length < 2;
  return whole ? text : first;
}

import { KOREAN_SURNAMES } from "@/lib/gtmPlays/agent/companySourcing";

const LATIN_WORD = /^\p{Script=Latin}[\p{Script=Latin}'’.-]*$/u;
const TITLE = /^(dr|mr|mrs|ms|miss|prof|sir)\.?$/i;

/**
 * Surnames that, written first, would otherwise pass for a given name: other spellings of
 * Korean surnames, and common Chinese and Vietnamese surnames ("Zhang Wei", "Nguyen Van An").
 * Spellings that are also common Korean given-name syllables (ji, dong, su, ye, chan) stay
 * out; the two-syllable rule below handles those names.
 */
const OTHER_SURNAMES = new Set([
  "rhee", "rhie", "choe", "hur", "yim", "gwon", "kweon", "gim", "bak", "bahk", "gwak", "lyu", "ryoo",
  "pyo", "uhm", "maeng", "yeom", "rho", "gu",
  "wang", "li", "zhang", "liu", "chen", "huang", "zhao", "wu", "zhou", "xu", "zhu", "hu", "guo", "he",
  "lin", "luo", "gao", "zheng", "liang", "xie", "tang", "deng", "feng", "cao", "peng", "zeng", "xiao",
  "tian", "pan", "yuan", "cai", "jiang", "du", "cheng", "lu", "ding", "shen", "yao", "cui", "zhong",
  "tan", "fan", "qian", "dai", "qiu", "wong", "cheung", "leung", "chow", "lam", "lau", "ng", "ong",
  "goh", "koh", "loh", "toh", "chua", "khoo", "liew", "yap", "chong", "gan",
  "nguyen", "tran", "le", "pham", "hoang", "huynh", "phan", "vu", "vo", "dang", "bui", "ngo", "duong",
]);

/** One romanized Korean syllable: "tae", "gyun", "choong", "seung". */
const KOREAN_SYLLABLE =
  /^(?:kk|tt|pp|ss|jj|ch|sh|wh|[gkndtrlmbpsjhyw])?(?:yeo|yae|wae|eui|you|yoo|eo|ae|ya|ye|oe|wa|wo|we|wi|yo|yu|eu|ui|oo|ee|ou|ea|a|e|o|u|i)(?:ng|ck|[kntlmpbg])?$/;

const isSurname = (word: string) => KOREAN_SURNAMES.has(word) || OTHER_SURNAMES.has(word);

/**
 * How Harper's company mails call a person (mail-tone review, 2026-11-26). A name in Latin
 * letters goes by its first word ("Dana Lee" → "Dana님", "Hi Dana,"); a Hangul or any other
 * name stays whole ("김하늘님"). A given name written as two Korean-style syllables before
 * the surname goes by both ("Tae Ho Kim" → "Tae Ho"). A Latin name that starts with a
 * known surname, a title or an initial ("Kim Minji", "Zhang Wei", "Dr. Jane Doe", "J. Smith")
 * stays whole. A surname-first name whose surname is not on these lists (many Japanese
 * names, for one) still goes by its first word.
 */
export function mailCallName(name: string | null | undefined) {
  const text = (name ?? "").trim().replace(/\s+/g, " ");
  const words = text.split(" ").filter(Boolean);
  if (words.length < 2 || !words.every((word) => LATIN_WORD.test(word))) return text;
  const lower = words.map((word) => word.toLowerCase());
  const first = words[0];
  if (isSurname(lower[0]) || TITLE.test(first) || first.replace(/[.'’-]/g, "").length < 2)
    return text;
  if (
    words.length === 3 &&
    isSurname(lower[2]) &&
    KOREAN_SYLLABLE.test(lower[0]) &&
    KOREAN_SYLLABLE.test(lower[1])
  )
    return `${words[0]} ${words[1]}`;
  return first;
}

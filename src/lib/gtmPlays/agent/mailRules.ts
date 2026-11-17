/**
 * #5: which address the agent may mail and from which sender, whose address an address on a page is, and what may
 * reach a mail as plain words. Pure, so the run, the Ops screen and the tests agree.
 */
import { isHarperMailAddress, isPersonalMailAddress, mailDomain } from "../personalMail";
import type { AgentSettings } from "./types";

// ---------------------------------------------------------------------------------------------------------------
// Hosts

/**
 * Sites where many people have pages (communities, blog and code platforms, social media, site builders, link
 * pages, job boards). A page on one is never "the person's own domain": an address there is never their own-domain
 * address, and a bare link to one proves nothing about whose page it is. Subdomains count (jane.tistory.com).
 */
export const SHARED_PLATFORM_DOMAINS: readonly string[] = [
  "linkedin.com", "x.com", "twitter.com", "threads.net", "threads.com", "facebook.com", "instagram.com", "tiktok.com",
  "youtube.com", "reddit.com", "ycombinator.com", "okky.kr", "careerly.co.kr", "disquiet.io", "velog.io", "tistory.com",
  "naver.com", "daum.net", "kakao.com", "brunch.co.kr", "medium.com", "substack.com", "blogspot.com", "blogger.com",
  "wordpress.com", "tumblr.com", "dev.to", "hashnode.dev", "qiita.com", "zenn.dev", "github.com", "github.io",
  "githubusercontent.com", "gitlab.com", "gitlab.io", "bitbucket.org", "notion.site", "notion.so", "notion.com",
  "oopy.io", "google.com", "vercel.app", "netlify.app", "pages.dev", "herokuapp.com", "wix.com", "wixsite.com",
  "webflow.io", "framer.website", "framer.ai", "carrd.co", "imweb.me", "cafe24.com", "linktr.ee", "bit.ly",
  "about.me", "behance.net", "dribbble.com", "slideshare.net", "speakerdeck.com", "stackoverflow.com",
  "rocketpunch.com", "wanted.co.kr", "jumpit.co.kr", "saramin.co.kr", "jobkorea.co.kr", "remember.co.kr",
  "programmers.co.kr", "inflearn.com", "exa.ai",
];

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Lower-cased host of a URL without "www." ("" when it is not a web URL). */
export function urlHost(url: string | null | undefined): string {
  const match = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#:@\s]+)(?::\d+)?(?:[/?#]|$)/i.exec(String(url ?? "").trim());
  return match ? match[1].toLowerCase().replace(/^www\./, "").replace(/\.$/, "") : "";
}

export function isSharedPlatformHost(host: string): boolean {
  return SHARED_PLATFORM_DOMAINS.some((domain) => onDomain(host, domain));
}

/** A country's second level (co.kr, com.au …): never a domain of its own. */
const SECOND_LEVEL = /^(?:co|or|ne|go|ac|re|pe|com|net|org|gov|edu)\.[a-z]{2}$/;

/**
 * An address on the person's own domain: its domain is the host of a page where the person was found, or a parent
 * of it (me@janedoe.dev found on blog.janedoe.dev), never a shared platform (velog, tistory, medium, GitHub,
 * LinkedIn, OKKY, Hacker News …) and never a bare country suffix.
 */
export function ownDomainAddress(email: string | null | undefined, pageUrls: ReadonlyArray<string | null | undefined>): boolean {
  const domain = mailDomain(email);
  if (!domain || !domain.includes(".") || SECOND_LEVEL.test(domain) || isSharedPlatformHost(domain)) return false;
  return pageUrls.some((url) => {
    const host = urlHost(url);
    return Boolean(host) && !isSharedPlatformHost(host) && onDomain(host, domain);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Which address the agent may mail

/**
 * Whether the agent may mail this address.
 * - A free personal mailbox (gmail.com, naver.com, …): yes.
 * - Harper's own (matchharper.com): yes, the team's tests.
 * - Anything else is a company or an own-name domain. A work address belongs to the employer (team decision
 *   11/16, as #4) and is never mailed. Only an address the person published in their own post or page (source
 *   'post') on their own domain counts as theirs (owner's rule 11/17: own addresses the person wrote are OK, company
 *   addresses never): its domain is that of `foundOn`, the page where the person was found (their own blog or site),
 *   never a shared platform. Without `foundOn` no such address passes. An address from an application or a lookup
 *   on another domain is treated as a work address.
 */
export function agentMailableAddress(
  email: string | null | undefined,
  source: "import" | "post" | "lookup" | null,
  foundOn: ReadonlyArray<string | null | undefined> = [],
): boolean {
  if (!email) return false;
  if (isPersonalMailAddress(email) || isHarperMailAddress(email)) return true;
  return source === "post" && ownDomainAddress(email, foundOn);
}

/**
 * Why the agent cannot send mail at all right now (shown on /ops #5), or null. The sender is chris@matchharper.com
 * by default, as #1 and #4 (Shaun 11/17), and can be changed on /ops #5 to an address on another domain once that
 * domain is set up for sending.
 */
export function agentSenderProblem(settings: Pick<AgentSettings, "senderEmail" | "senderName">): string | null {
  const email = settings.senderEmail?.trim().toLowerCase() ?? "";
  if (!email) return "보내는 주소가 없어요";
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(email)) return "보내는 주소를 확인해 주세요";
  if (!settings.senderName?.trim()) return "보내는 사람 이름이 없어요";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Whose address it is

/** Lower case, one space, and the common hidden forms of an address ("jane [at] example [dot] com") written out. */
export function pageForm(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/＠/g, "@")
    .replace(/\s*[[({<]\s*at\s*[\])}>]\s*/gi, "@")
    .replace(/\s*[[({<]\s*dot\s*[\])}>]\s*/gi, ".")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A word on the page: whole-word for Latin text; contained for other scripts (Korean attaches particles: 회사에서). */
export function onPage(page: string, term: string): boolean {
  if (!term) return false;
  if (!/^[\x20-\x7e]+$/.test(term)) return page.includes(term);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "u").test(page);
}

/** The person's name on the page: as written, in reverse order ("Doe Jane"), or every part of it as a word. */
export function nameOnPage(name: string | null | undefined, page: string): boolean {
  const full = pageForm(name).replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  if (full.length < 2) return false;
  if (onPage(page, full)) return true;
  const parts = full.split(" ").filter((part) => part.length >= 2);
  if (parts.length < 2) return false;
  return onPage(page, [...parts].reverse().join(" ")) || parts.every((part) => onPage(page, part));
}

/** Path words that name a kind of page, not a person (linkedin.com/in/…, okky.kr/users/…). */
const NOT_HANDLES = new Set([
  "in", "pub", "users", "user", "profile", "profiles", "posts", "post", "p", "status", "articles", "article", "about",
  "blog", "home", "index", "page", "pages", "www", "m", "mobile", "en", "ko", "kr", "series", "comments", "lounge",
  "item", "news", "gist", "sites", "docs", "postview.naver", "postview.nhn", "feed", "update", "pulse",
]);

/**
 * The handles a person's pages show (linkedin.com/in/jane-doe → jane-doe, velog.io/@jane → jane, jane.tistory.com →
 * jane, janedoe.dev → janedoe): what a page may call them by instead of their name.
 */
export function profileHandles(urls: ReadonlyArray<string | null | undefined>): string[] {
  const handles = new Set<string>();
  for (const url of urls) {
    const host = urlHost(url);
    if (!host) continue;
    const labels = host.split(".");
    const platform = SHARED_PLATFORM_DOMAINS.find((domain) => onDomain(host, domain));
    // A subdomain on a platform (jane.tistory.com), or an own site's name (janedoe.dev).
    if (platform && host !== platform) handles.add(host.slice(0, -platform.length - 1).split(".").pop() ?? "");
    if (!platform && labels.length >= 2) handles.add(labels[labels.length - (SECOND_LEVEL.test(labels.slice(-2).join(".")) ? 3 : 2)] ?? "");
    if (!platform) continue;
    const path = String(url ?? "").replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "").split(/[?#]/)[0];
    for (const raw of path.split("/").slice(0, 3)) {
      let segment = raw;
      try {
        segment = decodeURIComponent(raw);
      } catch {
        // keep as written
      }
      const word = segment.toLowerCase().replace(/^@/, "");
      if (word && !NOT_HANDLES.has(word)) {
        handles.add(word);
        break;
      }
    }
  }
  return [...handles].filter((handle) => handle.length >= 3 && !NOT_HANDLES.has(handle) && /^[\p{L}\p{N}._-]+$/u.test(handle)
    && /\p{L}/u.test(handle));
}

/** A host that is a whole platform or one of its services (medium.com, blog.naver.com), not one person's site on it. */
export function isPlatformRoot(host: string): boolean {
  const platform = SHARED_PLATFORM_DOMAINS.find((domain) => onDomain(host, domain));
  if (!platform) return false;
  const sub = host === platform ? "" : host.slice(0, -platform.length - 1);
  return !sub || sub.split(".").every((label) => label.length < 3 || NOT_HANDLES.has(label));
}

/** Local parts that are a team's or a system's, not one person's. */
const ROLE_LOCAL_PART = /^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|privacy|legal|security|admin|administrator|webmaster|root|info|contact|contacts|hello|help|support|cs|service|services|sales|marketing|press|media|pr|ads|biz|business|partner|partners|partnership|partnerships|jobs|job|career|careers|recruit|recruiting|recruitment|hr|hiring|talent|team|office|billing|feedback|inquiry|inquiries|enquiry|enquiries|newsletter|news|notifications?|mail|email)$/;
const FILE_TLD = /\.(?:png|jpe?g|gif|svg|webp|ico|bmp|tiff?|css|js|json|pdf)$/;
const ADDRESS_ON_PAGE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g;

/** The distinct addresses on a page that look like one person's (not info@, noreply@ … and not image names). */
export function personalAddressesOnPage(text: string | null | undefined): string[] {
  const found = new Set<string>();
  for (const match of pageForm(text).matchAll(ADDRESS_ON_PAGE)) {
    const email = match[0].replace(/^[._%+-]+|[._-]+$/g, "");
    const local = email.slice(0, email.indexOf("@"));
    if (!local || ROLE_LOCAL_PART.test(local) || FILE_TLD.test(email) || email.endsWith("noreply.github.com")) continue;
    found.add(email);
  }
  return [...found];
}

/** How far around the address the person's name or handle must be (about a paragraph). */
export const NEAR_ADDRESS_CHARS = 300;

/**
 * Where a comment starts on a thread page: its time ("2 days ago", "3일 전"), which follows the commenter's name. On a
 * page with two or more of them (a thread), the stretch around an address ends at the comment around it (its author is
 * within COMMENT_AUTHOR_CHARS before the time); one "10 years ago" in a bio does not make a thread.
 */
const COMMENT_TIME = /(?:\b\d+\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s+ago\b|\d+\s*(?:초|분|시간|일|주|개월|달|년)\s*전(?![\p{L}])|\bjust now\b|방금 전)/giu;
const COMMENT_AUTHOR_CHARS = 40;

/** The stretch before and after an address, cut where another comment starts (thread pages). */
function sameCommentStretch(before: string, after: string): string {
  const times = [...before.matchAll(COMMENT_TIME)];
  const last = times.at(-1);
  const previous = times.at(-2);
  // From this comment's author (just before its time), never reaching back to the previous comment's author.
  const from = last ? Math.max(0, (last.index ?? 0) - COMMENT_AUTHOR_CHARS, previous ? (previous.index ?? 0) + previous[0].length : 0) : 0;
  const head = before.slice(from);
  const next = after.search(COMMENT_TIME);
  const tail = next >= 0 ? after.slice(0, Math.max(0, next - COMMENT_AUTHOR_CHARS)) : after;
  return `${head} ${tail}`;
}

/** Where the address is on the page (the whole address; for "jane at gmail dot com" its local part as a word). */
function addressAt(page: string, email: string): Array<{ start: number; end: number }> {
  const spots: Array<{ start: number; end: number }> = [];
  for (let at = page.indexOf(email); at >= 0; at = page.indexOf(email, at + 1)) spots.push({ start: at, end: at + email.length });
  if (spots.length) return spots;
  const local = email.slice(0, email.indexOf("@"));
  if (local.length < 3) return spots;
  for (const match of page.matchAll(new RegExp(`(^|[^a-z0-9._%+-])(${escapeRegExp(local)})(?=[^a-z0-9._%+-]|$)`, "g"))) {
    const start = (match.index ?? 0) + match[1].length;
    spots.push({ start, end: start + local.length });
  }
  return spots;
}

export type AddressCheck = {
  email: string;
  /** The page's text (what the reader saw). */
  text: string;
  /** The person's name as the page writes it, and the handles of their pages (profileHandles). */
  names: ReadonlyArray<string | null | undefined>;
  handles: readonly string[];
  /** The page is the person's own: their profile, under a link they wrote, or their own domain. */
  ownPage: boolean;
  /**
   * Other people's names on the same page (a comment thread): an address near one of them is never this person's.
   */
  others?: ReadonlyArray<string | null | undefined>;
};

/**
 * Whether an address on a page is this person's (item 10 of the 11/17 review): the address is near their name or
 * handle (within NEAR_ADDRESS_CHARS either side, the address itself not counting, and on a thread page within the same
 * comment), no other known person's name is in that stretch, and — unless the page is the person's own — it is the
 * only address on the page that looks like one person's. On the person's own page an address that carries their handle
 * or name (jane.doe@…, me@janedoe.dev) also counts as near.
 */
export function addressIsPersons(check: AddressCheck): boolean {
  const page = pageForm(check.text);
  const email = check.email.trim().toLowerCase();
  if (!page || !email.includes("@")) return false;
  const spots = addressAt(page, email);
  if (!spots.length) return false;
  if (!check.ownPage && new Set([...personalAddressesOnPage(page), email]).size > 1) return false;
  const names = check.names.map((name) => String(name ?? "").trim()).filter((name) => name.length >= 2);
  const others = (check.others ?? []).map((name) => String(name ?? "").trim())
    .filter((name) => name.length >= 2 && !names.some((own) => pageForm(own) === pageForm(name)));
  const mentioned = (stretch: string) => names.some((name) => nameOnPage(name, stretch))
    || check.handles.some((handle) => onPage(stretch, handle.toLowerCase()));
  const thread = (page.match(COMMENT_TIME) ?? []).length >= 2;
  const near = spots.some(({ start, end }) => {
    const before = page.slice(Math.max(0, start - NEAR_ADDRESS_CHARS), start);
    const after = page.slice(end, end + NEAR_ADDRESS_CHARS);
    const stretch = (thread ? sameCommentStretch(before, after) : `${before} ${after}`).split(email).join(" ");
    return mentioned(stretch) && !others.some((name) => nameOnPage(name, stretch));
  });
  if (near) return true;
  if (!check.ownPage) return false;
  const address = email.replace(/[@._+-]+/g, " ");
  return check.handles.some((handle) => handle.length >= 3 && address.includes(handle.toLowerCase().replace(/[._-]+/g, " ")))
    || names.some((name) => {
      const parts = pageForm(name).split(/[\s,.]+/).filter((part) => part.length >= 3 && /^[a-z]+$/.test(part));
      return parts.length > 0 && parts.every((part) => onPage(address, part));
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Plain words in a mail

const URL_SCHEME = /\b(?:https?|ftp):\/\/[^\s<>"'`)\]]+/gi;
const URL_WWW = /\bwww\.[^\s<>"'`)\]]+/gi;
const EMAIL_IN_TEXT = /[^\s@<>()[\]"'`,;:]+@[^\s@<>()[\]"'`,;:]+\.[a-z]{2,}/gi;
/** A bare domain a mail program would turn into a link (jane.dev, example.co.kr/x), by common top-level domains. */
const BARE_DOMAIN = /(?<![A-Za-z0-9@.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|ai|dev|app|co|kr|xyz|info|biz|site|online|tech|blog|cloud|page|link|ly|gg|sh|jp|cn|uk|de|fr|eu|ca|au|sg|hk|tw|vn|ru|br|es|nl|ch|pl|se|fi|dk)(?![A-Za-z0-9-])(?:[/:?#][^\s<>"'`)\]]*)?/gi;

/**
 * Text without anything a mail would turn into a link or markup: HTML tags, markdown images (dropped) and links
 * (their words kept), autolinks, reference definitions, web addresses and email addresses. Line breaks are kept.
 */
export function withoutLinks(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(?<!\\)<\/?[a-z][^>]*>/gi, "")
    .replace(/(?<!\\)<[^>\s]*[:@][^>\s]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, "")
    .replace(/(?<!\\)\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(?<!\\)\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$/gm, "")
    .replace(URL_SCHEME, "")
    .replace(URL_WWW, "")
    .replace(EMAIL_IN_TEXT, "");
}

/**
 * Model-written or page-taken words as plain text for a mail (item 6 of the 11/17 review): no links, web or email
 * addresses (bare domains too), HTML or markdown (emphasis, headings, quotes, brackets, escapes). Line breaks are
 * kept (one blank line at most), spaces tidied; at most `max` characters.
 */
export function mailPlainText(value: string | null | undefined, max: number): string {
  return withoutLinks(value)
    .replace(BARE_DOMAIN, "")
    .replace(/\\/g, "")
    .replace(/[*~`[\]<>]/g, "")
    .replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, "$1")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*>+[ \t]*/gm, "")
    .replace(/[(（]\s*[)）]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?。:;)])/g, "$1")
    .split("\n").map((line) => line.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

/** Longest name a greeting uses; a longer one is not a name (the greeting goes without it). */
export const MAX_MAIL_NAME_CHARS = 60;

/**
 * A person's name as a greeting may use it: plain words on one line, at most MAX_MAIL_NAME_CHARS; null when nothing
 * name-like is left or it is longer (then the greeting has no name).
 */
export function mailPersonName(value: string | null | undefined): string | null {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw || raw.length > MAX_MAIL_NAME_CHARS * 2) return null;
  // A headline glued to the name ("Jane Doe | Backend Engineer") is not part of it.
  const name = mailPlainText(raw, MAX_MAIL_NAME_CHARS * 2).split(/\s*[|·•—–]\s*|\s+-\s+/)[0].replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_MAIL_NAME_CHARS || /[@/\\:]|\p{N}{4,}/u.test(name) || !/\p{L}/u.test(name)) return null;
  return name;
}

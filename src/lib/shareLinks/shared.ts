/**
 * 후보자 링크 (client-safe). A candidate's Harper profile link that goes with an application Harper sends for the
 * candidate (the candidate agreed when approving it): /c/<token> shows the company what the candidate agreed to
 * share, without signing in; signing up from it gives the company a Role from the posting with the candidate
 * already in "연결을 요청할 후보".
 */

export const SHARE_LINK_PATH = "/c";
/** /org?share=<token>: the link the company is signing up from. */
export const SHARE_LINK_ORG_PARAM = "share";
export const SHARE_LINK_STORAGE_KEY = "harper:share-link";

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function isShareLinkToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/** The application the link went with: a mail to the company (now) or a site form's field (later). */
export type ShareLinkSource = "mail_application" | "site_application";

/**
 * The buttons on /c. Each one asks the company to sign up; the question ones are filled into the Role chat.
 * `ask` is a question the company typed itself.
 */
export const SHARE_LINK_CTAS = ["salary", "start", "schedule", "more", "ask"] as const;
export type ShareLinkCta = (typeof SHARE_LINK_CTAS)[number];

export function isShareLinkCta(value: unknown): value is ShareLinkCta {
  return SHARE_LINK_CTAS.includes(value as ShareLinkCta);
}

export type ShareLinkPosting = {
  title: string;
  companyName: string | null;
  url: string | null;
  location: string | null;
  /** The posting text the Role is made from (kept short enough for one Role description). */
  description: string;
};

/** What the company sees, fixed when the link was made (later profile edits make a new link, not a new page). */
export type ShareLinkSnapshot = {
  name: string;
  headline: string | null;
  location: string | null;
  /** One sentence about the person for this company. */
  summary: string;
  /** Why the person fits this posting. */
  fit: string[];
  /** Role · company · period, newest first. */
  career: string[];
  /** What the person is looking for, as far as they agreed to share. */
  wants: string[];
};

export type ShareLinkScope = {
  /** Desired compensation may appear in `wants` only when the candidate allowed it. */
  compensation: boolean;
};

export const DEFAULT_SHARE_LINK_SCOPE: ShareLinkScope = { compensation: false };

/** Everything /c renders. */
export type ShareLinkPage = {
  token: string;
  language: "ko" | "en";
  companyName: string;
  posting: { title: string; url: string | null };
  snapshot: ShareLinkSnapshot;
};

/** The one line the /org sign-in screen shows while a link is waiting to be claimed. */
export type ShareLinkTeaser = {
  name: string;
  postingTitle: string;
  language: "ko" | "en";
};

export type ShareLinkClaim =
  | {
      status: "claimed";
      roleId: string;
      talentId: string;
      /** The candidate's name, for the Role chat's input. */
      name: string;
      workspaceId: string;
      roleActive: boolean;
      /** The question the button asked, in the link's language. */
      question: string | null;
    }
  /** Expired, revoked, or the candidate left. */
  | { status: "unavailable" }
  | { status: "forbidden" }
  /** Another company account took it first. */
  | { status: "taken" }
  | { status: "internal" };

/**
 * The domain part of an address or a URL host, lower-cased, without "www.". Null for anything that is not one.
 */
export function shareLinkDomain(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const host = raw.includes("@") ? raw.split("@").pop() ?? "" : raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/:?#]/)[0];
  const domain = host.replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

/**
 * Mail domains people use privately. They never identify a company: a link to one is tied to the company by its
 * name (the posting's company) instead of the domain.
 */
export const PERSONAL_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "naver.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "daum.net",
  "icloud.com", "me.com", "kakao.com", "hanmail.net", "nate.com", "proton.me", "protonmail.com",
];

export function isPersonalMailDomain(domain: string | null | undefined) {
  return Boolean(domain && PERSONAL_MAIL_DOMAINS.includes(domain.toLowerCase()));
}

/**
 * A company name as one key, so spellings of the same name match: "(주)데모 페이" and "데모페이", or "Demo Pay, Inc."
 * and "demo pay". Lower case, without legal forms (주식회사, (주), ㈜, Inc., Corp., Co., Ltd., LLC) and without spaces or
 * punctuation. The same company written in another script ("데모페이" and "Demo Pay") stays two keys.
 */
export function shareLinkCompanyKey(name: string | null | undefined) {
  const lower = String(name ?? "").toLowerCase().trim();
  const key = lower
    .replace(/주식회사|유한회사|\(주\)|\(유\)|㈜/g, "")
    .replace(/\b(inc|corp|corporation|co|ltd|llc|limited|gmbh|pte)\b\.?/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
  return key || lower;
}

/**
 * Whether an active link is for the same company as a new one: the same mail domain when both have one, else the
 * same company name (shareLinkCompanyKey), as when one of them went to a personal address or a web form. Also true
 * for the key the database keeps one active link per (talent_share_links_target_idx), so a match is never missed.
 */
export function sameShareLinkCompany(
  row: { company_domain: string | null; company_name: string },
  target: { domain: string | null; name: string },
) {
  const indexKey = (domain: string | null, name: string) => (domain ?? name).toLowerCase();
  if (indexKey(row.company_domain, row.company_name) === indexKey(target.domain, target.name)) return true;
  if (row.company_domain && target.domain) return row.company_domain.toLowerCase() === target.domain.toLowerCase();
  const key = shareLinkCompanyKey(target.name);
  return Boolean(key) && shareLinkCompanyKey(row.company_name) === key;
}

/** The key that makes one link per candidate, company and posting (follow-ups reuse it). */
export function shareLinkPostingKey(posting: Pick<ShareLinkPosting, "url" | "title">) {
  const url = String(posting.url ?? "").trim().toLowerCase().replace(/[#?].*$/, "").replace(/\/+$/, "");
  return url || `title:${String(posting.title ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Which language the company reads: the posting's, else the candidate's. */
export function shareLinkLanguage(posting: ShareLinkPosting, profile: { locale: "ko" | "en" | null }): "ko" | "en" {
  const sample = `${posting.title} ${posting.description}`.slice(0, 4_000);
  if (sample.trim()) {
    const hangul = (sample.match(/[가-힣]/g) ?? []).length;
    const letters = (sample.match(/[A-Za-z가-힣]/g) ?? []).length;
    return letters && hangul / letters > 0.2 ? "ko" : "en";
  }
  return profile.locale ?? "en";
}

export const shareLinkYearMonth = (value: string | null) => (value ? value.slice(0, 7).replace("-", ".") : null);

/** "Role · Company · 2021.03 – now", newest three. */
export function careerLines(
  experiences: Array<{ role: string | null; company: string | null; start: string | null; end: string | null }>,
  language: "ko" | "en"
) {
  const now = language === "ko" ? "현재" : "now";
  return experiences.filter((item) => item.role || item.company).slice(0, 3).map((item) => {
    const period = [
      shareLinkYearMonth(item.start),
      item.end ? shareLinkYearMonth(item.end) : item.start ? now : null,
    ].filter(Boolean).join(" – ");
    return [item.role, item.company, period].filter(Boolean).join(" · ");
  });
}

/**
 * 후보자 아웃리치 에이전트 (#5): the shapes every part shares (tables in 20261117140000_gtm_agent.sql). Pure.
 *
 * One person row (gtm_agent_people) walks: found → excluded | no_fit | matched → drafted → (approved) → sent
 * → replied | ended (or skipped / failed). Contact is email only (Shaun 11/17).
 */

/**
 * Where the person was discovered (Shaun 11/17: the source is the place the PERSON was found, by domain): a signal
 * source id from agent/sources.ts (linkedin, x, threads, a developer community, a blog platform), or the page's
 * domain when it is on no known platform.
 */
export type AgentSource = string;

import { defaultChannelSettings, type AgentFoundAs, type AgentIntent, type AgentOffer, type ChannelSettings } from "./channels";
import { DEFAULT_SEND_WEEKDAYS } from "./sendTiming";
import { DEFAULT_REPLY_AGENT_ENABLED } from "./settingsFields";
import type { SignalMethod } from "./signals";
import { normalizeSignalSettings, type SignalSettings } from "./tuning";

/**
 * How the agent got to the person: applicant = uploaded LinkedIn Recruiter "Apply starters" file; db = Harper's
 * purchased candidate DB (agent/dbSource.server.ts, 11/23); request = they asked on Harper's job page for similar
 * postings ("비슷한 공고 추천받기", agent/request.ts, 11/24); otherwise the search method (signals.ts):
 * open_to_work_profile, signal_post, layoff_company.
 */
export type AgentMethod = "applicant" | "db" | "request" | SignalMethod;
export const AGENT_METHODS: readonly AgentMethod[] = ["applicant", "db", "request", "open_to_work_profile", "signal_post", "layoff_company"];

/**
 * Where the address came from: import (the applicant file or the DB), post (their own page), lookup (the paid email
 * lookup), self (they typed it themselves on Harper's job page: a request).
 */
export type AgentEmailSource = "import" | "post" | "lookup" | "self";

/**
 * A request from Harper's job page (gtm_agent_people.request, method 'request'): the posting they looked at (the
 * seed), what they left (a CV read in memory and never stored as a file, a LinkedIn URL, or both), and the record of
 * their consent. Written by the request route (src/app/api/official-jobs/similar-request), read by agent/request.server.ts.
 */
export type AgentJobPageRequest = {
  officialJobId: string;
  slug: string;
  /** company_roles.role_id of the posting (null for a posting of several companies). */
  roleId: string | null;
  kind: "role" | "bundle" | "closed";
  companyName: string;
  roleTitle: string;
  seniority: string | null;
  location: string | null;
  /** cv: a CV only; linkedin: a LinkedIn URL only; both. */
  material: "cv" | "linkedin" | "both";
  locale: "ko" | "en";
  /** sha256 of the visitor's IP (per-IP rate limit), never the IP itself. */
  ipHash: string | null;
  /** The /jobs visitor id (rememberOfficialJobsLanding), for attribution. */
  lid: string | null;
  consentVersion: string;
  consentAt: string;
  /** Over a rate limit when it came in: kept as the marker the next requests are counted against, never mailed. */
  rateLimited?: boolean;
  /** The LinkedIn read gave nothing about them: the mail says it picked from the posting alone. */
  readFailed?: boolean;
  /** The facts step ran (name, headline, company and location read from what they gave). */
  factsRead?: boolean;
  /** The seed as an English mail names it (written by the facts step on an English request). */
  mailCompany?: string | null;
  mailTitle?: string | null;
  /**
   * Checks that found no posting to send (agent/request.ts REQUEST_RECHECK_DAYS): the row waits, found, and is looked at
   * again; counted apart from a failed step's attempts (gtm_agent_people.attempts).
   */
  checks?: number;
  lastCheckedAt?: string | null;
  /** When the CV's or profile's text was cleared on an opt-out (agent/request.ts requestContentCleared). */
  clearedAt?: string | null;
};

export type AgentChannel = "email";

export type AgentStatus =
  | "found" | "excluded" | "no_fit" | "matched" | "drafted" | "approved" | "sent" | "skipped" | "replied" | "ended"
  | "failed";

/** Why a person was not contacted (exclude_reason). */
export type AgentExcludeReason =
  | "member" // already a Harper member: no #5 mail (Shaun 11/17)
  | "recent_contact" // a #4 / #5 mail to the same person within 30 days
  | "quiet_after_end" // ended within quiet_days_after_end (90)
  | "suppressed" // opted out, bounced or complained (shared suppression list)
  | "internal" // Harper staff or test address
  | "duplicate" // the same person again in this run
  | "stale_signal" // the post or profile is older than SIGNAL_MAX_AGE_DAYS (30 days)
  | "not_job_seeking" // a recruiter, a company account, or no clear intent to move
  | "blocked_company" // their address or current company is on Ops' blocked domains (recruiting platforms, search firms)
  // Email only: no personal address the agent may mail, and why (agent/emailLookup.ts noEmailReason):
  | "no_lookup_source" // found by a search with no profile or own link to look an address up from
  | "lookup_not_found" // the paid email lookup ended without an address the agent may use
  | "lookup_other_person" // the paid email lookup's address belongs to someone else (not the person's own page)
  | "lookup_skipped" // found by a search, its job-seeking signal not clear enough to pay for a lookup (Shaun 11/18)
  | "no_email" // the rest: an applicant file row without an address, a lookup that never started
  | "no_mx" // the address's domain takes no mail (no MX record): checked before a DB address is used (11/23)
  | "giver"; // helps or hires (a hiring founder or lead, a recruiter, a coach or mentor, an event host): kept for the company side, never mailed a candidate's offer (Shaun 11/23)

/** Which kind of giver (gtm_agent_people.giver_kind). */
export type AgentGiverKind = "hiring_leader" | "recruiter" | "coach" | "event_host";
export const AGENT_GIVER_KINDS: readonly AgentGiverKind[] = ["hiring_leader", "recruiter", "coach", "event_host"];

export type AgentPostingKind = "external" | "customer";

/** One of the 2-3 postings a mail proposes. */
export type AgentPosting = {
  kind: AgentPostingKind;
  /** company_roles.role_id (an external posting's Role too); null only for a posting known by URL alone. */
  roleId: string | null;
  url: string | null;
  companyName: string;
  title: string;
  location: string | null;
  /** One line, in the mail's language: why this posting fits this person. */
  why: string;
  /**
   * The company and title as an English mail shows them, when they are written in Korean (11/18 evaluation: English
   * mails listed Korean titles as they were). Written by the frame writer (postingFrame.server.ts) and the mail writer
   * (compose.server.ts); missing on Korean mails.
   */
  mailCompany?: string | null;
  mailTitle?: string | null;
  /** The place as an English mail shows it, when it is written in Korean ("서울" → "Seoul"); the same writers give it. */
  mailPlace?: string | null;
  /**
   * The reason in the 후보자 링크 frame (Shaun 11/17): one sentence "what the company needs → the person's experience →
   * so they fit", and up to 3 "필요 → 경험" lines (postingFrame.ts). Missing on postings picked before it existed.
   */
  summary?: string | null;
  fit?: string[];
  /**
   * The matcher's fit when it picked the posting (Career's ranking score over its four metrics on the full JD, 0-100;
   * a blocking conflict pulls it down hard), with the metrics themselves. Missing on postings picked before it was kept.
   */
  score?: number | null;
  scoreParts?: AgentPostingScoreParts | null;
  /** The separate grader's read, right after the pick (agent/review.ts). Missing when it did not run or its call failed. */
  review?: AgentPostingReview | null;
  /** Ops's own call on /ops (맞음 / 안 맞음), the latest click. */
  verdict?: AgentPostingVerdict | null;
};

/**
 * One event a general mail proposes (agent/events.server.ts, 11/23): a meetup, conference, workshop or webinar in the
 * person's field, online or in their city, within EVENT_MAX_DAYS. Dropped before sending once it has started.
 */
export type AgentOfferEvent = {
  title: string;
  /** The event's own page. */
  url: string;
  /** When it starts and ends (ISO; a date alone when the page gives no time). */
  startsAt: string;
  endsAt: string | null;
  /** Where (city, venue), null when online only. */
  place: string | null;
  online: boolean;
  organizer: string | null;
  /** One line, in the mail's language: why it fits this person. */
  why: string;
};

/** Career's four fit metrics (0-100, rounded) for one posting. */
export type AgentPostingScoreParts = { mutualFit: number; candidateInterest: number; companyInterest: number; constraintPass: number };

/** good = 잘 맞음, unsure = 애매, poor = 안 맞음. */
export type AgentPostingGrade = "good" | "unsure" | "poor";

export type AgentPostingReview = { grade: AgentPostingGrade; /** One short Korean sentence. */ reason: string; at: string };

/** right = 맞음, wrong = 안 맞음; by = the Ops user id. */
export type AgentPostingVerdict = { value: "right" | "wrong"; by: string; at: string };

/** What the agent knows about a person before matching (from the import or the post). */
export type AgentPersonInput = {
  /** Their name as written, or "@<handle>" when their page shows only a nickname or handle (profile.ts storedPersonName). */
  name: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  profileUrl: string | null;
  profileText: string | null;
  signalText: string | null;
  signalUrl: string | null;
  signalAt: string | null;
  /**
   * Where they said they can work, in their words, in a reply to Ashley (her find_similar_roles); only for that search.
   * Matching reads it with `location` as a nonnegotiable condition (match.ts workLocationCondition).
   */
  replyWorkLocation?: string | null;
  /** The mail's language when the source knew it (the purchased DB's Korean people); else matching reads their text. */
  language?: "ko" | "en" | null;
  /**
   * How the agent got to them, when the reader has it: a request (method 'request') changes what the picker, the
   * grader and the frame writer read (match.ts personFacts: their CV and the posting they asked from).
   */
  method?: AgentMethod;
};

export type AgentEventKind =
  | "found" | "excluded" | "no_fit" | "matched" | "drafted" | "approved" | "rejected" | "sent" | "skipped" | "expired"
  | "clicked" | "signed_up" | "replied" | "unsubscribed" | "bounced" | "followup_sent" | "ended" | "failed" | "note"
  | "email_lookup" | "profile";

/** One line of a person's timeline (gtm_agent_people.events). by: "agent", or the Ops user id. */
/** postings: the posting URLs a line is about (Ashley's similar roles; sign-up puts them in 내 기회, signupMove.ts). */
export type AgentEvent = { at: string; kind: AgentEventKind; by: string; note?: string | null; postings?: string[] };

/**
 * Why a lookup gave no address the agent may use (agent/emailLookup.ts), null when it did: not_found (no source ties
 * an address to the person), github (a GitHub address or page), vendor_source (a people-data resale site or personal
 * social media), no_source, page_unreadable, not_on_page (the address is not on its source page), other_person (the
 * page does not show the person's name with an employer or school, or is not their own page), work_address (only a
 * company address, which the agent does not mail), timeout, failed, start_failed.
 */
export type AgentEmailLookupReason =
  | "not_found" | "github" | "vendor_source" | "no_source" | "page_unreadable" | "not_on_page" | "other_person"
  | "work_address" | "timeout" | "failed" | "start_failed";

/**
 * Which check an other_person address failed (agent/emailLookup.ts verifyLookup), so Ops can see why it was not used:
 * other_addresses (the page lists other people's addresses and is not the person's own), not_near (their name or
 * handle is not next to the address), other_name_near (another person's name is next to it), name_missing (the page
 * does not show their name, or their handle on their own page), no_org_not_own (no employer or school the agent knows
 * for them is on the page, and it is not their own page).
 */
export type AgentEmailLookupCheck = "other_addresses" | "not_near" | "other_name_near" | "name_missing" | "no_org_not_own";

/**
 * A paid email lookup for a person without an address the agent may mail (gtm_agent_people.email_lookup). It runs
 * across dispatcher ticks: started (state running, the Exa Agent run id), looked at once a tick, done when it ends.
 * The address itself is kept only when it is used (gtm_agent_people.email, email_source 'lookup').
 */
export type AgentEmailLookup = {
  runId: string | null;
  startedAt: string;
  state: "running" | "done";
  finishedAt?: string | null;
  costUsd?: number;
  /** The address passed the checks (on its source page, with the person's name and an employer, school or own page). */
  verified?: boolean;
  /** Whether the address was used for the person (verified and one the agent may mail). */
  used?: boolean;
  emailKind?: "work" | "personal" | "unknown" | "none" | null;
  sourceUrl?: string | null;
  reason?: AgentEmailLookupReason | null;
  /** For other_person: which check failed (older rows have none). */
  failedCheck?: AgentEmailLookupCheck | null;
  /** What the spend log got when the lookup started (its estimate); the rest is logged when it ends (agent/spend.ts). */
  reservedUsd?: number;
};

/** gtm_agent_settings, as the code and /ops #5 read it. */
export type AgentSettings = {
  enabled: boolean;
  senderName: string | null;
  /** chris@matchharper.com by default (as #1 and #4), changeable on /ops #5 (e.g. a separate first-contact domain). */
  senderEmail: string | null;
  dailyMailCap: number;
  dailyCostUsd: number;
  /** Korea time: mails go out only from start (inclusive) to end (exclusive), on sendWeekdays (agent/sendTiming.ts). */
  sendStartHour: number;
  sendEndHour: number;
  /** Korea-time weekdays mails may go out on, 0 = Sunday … 6 = Saturday (Monday to Friday by default). */
  sendWeekdays: number[];
  followupDays: number;
  quietDaysAfterEnd: number;
  /** A person without an address the agent may mail gets a paid email lookup (about $0.12) before being excluded. */
  /** 사람 찾기: per-source on/off, daily count and search tuning, the open-web share and blocked domains. */
  signals: SignalSettings;
  /** Ashley answers replies (agent/settingsFields.ts). */
  replyAgentEnabled: boolean;
  /** The Slack user a reply is handed to (@mention in the reply alert's thread); null when none is set. */
  handoffSlackUserId: string | null;
  /** The new channels' on/off and daily max (agent/channels.ts, 11/23). */
  channels: ChannelSettings;
  /** Goes up by one on every save; each person is tagged with the version that found them (compare by version). */
  version: number;
  updatedAt: string | null;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  senderName: "Ashly",
  senderEmail: "chris@matchharper.com",
  dailyMailCap: 30,
  dailyCostUsd: 100,
  sendStartHour: 9,
  sendEndHour: 21,
  sendWeekdays: [...DEFAULT_SEND_WEEKDAYS],
  followupDays: 7,
  quietDaysAfterEnd: 90,
  signals: normalizeSignalSettings({}).settings,
  replyAgentEnabled: DEFAULT_REPLY_AGENT_ENABLED,
  handoffSlackUserId: null,
  channels: defaultChannelSettings(),
  version: 1,
  updatedAt: null,
};

/** A person row as the code reads it (gtm_agent_people, camelCase). */
export type AgentPerson = AgentPersonInput & {
  id: string;
  runId: string | null;
  source: AgentSource;
  method: AgentMethod;
  /** The settings version the agent ran with when it found the person, and the source's search tuning version. */
  settingsVersion: number | null;
  tuningVersion: string | null;
  /**
   * The 설정 묶음 (agent/config.ts) the person was found or uploaded with, and the one their first mail was written with
   * (null before it was kept, and until the mail is written).
   */
  configId: string | null;
  mailConfigId: string | null;
  /** A link the person wrote on their own page (site, GitHub, portfolio). */
  contactUrl: string | null;
  /**
   * The search's judge on the person (null for uploaded applicants and people found before they were kept): how clear
   * and recent the job-seeking signal is, and how likely 2 of Harper's open postings fit them (0-100 each).
   */
  signalScore: number | null;
  matchScore: number | null;
  /** The query family and the query that found them (signals.ts): later runs score the queries by what came of them. */
  searchGroup: string | null;
  searchQuery: string | null;
  personKey: string;
  status: AgentStatus;
  excludeReason: AgentExcludeReason | null;
  postings: AgentPosting[];
  /**
   * The first mail's offer (agent/channels.ts): posting, coaching or general; null before it was kept (a posting
   * mail). "posting_post" is an old value, read as posting.
   */
  messageKind: AgentOffer | "posting_post" | null;
  /** The events the first mail proposes (general mails only; [] otherwise). */
  offerEvents: AgentOfferEvent[];
  /** Why they wrote, as the judge read it (null: uploaded or found before it was kept, read as job seeking). */
  intent: AgentIntent | null;
  /** Author or commenter of the page that found them (null: not kept, read as the author). */
  foundAs: AgentFoundAs | null;
  /** The row they came from in Harper's own data ("candid:<id>" for the purchased DB); null otherwise. */
  sourceRef: string | null;
  /** Which kind of giver (excludeReason "giver"); null otherwise. */
  giverKind: AgentGiverKind | null;
  reason: string | null;
  channel: AgentChannel | null;
  email: string | null;
  emailSource: AgentEmailSource | null;
  /** A job-page request's facts (method 'request'); null for everyone else. */
  request: AgentJobPageRequest | null;
  /** The email lookup for this person, when one was started (null: none). */
  emailLookup: AgentEmailLookup | null;
  language: "ko" | "en" | null;
  draftSubject: string | null;
  draftBody: string | null;
  mailId: string | null;
  followupMailId: string | null;
  sentBy: string | null;
  sentAt: string | null;
  skipReason: string | null;
  repliedAt: string | null;
  followupDueAt: string | null;
  endedAt: string | null;
  costUsd: number;
  /** Tries of a step that failed for a passing reason (a lookup that did not start, a model error), and when the next may run. */
  attempts?: number;
  retryAt?: string | null;
  isTest: boolean;
  events: AgentEvent[];
  createdAt: string;
  updatedAt: string;
};

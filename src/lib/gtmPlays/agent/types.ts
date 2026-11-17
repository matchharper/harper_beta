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

import { DEFAULT_SEND_WEEKDAYS } from "./sendTiming";
import type { SignalMethod } from "./signals";
import { normalizeSignalSettings, type SignalSettings } from "./tuning";

/**
 * How the agent got to the person: applicant = uploaded LinkedIn Recruiter "Apply starters" file; otherwise the
 * search method (signals.ts): open_to_work_profile, signal_post, layoff_company.
 */
export type AgentMethod = "applicant" | SignalMethod;
export const AGENT_METHODS: readonly AgentMethod[] = ["applicant", "open_to_work_profile", "signal_post", "layoff_company"];

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
  | "stale_signal" // the post is older than 14 days
  | "not_job_seeking" // a recruiter, a company account, or no clear intent to move
  | "no_email"; // email only (Shaun 11/17): no personal address the agent may mail

export type AgentPostingKind = "external" | "customer" | "gtm";

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
   * The reason in the 후보자 링크 frame (Shaun 11/17): one sentence "what the company needs → the person's experience →
   * so they fit", and up to 3 "필요 → 경험" lines (postingFrame.ts). Missing on postings picked before it existed.
   */
  summary?: string | null;
  fit?: string[];
};

/** What the agent knows about a person before matching (from the import or the post). */
export type AgentPersonInput = {
  name: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  profileUrl: string | null;
  profileText: string | null;
  signalText: string | null;
  signalUrl: string | null;
  signalAt: string | null;
};

export type AgentEventKind =
  | "found" | "excluded" | "no_fit" | "matched" | "drafted" | "approved" | "rejected" | "sent" | "skipped" | "expired"
  | "clicked" | "signed_up" | "replied" | "unsubscribed" | "bounced" | "followup_sent" | "ended" | "failed" | "note"
  | "email_lookup";

/** One line of a person's timeline (gtm_agent_people.events). by: "agent", or the Ops user id. */
export type AgentEvent = { at: string; kind: AgentEventKind; by: string; note?: string | null };

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
  /** A link the person wrote on their own page (site, GitHub, portfolio). */
  contactUrl: string | null;
  personKey: string;
  status: AgentStatus;
  excludeReason: AgentExcludeReason | null;
  postings: AgentPosting[];
  messageKind: "posting" | "posting_post" | null;
  reason: string | null;
  channel: AgentChannel | null;
  email: string | null;
  emailSource: "import" | "post" | "lookup" | null;
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
  replyText: string | null;
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

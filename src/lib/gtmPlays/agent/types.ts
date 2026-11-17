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
  | "clicked" | "signed_up" | "replied" | "unsubscribed" | "bounced" | "followup_sent" | "ended" | "failed" | "note";

/** One line of a person's timeline (gtm_agent_people.events). by: "agent", or the Ops user id. */
export type AgentEvent = { at: string; kind: AgentEventKind; by: string; note?: string | null };

/** approve: every mail waits for an Ops approval; auto: mails go out within the hours and caps. */
export type AgentSendMode = "approve" | "auto";

/** gtm_agent_settings, as the code and /ops #5 read it. */
export type AgentSettings = {
  enabled: boolean;
  senderName: string | null;
  /** chris@matchharper.com by default (as #1 and #4), changeable on /ops #5 (e.g. a separate first-contact domain). */
  senderEmail: string | null;
  dailyMailCap: number;
  dailyCostUsd: number;
  /** Korea time: mails go out only from start (inclusive) to end (exclusive). */
  sendStartHour: number;
  sendEndHour: number;
  sendMode: AgentSendMode;
  followupDays: number;
  quietDaysAfterEnd: number;
  ownDomainAllowed: boolean;
  /** 사람 찾기: per-source on/off, daily count and search tuning, the open-web share and blocked domains. */
  signals: SignalSettings;
  /** Goes up by one on every save; each person is tagged with the version that found them (compare by version). */
  version: number;
  updatedAt: string | null;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  senderName: "Chris Heo",
  senderEmail: "chris@matchharper.com",
  dailyMailCap: 30,
  dailyCostUsd: 100,
  sendStartHour: 8,
  sendEndHour: 21,
  sendMode: "auto",
  followupDays: 7,
  quietDaysAfterEnd: 90,
  ownDomainAllowed: true,
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
  isTest: boolean;
  events: AgentEvent[];
  createdAt: string;
  updatedAt: string;
};

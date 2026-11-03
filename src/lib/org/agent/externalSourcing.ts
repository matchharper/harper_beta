/**
 * External candidate sourcing: people outside Harper found from public profiles for one Role.
 * The Worker (harper_worker opp/external_sourcing) runs the search; this module holds the
 * company-side contract: who may start a run, the cost limits, and the model-facing text.
 * Pure: no database or network access.
 */
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { externalInviteSendingEnabled } from "./externalInvite";

export const EXTERNAL_SOURCING_TOOL_NAMES = ["request_external_search", "read_external_candidates", "contact_external_candidate"] as const;
export type ExternalSourcingTrigger = "company_request" | "harper_suggestion" | "agent_initiative";

/** Workspaces where the capability is offered: ORG_EXTERNAL_SOURCING_WORKSPACE_IDS (comma list, or *). Empty = off. */
export function externalSourcingEnabledFor(workspaceId: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  const raw = (env.ORG_EXTERNAL_SOURCING_WORKSPACE_IDS ?? "").trim();
  if (!raw || !workspaceId) return false;
  const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
  return ids.includes("*") || ids.includes(workspaceId);
}

function intEnv(env: Record<string, string | undefined>, name: string, fallback: number) {
  const value = Number.parseInt(env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Each run costs about $1 to $4. These limits are enforced in code, whatever the model asks for. */
export function externalSourcingLimits(env: Record<string, string | undefined> = process.env) {
  return {
    // runs a workspace may start in 24 hours (the company's requests; Harper never starts one on its own)
    workspaceDaily: intEnv(env, "ORG_EXTERNAL_SOURCING_DAILY_LIMIT", 1),
  };
}

export type ExternalSourcingHistory = {
  activeRunId: string | null;
  workspaceRunsLast24h: number;
};

export type ExternalSourcingDecision =
  | { allowed: true }
  | { allowed: false; status: "already_running"; runId: string }
  | { allowed: false; status: "not_queued"; reason: "not_enabled" | "daily_limit" | "company_request_only" };

/**
 * Pure gate: the trigger is forced to agent_initiative for Harper-initiated (background) turns by the caller.
 * Harper never starts a search on its own; it offers one and the company asks for it.
 */
export function decideExternalSourcing(args: {
  enabled: boolean; trigger: ExternalSourcingTrigger; history: ExternalSourcingHistory; now: Date;
  limits: ReturnType<typeof externalSourcingLimits>;
}): ExternalSourcingDecision {
  if (!args.enabled) return { allowed: false, status: "not_queued", reason: "not_enabled" };
  if (args.trigger === "agent_initiative") return { allowed: false, status: "not_queued", reason: "company_request_only" };
  if (args.history.activeRunId) return { allowed: false, status: "already_running", runId: args.history.activeRunId };
  if (args.history.workspaceRunsLast24h >= args.limits.workspaceDaily) return { allowed: false, status: "not_queued", reason: "daily_limit" };
  return { allowed: true };
}

export function parseExternalSourcingTrigger(value: unknown, harperInitiated: boolean): ExternalSourcingTrigger {
  if (harperInitiated) return "agent_initiative";
  return value === "harper_suggestion" ? "harper_suggestion" : "company_request";
}

// ---- model-facing text --------------------------------------------------------------------

function cell(value: unknown, max = 300) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? (text.length > max ? `${text.slice(0, max - 1)}…` : text) : "-";
}

const UNAVAILABLE_MEANING: Record<string, string> = {
  not_enabled: "External search is not offered to this workspace.",
  daily_limit: "The workspace reached its external search limit for the last 24 hours.",
  company_request_only: "Harper does not start an external search on its own; offer it to the company, which can ask for one.",
};

export function formatExternalSearchRequestResult(result: {
  status: string; runId?: string | null; roleName?: string; trigger?: string; reason?: string;
}) {
  const lines = [`status=${cell(result.status, 40)}`, `role=${cell(result.roleName, 200)}`];
  if (result.runId) lines.push(`run_id=${result.runId}`);
  if (result.trigger) lines.push(`trigger=${result.trigger}`);
  if (result.status === "queued") {
    lines.push("result_meaning=An external search is queued. It looks for people outside Harper on public profiles and usually takes several minutes. The outcome is shared separately when it finishes; nobody is contacted.");
  } else if (result.status === "already_running") {
    lines.push("result_meaning=An external search for this Role is already queued or running. No new search was started; its outcome is shared when it finishes.");
  } else {
    lines.push(`unavailable_reason=${cell(result.reason, 60)}`, `result_meaning=No search was started. ${UNAVAILABLE_MEANING[result.reason ?? ""] ?? ""}`.trim());
  }
  return lines.join("\n");
}

export type ExternalContactRow = {
  status: string; email_kind: string | null; source_kind: string | null; finished_at: string | null;
};
export type ExternalIntroRow = {
  status: string; created_at: string; intro_recipient_emails?: string[] | null; invited_at?: string | null;
  opened_at?: string | null; last_reply_at?: string | null; reply_type?: string | null; error_code?: string | null;
  accepted_at?: string | null; connected_at?: string | null;
};
export type ExternalCandidateRow = {
  id: string; name: string | null; headline: string | null; current_company: string | null; location: string | null;
  linkedin_url: string | null; career_lines: unknown; evidence: unknown; verdict: unknown; rank: number | null;
  company_decision: string | null; contact?: ExternalContactRow | null; intro?: ExternalIntroRow | null;
};

const NOT_SENDABLE_MEANING: Record<string, string> = {
  no_email_found: "no email address could be tied to this person",
  email_lookup_failed: "the email lookup failed",
  address_removed: "the address was removed",
  opted_out: "this address opted out of Harper's messages",
  harper_member: "the address belongs to a Harper member",
  recently_invited: "this person got another invitation from Harper in the last 14 days",
  role_not_active: "the Role is not active",
  person_removed: "the person's record was removed",
  test_recipients_only: "invitations are limited to Harper's test addresses for now",
};

/** Connection request state for the company side: what was actually sent and answered. */
export function externalIntroStatus(intro: ExternalIntroRow | null | undefined, sending = externalInviteSendingEnabled()) {
  if (!intro) return "no connection request";
  const requested = `connection requested ${formatLlmDateTime(intro.created_at)}`;
  switch (intro.status) {
    case "requested":
    case "sending":
      return sending
        ? `${requested}; the invitation email goes out automatically once an address is found (09:00-20:00 KST); not sent yet`
        : `${requested}; the person has not been contacted (invitation emails are turned off for now)`;
    case "invited":
      return intro.opened_at
        ? `${requested}; invitation emailed ${formatLlmDateTime(intro.invited_at)}; first opened ${formatLlmDateTime(intro.opened_at)} (open tracking is approximate); no reply yet`
        : `${requested}; invitation emailed ${formatLlmDateTime(intro.invited_at)}; no reply yet`;
    case "replied":
      return `${requested}; the person replied ${formatLlmDateTime(intro.last_reply_at)} (${intro.reply_type ?? "unread"})`;
    case "declined":
      return `${requested}; the person declined ${formatLlmDateTime(intro.last_reply_at)}`;
    case "unsubscribed":
      return `${requested}; the person asked not to be contacted again`;
    case "bounced":
      return `${requested}; the invitation was not delivered (${intro.error_code ?? "bounced"}); Harper will not email this address again`;
    case "not_sendable":
      return `${requested}; no invitation was sent: ${NOT_SENDABLE_MEANING[intro.error_code ?? ""] ?? intro.error_code ?? "unknown reason"}`;
    case "accepted":
    case "connecting":
      return `${requested}; the person confirmed the connection ${formatLlmDateTime(intro.accepted_at)} from the invitation's link; Harper is sending the introduction email (To the person, CC the company recipients)`;
    case "connected":
      return `${requested}; connected ${formatLlmDateTime(intro.connected_at)}: the person confirmed and Harper introduced them by email (To the person, CC the company recipients); they continue directly in that thread`;
    case "failed":
      return intro.error_code?.startsWith("connect_")
        ? `${requested}; the person confirmed the connection, but the introduction email could not be sent; nobody received it`
        : `${requested}; sending the invitation failed; nothing was delivered`;
    case "cancelled":
      return `${requested}; cancelled before sending because the company passed; nothing was sent`;
    default:
      return `${requested}; ${intro.status}`;
  }
}

export function formatExternalIntroRequestResult(result: {
  status: string; candidateRef: string; name?: string | null; roleName?: string; companyAppeal?: string | null;
  introRecipientEmails?: string[]; missingInputs?: string[]; intro?: ExternalIntroRow | null;
  inviteSending?: boolean; emailLookup?: string;
}) {
  const lines = [`status=${cell(result.status, 40)}`, `person=${cell(result.name, 120)} (ref ${result.candidateRef})`,
    `role=${cell(result.roleName, 200)}`];
  if (result.companyAppeal) lines.push(`company_appeal=${cell(result.companyAppeal, 2_000)}`);
  if (result.introRecipientEmails?.length) lines.push(`company_recipients=${result.introRecipientEmails.join(", ")}`);
  const sending = result.inviteSending ?? externalInviteSendingEnabled();
  if (result.emailLookup) lines.push(`email_lookup=${result.emailLookup}`);
  if (result.status === "details_required") {
    lines.push(`missing=${(result.missingInputs ?? []).join(", ")}`,
      "result_meaning=Nothing was recorded. Still missing: the company's reason for wanting to meet this person, and the company recipients to CC once the person accepts.");
  } else if (result.status === "confirmation_required") {
    lines.push(sending
      ? "result_meaning=Nothing was recorded or sent yet; this needs the company's explicit confirmation. Plan once confirmed: Harper records the request and emails this person one invitation from Harper's address with the Role, the company's reason above in the company's words, and the company name (left out when the Role hides it). If no address is known yet Harper looks one up first (about $0.12). The person can reply or opt out; Harper tells the company how they answered and does not reply to them on its own. The company recipients are kept for the introduction once the person agrees. The confirmation call reuses this exact plan."
      : "result_meaning=Nothing was recorded yet; this needs the company's explicit confirmation. Plan once confirmed: Harper records the company's request with this reason and these recipients; this person is outside Harper and is not contacted now, because invitation emails are turned off for now. The confirmation call reuses this exact plan.");
  } else if (result.status === "requested") {
    lines.push(sending
      ? "result_meaning=The company's connection request is recorded. Nothing has been sent yet: the invitation email goes out automatically once an address is found, between 09:00 and 20:00 KST. Harper will tell the company if it cannot be sent and when the person replies."
      : "result_meaning=The company's connection request is recorded. The person has not been contacted and does not know about it; invitation emails are turned off for now.");
  } else if (result.status === "no_email") {
    lines.push("result_meaning=Nothing was recorded or sent. The email lookup found no address that a source ties to this person, so Harper cannot invite them.");
  } else if (result.status === "already_requested") {
    lines.push(`request_state=${externalIntroStatus(result.intro)}`, "result_meaning=A request already exists for this person; nothing new was recorded.");
  }
  return lines.join("\n");
}

/** Contact status for the company side. The address itself is never part of it. */
export function externalContactStatus(contact: ExternalContactRow | null | undefined) {
  if (!contact) return "email not looked up";
  if (contact.status === "queued" || contact.status === "running") return "email lookup in progress";
  if (contact.status === "not_found") return "no email found that a source ties to this person";
  if (contact.status === "failed") return "email lookup failed";
  if (contact.status !== "found") return `email lookup ${contact.status}`;
  // Found is not confirmed: only the person's own page showing the address confirms it (self_published).
  const found = `email found (${contact.email_kind || "unknown"} address)`;
  if (contact.source_kind === "self_published") return `${found}; the person's own page shows it, so the address and identity are confirmed`;
  if (contact.source_kind === "data_vendor") return `${found} on a contact-data site; not confirmed as this person's`;
  return `${found}; source unconfirmed: no page Harper read shows this address`;
}

export function formatExternalContactRequestResult(result: {
  status: string; candidateRef: string; name?: string | null; contact?: ExternalContactRow | null; reason?: string;
}) {
  const lines = [`status=${cell(result.status, 40)}`, `person=${cell(result.name, 120)} (ref ${result.candidateRef})`,
    `contact_state=${externalContactStatus(result.contact)}`];
  if (result.status === "queued") {
    lines.push("result_meaning=An email lookup is queued for this person. It takes a few minutes; the outcome is shared when it finishes. Nobody is contacted and the address is never shown.");
  } else if (result.status === "not_queued") {
    lines.push(`unavailable_reason=${cell(result.reason, 60)}`, result.reason === "retry_used"
      ? "result_meaning=No lookup was started: this person's lookup already failed again after its one retry."
      : "result_meaning=No lookup was started.");
  } else {
    lines.push("result_meaning=No new lookup was started; this is the existing state.");
  }
  lines.push("address_visibility=Harper keeps the address for the invitation and the introduction; it is not shown to anyone.");
  return lines.join("\n");
}
export type ExternalRunRow = {
  id: string; status: string; trigger: string; error_code: string | null; created_at: string; finished_at: string | null;
  counts: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Company-safe projection of delivered external people: public career facts, judgement, evidence links.
 * Criterion names are listed once; each person carries `criteria<N>: level`. */
export function projectExternalCandidates(rows: ExternalCandidateRow[]) {
  const criteria: string[] = [];
  for (const row of rows) for (const c of asList(asRecord(row.verdict).criteria)) {
    const name = cell(asRecord(c).name, 120);
    if (name !== "-" && !criteria.includes(name)) criteria.push(name);
  }
  const people = rows.map((row) => {
    const verdict = asRecord(row.verdict);
    const levels = new Map(asList(verdict.criteria).map((c) => [cell(asRecord(c).name, 120), cell(asRecord(c).level, 20)]));
    return {
      ref: row.id,
      info: [row.name, row.headline, row.current_company, row.location].filter(Boolean).join(" · "),
      linkedinUrl: row.linkedin_url ?? "",
      career: asList(row.career_lines).slice(0, 8).map((line) => String(line).replace(/^(경력|학력): /, "")),
      assessment: {
        overall: String(verdict.overall ?? ""),
        fit: typeof verdict.fit === "number" ? verdict.fit : null,
        criteria: criteria.flatMap((name, i) => levels.has(name) ? [`criteria${i + 1}: ${levels.get(name)}`] : []),
        reason: String(verdict.reason ?? ""),
      },
      evidenceLinks: asList(row.evidence).map((e) => `${cell(asRecord(e).criterion, 120)}: ${cell(asRecord(e).url, 500)}`),
      contact: externalContactStatus(row.contact),
      connection: externalIntroStatus(row.intro),
      companyDecision: row.company_decision,
    };
  });
  return { criteria: criteria.map((name, i) => `criteria${i + 1}: ${name}`), people };
}

export type ExternalCriterionFitness = "excellent" | "good" | "uncertain" | "limited" | "conflict";
const FITNESS = new Set<string>(["excellent", "good", "uncertain", "limited", "conflict"]);

/** One shown person for the `/org` screen. No address, page text or quotes. */
export type ExternalExperience = { role: string | null; company: string | null; start: string | null; end: string | null };
export type ExternalEducation = { school: string | null; degree: string | null; start: string | null; end: string | null };

/** Career lines the Worker writes ('경력: title · company · 2021-03 ~ 현재 (…)', '학력: degree · school · 2014~2018'). */
export function parseExternalCareerLines(lines: unknown) {
  const experiences: ExternalExperience[] = [];
  const educations: ExternalEducation[] = [];
  const value = (text: string | undefined) => {
    const trimmed = (text ?? "").trim();
    return trimmed && trimmed !== "-" ? trimmed : null;
  };
  for (const raw of asList(lines)) {
    const line = String(raw ?? "");
    if (line.startsWith("경력: ")) {
      const parts = line.slice(4).split(" · ");
      const period = parts.length >= 3 ? parts.pop() ?? "" : "";
      const company = parts.length >= 2 ? parts.pop() : undefined;
      const range = period.match(/^(\d{4}-\d{2})(?:-\d{2})?\s*~\s*(\d{4}-\d{2}|현재)?/);
      experiences.push({ role: value(parts.join(" · ")), company: value(company),
        start: range?.[1] ?? null, end: range?.[2] && range[2] !== "현재" ? range[2] : null });
    } else if (line.startsWith("학력: ")) {
      const parts = line.slice(4).split(" · ");
      const years = /^\d{4}~(\d{4})?$/.test(parts[parts.length - 1] ?? "") ? parts.pop() ?? "" : "";
      const school = parts.length >= 2 ? parts.pop() : parts.shift();
      const [start, end] = years.split("~");
      educations.push({ school: value(school), degree: value(parts.join(" · ")), start: start || null, end: end || null });
    }
  }
  return { experiences, educations };
}

export type ExternalCandidateView = {
  id: string; name: string; headline: string | null; currentCompany: string | null; location: string | null;
  linkedinUrl: string | null; career: string[]; reason: string;
  experiences: ExternalExperience[]; educations: ExternalEducation[];
  /** content: the judge's supporting excerpt for the criterion, when one is kept. */
  criteria: { name: string; fitness: ExternalCriterionFitness; content: string }[];
  evidence: { criterion: string; url: string }[];
  contact: "none" | "looking" | "found" | "not_found" | "failed";
  contactConfirmed: boolean;
  /** openedAt: first open of the invitation email (approximate; image blocking hides opens). */
  intro: { status: string; requestedAt: string; invitedAt: string | null; openedAt: string | null; replyType: string | null;
    acceptedAt?: string | null; connectedAt?: string | null } | null;
  /** intro_requested | passed; null while the company has not decided. */
  companyDecision: string | null;
  shownAt: string;
};

export type ExternalCandidatesResponse = {
  enabled: boolean;
  /** Whether a confirmed connection request leads to an invitation email (ORG_EXTERNAL_INVITE_SENDING). */
  inviteSending?: boolean;
  search: { status: string; startedAt: string; finishedAt: string | null } | null;
  candidates: ExternalCandidateView[];
};

function httpUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function externalCandidatesForCompany(rows: (ExternalCandidateRow & { created_at: string })[]): ExternalCandidateView[] {
  return rows.map((row) => {
    const verdict = asRecord(row.verdict);
    const contact = row.contact;
    return {
      id: row.id,
      name: row.name?.trim() || "-",
      headline: row.headline, currentCompany: row.current_company, location: row.location,
      linkedinUrl: httpUrl(row.linkedin_url),
      career: asList(row.career_lines).slice(0, 6).map((line) => String(line).replace(/^(경력|학력): /, "")),
      reason: typeof verdict.reason === "string" ? verdict.reason.trim() : "",
      ...parseExternalCareerLines(row.career_lines),
      criteria: asList(verdict.criteria).flatMap((item) => {
        const name = String(asRecord(item).name ?? "").trim();
        const level = String(asRecord(item).level ?? "").trim().toLowerCase();
        const quote = asRecord(item).quote;
        return name ? [{ name, fitness: (FITNESS.has(level) ? level : "uncertain") as ExternalCriterionFitness,
          content: typeof quote === "string" ? quote.replace(/\s+/g, " ").trim().slice(0, 400) : "" }] : [];
      }),
      evidence: asList(row.evidence).flatMap((item) => {
        const url = httpUrl(asRecord(item).url);
        return url ? [{ criterion: String(asRecord(item).criterion ?? "").trim(), url }] : [];
      }),
      contact: !contact ? "none"
        : contact.status === "queued" || contact.status === "running" ? "looking"
        : contact.status === "found" ? "found"
        : contact.status === "not_found" ? "not_found" : "failed",
      contactConfirmed: contact?.status === "found" && contact.source_kind === "self_published",
      intro: row.intro ? { status: row.intro.status, requestedAt: row.intro.created_at,
        invitedAt: row.intro.invited_at ?? null, openedAt: row.intro.opened_at ?? null,
        acceptedAt: row.intro.accepted_at ?? null, connectedAt: row.intro.connected_at ?? null,
        replyType: row.intro.reply_type ?? null } : null,
      companyDecision: row.company_decision,
      shownAt: row.created_at,
    };
  });
}

export function formatExternalCandidatesResult(result: {
  roleName: string; run: ExternalRunRow | null; candidates: ExternalCandidateRow[];
}) {
  if (!result.run) {
    return [`role=${cell(result.roleName, 200)}`, "status=no_external_search",
      "result_meaning=This Role has no finished external search yet."].join("\n");
  }
  const projected = projectExternalCandidates(result.candidates);
  const lines = [
    `role=${cell(result.roleName, 200)}`,
    `run_id=${result.run.id}`,
    `run_status=${result.run.status}${result.run.error_code ? ` (${result.run.error_code})` : ""}`,
    `finished_at=${formatLlmDateTime(result.run.finished_at)}`,
    `shown=${result.candidates.length}`,
    externalInviteSendingEnabled()
      ? "candidate_state=Not Harper members. Found on public profiles only; no consent to anything. Harper contacts a person only after the company confirms a connection request (contact_external_candidate request_intro): one invitation email from Harper. Each person's connection line says what was actually sent and answered."
      : "candidate_state=Not Harper members. Found on public profiles only; not contacted; no consent to anything. Harper can record the company's connection request (contact_external_candidate request_intro); invitation emails are turned off for now. Each person's contact line says whether an email was found.",
    "assessment=overall meet|maybe|no; fit 0-1; criteria levels excellent > good > uncertain (public evidence does not show it) > limited > conflict.",
    ...(projected.criteria.length ? [`criteria: ${projected.criteria.join("; ")}`] : []),
  ];
  projected.people.forEach((p, index) => {
    lines.push(
      `\n## Person ${index + 1} (ref ${p.ref})`,
      `info: ${cell(p.info, 400)}`,
      `linkedin: ${p.linkedinUrl || "-"}`,
      `career:\n${p.career.map((line) => `- ${cell(line, 200)}`).join("\n") || "- (none)"}`,
      `assessment: overall ${p.assessment.overall || "-"}, fit ${p.assessment.fit ?? "-"}; ${p.assessment.criteria.join("; ") || "-"}`,
      `reason: ${cell(p.assessment.reason, 800)}`,
      `outside_evidence:\n${p.evidenceLinks.map((line) => `- ${line}`).join("\n") || "- (none)"}`,
      `contact: ${p.contact}`,
      `connection: ${p.connection}`,
      ...(p.companyDecision === "passed" ? ["company_decision: passed by the company on the Role page"] : []),
    );
  });
  return lines.join("\n");
}

export type ExternalCandidateStatusRow = Pick<ExternalCandidateRow,
  "id" | "name" | "headline" | "current_company" | "company_decision" | "contact" | "intro"> & {
  company_decided_at: string | null; created_at: string;
};

/**
 * The Role's shown external people and where each one stands now, for the company-side LLM's default
 * context. Decisions made on the Role page leave no chat message, so this is how a Pass or a connection
 * request reaches every later turn, including notices.
 */
export function formatExternalCandidateStatuses(args: { people: ExternalCandidateStatusRow[]; total: number }) {
  if (!args.total) return null;
  const listed = args.total > args.people.length ? ` (newest ${args.people.length} listed)` : "";
  const lines = [
    `external_candidates_for_this_role=${args.total} shown${listed}. People outside Harper that external searches showed on this Role's page; the state below is current. read_external_candidates has their profiles and evidence.`,
  ];
  for (const person of args.people) {
    const about = person.headline || person.current_company;
    const who = `${person.name ? cell(person.name, 80) : "(no name)"}${about ? `, ${cell(about, 120)}` : ""}`;
    const state = person.company_decision === "passed"
      ? `the company passed (decided not to proceed) ${formatLlmDateTime(person.company_decided_at)}; Harper sends this person nothing more`
      : person.company_decision === "intro_requested"
        ? externalIntroStatus(person.intro)
        : person.company_decision
          ? `company decision: ${cell(person.company_decision, 40)}`
          : `no company decision yet; ${externalContactStatus(person.contact)}`;
    lines.push(`- ${who} (ref ${person.id}; shown ${formatLlmDateTime(person.created_at)}): ${state}`);
  }
  return lines.join("\n");
}

/** Facts for the company-side LLM when a run finishes (enqueueCompanyUpdate); no wording is prescribed. */
export function externalSearchNoticeFacts(args: { run: ExternalRunRow; roleName: string; candidates: ExternalCandidateRow[] }) {
  return {
    externalSearch: {
      runId: args.run.id, roleName: args.roleName, status: args.run.status, failure: args.run.error_code,
      startedBy: args.run.trigger === "agent_initiative" ? "harper" : "company",
      shown: args.candidates.length,
    },
    externalCandidates: projectExternalCandidates(args.candidates),
    candidateState: {
      harperMembers: false, contacted: false, consent: "none; public profile only",
      email: "looked up for each shown person before this update; each person's contact says whether one was found (the address itself is never shared)",
      invitation: externalInviteSendingEnabled()
        ? "one invitation email from Harper after the company confirms a connection request; a person with no email found cannot be invited"
        : "invitation emails are turned off for now; a connection request is only recorded",
    },
  };
}

/** Facts for the company-side LLM when an email lookup the company asked for finishes. Status only, never the address. */
export function externalContactNoticeFacts(args: { contactId: string; roleName: string; candidate: ExternalCandidateRow }) {
  return {
    externalEmailLookup: {
      contactId: args.contactId, roleName: args.roleName, candidateRef: args.candidate.id,
      person: [args.candidate.name, args.candidate.headline, args.candidate.current_company].filter(Boolean).join(" · "),
      result: externalContactStatus(args.candidate.contact),
    },
    candidateState: { contacted: false, addressShown: false, messagingAvailable: false },
  };
}

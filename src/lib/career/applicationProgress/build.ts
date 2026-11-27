import { CAREER_BROWSER_KEEP_ALIVE_SECONDS } from "../browser/lifetime";
import { browserRunAwaitsEmailLink, browserRunSubmission } from "../browser/submissionReceipt";
import type { CareerForm } from "../forms/schema";
import type {
  CareerApplicationAction,
  CareerApplicationProgress,
  CareerApplicationStatus,
  CareerApplicationStep,
  CareerApplicationSubStep,
} from "./types";

/**
 * Builds the application progress list from plain rows (read.server.ts reads them). Pure, so every rule is testable
 * without a database.
 *
 * A main step's state comes only from facts that never change once written (a run's receipt, when a form was
 * created, an answer), so the percentage cannot go back between polls. State that does change (a browser handed to
 * the person, a form still open) only adds a sub-step or an action.
 */

/** One talent_messages row of a form, its answer or its resolution, with only the JSON paths the builder reads. */
export type ApplicationMessageRow = {
  messageType: string;
  createdAt: string;
  formId?: number | null;
  revision?: number | null;
  /** career_form only. */
  kind?: string | null;
  hidden?: boolean | null;
  relatedRefs?: unknown;
  /** career_form_response only: an itemwise answer does not answer the whole form. */
  itemId?: string | null;
  actionId?: string | null;
  negativeActionId?: string | null;
  /** career_form_response only: the values given for the start form's own items, absent on other forms. */
  submitScope?: unknown;
  saveLogin?: unknown;
  /** The role ids left selected in the start form's postings list (apply_postings). */
  postings?: unknown;
};

/** One talent_external_operations row (browser_session, browser_run or email_send) with only the paths read. */
export type ApplicationOperationRow = {
  id: string;
  kind: string;
  parentId?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  mode?: string | null;
  roleRefs?: unknown;
  startUrl?: string | null;
  opportunityId?: string | null;
  needsUser?: unknown;
  submitted?: string | null;
  verificationCode?: string | null;
  url?: string | null;
  requestedAction?: string | null;
  browserAvailability?: string | null;
  /** browser_run and email_send: the person's message, and the delegated work, it was started for. */
  sourceMessageId?: string | null;
  workId?: string | null;
  /** Set by read.server.ts: the person's Stop ended the request of that message, or that work was cancelled. */
  stopped?: boolean | null;
  /** When that Stop or cancellation happened, when known; else the row's own last update stands for it. */
  stoppedAt?: string | null;
};

/** An open form as read_open_career_forms returns it (its latest revision), with the row's time when known. */
export type ApplicationOpenForm = Pick<CareerForm, "formId" | "revision" | "kind" | "items" | "relatedRefs" | "hidden"> & {
  createdAt?: string | null;
};

export type ApplicationRoleRow = { roleId: string; companyName: string | null; title: string | null; ended: boolean };

/** One of the person's chat messages, with the roles it names (its role mentions). */
export type ApplicationRequestRow = { createdAt: string; roleIds: readonly string[] };

export type CareerApplicationProgressInput = {
  now: Date;
  messages: readonly ApplicationMessageRow[];
  operations: readonly ApplicationOperationRow[];
  openForms: readonly ApplicationOpenForm[];
  roles?: readonly ApplicationRoleRow[];
  /**
   * When Harper's running turn in this conversation started, if one runs. A run that stopped during that turn is not
   * a failure yet: the same turn reads its receipt and retries or asks (else the panel flashes "failed" first).
   */
  turnStartedAt?: string | null;
  /** Harper's turn here is parked until the person replies in chat (its checkpoint asked them something). */
  waitingForReply?: boolean;
  /** Browsers a Stop queued to close (a cleanup not done yet): they count as closed already. */
  closingBrowserSessionIds?: readonly string[];
  /**
   * The person's messages after a Stop that name an application, leaving out those a Stop ended: asking about a
   * stopped application (the panel's "이어서 하기" names it) picks it up again. Harper's turn alone does not.
   */
  requests?: readonly ApplicationRequestRow[];
};

export const CAREER_APPLICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;
// A safety bound only: the panel's counts and rows must cover every application one batch can start (16 in the
// 11/26 real run), so the bound sits well above that.
export const CAREER_APPLICATION_LIMIT = 50;
/** A record this recent may still be followed by Harper's next turn (queued, not started yet), so it is not a pause. */
const PAUSE_GRACE_MS = 3 * 60 * 1000;
const KEEP_ALIVE_MS = CAREER_BROWSER_KEEP_ALIVE_SECONDS * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_RUN = new Set(["reserved", "preparing", "dispatching", "running", "capacity_wait", "cancelling"]);
const ACTIVE_SEND = new Set(["reserved", "preparing", "dispatching"]);
/** The item types a person fills in (getCareerFormInitialValues); markdown and unknown types only display. */
const INPUT_TYPES = new Set(["text", "textarea", "change", "select", "multiselect", "checkbox", "consent", "document"]);
/** Items of the start form of delegated applications (handbooks/application.ts, shareLinks/formGuard.ts). */
const START_ITEMS = new Set(["submit_scope", "save_login", "apply_postings"]);

const time = (value?: string | null) => (value ? Date.parse(value) : Number.NaN);
const iso = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
};
const byCreated = <T extends { createdAt: string }>(a: T, b: T) => time(a.createdAt) - time(b.createdAt);
const known = (values: (string | undefined | null)[]) =>
  values.filter((value): value is string => Boolean(value) && Number.isFinite(time(value)));
const latestTime = (values: (string | undefined | null)[]) => known(values).sort((a, b) => time(b) - time(a))[0];
const earliestTime = (values: (string | undefined | null)[]) => known(values).sort((a, b) => time(a) - time(b))[0];
const present = (value: unknown) => value !== undefined && value !== null;

function refsOf(value: unknown): { type: string; id: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((ref) => {
    const item = ref as { type?: unknown; id?: unknown } | null;
    return item && typeof item.type === "string" && typeof item.id === "string" ? [{ type: item.type, id: item.id }] : [];
  });
}

/** Roles first; a form tied only to an opportunity is tracked by that opportunity. */
function applicationIdsOf(refs: { type: string; id: string }[]) {
  const roles = refs.filter((ref) => ref.type === "role" && UUID.test(ref.id)).map((ref) => ref.id);
  if (roles.length) return { ids: [...new Set(roles)], kind: "role" as const };
  return { ids: [...new Set(refs.filter((ref) => ref.type === "opportunity" && UUID.test(ref.id)).map((ref) => ref.id))], kind: "opportunity" as const };
}

const roleIdsOf = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && UUID.test(id)))] : [];

const SITE_NAMES: [RegExp, string][] = [
  [/(^|\.)wanted\.(co\.kr|jobs)$/, "원티드"],
  [/(^|\.)jobkorea\.co\.kr$/, "잡코리아"],
  [/(^|\.)saramin\.co\.kr$/, "사람인"],
  [/(^|\.)(rememberapp|remember)\.co\.kr$/, "리멤버"],
  [/(^|\.)rallit\.com$/, "랠릿"],
  [/(^|\.)ninehire\.(site|com)$/, "나인하이어"],
  [/(^|\.)greetinghr\.com$/, "그리팅"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)greenhouse\.io$/, "Greenhouse"],
  [/(^|\.)lever\.co$/, "Lever"],
  [/(^|\.)ashbyhq\.com$/, "Ashby"],
  [/(^|\.)(myworkdayjobs|myworkdaysite|workday)\.com$/, "Workday"],
  [/(^|\.)jobstreet\.com$/, "JobStreet"],
  [/(^|\.)seek\.com(\.au)?$/, "SEEK"],
  [/(^|\.)upwork\.com$/, "Upwork"],
];
const hostOf = (url?: string | null) => {
  try { return url ? new URL(url).hostname.toLowerCase() : undefined; } catch { return undefined; }
};
/** A known job site's name, else the starting page's host: runs keep URLs, not site names. */
function siteOf(run: { url?: string | null; startUrl?: string | null }) {
  for (const host of [hostOf(run.url), hostOf(run.startUrl)]) {
    const site = host && SITE_NAMES.find(([pattern]) => pattern.test(host));
    if (site) return site[1];
  }
  return (hostOf(run.startUrl) ?? hostOf(run.url))?.replace(/^www\./, "");
}

type FormView = {
  formId: number;
  createdAt: string;
  open: boolean;
  questions: number;
  knownStart: boolean;
  answer?: { at: string; negative: boolean };
  resolvedAt?: string;
};

/** closing: a Stop queued this browser's cleanup, so it closes without waiting for anyone. */
type SessionView = { status: string; requestedAction?: string | null; browserAvailability?: string | null; closing: boolean };

type RunView = {
  id: string;
  sessionId?: string;
  mode: "prepare" | "execute";
  status: string;
  createdAt: string;
  updatedAt: string;
  needsUser: boolean;
  submitted: "yes" | "no" | "unclear" | null;
  awaitsCode: boolean;
  awaitsLink: boolean;
  /** Set when the person stopped it: that Stop's time (or the run's last update, when not known). */
  stoppedAt?: string;
  site?: string;
  session?: SessionView;
  latestOnSession: boolean;
};

type SendView = { id: string; status: string; createdAt: string; updatedAt: string; stoppedAt?: string };

const stoppedAtOf = (row: ApplicationOperationRow) => (row.stopped === true ? row.stoppedAt || row.updatedAt : undefined);

type ApplicationRecords = { id: string; kind: "role" | "opportunity"; forms: FormView[]; runs: RunView[]; sends: SendView[] };

/** Same rule as browserHasHumanControl in browser/tool.ts, on the selected columns. */
const humanControl = (session?: SessionView) =>
  Boolean(session && (session.status === "human" || (session.status === "closing" && session.requestedAction === "handoff")));
const runActive = (run: RunView) => ACTIVE_RUN.has(run.status);
const runFailed = (run: RunView) => !runActive(run) && run.status !== "completed";
/** Closed, closing after a Stop, or stopped by the provider (its idle timeout ends a browser nobody signed in to). */
const browserGone = (session?: SessionView) =>
  session?.status === "closed" || Boolean(session?.closing) || session?.browserAvailability === "stopped";
/** Gone by the provider's idle timeout only: nobody closed it, so Harper can open it again when asked. */
const browserExpired = (session?: SessionView) =>
  session?.browserAvailability === "stopped" && session.status !== "closed" && !session.closing;
/** The run left its browser with the person: that browser waits for them and nothing newer ran there. */
const awaitingPerson = (run: RunView) => !runActive(run) && run.latestOnSession && humanControl(run.session) && !browserGone(run.session);
/** About when a browser left waiting closes by itself: the provider stops it this long after its last run ended. */
const closesAt = (run: RunView) => {
  const ended = time(run.updatedAt);
  return Number.isFinite(ended) ? new Date(ended + KEEP_ALIVE_MS).toISOString() : undefined;
};

/** Groups the rows by application (role id, or opportunity id when a form has no role). */
function collect(input: Omit<CareerApplicationProgressInput, "roles">): Map<string, ApplicationRecords> {
  const apps = new Map<string, ApplicationRecords>();
  const app = (id: string, kind: "role" | "opportunity") => {
    let entry = apps.get(id);
    if (!entry) apps.set(id, entry = { id, kind, forms: [], runs: [], sends: [] });
    return entry;
  };

  // Forms: the newest revision of each, with its whole-form answer and resolution.
  const revisions = new Map<number, ApplicationMessageRow>();
  const answers: ApplicationMessageRow[] = [];
  const resolutions: ApplicationMessageRow[] = [];
  for (const row of input.messages) {
    if (typeof row.formId !== "number" || typeof row.revision !== "number") continue;
    if (row.messageType === "career_form") {
      const prior = revisions.get(row.formId);
      if (!prior || (prior.revision ?? 0) < row.revision) revisions.set(row.formId, row);
    } else if (row.messageType === "career_form_response") answers.push(row);
    else if (row.messageType === "career_form_resolution") resolutions.push(row);
  }
  const open = new Map(input.openForms.map((form) => [form.formId, form]));
  // An open form older than the read window still waits for the person.
  for (const form of input.openForms)
    if (form.createdAt && (revisions.get(form.formId)?.revision ?? 0) < form.revision)
      revisions.set(form.formId, { messageType: "career_form", createdAt: form.createdAt, formId: form.formId,
        revision: form.revision, kind: form.kind, hidden: form.hidden ?? null, relatedRefs: form.relatedRefs });
  const opportunityRoles = new Map<string, Set<string>>();
  for (const row of revisions.values()) {
    if (row.kind !== "form" || row.hidden === true) continue;
    const refs = refsOf(row.relatedRefs);
    const { ids, kind } = applicationIdsOf(refs);
    if (!ids.length) continue;
    if (kind === "role")
      for (const ref of refs.filter((item) => item.type === "opportunity" && UUID.test(item.id))) {
        const roles = opportunityRoles.get(ref.id) ?? new Set<string>();
        ids.forEach((id) => roles.add(id));
        opportunityRoles.set(ref.id, roles);
      }
    const openForm = open.get(row.formId!);
    const items = openForm && openForm.revision === row.revision ? openForm.items : undefined;
    const answer = answers.filter((response) => response.formId === row.formId && response.revision === row.revision && !response.itemId)
      .sort(byCreated).at(-1);
    const resolution = resolutions.filter((item) => item.formId === row.formId && item.revision === row.revision).sort(byCreated).at(-1);
    const view: FormView = {
      formId: row.formId!,
      createdAt: row.createdAt,
      open: Boolean(items),
      questions: (items ?? []).filter((item) => INPUT_TYPES.has(item.type)).length,
      knownStart: Boolean(items?.some((item) => START_ITEMS.has(item.id))
        || (answer && (present(answer.submitScope) || present(answer.saveLogin) || present(answer.postings)))),
      ...(answer ? { answer: { at: answer.createdAt, negative: Boolean(answer.actionId && answer.actionId === answer.negativeActionId) } } : {}),
      ...(resolution ? { resolvedAt: resolution.createdAt } : {}),
    };
    // A posting the person took out of the start form's list is not applied to: that form does not track it.
    const kept = answer && !view.answer?.negative && Array.isArray(answer.postings) ? new Set(answer.postings) : undefined;
    for (const id of ids) if (!kept || kept.has(id)) app(id, kind).forms.push(view);
  }

  // Browser runs, under the roles of their browser when the run names none.
  const sessions = new Map<string, ApplicationOperationRow>();
  for (const row of input.operations) if (row.kind === "browser_session") sessions.set(row.id, row);
  const closing = new Set(input.closingBrowserSessionIds ?? []);
  const runs = input.operations.filter((row) => row.kind === "browser_run");
  const newestOnSession = new Map<string, ApplicationOperationRow>();
  for (const run of runs) {
    const prior = run.parentId ? newestOnSession.get(run.parentId) : undefined;
    if (run.parentId && (!prior || time(prior.createdAt) < time(run.createdAt))) newestOnSession.set(run.parentId, run);
  }
  for (const row of runs) {
    const session = row.parentId ? sessions.get(row.parentId) : undefined;
    const roles = roleIdsOf(row.roleRefs);
    const ids = roles.length ? roles : roleIdsOf(session?.roleRefs);
    if (!ids.length) continue;
    const mode = row.mode === "execute" ? "execute" : "prepare";
    const submitted = browserRunSubmission({ submitted: row.submitted });
    const code = String(row.verificationCode ?? "").trim().toLowerCase();
    const finishedExecute = mode === "execute" && row.status === "completed";
    const view: RunView = {
      id: row.id,
      sessionId: row.parentId ?? undefined,
      mode,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      needsUser: row.needsUser === true,
      submitted,
      // Same reading as browserRunAwaitsEmailCode, also for a code sent by text: the person has to supply it.
      awaitsCode: finishedExecute && (code === "email" || code === "phone") && submitted !== "yes",
      // A link the site mailed, which the person opens; held like a code.
      awaitsLink: finishedExecute && browserRunAwaitsEmailLink({ verificationCode: row.verificationCode, submitted: row.submitted }),
      stoppedAt: stoppedAtOf(row),
      site: siteOf(row),
      session: session && { status: session.status, requestedAction: session.requestedAction,
        browserAvailability: session.browserAvailability, closing: closing.has(session.id) },
      latestOnSession: Boolean(row.parentId && newestOnSession.get(row.parentId)?.id === row.id),
    };
    for (const id of ids) app(id, "role").runs.push(view);
  }

  // A send names no role; it joins an application through an opportunity that a form ties to its roles.
  for (const row of input.operations) {
    if (row.kind !== "email_send" || !row.opportunityId) continue;
    const ids = opportunityRoles.get(row.opportunityId) ?? (apps.has(row.opportunityId) ? [row.opportunityId] : []);
    for (const id of ids)
      apps.get(id)?.sends.push({ id: row.id, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, stoppedAt: stoppedAtOf(row) });
  }
  for (const entry of apps.values()) {
    entry.forms.sort(byCreated);
    entry.runs.sort(byCreated);
    entry.sends.sort(byCreated);
  }
  return apps;
}

function updatedAtOf(app: ApplicationRecords) {
  return latestTime([
    ...app.forms.flatMap((form) => [form.createdAt, form.answer?.at, form.resolvedAt]),
    ...app.runs.map((run) => run.updatedAt),
    ...app.sends.map((send) => send.updatedAt),
  ]);
}

const inWindow = (input: Omit<CareerApplicationProgressInput, "roles">) => {
  const since = input.now.getTime() - CAREER_APPLICATION_WINDOW_MS;
  return [...collect(input).values()].filter((app) => time(updatedAtOf(app)) >= since);
};

/** Role ids to name (company and posting) and check for an ended posting: applications inside the read window. */
export function careerApplicationRoleIds(input: Omit<CareerApplicationProgressInput, "roles">): string[] {
  return inWindow(input).filter((app) => app.kind === "role").map((app) => app.id);
}

/**
 * The delegated work behind each application's newest run or send, inside the read window: read.server.ts reads
 * whether it was cancelled and marks those rows stopped. (The person's Stops it reads directly: each names its requests.)
 */
export function careerApplicationStopRefs(input: Omit<CareerApplicationProgressInput, "roles">) {
  const newest = new Set(inWindow(input).flatMap((app) => [...app.runs, ...app.sends].sort(byCreated).slice(-1).map((work) => work.id)));
  const rows = input.operations.filter((row) => (row.kind === "browser_run" || row.kind === "email_send") && newest.has(row.id));
  return { workIds: [...new Set(rows.map((row) => row.workId).filter((value): value is string => typeof value === "string" && UUID.test(value)))] };
}

type Attempt = { run?: RunView; send?: SendView; createdAt: string; updatedAt: string };
type Candidate = { action: CareerApplicationAction; at: string };
type Login = { sub: CareerApplicationSubStep; run: RunView };
type Verification = { sub: CareerApplicationSubStep; waits?: RunView; inChat?: boolean };

const subStep = (key: CareerApplicationSubStep["key"], state: CareerApplicationSubStep["state"], at?: string, site?: string,
  expiresAt?: string): CareerApplicationSubStep =>
  ({ key, state, ...(site ? { site } : {}), ...(at ? { at: iso(at) } : {}), ...(expiresAt ? { expiresAt: iso(expiresAt) } : {}) });
const step = (key: CareerApplicationStep["key"], state: CareerApplicationStep["state"],
  extra: { at?: string; answeredAt?: string; questions?: number; subSteps?: CareerApplicationSubStep[] } = {}): CareerApplicationStep => ({
  key, state, ...(extra.at ? { at: iso(extra.at) } : {}), ...(extra.answeredAt ? { answeredAt: iso(extra.answeredAt) } : {}),
  ...(extra.questions ? { questions: extra.questions } : {}),
  // In the order they happened; one without a time last.
  ...(extra.subSteps?.length ? { subSteps: [...extra.subSteps].sort((a, b) => (a.at ? time(a.at) : Infinity) - (b.at ? time(b.at) : Infinity)) } : {}),
});
const formDoneAt = (form: FormView) => form.answer?.at ?? form.resolvedAt ?? form.createdAt;
const answerForm = (form: FormView): Candidate => ({ action: { kind: "answer_form", formId: form.formId }, at: form.createdAt });
/** A browser the provider already stopped cannot be operated, so it is not offered. */
const openBrowser = (run: RunView): Candidate[] =>
  run.sessionId && run.session?.browserAvailability !== "stopped" ? [{ action: { kind: "open_browser", sessionId: run.sessionId }, at: run.updatedAt }] : [];
const isSubmitted = (attempt: Attempt) =>
  attempt.run ? attempt.run.status === "completed" && attempt.run.submitted === "yes" : attempt.send?.status === "succeeded";
const attemptActive = (attempt: Attempt) => attempt.run ? runActive(attempt.run) : ACTIVE_SEND.has(attempt.send!.status);

/**
 * The login of one main step's runs: its newest run that needed the person, or whose browser was handed to them. It is
 * done only once a later run on the same browser or site ended without needing the person. Current while that browser
 * waits for the person, while such a later run works, and after the person returned the browser until one starts.
 * Left out when a later run needed the person again (that run's own step shows the login) or only failed. Failed when
 * the browser closed first.
 */
function loginSubStep(runs: RunView[], appRuns: RunView[], actions: Candidate[]): Login | undefined {
  // A run still under way on a returned browser started after the return: it is a later run, not the one handed over.
  const episode = runs.filter((run) => run.needsUser
    || (run.latestOnSession && !runActive(run) && (humanControl(run.session) || run.session?.requestedAction === "resume"))).at(-1);
  if (!episode) return undefined;
  const later = appRuns.filter((run) => time(run.createdAt) > time(episode.createdAt)
    && ((run.sessionId && run.sessionId === episode.sessionId) || (run.site && run.site === episode.site)));
  for (const run of later) {
    if ((run.status === "completed" && !run.needsUser) || run.submitted === "yes") return { sub: subStep("login", "done", run.createdAt, episode.site), run: episode };
    if (run.needsUser) return undefined;
  }
  const working = later.find(runActive);
  if (working) return { sub: subStep("login", "current", working.createdAt, episode.site), run: episode };
  if (later.length) return undefined;
  if (awaitingPerson(episode)) {
    actions.push(...openBrowser(episode));
    return { sub: subStep("login", "current", episode.updatedAt, episode.site, closesAt(episode)), run: episode };
  }
  if (browserGone(episode.session)) return { sub: subStep("login", "failed", episode.updatedAt, episode.site), run: episode };
  // Returned with Done in the viewer or an answer in chat: Harper continues from that page.
  return { sub: subStep("login", "current", episode.updatedAt, episode.site), run: episode };
}

/**
 * The newest screen that waits for the person's code or mail link: done once a later attempt or the submission went
 * on, failed when its browser closed first, else current. A screen handed to the person is used in that browser;
 * otherwise Harper asks for it in chat.
 */
function verificationSubStep(key: "verification_code" | "email_link", last: RunView | undefined,
  nextAttempt: (at: string) => string | undefined, done: Attempt | undefined, pending: Candidate[]): Verification | undefined {
  if (!last) return undefined;
  const next = nextAttempt(last.createdAt);
  if (next || done) return { sub: subStep(key, "done", next ?? done!.updatedAt, last.site) };
  if (browserGone(last.session)) return { sub: subStep(key, "failed", last.updatedAt, last.site) };
  const handed = awaitingPerson(last);
  if (handed) pending.push(...openBrowser(last));
  return { sub: subStep(key, "current", last.updatedAt, last.site, closesAt(last)), waits: last, inChat: !handed };
}

type BuildContext = Pick<CareerApplicationProgressInput, "now" | "turnStartedAt" | "waitingForReply" | "requests">;
/** stoppedSince: when the person stopped it, while that holds. */
type Built = { progress: CareerApplicationProgress; stoppedSince?: string };

function buildOne(app: ApplicationRecords, role: ApplicationRoleRow | undefined, context: BuildContext): Built | undefined {
  const { turnStartedAt } = context;
  const updatedAt = updatedAtOf(app);
  if (!updatedAt) return undefined;
  const actions: Candidate[] = [];
  let failure: CareerApplicationProgress["failure"];
  const works = [...app.runs, ...app.sends];
  const followedUp = (stoppedAt: string) => Boolean(turnStartedAt) && time(stoppedAt) >= time(turnStartedAt);
  // Something happened for this application after a Stop: a newer run or send (not stopped itself), a form, an answer,
  // or the person's request about it. Harper's turn alone is not: it may be about anything else and leaves no trace here.
  const movedSince = (at: string) => works.some((work) => !work.stoppedAt && time(work.createdAt) > time(at))
    || app.forms.some((form) => form.open || (form.answer && time(form.answer.at) > time(at)))
    || Boolean(context.requests?.some((request) => time(request.createdAt) > time(at) && request.roleIds.includes(app.id)));
  // Work a Stop cut off failed by the person's choice: once something follows, Harper carries on with that step.
  const resumedAfterStop = (work: { stoppedAt?: string }) => Boolean(work.stoppedAt && movedSince(work.stoppedAt));
  const prep = app.runs.filter((run) => run.mode === "prepare");
  const exec = app.runs.filter((run) => run.mode === "execute");
  const attempts: Attempt[] = [
    ...exec.map((run) => ({ run, createdAt: run.createdAt, updatedAt: run.updatedAt })),
    ...app.sends.map((send) => ({ send, createdAt: send.createdAt, updatedAt: send.updatedAt })),
  ].sort(byCreated);
  const submitStart = attempts[0]?.createdAt;
  const newestWork = [...works].sort(byCreated).at(-1);
  const firstWork = earliestTime(works.map((work) => work.createdAt));
  const lastWork = latestTime(works.map((work) => work.updatedAt));
  // A form created before any browser run or send is the start (confirm) form, otherwise a review form. Creation
  // times never change, so a form never moves to another step between polls. Once a form is known to be the start
  // form (its own items or answer), only such forms are: a mail's review form is written before its send exists.
  const knownStart = app.forms.some((form) => form.knownStart);
  const isStart = (form: FormView) => form.knownStart || (!knownStart && !works.some((work) => time(work.createdAt) <= time(form.createdAt)));
  const startForms = app.forms.filter(isStart);
  const reviewForms = app.forms.filter((form) => !isStart(form));
  const preReview = reviewForms.filter((form) => !submitStart || time(form.createdAt) < time(submitStart));
  const postReview = reviewForms.filter((form) => submitStart && time(form.createdAt) >= time(submitStart));
  const openStart = startForms.filter((form) => form.open).at(-1);
  // A start form asked again after the work stopped is the person's turn again.
  if (openStart && (!lastWork || time(openStart.createdAt) > time(lastWork))) actions.push(answerForm(openStart));

  // confirm
  let confirm: CareerApplicationStep;
  const startForm = startForms.at(-1);
  if (firstWork) {
    const answered = startForms.filter((form) => form.answer && !form.answer.negative).at(-1);
    confirm = step("confirm", "done", { at: answered?.answer?.at ?? firstWork, answeredAt: answered?.answer?.at });
  } else if (startForm?.open) confirm = step("confirm", "current", { at: startForm.createdAt, questions: startForm.questions });
  // Put off ("not now"): the person said no for now.
  else if (startForm?.answer?.negative) confirm = step("confirm", "current", { at: startForm.createdAt });
  else confirm = step("confirm", "done", { at: startForm ? formDoneAt(startForm) : app.forms[0]?.createdAt, answeredAt: startForm?.answer?.at });

  // fill
  const firstFinishedPrep = prep.find((run) => run.status === "completed" && !run.needsUser);
  const fillDoneAt = earliestTime([firstFinishedPrep?.updatedAt, reviewForms[0]?.createdAt, submitStart]);
  const fillSubSteps: CareerApplicationSubStep[] = [];
  // Only a later browser run shows the login was passed; Harper may draft the review form while the browser waits.
  const fillLogin = loginSubStep(prep, app.runs, actions);
  if (fillLogin) fillSubSteps.push(fillLogin.sub);
  // A preparation that failed, or whose browser closed while it waited for a login, followed by another one.
  const prepRetry = prep.filter((run, index) => index > 0
    && (runFailed(prep[index - 1]) || (prep[index - 1].needsUser && browserGone(prep[index - 1].session)))).at(-1);
  if (prepRetry) fillSubSteps.push(subStep("retry", "done", prepRetry.createdAt));
  const latestPrep = prep.at(-1);
  let fill: CareerApplicationStep;
  // Skipped: submitting started with no preparation and no answers drafted for review.
  if (fillDoneAt) fill = step("fill", prep.length || preReview.length ? "done" : "skipped", { at: fillDoneAt, subSteps: fillSubSteps });
  else if (!latestPrep) fill = step("fill", "todo");
  // A preparation that ended at a login is not a failure: its browser waits, or the person can have it opened again.
  else if (followedUp(latestPrep.updatedAt) || runActive(latestPrep) || latestPrep.status === "completed" || resumedAfterStop(latestPrep)
    || (openStart && time(openStart.createdAt) > time(latestPrep.updatedAt)))
    fill = step("fill", "current", { at: latestPrep.createdAt, subSteps: fillSubSteps });
  else {
    fill = step("fill", "failed", { at: latestPrep.updatedAt, subSteps: fillSubSteps });
    failure = { reason: "error" };
  }

  // review
  let review: CareerApplicationStep;
  const openReview = preReview.filter((form) => form.open).at(-1);
  const approved = preReview.filter((form) => form.answer && !form.answer.negative)
    .sort((a, b) => time(a.answer!.at) - time(b.answer!.at)).at(-1);
  if (submitStart) {
    const answeredAt = latestTime(preReview.map((form) => form.answer?.at).filter((at) => time(at) <= time(submitStart)));
    review = preReview.length
      ? step("review", "done", { at: latestTime(preReview.map(formDoneAt).filter((at) => time(at) <= time(submitStart))) ?? submitStart, answeredAt })
      : step("review", "skipped", { at: submitStart });
  } else if (!preReview.length) review = step("review", "todo");
  else if (openReview && approved && time(openReview.createdAt) > time(approved.answer!.at)) {
    // Another question after the person approved: the review stays done and the question is a sub-step.
    review = step("review", "done", { at: approved.answer!.at, answeredAt: approved.answer!.at, questions: openReview.questions,
      subSteps: [subStep("new_question", "current", openReview.createdAt)] });
    actions.push(answerForm(openReview));
  } else if (openReview) {
    review = step("review", "current", { at: openReview.createdAt, questions: openReview.questions });
    actions.push(answerForm(openReview));
  } else if (approved) review = step("review", "done", { at: approved.answer!.at, answeredAt: approved.answer!.at });
  // Changes requested or put off: Harper revises the form, or waits.
  else if (preReview.some((form) => form.answer?.negative)) review = step("review", "current", { at: preReview.at(-1)!.createdAt });
  // Resolved without a form answer (answered in chat, or closed by a Stop): done, but not answered here.
  else review = step("review", "done", { at: formDoneAt(preReview.at(-1)!) });

  // submit
  let submit: CareerApplicationStep;
  let submittedAt: string | undefined;
  let asksInChat = false;
  let submitLogin: Login | undefined;
  if (!attempts.length) submit = step("submit", "todo");
  else {
    const subSteps: CareerApplicationSubStep[] = [];
    const last = attempts.at(-1)!;
    const done = attempts.find(isSubmitted);
    const pending = done ? [] : actions;
    const nextAttempt = (at: string) => attempts.find((attempt) => time(attempt.createdAt) > time(at))?.createdAt;
    // Questions that appeared once submitting started; those after the newest attempt still hold it.
    const heldBy = postReview.filter((form) => time(form.createdAt) >= time(last.createdAt));
    const openQuestion = done ? undefined : heldBy.filter((form) => form.open).at(-1);
    if (openQuestion) {
      subSteps.push(subStep("new_question", "current", openQuestion.createdAt));
      pending.push(answerForm(openQuestion));
    } else if (postReview.length) subSteps.push(subStep("new_question", "done", latestTime(postReview.map(formDoneAt))));
    const code = verificationSubStep("verification_code", exec.filter((run) => run.awaitsCode).at(-1), nextAttempt, done, pending);
    const link = verificationSubStep("email_link", exec.filter((run) => run.awaitsLink).at(-1), nextAttempt, done, pending);
    for (const item of [code, link]) if (item) subSteps.push(item.sub);
    const verifying = Boolean(code?.waits || link?.waits);
    asksInChat = Boolean(code?.inChat || link?.inChat);
    // A code or link screen left with the person is that sub-step, not a login.
    submitLogin = loginSubStep(exec.filter((run) => run !== code?.waits && run !== link?.waits), app.runs, pending);
    if (submitLogin && (!done || submitLogin.sub.state === "done")) subSteps.push(submitLogin.sub);
    // The newest attempt stopped at a login that is not through yet: that login holds the step.
    const loginHolds = Boolean(submitLogin && submitLogin.sub.state !== "done" && submitLogin.run === last.run);
    // An attempt that stopped without submitting, for no code, link, login or new question, and was tried again.
    const retry = attempts.filter((attempt, index) => {
      const prior = attempts[index - 1];
      if (!prior || attemptActive(prior) || isSubmitted(prior) || prior.run?.awaitsCode || prior.run?.awaitsLink || prior.run?.needsUser) return false;
      return !postReview.some((form) => time(form.createdAt) >= time(prior.createdAt) && time(form.createdAt) < time(attempt.createdAt));
    }).at(-1);
    if (retry) subSteps.push(subStep("retry", "done", retry.createdAt));

    if (done) {
      submittedAt = iso(done.updatedAt);
      submit = step("submit", "done", { at: done.updatedAt, subSteps });
    } else if (followedUp(last.updatedAt) || resumedAfterStop(last.run ?? last.send!) || heldBy.length || verifying
      || submitLogin?.sub.state === "current" || loginHolds || attemptActive(last)) {
      // Timed from the attempt now under way, not the first one (a retry can come a day later).
      submit = step("submit", "current", { at: last.createdAt, questions: openQuestion?.questions, subSteps });
    } else {
      submit = step("submit", "failed", { at: last.updatedAt, subSteps });
      failure = { reason: last.send || runFailed(last.run!) ? "error" : "not_submitted" };
    }
  }

  const steps = [confirm, fill, review, submit];
  // The application's browser: its newest run's, while it is open.
  const newestRun = [...app.runs].reverse().find((run) => run.sessionId);
  const liveBrowser = newestRun?.session && !browserGone(newestRun.session) ? newestRun.sessionId : undefined;
  // The login browser the newest work stopped at closed before the person signed in.
  const lost = [submitLogin, fillLogin].find((login) => login?.sub.state === "failed" && login.run === newestWork);
  // The provider closed it for idling: Harper can open it again when the person asks (not while a turn may do so).
  if (lost?.run.sessionId && browserExpired(lost.run.session) && !turnStartedAt)
    actions.push({ action: { kind: "reopen_browser", sessionId: lost.run.sessionId }, at: lost.run.updatedAt });
  // Stopped by the person: a Stop ended the request of the newest work, or the login browser it waited on was closed
  // (in the viewer, or by a Stop's cleanup). It holds until something follows for this application (movedSince).
  const stopFrom = newestWork?.stoppedAt ?? (lost && !browserExpired(lost.run.session) ? lost.run.updatedAt : undefined);
  const stopped = Boolean(stopFrom && !movedSince(stopFrom));
  let action = actions.sort((a, b) => time(b.at) - time(a.at))[0]?.action;
  let status: CareerApplicationStatus;
  if (submit.state === "done") status = "submitted";
  else if (role?.ended && !works.length && !app.forms.some((form) => form.open)) {
    // The posting check opens no browser for a role already ended in Harper, so the application stops here.
    status = "closed";
    steps[1] = step("fill", "failed");
    failure = { reason: "closed" };
  } else if (stopped) {
    status = "failed";
    failure = { reason: "stopped" };
    action = { kind: "continue" };
  } else if (submit.state === "failed" || fill.state === "failed") status = "failed";
  // A code Harper asked for in chat, or a mail link (no browser handed over, no turn running): the person acts outside.
  else if (action || (asksInChat && !turnStartedAt)) status = "needs_you";
  else if (app.runs.some(runActive) || app.sends.some((send) => ACTIVE_SEND.has(send.status))) status = "running";
  // Nothing runs and nothing is asked: Harper is between steps only while its turn runs or right after a record.
  else if (turnStartedAt || time(updatedAt) > context.now.getTime() - PAUSE_GRACE_MS) status = "waiting";
  else {
    // Nothing moves it any more (11/27: shown as preparing for three hours). Harper parked its turn on a question in
    // chat, or the person asks it to go on.
    status = "needs_you";
    action = { kind: context.waitingForReply ? "reply_in_chat" : "continue" };
  }

  const progress: CareerApplicationProgress = {
    id: app.id,
    kind: app.kind,
    companyName: role?.companyName ?? null,
    title: role?.title ?? null,
    status,
    steps,
    ...(action && (status === "needs_you" || failure?.reason === "stopped") ? { action } : {}),
    ...((status === "failed" || status === "closed") && failure ? { failure } : {}),
    updatedAt: iso(updatedAt),
    ...(submittedAt ? { submittedAt } : {}),
    ...(liveBrowser ? { browserSessionId: liveBrowser } : {}),
  };
  return { progress, ...(failure?.reason === "stopped" && stopFrom ? { stoppedSince: stopFrom } : {}) };
}

const STATUS_ORDER: Record<CareerApplicationStatus, number> = { needs_you: 0, running: 1, waiting: 2, submitted: 3, failed: 3, closed: 3 };

/** Applications of this conversation whose newest record is within 7 days, leaving out those finished more than 24 hours ago. */
function buildShown(input: CareerApplicationProgressInput): Built[] {
  const now = input.now.getTime();
  const roles = new Map((input.roles ?? []).map((role) => [role.roleId, role]));
  return [...collect(input).values()]
    .flatMap((app) => {
      const built = buildOne(app, roles.get(app.id), input);
      return built ? [built] : [];
    })
    .filter(({ progress }) => {
      const updated = time(progress.updatedAt);
      return updated >= now - CAREER_APPLICATION_WINDOW_MS && (STATUS_ORDER[progress.status] < 3 || updated >= now - FINISHED_WINDOW_MS);
    });
}

/**
 * When the earliest application the person stopped was stopped, if one is: read.server.ts reads the person's requests
 * since then (CareerApplicationProgressInput.requests) only while this is set.
 */
export function careerApplicationStoppedSince(input: CareerApplicationProgressInput): string | undefined {
  return earliestTime(buildShown(input).map((built) => built.stoppedSince));
}

/** The shown applications: needs-you first, then running, waiting and finished, each newest first; at most CAREER_APPLICATION_LIMIT. */
export function buildCareerApplicationProgress(input: CareerApplicationProgressInput): CareerApplicationProgress[] {
  return buildShown(input)
    .map((built) => built.progress)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || time(b.updatedAt) - time(a.updatedAt) || a.id.localeCompare(b.id))
    .slice(0, CAREER_APPLICATION_LIMIT);
}

import { browserRunSubmission } from "../browser/submissionReceipt";
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
};

/** An open form as read_open_career_forms returns it (its latest revision), with the row's time when known. */
export type ApplicationOpenForm = Pick<CareerForm, "formId" | "revision" | "kind" | "items" | "relatedRefs" | "hidden"> & {
  createdAt?: string | null;
};

export type ApplicationRoleRow = { roleId: string; companyName: string | null; title: string | null; ended: boolean };

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
};

export const CAREER_APPLICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CAREER_APPLICATION_LIMIT = 10;

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

type SessionView = { status: string; requestedAction?: string | null; browserAvailability?: string | null };

type RunView = {
  sessionId?: string;
  mode: "prepare" | "execute";
  status: string;
  createdAt: string;
  updatedAt: string;
  needsUser: boolean;
  submitted: "yes" | "no" | "unclear" | null;
  awaitsCode: boolean;
  site?: string;
  session?: SessionView;
  latestOnSession: boolean;
};

type SendView = { status: string; createdAt: string; updatedAt: string };

type ApplicationRecords = { id: string; kind: "role" | "opportunity"; forms: FormView[]; runs: RunView[]; sends: SendView[] };

/** Same rule as browserHasHumanControl in browser/tool.ts, on the selected columns. */
const humanControl = (session?: SessionView) =>
  Boolean(session && (session.status === "human" || (session.status === "closing" && session.requestedAction === "handoff")));
const runActive = (run: RunView) => ACTIVE_RUN.has(run.status);
const runFailed = (run: RunView) => !runActive(run) && run.status !== "completed";
/** The run left its browser with the person: that browser waits for them and nothing newer ran there. */
const awaitingPerson = (run: RunView) => !runActive(run) && run.latestOnSession && humanControl(run.session);

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
    const view: RunView = {
      sessionId: row.parentId ?? undefined,
      mode,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      needsUser: row.needsUser === true,
      submitted,
      // Same reading as browserRunAwaitsEmailCode, also for a code sent by text: the person has to supply it.
      awaitsCode: mode === "execute" && row.status === "completed" && (code === "email" || code === "phone") && submitted !== "yes",
      site: siteOf(row),
      session: session && { status: session.status, requestedAction: session.requestedAction, browserAvailability: session.browserAvailability },
      latestOnSession: Boolean(row.parentId && newestOnSession.get(row.parentId)?.id === row.id),
    };
    for (const id of ids) app(id, "role").runs.push(view);
  }

  // A send names no role; it joins an application through an opportunity that a form ties to its roles.
  for (const row of input.operations) {
    if (row.kind !== "email_send" || !row.opportunityId) continue;
    const ids = opportunityRoles.get(row.opportunityId) ?? (apps.has(row.opportunityId) ? [row.opportunityId] : []);
    for (const id of ids) apps.get(id)?.sends.push({ status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt });
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

/** Role ids to name (company and posting) and check for an ended posting: applications inside the read window. */
export function careerApplicationRoleIds(input: Omit<CareerApplicationProgressInput, "roles">): string[] {
  const since = input.now.getTime() - CAREER_APPLICATION_WINDOW_MS;
  return [...collect(input).values()].filter((app) => app.kind === "role" && time(updatedAtOf(app)) >= since).map((app) => app.id);
}

type Attempt = { run?: RunView; send?: SendView; createdAt: string; updatedAt: string };
type Candidate = { action: CareerApplicationAction; at: string };

const subStep = (key: CareerApplicationSubStep["key"], state: CareerApplicationSubStep["state"], at?: string, site?: string): CareerApplicationSubStep =>
  ({ key, state, ...(site ? { site } : {}), ...(at ? { at: iso(at) } : {}) });
const step = (key: CareerApplicationStep["key"], state: CareerApplicationStep["state"],
  extra: { at?: string; questions?: number; subSteps?: CareerApplicationSubStep[] } = {}): CareerApplicationStep => ({
  key, state, ...(extra.at ? { at: iso(extra.at) } : {}), ...(extra.questions ? { questions: extra.questions } : {}),
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
 * The login sub-step of one main step's runs. Current while the newest run left its browser with the person and
 * nothing came after it; done once something later started or the person returned the browser; failed when that
 * browser was closed first.
 */
function loginSubStep(runs: RunView[], nextAfter: (at: string) => string | undefined, actions: Candidate[]) {
  const latest = runs.at(-1);
  if (latest && awaitingPerson(latest) && !nextAfter(latest.createdAt)) {
    actions.push(...openBrowser(latest));
    return subStep("login", "current", latest.updatedAt, latest.site);
  }
  const episode = runs.filter((run) => run.needsUser || (run.latestOnSession && (humanControl(run.session) || run.session?.requestedAction === "resume"))).at(-1);
  if (!episode) return undefined;
  const next = nextAfter(episode.createdAt);
  if (next) return subStep("login", "done", next, episode.site);
  if (episode.session?.status === "closed") return subStep("login", "failed", episode.updatedAt, episode.site);
  // Returned with Done in the viewer or an answer in chat: Harper continues from that page.
  return humanControl(episode.session) ? undefined : subStep("login", "done", episode.updatedAt, episode.site);
}

function buildOne(app: ApplicationRecords, role: ApplicationRoleRow | undefined, turnStartedAt?: string | null): CareerApplicationProgress | undefined {
  const updatedAt = updatedAtOf(app);
  if (!updatedAt) return undefined;
  const actions: Candidate[] = [];
  let failure: CareerApplicationProgress["failure"];
  const followedUp = (stoppedAt: string) => Boolean(turnStartedAt) && time(stoppedAt) >= time(turnStartedAt);
  const prep = app.runs.filter((run) => run.mode === "prepare");
  const exec = app.runs.filter((run) => run.mode === "execute");
  const attempts: Attempt[] = [
    ...exec.map((run) => ({ run, createdAt: run.createdAt, updatedAt: run.updatedAt })),
    ...app.sends.map((send) => ({ send, createdAt: send.createdAt, updatedAt: send.updatedAt })),
  ].sort(byCreated);
  const submitStart = attempts[0]?.createdAt;
  const works = [...app.runs, ...app.sends];
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
    confirm = step("confirm", "done", { at: answered?.answer?.at ?? firstWork });
  } else if (startForm?.open) confirm = step("confirm", "current", { at: startForm.createdAt, questions: startForm.questions });
  // Put off ("not now"): the person said no for now.
  else if (startForm?.answer?.negative) confirm = step("confirm", "current", { at: startForm.createdAt });
  else confirm = step("confirm", "done", { at: startForm ? formDoneAt(startForm) : app.forms[0]?.createdAt });

  // fill
  const firstFinishedPrep = prep.find((run) => run.status === "completed" && !run.needsUser);
  const fillDoneAt = earliestTime([firstFinishedPrep?.updatedAt, reviewForms[0]?.createdAt, submitStart]);
  const afterInFill = (at: string) => earliestTime([...prep.map((run) => run.createdAt), ...reviewForms.map((form) => form.createdAt),
    ...attempts.map((attempt) => attempt.createdAt)].filter((value) => time(value) > time(at)));
  const fillSubSteps: CareerApplicationSubStep[] = [];
  const fillLogin = loginSubStep(prep, afterInFill, actions);
  if (fillLogin) fillSubSteps.push(fillLogin);
  // A preparation that failed, or whose browser closed while it waited for a login, followed by another one.
  const prepRetry = prep.filter((run, index) => index > 0
    && (runFailed(prep[index - 1]) || (prep[index - 1].needsUser && prep[index - 1].session?.status === "closed"))).at(-1);
  if (prepRetry) fillSubSteps.push(subStep("retry", "done", prepRetry.createdAt));
  const latestPrep = prep.at(-1);
  let fill: CareerApplicationStep;
  // Skipped: submitting started with no preparation and no answers drafted for review.
  if (fillDoneAt) fill = step("fill", prep.length || preReview.length ? "done" : "skipped", { at: fillDoneAt, subSteps: fillSubSteps });
  else if (!latestPrep) fill = step("fill", "todo");
  else if (followedUp(latestPrep.updatedAt) || runActive(latestPrep) || (latestPrep.status === "completed" && fillLogin?.state !== "failed")
    || (openStart && time(openStart.createdAt) > time(latestPrep.updatedAt)))
    fill = step("fill", "current", { at: prep[0].createdAt, subSteps: fillSubSteps });
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
    review = preReview.length
      ? step("review", "done", { at: latestTime(preReview.map(formDoneAt).filter((at) => time(at) <= time(submitStart))) ?? submitStart })
      : step("review", "skipped", { at: submitStart });
  } else if (!preReview.length) review = step("review", "todo");
  else if (openReview && approved && time(openReview.createdAt) > time(approved.answer!.at)) {
    // Another question after the person approved: the review stays done and the question is a sub-step.
    review = step("review", "done", { at: approved.answer!.at, questions: openReview.questions,
      subSteps: [subStep("new_question", "current", openReview.createdAt)] });
    actions.push(answerForm(openReview));
  } else if (openReview) {
    review = step("review", "current", { at: openReview.createdAt, questions: openReview.questions });
    actions.push(answerForm(openReview));
  } else if (approved) review = step("review", "done", { at: approved.answer!.at });
  // Changes requested or put off: Harper revises the form, or waits.
  else if (preReview.some((form) => form.answer?.negative)) review = step("review", "current", { at: preReview.at(-1)!.createdAt });
  // Resolved without a form answer (answered in chat).
  else review = step("review", "done", { at: formDoneAt(preReview.at(-1)!) });

  // submit
  let submit: CareerApplicationStep;
  let submittedAt: string | undefined;
  let codeInChat = false;
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
    const lastCode = exec.filter((run) => run.awaitsCode).at(-1);
    let codeWaits = false;
    if (lastCode) {
      const next = nextAttempt(lastCode.createdAt);
      if (next || done) subSteps.push(subStep("verification_code", "done", next ?? done!.updatedAt, lastCode.site));
      else if (lastCode.session?.status === "closed") subSteps.push(subStep("verification_code", "failed", lastCode.updatedAt, lastCode.site));
      else {
        codeWaits = true;
        subSteps.push(subStep("verification_code", "current", lastCode.updatedAt, lastCode.site));
        // A code screen handed to the person is entered in that browser; otherwise Harper asks for it in chat.
        if (awaitingPerson(lastCode)) pending.push(...openBrowser(lastCode));
        else codeInChat = true;
      }
    }
    // A code screen left with the person is the code sub-step, not a login.
    const login = loginSubStep(codeWaits ? exec.filter((run) => run !== lastCode) : exec, nextAttempt, pending);
    if (login && (!done || login.state === "done")) subSteps.push(login);
    // An attempt that stopped without submitting, for no code, login or new question, and was tried again.
    const retry = attempts.filter((attempt, index) => {
      const prior = attempts[index - 1];
      if (!prior || attemptActive(prior) || isSubmitted(prior) || prior.run?.awaitsCode || prior.run?.needsUser) return false;
      return !postReview.some((form) => time(form.createdAt) >= time(prior.createdAt) && time(form.createdAt) < time(attempt.createdAt));
    }).at(-1);
    if (retry) subSteps.push(subStep("retry", "done", retry.createdAt));

    // The person returned the browser that needed them: Harper continues the submission.
    const returned = Boolean(last.run?.needsUser && login?.state === "done");
    if (done) {
      submittedAt = iso(done.updatedAt);
      submit = step("submit", "done", { at: done.updatedAt, subSteps });
    } else if (followedUp(last.updatedAt) || heldBy.length || codeWaits || login?.state === "current" || attemptActive(last) || returned) {
      submit = step("submit", "current", { at: submitStart, questions: openQuestion?.questions, subSteps });
    } else {
      submit = step("submit", "failed", { at: last.updatedAt, subSteps });
      failure = { reason: last.send || runFailed(last.run!) ? "error" : "not_submitted" };
    }
  }

  const steps = [confirm, fill, review, submit];
  const action = actions.sort((a, b) => time(b.at) - time(a.at))[0]?.action;
  let status: CareerApplicationStatus;
  if (submit.state === "done") status = "submitted";
  else if (role?.ended && !works.length && !app.forms.some((form) => form.open)) {
    // The posting check opens no browser for a role already ended in Harper, so the application stops here.
    status = "closed";
    steps[1] = step("fill", "failed");
    failure = { reason: "closed" };
  } else if (submit.state === "failed" || fill.state === "failed") status = "failed";
  // A code Harper asked for in chat (no browser handed over, no turn running): the person sends it in the composer.
  else if (action || (codeInChat && !turnStartedAt)) status = "needs_you";
  else if (app.runs.some(runActive) || app.sends.some((send) => ACTIVE_SEND.has(send.status))) status = "running";
  else status = "waiting";

  return {
    id: app.id,
    companyName: role?.companyName ?? null,
    title: role?.title ?? null,
    status,
    steps,
    ...(status === "needs_you" && action ? { action } : {}),
    ...((status === "failed" || status === "closed") && failure ? { failure } : {}),
    updatedAt: iso(updatedAt),
    ...(submittedAt ? { submittedAt } : {}),
  };
}

const STATUS_ORDER: Record<CareerApplicationStatus, number> = { needs_you: 0, running: 1, waiting: 2, submitted: 3, failed: 3, closed: 3 };

/**
 * Applications of this conversation whose newest record is within 7 days, leaving out those finished more than 24
 * hours ago. Needs-you first, then running, waiting and finished, each newest first; at most 10.
 */
export function buildCareerApplicationProgress(input: CareerApplicationProgressInput): CareerApplicationProgress[] {
  const now = input.now.getTime();
  const roles = new Map((input.roles ?? []).map((role) => [role.roleId, role]));
  return [...collect(input).values()]
    .flatMap((app) => {
      const progress = buildOne(app, roles.get(app.id), input.turnStartedAt);
      return progress ? [progress] : [];
    })
    .filter((progress) => {
      const updated = time(progress.updatedAt);
      return updated >= now - CAREER_APPLICATION_WINDOW_MS && (STATUS_ORDER[progress.status] < 3 || updated >= now - FINISHED_WINDOW_MS);
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || time(b.updatedAt) - time(a.updatedAt) || a.id.localeCompare(b.id))
    .slice(0, CAREER_APPLICATION_LIMIT);
}

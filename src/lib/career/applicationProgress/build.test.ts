import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCareerApplicationProgress,
  careerApplicationRoleIds,
  type ApplicationMessageRow,
  type ApplicationOpenForm,
  type ApplicationOperationRow,
  type ApplicationRoleRow,
} from "./build";
import { careerApplicationPercent, type CareerApplicationProgress } from "./types";

const ROLE_A = "00000000-0000-4000-8000-0000000000a1";
const ROLE_B = "00000000-0000-4000-8000-0000000000a2";
const ROLE_C = "00000000-0000-4000-8000-0000000000a3";
const OPPORTUNITY = "00000000-0000-4000-8000-0000000000b1";
const SESSION = "00000000-0000-4000-8000-0000000000c1";
const SESSION_2 = "00000000-0000-4000-8000-0000000000c2";
const at = (minute: number) => new Date(Date.UTC(2026, 10, 26, 0, 0) + minute * 60_000).toISOString();
const NOW = new Date(at(600));
const roles: ApplicationRoleRow[] = [
  { roleId: ROLE_A, companyName: "A사", title: "백엔드 엔지니어", ended: false },
  { roleId: ROLE_B, companyName: "B사", title: "프로덕트 매니저", ended: false },
];

const START_ITEMS = [
  { id: "salary", label: "희망 연봉", type: "text", content: "" },
  { id: "submit_scope", label: "맡기는 범위", type: "select", content: { options: [{ id: "submit", label: "제출까지" }, { id: "review", label: "제출 전에 보기" }] } },
  { id: "save_login", label: "로그인 기억하기", type: "checkbox", content: { value: true } },
  { id: "note", label: "안내", type: "markdown", content: "언제든 끌 수 있어요." },
];
const REVIEW_ITEMS = [
  { id: "why", label: "지원 동기", type: "textarea", content: { value: "초안" } },
  { id: "start_date", label: "입사 가능일", type: "text", content: "" },
];

const form = (formId: number, minute: number, roleIds = [ROLE_A], extra: Partial<ApplicationMessageRow> = {}): ApplicationMessageRow => ({
  messageType: "career_form", createdAt: at(minute), formId, revision: 1, kind: "form",
  relatedRefs: roleIds.map((id) => ({ type: "role", id })), ...extra,
});
const answer = (formId: number, minute: number, extra: Partial<ApplicationMessageRow> = {}): ApplicationMessageRow => ({
  messageType: "career_form_response", createdAt: at(minute), formId, revision: 1, actionId: "approve", negativeActionId: "later", ...extra,
});
const openForm = (formId: number, items: ApplicationOpenForm["items"], roleIds = [ROLE_A]): ApplicationOpenForm => ({
  formId, revision: 1, kind: "form", items, relatedRefs: roleIds.map((id) => ({ type: "role", id })),
});
const session = (id: string, status: string, extra: Partial<ApplicationOperationRow> = {}): ApplicationOperationRow => ({
  id, kind: "browser_session", status, createdAt: at(10), updatedAt: at(10), roleRefs: [ROLE_A], ...extra,
});
let runCount = 0;
const run = (mode: "prepare" | "execute", status: string, created: number, updated: number, extra: Partial<ApplicationOperationRow> = {}): ApplicationOperationRow => ({
  id: `00000000-0000-4000-8000-${String(++runCount).padStart(12, "0")}`, kind: "browser_run", parentId: SESSION, status, mode,
  createdAt: at(created), updatedAt: at(updated), roleRefs: [ROLE_A], startUrl: "https://boards.greenhouse.io/a/jobs/1",
  ...(status === "completed" ? { needsUser: false, submitted: "no", verificationCode: "none" } : {}), ...extra,
});

function build(messages: ApplicationMessageRow[], operations: ApplicationOperationRow[], openForms: ApplicationOpenForm[] = [],
  extra: { roles?: ApplicationRoleRow[]; now?: Date; turnStartedAt?: string } = {}) {
  return buildCareerApplicationProgress({ now: extra.now ?? NOW, messages, operations, openForms, roles: extra.roles ?? roles, turnStartedAt: extra.turnStartedAt });
}
const only = (list: CareerApplicationProgress[]) => {
  assert.equal(list.length, 1);
  return list[0];
};
const states = (progress: CareerApplicationProgress) => progress.steps.map((item) => `${item.key}:${item.state}`).join(" ");
const sub = (progress: CareerApplicationProgress, key: string) =>
  progress.steps.flatMap((item) => (item.subSteps ?? []).map((value) => ({ ...value, step: item.key }))).find((value) => value.key === key);

test("happy path without a login: each record moves one main step", () => {
  const start = form(1, 0);
  const prepare = run("prepare", "running", 6, 6);
  const review = form(2, 12);
  const snapshots = [
    build([start], [], [openForm(1, START_ITEMS)]),
    build([start, answer(1, 5, { submitScope: "review", saveLogin: false })], []),
    build([start, answer(1, 5, { submitScope: "review" })], [session(SESSION, "running"), prepare]),
    build([start, answer(1, 5, { submitScope: "review" })], [session(SESSION, "idle"), { ...prepare, status: "completed", updatedAt: at(10), needsUser: false, submitted: "no" }]),
    build([start, answer(1, 5, { submitScope: "review" }), review], [session(SESSION, "idle"), { ...prepare, status: "completed", updatedAt: at(10), needsUser: false }], [openForm(2, REVIEW_ITEMS)]),
    build([start, answer(1, 5, { submitScope: "review" }), review, answer(2, 15)], [session(SESSION, "idle"), { ...prepare, status: "completed", updatedAt: at(10), needsUser: false }]),
    build([start, answer(1, 5, { submitScope: "review" }), review, answer(2, 15)], [session(SESSION, "running"), { ...prepare, status: "completed", updatedAt: at(10), needsUser: false },
      run("execute", "running", 16, 16)]),
    build([start, answer(1, 5, { submitScope: "review" }), review, answer(2, 15)], [session(SESSION, "idle"), { ...prepare, status: "completed", updatedAt: at(10), needsUser: false },
      run("execute", "completed", 16, 20, { submitted: "yes" })]),
  ].map(only);

  const [asked, confirmed, preparing, prepared, reviewing, approved, submitting, submitted] = snapshots;
  assert.equal(asked.status, "needs_you");
  assert.deepEqual(asked.action, { kind: "answer_form", formId: 1 });
  assert.equal(asked.steps[0].state, "current");
  assert.equal(asked.steps[0].questions, 3, "the markdown note is not a question");
  assert.equal(asked.companyName, "A사");
  assert.equal(asked.title, "백엔드 엔지니어");
  assert.equal(confirmed.status, "waiting");
  assert.equal(confirmed.steps[0].at, at(5));
  assert.equal(states(preparing), "confirm:done fill:current review:todo submit:todo");
  assert.equal(preparing.status, "running");
  assert.equal(states(prepared), "confirm:done fill:done review:todo submit:todo");
  assert.equal(prepared.status, "waiting");
  assert.equal(states(reviewing), "confirm:done fill:done review:current submit:todo");
  assert.deepEqual(reviewing.action, { kind: "answer_form", formId: 2 });
  assert.equal(reviewing.steps[2].questions, 2);
  assert.equal(states(approved), "confirm:done fill:done review:done submit:todo");
  assert.equal(states(submitting), "confirm:done fill:done review:done submit:current");
  assert.equal(submitting.status, "running");
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.submittedAt, at(20));
  assert.equal(careerApplicationPercent(submitted), 100);
  assert.deepEqual(snapshots.map(careerApplicationPercent), [0, 25, 25, 50, 50, 75, 75, 100]);
  assert.ok(snapshots.every((progress) => progress.steps.length === 4 && progress.id === ROLE_A));
});

test("a login site waits for the person in the browser, then continues", () => {
  const messages = [form(1, 0), answer(1, 5, { saveLogin: true })];
  const loginRun = run("prepare", "completed", 6, 8, { needsUser: true, url: "https://id.wanted.co.kr/login", startUrl: "https://www.wanted.co.kr/wd/1" });
  const waiting = only(build(messages, [session(SESSION, "human"), loginRun]));
  assert.equal(waiting.status, "needs_you");
  assert.deepEqual(waiting.action, { kind: "open_browser", sessionId: SESSION });
  assert.equal(states(waiting), "confirm:done fill:current review:todo submit:todo");
  assert.deepEqual(sub(waiting, "login"), { key: "login", state: "current", site: "원티드", at: at(8), step: "fill" });

  // The provider stopped that browser: there is nothing to open, Harper has to start again.
  const stopped = only(build(messages, [session(SESSION, "human", { browserAvailability: "stopped" }), loginRun]));
  assert.equal(stopped.action, undefined);
  assert.equal(stopped.status, "waiting");

  const resumed = only(build(messages, [session(SESSION, "running", { requestedAction: "resume" }), loginRun, run("prepare", "running", 20, 20)]));
  assert.equal(resumed.status, "running");
  assert.equal(sub(resumed, "login")?.state, "done");
  assert.equal(sub(resumed, "login")?.at, at(20));
  assert.equal(sub(resumed, "retry"), undefined, "a login is not a retry");
  assert.equal(states(resumed), "confirm:done fill:current review:todo submit:todo");

  // Harper handed over the browser after a preparation finished: fill stays done, the login is still asked.
  const handedOff = only(build(messages, [session(SESSION, "human", { requestedAction: "handoff" }), run("prepare", "completed", 6, 8)]));
  assert.equal(states(handedOff), "confirm:done fill:done review:todo submit:todo");
  assert.equal(sub(handedOff, "login")?.state, "current");
  assert.equal(sub(handedOff, "login")?.site, "Greenhouse");
  assert.equal(handedOff.status, "needs_you");

  // The browser was closed while it waited: the application stopped.
  const closed = only(build(messages, [session(SESSION, "closed", { requestedAction: "close" }), loginRun]));
  assert.equal(closed.status, "failed");
  assert.equal(sub(closed, "login")?.state, "failed");
  assert.deepEqual(closed.failure, { reason: "error" });
});

test("submitting with nothing new to ask skips the review", () => {
  const messages = [form(1, 0), answer(1, 5, { submitScope: "submit" })];
  const prepared = run("prepare", "completed", 6, 10);
  const running = only(build(messages, [session(SESSION, "running"), prepared, run("execute", "running", 11, 11)]));
  assert.equal(states(running), "confirm:done fill:done review:skipped submit:current");
  assert.equal(running.steps[2].at, at(11));
  assert.equal(careerApplicationPercent(running), 75);
  const done = only(build(messages, [session(SESSION, "idle"), prepared, run("execute", "completed", 11, 14, { submitted: "Yes" })]));
  assert.equal(done.status, "submitted");
  assert.equal(careerApplicationPercent(done), 100);

  // A chat delegation that went straight to the submission: no start form, no preparation.
  const direct = only(build([], [session(SESSION, "idle"), run("execute", "completed", 11, 14, { submitted: "yes" })]));
  assert.equal(states(direct), "confirm:done fill:skipped review:skipped submit:done");
  assert.equal(direct.steps[0].at, at(11));
});

test("a posting the person took out of the start form's list leaves the panel", () => {
  const start = form(1, 0, [ROLE_A, ROLE_B]);
  const kept = answer(1, 5, { submitScope: "submit", postings: [ROLE_A] });
  const list = build([start, kept], [session(SESSION, "running"), run("prepare", "running", 6, 6)]);
  assert.deepEqual(list.map((app) => app.id), [ROLE_A]);
  // Before the answer, both postings wait for the person.
  assert.equal(build([start], [], [openForm(1, START_ITEMS, [ROLE_A, ROLE_B])]).length, 2);
  // Taken out, then asked for again in chat: its own records bring it back.
  const later = { ...run("prepare", "running", 20, 20), roleRefs: [ROLE_B], parentId: SESSION_2 };
  assert.deepEqual(build([start, kept], [session(SESSION, "running"), session(SESSION_2, "running", { roleRefs: [ROLE_B] }), later])
    .map((app) => app.id).sort(), [ROLE_A, ROLE_B]);
  // No list in the answer (an older form): every role of the form stays.
  assert.equal(build([start, answer(1, 5, { submitScope: "submit" })], []).length, 2);
});

test("a mail verification code holds the submission until the next run uses it", () => {
  const messages = [form(1, 0), answer(1, 5, { submitScope: "submit" })];
  const base = [session(SESSION, "idle"), run("prepare", "completed", 6, 10)];
  const codeRun = run("execute", "completed", 11, 14, { verificationCode: "email", submitted: "no", url: "https://job-boards.greenhouse.io/a/jobs/1/verify" });
  const waiting = only(build(messages, [...base, codeRun]));
  assert.equal(states(waiting), "confirm:done fill:done review:skipped submit:current");
  assert.deepEqual(sub(waiting, "verification_code"), { key: "verification_code", state: "current", site: "Greenhouse", at: at(14), step: "submit" });
  assert.equal(waiting.status, "needs_you", "the turn ended with the code still missing: Harper asked for it in chat");
  assert.equal(waiting.action, undefined, "the code goes in the composer, not a form or a browser");
  assert.equal(waiting.failure, undefined);
  const reading = only(build(messages, [...base, codeRun], [], { turnStartedAt: at(11) }));
  assert.equal(reading.status, "waiting", "while the turn runs, Harper reads the code from mail or is about to ask");
  // A code screen handed to the person is entered in that browser.
  const handed = only(build(messages, [session(SESSION, "human", { requestedAction: "verification_code" }), base[1],
    { ...codeRun, needsUser: true }]));
  assert.equal(handed.status, "needs_you");

  const unclear = only(build(messages, [...base, { ...codeRun, submitted: "unclear" }]));
  assert.equal(sub(unclear, "verification_code")?.state, "current");
  assert.notEqual(unclear.status, "failed");

  const entered = only(build(messages, [...base, codeRun, run("execute", "running", 16, 16)]));
  assert.equal(sub(entered, "verification_code")?.state, "done");
  assert.equal(entered.status, "running");
  assert.equal(sub(entered, "retry"), undefined, "a code is not a retry");
});

test("a mail's review form written before its send is not a second start form", () => {
  const start = form(1, 0, [ROLE_A, ROLE_B]);
  const mail = form(2, 6, [ROLE_A], { relatedRefs: [{ type: "role", id: ROLE_A }, { type: "opportunity", id: OPPORTUNITY }] });
  const messages = [start, answer(1, 5, { submitScope: "submit" }), mail];
  const asking = build(messages, [], [openForm(2, REVIEW_ITEMS)]).find((app) => app.id === ROLE_A)!;
  assert.equal(asking.steps[0].state, "done", "지원 확인 stays done");
  assert.equal(asking.steps[0].at, at(5), "with the start form's answer time");
  assert.equal(asking.steps[2].state, "current");
  assert.equal(asking.status, "needs_you");
});

test("a submission that did not go through fails with its reason", () => {
  const messages = [form(1, 0), answer(1, 5, { submitScope: "submit" })];
  const base = [session(SESSION, "idle"), run("prepare", "completed", 6, 10)];
  const notSubmitted = only(build(messages, [...base, run("execute", "completed", 11, 14, { submitted: "no" })]));
  assert.equal(notSubmitted.status, "failed");
  assert.deepEqual(notSubmitted.failure, { reason: "not_submitted" });
  assert.equal(states(notSubmitted), "confirm:done fill:done review:skipped submit:failed");
  assert.deepEqual(only(build(messages, [...base, run("execute", "completed", 11, 14, { submitted: "unclear" })])).failure, { reason: "not_submitted" });
  const crashed = only(build(messages, [...base, run("execute", "failed", 11, 14)]));
  assert.deepEqual(crashed.failure, { reason: "error" });

  // The turn that ran it is still deciding (retry or ask), so the run is not a failure yet; an older stop is.
  const deciding = only(build(messages, [...base, run("execute", "completed", 11, 14, { submitted: "no" })], [], { turnStartedAt: at(9) }));
  assert.equal(deciding.status, "waiting");
  assert.equal(deciding.failure, undefined);
  assert.equal(states(deciding), "confirm:done fill:done review:skipped submit:current");
  assert.equal(only(build(messages, [...base, run("execute", "completed", 11, 14, { submitted: "no" })], [], { turnStartedAt: at(30) })).status, "failed");

  // A question found while submitting reopens the step instead of failing it.
  const asked = only(build([...messages, form(3, 15)], [...base, run("execute", "completed", 11, 14, { submitted: "no" })], [openForm(3, REVIEW_ITEMS)]));
  assert.equal(asked.status, "needs_you");
  assert.deepEqual(asked.action, { kind: "answer_form", formId: 3 });
  assert.equal(states(asked), "confirm:done fill:done review:skipped submit:current");
  assert.equal(sub(asked, "new_question")?.state, "current");
  assert.equal(asked.steps[3].questions, 2);
  const answered = only(build([...messages, form(3, 15), answer(3, 17)], [...base, run("execute", "completed", 11, 14, { submitted: "no" })]));
  assert.equal(sub(answered, "new_question")?.state, "done");
  assert.equal(answered.status, "waiting");
  const resubmitted = only(build([...messages, form(3, 15), answer(3, 17)], [...base, run("execute", "completed", 11, 14, { submitted: "no" }),
    run("execute", "completed", 18, 22, { submitted: "yes" })]));
  assert.equal(resubmitted.status, "submitted");
  assert.equal(sub(resubmitted, "retry"), undefined, "the new run answered a question; it is not a retry");
});

test("a failed run followed by another one is a retry", () => {
  const messages = [form(1, 0), answer(1, 5, { submitScope: "submit" })];
  const failedPrep = run("prepare", "failed", 6, 7);
  const failed = only(build(messages, [session(SESSION, "idle"), failedPrep]));
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.failure, { reason: "error" });
  assert.equal(states(failed), "confirm:done fill:failed review:todo submit:todo");

  const retried = only(build(messages, [session(SESSION, "idle"), session(SESSION_2, "running"), failedPrep, run("prepare", "running", 9, 9, { parentId: SESSION_2 })]));
  assert.equal(retried.status, "running");
  assert.equal(states(retried), "confirm:done fill:current review:todo submit:todo");
  assert.deepEqual(sub(retried, "retry"), { key: "retry", state: "done", at: at(9), step: "fill" });

  const resubmit = only(build(messages, [session(SESSION, "idle"), run("prepare", "completed", 6, 10),
    run("execute", "completed", 11, 14, { submitted: "no" }), run("execute", "running", 20, 20)]));
  assert.equal(resubmit.status, "running");
  assert.equal(sub(resubmit, "retry")?.step, "submit");
  assert.equal(sub(resubmit, "retry")?.at, at(20));
});

test("applications are ordered needs-you, running, waiting, then finished newest first, within the windows", () => {
  const C_PLUS = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
  const messages = [
    form(1, 0, [ROLE_A]), // needs you: open start form
    form(2, 0, [ROLE_C]), answer(2, 1, { submitScope: "submit" }), // waiting: confirmed, nothing runs yet
  ];
  const operations = [
    session(SESSION, "running", { roleRefs: [ROLE_B] }),
    run("prepare", "running", 30, 30, { roleRefs: [ROLE_B] }),
    // Submitted 2 hours ago: shown.
    session(SESSION_2, "idle", { roleRefs: [C_PLUS(1)] }),
    run("execute", "completed", 100, 480, { parentId: SESSION_2, roleRefs: [C_PLUS(1)], submitted: "yes" }),
    // Submitted 2 days ago: left out.
    run("execute", "completed", -3000, -2880, { parentId: SESSION_2, roleRefs: [C_PLUS(2)], submitted: "yes" }),
    // Waiting, but the newest record is 8 days old: left out.
    run("prepare", "completed", -12000, -11520, { parentId: SESSION_2, roleRefs: [C_PLUS(3)] }),
  ];
  const list = build(messages, operations, [openForm(1, START_ITEMS, [ROLE_A])]);
  assert.deepEqual(list.map((item) => [item.id, item.status]), [
    [ROLE_A, "needs_you"], [ROLE_B, "running"], [ROLE_C, "waiting"], [C_PLUS(1), "submitted"],
  ]);
  assert.equal(list[2].companyName, null, "an unnamed role keeps the progress");

  // At most ten, keeping the ones that need the person.
  const many = Array.from({ length: 14 }, (_, index) => run("prepare", "running", 40 + index, 40 + index, { parentId: null, roleRefs: [C_PLUS(10 + index)] }));
  const capped = build(messages, [...operations, ...many], [openForm(1, START_ITEMS, [ROLE_A])]);
  assert.equal(capped.length, 10);
  assert.equal(capped[0].id, ROLE_A);
  assert.equal(capped[1].id, C_PLUS(23), "newest first within a status");
  assert.deepEqual(careerApplicationRoleIds({ now: NOW, messages, operations, openForms: [] }).sort(),
    [ROLE_A, ROLE_B, ROLE_C, C_PLUS(1), C_PLUS(2)].sort(), "names are read only inside the 7-day window");
});

test("the percentage never goes down across one application's snapshots", () => {
  // Start form, login, preparation, review, a question found while submitting, a retry, a mail code, submitted.
  const steps: { messages: ApplicationMessageRow[]; operations: ApplicationOperationRow[]; open?: ApplicationOpenForm[] }[] = [];
  const messages: ApplicationMessageRow[] = [];
  const operations: ApplicationOperationRow[] = [];
  const snap = (open?: ApplicationOpenForm[]) => steps.push({ messages: [...messages], operations: operations.map((row) => ({ ...row })), open });
  // Harper's turn runs from minute 15 to 30, reading each receipt and asking or retrying.
  const setSession = (status: string, extra: Partial<ApplicationOperationRow> = {}) => {
    const index = operations.findIndex((row) => row.id === SESSION);
    const row = session(SESSION, status, extra);
    if (index < 0) operations.push(row); else operations[index] = row;
  };
  const finish = (row: ApplicationOperationRow, updated: number, extra: Partial<ApplicationOperationRow>) =>
    Object.assign(row, { status: "completed", updatedAt: at(updated), needsUser: false, submitted: "no", verificationCode: "none", ...extra });

  messages.push(form(1, 0)); snap([openForm(1, START_ITEMS)]);
  messages.push(answer(1, 2, { submitScope: "review", saveLogin: true })); snap();
  setSession("running"); const login = run("prepare", "running", 3, 3); operations.push(login); snap();
  finish(login, 5, { needsUser: true }); setSession("human"); snap();
  setSession("idle", { requestedAction: "resume" }); snap();
  setSession("running"); const prepare = run("prepare", "running", 8, 8); operations.push(prepare); snap();
  finish(prepare, 10, {}); setSession("idle"); snap();
  messages.push(form(2, 11)); snap([openForm(2, REVIEW_ITEMS)]);
  messages.push(answer(2, 13, { actionId: "later" })); snap(); // changes requested
  messages.push({ ...form(2, 14), revision: 2 }); snap([{ ...openForm(2, REVIEW_ITEMS), revision: 2 }]);
  messages.push(answer(2, 15, { revision: 2 })); snap();
  setSession("running"); const first = run("execute", "running", 16, 16); operations.push(first); snap();
  finish(first, 18, { submitted: "no" }); setSession("idle"); snap();
  messages.push(form(3, 19)); snap([openForm(3, REVIEW_ITEMS)]);
  messages.push(answer(3, 20)); snap();
  const second = run("execute", "running", 21, 21); operations.push(second); snap();
  finish(second, 23, { submitted: "no" }); snap();
  const third = run("execute", "running", 24, 24); operations.push(third); snap();
  finish(third, 26, { submitted: "no", verificationCode: "email" }); snap();
  const fourth = run("execute", "running", 27, 27); operations.push(fourth); snap();
  finish(fourth, 29, { submitted: "yes" }); snap();

  const list = steps.map((item) => only(build(item.messages, item.operations, item.open ?? [], { turnStartedAt: at(15) })));
  const percents = list.map(careerApplicationPercent);
  for (let index = 1; index < percents.length; index += 1)
    assert.ok(percents[index] >= percents[index - 1], `snapshot ${index}: ${percents[index - 1]} -> ${percents[index]} (${states(list[index])})`);
  assert.equal(percents.at(-1), 100);
  const finalSubSteps = list.at(-1)!.steps[3].subSteps?.map((item) => `${item.key}:${item.state}`);
  assert.deepEqual(finalSubSteps, ["new_question:done", "retry:done", "verification_code:done"]);
  assert.deepEqual(list.at(-1)!.steps[1].subSteps?.map((item) => `${item.key}:${item.state}`), ["login:done"]);
  assert.ok(list.every((item) => item.status !== "failed"), list.map((item) => item.status).join(","));
});

test("records tie to an application through the browser, an opportunity, or an ended role", () => {
  // A run that names no role belongs to the roles its browser was opened for.
  const inherited = only(build([], [session(SESSION, "running", { roleRefs: [ROLE_B] }), run("prepare", "running", 5, 5, { roleRefs: [] })]));
  assert.equal(inherited.id, ROLE_B);

  // A mail application: the send names the opportunity that the reviewed form ties to the role.
  const mailForm = form(4, 0, [], { relatedRefs: [{ type: "role", id: ROLE_A }, { type: "opportunity", id: OPPORTUNITY }] });
  const sent = only(build([mailForm, answer(4, 3)], [{ id: "00000000-0000-4000-8000-0000000000e1", kind: "email_send", status: "succeeded",
    createdAt: at(4), updatedAt: at(5), opportunityId: OPPORTUNITY }]));
  assert.equal(sent.status, "submitted");
  assert.equal(states(sent), "confirm:done fill:skipped review:skipped submit:done");
  const sending = only(build([mailForm, answer(4, 3)], [{ id: "00000000-0000-4000-8000-0000000000e1", kind: "email_send", status: "dispatching",
    createdAt: at(4), updatedAt: at(4), opportunityId: OPPORTUNITY }]));
  assert.equal(sending.status, "running");

  // The posting check opens no browser for a role that already ended in Harper.
  const closed = only(build([form(1, 0), answer(1, 2, { submitScope: "submit" })], [], [], { roles: [{ ...roles[0], ended: true }] }));
  assert.equal(closed.status, "closed");
  assert.deepEqual(closed.failure, { reason: "closed" });
  assert.equal(closed.steps[1].state, "failed");
  // An ended role still waiting for the person's answer is not closed yet.
  assert.equal(only(build([form(1, 0)], [], [openForm(1, START_ITEMS)], { roles: [{ ...roles[0], ended: true }] })).status, "needs_you");

  // Suggestions, hidden forms and itemwise answers are not applications or answers.
  assert.deepEqual(build([form(5, 0, [ROLE_A], { kind: "suggestion" }), form(6, 0, [ROLE_B], { hidden: true })], []), []);
  const itemwise = only(build([form(1, 0), answer(1, 2, { itemId: "salary" })], [], [openForm(1, START_ITEMS)]));
  assert.equal(itemwise.steps[0].state, "current");
});

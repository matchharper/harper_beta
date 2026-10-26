import assert from "node:assert/strict";
import test from "node:test";
import {
  companyFirstRunDeliveryStatus,
  scopeCandidateDigestRows,
  deliverCandidateDigestToRecipient,
  outboxRowIsDue,
  deliverCompanyFirstEmailRun,
  EMAIL_DELIVERY_UNCERTAIN_REASON,
  EMAIL_NO_RECIPIENTS_REASON,
  EMAIL_NOT_SENT_REASON,
  type CandidateDigestJob,
  type CandidateDigestRecipient,
  type CandidateDigestRecipientDependencies,
  type CompanyFirstEmailRunDependencies,
  type EmailOutboxRow,
} from "./emailDelivery";

const row = (id: string, kind: string, roleIds = ["role"]): EmailOutboxRow => ({
  id, run_id: "run", company_workspace_id: "workspace", candidate_ids: [`${id}-candidate`],
  role_ids: roleIds, blocks: [], status: "sending", attempt_count: 0, delivery_kind: kind,
});
const person = (id: string): CandidateDigestRecipient => ({
  user_id: id, email: `${id}@example.com`, name: id, locale: "ko", authority: "owner", is_assignee: false, roleIds: ["role"],
});

function run(options: {
  rows?: EmailOutboxRow[];
  busy?: boolean;
  claimed?: EmailOutboxRow[];
  requestedStatus?: string | null;
  undeliverable?: string[];
  enabledRoles?: string[];
  recipients?: CandidateDigestRecipient[];
  emailEnabled?: boolean;
  outcomes?: Record<string, Awaited<ReturnType<CompanyFirstEmailRunDependencies["deliverToRecipient"]>> | Error>;
} = {}) {
  const log: string[] = [];
  const delivered: Array<{ recipient: string; rows: string[]; roleIds: string[] }> = [];
  const rows = options.rows ?? [row("clover", "company_first"), row("check", "accepted_connection")];
  const deps: CompanyFirstEmailRunDependencies = {
    claimRun: async () => options.requestedStatus !== undefined
      ? { rows: [], busy: false, requestedStatus: options.requestedStatus }
      : { rows: options.claimed ?? rows, busy: options.busy ?? false },
    recordAttempt: async (item) => { log.push(`attempt:${item.id}:${item.attempt_count}`); },
    isDeliverable: async (item) => !(options.undeliverable ?? []).includes(item.id),
    cancel: async (item, reason) => { log.push(`cancel:${item.id}:${reason}`); },
    markFailed: async (item) => { log.push(`failed:${item.id}`); },
    markFailedFinal: async (item, reason) => { log.push(`failedFinal:${item.id}:${reason}`); },
    markSent: async (items) => { log.push(`sent:${items.map((item) => item.id).join(",")}`); },
    finishRun: async (runId) => { log.push(`finish:${runId}`); },
    emailRoleIds: async (roleIds) => roleIds.filter((id) => (options.enabledRoles ?? ["role"]).includes(id)),
    recipients: async () => options.recipients ?? [person("assignee"), person("owner")],
    emailEnabled: () => options.emailEnabled ?? true,
    newOwner: () => "owner-lease",
    deliverToRecipient: async (args, items) => {
      const outcome = options.outcomes?.[args.recipient.user_id] ?? "sent";
      if (outcome instanceof Error) throw outcome;
      delivered.push({ recipient: args.recipient.user_id, rows: items.map((item) => item.id), roleIds: args.snapshot.roleIds });
      return outcome;
    },
  };
  return { deps, log, delivered, rows };
}

test("one call sends one mail per recipient covering every email row of the run", async () => {
  const harness = run();
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "sent" });
  assert.deepEqual(harness.delivered.map((item) => item.recipient), ["assignee", "owner"]);
  assert.deepEqual(harness.delivered[0].rows, ["clover", "check"]);
  assert.deepEqual(harness.log.slice(-2), ["sent:clover,check", "finish:run"]);
  assert.ok(harness.log.includes("attempt:clover:1") && harness.log.includes("attempt:check:1"));
});

test("rows whose candidates changed are canceled and the rest are still sent", async () => {
  const harness = run({ undeliverable: ["check"] });
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "sent" });
  assert.ok(harness.log.includes("cancel:check:candidate state changed before email delivery"));
  assert.deepEqual(harness.delivered[0].rows, ["clover"]);
  assert.ok(harness.log.includes("sent:clover"));
});

test("zero recipients cancels the rows with a reason and no mail", async () => {
  for (const options of [{ recipients: [] }, { enabledRoles: [] }]) {
    const harness = run(options);
    assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "canceled" });
    assert.equal(harness.delivered.length, 0);
    assert.deepEqual(harness.log.filter((line) => line.startsWith("cancel:")),
      [`cancel:clover:${EMAIL_NO_RECIPIENTS_REASON}`, `cancel:check:${EMAIL_NO_RECIPIENTS_REASON}`]);
    assert.equal(harness.log.at(-1), "finish:run");
  }
});

test("a partial recipient failure leaves every row failed for the worker retry", async () => {
  const harness = run({ outcomes: { owner: new Error("Resend 500") } });
  await assert.rejects(deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), /Resend 500/);
  assert.deepEqual(harness.delivered.map((item) => item.recipient), ["assignee"]);
  assert.ok(harness.log.includes("failed:clover") && harness.log.includes("failed:check"));
  assert.ok(!harness.log.some((line) => line.startsWith("sent:") || line.startsWith("finish:")));
});

test("a retry after partial delivery skips recipients already sent and finishes", async () => {
  const harness = run({ outcomes: { assignee: "already_sent" } });
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "sent" });
  assert.ok(harness.log.includes("sent:clover,check"));
});

test("a recipient leased by another sender is retried later", async () => {
  const harness = run({ outcomes: { owner: "busy" } });
  await assert.rejects(deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), /holds a recipient/);
  assert.ok(harness.log.includes("failed:check"));
});

test("another call holding a row of the run makes this call back off", async () => {
  const harness = run({ busy: true });
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "busy" });
  assert.equal(harness.delivered.length, 0);
  assert.deepEqual(harness.log, ["failed:clover", "failed:check"]);
});

test("a call that loses the run claim backs off without touching the other call's rows", async () => {
  const harness = run({ busy: true, claimed: [] });
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "busy" });
  assert.deepEqual(harness.log, []);
});

test("a row that is not due or already finished is reported without claiming the run", async () => {
  const harness = run({ requestedStatus: "sent" });
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "unclaimed", requestedStatus: "sent" });
  assert.deepEqual(harness.log, []);
});

test("no mail actually sent ends the rows canceled, never sent", async () => {
  for (const outcomes of [{ assignee: "closed", owner: "closed" }, { assignee: "closed", owner: "cancelled" }] as const) {
    const harness = run({ outcomes });
    assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "canceled" });
    assert.ok(!harness.log.some((line) => line.startsWith("sent:")));
    assert.ok(harness.log.includes(`cancel:clover:${EMAIL_NOT_SENT_REASON}`));
    assert.equal(harness.log.at(-1), "finish:run");
  }
});

test("no mail sent after a send attempt ends the rows failed for a person, not canceled", async () => {
  for (const outcomes of [{ assignee: "closed_after_attempt", owner: "cancelled" }, { assignee: "closed", owner: "closed_after_attempt" }] as const) {
    const harness = run({ outcomes });
    assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "failed" });
    assert.deepEqual(harness.log.filter((line) => line.startsWith("failedFinal:")),
      [`failedFinal:clover:${EMAIL_DELIVERY_UNCERTAIN_REASON}`, `failedFinal:check:${EMAIL_DELIVERY_UNCERTAIN_REASON}`]);
    assert.ok(!harness.log.some((line) => /^(cancel|sent|failed):/.test(line)));
    // The group is never retried, so this call is the one that finishes the run.
    assert.equal(harness.log.at(-1), "finish:run");
  }
});

test("one closed recipient beside a sent one still marks the run sent", async () => {
  const harness = run({ outcomes: { assignee: "closed" } });
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "sent" });
});

test("disabled company email keeps the rows for retry instead of dropping them", async () => {
  const harness = run({ emailEnabled: false });
  await assert.rejects(deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), /EMAIL_RUNTIME_TARGET/);
  assert.equal(harness.delivered.length, 0);
  assert.ok(harness.log.includes("failed:clover"));
});

test("only email-enabled roles reach the recipient snapshot", async () => {
  const harness = run({ rows: [row("clover", "company_first", ["role", "quiet-role"])] });
  await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps);
  assert.deepEqual(harness.delivered[0].roleIds, ["role"]);
});

test("recipients that all became ineligible cancel the rows", async () => {
  const harness = run({ outcomes: { assignee: "cancelled", owner: "cancelled" } });
  assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "canceled" });
  assert.ok(!harness.log.some((line) => line.startsWith("sent:")));
});

function recipient(job: CandidateDigestJob | null, overrides: Partial<CandidateDigestRecipientDependencies> = {}) {
  const calls: string[] = [];
  const delivery = { to: "a@example.com", from: "Harper <h@example.com>", replyTo: "company+x@reply", subject: "s", text: "t", html: "h", idempotencyKey: "company-notice/job" };
  const deps: CandidateDigestRecipientDependencies = {
    claim: async () => job,
    build: async () => { calls.push("build"); return { delivery, links: [{ tokenHash: "hash", introCandidateId: "c", action: "pass" }] }; },
    prepare: async (current, _owner, payload, links) => { calls.push(`prepare:${links.length}`); return { ...current, delivery: payload, status: "sending" }; },
    send: async (payload) => { calls.push(`send:${payload.idempotencyKey}`); return { id: "resend-id" }; },
    finish: async (_id, _owner, providerId) => { calls.push(`finish:${providerId}`); },
    release: async () => { calls.push("release"); },
    isPermanent: (error) => error instanceof TypeError,
    cancel: async () => { calls.push("cancel"); },
    ...overrides,
  };
  const args = { recipient: person("a"), runId: "run", owner: "lease", snapshot: { workspaceId: "w", roleIds: ["role"], outboxIds: ["o"] } };
  return { calls, deps, args, delivery };
}
const job = (status: string, delivery: CandidateDigestJob["delivery"] = null): CandidateDigestJob => ({ id: "job", status, delivery, attempted_at: delivery ? "2026-10-22T00:00:00Z" : null });

test("a recipient mail is built once, frozen with its links and then sent", async () => {
  const harness = recipient(job("processing"));
  assert.equal(await deliverCandidateDigestToRecipient(harness.args, harness.deps), "sent");
  assert.deepEqual(harness.calls, ["build", "prepare:1", "send:company-notice/job", "finish:resend-id"]);
});

test("a retry resends the frozen mail without new links", async () => {
  const harness = recipient(job("processing", { to: "a@example.com", from: "f", replyTo: "r", subject: "frozen", text: "t", html: "h", idempotencyKey: "company-notice/job" }));
  assert.equal(await deliverCandidateDigestToRecipient(harness.args, harness.deps), "sent");
  assert.deepEqual(harness.calls, ["prepare:0", "send:company-notice/job", "finish:resend-id"]);
});

test("terminal and leased recipient rows are never sent again", async () => {
  for (const [status, outcome] of [["sent", "already_sent"], ["cancelled", "cancelled"], ["failed", "closed"], ["delivery_unknown", "closed"]] as const) {
    const harness = recipient(job(status));
    assert.equal(await deliverCandidateDigestToRecipient(harness.args, harness.deps), outcome);
    assert.deepEqual(harness.calls, []);
  }
  for (const status of ["failed", "delivery_unknown"]) {
    const harness = recipient({ ...job(status), attempted_at: "2026-10-22T00:00:00Z" });
    assert.equal(await deliverCandidateDigestToRecipient(harness.args, harness.deps), "closed_after_attempt");
    assert.deepEqual(harness.calls, []);
  }
  const leased = recipient(null);
  assert.equal(await deliverCandidateDigestToRecipient(leased.args, leased.deps), "busy");
});

test("a recipient removed before sending is canceled by the freeze step", async () => {
  const harness = recipient(job("processing"), { prepare: async (current) => ({ ...current, status: "cancelled" }) });
  assert.equal(await deliverCandidateDigestToRecipient(harness.args, harness.deps), "cancelled");
  assert.deepEqual(harness.calls, ["build"]);
});

test("a lease lost before freezing is retried, not counted as a missing recipient", async () => {
  const harness = recipient(job("processing"), { prepare: async () => null });
  assert.equal(await deliverCandidateDigestToRecipient(harness.args, harness.deps), "busy");
  const unknown = recipient(job("processing"), { prepare: async (current) => ({ ...current, status: "delivery_unknown", attempted_at: "2026-10-22T00:00:00Z" }) });
  assert.equal(await deliverCandidateDigestToRecipient(unknown.args, unknown.deps), "closed_after_attempt");
});

test("send failures release the lease and surface the error", async () => {
  const harness = recipient(job("processing"), { send: async () => { throw new Error("timeout"); } });
  await assert.rejects(deliverCandidateDigestToRecipient(harness.args, harness.deps), /timeout/);
  assert.equal(harness.calls.at(-1), "release");
  const missing = recipient(job("processing"), { send: async () => ({}) });
  await assert.rejects(deliverCandidateDigestToRecipient(missing.args, missing.deps), /receipt missing/);
});

test("a recipient who can no longer be authorized is canceled instead of retried forever", async () => {
  const harness = recipient(job("processing"), { build: async () => { throw new TypeError("company_email_account_mismatch"); } });
  assert.equal(await deliverCandidateDigestToRecipient(harness.args, harness.deps), "cancelled");
  assert.deepEqual(harness.calls, ["cancel"]);
});

test("due times are compared as time values; an unreadable or never time is not due", () => {
  const noon = Date.parse("2026-10-22T12:00:00Z");
  // As strings "…00Z" sorts after "…00.5Z"; as times it is earlier.
  assert.equal(outboxRowIsDue("2026-10-22T12:00:00Z", Date.parse("2026-10-22T12:00:00.5Z")), true);
  assert.equal(outboxRowIsDue("2026-10-22T12:00:00.5Z", noon), false);
  assert.equal(outboxRowIsDue("2026-10-22T12:00:00.123456+00:00", noon + 1000), true);
  for (const value of ["infinity", "not a time", "", null, undefined]) assert.equal(outboxRowIsDue(value, noon), false);
});

test("a run finishes with an email group ended failed for a person, which stays failed", () => {
  const sent = { status: "sent", delivery_channel: "slack", available_at: "2026-10-22T12:00:00Z" };
  const finalEmail = { status: "failed", delivery_channel: "email", available_at: "infinity" };
  assert.equal(companyFirstRunDeliveryStatus([sent, finalEmail]), "partially_failed");
  assert.equal(companyFirstRunDeliveryStatus([finalEmail]), "partially_failed");
  // A retrying email row, or any failed Slack row, still keeps the run open as before.
  assert.equal(companyFirstRunDeliveryStatus([sent, { ...finalEmail, available_at: "2026-10-22T13:00:00Z" }]), null);
  assert.equal(companyFirstRunDeliveryStatus([sent, { ...finalEmail, delivery_channel: "slack" }]), null);
  assert.equal(companyFirstRunDeliveryStatus([finalEmail, { ...sent, status: "pending" }]), null);
  // Existing outcomes are unchanged.
  assert.equal(companyFirstRunDeliveryStatus([]), null);
  assert.equal(companyFirstRunDeliveryStatus([sent, sent]), "sent");
  assert.equal(companyFirstRunDeliveryStatus([{ ...sent, status: "canceled" }]), "canceled");
  assert.equal(companyFirstRunDeliveryStatus([sent, { ...sent, status: "canceled" }]), "partially_canceled");
});

test("an email-only run, or one whose Slack part finished first, leaves delivery when its email ends failed", async () => {
  for (const slack of [[], [{ id: "slack", status: "sent", delivery_channel: "slack", available_at: "2026-10-22T12:00:00Z" }]]) {
    // Rows as stored: the run's Slack part (if any) and its two email rows.
    const stored = new Map<string, { status: string; delivery_channel: string; available_at: string }>(
      [...slack, ...["clover", "check"].map((id) => ({ id, status: "sending", delivery_channel: "email", available_at: "2026-10-22T12:00:00Z" }))]
        .map(({ id, ...rest }) => [id, rest]));
    let runStatus: string | null = "delivery_pending";
    const harness = run({ outcomes: { assignee: "closed_after_attempt", owner: "closed_after_attempt" } });
    harness.deps.markFailedFinal = async (item) => { stored.set(item.id, { status: "failed", delivery_channel: "email", available_at: "infinity" }); };
    harness.deps.finishRun = async () => { runStatus = companyFirstRunDeliveryStatus([...stored.values()]) ?? runStatus; };
    assert.deepEqual(await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps), { status: "failed" });
    assert.equal(runStatus, "partially_failed");
  }
});


test("each recipient's frozen snapshot contains only their authorized roles", async () => {
  const harness = run({
    rows: [row("research", "company_first", ["research"]), row("platform", "company_first", ["platform"])],
    enabledRoles: ["research", "platform"],
    recipients: [{ ...person("manager"), roleIds: ["research"] }, { ...person("owner"), roleIds: ["research", "platform"] }],
  });
  await deliverCompanyFirstEmailRun(harness.rows[0], harness.deps);
  assert.deepEqual(harness.delivered, [
    { recipient: "manager", rows: ["research"], roleIds: ["research"] },
    { recipient: "owner", rows: ["research", "platform"], roleIds: ["research", "platform"] },
  ]);
});

test("a mixed-role mail excludes unauthorized candidates and unscoped prose", () => {
  const mixed = { ...row("mixed", "company_first", ["research", "platform"]), candidate_ids: ["allowed", "private"], blocks: [
    { type: "section", text: { text: "Combined overview mentioning both teams" } },
    { type: "section", block_id: "company_intro_allowed", text: { text: "Research candidate" } },
    { type: "section", block_id: "company_intro_private", text: { text: "Platform candidate" } },
  ] };
  const intros = [{ id: "allowed", role_id: "research" }, { id: "private", role_id: "platform" }];
  const scoped = scopeCandidateDigestRows([mixed], intros, ["research"]);
  assert.deepEqual(scoped[0].candidate_ids, ["allowed"]);
  assert.deepEqual(scoped[0].role_ids, ["research"]);
  assert.deepEqual(scoped[0].blocks, [mixed.blocks[1]]);
  assert.deepEqual(scopeCandidateDigestRows([mixed], intros, ["research", "platform"]), [mixed]);
  assert.deepEqual(scopeCandidateDigestRows([mixed], intros, []), []);
  assert.deepEqual(scopeCandidateDigestRows([mixed], [], ["research"]), []);
});

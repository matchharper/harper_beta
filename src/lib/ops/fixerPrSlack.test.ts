import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  buildFixerPrBaseChangedCard,
  buildFixerPrFinalCard,
  buildFixerPrOpenCard,
  createFixerPrGitHubClient,
  createFixerPrSecretsLoader,
  decideFixerPrAction,
  extractFixerPrTldr,
  FIXER_PR_CLOSE_ACTION_ID,
  FIXER_PR_MERGE_ACTION_ID,
  FIXER_PR_NOT_ALLOWED_TEXT,
  FIXER_PR_SLACK_CHANNEL_ID,
  FIXER_PR_SLACK_EVENT_TYPE,
  FIXER_PR_SLACK_TEAM_ID,
  FIXER_PR_UNAVAILABLE_TEXT,
  FixerPrGitHubError,
  fixerPrIneligibility,
  formatFixerPrSeoulTime,
  parseFixerPrButtonValue,
  parseFixerPrIncidentNumber,
  routeFixerPrSlackAction,
  runFixerPrWebhook,
  verifyFixerPrWebhookSignature,
  type FixerPrButtonValue,
  type FixerPrCard,
  type FixerPrClickDeps,
  type FixerPrPull,
  type FixerPrSecrets,
  type FixerPrSlackCall,
} from "./fixerPrSlack";

const SHA = "3f2a9c1d4e5f60718293a4b5c6d7e8f901234567";
const NEW_SHA = "9b8c7d6e5f4a39281706f5e4d3c2b1a098765432";
const MERGE_SHA = "7c1e0d2b3a4958671e2d3c4b5a69788796a5b4c3";
const WEBHOOK_SECRET = "webhook-secret-for-tests";
const SECRETS: FixerPrSecrets = {
  githubToken: "github-token-for-tests",
  webhookSecret: WEBHOOK_SECRET,
};
const ALLOWED_USER = "U0C8E9KPMSA";
const OTHER_ALLOWED_USER = "U09B4FF7TV0";
const RESPONSE_URL = "https://hooks.slack.com/actions/T09ASGLN207/1/response";
/** 11/2 11:52 in Seoul. */
const NOW = new Date("2026-11-02T02:52:00Z");
const PR_LINK = "<https://github.com/matchharper/harper_beta/pull/230|harper_beta #230>";
const INCIDENT_LINK = "<https://github.com/matchharper/harper_incidents/issues/44|사건 #44>";

function makePull(overrides: Partial<FixerPrPull> = {}): FixerPrPull {
  return {
    base: { ref: "dev", repo: { full_name: "matchharper/harper_beta" } },
    body: [
      "관련 사건: matchharper/harper_incidents#44",
      "",
      "## TL;DR",
      "- 리뷰 취소가 저장되지 않던 문제를 고쳐요.",
      "- 취소하면 목록에서 바로 사라져요.",
      "",
      "## 문제",
      "리뷰를 취소해도 다시 나타났어요.",
    ].join("\n"),
    draft: false,
    head: {
      ref: "fix/incident-44-review-cancel",
      repo: { full_name: "matchharper/harper_beta" },
      sha: SHA,
    },
    merge_commit_sha: null,
    merged: false,
    merged_at: null,
    number: 230,
    state: "open",
    title: "fix(review): 리뷰 취소가 저장되지 않아요",
    ...overrides,
  };
}

function makeWorkerPull(overrides: Partial<FixerPrPull> = {}) {
  return makePull({
    base: { ref: "main", repo: { full_name: "matchharper/harper_worker" } },
    body: "## TL;DR\n재시도 큐가 멈추지 않아요.",
    head: {
      ref: "fix/incident-51-retry",
      repo: { full_name: "matchharper/harper_worker" },
      sha: SHA,
    },
    number: 12,
    title: "fix(queue): 재시도가 멈춰요",
    ...overrides,
  });
}

const buttonValue = (
  overrides: Partial<FixerPrButtonValue> = {}
): FixerPrButtonValue => ({ base: "dev", pr: 230, repo: "harper_beta", sha: SHA, ...overrides });

type Block = {
  block_id?: string;
  elements?: Array<Record<string, any>>;
  text?: { text?: string };
  type: string;
};
const blocksOf = (card: { blocks: unknown }) => card.blocks as Block[];
const textOf = (card: { blocks: unknown }) =>
  blocksOf(card)
    .filter((block) => block.type === "section")
    .map((block) => block.text?.text ?? "")
    .join("\n");
const actionsOf = (card: { blocks: unknown }) =>
  blocksOf(card).find((block) => block.type === "actions");

const sign = (body: string, secret = WEBHOOK_SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

test("webhook signature is GitHub's sha256 HMAC of the raw body", () => {
  const body = JSON.stringify({ action: "opened", title: "한글 제목" });
  const verify = (signature: string | null, payload = body, secret = WEBHOOK_SECRET) =>
    verifyFixerPrWebhookSignature({ payload, secret, signature });
  assert.equal(verify(sign(body)), true);
  assert.equal(verify(sign(body), `${body} `), false);
  assert.equal(verify(sign(body, "another-secret")), false);
  assert.equal(verify(sign(body).replace("sha256=", "sha1=")), false);
  assert.equal(verify("sha256=abc"), false);
  assert.equal(verify(null), false);
  assert.throws(() => verify(sign(body), body, ""), /fixer_github_webhook_secret/);
});

test("eligibility: same-repository fix/incident- branch into the repository's base, not a draft", () => {
  const check = (pull: FixerPrPull, repositoryFullName = "matchharper/harper_beta") =>
    fixerPrIneligibility({ pull, repositoryFullName });
  assert.equal(check(makePull()), null);
  assert.equal(check(makeWorkerPull(), "matchharper/harper_worker"), null);
  assert.equal(check(makePull(), "matchharper/harper_incidents"), "unknown_repo");
  assert.equal(check(makePull(), "someone/harper_beta"), "unknown_repo");
  assert.equal(
    check(makePull({ head: { ref: "fix/incident-44-x", repo: { full_name: "someone/harper_beta" }, sha: SHA } })),
    "fork"
  );
  assert.equal(check(makePull({ head: { ref: "fix/incident-44-x", repo: null, sha: SHA } })), "fork");
  assert.equal(
    check(makePull({ head: { ref: "feat/incident-44", repo: { full_name: "matchharper/harper_beta" }, sha: SHA } })),
    "branch_prefix"
  );
  assert.equal(check(makePull({ base: { ref: "main" } })), "wrong_base");
  assert.equal(check(makeWorkerPull({ base: { ref: "dev" } }), "matchharper/harper_worker"), "wrong_base");
  assert.equal(check(makePull({ draft: true })), "draft");
});

test("TL;DR is the text under its heading, up to 3 lines and 500 characters", () => {
  assert.deepEqual(extractFixerPrTldr(makePull().body), [
    "• 리뷰 취소가 저장되지 않던 문제를 고쳐요.",
    "• 취소하면 목록에서 바로 사라져요.",
  ]);
  assert.deepEqual(extractFixerPrTldr("## 문제\n내용"), []);
  assert.deepEqual(extractFixerPrTldr(null), []);
  assert.deepEqual(
    extractFixerPrTldr("### TLDR\r\n<!-- 세 줄 이내\r\n로 써 주세요 -->\r\n첫째\r\n\r\n둘째\r\n셋째\r\n넷째"),
    ["첫째", "둘째", "셋째"]
  );
  const long = extractFixerPrTldr(`## TL;DR\n${"가".repeat(300)}\n${"나".repeat(300)}`);
  assert.equal(long.length, 2);
  assert.equal(long[0], "가".repeat(300));
  assert.equal(long[1], `${"나".repeat(199)}…`);
  assert.equal(Array.from(long.join("")).length, 500);
});

test("incident number comes from the branch, else the body's 관련 사건 line", () => {
  assert.equal(parseFixerPrIncidentNumber({ branch: "fix/incident-44-review-cancel" }), 44);
  assert.equal(parseFixerPrIncidentNumber({ branch: "fix/incident-7" }), 7);
  assert.equal(
    parseFixerPrIncidentNumber({
      body: "관련 사건: matchharper/harper_incidents#45\n\n본문",
      branch: "fix/incident-review-cancel",
    }),
    45
  );
  assert.equal(
    parseFixerPrIncidentNumber({
      body: "관련 사건: https://github.com/matchharper/harper_incidents/issues/46",
    }),
    46
  );
  assert.equal(
    parseFixerPrIncidentNumber({
      body: "관련 사건: matchharper/harper_incidents#45",
      branch: "fix/incident-44-x",
    }),
    44
  );
  assert.equal(parseFixerPrIncidentNumber({ body: "관련 사건: other/repo#3", branch: "fix/x" }), null);
});

test("open card: PR line, TL;DR, target and commit, and two confirmed buttons", () => {
  const card = buildFixerPrOpenCard({ pull: makePull(), repo: "harper_beta" });
  assert.equal(
    textOf(card),
    [
      "*수정 PR · 머지할지 정해 주세요*",
      `${INCIDENT_LINK} fix(review): 리뷰 취소가 저장되지 않아요 → ${PR_LINK}`,
      "> • 리뷰 취소가 저장되지 않던 문제를 고쳐요.",
      "> • 취소하면 목록에서 바로 사라져요.",
      "대상 `dev` · 커밋 `3f2a9c1` · 머지하면 dev까지 들어가요. 운영은 다음 릴리스 때 반영돼요.",
    ].join("\n")
  );
  assert.doesNotMatch(textOf(card), /누를 수 있는 사람|<@/);
  const [merge, close] = actionsOf(card)?.elements ?? [];
  assert.equal(merge.action_id, FIXER_PR_MERGE_ACTION_ID);
  assert.equal(merge.style, "primary");
  assert.equal(merge.text.text, "머지");
  assert.equal(merge.confirm.text.text, "harper_beta #230을 dev에 머지할까요?");
  assert.equal(merge.confirm.confirm.text, "머지");
  assert.equal(merge.confirm.deny.text, "취소");
  assert.equal(close.action_id, FIXER_PR_CLOSE_ACTION_ID);
  assert.equal(close.style, undefined);
  assert.equal(close.text.text, "머지 안 함");
  assert.equal(close.confirm.text.text, "PR을 닫을까요? 머지하지 않아요.");
  assert.equal(close.confirm.confirm.text, "닫기");
  assert.equal(close.confirm.deny.text, "취소");
  for (const button of [merge, close]) {
    assert.deepEqual(JSON.parse(button.value), { repo: "harper_beta", pr: 230, sha: SHA, base: "dev" });
    assert.deepEqual(parseFixerPrButtonValue(button.value), buttonValue());
  }
  assert.deepEqual(card.metadata, {
    event_payload: { pr: 230, repo: "harper_beta", sha: SHA },
    event_type: FIXER_PR_SLACK_EVENT_TYPE,
  });
});

test("open card for harper_worker, without TL;DR, and with Slack-safe TL;DR text", () => {
  const worker = buildFixerPrOpenCard({ pull: makeWorkerPull(), repo: "harper_worker" });
  assert.match(
    textOf(worker),
    /대상 `main` · 커밋 `3f2a9c1` · 머지하면 main에 들어가요\. 서버 반영\(재시작\)은 따로 해야 해요\.$/
  );
  assert.equal(actionsOf(worker)?.elements?.[0].confirm.text.text, "harper_worker #12를 main에 머지할까요?");
  const bare = buildFixerPrOpenCard({ pull: makePull({ body: "본문만 있어요" }), repo: "harper_beta" });
  assert.doesNotMatch(textOf(bare), /^> /m);
  assert.equal(textOf(bare).split("\n").length, 3);
  const formatted = buildFixerPrOpenCard({
    pull: makePull({
      body: "## TL;DR\n**원인**: [로그](https://example.com/run/1) 에서 <b>태그</b> & 값",
      head: { ref: "fix/incident-44-x", repo: { full_name: "matchharper/harper_beta" }, sha: SHA },
      title: "fix: <script> & 제목",
    }),
    repo: "harper_beta",
  });
  assert.match(textOf(formatted), /^> \*원인\*: <https:\/\/example\.com\/run\/1\|로그> 에서 &lt;b&gt;태그&lt;\/b&gt; &amp; 값$/m);
  assert.match(textOf(formatted), /fix: &lt;script&gt; &amp; 제목 →/);
});

test("final and base-changed cards keep the PR link and have no buttons", () => {
  const merged = buildFixerPrFinalCard({
    at: NOW,
    by: ALLOWED_USER,
    mergeSha: MERGE_SHA,
    outcome: "merged",
    pull: makePull(),
    repo: "harper_beta",
  });
  assert.equal(
    textOf(merged),
    `✅ 머지됨 · <@U0C8E9KPMSA> · 11/2 11:52 · \`dev\` 커밋 \`7c1e0d2\`\n${INCIDENT_LINK} fix(review): 리뷰 취소가 저장되지 않아요 → ${PR_LINK}`
  );
  const onGitHub = buildFixerPrFinalCard({
    at: "2026-11-02T03:05:00Z",
    outcome: "merged",
    pull: makePull({ merge_commit_sha: MERGE_SHA, merged: true }),
    repo: "harper_beta",
  });
  assert.match(textOf(onGitHub), /^✅ 머지됨 · \(GitHub에서\) · 11\/2 12:05 · `dev` 커밋 `7c1e0d2`$/m);
  const closed = buildFixerPrFinalCard({ by: OTHER_ALLOWED_USER, outcome: "closed", pull: makePull(), repo: "harper_beta" });
  assert.match(textOf(closed), /^닫힘 · 머지 안 함 · <@U09B4FF7TV0>$/m);
  const closedOnGitHub = buildFixerPrFinalCard({ outcome: "closed", pull: makePull(), repo: "harper_beta" });
  assert.match(textOf(closedOnGitHub), /^닫힘 · 머지 안 함 · \(GitHub에서\)$/m);
  const baseChanged = buildFixerPrBaseChangedCard({ pull: makePull({ base: { ref: "main" } }), repo: "harper_beta" });
  assert.match(textOf(baseChanged), /^대상 브랜치가 바뀌었어요: `dev` → `main` · 버튼을 껐어요\. GitHub에서 확인해 주세요\.$/m);
  for (const card of [merged, onGitHub, closed, closedOnGitHub, baseChanged]) {
    assert.equal(actionsOf(card), undefined);
    assert.ok(textOf(card).includes(PR_LINK));
    assert.equal(card.metadata.event_type, FIXER_PR_SLACK_EVENT_TYPE);
  }
});

test("card times are Asia/Seoul M/D HH:mm", () => {
  assert.equal(formatFixerPrSeoulTime(NOW), "11/2 11:52");
  assert.equal(formatFixerPrSeoulTime("2026-11-01T15:05:00Z"), "11/2 00:05");
  assert.equal(formatFixerPrSeoulTime(null), null);
  assert.equal(formatFixerPrSeoulTime("not a date"), null);
});

test("decideFixerPrAction covers every outcome of a press", () => {
  const decide = (pull: FixerPrPull, action: "merge" | "close" = "merge") =>
    decideFixerPrAction({ action, pull, value: buttonValue() });
  assert.equal(decide(makePull()), "merge");
  assert.equal(decide(makePull(), "close"), "close");
  assert.equal(decide(makePull({ merged: true, merged_at: NOW.toISOString(), state: "closed" })), "already_merged");
  assert.equal(decide(makePull({ merged: true, state: "closed" }), "close"), "already_merged");
  assert.equal(decide(makePull({ state: "closed" })), "already_closed");
  assert.equal(decide(makePull({ state: "closed" }), "close"), "already_closed");
  const pushed = makePull({ head: { ...makePull().head, sha: NEW_SHA } });
  assert.equal(decide(pushed), "stale_head");
  assert.equal(decide(pushed, "close"), "stale_head");
  assert.equal(decide(makePull({ base: { ref: "main" } })), "base_changed");
  assert.equal(decide(makePull({ draft: true })), "not_eligible");
  assert.equal(
    decide(makePull({ head: { ref: "fix/incident-44-x", repo: { full_name: "someone/harper_beta" }, sha: SHA } })),
    "not_eligible"
  );
  assert.equal(
    decide(makePull({ head: { ref: "hotfix/44", repo: { full_name: "matchharper/harper_beta" }, sha: SHA } })),
    "not_eligible"
  );
});

test("button values are validated strictly", () => {
  const parse = (value: unknown) => parseFixerPrButtonValue(JSON.stringify(value));
  assert.deepEqual(parse(buttonValue()), buttonValue());
  assert.deepEqual(parse({ base: "main", pr: 12, repo: "harper_worker", sha: SHA }), {
    base: "main",
    pr: 12,
    repo: "harper_worker",
    sha: SHA,
  });
  assert.equal(parse({ ...buttonValue(), repo: "harper_incidents" }), null);
  assert.equal(parse({ ...buttonValue(), repo: "constructor" }), null);
  assert.equal(parse({ ...buttonValue(), pr: 0 }), null);
  assert.equal(parse({ ...buttonValue(), pr: 1.5 }), null);
  assert.equal(parse({ ...buttonValue(), pr: "230" }), null);
  assert.equal(parse({ ...buttonValue(), sha: SHA.toUpperCase() }), null);
  assert.equal(parse({ ...buttonValue(), sha: SHA.slice(0, 7) }), null);
  assert.equal(parse({ ...buttonValue(), base: "main" }), null);
  assert.equal(parseFixerPrButtonValue("not json"), null);
  assert.equal(parseFixerPrButtonValue(undefined), null);
});

test("Vault secrets are cached for five minutes; a missing secret or failed query turns the feature off", async (t) => {
  t.mock.method(console, "warn", () => {});
  let now = 0;
  let queries = 0;
  let rows: Array<{ decrypted_secret: string; name: string }> = [
    { decrypted_secret: " github-token \n", name: "fixer_github_token" },
    { decrypted_secret: "hook-secret", name: "fixer_github_webhook_secret" },
  ];
  const load = createFixerPrSecretsLoader({
    now: () => now,
    query: async (names) => {
      queries += 1;
      assert.deepEqual(names, ["fixer_github_token", "fixer_github_webhook_secret"]);
      return rows;
    },
  });
  assert.deepEqual(await load(), { githubToken: "github-token", webhookSecret: "hook-secret" });
  now = 5 * 60 * 1000 - 1;
  await load();
  assert.equal(queries, 1);
  now = 5 * 60 * 1000;
  rows = rows.slice(0, 1);
  assert.equal(await load(), null);
  assert.equal(await load(), null);
  assert.equal(queries, 3);
  const failing = createFixerPrSecretsLoader({
    query: async () => {
      throw new Error("permission denied for view decrypted_secrets");
    },
  });
  assert.equal(await failing(), null);
});

function slackFake(pages: unknown[][] = [[]], fail?: { method: string; code: string }) {
  const calls: Array<{ body: Record<string, any>; method: string }> = [];
  let historyPage = 0;
  const slack: FixerPrSlackCall = async (method, body) => {
    calls.push({ body, method });
    if (fail?.method === method)
      throw Object.assign(new Error(`Slack API ${method} 실패: ${fail.code}`), { code: fail.code });
    if (method === "conversations.history") {
      const page = historyPage;
      historyPage += 1;
      return {
        messages: pages[page] ?? [],
        response_metadata: { next_cursor: page + 1 < pages.length ? `cursor-${page + 1}` : "" },
      };
    }
    if (method === "chat.postMessage") return { ts: "1762052000.000100" };
    return {};
  };
  return {
    calls,
    history: () => calls.filter((call) => call.method === "conversations.history"),
    slack,
    writes: () => calls.filter((call) => call.method !== "conversations.history"),
  };
}

function delivery(event: string, payload: unknown, secret = WEBHOOK_SECRET) {
  const rawBody = JSON.stringify(payload);
  return { event, rawBody, signature: sign(rawBody, secret) };
}

const prEvent = (action: string, pull: FixerPrPull, extra: Record<string, unknown> = {}) => ({
  action,
  pull_request: pull,
  repository: { full_name: pull.base?.repo?.full_name ?? "matchharper/harper_beta" },
  sender: { login: "fixer-bot" },
  ...extra,
});

const cardMessage = (card: FixerPrCard, ts = "1762050000.000200") => ({
  blocks: card.blocks,
  bot_id: "B0HARPER",
  metadata: card.metadata,
  text: card.text,
  ts,
  type: "message",
});

const webhook = (
  slack: FixerPrSlackCall,
  input: { event: string; rawBody: string; signature: string | null },
  secrets: FixerPrSecrets | null = SECRETS
) => runFixerPrWebhook(input, { loadSecrets: async () => secrets, now: () => NOW, slack });

const parsedBody = (call: { body: Record<string, any> }) => ({
  blocks: JSON.parse(call.body.blocks) as Block[],
  metadata: JSON.parse(call.body.metadata),
});

test("webhook is off without Vault secrets and refuses unsigned deliveries", async () => {
  const fake = slackFake();
  const opened = delivery("pull_request", prEvent("opened", makePull()));
  assert.equal((await webhook(fake.slack, opened, null)).status, 503);
  assert.equal((await webhook(fake.slack, { ...opened, signature: null })).status, 401);
  const forged = delivery("pull_request", prEvent("opened", makePull()), "guessed-secret");
  assert.equal((await webhook(fake.slack, forged)).status, 401);
  assert.equal(fake.calls.length, 0);
});

test("ping and other events are acknowledged without touching Slack", async () => {
  const fake = slackFake();
  const ping = await webhook(fake.slack, delivery("ping", { zen: "Keep it logically awesome." }));
  assert.deepEqual(ping, { body: { ok: true, status: "pong" }, status: 200 });
  const issue = await webhook(fake.slack, delivery("issues", { action: "opened" }));
  assert.equal(issue.status, 200);
  assert.equal(issue.body.ignored, true);
  const broken = await webhook(fake.slack, { event: "pull_request", rawBody: "{", signature: sign("{") });
  assert.equal(broken.status, 400);
  assert.equal(fake.calls.length, 0);
});

test("opened posts the card with the PR metadata", async () => {
  const fake = slackFake([[{ text: "다른 메시지", ts: "1762040000.000100" }]]);
  const result = await webhook(fake.slack, delivery("pull_request", prEvent("opened", makePull())));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    action: "opened",
    ok: true,
    pr: 230,
    repo: "harper_beta",
    result: "posted",
    ts: "1762052000.000100",
  });
  const [history] = fake.history();
  assert.deepEqual(history.body, {
    channel: FIXER_PR_SLACK_CHANNEL_ID,
    include_all_metadata: true,
    limit: 200,
    oldest: String(Math.floor(NOW.getTime() / 1000) - 30 * 24 * 60 * 60),
  });
  const [post] = fake.writes();
  assert.equal(post.method, "chat.postMessage");
  assert.equal(post.body.channel, FIXER_PR_SLACK_CHANNEL_ID);
  assert.equal(post.body.unfurl_links, false);
  const { blocks, metadata } = parsedBody(post);
  assert.deepEqual(metadata, {
    event_payload: { pr: 230, repo: "harper_beta", sha: SHA },
    event_type: FIXER_PR_SLACK_EVENT_TYPE,
  });
  assert.ok(blocks.some((block) => block.type === "actions"));
  assert.match(post.body.text, /^수정 PR · 머지할지 정해 주세요: harper_beta #230/);
});

test("a redelivered opened updates the existing card instead of posting again", async () => {
  const existing = buildFixerPrOpenCard({ pull: makePull(), repo: "harper_beta" });
  const otherPr = buildFixerPrOpenCard({ pull: makePull({ number: 231 }), repo: "harper_beta" });
  const fake = slackFake([[cardMessage(otherPr, "1762051000.000300"), cardMessage(existing)]]);
  const result = await webhook(fake.slack, delivery("pull_request", prEvent("opened", makePull())));
  assert.equal(result.body.result, "updated");
  const [update] = fake.writes();
  assert.equal(fake.writes().length, 1);
  assert.equal(update.method, "chat.update");
  assert.equal(update.body.ts, "1762050000.000200");
  assert.equal(update.body.channel, FIXER_PR_SLACK_CHANNEL_ID);
  assert.doesNotMatch(parsedBody(update).blocks[0].text?.text ?? "", /커밋이 바뀌었어요/);
});

test("synchronize moves the card to the new head commit", async () => {
  const existing = buildFixerPrOpenCard({ pull: makePull(), repo: "harper_beta" });
  const fake = slackFake([[], [cardMessage(existing)]]);
  const pushed = makePull({ head: { ...makePull().head, sha: NEW_SHA } });
  const result = await webhook(fake.slack, delivery("pull_request", prEvent("synchronize", pushed)));
  assert.equal(result.body.result, "updated");
  assert.equal(fake.history().length, 2);
  assert.equal(fake.history()[1].body.cursor, "cursor-1");
  const [update] = fake.writes();
  const { blocks, metadata } = parsedBody(update);
  assert.match(blocks[0].text?.text ?? "", /^커밋이 바뀌었어요: `3f2a9c1` → `9b8c7d6`$/m);
  assert.match(blocks[0].text?.text ?? "", /^대상 `dev` · 커밋 `9b8c7d6`/m);
  assert.equal(metadata.event_payload.sha, NEW_SHA);
  const actions = blocks.find((block) => block.type === "actions");
  assert.equal(JSON.parse(actions?.elements?.[0].value).sha, NEW_SHA);
});

test("synchronize posts a card when none is found within three history pages", async () => {
  const existing = buildFixerPrOpenCard({ pull: makePull(), repo: "harper_beta" });
  const fake = slackFake([[], [], [], [cardMessage(existing)]]);
  const result = await webhook(fake.slack, delivery("pull_request", prEvent("synchronize", makePull())));
  assert.equal(result.body.result, "posted");
  assert.equal(fake.history().length, 3);
  assert.equal(fake.writes()[0].method, "chat.postMessage");
});

test("closed finalizes the card, and does nothing without a card", async () => {
  const existing = cardMessage(buildFixerPrOpenCard({ pull: makePull(), repo: "harper_beta" }));
  const mergedPull = makePull({
    merge_commit_sha: MERGE_SHA,
    merged: true,
    merged_at: NOW.toISOString(),
    state: "closed",
  });
  const merged = slackFake([[existing]]);
  const result = await webhook(merged.slack, delivery("pull_request", prEvent("closed", mergedPull)));
  assert.equal(result.body.result, "updated");
  const { blocks } = parsedBody(merged.writes()[0]);
  assert.equal(merged.writes()[0].method, "chat.update");
  assert.match(blocks[0].text?.text ?? "", /^✅ 머지됨 · \(GitHub에서\) · 11\/2 11:52 · `dev` 커밋 `7c1e0d2`$/m);
  assert.equal(blocks.some((block) => block.type === "actions"), false);

  const closed = slackFake([[existing]]);
  await webhook(closed.slack, delivery("pull_request", prEvent("closed", makePull({ state: "closed" }))));
  assert.match(parsedBody(closed.writes()[0]).blocks[0].text?.text ?? "", /^닫힘 · 머지 안 함 · \(GitHub에서\)$/m);

  const none = slackFake([[]]);
  const skipped = await webhook(none.slack, delivery("pull_request", prEvent("closed", mergedPull)));
  assert.deepEqual([skipped.body.result, skipped.body.reason], ["skipped", "no_card"]);
  assert.equal(none.writes().length, 0);
});

test("a card a press already finalized is kept; only reopened brings it back", async () => {
  const pressed = cardMessage(
    buildFixerPrFinalCard({ by: OTHER_ALLOWED_USER, outcome: "closed", pull: makePull({ state: "closed" }), repo: "harper_beta" })
  );
  const closedAgain = slackFake([[pressed]]);
  const closedResult = await webhook(
    closedAgain.slack,
    delivery("pull_request", prEvent("closed", makePull({ state: "closed" })))
  );
  assert.deepEqual([closedResult.body.result, closedResult.body.reason], ["skipped", "final_card"]);
  const redelivered = slackFake([[pressed]]);
  await webhook(redelivered.slack, delivery("pull_request", prEvent("opened", makePull())));
  assert.equal(redelivered.writes().length, 0);
  const reopened = slackFake([[pressed]]);
  const reopenedResult = await webhook(reopened.slack, delivery("pull_request", prEvent("reopened", makePull())));
  assert.equal(reopenedResult.body.result, "updated");
  assert.ok(parsedBody(reopened.writes()[0]).blocks.some((block) => block.type === "actions"));
});

test("a base change turns the buttons off; a title edit only refreshes an existing card", async () => {
  const existing = cardMessage(buildFixerPrOpenCard({ pull: makePull(), repo: "harper_beta" }));
  const retargeted = slackFake([[existing]]);
  const result = await webhook(
    retargeted.slack,
    delivery(
      "pull_request",
      prEvent("edited", makePull({ base: { ref: "main", repo: { full_name: "matchharper/harper_beta" } } }), {
        changes: { base: { ref: { from: "dev" }, sha: { from: SHA } } },
      })
    )
  );
  assert.equal(result.body.result, "updated");
  const { blocks } = parsedBody(retargeted.writes()[0]);
  assert.match(blocks[0].text?.text ?? "", /^대상 브랜치가 바뀌었어요: `dev` → `main` · 버튼을 껐어요\./);
  assert.equal(blocks.some((block) => block.type === "actions"), false);

  const titleOnly = slackFake([[]]);
  const edited = await webhook(
    titleOnly.slack,
    delivery("pull_request", prEvent("edited", makePull(), { changes: { title: { from: "이전 제목" } } }))
  );
  assert.deepEqual([edited.body.result, edited.body.reason], ["skipped", "no_card"]);
  assert.equal(titleOnly.writes().length, 0);
});

test("PRs the buttons must not act on never reach Slack", async () => {
  const fake = slackFake();
  const cases: Array<[string, Record<string, unknown>]> = [
    [
      "fork",
      prEvent("opened", makePull({ head: { ref: "fix/incident-44-x", repo: { full_name: "someone/harper_beta" }, sha: SHA } })),
    ],
    [
      "branch_prefix",
      prEvent("opened", makePull({ head: { ref: "feature/review", repo: { full_name: "matchharper/harper_beta" }, sha: SHA } })),
    ],
    ["wrong_base", prEvent("opened", makePull({ base: { ref: "main", repo: { full_name: "matchharper/harper_beta" } } }))],
    ["draft", prEvent("opened", makePull({ draft: true }))],
    ["unknown_repo", { ...prEvent("opened", makePull()), repository: { full_name: "matchharper/harper_incidents" } }],
    ["action_labeled", prEvent("labeled", makePull())],
  ];
  for (const [reason, payload] of cases) {
    const result = await webhook(fake.slack, delivery("pull_request", payload));
    assert.equal(result.status, 200, reason);
    assert.equal(result.body.reason, reason);
  }
  assert.equal(fake.calls.length, 0);
});

test("a Slack failure answers 500 so GitHub records a failed delivery", async (t) => {
  t.mock.method(console, "error", () => {});
  const fake = slackFake([[]], { code: "not_in_channel", method: "chat.postMessage" });
  const result = await webhook(fake.slack, delivery("pull_request", prEvent("opened", makePull())));
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "slack_failed");
  assert.equal(result.body.code, "not_in_channel");
});

function githubFake(routes: {
  close?: { body: unknown; status: number };
  merge?: { body: unknown; status: number };
  pulls?: FixerPrPull[];
} = {}) {
  const requests: Array<{
    body: Record<string, unknown> | null;
    headers: Record<string, string>;
    method: string;
    url: string;
  }> = [];
  let reads = 0;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
      method,
      url: String(input),
    });
    if (method === "GET") {
      const pulls = routes.pulls ?? [makePull()];
      return json(200, pulls[Math.min(reads++, pulls.length - 1)]);
    }
    if (method === "PUT")
      return json(
        routes.merge?.status ?? 200,
        routes.merge?.body ?? { merged: true, message: "Pull Request successfully merged", sha: MERGE_SHA }
      );
    return json(routes.close?.status ?? 200, routes.close?.body ?? makePull({ state: "closed" }));
  }) as typeof fetch;
  return { fetchImpl, requests, writes: () => requests.filter((request) => request.method !== "GET") };
}

function clickHarness(
  options: {
    github?: ReturnType<typeof githubFake>;
    refuse?: (body: Record<string, unknown>) => boolean;
    secrets?: FixerPrSecrets | null;
  } = {}
) {
  const github = options.github ?? githubFake();
  const responses: Array<{ body: Record<string, any>; url: string }> = [];
  const tasks: Promise<void>[] = [];
  const counters = { githubClients: 0, secretLoads: 0 };
  const deps: FixerPrClickDeps = {
    github: (token) => {
      counters.githubClients += 1;
      return createFixerPrGitHubClient({ fetch: github.fetchImpl, token });
    },
    loadSecrets: async () => {
      counters.secretLoads += 1;
      return options.secrets === undefined ? SECRETS : options.secrets;
    },
    now: () => NOW,
    respond: async (url, body) => {
      if (options.refuse?.(body)) throw new Error("Slack response_url 400: invalid_payload");
      responses.push({ body, url });
    },
    schedule: (task) => {
      tasks.push(task());
    },
  };
  return {
    counters,
    deps,
    flush: async () => {
      await Promise.all(tasks);
    },
    github,
    responses,
    tasks,
  };
}

function press(overrides: Record<string, unknown> = {}, actionId = FIXER_PR_MERGE_ACTION_ID, value: unknown = buttonValue()) {
  return {
    actions: [{ action_id: actionId, value: typeof value === "string" ? value : JSON.stringify(value) }],
    api_app_id: "A_HARPER",
    channel: { id: FIXER_PR_SLACK_CHANNEL_ID },
    container: { channel_id: FIXER_PR_SLACK_CHANNEL_ID, message_ts: "1762050000.000200" },
    response_url: RESPONSE_URL,
    team: { id: FIXER_PR_SLACK_TEAM_ID },
    type: "block_actions",
    user: { id: ALLOWED_USER },
    ...overrides,
  };
}

test("other Slack actions are left to the other handlers", async () => {
  const harness = clickHarness();
  assert.equal(
    await routeFixerPrSlackAction({ actions: [{ action_id: "harper_role_start_skip" }], type: "block_actions" }, harness.deps),
    null
  );
  assert.equal(await routeFixerPrSlackAction({ type: "view_submission" }, harness.deps), null);
  assert.equal(harness.tasks.length, 0);
});

test("a press from another workspace, channel, or person never reaches GitHub", async () => {
  const harness = clickHarness();
  const otherTeam = await routeFixerPrSlackAction(press({ team: { id: "T0CUSTOMER1" } }), harness.deps);
  const otherChannel = await routeFixerPrSlackAction(
    press({ channel: { id: "C0OTHER0001" }, container: { channel_id: "C0OTHER0001" } }),
    harness.deps
  );
  assert.equal(otherTeam?.ignored, true);
  assert.equal(otherChannel?.ignored, true);
  assert.equal(harness.tasks.length, 0);
  const stranger = await routeFixerPrSlackAction(press({ user: { id: "U0STRANGER1" } }), harness.deps);
  assert.equal(stranger?.status, "fixer_pr_not_allowed");
  await harness.flush();
  assert.deepEqual(harness.responses, [
    {
      body: { replace_original: false, response_type: "ephemeral", text: FIXER_PR_NOT_ALLOWED_TEXT },
      url: RESPONSE_URL,
    },
  ]);
  assert.deepEqual(harness.counters, { githubClients: 0, secretLoads: 0 });
  assert.equal(harness.github.requests.length, 0);
});

test("an allowed press on [머지] merges the commit on the card with a merge commit", async () => {
  const harness = clickHarness();
  const ack = await routeFixerPrSlackAction(press(), harness.deps);
  assert.deepEqual(ack, { ok: true, status: "fixer_pr_merge_started" });
  await harness.flush();
  const [read, merge] = harness.github.requests;
  assert.equal(read.method, "GET");
  assert.equal(read.url, "https://api.github.com/repos/matchharper/harper_beta/pulls/230");
  assert.equal(merge.method, "PUT");
  assert.equal(merge.url, "https://api.github.com/repos/matchharper/harper_beta/pulls/230/merge");
  assert.deepEqual(merge.body, { merge_method: "merge", sha: SHA });
  assert.equal(merge.headers.Authorization, "Bearer github-token-for-tests");
  assert.equal(merge.headers.Accept, "application/vnd.github+json");
  assert.equal(merge.headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.ok(merge.headers["User-Agent"]);
  assert.equal(harness.responses.length, 1);
  const [{ body, url }] = harness.responses;
  assert.equal(url, RESPONSE_URL);
  assert.equal(body.replace_original, true);
  assert.equal(actionsOf(body as FixerPrCard), undefined);
  assert.match(textOf(body as FixerPrCard), /^✅ 머지됨 · <@U0C8E9KPMSA> · 11\/2 11:52 · `dev` 커밋 `7c1e0d2`$/m);
  assert.ok(textOf(body as FixerPrCard).includes(PR_LINK));
  assert.equal(body.metadata.event_type, FIXER_PR_SLACK_EVENT_TYPE);
});

test("[머지 안 함] closes the PR without merging", async () => {
  const harness = clickHarness();
  await routeFixerPrSlackAction(press({ user: { id: OTHER_ALLOWED_USER } }, FIXER_PR_CLOSE_ACTION_ID), harness.deps);
  await harness.flush();
  const writes = harness.github.writes();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "PATCH");
  assert.equal(writes[0].url, "https://api.github.com/repos/matchharper/harper_beta/pulls/230");
  assert.deepEqual(writes[0].body, { state: "closed" });
  const card = harness.responses[0].body as FixerPrCard;
  assert.match(textOf(card), /^닫힘 · 머지 안 함 · <@U09B4FF7TV0>$/m);
  assert.equal(actionsOf(card), undefined);
});

test("a new commit after the card was posted re-renders the buttons instead of merging", async () => {
  const github = githubFake({ pulls: [makePull({ head: { ...makePull().head, sha: NEW_SHA } })] });
  const harness = clickHarness({ github });
  await routeFixerPrSlackAction(press(), harness.deps);
  await harness.flush();
  assert.equal(github.writes().length, 0);
  const card = harness.responses[0].body as FixerPrCard;
  assert.match(textOf(card), /^커밋이 바뀌었어요: `3f2a9c1` → `9b8c7d6`$/m);
  assert.match(textOf(card), /다시 눌러 주세요/);
  assert.equal(JSON.parse(actionsOf(card)?.elements?.[0].value).sha, NEW_SHA);
  assert.equal(card.metadata.event_payload.sha, NEW_SHA);
});

test("a PR merged, closed, or retargeted on GitHub only updates the card", async () => {
  const cases: Array<[FixerPrPull, RegExp, boolean]> = [
    [makePull({ merge_commit_sha: MERGE_SHA, merged: true, merged_at: NOW.toISOString(), state: "closed" }), /^✅ 머지됨 · \(GitHub에서\) · 11\/2 11:52/m, false],
    [makePull({ state: "closed" }), /^닫힘 · 머지 안 함 · \(GitHub에서\)$/m, false],
    [makePull({ base: { ref: "main" } }), /^대상 브랜치가 바뀌었어요: `dev` → `main`/m, false],
    [makePull({ draft: true }), /^초안 상태라 버튼을 껐어요\./m, false],
  ];
  for (const [pull, expected, hasButtons] of cases) {
    const github = githubFake({ pulls: [pull] });
    const harness = clickHarness({ github });
    await routeFixerPrSlackAction(press(), harness.deps);
    await harness.flush();
    assert.equal(github.writes().length, 0);
    const card = harness.responses[0].body as FixerPrCard;
    assert.match(textOf(card), expected);
    assert.equal(Boolean(actionsOf(card)), hasButtons);
  }
});

test("GitHub refusals keep the buttons only where pressing again can work", async (t) => {
  t.mock.method(console, "warn", () => {});
  const notMergeable = githubFake({ merge: { body: { message: "Pull Request is not mergeable" }, status: 405 } });
  const retry = clickHarness({ github: notMergeable });
  await routeFixerPrSlackAction(press(), retry.deps);
  await retry.flush();
  const retryCard = retry.responses[0].body as FixerPrCard;
  assert.match(textOf(retryCard), /⚠️ 지금은 머지할 수 없어요 \(GitHub 405 · Pull Request is not mergeable\)/);
  assert.ok(actionsOf(retryCard));

  const forbidden = githubFake({
    merge: { body: { message: "Resource not accessible by personal access token" }, status: 403 },
  });
  const refused = clickHarness({ github: forbidden });
  await routeFixerPrSlackAction(press(), refused.deps);
  await refused.flush();
  const refusedCard = refused.responses[0].body as FixerPrCard;
  assert.match(textOf(refusedCard), /⚠️ GitHub이 거절했어요 \(GitHub 403 · Resource not accessible/);
  assert.equal(actionsOf(refusedCard), undefined);

  const headMoved = githubFake({
    merge: { body: { message: "Head branch was modified. Review and try the merge again." }, status: 409 },
    pulls: [makePull(), makePull({ head: { ...makePull().head, sha: NEW_SHA } })],
  });
  const moved = clickHarness({ github: headMoved });
  await routeFixerPrSlackAction(press(), moved.deps);
  await moved.flush();
  const movedCard = moved.responses[0].body as FixerPrCard;
  assert.match(textOf(movedCard), /커밋이 바뀌었어요: `3f2a9c1` → `9b8c7d6`/);
  assert.equal(JSON.parse(actionsOf(movedCard)?.elements?.[0].value).sha, NEW_SHA);

  const raced = githubFake({
    close: { body: { message: "Validation Failed" }, status: 422 },
    pulls: [makePull(), makePull({ merge_commit_sha: MERGE_SHA, merged: true, merged_at: NOW.toISOString(), state: "closed" })],
  });
  const lateClose = clickHarness({ github: raced });
  await routeFixerPrSlackAction(press({}, FIXER_PR_CLOSE_ACTION_ID), lateClose.deps);
  await lateClose.flush();
  assert.match(textOf(lateClose.responses[0].body as FixerPrCard), /^✅ 머지됨 · \(GitHub에서\)/m);
});

test("a card Slack refuses after a merge is retried without metadata, never treated as a GitHub refusal", async (t) => {
  t.mock.method(console, "warn", () => {});
  const harness = clickHarness({ refuse: (body) => "metadata" in body });
  await routeFixerPrSlackAction(press(), harness.deps);
  await harness.flush();
  assert.deepEqual(
    harness.github.requests.map((request) => request.method),
    ["GET", "PUT"]
  );
  assert.equal(harness.responses.length, 1);
  const { body } = harness.responses[0];
  assert.equal(body.replace_original, true);
  assert.equal("metadata" in body, false);
  assert.match(textOf(body as FixerPrCard), /^✅ 머지됨 · <@U0C8E9KPMSA> · 11\/2 11:52/m);
});

test("without Vault secrets a press gets a short notice and GitHub is not called", async (t) => {
  t.mock.method(console, "warn", () => {});
  const harness = clickHarness({ secrets: null });
  await routeFixerPrSlackAction(press(), harness.deps);
  await harness.flush();
  assert.deepEqual(harness.responses[0].body, {
    replace_original: false,
    response_type: "ephemeral",
    text: FIXER_PR_UNAVAILABLE_TEXT,
  });
  assert.equal(harness.counters.githubClients, 0);
});

test("a malformed button value is ignored without scheduling work", async () => {
  const harness = clickHarness();
  const result = await routeFixerPrSlackAction(press({}, FIXER_PR_MERGE_ACTION_ID, { ...buttonValue(), sha: "abc" }), harness.deps);
  assert.equal(result?.ignored, true);
  assert.equal(harness.tasks.length, 0);
});

test("GitHub client errors carry the HTTP status, or 0 without a response", async () => {
  const notFound = createFixerPrGitHubClient({
    fetch: (async () =>
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })) as typeof fetch,
    token: "token",
  });
  await assert.rejects(
    notFound.getPull("harper_beta", 230),
    (error: unknown) => error instanceof FixerPrGitHubError && error.status === 404 && error.message === "Not Found"
  );
  const offline = createFixerPrGitHubClient({
    fetch: (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
    token: "token",
  });
  await assert.rejects(
    offline.mergePull("harper_beta", 230, SHA),
    (error: unknown) => error instanceof FixerPrGitHubError && error.status === 0
  );
});

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  buildFixerChoiceCard,
  buildFixerChoicePickedCard,
  createFixerWake,
  createFixerWakeConfigLoader,
  FIXER_CHOICE_ACTION_IDS,
  parseFixerQaMarker,
  routeFixerChoiceSlackAction,
  runFixerIncidentComment,
  type FixerChoiceClickDeps,
  type FixerQaMarker,
} from "./fixerIncidentSlack";
import {
  FIXER_DEPLOY_NOT_ALLOWED_TEXT,
  FIXER_PR_SLACK_CHANNEL_ID,
  FIXER_PR_SLACK_TEAM_ID,
  runFixerPrWebhook,
  type FixerPrSlackCall,
  type FixerWakeResult,
} from "./fixerPrSlack";

const BOT_USER = "U0BL4BE6EBH";
const ALLOWED_USER = "U0C8E9KPMSA";
const OTHER_MERGER = "U09B4FF7TV0";
const WEBHOOK_SECRET = "webhook-secret-for-tests";
const COMMENT_ID = 6728801751;
const DIGEST_TS = "1794188293.867359";
const POSTED_TS = "1794216000.000100";
const CARD_TS = "1794216100.000200";
const RESPONSE_URL = "https://hooks.slack.com/actions/T09ASGLN207/1/response";
/** 11/9 18:40 in Seoul. */
const NOW = new Date("2026-11-09T09:40:00Z");
const FIRE_URL = "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJKLMNOPQRSTUVW/fire";

const choiceJson = {
  incident: 87,
  kind: "choice",
  lines: ["없는 공고 번호가 오면 500으로 끝나 그 회차 추천이 통째로 빠짐", "고칠 곳: DB 함수 `write_career_opportunities` 한 줄"],
  recommended: "pr",
  title: "Career 추천 저장 500 오류",
};
const commentBody = (json: unknown) =>
  `#qa에 선택 카드를 올려요.\n\n<!-- harper-qa\n${JSON.stringify(json)}\n-->\n\n— 수정 에이전트`;

type Block = { block_id?: string; elements?: Array<Record<string, any>>; text?: { text?: string }; type: string };

function slackFake(history: unknown[] = [], fail?: { code: string; method: string }) {
  const calls: Array<{ body: Record<string, any>; method: string }> = [];
  const slack: FixerPrSlackCall = async (method, body) => {
    calls.push({ body, method });
    if (fail?.method === method)
      throw Object.assign(new Error(`Slack API ${method} 실패: ${fail.code}`), { code: fail.code });
    if (method === "conversations.history") return { messages: history };
    if (method === "chat.postMessage") return { ts: POSTED_TS };
    return {};
  };
  return {
    calls,
    slack,
    writes: () => calls.filter((call) => call.method !== "conversations.history"),
  };
}

const blocksIn = (call: { body: Record<string, any> }) => JSON.parse(call.body.blocks) as Block[];

const digest = (incident = 87, ts = DIGEST_TS) => ({
  blocks: [{ block_id: "x1", type: "rich_text" }],
  text: `• *추천 저장이 500으로 끝나요* <https://github.com/matchharper/harper_incidents/issues/${incident}|#${incident}>`,
  ts,
  type: "message",
  user: BOT_USER,
});

const commentEvent = (overrides: { action?: string; body?: string; comment?: Record<string, unknown>; issue?: Record<string, unknown>; repository?: string } = {}) => ({
  action: overrides.action ?? "created",
  comment: {
    author_association: "MEMBER",
    body: overrides.body ?? commentBody(choiceJson),
    id: COMMENT_ID,
    user: { login: "fixer" },
    ...overrides.comment,
  },
  issue: { number: 87, ...overrides.issue },
  repository: { full_name: overrides.repository ?? "matchharper/harper_incidents" },
});

const sign = (body: string) => `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")}`;

function webhook(history: unknown[] = [digest()], fail?: { code: string; method: string }) {
  const slack = slackFake(history, fail);
  const deps = { botUserId: async () => BOT_USER, now: () => NOW, slack: slack.slack };
  return {
    deliver: (payload: unknown, event = "issue_comment") => {
      const rawBody = JSON.stringify(payload);
      return runFixerPrWebhook(
        { event, rawBody, signature: sign(rawBody) },
        {
          botUserId: deps.botUserId,
          github: () => {
            throw new Error("GitHub is not read for issue comments");
          },
          incidentComment: (body) => runFixerIncidentComment(body, deps),
          loadSecrets: async () => ({ githubToken: "token", webhookSecret: WEBHOOK_SECRET }),
          now: () => NOW,
          slack: slack.slack,
        }
      );
    },
    slack,
  };
}

const DEFAULT_OPTIONS = ["pr", "deploy", "decline"];

test("harper-qa blocks: a choice or a notice, strictly", () => {
  assert.deepEqual(parseFixerQaMarker(commentBody(choiceJson)), { ...choiceJson, options: DEFAULT_OPTIONS });
  assert.deepEqual(parseFixerQaMarker(commentBody({ ...choiceJson, recommended: undefined })), {
    ...choiceJson,
    options: DEFAULT_OPTIONS,
    recommended: "pr",
  });
  assert.deepEqual(
    parseFixerQaMarker(commentBody({ ...choiceJson, options: ["ride_along", "wait"], recommended: undefined })),
    { ...choiceJson, options: ["ride_along", "wait"], recommended: "ride_along" }
  );
  assert.deepEqual(parseFixerQaMarker(commentBody({ incident: 87, kind: "notice", text: " 머지됐어요 → dev " })), {
    incident: 87,
    kind: "notice",
    text: "머지됐어요 → dev",
  });
  // The incident's #qa post, when the fixer names it; anything but a Slack timestamp is left out.
  assert.deepEqual(parseFixerQaMarker(commentBody({ ...choiceJson, thread_ts: DIGEST_TS })), {
    ...choiceJson,
    options: DEFAULT_OPTIONS,
    threadTs: DIGEST_TS,
  });
  for (const thread_ts of ["1794188293", "abc.def", 1794188293.867359, " "])
    assert.equal(
      parseFixerQaMarker(commentBody({ incident: 87, kind: "notice", text: "알림", thread_ts }))?.threadTs,
      undefined,
      String(thread_ts)
    );
  const invalid: unknown[] = [
    { ...choiceJson, incident: 0 },
    { ...choiceJson, incident: "87" },
    { ...choiceJson, kind: "card" },
    { ...choiceJson, title: "" },
    { ...choiceJson, title: "두 줄\n제목" },
    { ...choiceJson, title: "가".repeat(121) },
    { ...choiceJson, lines: ["a", "b", "c", "d", "e"] },
    { ...choiceJson, lines: [""] },
    { ...choiceJson, lines: ["가".repeat(201)] },
    { ...choiceJson, lines: "한 줄" },
    { ...choiceJson, recommended: "merge" },
    { ...choiceJson, options: ["ride_along", "wait"], recommended: "pr" },
    { ...choiceJson, options: ["pr"] },
    { ...choiceJson, options: ["pr", "deploy", "decline", "wait"] },
    { ...choiceJson, options: ["pr", "pr"] },
    { ...choiceJson, options: ["pr", "merge"] },
    { ...choiceJson, options: "pr" },
    { incident: 87, kind: "notice", text: "" },
    { incident: 87, kind: "notice", text: "1\n2\n3\n4\n5" },
    { incident: 87, kind: "notice", text: "가".repeat(601) },
  ];
  for (const json of invalid) assert.equal(parseFixerQaMarker(commentBody(json)), null, JSON.stringify(json));
  assert.equal(parseFixerQaMarker("<!-- harper-qa {not json} -->"), null);
  assert.equal(parseFixerQaMarker("그냥 댓글"), null);
  assert.equal(parseFixerQaMarker(null), null);
});

test("choice card: the incident, three buttons with the recommended one leading, and who may pick", () => {
  const card = buildFixerChoiceCard({ marker: CHOICE_MARKER, offer: COMMENT_ID });
  const [question, actions, context] = card.blocks as Block[];
  assert.equal(question.block_id, `harper_fixer_choice:87:${COMMENT_ID}`);
  assert.equal(
    question.text?.text,
    [
      "*<https://github.com/matchharper/harper_incidents/issues/87|사건 #87> · 어떻게 할까요?*",
      "Career 추천 저장 500 오류",
      "> 없는 공고 번호가 오면 500으로 끝나 그 회차 추천이 통째로 빠짐",
      "> 고칠 곳: DB 함수 `write_career_opportunities` 한 줄",
    ].join("\n")
  );
  const buttons = actions.elements ?? [];
  assert.deepEqual(
    buttons.map((button) => [button.action_id, button.text.text, button.style]),
    [
      [FIXER_CHOICE_ACTION_IDS.pr, "PR 작성하기", "primary"],
      [FIXER_CHOICE_ACTION_IDS.deploy, "배포까지 하기", undefined],
      [FIXER_CHOICE_ACTION_IDS.decline, "하지 않기", undefined],
    ]
  );
  assert.equal(buttons[0].confirm, undefined);
  assert.equal(buttons[1].confirm.text.text, "PR부터 머지, 운영 배포까지 수정 에이전트가 이어서 해요. 시작할까요?");
  assert.equal(buttons[2].confirm.text.text, "이 사건은 다시 묻지 않아요. 괜찮을까요?");
  for (const button of buttons) assert.deepEqual(JSON.parse(button.value), { incident: 87, offer: COMMENT_ID });
  assert.equal(context.elements?.[0].text, FIXER_DEPLOY_NOT_ALLOWED_TEXT);
  assert.match(card.text, /^사건 #87 · 어떻게 할까요\? Career 추천 저장 500 오류$/);
  const deployFirst = buildFixerChoiceCard({
    marker: { ...CHOICE_MARKER, recommended: "deploy" },
    offer: COMMENT_ID,
  });
  assert.deepEqual(
    ((deployFirst.blocks[1] as Block).elements ?? []).map((button) => button.style),
    [undefined, "primary", undefined]
  );
  const release = buildFixerChoiceCard({
    marker: {
      ...CHOICE_MARKER,
      lines: ["dev에 같이 나갈 PR 1개: #290 (DB 파일 없음)"],
      options: ["ride_along", "wait"],
      recommended: "wait",
      title: "운영 배포 전에 확인해 주세요",
    },
    offer: COMMENT_ID + 1,
  });
  const releaseButtons = (release.blocks[1] as Block).elements ?? [];
  assert.deepEqual(
    releaseButtons.map((button) => [button.action_id, button.text.text, button.style]),
    [
      [FIXER_CHOICE_ACTION_IDS.ride_along, "같이 내보내기", undefined],
      [FIXER_CHOICE_ACTION_IDS.wait, "기다리기", "primary"],
    ]
  );
  assert.equal(releaseButtons[0].confirm.text.text, "기다리던 다른 작업도 이번 운영 배포에 같이 나가요. 괜찮을까요?");
  assert.equal(releaseButtons[1].confirm, undefined);
});

test("a choice comment posts the card under the incident's #qa post, shown in the channel", async () => {
  const harness = webhook();
  const result = await harness.deliver(commentEvent());
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    comment: COMMENT_ID,
    incident: 87,
    kind: "choice",
    ok: true,
    result: "posted",
    thread_ts: DIGEST_TS,
    ts: POSTED_TS,
  });
  const [post] = harness.slack.writes();
  assert.equal(post.method, "chat.postMessage");
  assert.equal(post.body.channel, FIXER_PR_SLACK_CHANNEL_ID);
  assert.equal(post.body.thread_ts, DIGEST_TS);
  assert.equal(post.body.reply_broadcast, true);
  assert.equal(blocksIn(post)[0].block_id, `harper_fixer_choice:87:${COMMENT_ID}`);
  assert.equal(harness.slack.calls.filter((call) => call.method === "conversations.history").length, 1);
});

test("a member whose organization membership is private (CONTRIBUTOR) is posted too", async () => {
  const harness = webhook();
  const result = await harness.deliver(commentEvent({ comment: { author_association: "CONTRIBUTOR" } }));
  assert.equal(result.body.result, "posted");
});

test("a redelivered comment finds its post and stops", async () => {
  const posted = {
    blocks: [{ block_id: `harper_fixer_choice:87:${COMMENT_ID}`, type: "section" }],
    subtype: "thread_broadcast",
    text: "사건 #87 · 어떻게 할까요?",
    thread_ts: DIGEST_TS,
    ts: POSTED_TS,
    user: BOT_USER,
  };
  const harness = webhook([posted, digest()]);
  const result = await harness.deliver(commentEvent());
  assert.equal(result.body.reason, "already_posted");
  assert.equal(harness.slack.writes().length, 0);
  // The same key from another app is not the bot's post.
  const copy = webhook([{ ...posted, user: "U0OTHERAPP1" }, digest()]);
  assert.equal((await copy.deliver(commentEvent())).body.result, "posted");
});

test("a notice is one line under the incident's post, with the incident link", async () => {
  const harness = webhook();
  await harness.deliver(
    commentEvent({ body: commentBody({ incident: 87, kind: "notice", text: "운영 반영됨(11/9 18:55). [PR](https://github.com/matchharper/harper_beta/pull/301)" }) })
  );
  const [post] = harness.slack.writes();
  assert.equal(post.body.thread_ts, DIGEST_TS);
  assert.equal(post.body.reply_broadcast, true);
  const [block] = blocksIn(post);
  assert.equal(block.block_id, `harper_fixer_notice:87:${COMMENT_ID}`);
  assert.equal(
    block.text?.text,
    "<https://github.com/matchharper/harper_incidents/issues/87|사건 #87> 운영 반영됨(11/9 18:55). <https://github.com/matchharper/harper_beta/pull/301|PR>"
  );
  // No #qa post links the incident: the first post starts at the top.
  const alone = webhook([digest(88)]);
  await alone.deliver(commentEvent());
  assert.equal(alone.slack.writes()[0].body.thread_ts, undefined);
  assert.equal(alone.slack.writes()[0].body.reply_broadcast, undefined);
});

test("the thread the block names wins, and a refused channel read still posts there", async (t) => {
  t.mock.method(console, "warn", () => {});
  const OWN_TS = "1794100000.000300";
  const named = webhook([digest()]);
  const result = await named.deliver(commentEvent({ body: commentBody({ ...choiceJson, thread_ts: OWN_TS }) }));
  assert.equal(result.body.thread_ts, OWN_TS);
  assert.equal(named.slack.writes()[0].body.thread_ts, OWN_TS);
  assert.equal(named.slack.writes()[0].body.reply_broadcast, true);
  // A failed channel read (here rate limited): the post goes out anyway, without the lookup.
  const limited = webhook([digest()], { code: "ratelimited", method: "conversations.history" });
  const sent = await limited.deliver(
    commentEvent({ body: commentBody({ incident: 87, kind: "notice", text: "운영 반영됨", thread_ts: OWN_TS }) })
  );
  assert.equal(sent.status, 200);
  assert.equal(sent.body.result, "posted");
  assert.equal(limited.slack.writes()[0].body.thread_ts, OWN_TS);
  const unnamed = webhook([digest()], { code: "ratelimited", method: "conversations.history" });
  assert.equal((await unnamed.deliver(commentEvent())).body.result, "posted");
  assert.equal(unnamed.slack.writes()[0].body.thread_ts, undefined);
});

test("only new comments with a valid block, from repository members, on that incident are posted", async () => {
  const cases: Array<[unknown, string]> = [
    [commentEvent({ action: "edited" }), "action_edited"],
    [commentEvent({ repository: "matchharper/harper_beta" }), "unknown_repo"],
    [commentEvent({ issue: { pull_request: { url: "x" } } }), "pull_request_comment"],
    [commentEvent({ body: "감시 에이전트 댓글" }), "no_marker"],
    [commentEvent({ comment: { author_association: "NONE" } }), "author_not_member"],
    [commentEvent({ comment: { author_association: "FIRST_TIME_CONTRIBUTOR" } }), "author_not_member"],
    [commentEvent({ issue: { number: 88 } }), "incident_mismatch"],
    [commentEvent({ comment: { id: "6728801751" } }), "invalid_payload"],
  ];
  for (const [payload, reason] of cases) {
    const harness = webhook();
    const result = await harness.deliver(payload);
    assert.equal(result.status, 200, reason);
    assert.equal(result.body.reason, reason);
    assert.equal(harness.slack.calls.length, 0, reason);
  }
});

test("issue comments need the signature like PR deliveries, and a Slack failure answers 500", async (t) => {
  t.mock.method(console, "error", () => {});
  const harness = webhook();
  const rawBody = JSON.stringify(commentEvent());
  const unsigned = await runFixerPrWebhook(
    { event: "issue_comment", rawBody, signature: `sha256=${"0".repeat(64)}` },
    {
      botUserId: async () => BOT_USER,
      github: () => {
        throw new Error("unused");
      },
      incidentComment: () => {
        throw new Error("must not run");
      },
      loadSecrets: async () => ({ githubToken: "token", webhookSecret: WEBHOOK_SECRET }),
      slack: harness.slack.slack,
    }
  );
  assert.equal(unsigned.status, 401);
  const failing = webhook([digest()], { code: "channel_not_found", method: "chat.postMessage" });
  const result = await failing.deliver(commentEvent());
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "slack_failed");
  assert.equal(result.body.code, "channel_not_found");
  // Without the incident handler, issue comments stay ignored as before.
  const rawPing = JSON.stringify(commentEvent());
  const ignored = await runFixerPrWebhook(
    { event: "issue_comment", rawBody: rawPing, signature: sign(rawPing) },
    {
      botUserId: async () => BOT_USER,
      github: () => {
        throw new Error("unused");
      },
      loadSecrets: async () => ({ githubToken: "token", webhookSecret: WEBHOOK_SECRET }),
      slack: harness.slack.slack,
    }
  );
  assert.equal(ignored.body.ignored, true);
});

function clickHarness(options: { fail?: { code: string; method: string }; wake?: FixerChoiceClickDeps["wake"] } = {}) {
  const slack = slackFake([], options.fail);
  const responses: Array<{ body: Record<string, any>; url: string }> = [];
  const tasks: Promise<void>[] = [];
  const deps: FixerChoiceClickDeps = {
    now: () => NOW,
    respond: async (url, body) => {
      responses.push({ body, url });
    },
    schedule: (task) => {
      tasks.push(task());
    },
    slack: slack.slack,
    ...(options.wake ? { wake: options.wake } : {}),
  };
  return { deps, flush: () => Promise.all(tasks), responses, slack, tasks };
}

const CHOICE_MARKER = { ...choiceJson, options: DEFAULT_OPTIONS } as FixerQaMarker & { kind: "choice" };

const questionMessage = () => {
  const card = buildFixerChoiceCard({ marker: CHOICE_MARKER, offer: COMMENT_ID });
  return { blocks: card.blocks, text: card.text, ts: CARD_TS, user: BOT_USER };
};

function pick(choice: keyof typeof FIXER_CHOICE_ACTION_IDS, overrides: Record<string, unknown> = {}) {
  return {
    actions: [{ action_id: FIXER_CHOICE_ACTION_IDS[choice], value: JSON.stringify({ incident: 87, offer: COMMENT_ID }) }],
    channel: { id: FIXER_PR_SLACK_CHANNEL_ID },
    container: { channel_id: FIXER_PR_SLACK_CHANNEL_ID, message_ts: CARD_TS, thread_ts: DIGEST_TS },
    message: questionMessage(),
    response_url: RESPONSE_URL,
    team: { id: FIXER_PR_SLACK_TEAM_ID },
    type: "block_actions",
    user: { id: ALLOWED_USER },
    ...overrides,
  };
}

const ephemeral = (text: string) => ({ replace_original: false, response_type: "ephemeral", text });

test("[PR 작성하기] records who picked on the card, then wakes the fixer with a signal only", async () => {
  const wakes: string[] = [];
  const harness = clickHarness({ wake: async (text) => (wakes.push(text), "woken") });
  const result = await routeFixerChoiceSlackAction(pick("pr"), harness.deps);
  assert.equal(result?.status, "fixer_choice_pr_started");
  await harness.flush();
  const [update] = harness.slack.writes();
  assert.equal(harness.slack.writes().length, 1);
  assert.equal(update.method, "chat.update");
  assert.equal(update.body.ts, CARD_TS);
  const [status, record] = blocksIn(update);
  assert.equal(status.block_id, `harper_fixer_choice_picked:87:${COMMENT_ID}:pr`);
  assert.equal(
    status.text?.text,
    [
      `✅ <@${ALLOWED_USER}>님이 *PR 작성하기*를 골랐어요 · 11/9 18:40`,
      "<https://github.com/matchharper/harper_incidents/issues/87|사건 #87> Career 추천 저장 500 오류",
      "> 없는 공고 번호가 오면 500으로 끝나 그 회차 추천이 통째로 빠짐",
      "> 고칠 곳: DB 함수 `write_career_opportunities` 한 줄",
      "수정 에이전트가 곧 PR을 만들어요.",
    ].join("\n")
  );
  assert.equal(
    record.elements?.[0].text,
    `선택 기록 · 사건 87 · pr · ${ALLOWED_USER} · ${NOW.toISOString()} · 댓글 ${COMMENT_ID}`
  );
  assert.equal(blocksIn(update).some((block) => block.type === "actions"), false);
  assert.equal(wakes.length, 1);
  assert.match(wakes[0], /^#qa 카드에서 PR 작성하기\(pr\)를 골랐어요: 사건 #87 · 카드 ts 1794216100\.000200 · 누른 사람 U0C8E9KPMSA · 2026-11-09T09:40:00\.000Z\./);
  assert.match(wakes[0], /깨우는 신호예요/);
  assert.deepEqual(harness.responses, []);
});

test("[배포까지 하기] and [하지 않기] record their own pick; a failed wake says when it starts", async () => {
  const failing = clickHarness({ wake: async () => "failed" });
  await routeFixerChoiceSlackAction(pick("deploy"), failing.deps);
  await failing.flush();
  const updates = failing.slack.writes();
  assert.equal(updates.length, 2);
  assert.equal(blocksIn(updates[0])[0].block_id, `harper_fixer_choice_picked:87:${COMMENT_ID}:deploy`);
  assert.match(blocksIn(updates[0])[0].text?.text ?? "", /수정 에이전트가 곧 시작해요\.$/);
  assert.match(blocksIn(updates[1])[0].text?.text ?? "", /바로 깨우지 못했어요\. 다음 정기 실행\(05:40·17:40\)에 이어서 해요\.$/);
  const waited = clickHarness({ wake: async () => "failed" });
  await routeFixerChoiceSlackAction(pick("wait"), waited.deps);
  await waited.flush();
  assert.equal(waited.slack.writes().length, 1);
  assert.equal(blocksIn(waited.slack.writes()[0])[0].block_id, `harper_fixer_choice_picked:87:${COMMENT_ID}:wait`);
  assert.match(blocksIn(waited.slack.writes()[0])[0].text?.text ?? "", /\*기다리기\*를 골랐어요[\s\S]*배포는 여기서 멈춰요\.$/);
  const declined = clickHarness({ wake: async () => "failed" });
  await routeFixerChoiceSlackAction(pick("decline"), declined.deps);
  await declined.flush();
  assert.equal(declined.slack.writes().length, 1);
  assert.match(blocksIn(declined.slack.writes()[0])[0].text?.text ?? "", /\*하지 않기\*를 골랐어요[\s\S]*이 사건은 다시 묻지 않아요\.$/);
  const off = clickHarness();
  await routeFixerChoiceSlackAction(pick("pr"), off.deps);
  await off.flush();
  assert.equal(off.slack.writes().length, 1);
  assert.match(blocksIn(off.slack.writes()[0])[0].text?.text ?? "", /다음 정기 실행\(05:40·17:40\)에 이어서 해요\.$/);
});

test("only the one allowed person picks; others and other places change nothing", async () => {
  const wakes: string[] = [];
  const wake = async (text: string): Promise<FixerWakeResult> => (wakes.push(text), "woken");
  const merger = clickHarness({ wake });
  assert.equal((await routeFixerChoiceSlackAction(pick("deploy", { user: { id: OTHER_MERGER } }), merger.deps))?.status, "fixer_choice_not_allowed");
  await merger.flush();
  assert.deepEqual(merger.responses, [{ body: ephemeral(FIXER_DEPLOY_NOT_ALLOWED_TEXT), url: RESPONSE_URL }]);
  assert.equal(merger.slack.calls.length, 0);
  const elsewhere = clickHarness({ wake });
  assert.equal((await routeFixerChoiceSlackAction(pick("pr", { team: { id: "T0CUSTOMER1" } }), elsewhere.deps))?.ignored, true);
  assert.equal(
    (await routeFixerChoiceSlackAction(pick("pr", { channel: { id: "C0OTHER0001" }, container: { channel_id: "C0OTHER0001", message_ts: CARD_TS } }), elsewhere.deps))?.ignored,
    true
  );
  assert.equal(elsewhere.tasks.length, 0);
  assert.equal(await routeFixerChoiceSlackAction({ actions: [{ action_id: "harper_fixer_pr_merge" }], type: "block_actions" }, elsewhere.deps), null);
  assert.equal(await routeFixerChoiceSlackAction({ type: "view_submission" }, elsewhere.deps), null);
  assert.deepEqual(wakes, []);
});

test("a card already picked, a broken value, or a failed record wakes no one", async (t) => {
  t.mock.method(console, "warn", () => {});
  const wakes: string[] = [];
  const wake = async (text: string): Promise<FixerWakeResult> => (wakes.push(text), "woken");
  const picked = buildFixerChoicePickedCard({
    at: NOW,
    by: ALLOWED_USER,
    choice: "pr",
    questionText: "질문\n내용",
    value: { incident: 87, offer: COMMENT_ID },
    wake: "woken",
  });
  const again = clickHarness({ wake });
  const result = await routeFixerChoiceSlackAction(pick("deploy", { message: { blocks: picked.blocks, ts: CARD_TS } }), again.deps);
  assert.equal(result?.status, "fixer_choice_already_picked");
  await again.flush();
  assert.deepEqual(again.responses, [{ body: ephemeral("이미 고른 카드예요. 아무것도 바꾸지 않았어요."), url: RESPONSE_URL }]);
  assert.equal(again.slack.calls.length, 0);
  const otherOffer = clickHarness({ wake });
  await routeFixerChoiceSlackAction(
    pick("pr", { actions: [{ action_id: FIXER_CHOICE_ACTION_IDS.pr, value: JSON.stringify({ incident: 87, offer: 1 }) }] }),
    otherOffer.deps
  );
  await otherOffer.flush();
  assert.equal(otherOffer.slack.calls.length, 0);
  const broken = clickHarness({ wake });
  assert.equal(
    (await routeFixerChoiceSlackAction(pick("pr", { actions: [{ action_id: FIXER_CHOICE_ACTION_IDS.pr, value: "{" }] }), broken.deps))?.status,
    "fixer_choice_invalid_value"
  );
  const unrecorded = clickHarness({ fail: { code: "message_not_found", method: "chat.update" }, wake });
  await routeFixerChoiceSlackAction(pick("pr"), unrecorded.deps);
  await unrecorded.flush();
  assert.deepEqual(unrecorded.responses, [
    { body: ephemeral("카드에 기록하지 못해 아무것도 하지 않았어요. 잠시 후 다시 눌러 주세요."), url: RESPONSE_URL },
  ]);
  assert.deepEqual(wakes, []);
});

test("waking the fixer: its own fire endpoint only, with the beta header; failures are reported", async (t) => {
  t.mock.method(console, "warn", () => {});
  const requests: Array<{ body: unknown; headers: Record<string, string>; url: string }> = [];
  let status = 200;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string>, url: String(input) });
    if (status === 0) throw new TypeError("fetch failed");
    return new Response("{}", { status });
  }) as typeof fetch;
  const wake = createFixerWake({ fetch: fetchImpl, loadConfig: async () => ({ token: "fire-token", url: FIRE_URL }) });
  assert.equal(await wake("신호"), "woken");
  assert.deepEqual(requests[0], {
    body: { text: "신호" },
    headers: {
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "anthropic-version": "2023-06-01",
      Authorization: "Bearer fire-token",
      "Content-Type": "application/json",
    },
    url: FIRE_URL,
  });
  status = 401;
  assert.equal(await wake("신호"), "failed");
  status = 0;
  assert.equal(await wake("신호"), "failed");
  assert.equal(await createFixerWake({ fetch: fetchImpl, loadConfig: async () => null })("신호"), "not_configured");
  assert.equal(requests.length, 3);
});

test("the fire URL and token come from the Vault; a URL that is not a fire endpoint turns waking off", async (t) => {
  t.mock.method(console, "warn", () => {});
  let rows: Array<{ decrypted_secret?: unknown; name?: unknown }> = [
    { decrypted_secret: ` ${FIRE_URL} `, name: "fixer_routine_fire_url" },
    { decrypted_secret: "fire-token\n", name: "fixer_routine_fire_token" },
  ];
  let queries = 0;
  let now = 0;
  const load = createFixerWakeConfigLoader({
    now: () => now,
    query: async (names) => {
      queries += 1;
      assert.deepEqual(names, ["fixer_routine_fire_url", "fixer_routine_fire_token"]);
      return rows;
    },
  });
  assert.deepEqual(await load(), { token: "fire-token", url: FIRE_URL });
  await load();
  assert.equal(queries, 1);
  now = 5 * 60 * 1000;
  rows = [
    { decrypted_secret: "https://example.com/v1/claude_code/routines/trig_1/fire", name: "fixer_routine_fire_url" },
    { decrypted_secret: "fire-token", name: "fixer_routine_fire_token" },
  ];
  assert.equal(await load(), null);
  now = 10 * 60 * 1000;
  rows = [];
  assert.equal(await load(), null);
  const failing = createFixerWakeConfigLoader({
    query: async () => {
      throw new Error("vault down");
    },
  });
  assert.equal(await failing(), null);
});

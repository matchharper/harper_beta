import assert from "node:assert/strict";
import test from "node:test";
import { createSlackApiRequest } from "./slackApiRequest";

test("encodes conversations.list filters as form data", () => {
  const request = createSlackApiRequest("bot-token", {
    exclude_archived: true,
    limit: 200,
    types: "public_channel,private_channel",
  });

  assert.equal(request.method, "POST");
  assert.equal(request.headers.Authorization, "Bearer bot-token");
  assert.equal(
    request.headers["Content-Type"],
    "application/x-www-form-urlencoded"
  );
  assert.equal(request.body.get("types"), "public_channel,private_channel");
  assert.equal(request.body.get("exclude_archived"), "true");
  assert.equal(request.body.get("limit"), "200");
});

test("encodes Slack assistant thread status fields and preserves an empty clear status", () => {
  const request = createSlackApiRequest("bot-token", {
    channel_id: "C123",
    status: "답변을 작성 중입니다…",
    thread_ts: "1724264405.531769",
  });
  const clearRequest = createSlackApiRequest("bot-token", {
    channel_id: "C123",
    status: "",
    thread_ts: "1724264405.531769",
  });

  assert.equal(request.body.get("channel_id"), "C123");
  assert.equal(request.body.get("status"), "답변을 작성 중입니다…");
  assert.equal(request.body.get("thread_ts"), "1724264405.531769");
  assert.equal(clearRequest.body.get("status"), "");
});

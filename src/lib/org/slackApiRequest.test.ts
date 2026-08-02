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

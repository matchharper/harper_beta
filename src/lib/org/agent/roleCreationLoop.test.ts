import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync(
  new URL("./roleCreationChat.ts", import.meta.url),
  "utf8"
);

test("role creation preserves Responses reasoning state between sequential tools", () => {
  assert.match(chat, /_responses_output\?: any\[\]/);
  assert.match(
    chat,
    /_responses_output: Array\.isArray\(responseMessage\._responses_output\)/
  );
});

test("role creation reports malformed tool input as not executed", () => {
  assert.match(chat, /class RoleCreationToolInputError extends Error/);
  assert.match(
    chat,
    /args\.error instanceof RoleCreationToolInputError[\s\S]*effectStatus: inputError \? "not_executed"/
  );
});

test("role creation does not blindly retry an uncertain calibration write", () => {
  assert.match(
    chat,
    /The saved Hiring Brief may have changed\. Do not immediately repeat calibration/
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import type { TokenPayload } from "google-auth-library";
import { validateContentsEngineSheetsIdentity } from "@/lib/contentsEngine/sheetsAuth";

const audiences = ["apps-script-client.apps.googleusercontent.com"];

function payload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    aud: audiences[0],
    email: "teammate@matchharper.com",
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 300,
    hd: "matchharper.com",
    iat: Math.floor(Date.now() / 1000),
    iss: "https://accounts.google.com",
    sub: "google-user-1",
    ...overrides,
  };
}

test("accepts a verified Harper Workspace identity for the configured Apps Script client", () => {
  assert.deepEqual(validateContentsEngineSheetsIdentity(payload(), audiences), {
    email: "teammate@matchharper.com",
    subject: "google-user-1",
  });
});

test("rejects personal Google accounts and lookalike domains", () => {
  assert.throws(
    () =>
      validateContentsEngineSheetsIdentity(
        payload({ email: "someone@gmail.com", hd: undefined }),
        audiences
      ),
    /Harper Google Workspace/
  );
  assert.throws(
    () =>
      validateContentsEngineSheetsIdentity(
        payload({ email: "ops@notmatchharper.com", hd: "notmatchharper.com" }),
        audiences
      ),
    /Harper Google Workspace/
  );
});

test("rejects a token minted for another OAuth client", () => {
  assert.throws(
    () =>
      validateContentsEngineSheetsIdentity(
        payload({ aud: "another-client.apps.googleusercontent.com" }),
        audiences
      ),
    /audience/
  );
});

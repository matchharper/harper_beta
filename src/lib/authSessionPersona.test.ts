import assert from "node:assert/strict";
import test from "node:test";
import type { Session } from "@supabase/supabase-js";
import {
  canSwitchAuthPersonaWithoutLogout,
  getAuthSessionKey,
  getPageAuthPersona,
  getPersonaLoginPath,
  parseAuthPersona,
  serializeAuthPersona,
} from "./authSessionPersona";
import { OPS_ACCESS_EMAILS, OPS_UTM_VIEWER_EMAILS } from "./internalAccess";

function session(userId: string, sessionId: string, expiresAt = 100): Session {
  return {
    user: { id: userId },
    access_token: `header.${Buffer.from(
      JSON.stringify({ session_id: sessionId, exp: expiresAt })
    ).toString("base64url")}.signature`,
  } as Session;
}

test("Ops-enabled accounts can switch login personas without expanding Ops permissions", () => {
  for (const email of [
    "operator@matchharper.com",
    ...OPS_ACCESS_EMAILS,
    ...OPS_UTM_VIEWER_EMAILS,
  ]) {
    assert.equal(canSwitchAuthPersonaWithoutLogout(email), true, email);
    assert.equal(
      canSwitchAuthPersonaWithoutLogout(` ${email.toUpperCase()} `),
      true
    );
  }
  for (const email of [
    undefined,
    null,
    "",
    "external@example.test",
    "hyunbin.bk@gmail.com", // Dev controls alone do not grant Ops account access.
    "operator@matchharper.com.example.test",
  ]) {
    assert.equal(canSwitchAuthPersonaWithoutLogout(email), false);
  }
});

test("the same account can log in separately as talent or company", () => {
  const talentSession = session("dual-account", "talent-login");
  const companySession = session("dual-account", "company-login");
  const talentBinding = serializeAuthPersona(talentSession, "talent");
  const companyBinding = serializeAuthPersona(companySession, "company");

  assert.equal(parseAuthPersona(talentBinding, talentSession), "talent");
  assert.equal(parseAuthPersona(companyBinding, companySession), "company");
  assert.equal(parseAuthPersona(talentBinding, companySession), null);
  assert.equal(parseAuthPersona(companyBinding, talentSession), null);
  assert.equal(
    parseAuthPersona(talentBinding, session("another-account", "talent-login")),
    null
  );
});

test("refreshing an access token preserves the login type", () => {
  const original = session("user", "login");
  const refreshed = session("user", "login", 200);
  assert.notEqual(original.access_token, refreshed.access_token);
  assert.equal(getAuthSessionKey(original), getAuthSessionKey(refreshed));
  assert.equal(
    parseAuthPersona(serializeAuthPersona(original, "company"), refreshed),
    "company"
  );
});

test("missing, stale, or damaged login records never guess a login type", () => {
  const current = session("user", "login");
  for (const stored of [
    null,
    "",
    "{}",
    "null",
    "invalid",
    '{"persona":"talent"}',
  ]) {
    assert.equal(parseAuthPersona(stored, current), null);
  }
  assert.equal(
    parseAuthPersona(
      JSON.stringify({
        sessionKey: getAuthSessionKey(current),
        persona: "ops",
      }),
      current
    ),
    null
  );
  assert.equal(
    parseAuthPersona(serializeAuthPersona(current, "talent"), null),
    null
  );
  assert.equal(
    getAuthSessionKey({ ...current, access_token: "invalid" }),
    null
  );
});

test("workspace and login routes require their own persona without gating public pages", () => {
  for (const path of [
    "/career",
    "/career/profile",
    "/career/email-onboarding?invite=x",
    "/career_login?next=%2Fcareer",
  ]) {
    assert.equal(getPageAuthPersona(path), "talent");
  }
  for (const path of [
    "/org",
    "/org/jobs?orgId=x",
    "/org/onboarding",
    "/find",
    "/search",
    "/radar",
  ]) {
    assert.equal(getPageAuthPersona(path), "company");
  }
  for (const path of [
    "/",
    "/company",
    "/pricing",
    "/jobs/example",
    "/auths/callback",
    "/auths/reset-password",
    "/ops",
    "/organization",
    "/careers",
  ]) {
    assert.equal(getPageAuthPersona(path), null);
  }
});

test("switching keeps deep links, invitations, and return URLs through the login page", () => {
  const careerPath = "/career/profile?invite=abc&source=email#settings";
  const companyPath = "/org/jobs?orgId=company&roleId=role&invite=abc";
  assert.equal(
    getPersonaLoginPath(careerPath, "talent"),
    `/career_login?next=${encodeURIComponent(careerPath)}`
  );
  assert.equal(getPersonaLoginPath(companyPath, "company"), companyPath);
  const loginPath = "/career_login?next=%2Fcareer%2Fprofile&invite=abc";
  assert.equal(getPersonaLoginPath(loginPath, "talent"), loginPath);
});

test("login destinations cannot leave the requested persona or redirect off-site", () => {
  for (const path of [
    "//example.com",
    "/\\example.com",
    "https://example.com",
    "/org",
  ]) {
    assert.equal(getPersonaLoginPath(path, "talent"), "/career_login");
  }
  assert.equal(getPersonaLoginPath("/career", "company"), "/org");
});

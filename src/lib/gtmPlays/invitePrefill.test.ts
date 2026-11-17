import assert from "node:assert/strict";
import test from "node:test";
import { canSeeGtmInvitePrefill, linkedinProfileUrl, type GtmInvitePrefillMail } from "./invitePrefill";

test("only linkedin.com/in/ member profiles are accepted", () => {
  assert.equal(linkedinProfileUrl("https://www.linkedin.com/in/hajun-kim-12ab/"), "https://www.linkedin.com/in/hajun-kim-12ab");
  assert.equal(linkedinProfileUrl("linkedin.com/in/hajun?trk=abc#top"), "https://www.linkedin.com/in/hajun");
  assert.equal(linkedinProfileUrl("http://kr.linkedin.com/in/%ED%95%98%EC%A4%80"), "https://www.linkedin.com/in/%ED%95%98%EC%A4%80");
  for (const value of [
    "https://www.linkedin.com/company/example", "https://www.linkedin.com/in/", "https://www.linkedin.com/pub/dir/a",
    "https://linkedin.com.example.com/in/hajun", "https://evil-linkedin.com/in/hajun", "https://example.com/in/hajun",
    "javascript:alert(1)", "ftp://linkedin.com/in/hajun", "", null, undefined,
  ]) {
    assert.equal(linkedinProfileUrl(value), null, String(value));
  }
});

const now = Date.parse("2026-11-16T12:00:00Z");
const validMs = 90 * 86_400_000;
const mail = (patch: Partial<GtmInvitePrefillMail> = {}): GtmInvitePrefillMail => ({
  audience: "candidate", status: "sent", created_at: "2026-11-15T12:00:00Z", claimed_talent_id: null, ...patch,
});

test("a signed-in viewer sees it while the mail is unclaimed or claimed by them", () => {
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "me", mail: mail(), now, validMs }), true);
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "me", mail: mail({ claimed_talent_id: "me" }), now, validMs }), true);
});

test("never signed out, for someone else's claim, or for other mails", () => {
  assert.equal(canSeeGtmInvitePrefill({ viewerId: null, mail: mail(), now, validMs }), false);
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "", mail: mail(), now, validMs }), false);
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "me", mail: mail({ claimed_talent_id: "other" }), now, validMs }), false);
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "me", mail: mail({ audience: "company" }), now, validMs }), false);
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "me", mail: mail({ status: "blocked" }), now, validMs }), false);
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "me", mail: mail({ created_at: "2026-01-01T00:00:00Z" }), now, validMs }), false);
  assert.equal(canSeeGtmInvitePrefill({ viewerId: "me", mail: null, now, validMs }), false);
});

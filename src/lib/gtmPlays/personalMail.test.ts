import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSONAL_MAIL_DOMAINS,
  canMailCandidateAddress,
  isHarperMailAddress,
  isPersonalMailAddress,
  mailDomain,
} from "./personalMail";

test("personal mail providers count, case and spaces ignored", () => {
  for (const address of [
    "someone@gmail.com", "someone@googlemail.com", "someone@naver.com", "someone@daum.net", "someone@hanmail.net",
    "someone@kakao.com", "someone@nate.com", "someone@outlook.com", "someone@hotmail.com", "someone@live.com",
    "someone@msn.com", "someone@icloud.com", "someone@me.com", "someone@mac.com", "someone@yahoo.com",
    "someone@yahoo.co.kr", "someone@proton.me", "someone@protonmail.com", "someone@hanmir.com", "someone@korea.com",
    "  Some.One@GMAIL.com ",
  ]) {
    assert.equal(isPersonalMailAddress(address), true, address);
  }
  assert.equal(PERSONAL_MAIL_DOMAINS.length, 20);
});

test("company addresses, subdomains and broken values are not personal", () => {
  for (const address of [
    "someone@example.com", "someone@company.co.kr", "someone@mail.naver.com", "someone@gmail.com.example.com",
    "someone@notgmail.com", "gmail.com", "@gmail.com", "", null, undefined,
  ]) {
    assert.equal(isPersonalMailAddress(address), false, String(address));
  }
});

test("the team's own addresses are allowed for candidate mails, not counted as personal", () => {
  assert.equal(isHarperMailAddress("test+gtm@matchharper.com"), true);
  assert.equal(isHarperMailAddress("someone@sub.matchharper.com"), false);
  assert.equal(isPersonalMailAddress("test@matchharper.com"), false);
  assert.equal(canMailCandidateAddress("test@MatchHarper.com"), true);
  assert.equal(canMailCandidateAddress("someone@naver.com"), true);
  assert.equal(canMailCandidateAddress("someone@example.com"), false);
});

test("mailDomain takes the part after the last @", () => {
  assert.equal(mailDomain(" A@B@Example.COM "), "example.com");
  assert.equal(mailDomain("no-at"), "");
});

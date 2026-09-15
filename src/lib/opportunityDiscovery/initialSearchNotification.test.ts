import assert from "node:assert/strict";
import test from "node:test";

import { renderEmailBodyHtml } from "@/lib/email/bodyFormat";
import { buildInitialSearchStartedEmail } from "./initialSearchNotificationCopy";

test("builds the Korean initial search receipt with the promised timing and reply guidance", () => {
  const email = buildInitialSearchStartedEmail({
    baseUrl: "https://matchharper.com/",
    gmailConnected: false,
    hasUploadedResume: false,
    locale: "ko",
    name: "민지",
  });

  assert.equal(email.subject, "Harper가 첫 기회를 찾기 시작했어요");
  assert.match(email.body, /민지님, 안녕하세요!/);
  assert.match(email.body, /1시간 이내/);
  assert.match(email.body, /직접 지원해볼 만한 공개 포지션/);
  assert.match(email.body, /Gmail 연결하기/);
  assert.match(email.body, /이력서 업로드하기/);
  assert.match(email.body, /Harper 초대 프로그램/);
  assert.match(email.body, /career\?intent=referral/);
  assert.match(email.body, /Harper의 이메일에 답장/);

  const html = renderEmailBodyHtml(email.body);
  assert.match(
    html,
    /href="https:\/\/matchharper\.com\/career\/profile\?profileSection=links"/
  );
  assert.match(
    html,
    /href="https:\/\/matchharper\.com\/career\?intent=referral"/
  );
  assert.match(html, /href="https:\/\/matchharper\.com\/career\?start=chat"/);
});

test("builds the English receipt and omits completed Gmail and resume actions", () => {
  const email = buildInitialSearchStartedEmail({
    baseUrl: "https://matchharper.com",
    gmailConnected: true,
    hasUploadedResume: true,
    locale: "en",
    name: "Mina",
  });

  assert.equal(
    email.subject,
    "Harper has started your first opportunity search"
  );
  assert.match(email.body, /Hi Mina,/);
  assert.match(email.body, /within one hour/);
  assert.match(email.body, /public roles you can apply to directly/);
  assert.doesNotMatch(email.body, /Connect Gmail/);
  assert.doesNotMatch(email.body, /Upload your resume/);
  assert.match(email.body, /View the invite program/);
  assert.match(email.body, /reply directly to this email/);
});

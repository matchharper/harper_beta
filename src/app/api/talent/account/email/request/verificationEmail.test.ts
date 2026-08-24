import assert from "node:assert/strict";
import test from "node:test";
import { buildVerificationEmail } from "./verificationEmail";

test("English verification email contains no Korean copy", () => {
  const email = buildVerificationEmail({
    actionLink: "https://example.com/verify?token=test",
    locale: "en",
    requestCode: "ABCD1234",
  });

  assert.equal(
    email.subject,
    "[Harper] Verify your email change · Request ABCD1234"
  );
  assert.match(email.text, /Open the link below to verify your new email/);
  assert.match(email.html, />Verify new email<\/a>/);
  assert.doesNotMatch(
    `${email.subject}\n${email.text}\n${email.html}`,
    /[가-힣]/
  );
});

test("Korean verification email remains Korean", () => {
  const email = buildVerificationEmail({
    actionLink: "https://example.com/verify?token=test",
    locale: "ko",
    requestCode: "ABCD1234",
  });

  assert.match(email.subject, /이메일 변경 인증/);
  assert.match(email.text, /요청 코드: ABCD1234/);
  assert.match(email.html, />새 이메일 인증하기<\/a>/);
});

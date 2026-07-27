import assert from "node:assert/strict";
import test from "node:test";
import {
  getTalentAccountEmailChangePendingState,
  isTalentAccountEmailChangeExpiredError,
  isTalentAccountEmailChangePendingConfirmation,
  isTalentAccountEmailUnavailableError,
  TALENT_ACCOUNT_EMAIL_CHANGE_PENDING_TTL_MS,
} from "@/lib/career/accountEmailErrors";

test("keeps an email change pending only during the one-hour verification window", () => {
  const sentAt = Date.parse("2026-07-28T00:00:00.000Z");
  const user = {
    email_change_sent_at: new Date(sentAt).toISOString(),
    new_email: "New@Example.com",
  };

  assert.deepEqual(
    getTalentAccountEmailChangePendingState(
      user,
      sentAt + TALENT_ACCOUNT_EMAIL_CHANGE_PENDING_TTL_MS - 1
    ),
    {
      email: "new@example.com",
      expiresAtMs: sentAt + TALENT_ACCOUNT_EMAIL_CHANGE_PENDING_TTL_MS,
    }
  );
  assert.deepEqual(
    getTalentAccountEmailChangePendingState(
      user,
      sentAt + TALENT_ACCOUNT_EMAIL_CHANGE_PENDING_TTL_MS
    ),
    {
      email: "",
      expiresAtMs: null,
    }
  );
});

test("does not expose a pending email without a valid send timestamp", () => {
  assert.deepEqual(
    getTalentAccountEmailChangePendingState({
      email_change_sent_at: null,
      new_email: "new@example.com",
    }),
    {
      email: "",
      expiresAtMs: null,
    }
  );
});

test("recognizes expired email-change links separately from unavailable emails", () => {
  assert.equal(
    isTalentAccountEmailChangeExpiredError({
      code: "otp_expired",
      message: "Email link is invalid or has expired",
    }),
    true
  );
  assert.equal(
    isTalentAccountEmailUnavailableError({
      code: "user_already_exists",
      message: "A user with this email address has already been registered",
    }),
    true
  );
  assert.equal(
    isTalentAccountEmailUnavailableError({
      code: "over_email_send_rate_limit",
      message: "Email rate limit exceeded",
    }),
    false
  );
});

test("recognizes Supabase's first secure email-change confirmation", () => {
  assert.equal(
    isTalentAccountEmailChangePendingConfirmation(
      "Confirmation link accepted. Please proceed to confirm link sent to the other email"
    ),
    true
  );
  assert.equal(
    isTalentAccountEmailChangePendingConfirmation(
      "Your email address has been changed"
    ),
    false
  );
});

export const TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE =
  "해당 이메일로 진행할 수 없습니다. 사유: 인증이 차단된 이메일 혹은 이미 등록된 이메일";
export const TALENT_ACCOUNT_EMAIL_CHANGE_PENDING_TTL_MS = 60 * 60 * 1000;

const EMAIL_UNAVAILABLE_ERROR_MARKERS = [
  "already been registered",
  "already registered",
  "already exists",
  "blocked",
  "email address is not authorized",
  "email is not allowed",
  "email not allowed",
  "email_address_not_authorized",
  "email_exists",
  "email_in_use",
  "identity_already_exists",
  "user_already_exists",
];

const EMAIL_CHANGE_EXPIRED_ERROR_MARKERS = [
  "email link is invalid or has expired",
  "expired_token",
  "otp_disabled",
  "otp_expired",
  "token has expired or is invalid",
  "token_expired",
];

const EMAIL_CHANGE_PENDING_CONFIRMATION_MARKERS = [
  "confirmation link accepted",
  "confirm link sent to the other email",
];

function getSearchableErrorText(error: unknown) {
  const values: unknown[] = [error];

  if (error && typeof error === "object") {
    values.push(
      "code" in error ? error.code : "",
      "message" in error ? error.message : "",
      "name" in error ? error.name : ""
    );
  }

  return values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

export function isTalentAccountEmailUnavailableError(error: unknown) {
  const searchableText = getSearchableErrorText(error);
  return EMAIL_UNAVAILABLE_ERROR_MARKERS.some((marker) =>
    searchableText.includes(marker)
  );
}

export function isTalentAccountEmailChangeExpiredError(error: unknown) {
  const searchableText = getSearchableErrorText(error);
  return EMAIL_CHANGE_EXPIRED_ERROR_MARKERS.some((marker) =>
    searchableText.includes(marker)
  );
}

export function isTalentAccountEmailChangePendingConfirmation(value: unknown) {
  const searchableText = getSearchableErrorText(value);
  return EMAIL_CHANGE_PENDING_CONFIRMATION_MARKERS.every((marker) =>
    searchableText.includes(marker)
  );
}

export function getTalentAccountEmailChangePendingState(
  user:
    | {
        email_change_sent_at?: string | null;
        new_email?: string | null;
      }
    | null
    | undefined,
  nowMs = Date.now()
) {
  const email = String(user?.new_email ?? "")
    .trim()
    .toLowerCase();
  const sentAtMs = Date.parse(String(user?.email_change_sent_at ?? ""));
  const expiresAtMs = sentAtMs + TALENT_ACCOUNT_EMAIL_CHANGE_PENDING_TTL_MS;

  if (!email || !Number.isFinite(sentAtMs) || nowMs >= expiresAtMs) {
    return {
      email: "",
      expiresAtMs: null,
    };
  }

  return {
    email,
    expiresAtMs,
  };
}

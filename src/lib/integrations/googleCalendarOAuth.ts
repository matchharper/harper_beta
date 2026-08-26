import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isComposioAccountId } from "./composio";
import { GoogleCalendarError } from "./googleCalendarError";

export const CALENDAR_OAUTH_COOKIE = "harper_google_calendar_oauth";
export const CALENDAR_OAUTH_COOKIE_PATH =
  "/api/org/integrations/google-calendar";
export const CALENDAR_OAUTH_TTL_SECONDS = 600;

type CalendarOAuthState = {
  userId: string;
  workspaceId: string;
  accountId: string;
  nonce: string;
  expiresAt: number;
};

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`harper.google-calendar.oauth:${payload}`)
    .digest();
}

export function newCalendarOAuthNonce() {
  return randomBytes(32).toString("base64url");
}

export function encodeCalendarOAuthState(
  value: Omit<CalendarOAuthState, "expiresAt">,
  secret: string,
  now = Date.now()
) {
  const payload = Buffer.from(
    JSON.stringify({
      ...value,
      expiresAt: now + CALENDAR_OAUTH_TTL_SECONDS * 1000,
    })
  ).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyCalendarOAuthState(args: {
  cookie: string | undefined;
  nonce: string;
  userId: string;
  workspaceId: string;
  secret: string;
  now?: number;
}): CalendarOAuthState {
  const invalid = () =>
    new GoogleCalendarError(
      400,
      "INVALID_OAUTH_STATE",
      "연결 요청을 확인하지 못했어요. 연결을 시작한 브라우저와 계정에서 다시 시도해 주세요."
    );
  if (!args.cookie || args.cookie.length > 4096) throw invalid();
  const pieces = args.cookie.split(".");
  if (pieces.length !== 2) throw invalid();
  const [payload, supplied] = pieces;
  const expected = signature(payload, args.secret);
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw invalid();
  let value: CalendarOAuthState;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (
    !value ||
    value.userId !== args.userId ||
    value.workspaceId !== args.workspaceId ||
    typeof value.nonce !== "string" ||
    value.nonce.length !== 43 ||
    value.nonce !== args.nonce ||
    !isComposioAccountId(value.accountId) ||
    !Number.isFinite(value.expiresAt)
  )
    throw invalid();
  const now = args.now ?? Date.now();
  if (
    value.expiresAt <= now ||
    value.expiresAt > now + CALENDAR_OAUTH_TTL_SECONDS * 1000
  ) {
    throw new GoogleCalendarError(
      400,
      "OAUTH_STATE_EXPIRED",
      "연결 요청이 만료됐어요. Google Calendar를 다시 연결해 주세요."
    );
  }
  return value;
}

export function buildCalendarCallbackUrl(
  origin: string,
  workspaceId: string,
  nonce: string
) {
  const url = new URL("/org/settings", origin);
  url.searchParams.set("orgId", workspaceId);
  url.searchParams.set("googleCalendar", "callback");
  url.searchParams.set("calendarState", nonce);
  return url.toString();
}

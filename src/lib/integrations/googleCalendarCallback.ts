import type { ParsedUrlQuery } from "node:querystring";
import type { GoogleCalendarCompleteInput } from "./googleCalendarTypes";

export function readCalendarCallback(
  query: ParsedUrlQuery
): Omit<GoogleCalendarCompleteInput, "workspaceId"> | null {
  if (query.googleCalendar !== "callback") return null;
  if (
    typeof query.calendarState !== "string" ||
    (query.status !== "success" && query.status !== "failed") ||
    (query.status === "success" &&
      typeof query.connected_account_id !== "string")
  ) {
    throw new Error(
      "Google Calendar 연결 결과를 확인하지 못했어요. 다시 연결해 주세요."
    );
  }
  return {
    state: query.calendarState,
    status: query.status,
    ...(typeof query.connected_account_id === "string"
      ? { connectedAccountId: query.connected_account_id }
      : {}),
  };
}

export function withoutCalendarCallback(query: ParsedUrlQuery): ParsedUrlQuery {
  const next = { ...query };
  for (const key of [
    "googleCalendar",
    "calendarState",
    "status",
    "connected_account_id",
  ])
    delete next[key];
  return next;
}

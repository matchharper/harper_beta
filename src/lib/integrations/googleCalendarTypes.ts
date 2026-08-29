// Public DTOs only: no account IDs, OAuth credentials, or server imports.
export type GoogleCalendarStatus = {
  provider: "google_calendar";
  status: "not_connected" | "active" | "expired" | "disabled";
};

export type GoogleCalendarConnectResult =
  | { status: "active" }
  | { status: "redirect"; authorizeUrl: string };

export type GoogleCalendarCompleteInput = {
  workspaceId: string;
  state: string;
  connectedAccountId?: string;
  status: "success" | "failed";
};

export type GoogleCalendarCompleteResult = {
  status: "active" | "cancelled";
};

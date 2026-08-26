import {
  ComposioApiError,
  type ComposioClient,
  type ComposioConnectedAccount,
} from "./composio";
import {
  GoogleCalendarError,
  connectionChangedError,
} from "./googleCalendarError";
import type {
  CalendarIntegrationRow,
  GoogleCalendarStore,
} from "./googleCalendarStore";
import type { GoogleCalendarStatus } from "./googleCalendarTypes";

const TOOLKIT = "googlecalendar";

export function createGoogleCalendarService(args: {
  store: GoogleCalendarStore;
  vendor: ComposioClient;
  getAuthConfigId: () => string;
}) {
  const { store, vendor } = args;
  const status = (
    value: GoogleCalendarStatus["status"]
  ): GoogleCalendarStatus => ({
    provider: "google_calendar",
    status: value,
  });

  async function find(userId: string) {
    const row = await store.find(userId);
    // Fail closed even if a future store implementation forgets its filter.
    if (
      row &&
      (row.company_user_id !== userId || row.provider !== "google_calendar")
    ) {
      throw new GoogleCalendarError(
        403,
        "OWNER_MISMATCH",
        "본인의 Google Calendar 연결만 관리할 수 있어요."
      );
    }
    return row;
  }

  async function getOwnedAccount(
    userId: string,
    accountId: string
  ): Promise<ComposioConnectedAccount | null> {
    let account: ComposioConnectedAccount;
    try {
      account = await vendor.getAccount(accountId);
    } catch (error) {
      if (error instanceof ComposioApiError && error.status === 404)
        return null;
      throw error;
    }
    if (
      account.id !== accountId ||
      account.user_id !== userId ||
      account.toolkit?.slug !== TOOLKIT ||
      account.auth_config?.id !== args.getAuthConfigId()
    ) {
      throw new GoogleCalendarError(
        403,
        "ACCOUNT_MISMATCH",
        "연결 계정의 소유권을 확인하지 못했어요. Harper 팀에 문의해 주세요."
      );
    }
    return account;
  }

  function accountState(account: ComposioConnectedAccount | null) {
    if (!account) return "expired";
    if (account.auth_config?.is_disabled) {
      throw new ComposioApiError(
        "Google Calendar auth config is disabled",
        503,
        { code: "AUTH_CONFIG_DISABLED" }
      );
    }
    if (
      account.is_disabled ||
      ["EXPIRED", "FAILED", "INACTIVE", "REVOKED"].includes(
        account.status ?? ""
      )
    )
      return "expired";
    if (account.status === "ACTIVE") return "active";
    throw new GoogleCalendarError(
      409,
      "AUTH_PENDING",
      "Google Calendar 인증이 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요."
    );
  }

  async function disconnectRow(userId: string, row: CalendarIntegrationRow) {
    // Deny Harper access before any potentially slow/failing vendor request.
    const disabled = await store.setStatus(row, "disabled");
    if (!disabled) throw connectionChangedError();
    const account = await getOwnedAccount(
      userId,
      row.composio_connected_account_id
    );
    if (account) {
      if (account.status !== "REVOKED") {
        try {
          await vendor.revokeAccount(row.composio_connected_account_id);
        } catch (error) {
          if (!(error instanceof ComposioApiError && error.status === 404))
            throw error;
        }
      }
      try {
        await vendor.deleteAccount(row.composio_connected_account_id);
      } catch (error) {
        if (!(error instanceof ComposioApiError && error.status === 404))
          throw error;
      }
    }
    if (!(await store.remove(disabled))) throw connectionChangedError();
  }

  return {
    async getStatus(userId: string): Promise<GoogleCalendarStatus> {
      const row = await find(userId);
      if (!row) return status("not_connected");
      if (row.status === "disabled" || row.status === "expired")
        return status(row.status);
      if (row.status !== "active") return status("expired");
      const account = await getOwnedAccount(
        userId,
        row.composio_connected_account_id
      );
      if (accountState(account) === "expired") {
        if (!(await store.setStatus(row, "expired")))
          throw connectionChangedError();
        return status("expired");
      }
      return status("active");
    },

    async connect(userId: string, callbackUrl: string) {
      // Check configuration before changing an existing connection.
      const authConfigId = args.getAuthConfigId();
      const row = await find(userId);
      if (row?.status === "disabled") {
        throw new GoogleCalendarError(
          409,
          "DISCONNECT_PENDING",
          "이전 연결 해제가 아직 끝나지 않았어요. 연결 해제를 다시 시도해 주세요."
        );
      }
      if (row) {
        const account = await getOwnedAccount(
          userId,
          row.composio_connected_account_id
        );
        if (accountState(account) === "active") {
          // Only reuse a previously verified, persisted account owned by this user.
          if (
            row.status !== "active" &&
            !(await store.setStatus(row, "active"))
          )
            throw connectionChangedError();
          return { status: "active" as const };
        }
        // Remove the expired connection before replacing its pointer, so failed
        // revocation remains recoverable in the existing row (no extra tables).
        await disconnectRow(userId, row);
      }
      const link = await vendor.createLink({
        authConfigId,
        userId,
        callbackUrl,
      });
      return { status: "redirect" as const, ...link };
    },

    async complete(userId: string, accountId: string) {
      const account = await getOwnedAccount(userId, accountId);
      if (accountState(account) !== "active") {
        throw new GoogleCalendarError(
          409,
          "AUTH_EXPIRED",
          "Google Calendar 연결이 만료됐어요. 다시 연결해 주세요."
        );
      }
      const existing = await find(userId);
      if (existing) {
        if (
          existing.status === "active" &&
          existing.composio_connected_account_id === accountId
        )
          return;
        // Never replay a callback over a disabled/newer connection.
        throw connectionChangedError();
      }
      if (!(await store.insert(userId, accountId)))
        throw connectionChangedError();
    },

    async disconnect(userId: string) {
      const row = await find(userId);
      if (row) await disconnectRow(userId, row);
    },
  };
}

export type GoogleCalendarService = ReturnType<
  typeof createGoogleCalendarService
>;

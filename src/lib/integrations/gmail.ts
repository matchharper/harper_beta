import type { Database } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  ComposioApiError,
  executeComposioGmailFetchEmails,
  getComposioAccountStatus,
  getComposioConnectedAccount,
  isOwnedComposioGmailAccount,
} from "@/lib/integrations/composio";

export const TALENT_GMAIL_PROVIDER = "gmail";

export type TalentIntegrationRow =
  Database["public"]["Tables"]["talent_integrations"]["Row"];

export type GmailIntegrationStatus =
  | "active"
  | "expired"
  | "disabled"
  | "not_connected";

export type GmailSearchResult = {
  status:
    | "ok"
    | "connection_required"
    | "connection_expired"
    | "temporarily_unavailable";
  emails: Array<{
    messageId: string;
    threadId: string | null;
    from: string | null;
    subject: string | null;
    receivedAt: string | null;
    snippet: string | null;
    content?: string;
  }>;
  truncated: boolean;
  assistantInstruction: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const cleanText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const cleanEmailAddress = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
};

const findHeader = (message: Record<string, unknown>, headerName: string) => {
  const payload = asRecord(message.payload);
  const headers = Array.isArray(message.headers)
    ? message.headers
    : Array.isArray(payload?.headers)
      ? payload.headers
      : [];
  const match = headers.find((header) => {
    const record = asRecord(header);
    return (
      typeof record?.name === "string" &&
      record.name.toLowerCase() === headerName.toLowerCase()
    );
  });
  return headerName.toLowerCase() === "from"
    ? cleanEmailAddress(asRecord(match)?.value, 500)
    : cleanText(asRecord(match)?.value, 500);
};

const normalizeReceivedAt = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
    : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? cleanText(String(value), 120)
    : date.toISOString();
};

function findMessagePayload(response: unknown) {
  const root = asRecord(response);
  const data = asRecord(root?.data);
  const firstResult = Array.isArray(data?.results)
    ? asRecord(data.results[0])
    : null;
  const firstResponse = asRecord(firstResult?.response);
  const candidates = [
    data,
    asRecord(data?.data),
    asRecord(data?.response),
    asRecord(firstResponse?.data),
    asRecord(firstResponse?.data_preview),
    asRecord(firstResult?.data),
    asRecord(firstResult?.data_preview),
  ];

  return (
    candidates.find((candidate) => Array.isArray(candidate?.messages)) ??
    data ??
    root
  );
}

export function normalizeGmailSearchResponse(args: {
  includeContent: boolean;
  maxResults: number;
  response: unknown;
}): Pick<GmailSearchResult, "emails" | "truncated"> {
  const payload = findMessagePayload(args.response);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  let remainingContentCharacters = 20_000;
  const emails = messages
    .slice(0, args.maxResults)
    .map((message) => asRecord(message))
    .filter((message): message is Record<string, unknown> => Boolean(message))
    .map((message) => {
      const messageId = cleanText(message.messageId ?? message.id, 300);
      if (!messageId) return null;

      const rawContent =
        message.messageText ?? message.text ?? message.body ?? message.content;
      const contentLimit = Math.min(4_000, remainingContentCharacters);
      const content =
        args.includeContent && contentLimit > 0
          ? cleanText(rawContent, contentLimit)
          : null;
      if (content) remainingContentCharacters -= content.length;

      return {
        messageId,
        threadId: cleanText(message.threadId ?? message.thread_id, 300),
        from:
          cleanEmailAddress(message.from, 500) ?? findHeader(message, "from"),
        subject:
          cleanText(message.subject, 500) ?? findHeader(message, "subject"),
        receivedAt: normalizeReceivedAt(
          message.messageTimestamp ??
            message.internalDate ??
            message.receivedAt ??
            message.date
        ),
        snippet: cleanText(
          message.snippet ?? message.preview ?? message.data_preview,
          800
        ),
        ...(content ? { content } : {}),
      };
    })
    .filter(
      (message): message is NonNullable<typeof message> => message !== null
    );
  const nextPageToken = cleanText(
    payload?.nextPageToken ?? payload?.next_page_token,
    500
  );

  return {
    emails,
    truncated: Boolean(nextPageToken) || messages.length > args.maxResults,
  };
}

export async function fetchTalentGmailIntegration(args: {
  admin: TalentAdminClient;
  talentId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_integrations")
    .select("*")
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to read Gmail integration");
  }
  return data;
}

export async function fetchActiveTalentGmailIntegration(args: {
  admin: TalentAdminClient;
  talentId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_integrations")
    .select("*")
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to read Gmail integration");
  }
  return data;
}

export async function upsertTalentGmailIntegration(args: {
  admin: TalentAdminClient;
  connectedAccountId: string;
  talentId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_integrations")
    .upsert(
      {
        composio_connected_account_id: args.connectedAccountId,
        provider: TALENT_GMAIL_PROVIDER,
        status: "active",
        talent_id: args.talentId,
        updated_at: now,
      },
      { onConflict: "talent_id,provider" }
    )
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message ?? "Failed to save Gmail integration");
  }
  return data;
}

export async function updateTalentGmailIntegrationStatus(args: {
  admin: TalentAdminClient;
  status: Exclude<GmailIntegrationStatus, "not_connected">;
  talentId: string;
}) {
  const { error } = await args.admin
    .from("talent_integrations")
    .update({
      status: args.status,
      updated_at: new Date().toISOString(),
    })
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER);
  if (error) {
    throw new Error(error.message ?? "Failed to update Gmail integration");
  }
}

export async function deleteTalentGmailIntegration(args: {
  admin: TalentAdminClient;
  talentId: string;
}) {
  const { error } = await args.admin
    .from("talent_integrations")
    .delete()
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER);
  if (error) {
    throw new Error(error.message ?? "Failed to delete Gmail integration");
  }
}

const unavailableResult = (
  status: Exclude<GmailSearchResult["status"], "ok">,
  assistantInstruction: string
): GmailSearchResult => ({
  assistantInstruction,
  emails: [],
  status,
  truncated: false,
});

async function markAccountUnavailable(args: {
  accountStatus: string;
  admin: TalentAdminClient;
  talentId: string;
}) {
  if (args.accountStatus === "EXPIRED") {
    await updateTalentGmailIntegrationStatus({
      admin: args.admin,
      status: "expired",
      talentId: args.talentId,
    });
    return unavailableResult(
      "connection_expired",
      "Explain that Gmail access expired and ask the user to reconnect it from Profile → Resume & Links. Do not claim that the inbox was checked."
    );
  }

  await updateTalentGmailIntegrationStatus({
    admin: args.admin,
    status: "disabled",
    talentId: args.talentId,
  });
  return unavailableResult(
    "connection_required",
    "Explain that Gmail is not currently available and ask the user to connect it from Profile → Resume & Links. Do not claim that the inbox was checked."
  );
}

export async function executeConnectedGmailSearch(args: {
  admin: TalentAdminClient;
  includeContent: boolean;
  maxResults: number;
  query: string;
  talentId: string;
}): Promise<GmailSearchResult> {
  const integration = await fetchActiveTalentGmailIntegration({
    admin: args.admin,
    talentId: args.talentId,
  });
  if (!integration) {
    return unavailableResult(
      "connection_required",
      "Explain that Gmail is not connected and direct the user to Profile → Resume & Links → Gmail Connect. Do not claim that the inbox was checked."
    );
  }

  let account;
  try {
    account = await getComposioConnectedAccount(
      integration.composio_connected_account_id
    );
  } catch (error) {
    if (error instanceof ComposioApiError && error.status === 404) {
      await updateTalentGmailIntegrationStatus({
        admin: args.admin,
        status: "disabled",
        talentId: args.talentId,
      });
      return unavailableResult(
        "connection_required",
        "Explain that Gmail is not currently connected and ask the user to reconnect it from Profile → Resume & Links. Do not claim that the inbox was checked."
      );
    }
    return unavailableResult(
      "temporarily_unavailable",
      "Explain that Gmail could not be reached temporarily and suggest trying again. Do not claim that the inbox was checked or that the connection expired."
    );
  }

  if (!isOwnedComposioGmailAccount(account, args.talentId)) {
    await updateTalentGmailIntegrationStatus({
      admin: args.admin,
      status: "disabled",
      talentId: args.talentId,
    });
    return unavailableResult(
      "connection_required",
      "Explain that Gmail is not currently available and ask the user to reconnect it. Do not expose account identifiers or claim that the inbox was checked."
    );
  }

  const accountStatus = getComposioAccountStatus(account);
  if (accountStatus !== "ACTIVE") {
    return markAccountUnavailable({
      accountStatus,
      admin: args.admin,
      talentId: args.talentId,
    });
  }

  try {
    const response = await executeComposioGmailFetchEmails({
      arguments: {
        include_payload: args.includeContent,
        max_results: args.maxResults,
        query: args.query,
        user_id: "me",
      },
      connectedAccountId: integration.composio_connected_account_id,
      userId: args.talentId,
    });
    const currentIntegration = await fetchActiveTalentGmailIntegration({
      admin: args.admin,
      talentId: args.talentId,
    });
    if (
      !currentIntegration ||
      currentIntegration.composio_connected_account_id !==
        integration.composio_connected_account_id
    ) {
      return unavailableResult(
        "connection_required",
        "Explain that Gmail was disconnected before the inbox check completed. Do not use or mention any email data from this attempt."
      );
    }
    const normalized = normalizeGmailSearchResponse({
      includeContent: args.includeContent,
      maxResults: args.maxResults,
      response,
    });
    return {
      ...normalized,
      assistantInstruction:
        "Answer only from the returned Gmail results. Clearly say when no matching emails were found. Never invent missing email details or imply that additional inbox content was checked.",
      status: "ok",
    };
  } catch (error) {
    if (error instanceof ComposioApiError) {
      try {
        const refreshedAccount = await getComposioConnectedAccount(
          integration.composio_connected_account_id
        );
        const refreshedStatus = getComposioAccountStatus(refreshedAccount);
        if (
          isOwnedComposioGmailAccount(refreshedAccount, args.talentId) &&
          refreshedStatus !== "ACTIVE"
        ) {
          return markAccountUnavailable({
            accountStatus: refreshedStatus,
            admin: args.admin,
            talentId: args.talentId,
          });
        }
      } catch (refreshError) {
        if (
          refreshError instanceof ComposioApiError &&
          refreshError.status === 404
        ) {
          await updateTalentGmailIntegrationStatus({
            admin: args.admin,
            status: "disabled",
            talentId: args.talentId,
          });
          return unavailableResult(
            "connection_required",
            "Explain that Gmail is no longer connected and ask the user to reconnect it. Do not claim that the inbox was checked."
          );
        }
        // A failed status refresh must not turn a transient vendor failure into
        // a false expired-connection diagnosis.
      }
    }
    return unavailableResult(
      "temporarily_unavailable",
      "Explain that Gmail could not be reached temporarily and suggest trying again. Do not claim that the inbox was checked or that the connection expired."
    );
  }
}

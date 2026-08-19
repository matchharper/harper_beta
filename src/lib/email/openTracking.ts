import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

const RECORD_CAREER_EMAIL_FIRST_OPEN_RPC =
  "record_career_email_first_open_v1";

type RpcError = {
  message?: string;
};

type OpenTrackingRpcClient = {
  rpc: (
    functionName: string,
    args: {
      p_opened_at: string;
      p_resend_email_id: string;
    }
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export type ResendEmailOpenedEventPayload = {
  created_at?: unknown;
  data?: {
    created_at?: unknown;
    email_id?: unknown;
  };
  type?: unknown;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseResendEmailOpenedEvent(
  event: ResendEmailOpenedEventPayload
) {
  if (event.type !== "email.opened") {
    throw new Error("Expected a Resend email.opened event");
  }

  const resendEmailId = getString(event.data?.email_id);
  if (!resendEmailId) {
    throw new Error("Resend email.opened event is missing data.email_id");
  }

  const rawOpenedAt = getString(event.created_at);
  const openedTimestamp = Date.parse(rawOpenedAt);
  if (!rawOpenedAt || !Number.isFinite(openedTimestamp)) {
    throw new Error("Resend email.opened event has an invalid created_at");
  }

  return {
    openedAt: new Date(openedTimestamp).toISOString(),
    resendEmailId,
  };
}

export async function recordResendEmailOpenedEvent(args: {
  admin?: OpenTrackingRpcClient;
  event: ResendEmailOpenedEventPayload;
}) {
  const parsed = parseResendEmailOpenedEvent(args.event);
  const admin =
    args.admin ??
    (getTalentSupabaseAdmin() as unknown as OpenTrackingRpcClient);
  const { error } = await admin.rpc(RECORD_CAREER_EMAIL_FIRST_OPEN_RPC, {
    p_opened_at: parsed.openedAt,
    p_resend_email_id: parsed.resendEmailId,
  });

  if (error) {
    throw new Error(
      error.message ?? "Failed to record Resend email open event"
    );
  }

  return parsed;
}

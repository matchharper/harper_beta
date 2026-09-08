import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  ComposioApiError,
  deleteComposioConnectedAccount,
  getComposioAccountStatus,
  getComposioConnectedAccount,
  isOwnedComposioGmailAccount,
  revokeComposioConnectedAccount,
} from "@/lib/integrations/composio";
import {
  deleteTalentGmailIntegration,
  fetchTalentGmailIntegration,
  type GmailIntegrationStatus,
  updateTalentGmailIntegrationStatus,
} from "@/lib/integrations/gmail";
import {
  GMAIL_CAREER_HISTORY_ORIGIN_ID,
  GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
} from "@/lib/integrations/gmailCareerHistoryCore";
import { fetchLatestGmailCareerHistoryRun } from "@/lib/integrations/gmailCareerHistoryRun";

type GmailCareerHistoryStatus =
  | "completed"
  | "failed"
  | "not_started"
  | "queued"
  | "retrying"
  | "running"
  | "unavailable";

const statusPayload = (
  status: GmailIntegrationStatus,
  analysis?: {
    status: GmailCareerHistoryStatus;
    updatedAt: string | null;
  }
) => ({
  analysis: analysis ?? { status: "not_started", updatedAt: null },
  connected: status === "active",
  status,
});

async function fetchGmailCareerHistoryStatus(
  admin: ReturnType<typeof getTalentSupabaseAdmin>,
  talentId: string
) {
  const [documentResult, runResult] = await Promise.allSettled([
    admin
      .from("talent_documents")
      .select("updated_at")
      .eq("talent_id", talentId)
      .eq("origin_type", GMAIL_CAREER_HISTORY_ORIGIN_TYPE)
      .eq("origin_id", GMAIL_CAREER_HISTORY_ORIGIN_ID)
      .eq("is_deleted", false)
      .maybeSingle(),
    fetchLatestGmailCareerHistoryRun({ admin, talentId }),
  ]);
  if (documentResult.status === "rejected" || documentResult.value.error) {
    console.warn("[GmailIntegration] career history status unavailable", {
      code:
        documentResult.status === "fulfilled"
          ? documentResult.value.error?.code
          : "document_query_failed",
    });
  }
  if (runResult.status === "rejected") {
    console.warn("[GmailIntegration] analysis run status unavailable");
  }

  const document =
    documentResult.status === "fulfilled" && !documentResult.value.error
      ? documentResult.value.data
      : null;
  const run = runResult.status === "fulfilled" ? runResult.value : null;
  const documentUpdatedAt = document?.updated_at ?? null;
  const documentIsFromLatestRun = Boolean(
    documentUpdatedAt &&
    run &&
    new Date(documentUpdatedAt).getTime() >= new Date(run.createdAt).getTime()
  );

  if (run) {
    if (run.status === "completed") {
      return {
        status: documentIsFromLatestRun
          ? ("completed" as const)
          : ("failed" as const),
        updatedAt: documentUpdatedAt,
      };
    }
    return {
      status: run.status,
      updatedAt: documentUpdatedAt,
    };
  }
  if (document) {
    return { status: "completed" as const, updatedAt: documentUpdatedAt };
  }
  if (
    documentResult.status === "rejected" ||
    runResult.status === "rejected" ||
    documentResult.value.error
  ) {
    return { status: "unavailable" as const, updatedAt: null };
  }
  return { status: "not_started" as const, updatedAt: null };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const analysis = await fetchGmailCareerHistoryStatus(admin, user.id);
    if (req.nextUrl.searchParams.get("analysisOnly") === "true") {
      return NextResponse.json({ analysis });
    }
    const integration = await fetchTalentGmailIntegration({
      admin,
      talentId: user.id,
    });
    if (!integration) {
      return NextResponse.json(statusPayload("not_connected", analysis));
    }
    if (integration.status !== "active") {
      const status: GmailIntegrationStatus =
        integration.status === "expired" ? "expired" : "disabled";
      return NextResponse.json(statusPayload(status, analysis));
    }

    try {
      const account = await getComposioConnectedAccount(
        integration.composio_connected_account_id
      );
      if (!isOwnedComposioGmailAccount(account, user.id)) {
        await updateTalentGmailIntegrationStatus({
          admin,
          status: "disabled",
          talentId: user.id,
        });
        return NextResponse.json(statusPayload("disabled", analysis));
      }

      const remoteStatus = getComposioAccountStatus(account);
      if (remoteStatus === "ACTIVE") {
        return NextResponse.json(statusPayload("active", analysis));
      }

      const status: GmailIntegrationStatus =
        remoteStatus === "EXPIRED" ? "expired" : "disabled";
      await updateTalentGmailIntegrationStatus({
        admin,
        status,
        talentId: user.id,
      });
      return NextResponse.json(statusPayload(status, analysis));
    } catch {
      // A temporary Composio outage should not make a healthy local
      // connection appear disconnected in settings.
      return NextResponse.json({
        ...statusPayload("active", analysis),
        temporarilyUnavailable: true,
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to load Gmail integration" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const integration = await fetchTalentGmailIntegration({
      admin,
      talentId: user.id,
    });
    if (!integration) {
      return NextResponse.json({ ok: true, ...statusPayload("not_connected") });
    }

    await updateTalentGmailIntegrationStatus({
      admin,
      status: "disabled",
      talentId: user.id,
    });

    let account;
    try {
      account = await getComposioConnectedAccount(
        integration.composio_connected_account_id
      );
    } catch (error) {
      if (!(error instanceof ComposioApiError) || error.status !== 404) {
        return NextResponse.json(
          { error: "Failed to revoke Gmail integration" },
          { status: 502 }
        );
      }
    }

    if (account && !isOwnedComposioGmailAccount(account, user.id)) {
      // Never mutate a vendor account that does not belong to this Harper
      // user. Removing only the already-disabled local pointer safely
      // completes the user's disconnect request.
      await deleteTalentGmailIntegration({ admin, talentId: user.id });
      return NextResponse.json({
        ok: true,
        ...statusPayload("not_connected"),
      });
    }

    if (account && getComposioAccountStatus(account) === "ACTIVE") {
      try {
        await revokeComposioConnectedAccount(
          integration.composio_connected_account_id
        );
      } catch (error) {
        if (
          !(error instanceof ComposioApiError) ||
          (error.status !== 404 && error.status !== 409)
        ) {
          return NextResponse.json(
            { error: "Failed to revoke Gmail integration" },
            { status: 502 }
          );
        }
      }
    }

    try {
      await deleteComposioConnectedAccount(
        integration.composio_connected_account_id
      );
    } catch (error) {
      if (!(error instanceof ComposioApiError) || error.status !== 404) {
        // The provider token has already been revoked. A stale, revoked vendor
        // record must not keep the user connected inside Harper.
      }
    }

    await deleteTalentGmailIntegration({ admin, talentId: user.id });
    return NextResponse.json({ ok: true, ...statusPayload("not_connected") });
  } catch {
    return NextResponse.json(
      { error: "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }
}

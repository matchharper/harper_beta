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

const statusPayload = (status: GmailIntegrationStatus) => ({
  connected: status === "active",
  status,
});

export async function GET(req: NextRequest) {
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
      return NextResponse.json(statusPayload("not_connected"));
    }
    if (integration.status !== "active") {
      const status: GmailIntegrationStatus =
        integration.status === "expired" ? "expired" : "disabled";
      return NextResponse.json(statusPayload(status));
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
        return NextResponse.json(statusPayload("disabled"));
      }

      const remoteStatus = getComposioAccountStatus(account);
      if (remoteStatus === "ACTIVE") {
        return NextResponse.json(statusPayload("active"));
      }

      const status: GmailIntegrationStatus =
        remoteStatus === "EXPIRED" ? "expired" : "disabled";
      await updateTalentGmailIntegrationStatus({
        admin,
        status,
        talentId: user.id,
      });
      return NextResponse.json(statusPayload(status));
    } catch {
      // A temporary Composio outage should not make a healthy local
      // connection appear disconnected in settings.
      return NextResponse.json({
        ...statusPayload("active"),
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

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  ComposioApiError,
  deleteComposioConnectedAccount,
  getComposioAccountStatus,
  getComposioGmailReadAccess,
  getComposioGmailWriteAccess,
  getComposioConnectedAccount,
  isOwnedComposioGmailAccount,
  revokeComposioConnectedAccount,
} from "@/lib/integrations/composio";
import {
  deleteTalentGmailIntegration,
  fetchTalentGmailIntegration,
  gmailConnectionGeneration,
  type GmailIntegrationStatus,
  updateTalentGmailIntegrationStatus,
} from "@/lib/integrations/gmail";
import { isGoogleMailAddress } from "@/lib/integrations/googleMailDomain.server";

const statusPayload = (
  status: GmailIntegrationStatus | "permissions_required",
  writeConnected = false
) => ({
  connected: status === "active",
  writeConnected,
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
      // Anyone with a past connection already has a Google mailbox; others are checked by address.
      return NextResponse.json({
        ...statusPayload("not_connected"),
        googleMail: await isGoogleMailAddress(user.email),
      });
    }
    if (integration.status !== "active") {
      const status: GmailIntegrationStatus =
        integration.status === "expired" ? "expired" : "disabled";
      return NextResponse.json(statusPayload(status));
    }

    const connection = {
      admin,
      talentId: user.id,
      expectedAccountId: integration.composio_connected_account_id,
      expectedGeneration: gmailConnectionGeneration(integration),
    };
    try {
      const account = await getComposioConnectedAccount(
        integration.composio_connected_account_id
      );
      if (!isOwnedComposioGmailAccount(account, user.id)) {
        await updateTalentGmailIntegrationStatus({
          ...connection,
          status: "disabled",
        });
        return NextResponse.json(statusPayload("disabled"));
      }

      const remoteStatus = getComposioAccountStatus(account);
      if (remoteStatus === "ACTIVE") {
        const access = getComposioGmailReadAccess(account);
        if (access === "missing") {
          return NextResponse.json(
            statusPayload("permissions_required")
          );
        }
        if (access === "unknown") {
          return NextResponse.json(
            { error: "Unable to verify Gmail permissions" },
            { status: 503 }
          );
        }
        return NextResponse.json(statusPayload(
          "active",
          getComposioGmailWriteAccess(account) === "granted"
        ));
      }

      const status: GmailIntegrationStatus =
        remoteStatus === "EXPIRED" ? "expired" : "disabled";
      await updateTalentGmailIntegrationStatus({
        ...connection,
        status,
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

    const connection = {
      admin,
      talentId: user.id,
      expectedAccountId: integration.composio_connected_account_id,
      expectedGeneration: gmailConnectionGeneration(integration),
    };
    await updateTalentGmailIntegrationStatus({
      ...connection,
      status: "disabled",
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
      await deleteTalentGmailIntegration(connection);
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

    await deleteTalentGmailIntegration(connection);
    return NextResponse.json({ ok: true, ...statusPayload("not_connected") });
  } catch {
    return NextResponse.json(
      { error: "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }
}

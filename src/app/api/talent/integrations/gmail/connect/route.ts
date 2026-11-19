import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  createComposioGmailConnectLink,
  getComposioAccountStatus,
  getComposioConnectedAccount,
  getComposioGmailReadAccess,
  getComposioGmailWriteAccess,
  getIntegrationErrorDiagnostics,
  isOwnedComposioGmailAccount,
  listActiveComposioGmailAccounts,
} from "@/lib/integrations/composio";
import {
  fetchTalentGmailIntegration,
  gmailConnectionVersion,
} from "@/lib/integrations/gmail";
import { confirmCareerGmailConnection } from "@/lib/integrations/gmailConnection.server";

import {
  encodeGmailReturn,
  gmailCareerReturnUrl,
  gmailReturnCookieName,
  gmailReturnPath,
  gmailReturnTtl,
} from "@/lib/integrations/gmailOAuthReturn";

export async function POST(req: NextRequest) {
  let stage = "authenticate";
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.info("[GmailConnect] connect requested", {
      talentId: user.id,
    });

    stage = "load_server_config";
    const admin = getTalentSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const writeAccess = body.capability === "write";
    stage = "list_accounts";
    const [current, existingAccounts] = await Promise.all([
      fetchTalentGmailIntegration({ admin, talentId: user.id }),
      listActiveComposioGmailAccounts(user.id),
    ]);
    const previousConnection = gmailConnectionVersion(current);
    // Prefer the selected mailbox when the provider retains several accounts.
    const selectedId =
      current?.status === "active"
        ? current.composio_connected_account_id
        : null;
    const candidates = [...existingAccounts].sort(
      (a, b) => Number(b.id === selectedId) - Number(a.id === selectedId)
    );
    let existingAccount;
    for (const candidate of candidates) {
      if (!candidate.id || !isOwnedComposioGmailAccount(candidate, user.id))
        continue;
      const account = await getComposioConnectedAccount(candidate.id);
      if (
        getComposioAccountStatus(account) === "ACTIVE" &&
        isOwnedComposioGmailAccount(account, user.id) &&
        (writeAccess
          ? getComposioGmailWriteAccess(account)
          : getComposioGmailReadAccess(account)) === "granted"
      ) {
        existingAccount = account;
        break;
      }
    }

    if (existingAccount?.id) {
      stage = "save_integration";
      const receipt = await confirmCareerGmailConnection({
        admin,
        connectedAccountId: existingAccount.id,
        talentId: user.id,
        conversationId: body.conversationId,
        previousConnection,
        readGranted: getComposioGmailReadAccess(existingAccount) === "granted",
      });
      return NextResponse.json({
        ...receipt,
        alreadyConnected: true,
        connected: true,
        status: "active",
      });
    }

    const returnUrl = gmailCareerReturnUrl(body.returnTo, req.nextUrl.origin);
    const callbackUrl = new URL(gmailReturnPath, req.nextUrl.origin);
    callbackUrl.searchParams.set(
      "returnTo",
      returnUrl.pathname + returnUrl.search + returnUrl.hash
    );
    callbackUrl.searchParams.set("gmailPreviousConnection", previousConnection);
    if (body.capability === "read" || body.capability === "write")
      callbackUrl.searchParams.set("gmailCapability", body.capability);
    if (body.conversationId)
      callbackUrl.searchParams.set("gmailConversationId", body.conversationId);

    stage = "create_connect_link";
    const link = await createComposioGmailConnectLink({
      callbackUrl: callbackUrl.toString(),
      userId: user.id,
    });
    const response = NextResponse.json({
      connected: false,
      redirectUrl: link.redirectUrl,
      connectedAccountId: link.connectedAccountId,
      status: "not_connected",
    });
    response.cookies.set(
      gmailReturnCookieName(link.connectedAccountId),
      encodeGmailReturn({
        userId: user.id,
        accountId: link.connectedAccountId,
        previousConnection,
        conversationId: body.conversationId,
        capability: writeAccess ? "write" : "read",
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: gmailReturnPath,
        maxAge: gmailReturnTtl,
      }
    );
    return response;
  } catch (error) {
    if ((error as { code?: string })?.code === "40001")
      return NextResponse.json(
        { error: "Gmail connection changed during authorization" },
        { status: 409 }
      );
    const diagnostics = { stage, ...getIntegrationErrorDiagnostics(error) };
    console.error("[GmailConnect] failed", diagnostics);
    return NextResponse.json(
      {
        error: "Failed to start Gmail connection",
        // Local Network -> Response is useful even when the terminal is hidden.
        ...(process.env.NODE_ENV === "development"
          ? { debug: diagnostics }
          : {}),
      },
      { status: 500 }
    );
  }
}

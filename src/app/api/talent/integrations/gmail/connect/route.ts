import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  createComposioGmailConnectLink,
  getComposioAccountStatus,
  getComposioConnectedAccount,
  getComposioGmailReadAccess,
  getIntegrationErrorDiagnostics,
  isOwnedComposioGmailAccount,
  listActiveComposioGmailAccounts,
} from "@/lib/integrations/composio";
import { upsertTalentGmailIntegration } from "@/lib/integrations/gmail";

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
    const resumeImport = body.resumeImport === true;
    stage = "list_accounts";
    const existingAccounts = resumeImport
      ? []
      : await listActiveComposioGmailAccounts(user.id);
    // List responses may omit grant metadata; inspect each owned candidate.
    // Reauthorization always opens a fresh consent session, never a stale grant.
    let existingAccount;
    if (!resumeImport) {
      for (const candidate of existingAccounts) {
        if (!candidate.id || !isOwnedComposioGmailAccount(candidate, user.id))
          continue;
        const account = await getComposioConnectedAccount(candidate.id);
        if (
          getComposioAccountStatus(account) === "ACTIVE" &&
          isOwnedComposioGmailAccount(account, user.id) &&
          getComposioGmailReadAccess(account) === "granted"
        ) {
          existingAccount = account;
          break;
        }
      }
    }

    if (existingAccount?.id) {
      stage = "save_integration";
      await upsertTalentGmailIntegration({
        admin,
        connectedAccountId: existingAccount.id,
        talentId: user.id,
      });
      return NextResponse.json({
        alreadyConnected: true,
        connected: true,
        status: "active",
      });
    }

    const callbackUrl = new URL("/career/profile", req.nextUrl.origin);
    callbackUrl.searchParams.set("gmailConnect", "callback");
    callbackUrl.searchParams.set("profileSection", "links");
    if (resumeImport) callbackUrl.searchParams.set("gmailImport", "resume");

    stage = "create_connect_link";
    const link = await createComposioGmailConnectLink({
      callbackUrl: callbackUrl.toString(),
      userId: user.id,
    });
    return NextResponse.json({
      connected: false,
      redirectUrl: link.redirectUrl,
      connectedAccountId: link.connectedAccountId,
      status: "not_connected",
    });
  } catch (error) {
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

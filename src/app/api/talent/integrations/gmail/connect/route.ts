import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  createComposioGmailConnectLink,
  getComposioAccountStatus,
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

    stage = "load_server_config";
    const admin = getTalentSupabaseAdmin();
    stage = "list_accounts";
    const existingAccounts = await listActiveComposioGmailAccounts(user.id);
    const existingAccount = existingAccounts.find(
      (account) =>
        Boolean(account.id) &&
        getComposioAccountStatus(account) === "ACTIVE" &&
        isOwnedComposioGmailAccount(account, user.id)
    );

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
    callbackUrl.searchParams.set("panel", "settings");
    callbackUrl.searchParams.set("settingsTab", "resume");

    stage = "create_connect_link";
    const link = await createComposioGmailConnectLink({
      callbackUrl: callbackUrl.toString(),
      userId: user.id,
    });
    return NextResponse.json({
      connected: false,
      redirectUrl: link.redirectUrl,
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

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  getComposioAccountStatus,
  getComposioGmailReadAccess,
  getComposioGmailWriteAccess,
  getComposioConnectedAccount,
  isOwnedComposioGmailAccount,
} from "@/lib/integrations/composio";
import { confirmCareerGmailConnection } from "@/lib/integrations/gmailConnection.server";

import {
  gmailCareerReturnUrl,
  gmailReturnCookieName,
  gmailReturnPath,
  readGmailReturn,
} from "@/lib/integrations/gmailOAuthReturn";

export const runtime = "nodejs";
export const maxDuration = 300;

type CompleteBody = {
  connectedAccountId?: string;
  capability?: "read" | "write";
  conversationId?: string;
  previousConnection?: string;
};

async function complete(userId: string, body: CompleteBody) {
  const connectedAccountId = String(body.connectedAccountId ?? "").trim();
  if (!connectedAccountId) {
    return NextResponse.json(
      { error: "connectedAccountId is required" },
      { status: 400 }
    );
  }

  const account = await getComposioConnectedAccount(connectedAccountId);
  if (
    account.id !== connectedAccountId ||
    !isOwnedComposioGmailAccount(account, userId)
  ) {
    return NextResponse.json(
      { error: "Gmail connection could not be verified" },
      { status: 403 }
    );
  }
  if (getComposioAccountStatus(account) !== "ACTIVE") {
    return NextResponse.json(
      { error: "Gmail connection is not active" },
      { status: 409 }
    );
  }

  const read = getComposioGmailReadAccess(account);
  const compose = getComposioGmailWriteAccess(account);
  const send = getComposioGmailWriteAccess(account, "send");
  const access = body.capability === "write" ? compose : read;
  if (access === "unknown") {
    return NextResponse.json(
      { error: "Unable to verify Gmail permissions" },
      { status: 503 }
    );
  }
  const receipt =
    read === "granted" || compose === "granted" || send === "granted"
      ? await confirmCareerGmailConnection({
          admin: getTalentSupabaseAdmin(),
          connectedAccountId,
          talentId: userId,
          conversationId: body.conversationId,
          previousConnection: body.previousConnection,
          readGranted: read === "granted",
        })
      : {};

  return NextResponse.json({
    ...receipt,
    connected: access === "granted",
    ok: true,
    status: access === "granted" ? "active" : "permissions_required",
    capabilities: { read, compose, send },
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return await complete(user.id, await req.json().catch(() => ({})));
  } catch (error) {
    if ((error as { code?: string })?.code === "40001")
      return NextResponse.json(
        { error: "Gmail connection changed during authorization" },
        { status: 409 }
      );
    return NextResponse.json(
      { error: "Failed to complete Gmail connection" },
      { status: 500 }
    );
  }
}

// Composio returns here after the provider exchanged the OAuth code. Admit the
// run before redirecting, even if the user never mounts the Career page.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const target = gmailCareerReturnUrl(
    params.get("returnTo"),
    req.nextUrl.origin
  );
  const accountId =
    params.get("connected_account_id") ??
    params.get("connectedAccountId") ??
    "";
  const cookieName = gmailReturnCookieName(accountId);
  const intent = readGmailReturn(req.cookies.get(cookieName)?.value, accountId);
  let status = params.get("status") ?? "failed";
  let verified = false;
  if (status === "success" && intent) {
    try {
      const result = await complete(intent.userId, {
        connectedAccountId: accountId,
        previousConnection: intent.previousConnection,
        conversationId: intent.conversationId,
        capability: intent.capability,
      });
      if (result.ok) {
        verified = true;
        if ((await result.json()).status === "permissions_required")
          status = "permissions_required";
      } else if (result.status < 500) {
        status = "failed";
      }
    } catch {
      // The authenticated Career page can retry a transient provider or DB failure.
    }
  }
  target.searchParams.set("gmailConnect", verified ? "verified" : "callback");
  target.searchParams.set("status", status);
  if (accountId) target.searchParams.set("connected_account_id", accountId);
  for (const key of [
    "gmailCapability",
    "gmailConversationId",
    "gmailPreviousConnection",
  ]) {
    const value = params.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (intent)
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      path: gmailReturnPath,
      maxAge: 0,
    });
  return response;
}

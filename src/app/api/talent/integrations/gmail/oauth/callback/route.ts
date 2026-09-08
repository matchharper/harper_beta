import { NextRequest, NextResponse } from "next/server";

// This is the self-hosted redirect URI registered in both the Google OAuth
// client and the Gmail Auth Config in Composio. It deliberately does not read,
// exchange, persist, or log the authorization code. The browser must follow
// this 302 so Composio can complete the token exchange and then redirect to
// the callback URL supplied when the connection link was created.
const COMPOSIO_OAUTH_CALLBACK_URL =
  "https://backend.composio.dev/api/v1/auth-apps/add";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const destination = new URL(COMPOSIO_OAUTH_CALLBACK_URL);
  destination.search = req.nextUrl.search;

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

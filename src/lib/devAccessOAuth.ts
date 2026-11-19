import { randomBytes } from "node:crypto";
import {
  CodeChallengeMethod,
  OAuth2Client,
  type TokenPayload,
} from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";
import {
  DEV_ACCESS_CALLBACK,
  DEV_ACCESS_COOKIE,
  DEV_ACCESS_DOMAIN,
  DEV_ACCESS_LOGIN,
  DEV_ACCESS_OAUTH_COOKIE,
  DEV_ACCESS_OAUTH_SECONDS,
  DEV_ACCESS_ORIGIN,
  devAccessCookieOptions,
  devAccessResponse,
  devAccessReturnTo,
  devAccessSecret,
  encodeDevAccessCookie,
  isDevAccessHost,
  isHarperDevIdentity,
  readDevAccessCookie,
  type DevAccessIdentity,
  type DevAccessOAuthState,
} from "./devAccess";

function googleClient() {
  const clientId = process.env.DEV_ACCESS_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.DEV_ACCESS_GOOGLE_CLIENT_SECRET;
  const secret = devAccessSecret();
  if (!clientId || !clientSecret || !secret) return null;
  return {
    clientId,
    secret,
    client: new OAuth2Client(
      clientId,
      clientSecret,
      `${DEV_ACCESS_ORIGIN}${DEV_ACCESS_CALLBACK}`
    ),
  };
}

function failure(status: number, message: string) {
  // Only fixed server-authored messages are rendered here, never OAuth query values.
  const response = devAccessResponse(
    new NextResponse(
      `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harper 개발 사이트</title><main><p>${message}</p><a href="${DEV_ACCESS_LOGIN}">회사 Google 계정으로 다시 로그인</a></main></html>`,
      { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  );
  response.cookies.set(DEV_ACCESS_OAUTH_COOKIE, "", {
    ...devAccessCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(DEV_ACCESS_COOKIE, "", {
    ...devAccessCookieOptions,
    maxAge: 0,
  });
  return response;
}

export function verifiedDevGoogleIdentity(
  payload: (TokenPayload & { nonce?: string }) | undefined,
  nonce: string,
  nowSeconds = Date.now() / 1000
): DevAccessIdentity | null {
  // Called only after verifyIdToken verifies Google's signature, issuer and audience.
  if (
    !payload ||
    payload.email_verified !== true ||
    payload.nonce !== nonce ||
    payload.exp <= nowSeconds
  ) {
    return null;
  }
  const identity = {
    sub: payload.sub,
    email: payload.email?.toLowerCase(),
    hd: payload.hd?.toLowerCase(),
    exp: payload.exp,
  };
  if (!isHarperDevIdentity(identity)) return null;
  return identity as DevAccessIdentity;
}

export async function startDevGoogleLogin(request: NextRequest) {
  if (!isDevAccessHost(request)) return new NextResponse(null, { status: 404 });
  const config = googleClient();
  if (!config)
    return failure(503, "개발 사이트의 Google 인증 설정이 필요합니다.");

  const pkce = await config.client.generateCodeVerifierAsync();
  const transaction: DevAccessOAuthState = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    codeVerifier: pkce.codeVerifier,
    returnTo: devAccessReturnTo(request.nextUrl.searchParams.get("returnTo")),
    exp: Math.floor(Date.now() / 1000) + DEV_ACCESS_OAUTH_SECONDS,
  };
  const googleUrl = config.client.generateAuthUrl({
    scope: ["openid", "email"],
    access_type: "online",
    prompt: "select_account",
    hd: DEV_ACCESS_DOMAIN,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  const response = devAccessResponse(NextResponse.redirect(googleUrl));
  response.cookies.set(
    DEV_ACCESS_OAUTH_COOKIE,
    encodeDevAccessCookie(transaction, "oauth", config.secret),
    {
      ...devAccessCookieOptions,
      maxAge: DEV_ACCESS_OAUTH_SECONDS,
    }
  );
  return response;
}

export async function finishDevGoogleLogin(request: NextRequest) {
  if (!isDevAccessHost(request)) return new NextResponse(null, { status: 404 });
  const config = googleClient();
  if (!config)
    return failure(503, "개발 사이트의 Google 인증 설정이 필요합니다.");

  const transaction = readDevAccessCookie(
    request.cookies.get(DEV_ACCESS_OAUTH_COOKIE)?.value,
    "oauth",
    config.secret
  );
  const code = request.nextUrl.searchParams.get("code");
  if (
    !transaction ||
    typeof transaction.state !== "string" ||
    transaction.state !== request.nextUrl.searchParams.get("state") ||
    typeof transaction.nonce !== "string" ||
    typeof transaction.codeVerifier !== "string" ||
    typeof transaction.returnTo !== "string" ||
    !code ||
    request.nextUrl.searchParams.has("error")
  ) {
    return failure(
      400,
      "로그인 요청이 만료됐거나 확인되지 않았습니다. 다시 로그인해 주세요."
    );
  }

  try {
    const { tokens } = await config.client.getToken({
      code,
      codeVerifier: transaction.codeVerifier,
    });
    if (!tokens.id_token) throw new Error("Missing Google ID token");
    const ticket = await config.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const identity = verifiedDevGoogleIdentity(
      ticket.getPayload(),
      transaction.nonce
    );
    if (!identity)
      return failure(
        403,
        "@matchharper.com 회사 Google 계정으로 로그인해 주세요."
      );

    const response = devAccessResponse(
      NextResponse.redirect(
        new URL(devAccessReturnTo(transaction.returnTo), DEV_ACCESS_ORIGIN)
      )
    );
    // A browser-session cookie; server-side expiry is Google's ID-token expiry.
    response.cookies.set(
      DEV_ACCESS_COOKIE,
      encodeDevAccessCookie(identity, "session", config.secret),
      devAccessCookieOptions
    );
    response.cookies.set(DEV_ACCESS_OAUTH_COOKIE, "", {
      ...devAccessCookieOptions,
      maxAge: 0,
    });
    return response;
  } catch {
    // OAuth errors may contain codes/tokens. Do not log their raw objects.
    return failure(
      401,
      "Google 로그인을 확인하지 못했습니다. 다시 로그인해 주세요."
    );
  }
}

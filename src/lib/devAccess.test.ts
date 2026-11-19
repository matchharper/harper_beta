import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";
import { OAuth2Client } from "google-auth-library";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../proxy";
import {
  DEV_ACCESS_CALLBACK,
  DEV_ACCESS_COOKIE,
  DEV_ACCESS_LOGIN,
  DEV_ACCESS_OAUTH_COOKIE,
  DEV_ACCESS_ORIGIN,
  devAccessReturnTo,
  encodeDevAccessCookie,
  readDevAccessCookie,
} from "./devAccess";
import { finishDevGoogleLogin, startDevGoogleLogin } from "./devAccessOAuth";

const secret = "test-only-".repeat(5);
const audience = "dev-access-test.apps.googleusercontent.com";
const previousEnv = { ...process.env };
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" });

beforeEach(() => {
  process.env.DEV_ACCESS_SESSION_SECRET = secret;
  process.env.DEV_ACCESS_GOOGLE_CLIENT_ID = audience;
  process.env.DEV_ACCESS_GOOGLE_CLIENT_SECRET = "test-only-google-secret";
});
afterEach(() => {
  mock.restoreAll();
  for (const key of [
    "DEV_ACCESS_SESSION_SECRET",
    "DEV_ACCESS_GOOGLE_CLIENT_ID",
    "DEV_ACCESS_GOOGLE_CLIENT_SECRET",
  ]) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

function request(
  path: string,
  cookie?: string,
  origin = DEV_ACCESS_ORIGIN,
  method = "GET"
) {
  return new NextRequest(`${origin}${path}`, {
    method,
    headers: { host: new URL(origin).host, ...(cookie ? { cookie } : {}) },
  });
}

function identity() {
  return {
    sub: "team-user",
    email: "team@matchharper.com",
    hd: "matchharper.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

function idToken(claims: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "fixture" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      ...identity(),
      email_verified: true,
      iss: "https://accounts.google.com",
      aud: audience,
      iat: Math.floor(Date.now() / 1000),
      ...claims,
    })
  ).toString("base64url");
  const body = `${header}.${payload}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), keys.privateKey).toString("base64url")}`;
}

async function begin() {
  const response = await startDevGoogleLogin(
    request(
      `${DEV_ACCESS_LOGIN}?returnTo=${encodeURIComponent("/career/history?tab=external")}`
    )
  );
  const url = new URL(response.headers.get("location")!);
  const cookie = response.cookies.get(DEV_ACCESS_OAUTH_COOKIE)!.value;
  return {
    response,
    url,
    cookie,
    callback: `${DEV_ACCESS_CALLBACK}?state=${url.searchParams.get("state")}&code=one-use-code`,
  };
}

test("dev requires authentication on root, direct pages, APIs, assets and dotted paths", () => {
  for (const path of [
    "/",
    "/career",
    "/ops/metrics",
    "/api/export/report.csv",
    "/_next/data/build/career.json",
    "/_next/static/app.js",
    "/resume.pdf",
  ]) {
    assert.equal(
      unstable_doesMiddlewareMatch({
        config: config as Parameters<
          typeof unstable_doesMiddlewareMatch
        >[0]["config"],
        nextConfig: {},
        url: `${DEV_ACCESS_ORIGIN}${path}`,
        headers: { host: "dev.matchharper.com" },
      }),
      true,
      path
    );
    const response = proxy(request(path));
    assert.equal(
      response.status,
      path.startsWith("/api/") || path.startsWith("/_next/static/") ? 401 : 307,
      path
    );
    assert.equal(response.headers.get("x-middleware-next"), null, path);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(
    proxy(request("/career", undefined, DEV_ACCESS_ORIGIN, "POST")).status,
    401
  );
  // Next may normalize its URL to the server origin while preserving Host.
  assert.equal(
    proxy(
      new NextRequest("http://localhost:3000/", {
        headers: { host: "dev.matchharper.com" },
      })
    ).status,
    307
  );
});

test("only signed, unexpired company sessions pass; customer cookies do not grant access", () => {
  const token = encodeDevAccessCookie(identity(), "session", secret);
  assert.equal(
    proxy(
      request("/api/org/roles", `${DEV_ACCESS_COOKIE}=${token}`)
    ).headers.get("x-middleware-next"),
    "1"
  );
  for (const bad of [
    token + ".extra",
    encodeDevAccessCookie(identity(), "session", "wrong-secret"),
    encodeDevAccessCookie(identity(), "oauth", secret),
    encodeDevAccessCookie({ ...identity(), exp: 0 }, "session", secret),
    encodeDevAccessCookie(
      { ...identity(), email: "team@gmail.com" },
      "session",
      secret
    ),
    encodeDevAccessCookie(
      { ...identity(), hd: "other.com" },
      "session",
      secret
    ),
  ]) {
    assert.equal(
      proxy(request("/api/org/roles", `${DEV_ACCESS_COOKIE}=${bad}`)).status,
      401
    );
  }
  const forged = `${Buffer.from(JSON.stringify({ ...identity(), exp: 9999999999 })).toString("base64url")}.${token.split(".")[1]}`;
  assert.equal(readDevAccessCookie(forged, "session", secret), null);
  assert.equal(
    proxy(request("/", "sb-auth-token=customer-session")).status,
    307
  );
});

test("missing credentials fail closed on dev and do not change production or localhost", async () => {
  delete process.env.DEV_ACCESS_SESSION_SECRET;
  assert.equal(proxy(request("/")).status, 503);
  assert.equal(
    (await startDevGoogleLogin(request(DEV_ACCESS_LOGIN))).status,
    503
  );
  for (const origin of [
    "https://matchharper.com",
    "https://app.matchharper.com",
    "http://localhost:3000",
  ]) {
    assert.equal(proxy(request("/career", undefined, origin)).status, 200);
    assert.equal(
      (await startDevGoogleLogin(request(DEV_ACCESS_LOGIN, undefined, origin)))
        .status,
      404
    );
    assert.equal(
      (
        await finishDevGoogleLogin(
          request(DEV_ACCESS_CALLBACK, undefined, origin)
        )
      ).status,
      404
    );
  }
  assert.equal(
    proxy(request("/", undefined, "https://app.matchharper.com")).headers.get(
      "x-middleware-rewrite"
    ),
    "https://app.matchharper.com/radar"
  );
  assert.equal(
    unstable_doesMiddlewareMatch({
      config: config as Parameters<
        typeof unstable_doesMiddlewareMatch
      >[0]["config"],
      nextConfig: {},
      url: "https://matchharper.com/_next/static/app.js",
      headers: { host: "matchharper.com" },
    }),
    false
  );
});

test("OAuth starts with PKCE, nonce, account choice, fixed callback and secure browser cookie", async () => {
  const { response, url, cookie } = await begin();
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email");
  assert.equal(url.searchParams.get("hd"), "matchharper.com");
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    `${DEV_ACCESS_ORIGIN}${DEV_ACCESS_CALLBACK}`
  );
  assert.ok(url.searchParams.get("nonce"));
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(readDevAccessCookie(cookie, "oauth", secret));
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(response.headers.get("set-cookie")!, /Secure/);
  assert.match(response.headers.get("set-cookie")!, /SameSite=lax/i);
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/api/dev-access/login",
  ]) {
    assert.equal(devAccessReturnTo(path), "/");
  }
});

test("callback rejects missing, expired or mismatched browser state before token exchange", async () => {
  const { callback, cookie } = await begin();
  const exchange = mock.method(OAuth2Client.prototype, "getToken", async () => {
    throw new Error("must not exchange");
  });
  assert.equal((await finishDevGoogleLogin(request(callback))).status, 400);
  assert.equal(
    (
      await finishDevGoogleLogin(
        request(
          callback.replace(/state=[^&]+/, "state=wrong"),
          `${DEV_ACCESS_OAUTH_COOKIE}=${cookie}`
        )
      )
    ).status,
    400
  );
  const state = readDevAccessCookie(cookie, "oauth", secret)!;
  const expired = encodeDevAccessCookie(
    {
      state: String(state.state),
      nonce: String(state.nonce),
      codeVerifier: String(state.codeVerifier),
      returnTo: "/",
      exp: 0,
    },
    "oauth",
    secret
  );
  assert.equal(
    (
      await finishDevGoogleLogin(
        request(callback, `${DEV_ACCESS_OAUTH_COOKIE}=${expired}`)
      )
    ).status,
    400
  );
  assert.equal(exchange.mock.callCount(), 0);
});

test("callback verifies actual JWT signatures and claims before issuing a dev-only session", async () => {
  const flow = await begin();
  const transaction = readDevAccessCookie(flow.cookie, "oauth", secret)!;
  let token = idToken({ nonce: transaction.nonce });
  mock.method(
    OAuth2Client.prototype,
    "getFederatedSignonCertsAsync",
    async () => ({ certs: { fixture: publicPem }, format: "PEM" })
  );
  const exchange = mock.method(
    OAuth2Client.prototype,
    "getToken",
    async () => ({ tokens: { id_token: token } })
  );
  const callbackRequest = () =>
    request(
      flow.callback,
      `${DEV_ACCESS_OAUTH_COOKIE}=${flow.cookie}; sb-auth-token=existing-test-account`
    );
  const response = await finishDevGoogleLogin(callbackRequest());
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    `${DEV_ACCESS_ORIGIN}/career/history?tab=external`
  );
  const session = response.cookies.get(DEV_ACCESS_COOKIE)!.value;
  assert.equal(
    readDevAccessCookie(session, "session", secret)?.email,
    "team@matchharper.com"
  );
  assert.equal(response.cookies.get(DEV_ACCESS_OAUTH_COOKIE)?.maxAge, 0);
  assert.equal(response.cookies.get("sb-auth-token"), undefined);
  assert.deepEqual(exchange.mock.calls[0].arguments[0], {
    code: "one-use-code",
    codeVerifier: transaction.codeVerifier,
  });
  assert.equal(
    proxy(request("/api/org/roles", `${DEV_ACCESS_COOKIE}=${session}`)).status,
    200
  );

  for (const claims of [
    { email: "outsider@gmail.com", hd: undefined },
    { email: "outsider@matchharper.com.evil.example", hd: "matchharper.com" },
    { hd: undefined },
    { email_verified: false },
    { nonce: "other-browser" },
    { aud: "another-client" },
    { iss: "https://evil.example" },
    { exp: Math.floor(Date.now() / 1000) - 600 },
  ]) {
    token = idToken({ nonce: transaction.nonce, ...claims });
    const denied = await finishDevGoogleLogin(callbackRequest());
    assert.ok([401, 403].includes(denied.status), JSON.stringify(claims));
    assert.equal(denied.cookies.get(DEV_ACCESS_COOKIE)?.maxAge, 0);
  }
  const valid = idToken({ nonce: transaction.nonce });
  token = valid.slice(0, valid.lastIndexOf(".") + 1) + "forged-signature";
  assert.equal((await finishDevGoogleLogin(callbackRequest())).status, 401);
});

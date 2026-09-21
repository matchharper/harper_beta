import { OAuth2Client, type TokenPayload } from "google-auth-library";

const HARPER_WORKSPACE_DOMAIN = "matchharper.com";

export type ContentsEngineSheetsIdentity = {
  email: string;
  subject: string;
};

function configuredAudiences() {
  return (process.env.GTM_SHEETS_GOOGLE_OAUTH_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateContentsEngineSheetsIdentity(
  payload: TokenPayload | undefined,
  allowedAudiences: string[]
): ContentsEngineSheetsIdentity {
  if (!payload) throw new Error("Google identity token has no payload");
  if (allowedAudiences.length === 0) {
    throw new Error("GTM_SHEETS_GOOGLE_OAUTH_CLIENT_IDS is required");
  }

  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audience.some((value) => value && allowedAudiences.includes(value))) {
    throw new Error("Google identity token audience is not allowed");
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const hostedDomain = String(payload.hd ?? "").trim().toLowerCase();
  if (
    payload.email_verified !== true ||
    hostedDomain !== HARPER_WORKSPACE_DOMAIN ||
    !email.endsWith(`@${HARPER_WORKSPACE_DOMAIN}`)
  ) {
    throw new Error("A verified Harper Google Workspace account is required");
  }
  if (!payload.sub) throw new Error("Google identity token has no subject");

  return { email, subject: payload.sub };
}

export async function verifyContentsEngineSheetsIdentity(
  idToken: string
): Promise<ContentsEngineSheetsIdentity> {
  const token = idToken.trim();
  if (!token) throw new Error("Google identity token is required");

  const audiences = configuredAudiences();
  if (audiences.length === 0) {
    throw new Error("GTM_SHEETS_GOOGLE_OAUTH_CLIENT_IDS is required");
  }

  const ticket = await new OAuth2Client().verifyIdToken({
    audience: audiences,
    idToken: token,
  });
  return validateContentsEngineSheetsIdentity(ticket.getPayload(), audiences);
}

export function bearerToken(authorization: string | null) {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
}

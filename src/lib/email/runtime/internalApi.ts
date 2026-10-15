import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { requireInternalWorkerSecret } from "@/lib/internalApi";
import { NextRequest } from "next/server";

// Invoke existing Next business endpoints locally. No network round trip, new
// user session, second implementation, or production credential in a payload.
export async function callEmailInternalApi(
  path: string,
  body: Record<string, unknown>
) {
  const secret = process.env.INTERNAL_WORKER_API_SECRET?.trim();
  if (!secret)
    throw new Error(
      "INTERNAL_WORKER_API_SECRET is required for email processing"
    );
  const request = new NextRequest(new URL(path, getConfiguredPublicSiteUrl()), {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  requireInternalWorkerSecret(request);
  let handler: (req: NextRequest) => Promise<Response>;
  switch (path) {
    case "/api/internal/career/email-onboarding/ingest-profile":
      handler = (
        await import("@/app/api/internal/career/email-onboarding/ingest-profile/route")
      ).POST;
      break;
    case "/api/internal/career/email-onboarding/seed-profile-submit":
      handler = (
        await import("@/app/api/internal/career/email-onboarding/seed-profile-submit/route")
      ).POST;
      break;
    case "/api/internal/company-talent-requests/accept-opportunity":
      handler = (
        await import("@/app/api/internal/company-talent-requests/accept-opportunity/route")
      ).POST;
      break;
    case "/api/internal/company-talent-requests/deliver":
      handler = (
        await import("@/app/api/internal/company-talent-requests/deliver/route")
      ).POST;
      break;
    default:
      throw new Error("Unsupported email internal endpoint");
  }
  const response = await handler(request);
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `Email operation failed (${response.status}): ${result.error ?? "unknown"}`
    );
  return result;
}

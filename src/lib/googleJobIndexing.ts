import "server-only";

import { GoogleAuth } from "google-auth-library";
import { buildOfficialJobCanonicalUrl } from "@/lib/officialJobs/seo";

const GOOGLE_INDEXING_API_URL =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
const GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

export type GoogleJobIndexingNotificationType = "URL_DELETED" | "URL_UPDATED";

function isGoogleIndexingEnabled() {
  return process.env.GOOGLE_INDEXING_API_ENABLED?.trim() === "true";
}

function createGoogleIndexingAuth() {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  ).trim();

  if (Boolean(clientEmail) !== Boolean(privateKey)) {
    throw new Error(
      "GOOGLE_INDEXING_CLIENT_EMAIL and GOOGLE_INDEXING_PRIVATE_KEY must be configured together"
    );
  }

  return new GoogleAuth({
    credentials:
      clientEmail && privateKey
        ? {
            client_email: clientEmail,
            private_key: privateKey,
          }
        : undefined,
    scopes: [GOOGLE_INDEXING_SCOPE],
  });
}

export async function notifyGoogleJobIndexing(args: {
  slug: string;
  type: GoogleJobIndexingNotificationType;
}) {
  if (!isGoogleIndexingEnabled()) return { status: "disabled" as const };

  const url = buildOfficialJobCanonicalUrl(args.slug);
  const auth = createGoogleIndexingAuth();
  await auth.request({
    data: {
      type: args.type,
      url,
    },
    method: "POST",
    url: GOOGLE_INDEXING_API_URL,
  });

  return { status: "notified" as const, type: args.type, url };
}

export async function notifyGoogleJobIndexingBestEffort(args: {
  slug: string;
  type: GoogleJobIndexingNotificationType;
}) {
  try {
    return await notifyGoogleJobIndexing(args);
  } catch (error) {
    console.error("[official-jobs] Google Indexing API notification failed", {
      error: error instanceof Error ? error.message : String(error),
      slug: args.slug,
      type: args.type,
    });
    return { status: "failed" as const };
  }
}

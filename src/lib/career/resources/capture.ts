import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { databaseError, fingerprint, record, resourceDb, text } from "./types";

/** Providers, not model arguments, establish permission to reuse a source. */
export type PublicCapture = {
  provider: "exa_search" | "public_job_page" | "exa_public_contents";
  contract: string;
  publishedAt?: string;
  fetchedAt?: string;
  coverage?: string;
  searchTextLimitReached?: boolean;
  requestedAt?: string;
};
export function publicResourceKey(raw: string) {
  const url = new URL(raw);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("A public HTTP source URL is required.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return `public:${url.toString()}`;
}
export async function capturePublicSource(args: {
  admin: TalentAdminClient;
  url: string;
  title: string;
  content: string;
  source: PublicCapture;
  leaseOwner?: string;
}) {
  const { data, error } = await resourceDb(args.admin).rpc(
    "career_capture_public_source_v1",
    {
      p_resource_key: publicResourceKey(args.url),
      p_url: args.url,
      p_title: args.title,
      p_content: args.content,
      p_hash: fingerprint(args.content),
      p_provenance: {
        scope: "public",
        provider: args.source.provider,
        contract: args.source.contract,
        coverage: args.source.coverage ?? null,
        ...(args.source.searchTextLimitReached !== undefined
          ? { searchTextLimitReached: args.source.searchTextLimitReached } : {}),
        requestedAt: args.source.requestedAt ?? new Date().toISOString(),
      },
      p_published_at: args.source.publishedAt ?? null,
      p_fetched_at: args.source.fetchedAt ?? null,
      p_lease_owner: args.leaseOwner ?? null,
    }
  );
  databaseError(error);
  const value = record(data);
  return {
    documentId: Number(value.documentId),
    observationId: text(value.observationId),
    observedAt: text(value.observedAt),
    lastSuccessfulCheckAt: text(value.lastSuccessfulCheckAt),
    sourceFetchedAt: text(value.sourceFetchedAt) || null,
    indexState: text(value.indexState),
  };
}

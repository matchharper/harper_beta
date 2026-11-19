import { capturePublicSource, publicResourceKey } from "./capture";
import {
  databaseError,
  record,
  resourceDb,
  type ResourceContext,
  type ResourceRef,
} from "./types";

/** A search hit with no page body remains a usable lead. Its observation says
 * exactly which public metadata was returned; it never claims a page read. */
export async function webResultRef(
  context: ResourceContext,
  result: {
    url: string;
    title: string;
    highlights: string[];
    publishedDate?: string;
    author?: string;
    resourceRef?: { kind: "web_resource"; id: string; revision: string };
  }
): Promise<ResourceRef> {
  // The public capture receipt is the exact version returned by this search,
  // including when another request has since refreshed the URL.
  if (result.resourceRef) return result.resourceRef;
  const source = await resourceDb(context.admin)
    .from("documents")
    .select("id,current_observation_id")
    .eq("resource_key", publicResourceKey(result.url))
    .eq("source_scope", "public")
    .maybeSingle();
  databaseError(source.error);
  const row = record(source.data);
  if (row.current_observation_id)
    return {
      kind: "web_resource",
      id: String(row.id),
      revision: String(row.current_observation_id),
    };
  const captured = await capturePublicSource({
    admin: context.admin,
    url: result.url,
    title: result.title,
    content: [result.title, result.url, result.author, ...result.highlights]
      .filter(Boolean)
      .join("\n"),
    source: {
      provider: "exa_search",
      contract: "exa-search-metadata-v1",
      publishedAt: result.publishedDate,
      coverage:
        "Public search-result metadata/highlights only. The page body has not been read.",
    },
  });
  return {
    kind: "web_resource",
    id: String(captured.documentId),
    revision: captured.observationId,
  };
}

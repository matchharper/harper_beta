import { getEncoding } from "js-tiktoken";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  embedTitles,
  EMBEDDING_MODEL,
} from "@/lib/externalRecommendationsV2/retrieval";
import { readResource } from "./read";
import { readCompanyBundles } from "./companyData";
import {
  readCompanyObservations,
  companyObservationBody,
} from "./companySources";
import {
  databaseError,
  fingerprint,
  record,
  resourceDb,
  rows,
  text,
} from "./types";

export type SourceJob = {
  kind: "source";
  scope: "public" | "private";
  ownerId: string | null;
  resourceKind: string;
  id: string;
  revision: string;
  generation: string;
  executionEnvironment?: string;
};
const encoding = getEncoding("cl100k_base");
/** 6,000-token chunks stay inside the embedding endpoint's 8,192-token input
 * contract. Token locators preserve original order; this is not a content quota. */
export function sourceChunks(body: string) {
  const tokens = encoding.encode(body),
    chunks: Array<{ key: string; body: string }> = [];
  for (let start = 0; start < tokens.length; start += 6000)
    chunks.push({
      key: `tokens:${start}:${Math.min(start + 6000, tokens.length)}`,
      body: encoding.decode(tokens.slice(start, start + 6000)),
    });
  return chunks;
}
export async function readIndexSource(
  admin: TalentAdminClient,
  job: SourceJob
) {
  const db = resourceDb(admin);
  if (job.scope === "private" && job.resourceKind === "discovery_request") {
    const { discoveryIndexText } = await import("./discovery");
    return discoveryIndexText(admin, job);
  }
  if (
    job.scope === "private" &&
    job.ownerId &&
    job.resourceKind === "document"
  ) {
    const source = await readResource(
      { admin, userId: job.ownerId },
      { kind: "document", id: job.id, revision: job.revision }
    );
    return source.status === "available"
      ? `${source.title}\n${source.body}`
      : null;
  }
  if (job.scope !== "public" || job.ownerId !== null)
    throw new Error("Source scope mismatch.");
  if (job.resourceKind === "web_resource") {
    const source = await db
      .from("documents")
      .select("title,current_observation_id")
      .eq("id", job.id)
      .eq("source_scope", "public")
      .maybeSingle();
    databaseError(source.error);
    const row = record(source.data);
    if (row.current_observation_id !== job.revision) return null;
    const observed = await db
      .from("career_public_observations")
      .select("content")
      .eq("id", job.revision)
      .is("deleted_at", null)
      .maybeSingle();
    databaseError(observed.error);
    return observed.data
      ? `${text(row.title)}\n${text(record(observed.data).content)}`
      : null;
  }
  if (job.resourceKind === "company") {
    const source = await db
      .from("company_db")
      .select(
        "name,description,short_description,location,specialities,public_facts_revision"
      )
      .eq("id", job.id)
      .maybeSingle();
    databaseError(source.error);
    const row = record(source.data);
    if (String(row.public_facts_revision) !== job.revision) return null;
    const observations = await readCompanyObservations(admin, job.id);
    // Any workspace of the company reads the research held by its home workspace.
    const workspace = await db.from("company_workspace").select("company_workspace_id").eq("company_db_id", job.id).limit(1).maybeSingle();
    databaseError(workspace.error);
    const dataBodies: string[] = [];
    for (let offset = 0; workspace.data; ) {
      const [page] = await readCompanyBundles(admin, [String(workspace.data.company_workspace_id)], [], offset);
      if (!page?.items.length) break;
      dataBodies.push(...page.items.map(datum => datum.label + "\n" + datum.content));
      offset += page.items.length;
      if (offset >= page.total) break;
    }
    return [
      row.name,
      row.description,
      row.short_description,
      row.location,
      row.specialities,
      ...dataBodies,
      ...observations.map(companyObservationBody),
    ]
      .filter(Boolean)
      .join("\n");
  }
  throw new Error("Unsupported index source.");
}
export async function processSourceIndex(
  admin: TalentAdminClient,
  job: SourceJob,
  deadlineAt = Date.now() + 650000
) {
  const db = resourceDb(admin),
    lease = crypto.randomUUID();
  const scope = {
    p_scope: job.scope,
    p_owner: job.ownerId,
    p_kind: job.resourceKind,
    p_id: job.id,
    p_revision: job.revision,
    p_lease: lease,
  };
  const claimed = await db.rpc("career_claim_resource_source_v1", scope);
  databaseError(claimed.error);
  if (!claimed.data) return;
  const header = record(claimed.data);
  if (header.index_state === "ready") {
    if (job.scope === "public") {
      const { dispatchPublicSource } = await import("./discovery");
      const dispatched = await dispatchPublicSource(admin, job, lease);
      if (dispatched.complete === false) {
        const { publishSourceJob } = await import("./queue");
        await publishSourceJob({
          ...job,
          generation: new Date().toISOString(),
        });
      }
    } else if (job.resourceKind === "discovery_request") {
      const dispatched = await db.rpc("career_backfill_discovery_request_v1", {
        p_user: job.ownerId,
        p_id: job.id,
        p_revision: job.revision,
        p_lease: lease,
      });
      databaseError(dispatched.error);
    } else {
      const released = await db.rpc("career_finish_resource_source_v1", {
        ...scope,
        p_count: 0,
        p_complete: false,
      });
      databaseError(released.error);
    }
    return;
  }
  const source = await readIndexSource(admin, job);
  if (source === null) {
    let query = db
      .from("career_resource_index")
      .delete()
      .eq("scope", job.scope)
      .eq("resource_kind", job.resourceKind)
      .eq("resource_id", job.id)
      .eq("source_revision", job.revision);
    query = job.ownerId
      ? query.eq("owner_id", job.ownerId)
      : query.is("owner_id", null);
    const removed = await query;
    databaseError(removed.error);
    return;
  }
  const chunks = sourceChunks(source);
  let complete = true;
  for (const chunk of chunks) {
    if (Date.now() > deadlineAt - 60000) {
      complete = false;
      break;
    }
    let query = db
      .from("career_resource_index")
      .select("body,embedding_model,embedding")
      .eq("scope", job.scope)
      .eq("resource_kind", job.resourceKind)
      .eq("resource_id", job.id)
      .eq("source_revision", job.revision)
      .eq("chunk_key", chunk.key);
    query = job.ownerId
      ? query.eq("owner_id", job.ownerId)
      : query.is("owner_id", null);
    const existing = await query.maybeSingle();
    databaseError(existing.error);
    const row = record(existing.data);
    if (
      row.embedding &&
      row.embedding_model === EMBEDDING_MODEL &&
      fingerprint(row.body) === fingerprint(chunk.body)
    )
      continue;
    const [embedding] = await embedTitles([chunk.body]);
    const saved = await db.rpc("career_write_resource_chunk_v1", {
      ...scope,
      p_chunk: chunk.key,
      p_body: chunk.body,
      p_embedding: JSON.stringify(embedding),
      p_model: EMBEDDING_MODEL,
    });
    databaseError(saved.error);
    if (!saved.data) return;
  }
  const finished = await db.rpc("career_finish_resource_source_v1", {
    ...scope,
    p_count: chunks.length,
    p_complete: complete,
  });
  databaseError(finished.error);
  if (
    finished.data &&
    (!complete ||
      job.scope === "public" ||
      job.resourceKind === "discovery_request")
  ) {
    const { publishSourceJob } = await import("./queue");
    await publishSourceJob({ ...job, generation: new Date().toISOString() });
  }
}

export async function pendingSourceJobs(
  admin: TalentAdminClient,
  limit = 50
): Promise<SourceJob[]> {
  const result = await resourceDb(admin)
    .from("career_resource_index")
    .select(
      "scope,owner_id,resource_kind,resource_id,source_revision,updated_at,lease_until"
    )
    .eq("chunk_key", "@source")
    .or(
      "index_state.in.(pending,building),and(index_state.eq.ready,dispatch_state->>complete.is.null),and(index_state.eq.ready,dispatch_state->>complete.eq.false)"
    )
    .or(`lease_until.is.null,lease_until.lte.${new Date().toISOString()}`)
    .or("scope.eq.public,resource_kind.in.(document,discovery_request)")
    .order("updated_at")
    .limit(limit);
  databaseError(result.error);
  return rows(result.data).map((row) => ({
    kind: "source",
    scope: row.scope as "public" | "private",
    ownerId: text(row.owner_id) || null,
    resourceKind: String(row.resource_kind),
    id: String(row.resource_id),
    revision: String(row.source_revision),
    generation: String(row.updated_at),
  }));
}

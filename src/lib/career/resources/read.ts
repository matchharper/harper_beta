import { formatPromptText } from "@/lib/llm/promptText";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import {
  readCompanyObservations,
  companyObservationBody,
  formatCompanyEvidence,
} from "./companySources";
import { readProfileSnapshot } from "../profiles/store";
import { formatProfileToolResult } from "../profiles/tools";
import {
  databaseError,
  fingerprint,
  record,
  resourceDb,
  resourceRefSchema,
  rows,
  text,
  type ResourceContext,
  type ResourceItem,
  type ResourceRef,
} from "./types";

export async function resourceAvailable(
  context: ResourceContext,
  ref: ResourceRef
) {
  const { data, error } = await resourceDb(context.admin).rpc(
    "career_resource_available_v1",
    { p_user: context.userId, p_ref: ref }
  );
  databaseError(error);
  return data === true;
}
const unavailable = (ref: ResourceRef): ResourceItem => ({
  ref,
  title: "Unavailable source",
  body: "",
  facts: {},
  sourceRefs: [],
  status: "unavailable",
});
function versioned(item: ResourceItem, requested: ResourceRef): ResourceItem {
  return requested.revision && item.ref.revision !== requested.revision
    ? {
        ...item,
        ref: requested,
        body: "",
        facts: {},
        sourceRefs: [],
        status: "version_unavailable",
        latestRef: item.ref,
      }
    : item;
}
export function parseSourceRefs(value: unknown) {
  return (Array.isArray(value) ? value : []).flatMap((raw) => {
    const parsed = resourceRefSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}
export async function readResource(
  context: ResourceContext,
  input: ResourceRef,
  // Existing uncompleted operations retain the original full company input.
  companyEvidenceQuery: string | null = ""
): Promise<ResourceItem> {
  const ref = resourceRefSchema.parse(input),
    db = resourceDb(context.admin);
  if (!(await resourceAvailable(context, ref))) return unavailable(ref);
  const item: ResourceItem = {
    ref,
    title: "",
    body: "",
    facts: {},
    sourceRefs: [],
    status: "available",
  };
  if (ref.kind === "company") {
    const { data, error } = await db
      .from("company_db")
      .select(
        "id,name,description,short_description,specialities,location,website_url,linkedin_url,founded_year,employee_count_range,public_context,public_facts_revision"
      )
      .eq("id", ref.id)
      .single();
    databaseError(error);
    const row = record(data);
    const sources = await readCompanyObservations(context.admin, ref.id, companyEvidenceQuery ?? undefined);
    item.ref = { ...ref, revision: String(row.public_facts_revision) };
    item.title = text(row.name);
    item.body = [
      text(row.description),
      text(row.short_description),
      ...(companyEvidenceQuery === null
        ? [formatPromptText(row.public_context), ...sources.map(companyObservationBody)]
        : sources.map(formatCompanyEvidence)),
    ]
      .filter(Boolean)
      .join("\n\n");
    item.facts = Object.fromEntries(
      [
        "location",
        "website_url",
        "linkedin_url",
        "founded_year",
        "employee_count_range",
        "specialities",
      ].map((key) => [key, row[key]])
    );
    item.sourceRefs = sources.map((source) => ({
      kind: "observation",
      id: String(source.id),
    }));
    item.coverage = companyEvidenceQuery === null
      ? `Directory facts and all ${item.sourceRefs.length} currently available linked public sources. Historical observations remain readable through their exact references.`
      : companyEvidenceQuery
        ? `Directory facts and ${sources.length} linked public sources matching "${companyEvidenceQuery}" in the title or body. Other evidence may exist.`
        : `Directory facts and references to ${sources.length} linked public sources. Source bodies are available by observation ref or companyEvidenceQuery.`;
    const current = await db
      .from("company_db")
      .select("public_facts_revision")
      .eq("id", ref.id)
      .single();
    databaseError(current.error);
    if (String(current.data?.public_facts_revision) !== item.ref.revision)
      return {
        ...unavailable(ref),
        status: "version_unavailable",
        latestRef: {
          ...ref,
          revision: String(current.data?.public_facts_revision),
        },
      };
  } else if (ref.kind === "web_resource" || ref.kind === "observation") {
    let observationId = ref.id;
    let currentFacts: Record<string, unknown> = {};
    if (ref.kind === "web_resource") {
      const source = await db
        .from("documents")
        .select(
          "id,title,url,current_observation_id,last_successful_check_at,source_fetched_at"
        )
        .eq("id", ref.id)
        .eq("source_scope", "public")
        .single();
      databaseError(source.error);
      const row = record(source.data);
      observationId = ref.revision ?? text(row.current_observation_id);
      item.title = text(row.title);
      if (observationId === row.current_observation_id)
        currentFacts = {
          lastSuccessfulCheckAt: row.last_successful_check_at,
          sourceFetchedAt: row.source_fetched_at,
        };
    }
    const source = await db
      .from("career_public_observations")
      .select("*")
      .eq("id", observationId)
      .is("deleted_at", null)
      .maybeSingle();
    databaseError(source.error);
    if (!source.data) return unavailable(ref);
    const row = record(source.data);
    if (ref.kind === "web_resource" && record(row.resource_ref).id !== ref.id)
      return unavailable(ref);
    item.ref = {
      ...ref,
      revision:
        ref.kind === "web_resource" ? String(row.id) : text(row.content_hash),
    };
    item.title ||= text(row.source_url);
    item.body = text(row.content);
    item.facts = {
      url: row.source_url,
      observedAt: row.observed_at,
      publishedAt: row.published_at,
      sourceFetchedAt: row.source_fetched_at,
      ...currentFacts,
    };
    item.sourceRefs = [{ kind: "observation", id: String(row.id) }];
    item.coverage = text(record(row.provenance).coverage);
  } else if (ref.kind === "document") {
    const source = await db
      .from("talent_documents")
      .select(
        "id,file_name,description,revision,extracted_text,structured_content,updated_at"
      )
      .eq("id", ref.id)
      .eq("talent_id", context.userId)
      .eq("is_deleted", false)
      .single();
    databaseError(source.error);
    const row = record(source.data),
      content = record(row.structured_content);
    item.ref = { ...ref, revision: String(row.revision) };
    item.title = text(row.file_name);
    item.body =
      text(row.extracted_text) || text(content.markdown) || text(content.body);
    item.facts = { description: row.description, updatedAt: row.updated_at };
    item.sourceRefs = parseSourceRefs(content.source_refs);
    if (!item.body)
      item.coverage =
        "No extracted text; read_document supports the original document format.";
  } else if (ref.kind === "email_message") {
    const { readEmailMessage } = await import("../emailWriting/message");
    const message = await readEmailMessage(context, ref);
    item.ref = message.ref;
    item.title = message.subject ?? "Email";
    item.body = message.content ?? message.snippet ?? "";
    item.facts = {
      from: message.from,
      to: message.to,
      threadId: message.threadId,
      receivedAt: message.receivedAt,
    };
  } else if (ref.kind === "memory" || ref.kind === "message") {
    const isMemory = ref.kind === "memory";
    let query = db
      .from(isMemory ? "talent_contexts" : "talent_messages")
      .select(
        isMemory
          ? "id,label,content,revision,source_refs,updated_at"
          : "id,content,role,created_at"
      )
      .eq("id", ref.id)
      .eq(isMemory ? "talent_id" : "user_id", context.userId);
    if (isMemory) query = query.is("deleted_at", null);
    const source = await query.single();
    databaseError(source.error);
    const row = record(source.data);
    item.ref = {
      ...ref,
      revision: isMemory ? String(row.revision) : fingerprint(row),
    };
    item.title = text(row.label) || text(row.role);
    item.body = text(row.content);
    item.sourceRefs = parseSourceRefs(row.source_refs);
  } else if (ref.kind === "profile") {
    const profile = await readProfileSnapshot({
      ...context,
      profileId: ref.id,
      revision: ref.revision ? Number(ref.revision) : undefined,
    });
    item.ref = { ...ref, revision: String(profile.revision) };
    item.title = profile.title;
    item.body = formatProfileToolResult("read_profile", profile);
  } else if (ref.kind === "posting") {
    const source = await db
      .from("official_jobs")
      .select(
        "id,role_title,company_name,role_description_markdown,company_description_markdown,location,compensation,slug,updated_at"
      )
      .eq("id", ref.id)
      .eq("is_published", true)
      .single();
    databaseError(source.error);
    const row = record(source.data);
    item.ref = { ...ref, revision: fingerprint(row) };
    item.title = `${text(row.company_name)} · ${text(row.role_title)}`;
    item.body = [
      text(row.role_description_markdown),
      text(row.company_description_markdown),
    ].join("\n\n");
    item.facts = {
      location: row.location,
      compensation: row.compensation,
      url: `/jobs/${text(row.slug)}`,
    };
  } else if (ref.kind === "role") {
    // The owning reader resolves internal Roles through their canonical public RPC.
    const { runGetRoleContext } = await import("@/lib/talentOnboarding/tools");
    const result = await runGetRoleContext({
      ...context,
      roleIds: [ref.id],
      activityOffset: 0,
      jd: "full",
    });
    const row = record(result.roles[0]);
    if (row.found !== true) return unavailable(ref);
    item.ref = {
      ...ref,
      revision: fingerprint({ role: row.role, company: row.companyDb }),
    };
    item.title = text(record(row.role).name);
    item.body = result.modelOutput;
    item.facts = record(row.role);
  } else if (ref.kind === "opportunity") {
    const { readOpportunity } = await import("../opportunities/store");
    const row = await readOpportunity(context, ref.id);
    item.ref = { ...ref, revision: String(row.revision) };
    item.title = row.title;
    item.body = row.body;
    item.sourceRefs = [row.primary_ref, ...row.evidence_refs.filter(source =>
      source.kind !== row.primary_ref.kind || source.id !== row.primary_ref.id || source.revision !== row.primary_ref.revision
    )];
  } else if (ref.kind === "operation") {
    const { readOperation } = await import("../externalOperations/store");
    const operation = await readOperation(context, ref.id);
    if (!operation) return unavailable(ref);
    item.ref = { ...ref, revision: String(operation.revision) };
    item.title = operation.kind;
    item.body = [
      text(operation.result.modelOutput) || text(operation.result.summary),
      operation.kind.startsWith("resource_")
        ? formatPromptText(operation.result)
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    item.facts = {
      status: operation.status,
      ...(operation.kind.startsWith("resource_")
        ? {
            criteria:
              operation.request.criteria ??
              record(operation.request.inputSnapshot).criteria,
            inputFingerprint: operation.request.inputFingerprint,
            contextSnapshotRef: record(operation.request.inputSnapshot)
              .contextSnapshotRef,
          }
        : {}),
    };
    item.sourceRefs = parseSourceRefs(operation.request.sourceRefs);
    if (operation.kind === "resource_search" && operation.request.source === "web") {
      const ids = item.sourceRefs.filter(source => source.kind === "web_resource").map(source => source.id);
      if (ids.length) {
        const labels = await db.from("documents").select("id,title,url").eq("source_scope", "public").in("id", [...new Set(ids)]);
        if (labels.error) {
          item.coverage = "Public source labels could not be retrieved. The saved references are listed below.";
        } else {
          item.publicSourceLabels = Object.fromEntries((labels.data ?? []).map(row => [
            String(row.id), [row.title, row.url].filter(Boolean).join(" — "),
          ]));
        }
      }
    }
  }
  return versioned(item, ref);
}
export function formatResource(item: ResourceItem) {
  const ref = `${item.ref.kind}:${item.ref.id}${item.ref.revision ? ` revision ${item.ref.revision}` : ""}`;
  if (item.status !== "available")
    return `${ref}: ${item.status}${item.latestRef ? `; latest revision ${item.latestRef.revision}` : ""}`;
  const dates = [
    "observedAt",
    "publishedAt",
    "sourceFetchedAt",
    "lastSuccessfulCheckAt",
    "updatedAt",
  ];
  const facts = Object.entries(item.facts)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(
      ([key, value]) =>
        `${key}: ${dates.includes(key) ? formatLlmDateTime(String(value)) : typeof value === "object" ? formatPromptText(value) : String(value)}`
    );
  return [
    `${ref} — ${item.title}`,
    ...facts,
    item.body,
    item.coverage,
    item.sourceRefs.length
      ? `Evidence refs: ${item.sourceRefs.map((r) => {
          const label = r.kind === "web_resource" ? item.publicSourceLabels?.[r.id] : undefined;
          return `${r.kind}:${r.id}${r.revision ? ` revision ${r.revision}` : ""}${label ? ` — ${label}` : ""}`;
        }).join(item.publicSourceLabels ? "\n" : "; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

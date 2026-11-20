import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import { formatToolError, throwIfToolControlError } from "@/lib/llm/toolError";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { companyRpcMissing, readCompanyBundles } from "../resources/companyData";
import {
  databaseError,
  fingerprint,
  record,
  requestUuid,
  resourceDb,
  rows,
  text,
  type ResourceContext,
} from "../resources/types";
import {
  isEmployerTarget,
  publicCompanyTargetInput,
  publicCompanyTargetSchema,
} from "./publicTarget";

const stringInput = { type: "string" };
const publicSourceKinds = ["observation", "web_resource"] as const;
const publicSources = z
  .array(
    z
      .object({
        kind: z.enum(publicSourceKinds),
        id: z.string().min(1),
        revision: z.string().min(1).optional(),
      })
      .strict()
  )
  .min(1);
const dataRef = z
  .object({
    kind: z.literal("company_datum"),
    id: z.string().uuid(),
    revision: z.string().regex(/^[1-9]\d*$/),
  })
  .strict();
const entrySchema = z
  .object({
    target: publicCompanyTargetSchema,
    label: z.string().trim().min(1),
    content: z.string().min(1),
    sourceRefs: publicSources,
    dataRef: dataRef.optional(),
  })
  .strict();
type PublicCompanyEntry = z.infer<typeof entrySchema>;
const directoryFields = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    website_url: z.string().url().optional(),
    location: z.string().optional(),
  })
  .strict();
const directoryInput = z
  .object({
    companyId: z.string().optional(),
    expectedRevision: z.number().int().optional(),
    fields: directoryFields,
    sourceRefs: publicSources,
  })
  .strict();
const sourceRefsInput = {
  type: "array",
  minItems: 1,
  description:
    "Exact independently public observations for this company's facts. Preserve a web_resource revision when supplied. A web_resource without a revision selects its current public observation at write time.",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: publicSourceKinds },
      id: stringInput,
      revision: stringInput,
    },
    required: ["kind", "id"],
    additionalProperties: false,
  },
};
const entryProperties = {
  target: publicCompanyTargetInput,
  label: {
    type: "string",
    description:
      "Use summary for the shared company overview. Other topics may have several independent entries with the same label.",
  },
  content: {
    type: "string",
    description: "Markdown facts supported by this entry's public sources.",
  },
  sourceRefs: sourceRefsInput,
  dataRef: {
    type: "object",
    description:
      "To correct an existing entry, copy its exact id and revision from any result.",
    properties: {
      kind: { type: "string", enum: ["company_datum"] },
      id: stringInput,
      revision: stringInput,
    },
    required: ["kind", "id", "revision"],
    additionalProperties: false,
  },
};
export const publicCompanyWriteInput = {
  type: "object",
  properties: {
    ...entryProperties,
    entries: {
      type: "array",
      minItems: 1,
      description:
        "Several independent company data entries. Each has its own target and sources and receives its own receipt.",
      items: {
        type: "object",
        properties: entryProperties,
        required: ["target", "label", "content", "sourceRefs"],
        additionalProperties: false,
      },
    },
    fields: {
      type: "object",
      description:
        "Directory-only registration or correction. Use this branch with sourceRefs. New registration requires name and website_url.",
      properties: {
        name: stringInput,
        description: stringInput,
        website_url: stringInput,
        location: stringInput,
      },
      additionalProperties: false,
    },
    companyId: {
      type: "string",
      description: "Existing directory company for a fields correction.",
    },
    expectedRevision: {
      type: "integer",
      description:
        "Current directory revision for an existing company's fields correction.",
    },
  },
  additionalProperties: false,
};

export async function writePublicCompanyDatum(
  context: ResourceContext,
  entry: PublicCompanyEntry,
  requestId: string
) {
  const args = {
    p_target: entry.target,
    p_label: entry.label,
    p_content: entry.content,
    p_source_refs: entry.sourceRefs,
    p_data_ref: entry.dataRef ?? null,
    p_request_id: requestId,
  };
  const db = resourceDb(context.admin);
  const result = isEmployerTarget(entry.target)
    ? await db.rpc("career_write_employer_datum_v1", {
        ...args,
        p_user: context.userId,
      })
    : await db.rpc("career_write_company_datum_v1", args);
  databaseError(result.error);
  return record(result.data);
}

function formatRef(value: unknown) {
  const ref = record(value);
  return ref.kind && ref.id
    ? `${ref.kind}:${ref.id}${ref.revision ? ` revision ${ref.revision}` : ""}`
    : "";
}

function formatReceipt(receipt: Record<string, unknown>) {
  const current = record(receipt.current);
  const datum = receipt.status === "conflict" ? current : receipt;
  const candidates = rows(receipt.candidates);
  const sourceUrls = new Map(
    rows(datum.sources).map((source) => [
      formatRef(source.ref),
      text(source.url),
    ])
  );
  const sources = rows(datum.sourceRefs).map((source) => {
    const ref = formatRef(source);
    const url = sourceUrls.get(ref);
    return url ? `${ref} — ${url}` : ref;
  });
  return [
    `Public company write: ${receipt.status}.`,
    text(receipt.error) || text(receipt.reason),
    formatRef(receipt.companyRef),
    [formatRef(receipt.dataRef ?? datum.dataRef), text(datum.label)]
      .filter(Boolean)
      .join(" — "),
    datum.checkedAt
      ? `Evidence checked: ${formatLlmDateTime(datum.checkedAt)}.`
      : "",
    sources.length ? `Source observations: ${sources.join(", ")}` : "",
    receipt.status === "conflict" && current.content
      ? `Current content:\n${current.content}`
      : "",
    receipt.savedLabels ? `Labels saved for this company: ${receipt.savedLabels}` : "",
    ...candidates.map(
      (candidate) =>
        `Public candidate: ${[text(candidate.name), text(candidate.website), text(candidate.linkedinUrl), formatRef(candidate.companyRef)].filter(Boolean).join(" — ")}`
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

async function writeDirectory(context: ResourceContext, input: unknown) {
  const parsed = directoryInput.parse(input);
  if (parsed.companyId && parsed.expectedRevision === undefined)
    throw new Error("A directory correction requires its expectedRevision.");
  const db = resourceDb(context.admin);
  const args = {
    p_id: parsed.companyId ?? null,
    p_revision: parsed.expectedRevision ?? 0,
    p_fields: parsed.fields,
    p_source_refs: parsed.sourceRefs,
  };
  const writer = "career_write_company_directory_fields_v1";
  let result = await db.rpc(writer, args);
  let sourceRefs;
  if (companyRpcMissing(result.error, writer)) {
    // Older installations have the original writer and version-aware source
    // reader. Resolve precisely the observations the model saw there, too.
    const { readResource } = await import("../resources/read");
    sourceRefs = [];
    for (const ref of parsed.sourceRefs) {
      const item = await readResource(context, ref);
      if (item.status !== "available" || item.sourceRefs[0]?.kind !== "observation")
        throw new Error("Public source version unavailable");
      sourceRefs.push(item.sourceRefs[0]);
    }
    result = await db.rpc("career_upsert_public_company_v1", { ...args, p_source_refs: sourceRefs });
  }
  databaseError(result.error);
  const company: Record<string, unknown> = { ...record(result.data), ...(sourceRefs && { sourceRefs }) };
  const companyRef = {
    kind: "company",
    id: String(company.companyId),
    revision: String(company.revision),
  };
  return {
    company,
    companyRef,
    modelOutput: formatReceipt({
      status: "saved",
      companyRef,
      sourceRefs: company.sourceRefs,
    }),
  };
}

export async function upsertPublicCompany(
  input: Record<string, unknown>,
  context: ResourceContext,
  execution?: TalentToolExecutionContext
) {
  const { _uiStatusMessage, ...payload } = input;
  if ("fields" in payload) return writeDirectory(context, payload);
  const batch = "entries" in payload;
  const entries = batch
    ? z
        .object({ entries: z.array(z.unknown()).min(1) })
        .strict()
        .parse(payload).entries
    : [payload];
  const origin =
    execution?.resumeRequestId ??
    execution?.userMessageId ??
    execution?.voiceEventId ??
    execution?.toolCallId ??
    randomUUID();
  const results = [];
  for (const [index, raw] of entries.entries()) {
    execution?.abortSignal?.throwIfAborted();
    try {
      const entry = entrySchema.parse(raw);
      const targetKey =
        "kind" in entry.target
          ? [entry.target.kind, entry.target.id]
          : entry.target;
      const sourceKeys = [...new Set(entry.sourceRefs.map(fingerprint))].sort();
      const requestId = requestUuid(
        fingerprint([
          context.userId,
          execution?.conversationId,
          origin,
          "company_datum",
          targetKey,
          entry.label,
          entry.content,
          sourceKeys,
          entry.dataRef,
        ])
      );
      const receipt = await writePublicCompanyDatum(context, entry, requestId);
      results.push({
        index,
        ...receipt,
        ok: receipt.status === "saved" || receipt.status === "unchanged",
      });
    } catch (error) {
      throwIfToolControlError(error);
      results.push({
        index,
        ok: false,
        status: "failed",
        error: formatToolError(error instanceof Error ? error.message : error),
      });
    }
  }
  // Show each company's current label set so later entries can reuse a topic name.
  const homes = [...new Set(results.flatMap((result) => {
    const ref = record(record(result).companyRef);
    return ref.kind === "company_workspace" && result.ok ? [String(ref.id)] : [];
  }))];
  const labelsByHome = new Map((await readCompanyBundles(context.admin, homes, null).catch(() => []))
    .map((bundle) => [bundle.companyRef.id, bundle.labels.map((label) => `${label.label} (${label.count})`).join(", ")]));
  for (const result of results) {
    const labels = labelsByHome.get(String(record(record(result).companyRef).id));
    if (labels) Object.assign(result, { savedLabels: labels });
  }
  if (!batch) return { ...results[0], modelOutput: formatReceipt(results[0]) };
  return {
    ok: results.every((result) => result.ok),
    results,
    modelOutput: results
      .map((r) => `Entry ${r.index + 1}\n${formatReceipt(r)}`)
      .join("\n\n"),
  };
}

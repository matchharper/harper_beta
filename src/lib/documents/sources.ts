import Ajv from "ajv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import { GENERATE_RESUME_PARAMETERS, type StructuredResume } from "@/lib/resumes/schema";

export const DOCUMENT_SOURCE_FIELDS = ["target_role", "source_document_ids", "source_refs"] as const;
export type DocumentSources = Partial<Pick<StructuredResume, typeof DOCUMENT_SOURCE_FIELDS[number]>>;
const validate = new Ajv().compile({ type: "object", properties: Object.fromEntries(
  DOCUMENT_SOURCE_FIELDS.map(key => [key, GENERATE_RESUME_PARAMETERS.properties[key]])
), additionalProperties: false });

export function documentSources(input: Record<string, unknown>, previous?: DocumentSources | null): DocumentSources {
  const sources = { ...previous } as Record<string, unknown>;
  for (const key of DOCUMENT_SOURCE_FIELDS) {
    if (input[key] === null) delete sources[key];
    else if (input[key] !== undefined) sources[key] = input[key];
  }
  if (!validate(sources)) throw new Error(`Invalid document source at ${validate.errors?.[0]?.instancePath}: ${validate.errors?.[0]?.message}`);
  return sources as DocumentSources;
}

export async function verifyDocumentSources(args: { admin: TalentAdminClient; userId: string }, sources: DocumentSources) {
  const db = args.admin as unknown as SupabaseClient;
  for (const documentId of sources.source_document_ids ?? []) {
    if (
      !(await fetchTalentDocument({
        admin: args.admin,
        userId: args.userId,
        documentId,
      }))
    )
      throw new Error(`Reference document not found (${documentId}). No document was saved by this attempt. Read the current document list and use an owned, non-deleted source document; do not invent a replacement identifier.`);
  }
  // References contain identifiers only, and must belong to this authenticated user.
  for (const ref of sources.source_refs ?? []) {
    let table: string,
      owner = "talent_id",
      refId = ref.id;
    if (ref.kind === "document") table = "talent_documents";
    else if (ref.kind === "memory") table = "talent_contexts";
    else if (ref.kind === "message") {
      table = "talent_messages";
      owner = "user_id";
    } else {
      const [kind, id] = ref.id.split(":");
      const tables: Record<string, string> = {
        experience: "talent_experiences",
        education: "talent_educations",
        extra: "talent_extras",
        user: "talent_users",
      };
      table = tables[kind];
      refId = id;
      if (!table || !refId)
        throw new Error(
          "Profile reference must use experience:id, education:id, extra:id or user:id."
        );
      if (kind === "user") owner = "user_id";
    }
    const { data, error } = await db
      .from(table)
      .select(owner)
      .eq(
        table === "talent_users"
          ? "user_id"
          : ref.kind === "memory"
            ? "ref"
            : "id",
        refId
      )
      .eq(owner, args.userId)
      .maybeSingle();
    if (error)
      throw new Error(`Document source verification failed (${ref.kind}: ${ref.id}). No document was saved by this attempt. The source's availability could not be checked; this is not evidence that it is missing. Read the source again before retrying.`, { cause: error });
    if (!data)
      throw new Error(`Document source reference is unavailable (${ref.kind}: ${ref.id}). No document was saved by this attempt. Re-read the current source and use its returned identifier. Optional source_refs may be omitted when there is no verified identifier; keep the document grounded in the user's verified facts.`);
  }
}

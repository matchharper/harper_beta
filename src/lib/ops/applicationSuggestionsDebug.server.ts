import { randomUUID } from "node:crypto";
import { InternalApiError } from "@/lib/internalApi";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import { resolveCareerTextChatModel } from "@/lib/career/textChatModelConfig";
import { buildApplicationSuggestionInput } from "@/lib/career/simulation/suggestionInput";
import {
  buildApplicationSuggestionsRequest,
  writeApplicationSuggestions,
} from "@/lib/career/simulation/suggestionWriter";
import { withLlmProviderTrace, type LlmProviderExchange } from "@/lib/llm/providerTrace";
import { getTalentSupabaseAdmin, type TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchTalentDocument, fetchTalentDocuments } from "@/lib/talentOnboarding/documentStore";
import { fetchTalentStructuredProfile, fetchTalentUserProfile } from "@/lib/talentOnboarding/profileStore";
import { fetchTalentContextPromptSnapshot } from "@/lib/talentOnboarding/talentContexts";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { runGetRoleContext } from "@/lib/talentOnboarding/tools";
import type {
  ApplicationSuggestionsCandidate,
  ApplicationSuggestionsDebugInput,
  ApplicationSuggestionsDebugPreview,
  ApplicationSuggestionsDebugRun,
  ApplicationSuggestionsDocument,
  ApplicationSuggestionsLookup,
} from "./applicationSuggestionsDebug";

type DebugOptions = { admin?: TalentAdminClient; signal?: AbortSignal };
const productionDependencies = {
  fetchTalentDocument,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  fetchTalentContextPromptSnapshot,
  runGetRoleContext,
  buildApplicationSuggestionsRequest,
  writeApplicationSuggestions,
};

function documentSummary(document: TalentDocumentRow): ApplicationSuggestionsDocument {
  return {
    id: document.id,
    fileName: document.file_name,
    kind: document.kind,
    updatedAt: document.updated_at,
    isPrimary: document.is_primary,
    textAvailable: Boolean(document.extracted_text?.trim()),
  };
}

export async function lookupApplicationSuggestionsCandidate(
  email: string,
  options: DebugOptions = {},
): Promise<ApplicationSuggestionsLookup> {
  const admin = options.admin ?? getTalentSupabaseAdmin();
  options.signal?.throwIfAborted();
  // ilike is case insensitive; escape its pattern syntax to preserve exact lookup.
  const pattern = email.trim().replace(/[\\%_]/g, "\\$&");
  const { data, error } = await admin.from("talent_users")
    .select("user_id,name,email")
    .ilike("email", pattern)
    .is("deleted_at", null)
    .limit(2);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new InternalApiError(404, "해당 이메일의 사용자를 찾지 못했습니다.");
  if (data.length > 1) throw new InternalApiError(409, "같은 이메일의 사용자가 여러 명입니다.");
  const candidate: ApplicationSuggestionsCandidate = {
    id: data[0].user_id, name: data[0].name, email: data[0].email,
  };
  const documents = await fetchTalentDocuments({ admin, userId: candidate.id, kind: "resume" });
  options.signal?.throwIfAborted();
  return { candidate, documents: documents.map(documentSummary) };
}

export async function previewApplicationSuggestionsDebug(
  input: ApplicationSuggestionsDebugInput,
  options: DebugOptions = {},
  dependencies = productionDependencies,
): Promise<ApplicationSuggestionsDebugPreview> {
  const admin = options.admin ?? getTalentSupabaseAdmin();
  options.signal?.throwIfAborted();
  const { data: candidateRow, error } = await admin.from("talent_users")
    .select("user_id,name,email")
    .eq("user_id", input.talentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!candidateRow) throw new InternalApiError(404, "사용자를 찾지 못했습니다.");
  const [document, lookup] = await Promise.all([
    dependencies.fetchTalentDocument({ admin, userId: input.talentId, documentId: input.documentId }),
    dependencies.runGetRoleContext({ admin, userId: input.talentId, roleIds: [input.roleId], includeJd: true, activityOffset: 0, externalFactsOnly: true }),
  ]);
  if (!document || document.kind !== "resume")
    throw new InternalApiError(404, "선택한 사용자의 이력서를 찾지 못했습니다.");
  const resume = document.extracted_text?.trim();
  if (!resume) throw new InternalApiError(400, "선택한 이력서에 읽을 수 있는 본문이 없습니다.");
  const item = lookup.roles[0];
  if (!item?.found || !item.role || item.role.sourceType !== "external")
    throw new InternalApiError(404, "외부 공고를 찾지 못했습니다.");
  const role = item.role;
  const roleName = [item.companyDb?.name, role.name].filter(Boolean).join(" · ");
  const [profile, contact, context] = await Promise.all([
    dependencies.fetchTalentStructuredProfile({ admin, userId: input.talentId }),
    dependencies.fetchTalentUserProfile({ admin, userId: input.talentId }),
    dependencies.fetchTalentContextPromptSnapshot({ admin, userId: input.talentId, query: roleName, memoryTokenBudget: 4000 }),
  ]);
  const projected = await buildApplicationSuggestionInput({
    profile, contact, context, resume, roleName,
    savedRole: {
      name: role.name,
      description: role.description,
      location: role.locationText,
      workMode: role.workMode,
      seniority: role.seniorityLevel,
      compensation: role.salaryRange,
      company: item.companyDb,
      externalJdUrl: role.externalJdUrl,
    },
    language: getCareerPromptLanguageName(input.locale ?? "ko"),
  });
  const model = resolveCareerTextChatModel(input.model ?? CLAUDE_HAIKU_MODEL).model;
  const request = await dependencies.buildApplicationSuggestionsRequest({ ...projected, model });
  options.signal?.throwIfAborted();
  return {
    kind: "preview",
    preparedAt: new Date().toISOString(),
    model,
    sourceMode: "stored_sources_only",
    subject: {
      candidate: { id: candidateRow.user_id, name: candidateRow.name, email: candidateRow.email },
      document: documentSummary(document),
      role: { id: input.roleId, name: role.name ?? "", company: item.companyDb?.name ?? "" },
    },
    input: projected,
    prompt: { ...request, messages: request.messages, tools: request.tools ?? [] },
  };
}

/** Trusted server/runner entry point; the API only accepts database identifiers. */
export async function executePreparedApplicationSuggestionsDebug(
  preview: ApplicationSuggestionsDebugPreview,
  options: DebugOptions = {},
  dependencies = productionDependencies,
): Promise<ApplicationSuggestionsDebugRun> {
  const admin = options.admin ?? getTalentSupabaseAdmin();
  const started = Date.now();
  const trace: LlmProviderExchange[] = [];
  // A frozen source snapshot can be reused with the current prompt implementation.
  const request = await dependencies.buildApplicationSuggestionsRequest({ ...preview.input, model: preview.model });
  const result: ApplicationSuggestionsDebugRun = {
    ...preview,
    kind: "run",
    prompt: { ...request, messages: request.messages, tools: request.tools ?? [] },
    runId: randomUUID(),
    startedAt: new Date(started).toISOString(),
    finishedAt: "",
    durationMs: 0,
    suggestions: [],
    trace,
    error: null,
  };
  try {
    options.signal?.throwIfAborted();
    result.suggestions = await withLlmProviderTrace(
      (exchange) => trace.push(exchange),
      () => dependencies.writeApplicationSuggestions({
        ...preview.input,
        model: preview.model,
        admin,
        userId: preview.subject.candidate.id,
        signal: options.signal,
      }),
    );
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  result.finishedAt = new Date().toISOString();
  result.durationMs = Date.now() - started;
  return result;
}

export async function runApplicationSuggestionsDebug(
  input: ApplicationSuggestionsDebugInput,
  options: DebugOptions = {},
  dependencies = productionDependencies,
): Promise<ApplicationSuggestionsDebugRun> {
  const shared = { ...options, admin: options.admin ?? getTalentSupabaseAdmin() };
  const preview = await previewApplicationSuggestionsDebug(input, shared, dependencies);
  return executePreparedApplicationSuggestionsDebug(preview, shared, dependencies);
}

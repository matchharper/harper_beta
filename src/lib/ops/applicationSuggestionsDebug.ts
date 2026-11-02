import type { CareerTextChatModelId } from "@/lib/career/textChatModelConfig";
import type { ApplicationSuggestionInput } from "@/lib/career/simulation/suggestionInput";
import type { ApplicationSuggestion } from "@/lib/career/simulation/suggestionSchema";

export type ApplicationSuggestionsDebugInput = {
  talentId: string;
  documentId: string;
  roleId: string;
  model?: CareerTextChatModelId;
  locale?: string;
};

export type ApplicationSuggestionsCandidate = { id: string; name: string | null; email: string | null };
export type ApplicationSuggestionsDocument = {
  id: string;
  fileName: string;
  kind: string;
  updatedAt: string;
  isPrimary: boolean;
  textAvailable: boolean;
};
export type ApplicationSuggestionsLookup = {
  candidate: ApplicationSuggestionsCandidate;
  documents: ApplicationSuggestionsDocument[];
};
export type ApplicationSuggestionsDebugPreview = {
  kind: "preview";
  preparedAt: string;
  model: CareerTextChatModelId;
  sourceMode: "stored_sources_only";
  subject: {
    candidate: ApplicationSuggestionsCandidate;
    document: ApplicationSuggestionsDocument;
    role: { id: string; name: string; company: string };
  };
  input: ApplicationSuggestionInput;
  prompt: { messages: unknown[]; tools: unknown[] };
};
export type ApplicationSuggestionsDebugRun = Omit<ApplicationSuggestionsDebugPreview, "kind"> & {
  kind: "run";
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  suggestions: ApplicationSuggestion[];
  trace: unknown[];
  error: string | null;
};

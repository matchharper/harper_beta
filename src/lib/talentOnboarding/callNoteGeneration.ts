import type { TalentAdminClient } from "./admin";
import {
  fetchTalentCallNoteDocument,
  isCallNoteId,
  normalizeCallNoteTranscript,
  parseTalentCallNote,
  saveTalentCallNote,
  toTalentCallNoteDocument,
  type CallNoteTranscriptInputEntry,
  type TalentCallNoteDocument,
  updateTalentCallNote,
} from "./callNote";
import {
  analyzeTalentCallNote,
  shouldAnalyzeTalentCallNote,
} from "./callNoteAnalysis";

type CallNoteGenerationDependencies = {
  analyze: typeof analyzeTalentCallNote;
  save: (
    args: Parameters<typeof saveTalentCallNote>[0]
  ) => Promise<TalentCallNoteDocument | null>;
};

export type TalentCallNoteGenerationResult =
  | { document: TalentCallNoteDocument; status: "created" }
  | { reason: "ineligible" | "not_meaningful"; status: "skipped" }
  | { error: unknown; status: "failed" };

type CallNoteUpdateDependencies = {
  analyze: typeof analyzeTalentCallNote;
  fetch: typeof fetchTalentCallNoteDocument;
  update: typeof updateTalentCallNote;
};

export type TalentCallNoteUpdateResult =
  | {
      document: TalentCallNoteDocument;
      status: "updated";
      summaryUpdated: boolean;
      warning?: unknown;
    }
  | { reason: "ineligible"; status: "skipped" }
  | { error: unknown; status: "failed" };

export async function generateTalentCallNoteForWrapup(
  args: {
    admin: TalentAdminClient;
    callId?: string | null;
    conversationId: string;
    durationSeconds: number;
    endedAt?: string | null;
    onboardingCompletedAtStart?: boolean | null;
    preferredLocale?: string | null;
    startedAt?: string | null;
    transcript: CallNoteTranscriptInputEntry[];
    userId: string;
  },
  dependencies: CallNoteGenerationDependencies = {
    analyze: analyzeTalentCallNote,
    save: saveTalentCallNote,
  }
): Promise<TalentCallNoteGenerationResult> {
  if (
    !shouldAnalyzeTalentCallNote({
      callId: args.callId,
      onboardingCompletedAtStart: args.onboardingCompletedAtStart,
      transcript: args.transcript,
    })
  ) {
    return { reason: "ineligible", status: "skipped" };
  }

  try {
    const analysis = await dependencies.analyze({
      preferredLocale: args.preferredLocale,
      transcript: args.transcript,
    });
    if (!analysis?.shouldCreate) {
      return { reason: "not_meaningful", status: "skipped" };
    }

    const document = await dependencies.save({
      admin: args.admin,
      callId: args.callId,
      conversationId: args.conversationId,
      durationSeconds: args.durationSeconds,
      endedAt: args.endedAt,
      keyPoints: analysis.keyPoints,
      startedAt: args.startedAt,
      title: analysis.title,
      transcript: args.transcript,
      userId: args.userId,
    });
    if (!document) {
      return {
        error: new Error("Call note could not be built from the analyzed call"),
        status: "failed",
      };
    }

    return { document, status: "created" };
  } catch (error) {
    return { error, status: "failed" };
  }
}

export async function updateTalentCallNoteForWrapup(
  args: {
    admin: TalentAdminClient;
    callId?: string | null;
    conversationId: string;
    documentId?: string | null;
    durationSeconds: number;
    endedAt?: string | null;
    preferredLocale?: string | null;
    startedAt?: string | null;
    transcript: CallNoteTranscriptInputEntry[];
    userId: string;
  },
  dependencies: CallNoteUpdateDependencies = {
    analyze: analyzeTalentCallNote,
    fetch: fetchTalentCallNoteDocument,
    update: updateTalentCallNote,
  }
): Promise<TalentCallNoteUpdateResult> {
  const callId = args.callId?.trim() ?? "";
  const documentId = args.documentId?.trim() ?? "";
  if (
    !isCallNoteId(callId) ||
    !isCallNoteId(documentId) ||
    !normalizeCallNoteTranscript(args.transcript).some(
      (entry) => entry.role === "user"
    )
  ) {
    return { reason: "ineligible", status: "skipped" };
  }

  try {
    const storedDocument = await dependencies.fetch({
      admin: args.admin,
      documentId,
      userId: args.userId,
    });
    if (!storedDocument) throw new Error("Call note not found");
    const previousCallNote = parseTalentCallNote(storedDocument.extracted_text);
    if (!previousCallNote) throw new Error("Call note data is invalid");
    if (
      previousCallNote.schema_version === 3 &&
      previousCallNote.sessions.some((session) => session.call_id === callId)
    ) {
      return {
        document: toTalentCallNoteDocument(storedDocument),
        status: "updated",
        summaryUpdated: false,
      };
    }

    let analysis: Awaited<ReturnType<typeof analyzeTalentCallNote>> = null;
    let analysisError: unknown;
    try {
      analysis = await dependencies.analyze({
        preferredLocale: args.preferredLocale,
        previousCallNote,
        transcript: args.transcript,
      });
    } catch (error) {
      analysisError = error;
    }
    const summaryUpdated = Boolean(analysis?.shouldCreate);
    const previousTitle =
      previousCallNote.schema_version === 1
        ? storedDocument.file_name.trim() || "Harper call note"
        : previousCallNote.title;
    const previousKeyPoints =
      previousCallNote.schema_version === 1
        ? []
        : previousCallNote.key_points;

    const document = await dependencies.update({
      admin: args.admin,
      callId,
      conversationId: args.conversationId,
      documentId,
      durationSeconds: args.durationSeconds,
      endedAt: args.endedAt,
      keyPoints: summaryUpdated ? analysis!.keyPoints : previousKeyPoints,
      startedAt: args.startedAt,
      title: summaryUpdated ? analysis!.title : previousTitle,
      transcript: args.transcript,
      userId: args.userId,
    });
    if (!document) {
      throw new Error("Call note continuation could not be built");
    }

    return {
      document,
      status: "updated",
      summaryUpdated,
      ...(analysisError ? { warning: analysisError } : {}),
    };
  } catch (error) {
    return { error, status: "failed" };
  }
}

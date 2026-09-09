import type { TalentAdminClient } from "./admin";
import {
  saveTalentCallNote,
  type CallNoteTranscriptInputEntry,
} from "./callNote";
import {
  analyzeTalentCallNote,
  shouldAnalyzeTalentCallNote,
} from "./callNoteAnalysis";

type CallNoteGenerationDependencies = {
  analyze: typeof analyzeTalentCallNote;
  save: (
    args: Parameters<typeof saveTalentCallNote>[0]
  ) => Promise<unknown | null>;
};

export type TalentCallNoteGenerationResult =
  | { status: "created" }
  | { reason: "ineligible" | "not_meaningful"; status: "skipped" }
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

    return { status: "created" };
  } catch (error) {
    return { error, status: "failed" };
  }
}

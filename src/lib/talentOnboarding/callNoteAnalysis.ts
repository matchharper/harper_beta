import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import {
  isCallNoteId,
  normalizeCallNoteTranscript,
  type CallNoteTranscriptInputEntry,
  type TalentCallNoteEntry,
} from "./callNote";

const MAX_CALL_NOTE_TITLE_LENGTH = 120;
const MAX_CALL_NOTE_KEY_POINT_LENGTH = 600;
const MAX_CALL_NOTE_TRANSCRIPT_LENGTH = 30_000;
const MAX_CALL_NOTE_ENTRY_LENGTH = 2_000;

export type TalentCallNoteAnalysis = {
  keyPoints: string[];
  shouldCreate: boolean;
  title: string;
};

function normalizeSingleLine(value: unknown, maxLength: number) {
  return stripPostgresUnsafeChars(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function parseTalentCallNoteAnalysis(
  value: unknown
): TalentCallNoteAnalysis | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    const cleaned = value
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.should_create !== "boolean") return null;

  const title = normalizeSingleLine(record.title, MAX_CALL_NOTE_TITLE_LENGTH);
  const keyPoints = Array.isArray(record.key_points)
    ? record.key_points
      .map((point) =>
        normalizeSingleLine(point, MAX_CALL_NOTE_KEY_POINT_LENGTH)
      )
      .filter(Boolean)
      .slice(0, 3)
    : [];

  if (!record.should_create) {
    return { keyPoints: [], shouldCreate: false, title: "" };
  }
  if (!title || keyPoints.length === 0) return null;

  return { keyPoints, shouldCreate: true, title };
}

export function shouldAnalyzeTalentCallNote(args: {
  callId?: string | null;
  onboardingCompletedAtStart?: boolean | null;
  transcript: unknown;
}) {
  if (args.onboardingCompletedAtStart !== true || !isCallNoteId(args.callId)) {
    return false;
  }

  return normalizeCallNoteTranscript(args.transcript).some(
    (entry) => entry.role === "user"
  );
}

function formatTranscriptForAnalysis(transcript: TalentCallNoteEntry[]) {
  let remaining = MAX_CALL_NOTE_TRANSCRIPT_LENGTH;
  const lines: string[] = [];

  for (const entry of transcript) {
    if (remaining <= 0) break;
    const speaker = entry.role === "harper" ? "Harper" : "User";
    const text = entry.text.replace(/\s+/g, " ").trim();
    const line = `${speaker}: ${text.slice(0, MAX_CALL_NOTE_ENTRY_LENGTH)}`;
    const boundedLine = line.slice(0, remaining);
    if (boundedLine) lines.push(boundedLine);
    remaining -= boundedLine.length + 1;
  }

  return lines.join("\n");
}

export async function analyzeTalentCallNote(args: {
  preferredLocale?: string | null;
  transcript: CallNoteTranscriptInputEntry[];
}) {
  const normalizedTranscript = normalizeCallNoteTranscript(args.transcript);
  if (!normalizedTranscript.some((entry) => entry.role === "user")) {
    return { keyPoints: [], shouldCreate: false, title: "" };
  }

  const { runCareerCallNoteAnalysis } = await import("@/lib/career/llm");
  const rawAnalysis = await runCareerCallNoteAnalysis({
    systemPrompt: [
      "You decide whether a completed Harper voice call deserves a durable call note.",
      "Use only the transcript as evidence. User lines are the source of truth; Harper lines are context.",
      "Set should_create=false when the user contributed no meaningful information, the call is only greetings or acknowledgements, the audio failed, or the conversation is too thin to be useful later.",
      "Set should_create=true when the call contains useful career context, preferences, decisions, questions, mock interviews, commitments, or next steps worth reviewing later.",
      "For a saved note, write a specific topic title and 2-3 concise key points. Do not invent facts or repeat the same point.",
      "Match the predominant language of the transcript. The preferred locale is only a fallback hint.",
      "When should_create=false, return an empty title and an empty key_points array.",
    ].join("\n"),
    userPrompt: [
      `Preferred locale: ${args.preferredLocale?.trim() || "unknown"}`,
      "",
      "Transcript:",
      formatTranscriptForAnalysis(normalizedTranscript),
    ].join("\n"),
  });

  return parseTalentCallNoteAnalysis(rawAnalysis);
}

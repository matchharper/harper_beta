import fs from "fs/promises";
import path from "path";

export const CAREER_UPDATE_NOTE_TAGS = [
  "NEW",
  "IMPROVED",
  "FIXED",
  "NOTIFICATION",
] as const;

export type CareerUpdateNoteTag = (typeof CAREER_UPDATE_NOTE_TAGS)[number];

export type CareerUpdateNote = {
  date: string;
  en: string;
  ko: string;
  tag: CareerUpdateNoteTag;
};

const CAREER_UPDATE_NOTE_TAG_SET = new Set<string>(CAREER_UPDATE_NOTE_TAGS);

function isCareerUpdateNote(value: unknown): value is CareerUpdateNote {
  if (!value || typeof value !== "object") return false;

  const note = value as Record<string, unknown>;
  const keys = Object.keys(note).sort();
  return (
    keys.join(",") === "date,en,ko,tag" &&
    typeof note.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(note.date) &&
    typeof note.en === "string" &&
    note.en.trim().length > 0 &&
    typeof note.ko === "string" &&
    note.ko.trim().length > 0 &&
    typeof note.tag === "string" &&
    CAREER_UPDATE_NOTE_TAG_SET.has(note.tag)
  );
}

export async function loadCareerUpdateNotes() {
  const filePath = path.join(
    process.cwd(),
    "public/docs/career-updates/index.json"
  );
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;

  if (!Array.isArray(parsed) || !parsed.every(isCareerUpdateNote)) {
    throw new Error(
      "Career update notes must be non-empty { date, ko, en, tag } rows with ISO dates and an uppercase NEW, IMPROVED, FIXED, or NOTIFICATION tag."
    );
  }

  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index - 1].date < parsed[index].date) {
      throw new Error("Career update notes must be ordered newest first.");
    }
  }

  return parsed;
}

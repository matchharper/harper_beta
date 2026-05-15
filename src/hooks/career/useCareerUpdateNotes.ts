import { useCallback, useEffect, useState } from "react";
import {
  CAREER_UPDATE_NOTES_STORAGE_KEY,
  latestCareerUpdateNote,
} from "@/content/careerUpdateNotes";

export function useUnreadCareerUpdateNote() {
  const latestUpdateNoteId = latestCareerUpdateNote?.id ?? "";
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !latestUpdateNoteId) return;

    try {
      setHasUnread(
        window.localStorage.getItem(CAREER_UPDATE_NOTES_STORAGE_KEY) !==
          latestUpdateNoteId
      );
    } catch {
      setHasUnread(false);
    }
  }, [latestUpdateNoteId]);

  const markSeen = useCallback(() => {
    if (typeof window === "undefined" || !latestUpdateNoteId) return;

    try {
      window.localStorage.setItem(
        CAREER_UPDATE_NOTES_STORAGE_KEY,
        latestUpdateNoteId
      );
      setHasUnread(false);
    } catch {
      setHasUnread(false);
    }
  }, [latestUpdateNoteId]);

  return { hasUnread, markSeen };
}

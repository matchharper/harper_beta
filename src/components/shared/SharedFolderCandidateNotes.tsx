import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  useCreateSharedFolderNote,
  useDeleteSharedFolderNote,
  useUpdateSharedFolderNote,
} from "@/hooks/useSharedBookmarkFolder";
import {
  formatSharedFolderNoteDate,
  SharedFolderCandidateNote,
  SharedFolderViewerIdentity,
} from "@/lib/sharedFolder";
import { showToast } from "../toast/toast";

type SharedFolderCandidateNotesProps = {
  token: string;
  candidId: string;
  initialNotes?: SharedFolderCandidateNote[];
  viewer: SharedFolderViewerIdentity | null;
  compact?: boolean;
  showTitle?: boolean;
  variant?: "sidecar" | "table";
  showCreateButton?: boolean;
  hideWhenEmpty?: boolean;
  createRequestKey?: number;
  onNotesChange?: (notes: SharedFolderCandidateNote[]) => void;
};

export default function SharedFolderCandidateNotes({
  token,
  candidId,
  initialNotes = [],
  viewer,
  compact = false,
  showTitle = true,
  variant = "sidecar",
  showCreateButton = true,
  hideWhenEmpty = false,
  createRequestKey = 0,
  onNotesChange,
}: SharedFolderCandidateNotesProps) {
  const [notes, setNotes] = useState<SharedFolderCandidateNote[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const { mutateAsync: createNote, isPending: isCreating } =
    useCreateSharedFolderNote();
  const { mutateAsync: updateNote, isPending: isUpdating } =
    useUpdateSharedFolderNote();
  const { mutateAsync: deleteNote, isPending: isDeleting } =
    useDeleteSharedFolderNote();

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  useEffect(() => {
    onNotesChange?.(notes);
  }, [notes, onNotesChange]);

  const canCompose = Boolean(viewer);
  const isSaving = isCreating || isUpdating || isDeleting;
  const sortedNotes = useMemo(() => {
    return [...notes].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }, [notes]);
  const showHeaderRow = showTitle || canCompose;
  const containerClassName = useMemo(() => {
    if (variant === "table") {
      return [
        "flex h-full flex-col border-l border-white/10 bg-black/15",
        compact ? "px-4 py-3" : "min-h-[200px] px-4 py-4",
      ].join(" ");
    }

    return [
      "flex h-full flex-col rounded-sm bg-black/20",
      compact ? "min-h-[160px] p-3" : "min-h-[220px] p-3",
    ].join(" ");
  }, [compact, variant]);
  const noteCardClassName = "py-1 border-b border-white/5";

  const resetEditor = () => {
    setDraft("");
    setEditingNoteId(null);
    setIsComposing(false);
  };

  const openCreate = () => {
    if (!canCompose) return;
    setEditingNoteId(null);
    setDraft("");
    setIsComposing(true);
  };

  useEffect(() => {
    if (!createRequestKey || !canCompose) return;
    setEditingNoteId(null);
    setDraft("");
    setIsComposing(true);
  }, [canCompose, createRequestKey]);

  const openEdit = (note: SharedFolderCandidateNote) => {
    if (!canCompose) return;
    setEditingNoteId(note.id);
    setDraft(note.memo);
    setIsComposing(true);
  };

  const handleSave = async () => {
    const memo = draft.trim();
    if (!viewer) return;
    if (!memo) {
      showToast({ message: "메모 내용을 입력해주세요.", variant: "white" });
      return;
    }

    try {
      if (editingNoteId != null) {
        const saved = await updateNote({
          token,
          noteId: editingNoteId,
          memo,
          viewerKey: viewer.viewerKey,
          viewerName: viewer.viewerName,
        });

        if (saved) {
          setNotes((current) =>
            current.map((note) => (note.id === saved.id ? saved : note))
          );
        }
      } else {
        const created = await createNote({
          token,
          candidId,
          memo,
          viewerKey: viewer.viewerKey,
          viewerName: viewer.viewerName,
        });

        if (created) {
          setNotes((current) => [...current, created]);
        }
      }

      resetEditor();
    } catch (error) {
      console.error("shared folder note save error:", error);
      showToast({
        message: "메모 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleDelete = async (noteId: number) => {
    if (!viewer) return;

    try {
      await deleteNote({
        token,
        noteId,
        viewerKey: viewer.viewerKey,
      });
      setNotes((current) => current.filter((note) => note.id !== noteId));
    } catch (error) {
      console.error("shared folder note delete error:", error);
      showToast({
        message: "메모 삭제에 실패했습니다.",
        variant: "white",
      });
    }
  };

  if (hideWhenEmpty && sortedNotes.length === 0 && !isComposing) {
    return null;
  }

  return (
    <div
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className={containerClassName}
    >
      <div className="space-y-2">
        {sortedNotes.map((note) => (
          <div key={note.id} className={noteCardClassName}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-row items-center justify-between w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full items-center text-xs text-hgray900">
                    <span className="truncate">{note.viewerName}</span>
                  </span>
                </div>
                <div className="text-[11px] text-hgray600">
                  {formatSharedFolderNoteDate(note.updatedAt || note.createdAt)}
                </div>
              </div>
              {note.canEdit ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(note)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-hgray700 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(note.id)}
                    disabled={isDeleting}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-hgray700 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-hgray900">
              {note.memo}
            </div>
          </div>
        ))}
      </div>

      {showCreateButton && showHeaderRow && !isComposing && canCompose && (
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={openCreate}
            className="mb-3 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 text-[12px] text-hgray900 transition-colors hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
            공유 메모 추가
          </button>
        </div>
      )}

      {isComposing && (
        <div className="mt-0">
          <textarea
            rows={compact ? 3 : 4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                resetEditor();
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSave();
              }
            }}
            className="w-full resize-none rounded-md border border-white/5 bg-black/10 px-3 py-3 text-[13px] leading-6 text-hgray900 outline-none placeholder:text-hgray600 focus:border-white/20"
            placeholder="메모를 남겨보세요"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-[11px] text-hgray600"></div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-1.5 text-xs text-hgray700 transition-colors hover:bg-white/5 hover:text-white"
                onClick={resetEditor}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || !viewer}
                className="rounded-xl bg-accenta1 px-3 py-1.5 text-xs text-black disabled:opacity-60"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

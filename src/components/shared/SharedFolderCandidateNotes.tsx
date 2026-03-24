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
};

export default function SharedFolderCandidateNotes({
  token,
  candidId,
  initialNotes = [],
  viewer,
  compact = false,
  showTitle = true,
  variant = "sidecar",
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
        compact ? "min-h-[140px] px-4 py-3" : "min-h-[200px] px-4 py-4",
      ].join(" ");
    }

    return [
      "flex h-full flex-col rounded-[26px] border border-white/10 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
      compact ? "min-h-[160px] p-4" : "min-h-[220px] p-4",
    ].join(" ");
  }, [compact, variant]);
  const noteCardClassName =
    "rounded-2xl border border-white/10 bg-white/5 px-3 py-3";

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
      {showHeaderRow ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          {showTitle ? (
            <div className="min-w-0">
              <div className="mt-1 text-sm text-hgray800">
                {sortedNotes.length > 0 && `${sortedNotes.length}개의 메모`}
              </div>
            </div>
          ) : (
            <div />
          )}
          {canCompose && !isComposing ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-[12px] text-hgray900 transition-colors hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" />
              메모 추가
            </button>
          ) : null}
        </div>
      ) : null}

      {sortedNotes.length === 0 && !isComposing ? (
        <div className="rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-[13px] leading-6 text-hgray600">
          {canCompose
            ? "이 후보자에 대한 메모를 남겨보세요."
            : "아직 남겨진 메모가 없습니다."}
        </div>
      ) : null}

      <div className="space-y-2">
        {sortedNotes.map((note) => (
          <div key={note.id} className={noteCardClassName}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-hgray900">
                    <span className="truncate">{note.viewerName}</span>
                  </span>
                  {note.updatedAt && note.updatedAt !== note.createdAt ? (
                    <span className="text-[11px] text-hgray600">수정됨</span>
                  ) : null}
                </div>
                <div className="mt-1 text-[11px] text-hgray600">
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

      {isComposing ? (
        <div className="mt-3 rounded-[22px] border border-white/10 bg-white/5 p-3">
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
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/10 px-3 py-3 text-[13px] leading-6 text-hgray900 outline-none placeholder:text-hgray600 focus:border-white/20"
            placeholder="이 후보자에 대한 메모를 남겨보세요"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-[11px] text-hgray600">
              {canCompose ? "Ctrl/Cmd + Enter로 저장" : ""}
            </div>
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
      ) : null}
    </div>
  );
}

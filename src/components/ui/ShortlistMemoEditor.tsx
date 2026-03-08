import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useUpsertShortlistMemo } from "@/hooks/useShortlistMemo";
import { showToast } from "../toast/toast";

type ShortlistMemoEditorProps = {
  userId: string;
  candidId: string;
  initialMemo?: string | null;
  placeholder?: string;
  rows?: number;
  className?: string;
  isSmall?: boolean;
};

export default function ShortlistMemoEditor({
  userId,
  candidId,
  initialMemo,
  placeholder = "+ 메모하기",
  rows = 3,
  className = "",
  isSmall = false,
}: ShortlistMemoEditorProps) {
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [draft, setDraft] = useState(initialMemo ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isChanged, setIsChanged] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { mutateAsync: upsertMemo, isPending } = useUpsertShortlistMemo();

  useEffect(() => {
    const next = initialMemo ?? "";
    setMemo(next);
    if (!isEditing) {
      setDraft(next);
      setIsChanged(false);
    }
  }, [initialMemo, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      const v = inputRef.current?.value ?? "";
      inputRef.current?.setSelectionRange(v.length, v.length);
    }, 0);
    return () => clearTimeout(t);
  }, [isEditing]);

  const cancel = useCallback(() => {
    setDraft(memo);
    setIsChanged(false);
    setIsEditing(false);
  }, [memo]);

  const commit = async () => {
    const next = draft.trim();
    const current = memo.trim();

    if (next === current) {
      setIsEditing(false);
      return;
    }

    try {
      const result = await upsertMemo({ userId, candidId, memo: next });
      setMemo(result.memo);
      setDraft(result.memo);
      setIsChanged(false);
      setIsEditing(false);
      showToast({
        message: result.memo
          ? "메모가 저장되었습니다."
          : "메모가 삭제되었습니다.",
        variant: "white",
      });
    } catch (error) {
      console.error("shortlist memo save error:", error);
      showToast({ message: "메모 저장에 실패했습니다.", variant: "white" });
    }
  };

  useEffect(() => {
    if (!isEditing) return;

    const onMouseDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) {
        cancel();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isEditing, cancel]);

  return (
    <div
      ref={rootRef}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isEditing) setIsEditing(true);
      }}
      className={`relative h-full rounded-md px-2 pt-1.5 transition-all duration-200 cursor-pointer ${
        isEditing
          ? "border border-white/0 bg-white/5 pb-1.5"
          : "border border-white/0 pb-1.5"
      } ${isSmall ? "hover:text-white" : `${className} hover:bg-white/5`} ${
        memo ? "text-hgray900" : "text-hgray600"
      }`}
    >
      {!isEditing ? (
        <div
          className={`flex items-start justify-between gap-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words`}
        >
          <span>{memo || placeholder}</span>
          {!isSmall && (
            <Pencil
              className="w-3 h-3 mt-0.5 text-hgray700/70 shrink-0"
              strokeWidth={1.6}
            />
          )}
        </div>
      ) : (
        <>
          <textarea
            ref={inputRef}
            value={draft}
            rows={rows}
            onChange={(e) => {
              setDraft(e.target.value);
              setIsChanged(e.target.value.trim() !== memo.trim());
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
              if (e.key === "Enter" && !e.shiftKey) {
                // if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void commit();
              }
            }}
            className="w-full resize-none bg-transparent outline-none text-[13px] text-hgray900 leading-relaxed pr-14"
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void commit();
            }}
            disabled={isPending}
            className={`absolute bottom-[-1px] right-0.5 text-xs transition-all duration-200 ${
              isChanged ? "text-accenta1" : "text-hgray600"
            } disabled:opacity-60`}
          >
            Confirm
          </button>
        </>
      )}
    </div>
  );
}

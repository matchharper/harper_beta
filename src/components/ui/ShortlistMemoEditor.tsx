import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, PencilLine } from "lucide-react";
import { useUpsertShortlistMemo } from "@/hooks/useShortlistMemo";
import { cn } from "@/lib/cn";
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

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isEditingRef = useRef(false);
  const { mutateAsync: upsertMemo, isPending } = useUpsertShortlistMemo();
  const hasMemo = memo.trim().length > 0;
  const isChanged = draft.trim() !== memo.trim();

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!isEditingRef.current) {
      const next = initialMemo ?? "";
      setMemo(next);
      setDraft(next);
    }
  }, [initialMemo]);

  useEffect(() => {
    if (!isEditing) return;
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const valueLength = input.value.length;
      input.setSelectionRange(valueLength, valueLength);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditing]);

  const cancel = useCallback(() => {
    setDraft(memo);
    setIsEditing(false);
  }, [memo]);

  const commit = useCallback(async () => {
    const next = draft.trim();
    const current = memo.trim();

    if (next === current) {
      setIsEditing(false);
      return;
    }

    try {
      const result = await upsertMemo({ userId, candidId, memo: next });
      const savedMemo = result.memo ?? "";
      setMemo(savedMemo);
      setDraft(savedMemo);
      setIsEditing(false);
      showToast({
        message: savedMemo
          ? "메모가 저장되었습니다."
          : "메모가 삭제되었습니다.",
        variant: "white",
      });
    } catch (error) {
      console.error("shortlist memo save error:", error);
      showToast({ message: "메모 저장에 실패했습니다.", variant: "white" });
    }
  }, [candidId, draft, memo, upsertMemo, userId]);

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
      className={cn(
        "relative ml-[2px] w-full cursor-pointer rounded-md border border-transparent px-2 pb-1.5 pl-3 pt-1.5 text-[13px] leading-relaxed transition-all duration-200",
        isEditing
          ? "bg-beige50"
          : isSmall
            ? "hover:text-beige900"
            : "hover:bg-beige50/80",
        hasMemo ? "text-beige900" : "text-beige900/55",
        !isEditing && hasMemo && "border-transparent bg-beige50 py-2",
        !isEditing &&
          !hasMemo &&
          "w-fit pl-3 pr-4 rounded-md border-beige900/8 bg-beige500/55 h-8 flex items-center justify-start hover:bg-beige500/70",
        className
      )}
    >
      {/* {!isEditing && hasMemo && (
        <div className="absolute top-0 left-[-1px] h-full bg-accenta1 w-0.5 rounded-[1px]"></div>
      )} */}
      {!isEditing ? (
        <>
          {hasMemo ? (
            <div className="group flex items-center justify-between gap-2 whitespace-pre-wrap break-words">
              <span>{memo}</span>
              <PencilLine
                className="w-3 h-3 mr-1 text-beige900/45 shrink-0 group-hover:text-beige900"
                strokeWidth={1.6}
              />
            </div>
          ) : (
            <div className="group flex items-center justify-start gap-2.5 whitespace-pre-wrap break-words text-beige900">
              <PencilLine
                className="w-2.5 h-2.5 shrink-0 text-beige900 group-hover:text-beige900"
                strokeWidth={1.6}
              />
              <span>메모 추가</span>
            </div>
          )}
        </>
      ) : (
        <>
          <textarea
            ref={inputRef}
            value={draft}
            rows={rows}
            onChange={(e) => {
              setDraft(e.target.value);
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
            className="w-full resize-none bg-transparent pr-14 text-beige900 outline-none"
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
            className={cn(
              "absolute bottom-[-1px] right-0.5 text-xs transition-all duration-200 disabled:opacity-60",
              isChanged ? "text-accentBronze" : "text-beige900/45"
            )}
          >
            Confirm
          </button>
        </>
      )}
    </div>
  );
}

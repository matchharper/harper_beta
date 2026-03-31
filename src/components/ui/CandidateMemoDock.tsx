import React from "react";
import { CandidateMarkStatus } from "@/lib/candidateMark";
import CandidateMarkButton from "./CandidateMarkButton";
import ShortlistMemoEditor from "./ShortlistMemoEditor";

type CandidateMemoDockProps = {
  userId?: string;
  candidId: string;
  initialMemo?: string | null;
  initialMarkStatus?: CandidateMarkStatus | null;
  showMarkButton?: boolean;
  onMarkChange?: (status: CandidateMarkStatus | null) => void;
  rows?: number;
  className?: string;
  editorClassName?: string;
  editorIsSmall?: boolean;
  readOnlyPlaceholder?: string;
};

export default function CandidateMemoDock({
  userId,
  candidId,
  initialMemo,
  initialMarkStatus = null,
  showMarkButton = true,
  onMarkChange,
  rows = 3,
  className = "",
  editorClassName = "",
  editorIsSmall = false,
  readOnlyPlaceholder = "메모 없음",
}: CandidateMemoDockProps) {
  const shouldShowMarkButton =
    showMarkButton && Boolean(userId || initialMarkStatus);

  return (
    <div className={`flex flex-row items-center gap-2 ${className}`.trim()}>
      {shouldShowMarkButton ? (
        <div className="shrink-0">
          <CandidateMarkButton
            userId={userId}
            candidId={candidId}
            initialStatus={initialMarkStatus}
            align="start"
            onChange={onMarkChange}
          />
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        {userId ? (
          <ShortlistMemoEditor
            userId={userId}
            candidId={candidId}
            initialMemo={initialMemo}
            rows={rows}
            isSmall={editorIsSmall}
          />
        ) : (
          <div
            className={[
              "min-h-[36px] rounded-md px-2 pt-1.5 pb-1.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words",
              editorClassName,
              initialMemo ? "text-hgray900" : "text-hgray600",
            ].join(" ")}
          >
            {initialMemo || readOnlyPlaceholder}
          </div>
        )}
      </div>
    </div>
  );
}

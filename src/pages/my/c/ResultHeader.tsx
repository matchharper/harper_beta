// components/result/ResultHeader.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock,
  GraduationCap,
  Loader2,
  Pin,
  ThumbsDown,
} from "lucide-react";
import { dateToFormatLong } from "@/utils/textprocess";
import { supabase } from "@/lib/supabase";
import Timeline from "./timeline";
import { useMessages } from "@/i18n/useMessage";
import { StatusEnum } from "@/types/type";
import { SearchSource } from "@/lib/searchSource";
import { runKey } from "@/hooks/useRunDetail";

type Props = {
  queryItem: any;
  runId: string;
  status: string;
  feedback: number;
  sourceType?: SearchSource;
};

export default function ResultHeader({
  queryItem,
  runId,
  status,
  feedback,
  sourceType = "linkedin",
}: Props) {
  const { m } = useMessages();
  const qc = useQueryClient();
  const [optimisticFeedback, setOptimisticFeedback] = useState(feedback);
  const [pendingAction, setPendingAction] = useState<"like" | "dislike" | null>(
    null
  );
  const statusMessage = useMemo(() => {
    return status;
  }, [status]);
  const sourceBadgeText =
    sourceType === "scholar" ? (
      <div className="flex flex-row items-center justify-start gap-1 text-hgray700">
        <GraduationCap className="w-4 h-4" strokeWidth={2} />
        <span className="text-sm">from publications</span>
      </div>
    ) : null;

  useEffect(() => {
    if (pendingAction) return;
    setOptimisticFeedback(feedback);
  }, [feedback, pendingAction]);

  const updateFeedback = useCallback(
    async (nextFeedback: number, action: "like" | "dislike") => {
      if (!runId || pendingAction) return;

      const prevFeedback = optimisticFeedback;
      setPendingAction(action);
      setOptimisticFeedback(nextFeedback);
      qc.setQueryData(runKey(runId), (current: any) =>
        current ? { ...current, feedback: nextFeedback } : current
      );

      const { error } = await supabase
        .from("runs")
        .update({ feedback: nextFeedback })
        .eq("id", runId);

      if (error) {
        console.error(`${action} feedback update failed:`, error);
        setOptimisticFeedback(prevFeedback);
        qc.setQueryData(runKey(runId), (current: any) =>
          current ? { ...current, feedback: prevFeedback } : current
        );
      } else {
        qc.invalidateQueries({ queryKey: ["queriesHistory"] });
        qc.invalidateQueries({
          queryKey: runKey(runId),
          exact: true,
          type: "active",
        });
      }

      setPendingAction(null);
    },
    [optimisticFeedback, pendingAction, qc, runId]
  );

  const pin = useCallback(() => {
    const nextFeedback = optimisticFeedback === 1 ? 0 : 1;
    void updateFeedback(nextFeedback, "like");
  }, [optimisticFeedback, updateFeedback]);

  const dislike = useCallback(() => {
    const nextFeedback = optimisticFeedback === -1 ? 0 : -1;
    void updateFeedback(nextFeedback, "dislike");
  }, [optimisticFeedback, updateFeedback]);

  const isLikeActive = optimisticFeedback === 1;
  const isDislikeActive = optimisticFeedback === -1;
  const isLikePending = pendingAction === "like";
  const isDislikePending = pendingAction === "dislike";

  if (!queryItem) return null;

  return (
    <>
      <div className="w-full h-full py-1 flex flex-row items-center justify-between px-4">
        <div className="text-sm text-hgray600 font-normal flex flex-row items-center justify-start gap-4">
          <div>
            {queryItem.company_users ? (
              <>
                {m.search.resultHeader.by} {queryItem.company_users.name}
              </>
            ) : (
              ""
            )}
          </div>
          {queryItem.created_at ? (
            <div className="flex flex-row items-center justify-start gap-1 text-sm">
              <Clock className="w-3 h-3" />
              {dateToFormatLong(queryItem.created_at)}
            </div>
          ) : (
            ""
          )}
          {sourceBadgeText ? (
            <div className="text-sm text-hgray600">{sourceBadgeText}</div>
          ) : null}
        </div>
        <div className="flex flex-row items-center justify-center gap-3 text-hgray600">
          <button
            onClick={pin}
            disabled={!runId || pendingAction !== null}
            aria-label={
              isLikeActive ? "Unpin search result" : "Pin search result"
            }
            aria-pressed={isLikeActive}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
              isLikeActive
                ? "bg-accenta1/14 text-accenta1"
                : "hover:bg-white/10 hover:text-white"
            } ${pendingAction ? "cursor-wait" : "cursor-pointer"}`}
          >
            {isLikePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
            ) : (
              <Pin
                className="h-3.5 w-3.5"
                fill={isLikeActive ? "currentColor" : "none"}
                strokeWidth={1.8}
              />
            )}
          </button>
          <button
            onClick={dislike}
            disabled={!runId || pendingAction !== null}
            aria-label="Dislike search result"
            aria-pressed={isDislikeActive}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
              isDislikeActive
                ? "bg-sky-500/12 text-white/90"
                : "hover:bg-white/10 hover:text-white"
            } ${pendingAction ? "cursor-wait" : "cursor-pointer"}`}
          >
            {isDislikePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
            ) : (
              <ThumbsDown
                className="h-3.5 w-3.5"
                fill={isDislikeActive ? "currentColor" : "none"}
                strokeWidth={1.8}
              />
            )}
          </button>
        </div>
      </div>

      {statusMessage && statusMessage !== StatusEnum.FINISHED && (
        <Timeline statusMessage={statusMessage} runId={runId} />
      )}

      {statusMessage && (
        <div className="w-full relative flex items-start justify-start">
          {/* {statusMessage === StatusEnum.RERANKING_STREAMING && (
            <div className="text-sm font-light text-hgray900 flex flex-row gap-2 items-start absolute top-3 left-5">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
              <div className="animate-textGlow">
                {m.search.resultHeader.readingCandidates}
              </div>
            </div>
          )} */}
          {statusMessage === StatusEnum.FINISHED && (
            <div className="text-sm font-light text-hgray900 flex flex-row gap-2 items-start absolute top-3 left-5">
              <Check
                className="w-4 h-4 text-green-500 mt-0.5"
                strokeWidth={2}
              />
              <div className="">{m.search.resultHeader.finished}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// components/result/ResultHeader.tsx
import React, { useCallback, useMemo } from "react";
import { Check, Clock, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { dateToFormatLong } from "@/utils/textprocess";
import { supabase } from "@/lib/supabase";
import Timeline from "./timeline";
import { useMessages } from "@/i18n/useMessage";

type Props = {
  queryItem: any;
  runId: string;
  status: string;
  feedback: number;
};

export default function ResultHeader({
  queryItem,
  runId,
  status,
  feedback,
}: Props) {
  const { m } = useMessages();
  const statusMessage = useMemo(() => {
    return status;
  }, [status]);

  // implement like (= runs.feedback = 1)
  const like = useCallback(() => {
    if (!runId) return;
    supabase.from("runs").update({ feedback: feedback === 1 ? 0 : 1 }).eq("id", runId).then(({ error }) => {
      if (error) {
        console.error("Like feedback update failed:", error);
      }
    });
  }, [feedback, runId]);

  // implement dislike (= runs.feedback = -1)
  const dislike = useCallback(() => {
    if (!runId) return;
    supabase.from("runs").update({ feedback: feedback === -1 ? 0 : -1 }).eq("id", runId).then(({ error }) => {
      if (error) {
        console.error("Dislike feedback update failed:", error);
      }
    });

  }, [feedback, runId]);

  if (!queryItem) return null;

  return (
    <>
      <div className="w-full h-full py-2 flex flex-row items-center justify-between px-4">
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
            <div className="flex flex-row items-center justify-start gap-1 text-xs">
              <Clock className="w-3 h-3" />
              {dateToFormatLong(queryItem.created_at)}
            </div>
          ) : (
            ""
          )}
        </div>
        <div className="flex flex-row items-center justify-center gap-4 text-hgray600">
          <button onClick={like} className="p-1.5 rounded-sm hover:bg-white/10 cursor-pointer">
            <ThumbsUp className={`w-3.5 h-3.5`} fill={feedback === 1 ? "rgba(255,255,255,0.9)" : "none"} strokeWidth={1.6} />
          </button>
          <button onClick={dislike} className="p-1.5 rounded-sm hover:bg-white/10 cursor-pointer">
            <ThumbsDown className={`w-3.5 h-3.5`} fill={feedback === -1 ? "rgba(255,255,255,0.9)" : "none"} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <Timeline statusMessage={statusMessage} runId={runId} />

      {
        statusMessage &&
        <div className="w-full relative flex items-start justify-start">
          {
            statusMessage === "partially_finished" && (
              <div className="text-sm font-light text-hgray900 flex flex-row gap-2 items-start absolute top-3 left-5">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                <div className="animate-textGlow">
                  {m.search.resultHeader.readingCandidates}
                </div>
              </div>
            )}
          {
            statusMessage === "finished" && (
              <div className="text-sm font-light text-hgray900 flex flex-row gap-2 items-start absolute top-3 left-5">
                <Check className="w-4 h-4 text-green-500 mt-0.5" strokeWidth={2} />
                <div className="">{m.search.resultHeader.finished}</div>
              </div>
            )
          }
        </div>
      }
    </>
  );
}

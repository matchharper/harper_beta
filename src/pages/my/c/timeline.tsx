import { supabase } from "@/lib/supabase";
import { StatusEnum } from "@/types/type";
import { Check, Circle, CircleSlash, Loader2, Square } from "lucide-react";
import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef,
} from "react";
import { useMessages } from "@/i18n/useMessage";

type StepState = "done" | "active" | "pending" | "error";

type StepDef = {
  key: string;
  title: string;
  description?: string;
  // Matches statusMessage. You can add more patterns anytime.
  match: (s: string) => boolean;
};

type DerivedProgress = {
  steps: Array<{
    key: string;
    title: string;
    description?: string;
    state: StepState;
  }>;
  detail?: string;
};

type TimelineLabels = {
  steps: {
    parseTitle: string;
    parseDesc: string;
    planTitle: string;
    planDesc: string;
    refineTitle: string;
    refineDesc: string;
    runningTitle: string;
    runningDesc: string;
    partialTitle: string;
    partialDesc: string;
    rankingTitle: string;
    rankingDesc: string;
    recoveryTitle: string;
    recoveryDesc: string;
    recoveryRetryTitle: string;
    recoveryRetryDesc: string;
    retryTitle: string;
    retryDesc: string;
  };
  found: string;
};

/**
 * Derives a progress timeline from statusMessage string.
 * Intentionally string-based because status is “human sentences”.
 */
export function deriveProgress(
  statusMessage: string,
  labels: TimelineLabels
): DerivedProgress {
  const raw = statusMessage || "";
  const s = raw.toLowerCase();

  const isFinished = s.includes("finished") && !s.includes("partially");
  const isStopped = s.includes("stopped") || s.includes("중지");
  const isErrorHandling = s.includes("error_handling");
  const isRetry = s.includes("expanding");

  // Base steps (keep keys stable)
  const base: StepDef[] = [
    {
      key: "parse",
      title: labels.steps.parseTitle,
      description: labels.steps.parseDesc,
      match: (x) =>
        x.includes("aasadwq---default-done") ||
        x.includes(StatusEnum.QUEUED) ||
        x.includes(StatusEnum.STARTING),
    },
    {
      key: "plan",
      title: labels.steps.planTitle,
      description: labels.steps.planDesc,
      match: (x) => x.includes(StatusEnum.PARSING),
    },
    // {
    //   key: "refine",
    //   title: labels.steps.refineTitle,
    //   description: labels.steps.refineDesc,
    //   match: (x) => x.includes(StatusEnum.REFINE) || x.includes("optimiz"),
    // },
    {
      key: "running",
      title: labels.steps.runningTitle,
      description: labels.steps.runningDesc,
      match: (x) => x.includes(StatusEnum.RUNNING) || x.includes("searching"),
    },
    {
      key: "partial",
      title: labels.steps.partialTitle,
      description: labels.steps.partialDesc,
      match: (x) => x.includes(StatusEnum.PARTIAL),
    },
    {
      key: "ranking",
      title: labels.steps.rankingTitle,
      description: labels.steps.rankingDesc,
      match: (x) =>
        x.includes(StatusEnum.RERANKING) ||
        x.includes(StatusEnum.RERANKING_STREAMING) ||
        x.includes("scoring") ||
        x.includes("done"),
    },
  ];

  // Build steps list (insert error-handling ALWAYS right before ranking)
  const rankingIdx = Math.max(
    0,
    base.findIndex((b) => b.key === "ranking")
  );
  const insertedKey = isRetry ? "recovery_retry" : "recovery";

  const defs: StepDef[] = base.slice();

  // Decide active step index
  const activeIdx = (() => {
    if (isFinished || isStopped) return -1;

    // During error handling, ALWAYS point to the inserted recovery step so it "spins".
    if (isErrorHandling) {
      const idx = defs.findIndex((d) => d.key === insertedKey);
      return idx >= 0 ? idx : 0;
    }

    // During retry expansion, point to retry step if present.
    if (isRetry) {
      const idx = defs.findIndex((d) => d.key === "retry_run");
      if (idx >= 0) return idx;
    }

    // Otherwise find the latest matching base step from the end.
    for (let i = defs.length - 1; i >= 0; i--) {
      if (defs[i].match(s)) return i;
    }

    // Default: planning-ish
    return Math.max(
      0,
      defs.findIndex((d) => d.key === "plan")
    );
  })();

  // Determine step states
  const steps = defs.map((d, idx) => {
    let state: StepState = "pending";

    if (activeIdx === -1) {
      // Finished/stopped → you can optionally mark all done, but keep it simple here
      state = "pending";
    } else if (idx < activeIdx) {
      state = "done";
    } else if (idx === activeIdx) {
      // If this active step is the recovery step, show it as "active" (spinner)
      // If you want it to show as "error" icon instead, change to "error".
      state = "active";
    }

    // Optional: if you ever emit "fatal_error" you can flip just that step
    if (s.includes("fatal_error") && idx === activeIdx) state = "error";

    return { key: d.key, title: d.title, description: d.description, state };
  });

  // Detail line truncation
  let detail: string | undefined = raw;
  if (raw.length > 120) detail = raw.slice(0, 120) + "…";

  // If finished, you might want all done; leaving as-is because your outer UI hides on "finished".
  return { steps, detail };
}

const Timeline = ({
  statusMessage,
  runId,
}: {
  statusMessage: string;
  runId: string;
}) => {
  const { m } = useMessages();
  const progress = useMemo(
    () => deriveProgress(statusMessage || "", m.search.timeline),
    [statusMessage, m.search.timeline]
  );
  const [rerankProgress, setRerankProgress] = useState<{
    current: number;
    total: number | null;
    percent: number | null;
  }>({ current: 0, total: null, percent: null });

  const isReranking = useMemo(() => {
    const s = (statusMessage || "").toLowerCase();
    return (
      s.includes(StatusEnum.RERANKING) ||
      s.includes(StatusEnum.RERANKING_STREAMING) ||
      s.includes("scoring")
    );
  }, [statusMessage]);

  const loadRerankProgress = useCallback(async () => {
    if (!runId) return;
    const { data, error } = await supabase
      .from("runs_pages")
      .select("candidate_ids, total_candidates, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return;

    const row = data?.[0];
    const current = Array.isArray(row?.candidate_ids)
      ? row?.candidate_ids.length
      : 0;
    const total =
      typeof row?.total_candidates === "number" ? row.total_candidates : null;
    const percent =
      total && total > 0
        ? Math.min(100, Math.floor((current / total) * 100))
        : null;

    setRerankProgress({ current, total, percent });
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    loadRerankProgress();
    const channel = supabase
      .channel(`runs_pages_progress:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "runs_pages",
          filter: `run_id=eq.${runId}`,
        },
        () => {
          loadRerankProgress();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, loadRerankProgress]);

  const stopRun = useCallback(async () => {
    if (!runId) return;

    // .update 대신 .rpc를 사용하여 서버 측 함수를 호출합니다.
    const { error } = await supabase.rpc("stop_run_worker", {
      target_run_id: runId,
    });

    if (error) {
      console.error("Stop run failed:", error.message);
    } else {
      console.log("Run stopped successfully");
    }
  }, [runId]);

  const [shownCount, setShownCount] = useState(0);
  const firstShownRef = useRef(false);

  useEffect(() => {
    // finished 상태면 애니메이션 자체가 의미 없어서 리셋만
    if (!statusMessage || statusMessage.includes("finished")) {
      setShownCount(0);
      firstShownRef.current = false;
      return;
    }

    // "처음 등장할 때만" 실행
    if (firstShownRef.current) return;
    firstShownRef.current = true;

    setShownCount(0);
    const total = progress.steps.length;

    let i = 0;
    const tick = () => {
      i += 1;
      setShownCount(i);
      if (i >= total) return;
      window.setTimeout(tick, 90); // step 간격 (툭툭)
    };

    // 아주 짧게 쉬었다 시작하면 더 자연스러움
    const startId = window.setTimeout(tick, 120);

    return () => {
      window.clearTimeout(startId);
    };
  }, [statusMessage, progress.steps.length]);

  if (statusMessage && statusMessage.includes(StatusEnum.FOUND)) {
    return (
      <div className="w-full relative flex items-start justify-start">
        <div className="text-sm font-light text-hgray900 flex flex-row gap-2 items-center absolute top-3 left-5">
          <Check className="w-4 h-4 text-green-500" strokeWidth={2} />
          <div className="animate-textGlow">{m.search.timeline.found}</div>
        </div>
      </div>
    );
  }

  if (statusMessage && statusMessage.includes(StatusEnum.RERANKING_STREAMING)) {
    return (
      <div className="w-full relative flex items-start justify-start">
        <div className="text-sm font-light text-hgray900 flex flex-row gap-2 items-center absolute top-3 left-5">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
          <div className="animate-textGlow">
            {m.search.resultHeader.readingCandidates}{" "}
            {rerankProgress.percent !== null
              ? ` · ${rerankProgress.percent}%`
              : ""}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center min-h-[80vh] px-6">
      {statusMessage && statusMessage.includes(StatusEnum.STOPPED) ? (
        <div className="flex flex-col gap-2 items-center justify-center">
          <div className="text-sm font-light mt-4 text-hgray900 flex flex-row gap-2 items-center">
            <CircleSlash className="w-3.5 h-3.5 text-hgray900" />
            <div className="animate-textGlow">{m.search.timeline.stopped}</div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-[520px]">
          {/* Header */}
          <div className="flex flex-row items-center justify-between mb-4">
            <div className="flex flex-col">
              <div className="text-base font-medium text-hgray900">
                {m.search.timeline.headerTitle}
              </div>
            </div>

            <button
              onClick={stopRun}
              className="py-1.5 px-2 rounded-sm text-hgray900/80 text-sm font-light hover:bg-white/0 cursor-pointer bg-white/0 flex flex-row gap-2 items-center hover:text-red-500/80 transition-colors duration-200"
            >
              <Square className="w-3 h-3" fill="currentColor" />
              <span>{m.search.timeline.stop}</span>
            </button>
          </div>

          {/* Timeline */}
          <div className="rounded-lg bg-white/5 p-3 min-h-[240px]">
            <div className="flex flex-col gap-4">
              {progress.steps.slice(0, shownCount).map((step, idx) => {
                const isLast = idx === progress.steps.length - 1;

                const Icon = (() => {
                  if (step.state === "done") return Check;
                  if (step.state === "error") return CircleSlash;
                  if (step.state === "active") return Loader2;
                  return Circle;
                })();

                const delayMs = idx * 140;

                return (
                  <div
                    key={step.key}
                    className="flex flex-row gap-3 will-change-transform animate-stepDropIn"
                    style={{
                      animationDelay: `${delayMs}ms`,
                      padding: step.state === "active" ? "8px 0px" : "0px",
                    }}
                  >
                    {/* Left rail */}
                    <div className="flex flex-col items-center pt-0.5">
                      <div
                        className={[
                          "w-4 h-4 rounded-full flex items-center justify-center",
                          step.state === "done" ? "bg-white/0" : "",
                          step.state === "active" ? "bg-white/0" : "",
                          step.state === "pending" ? "bg-white/0" : "",
                          step.state === "error" ? "bg-white/0" : "",
                        ].join(" ")}
                      >
                        {step.state === "active" && (
                          <Icon
                            className="w-4 h-4 animate-spin text-hgray900"
                            strokeWidth={2}
                          />
                        )}
                        {step.state === "done" && (
                          <Icon
                            className="w-3 h-3 text-green-400"
                            strokeWidth={2}
                          />
                        )}
                        {step.state === "pending" && (
                          <Icon
                            className="w-3 h-3 text-hgray600"
                            strokeWidth={2}
                          />
                        )}
                        {step.state === "error" && (
                          <Icon
                            className="w-3 h-3 text-red-500"
                            strokeWidth={2}
                          />
                        )}
                      </div>

                      {/* {!isLast && <div className="w-px flex-1 bg-white/10 my-1" />} */}
                    </div>

                    {/* Content */}
                    <div className="flex flex-col">
                      <div className="flex flex-row items-center gap-2">
                        <div className="text-sm font-medium text-hgray900">
                          {step.title}
                        </div>
                      </div>

                      {step.state === "active" && step.description && (
                        <div className="text-sm text-hgray800 mt-1 leading-5 animate-textGlow">
                          {step.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional: small reassurance row */}
          <div className="text-xs text-hgray600 mt-3 leading-relaxed">
            {m.search.timeline.note}
            <br />
            {m.search.timeline.note3}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(Timeline);

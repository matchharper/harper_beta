import { supabase } from "@/lib/supabase";
import { StatusEnum } from "@/types/type";
import { logger } from "@/utils/logger";
import { Check, Circle, CircleSlash, Clock, Loader2, Square } from "lucide-react";
import React, { useEffect, useCallback, useMemo, useState, useRef } from "react";

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

/**
 * Derives a progress timeline from statusMessage string.
 * Intentionally string-based because status is “human sentences”.
 */
export function deriveProgress(statusMessage: string): DerivedProgress {
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
      title: "요청 이해",
      description: "기준을 해석하고 검색 전략을 구성합니다.",
      match: (x) => x.includes("aasadwq---default-done"),
    },
    {
      key: "plan",
      title: "검색 전략 세우기",
      description: "기준을 구체화하고 검색 범위를 정합니다.",
      match: (x) => x.includes("parsing"),
    },
    {
      key: "refine",
      title: "검색 방법 최적화",
      description: "쿼리/조건을 다듬어 성능과 정확도를 최적화합니다.",
      match: (x) => x.includes("refine") || x.includes("optimiz"),
    },
    {
      key: "running",
      title: "전체 후보자 찾기",
      description: "경력/회사/키워드 기반으로 후보를 넓게 찾습니다.",
      match: (x) => x.includes("running") || x.includes("searching") || x.includes("queued"),
    },
    {
      key: "ranking",
      title: "랭킹/스코어링",
      description: "기준에 맞게 우선순위를 계산합니다.",
      match: (x) => x.includes("ranking") || x.includes("scoring") || x.includes("partial") || x.includes("done"),
    },
  ];

  // Build steps list (insert error-handling ALWAYS right before ranking)
  const rankingIdx = Math.max(0, base.findIndex((b) => b.key === "ranking"));
  const insertedKey = isRetry ? "recovery_retry" : "recovery";

  const defs: StepDef[] = base.slice();
  if (rankingIdx >= 0) {
    defs.splice(rankingIdx, 0, {
      key: insertedKey,
      title: isRetry ? "복구/재시도 경로 실행" : "조건 추가하기",
      description: isRetry
        ? "조건을 완화하거나 다른 전략으로 재시도합니다."
        : "문제를 분석하고 안전한 방식으로 계속 진행합니다.",
      match: (x) =>
        // Make it easy to activate this step from string status
        x.includes("error_handling") || x.includes("recovery") || x.includes("fallback"),
    });

    if (isRetry) {
      defs.splice(rankingIdx + 1, 0, {
        key: "retry_run",
        title: "대체 전략으로 후보 재탐색",
        description: "타임아웃/실패 조건을 회피해 다시 후보를 찾습니다.",
        match: (x) => x.includes("expanding") || x.includes("retry") || x.includes("rerun"),
      });
    }
  }

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
    return Math.max(0, defs.findIndex((d) => d.key === "plan"));
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


const Timeline = ({ statusMessage, runId }: { statusMessage: string, runId: string }) => {
  const progress = useMemo(() => deriveProgress(statusMessage || ""), [statusMessage]);

  const stopRun = useCallback(async () => {
    if (!runId) return;

    // .update 대신 .rpc를 사용하여 서버 측 함수를 호출합니다.
    const { error } = await supabase.rpc('stop_run_worker', {
      target_run_id: runId
    });

    if (error) {
      console.error("Stop run failed:", error.message);
    } else {
      console.log("Run stopped successfully");
    }
  }, [runId]);


  // NEW: step reveal
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

  return (<>
    {statusMessage && !statusMessage.includes("finished") && (
      <div className="w-full h-full flex items-center justify-center min-h-[80vh] px-6">
        {statusMessage && statusMessage.includes(StatusEnum.STOPPED) ? (
          <div className="flex flex-col gap-2 items-center justify-center">
            <div className="text-sm font-light mt-4 text-hgray900 flex flex-row gap-2 items-center">
              <CircleSlash className="w-3.5 h-3.5 text-hgray900" />
              <div className="animate-textGlow">검색 중지됨</div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[520px]">
            {/* Header */}
            <div className="flex flex-row items-center justify-between mb-4">
              <div className="flex flex-col">
                <div className="text-base font-medium text-hgray900">
                  Harper가 후보를 찾는 중이에요
                </div>
              </div>

              <button
                onClick={stopRun}
                className="py-1.5 px-2 rounded-sm text-hgray900/80 text-sm font-light hover:bg-white/0 cursor-pointer bg-white/0 flex flex-row gap-2 items-center hover:text-red-500/80 transition-colors duration-200"
              >
                <Square className="w-3 h-3" fill="currentColor" />
                <span>Stop</span>
              </button>
            </div>

            {/* Timeline */}
            <div className="rounded-lg bg-white/5 p-3 min-h-[280px]">
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
                    <div key={step.key}
                      className="flex flex-row gap-3 will-change-transform animate-stepDropIn"
                      style={{ animationDelay: `${delayMs}ms`, padding: step.state === "active" ? "8px 0px" : "0px" }}>
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
                            <Icon className="w-4 h-4 animate-spin text-hgray900" strokeWidth={2} />
                          )}
                          {step.state === "done" && (
                            <Icon className="w-3 h-3 text-green-400" strokeWidth={2} />
                          )}
                          {step.state === "pending" && (
                            <Icon className="w-3 h-3 text-hgray600" strokeWidth={2} />
                          )}
                          {step.state === "error" && (
                            <Icon className="w-3 h-3 text-red-500" strokeWidth={2} />
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

              {/* Live detail line */}
              {/* {progress.detail && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <div className="text-xs text-hgray600">현재 상태</div>
                  <div className="text-sm text-hgray900 mt-1">
                    <span className="animate-textGlow">{progress.detail}</span>
                  </div>
                </div>
              )} */}
            </div>

            {/* Optional: small reassurance row */}
            <div className="text-xs text-hgray600 mt-3">
              * max 플랜 사용자라면 동시에 여러 개의 검색을 실행할 수 있습니다.
            </div>
          </div>
        )}
      </div>
    )}
  </>)
}

export default React.memo(Timeline);
import { useCallback, useState } from "react";
import {
  Braces,
  Clipboard,
  DatabaseZap,
  LoaderCircle,
  Play,
} from "lucide-react";
import {
  DebuggingPageShell,
  useCanFetchInternal,
  useDebugCopyToClipboard,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsCompanyAnswerExampleDebugResponse } from "@/lib/ops/companyAnswerExampleDebugger";

const INITIAL_MESSAGE = "Harper는 어떤 방식으로 비용을 받나요?";

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={opsTheme.badgeStrong}>
      score {Number.isFinite(score) ? score.toFixed(4) : "-"}
    </span>
  );
}

function PromptOutput({ value }: { value: string | null }) {
  const copyToClipboard = useDebugCopyToClipboard();
  return (
    <section className={cx(opsTheme.panel, "min-w-0 overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-primary">
          <Braces className="h-4 w-4" />
          실제 prompt 주입 원문
        </div>
        <MuteButton
          size="sm"
          variant="transparent"
          disabled={!value}
          onClick={() => void copyToClipboard(value, "Prompt block")}
        >
          <Clipboard className="h-3.5 w-3.5" />
          복사
        </MuteButton>
      </div>
      {value ? (
        <pre className="max-h-[760px] min-h-[360px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-neutral-primary">
          {value}
        </pre>
      ) : (
        <div className="flex min-h-[240px] items-center justify-center px-6 text-sm text-neutral-soft">
          주입 없음
        </div>
      )}
    </section>
  );
}

export default function OpsCompanyAnswerRetrievalPage() {
  const canFetch = useCanFetchInternal();
  const [message, setMessage] = useState(INITIAL_MESSAGE);
  const [minScore, setMinScore] = useState("0.35");
  const [topK, setTopK] = useState("3");
  const [result, setResult] =
    useState<OpsCompanyAnswerExampleDebugResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const runLookup = useCallback(async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading || !canFetch) return;
    setLoading(true);
    setError("");
    try {
      const payload =
        await fetchWithInternalAuth<OpsCompanyAnswerExampleDebugResponse>(
          "/api/internal/debug/company-answer-retrieval",
          {
            body: JSON.stringify({
              message,
              minScore: Number(minScore),
              topK: Number(topK),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
      setResult(payload);
    } catch (lookupError) {
      setResult(null);
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Retrieval을 실행하지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, [canFetch, loading, message, minScore, topK]);

  const topScore = result?.matches[0]?.score;
  const settingsValid =
    minScore.trim().length > 0 &&
    topK.trim().length > 0 &&
    Number.isFinite(Number(minScore)) &&
    Number(minScore) >= 0 &&
    Number(minScore) <= 1 &&
    Number.isInteger(Number(topK)) &&
    Number(topK) >= 1 &&
    Number(topK) <= 10;

  return (
    <DebuggingPageShell
      filters={
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void runLookup();
          }}
        >
          <div className="grid gap-1.5">
            <label
              className="text-[13px] font-medium text-neutral-primary"
              htmlFor="company-answer-retrieval-message"
            >
              회사 사용자의 메시지
            </label>
            <Textarea
              id="company-answer-retrieval-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={8_000}
              placeholder="메시지 입력"
              className="min-h-[112px]"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid grid-cols-2 gap-3 sm:w-72">
              <label className="grid gap-1.5 text-[13px] font-medium text-neutral-primary">
                <span>Min score</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={minScore}
                  onChange={(event) => setMinScore(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium text-neutral-primary">
                <span>Top K</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={topK}
                  onChange={(event) => setTopK(event.target.value)}
                />
              </label>
            </div>
            <MuteButton
              type="submit"
              size="lg"
              variant="dark"
              disabled={
                !canFetch || loading || !message.trim() || !settingsValid
              }
            >
              {loading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {loading ? "Retrieval 실행 중" : "Retrieval 실행"}
            </MuteButton>
          </div>
          {error ? <div className={opsTheme.errorNotice}>{error}</div> : null}
        </form>
      }
      showContextLabel={false}
      showDescription={false}
      tab="companyAnswerRetrieval"
    >
      {result ? (
        <>
          <section
            className={cx(
              opsTheme.panel,
              "flex flex-wrap gap-x-5 gap-y-2 px-4 py-3 text-sm text-neutral-muted"
            )}
          >
            <span>
              <strong className="font-medium text-neutral-primary">
                {result.matches.length}
              </strong>{" "}
              matches
            </span>
            <span>
              top score{" "}
              <strong className="font-medium text-neutral-primary">
                {topScore === undefined ? "-" : topScore.toFixed(4)}
              </strong>
            </span>
            <span>{result.durationMs}ms</span>
            <span>{result.promptBlock ? "prompt 포함" : "prompt 없음"}</span>
          </section>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <section className={cx(opsTheme.panel, "min-w-0 overflow-hidden")}>
              <div className="flex items-center gap-2 border-b border-neutral-1000-a05 px-4 py-3 text-sm font-semibold text-neutral-primary">
                <DatabaseZap className="h-4 w-4" />
                매칭된 답변 예시
              </div>
              {result.matches.length > 0 ? (
                <div className="divide-y divide-neutral-1000-a05">
                  {result.matches.map((match, index) => (
                    <article key={match.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={opsTheme.badge}>#{index + 1}</span>
                          <ScoreBadge score={match.score} />
                          {match.tags.map((tag, tagIndex) => (
                            <span
                              key={`${tag}-${tagIndex}`}
                              className={opsTheme.badge}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <span className="break-all font-mono text-[11px] text-neutral-soft">
                          {match.id}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <div className={cx(opsTheme.panelMuted, "p-3")}>
                          <div className="text-xs font-medium text-neutral-muted">
                            User example
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
                            {match.user_example_text}
                          </div>
                        </div>
                        <div className="px-1">
                          <div className="text-xs font-medium text-neutral-muted">
                            Answer example
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
                            {match.answer_example_text}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[240px] items-center justify-center px-6 text-sm text-neutral-soft">
                  매칭 없음
                </div>
              )}
            </section>
            <PromptOutput value={result.promptBlock} />
          </div>
        </>
      ) : null}
    </DebuggingPageShell>
  );
}

import type { ExternalSearchPreviewResult } from "@/lib/ops/externalSearchPreview";

export const methodLabel = (method: ExternalSearchPreviewResult["method"]) =>
  method === "existing" ? "이전 검색 기록" : "필터·HNSW 검색";
export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}초`;
export function previewCost(result: ExternalSearchPreviewResult) {
  const incomplete =
    (result.modelCallsStarted ?? result.calls.length) > result.calls.length;
  if (!result.calls.length)
    return incomplete ? "확인 불가 (사용량 응답 없음)" : "$0 (모델 호출 없음)";
  const known = result.calls.filter((c) => c.estimatedCostUsd !== null);
  if (!known.length) return "확인 불가";
  return `$${known.reduce((sum, c) => sum + c.estimatedCostUsd!, 0).toFixed(6)}${incomplete || known.length < result.calls.length ? " + 미확인 비용" : " (추정)"}`;
}
const countLabels: Record<string, string> = {
  eligible: "필터 통과",
  embedded: "유효 제목 임베딩",
  missingEmbedding: "임베딩 누락·제목 불일치",
  candidates: "유사도 후보",
  titleNeighbors: "직함 사전 후보",
};
export function ExternalSearchDiagnostics({
  result,
}: {
  result: ExternalSearchPreviewResult;
}) {
  return (
    <section
      aria-label={
        result.action === "prepare" ? "query 생성 기록" : "검색 실행 기록"
      }
      className="space-y-3 text-sm"
    >
      <div className="flex flex-wrap gap-x-6 gap-y-2 tabular-nums">
        <strong>
          {result.action === "prepare"
            ? "Query 생성"
            : methodLabel(result.method)}
        </strong>
        <span>전체 {seconds(result.totalMs)}</span>
        <span>이번 요청 비용 {previewCost(result)}</span>
        <span>제목 임베딩 {result.embeddingReused ? "재사용" : "생성"}</span>
        {result.action === "search" && (
          <span>
            {result.error ? "결과 미수신" : `${result.rows.length}개`} ·{" "}
            {result.method === "filter_first"
              ? `N ${result.candidateLimit.toLocaleString()} · `
              : ""}
            연봉 가중치 {result.salaryWeight}
          </span>
        )}
      </div>
      {result.error && (
        <p role="alert" className="text-critical">
          {result.error}
        </p>
      )}
      {!!Object.keys(result.counts).length && (
        <div className="flex flex-wrap gap-4 tabular-nums">
          {Object.entries(result.counts).map(([key, count]) => (
            <span key={key}>
              {countLabels[key] ?? key} {Number(count).toLocaleString()}개
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          {result.timings.map((step, i) => (
            <div
              key={i}
              className={`flex justify-between gap-4 ${step.scope === "database" ? "pl-4 text-neutral-muted" : ""}`}
            >
              <span>
                {step.label}
                {step.scope === "database" ? " (DB 내부)" : ""}
              </span>
              <span className="whitespace-nowrap tabular-nums">
                {seconds(step.ms)}
                {step.status === "error" ? " · 실패" : ""}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {result.calls.map((call, i) => (
            <div key={i}>
              <div>
                {call.step} · <strong>{call.model}</strong> ·{" "}
                {seconds(call.durationMs ?? 0)}
              </div>
              <div className="text-neutral-muted tabular-nums">
                입력 {call.inputTokens.toLocaleString()} · 출력{" "}
                {call.outputTokens.toLocaleString()} · 캐시 입력{" "}
                {call.cacheReadInputTokens.toLocaleString()} ·{" "}
                {call.estimatedCostUsd === null
                  ? "비용 미확인"
                  : `$${call.estimatedCostUsd.toFixed(6)} (${call.pricingStatus === "provider_reported" ? "제공자 보고" : "추정"})`}
              </div>
            </div>
          ))}
        </div>
      </div>
      {result.rawOutput && (
        <details>
          <summary className="cursor-pointer">LLM 원본 출력</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-bg-weak p-3 text-xs">
            {result.rawOutput}
          </pre>
        </details>
      )}
      {result.sql.map((sql, i) => (
        <details key={i}>
          <summary className="cursor-pointer">{sql.label}</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-bg-weak p-3 text-xs">
            {sql.text}
          </pre>
        </details>
      ))}
      {result.action === "search" && (
        <details>
          <summary className="cursor-pointer">이번 실행 query</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap bg-bg-weak p-3 text-xs">
            {JSON.stringify(result.query, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

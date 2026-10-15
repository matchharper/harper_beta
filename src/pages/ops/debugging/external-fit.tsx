import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  LoaderCircle,
  Play,
  Search,
  X,
} from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  JEV_MODEL,
  MAX_FIT_ROLES,
  fitQuestions,
  type FitOption,
  type FitSearchResult,
  type FitRunResult,
} from "@/lib/ops/externalFitPlayground";

const endpoint = "/api/internal/debug/external-fit";
const panel = "rounded-lg border border-neutral-1000-a10 bg-bg-floating p-5";
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}초`;
const dollars = (cost: number | null) =>
  cost === null ? "확인 불가" : `$${cost.toFixed(8)}`;
const evidenceLabels = {
  sufficient: "충분",
  partial: "일부 부족",
  insufficient: "부족",
};

function SearchPicker({
  kind,
  selected,
  onSelect,
  disabled,
  canFetch,
  talentId,
}: {
  kind: "roles" | "talents";
  selected: FitOption[];
  onSelect: (item: FitOption) => void;
  disabled: boolean;
  canFetch: boolean;
  talentId?: string;
}) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [previousOffsets, setPreviousOffsets] = useState<number[]>([]);
  const [data, setData] = useState<FitSearchResult>({
    items: [],
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!canFetch) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void fetchWithInternalAuth<FitSearchResult>(
        `${endpoint}?${new URLSearchParams({ kind, q: query, offset: String(offset), ...(talentId ? { talentId } : {}) })}`,
        { signal: controller.signal }
      )
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setData({ items: [], hasMore: false });
            setError(
              cause instanceof Error ? cause.message : "검색하지 못했습니다."
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, query, offset, canFetch, talentId]);
  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span className="text-sm text-neutral-muted">
          {kind === "roles"
            ? "회사명 · 직무명 · 지역 검색"
            : "이름 · 이메일 · 경력 검색"}
        </span>
        <Input
          value={query}
          maxLength={120}
          disabled={disabled}
          placeholder={
            kind === "roles"
              ? "어떤 회사, 어떤 역할인가요?"
              : "누구와 비교할까요?"
          }
          onChange={(event) => {
            setLoading(true);
            setQuery(event.target.value);
            setOffset(0);
            setPreviousOffsets([]);
          }}
        />
      </label>
      <div
        aria-busy={loading}
        className="h-64 overflow-y-auto rounded-md border border-neutral-1000-a05"
      >
        {loading ? (
          <div
            role="status"
            className="flex items-center gap-2 p-4 text-sm text-neutral-muted"
          >
            <LoaderCircle className="h-4 w-4 animate-spin" />
            검색 중
          </div>
        ) : error ? (
          <p role="alert" className="p-4 text-sm text-critical">
            {error}
          </p>
        ) : !data.items.length ? (
          <p className="p-4 text-sm text-neutral-muted">
            {kind === "roles" && !query.trim()
              ? talentId
                ? "계산된 외부 Fit이 없습니다."
                : "후보자를 선택하거나 역할을 검색하세요."
              : "검색 결과가 없습니다."}
          </p>
        ) : (
          data.items.map((item) => {
            const checked = selected.some((value) => value.id === item.id);
            return (
              <div
                key={item.id}
                className={`border-b border-neutral-1000-a05 p-3 last:border-0 ${checked ? "bg-primary-faded" : ""}`}
              >
                {kind === "roles" ? (
                  <Checkbox
                    checked={checked}
                    disabled={
                      disabled || (!checked && selected.length >= MAX_FIT_ROLES)
                    }
                    onChange={() => onSelect(item)}
                    label={
                      <span className="block">
                        <span className="block font-medium">{item.title}</span>
                        <span className="block text-xs text-neutral-muted">
                          {item.subtitle} · {item.status}
                        </span>
                        {item.existingFit && (
                          <span className="mt-1 block text-xs text-neutral-muted">
                            <strong className="text-neutral-primary">
                              기존{" "}
                              {item.existingFit.score === null
                                ? "점수 없음"
                                : `${item.existingFit.score}점`}
                            </strong>{" "}
                            ·{" "}
                            {new Date(
                              item.existingFit.checkedAt
                            ).toLocaleString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })}
                          </span>
                        )}
                      </span>
                    }
                  />
                ) : (
                  <MuteButton
                    variant={checked ? "neutral" : "transparent"}
                    className="w-full justify-start text-left"
                    aria-pressed={checked}
                    disabled={disabled}
                    onClick={() => onSelect(item)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {item.title}
                        {checked ? " · 선택됨" : ""}
                      </span>
                      <span className="block truncate text-xs text-neutral-muted">
                        {item.subtitle}
                      </span>
                    </span>
                  </MuteButton>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-muted">
        <span>
          {data.items.length
            ? `${previousOffsets.length * 20 + 1}–${previousOffsets.length * 20 + data.items.length}`
            : "0건"}{" "}
          · 최신순
        </span>
        <div className="flex gap-2">
          <MuteButton
            size="sm"
            disabled={disabled || loading || offset === 0}
            onClick={() => {
              setLoading(true);
              setOffset(previousOffsets.at(-1) ?? 0);
              setPreviousOffsets((current) => current.slice(0, -1));
            }}
          >
            이전
          </MuteButton>
          <MuteButton
            size="sm"
            disabled={disabled || loading || !data.hasMore}
            onClick={() => {
              setLoading(true);
              setPreviousOffsets((current) => [...current, offset]);
              setOffset(data.nextOffset ?? offset + 20);
            }}
          >
            다음
          </MuteButton>
        </div>
      </div>
    </div>
  );
}

function Metric({
  value,
  probability = false,
}: {
  value: number | null;
  probability?: boolean;
}) {
  if (value === null) return <span className="text-neutral-soft">—</span>;
  return (
    <div className="min-w-24">
      <div className="tabular-nums font-semibold">
        {value.toFixed(1)}
        {probability ? "%" : " / 100"}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-weak">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function JsonDetails({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-md border border-neutral-1000-a05">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {title}
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-neutral-1000-a05 p-4 text-xs leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export default function ExternalFitPlaygroundPage() {
  const canFetch = useCanFetchInternal();
  const [roles, setRoles] = useState<FitOption[]>([]);
  const [talent, setTalent] = useState<FitOption | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FitRunResult | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const timer = setInterval(
      () => setElapsed(performance.now() - started),
      100
    );
    return () => clearInterval(timer);
  }, [running]);
  async function run() {
    if (!talent || !roles.length || !canFetch || inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setElapsed(0);
    setError("");
    setResult(null);
    try {
      setResult(
        await fetchWithInternalAuth<FitRunResult>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            talentId: talent.id,
            roleIds: roles.map((role) => role.id),
          }),
        })
      );
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : "실행하지 못했습니다."} 응답이 유실된 경우 비용이 발생했을 수 있습니다. 자동 재실행하지 않습니다.`
      );
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }
  const successful = result?.results.filter((item) => item.answers).length ?? 0;
  const knownCosts =
    result?.results.filter((item) => item.costUsd !== null) ?? [];
  const totalCost = knownCosts.reduce((sum, item) => sum + item.costUsd!, 0);
  const sorted = result
    ? [...result.results].sort(
        (a, b) =>
          (b.answers?.mutualFit.score ?? -1) -
          (a.answers?.mutualFit.score ?? -1)
      )
    : [];
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ ...result, questions: fitQuestions }, null, 2)],
        { type: "application/json" }
      )
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `external-fit-${result.startedAt.replace(/[:.]/g, "-")}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <OpsShell title="External Fit Lab">
      <Head>
        <title>External Fit Lab · Harper Ops</title>
      </Head>
      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-12 text-neutral-primary">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-xl font-semibold">External Fit Lab</h2>
          <ResponsiveLightTooltip
            trigger="지표 해석"
            mobileAriaLabel="지표 해석"
          >
            <div className="space-y-2">
              <p>
                기존 Fit은 저장된 최근 점수입니다. Jev와 평가 시점·입력·척도가
                다를 수 있으며, 기존 점수는 Jev 입력에 포함하지 않습니다.
              </p>
              <p>
                관심 가능성은 Jev의 추정치이며 실제 지원·면접·채용 확률로
                검증되지 않았습니다. 회사 관심은 공개 채용 요건에 근거합니다.
              </p>
              <p>
                상호·직무 적합도는 5단계 평가를 100점으로 환산합니다. 필수조건
                무충돌은 확인된 충돌이 없을 가능성이며, 모든 조건이 확인됐다는
                뜻은 아닙니다.
              </p>
              <p>
                전체 시간에는 데이터 조회와 병렬 실행이 포함됩니다. 모델 응답
                시간은 역할별 요청 왕복 시간입니다. Jev는 설명문을 생성하지
                않습니다.
              </p>
              <p>
                결과는 이 화면에서만 유지됩니다. 새로고침 전에 JSON을 다운로드할
                수 있습니다.
              </p>
            </div>
          </ResponsiveLightTooltip>
          <span className="rounded-md bg-bg-weak px-3 py-2 font-mono text-xs">
            {JEV_MODEL}
          </span>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={panel}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 font-semibold">
                <Search className="h-4 w-4" />
                1. 외부 역할 선택{" "}
              </h3>
              <span className="ml-auto text-sm font-normal text-neutral-muted">
                {roles.length} / {MAX_FIT_ROLES}
              </span>
              {!!roles.length && (
                <MuteButton
                  size="sm"
                  disabled={running}
                  onClick={() => setRoles([])}
                >
                  전체 선택 해제
                </MuteButton>
              )}
            </div>
            <SearchPicker
              key={talent?.id ?? "no-talent"}
              kind="roles"
              talentId={talent?.id}
              selected={roles}
              disabled={running}
              canFetch={canFetch}
              onSelect={(item) =>
                setRoles((current) =>
                  current.some((value) => value.id === item.id)
                    ? current.filter((value) => value.id !== item.id)
                    : current.length < MAX_FIT_ROLES
                      ? [...current, item]
                      : current
                )
              }
            />
          </section>
          <section className={panel}>
            <h3 className="mb-4 font-semibold">2. 후보자 선택</h3>
            <SearchPicker
              kind="talents"
              selected={talent ? [talent] : []}
              disabled={running}
              canFetch={canFetch}
              onSelect={(item) => {
                if (item.id !== talent?.id) {
                  setTalent(item);
                  if (talent) setRoles([]);
                  setResult(null);
                  setError("");
                }
              }}
            />
          </section>
        </div>
        <section className={panel}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">
              {talent?.title ?? "후보자 미선택"}
            </span>
            <ArrowRight className="h-4 w-4 text-neutral-soft" />
            <span className="text-sm text-neutral-muted">
              외부 역할 {roles.length}개
            </span>
            <MuteButton
              className="ml-auto"
              variant="primary"
              size="lg"
              disabled={!canFetch || running || !talent || !roles.length}
              onClick={() => void run()}
            >
              {running ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {running ? `평가 중 · ${seconds(elapsed)}` : "Jev로 실행"}
            </MuteButton>
          </div>
          {!!roles.length && (
            <div className="mt-4 flex flex-wrap gap-2">
              {roles.map((role) => (
                <MuteButton
                  key={role.id}
                  size="sm"
                  disabled={running}
                  aria-label={`${role.title} 선택 해제`}
                  onClick={() =>
                    setRoles((current) =>
                      current.filter((item) => item.id !== role.id)
                    )
                  }
                >
                  {role.subtitle.split(" · ")[0]} · {role.title}
                  <X className="h-3 w-3" />
                </MuteButton>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-neutral-muted">
            후보자의 Profile · Search Brief · Behavior Context를 OpenRouter /
            TypeSafe로 전송합니다. 추천·연락·운영 Fit에는 반영하지 않습니다.
          </p>
          {running && (
            <p role="status" className="mt-3 text-sm text-neutral-muted">
              {roles.length}개 역할 평가 중
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-critical">
              {error}
            </p>
          )}
        </section>
        {result && (
          <section className="space-y-5" aria-label="평가 결과">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {result.talent.title}의 비교 결과
                </h3>
                <p className="mt-1 text-xs text-neutral-muted">
                  {new Date(result.startedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}{" "}
                  KST · 상호 적합도순
                </p>
              </div>
              <MuteButton onClick={download}>
                <Download className="h-4 w-4" />
                결과 JSON 다운로드
              </MuteButton>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["완료", `${successful} / ${result.results.length}개`],
                ["전체 소요 시간", seconds(result.elapsedMs)],
                [
                  "확인된 비용 합계 (USD)",
                  knownCosts.length ? dollars(totalCost) : "확인 불가",
                ],
                [
                  "입력 컨텍스트",
                  `Brief ${result.contextInfo.briefCount}개 · Behavior ${result.contextInfo.behaviorVersion === null ? "없음" : `v${result.contextInfo.behaviorVersion}`}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className={panel}>
                  <p className="text-xs text-neutral-muted">{label}</p>
                  <p className="mt-2 break-words text-lg font-semibold tabular-nums">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            {knownCosts.length !== result.results.length && (
              <p className="text-sm text-neutral-muted">
                {result.results.length - knownCosts.length}건의 비용은 확인되지
                않아 합계에 포함하지 않았습니다.
              </p>
            )}
            {result.contextInfo.warnings.map((warning) => (
              <p key={warning} className="rounded-md bg-info-faded p-3 text-sm">
                {warning}
              </p>
            ))}
            <div className="overflow-x-auto rounded-lg border border-neutral-1000-a10 bg-bg-floating">
              <table className="w-full text-left text-sm">
                <thead className="bg-bg-weak text-xs text-neutral-muted">
                  <tr>
                    {[
                      "회사 · 역할",
                      "기존 Fit",
                      "후보자 → 회사",
                      "회사 → 후보자",
                      "상호 적합도",
                      "직무 적합도",
                      "필수조건 무충돌",
                      "근거",
                      "모델 응답 시간",
                      "비용 (USD)",
                    ].map((label) => (
                      <th
                        key={label}
                        className="whitespace-nowrap px-4 py-3 font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item) => (
                    <tr
                      key={item.role.id}
                      className="border-t border-neutral-1000-a05 align-top"
                    >
                      <td className="min-w-56 px-4 py-4">
                        <a
                          href={`#fit-${item.role.id}`}
                          className="font-medium text-link"
                        >
                          {item.role.title}
                        </a>
                        <p className="mt-1 text-xs text-neutral-muted">
                          {item.role.subtitle} · {item.role.status}
                        </p>
                        {item.error && (
                          <p className="mt-2 text-xs text-critical">
                            {item.error}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <Metric value={item.role.existingFit?.score ?? null} />
                        {item.role.existingFit && (
                          <p className="mt-2 whitespace-nowrap text-xs text-neutral-muted">
                            {new Date(
                              item.role.existingFit.checkedAt
                            ).toLocaleDateString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <Metric
                          value={
                            item.answers
                              ? item.answers.candidateInterest.noul * 100
                              : null
                          }
                          probability
                        />
                      </td>
                      <td className="p-4">
                        <Metric
                          value={
                            item.answers
                              ? item.answers.companyInterest.noul * 100
                              : null
                          }
                          probability
                        />
                      </td>
                      <td className="p-4">
                        <Metric
                          value={
                            item.answers
                              ? item.answers.mutualFit.score * 25
                              : null
                          }
                        />
                      </td>
                      <td className="p-4">
                        <Metric
                          value={
                            item.answers
                              ? item.answers.roleFit.score * 25
                              : null
                          }
                        />
                      </td>
                      <td className="p-4">
                        <Metric
                          value={
                            item.answers
                              ? item.answers.constraintPass.noul * 100
                              : null
                          }
                          probability
                        />
                      </td>
                      <td className="whitespace-nowrap p-4">
                        {item.answers
                          ? evidenceLabels[item.answers.evidence.choice]
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap p-4 tabular-nums">
                        {seconds(item.elapsedMs)}
                      </td>
                      <td className="whitespace-nowrap p-4 tabular-nums">
                        {dollars(item.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <JsonDetails title="평가 질문과 기준" value={fitQuestions} />
            {sorted.map((item) => (
              <article
                id={`fit-${item.role.id}`}
                key={item.role.id}
                className={`${panel} scroll-mt-6 space-y-3`}
              >
                <div>
                  <h4 className="font-semibold">
                    {item.role.subtitle} · {item.role.title}
                  </h4>
                  <p className="mt-1 text-xs text-neutral-muted">
                    {item.resolvedModel ?? result.model} · 입력{" "}
                    {item.inputTokens ?? "미확인"} tokens · 출력{" "}
                    {item.outputTokens ?? "미확인"} tokens ·{" "}
                    {seconds(item.elapsedMs)} · {dollars(item.costUsd)}
                  </p>
                </div>
                <JsonDetails title="실제 모델 입력" value={item.state} />
                <JsonDetails
                  title="원본 출력 · 확률 분포 · 사용량"
                  value={item.raw}
                />
              </article>
            ))}
          </section>
        )}
      </div>
    </OpsShell>
  );
}

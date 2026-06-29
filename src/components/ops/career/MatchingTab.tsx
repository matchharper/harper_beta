import { LoaderCircle } from "lucide-react";
import { FitLabelBadge } from "@/components/ops/matching/MatchingFitLabelControls";
import { cx, opsTheme } from "@/components/ops/theme";
import { Tooltips } from "@/components/ui/tooltip";
import { useOpsMatchingTalentFits } from "@/hooks/ops/useOpsMatching";
import type { OpsMatchingFitItem } from "@/lib/ops/matching";
import { formatKst } from "./utils";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function stringifyCriteria(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return normalizeText(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function buildReasonTooltip(item: OpsMatchingFitItem) {
  const parts = [
    item.reason ? `LLM 이유\n${item.reason}` : "",
    item.humanReason ? `Human 이유\n${item.humanReason}` : "",
  ].filter(Boolean);

  if (parts.length === 0) {
    const criteria = stringifyCriteria(item.reevaluationCriteria);
    if (criteria) parts.push(`평가 기준\n${criteria}`);
  }

  return parts.join("\n\n") || "이유 없음";
}

function MatchingLabelCell({ item }: { item: OpsMatchingFitItem }) {
  if (item.humanLabel) {
    return (
      <div className="flex flex-wrap gap-1">
        <FitLabelBadge label={item.humanLabel} prefix="Human" />
        <FitLabelBadge label={item.label} prefix="LLM" />
      </div>
    );
  }

  return <FitLabelBadge label={item.label} prefix="LLM" />;
}

export function MatchingTab({ userId }: { userId: string }) {
  const { data, error, isLoading } = useOpsMatchingTalentFits(userId);
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={opsTheme.errorNotice}>
        {error instanceof Error
          ? error.message
          : "매칭 평가를 불러오지 못했습니다."}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-neutral-primary">
          Internal fit 평가
        </div>
        <div className="text-xs text-neutral-soft">
          {items.length.toLocaleString("ko-KR")}개
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-10 text-center text-sm text-neutral-soft">
          internal_fit 평가가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-floating">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-xs">
            <thead className="bg-bg-weak text-neutral-muted">
              <tr>
                <th className="w-[170px] px-3 py-2 font-medium">평가날짜</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="w-[180px] px-3 py-2 font-medium">회사</th>
                <th className="w-[80px] px-3 py-2 font-medium">점수</th>
                <th className="w-[220px] px-3 py-2 font-medium">라벨</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-1000-a05">
              {items.map((item) => {
                const evaluatedAt = item.lastEvaluatedAt ?? item.createdAt;
                const roleName = item.role.roleName ?? item.role.roleId ?? "-";
                const companyName = item.role.companyName ?? "-";
                return (
                  <tr
                    key={item.fitId}
                    className="align-top text-neutral-muted transition hover:bg-bg-default"
                  >
                    <td className="px-3 py-3 align-top text-neutral-soft">
                      {formatKst(evaluatedAt)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Tooltips text={buildReasonTooltip(item)} side="top">
                        <span
                          className={cx(
                            "block max-w-full truncate text-neutral-primary",
                            "cursor-help underline decoration-dotted underline-offset-2"
                          )}
                        >
                          {roleName}
                        </span>
                      </Tooltips>
                    </td>
                    <td className="truncate px-3 py-3 align-top">
                      {companyName}
                    </td>
                    <td className="px-3 py-3 align-top font-medium text-neutral-primary">
                      {formatScore(item.score)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <MatchingLabelCell item={item} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

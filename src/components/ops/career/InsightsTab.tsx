import { memo } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { CareerTalentInsightsResponse } from "@/lib/ops/careerServer";

export const InsightsTab = memo(function InsightsTab({
  brief,
  memories,
  preferences,
}: Pick<CareerTalentInsightsResponse, "brief" | "memories" | "preferences">) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <div className="text-[13px] font-medium text-neutral-primary">
            Search Brief
          </div>
          <div className="mt-1 text-xs text-neutral-soft">
            유저에게 보이며 추천과 탐색에 직접 적용되는 현재 기준
          </div>
        </div>
        {brief.length > 0 ? (
          <div className="space-y-2">
            {brief.map((row) => (
              <div
                className={cx(opsTheme.panelSoft, "rounded-md p-3")}
                key={row.id}
              >
                <div className="text-[13px] font-medium text-neutral-muted">
                  {row.label}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-primary">
                  {row.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-neutral-1000-a10 px-4 py-6 text-center text-sm text-neutral-soft">
            저장된 Search Brief가 없습니다.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <div className="text-[13px] font-medium text-neutral-primary">
            Memory
          </div>
          <div className="mt-1 text-xs text-neutral-soft">
            대화와 기회 판단에 필요할 때 꺼내 쓰는 장기 맥락
          </div>
        </div>
        {memories.length > 0 ? (
          <div className="space-y-2">
            {memories.map((row) => (
              <div
                className={cx(opsTheme.panelSoft, "rounded-md p-3")}
                key={row.id}
              >
                <div className="whitespace-pre-wrap text-sm text-neutral-primary">
                  {row.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-neutral-1000-a10 px-4 py-6 text-center text-sm text-neutral-soft">
            저장된 Memory가 없습니다.
          </div>
        )}
      </section>

      {preferences ? (
        <div className="text-xs text-neutral-soft">
          프로필 공개: {preferences.profileVisibility ?? "-"} · 고용 형태:{" "}
          {preferences.engagementTypes.join(", ") || "-"}
        </div>
      ) : null}
    </div>
  );
});

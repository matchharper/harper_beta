import { memo, useCallback, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Save } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { useRefreshInsights, useUpdateInsights } from "@/hooks/useOpsCareer";
import type { CareerTalentDetailResponse } from "@/lib/opsCareerServer";

type InsightsTabProps = {
  insights: Record<string, string> | null;
  mergedChecklist: CareerTalentDetailResponse["mergedChecklist"];
  preferences: CareerTalentDetailResponse["preferences"];
  userId: string;
};

export const InsightsTab = memo(function InsightsTab({
  insights,
  mergedChecklist,
  preferences,
  userId,
}: InsightsTabProps) {
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);

  const refreshInsightsMutation = useRefreshInsights(userId);
  const updateInsightsMutation = useUpdateInsights(userId);

  const emptyCount = useMemo(() => {
    return mergedChecklist.filter((item) => !insights?.[item.key]?.trim())
      .length;
  }, [mergedChecklist, insights]);

  const hasChanges = useMemo(() => {
    return Object.entries(editedValues).some(
      ([key, val]) => val !== (insights?.[key] ?? "")
    );
  }, [editedValues, insights]);

  const handleEditChange = useCallback((key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditedValues({});
  }, []);

  const handleSave = useCallback(() => {
    if (!hasChanges) return;
    const updates: Record<string, string> = {};
    for (const [key, val] of Object.entries(editedValues)) {
      if (val !== (insights?.[key] ?? "")) {
        updates[key] = val;
      }
    }
    if (Object.keys(updates).length === 0) return;
    updateInsightsMutation.mutate(updates, {
      onSuccess: () => {
        setIsEditing(false);
        setEditedValues({});
      },
    });
  }, [editedValues, hasChanges, insights, updateInsightsMutation]);

  const handleRefresh = useCallback(() => {
    if (
      !window.confirm(
        `빈 인사이트 항목 ${emptyCount}개를 LLM으로 추출합니다. 기존 값은 변경되지 않습니다.`
      )
    ) {
      return;
    }
    refreshInsightsMutation.mutate();
  }, [emptyCount, refreshInsightsMutation]);

  return (
    <div className="space-y-4">
      {preferences ? (
        <div className={cx(opsTheme.panelSoft, "p-4")}>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>선호 설정</div>
          <div className="space-y-1.5 font-geist text-sm text-beige900/80">
            {preferences.engagementTypes.length > 0 ? (
              <div>
                <span className="text-beige900/45">근무 형태:</span>{" "}
                {preferences.engagementTypes.join(", ")}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className={opsTheme.eyebrow}>인사이트</div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={cancelEditing}
                className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || updateInsightsMutation.isPending}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-3 text-xs flex items-center gap-1.5",
                  (!hasChanges || updateInsightsMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {updateInsightsMutation.isPending ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    저장
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
              >
                편집
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={emptyCount === 0 || refreshInsightsMutation.isPending}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-3 text-xs flex items-center gap-1.5",
                  (emptyCount === 0 || refreshInsightsMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {refreshInsightsMutation.isPending ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    추출 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />빈 항목 {emptyCount}개
                    추출
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {mergedChecklist.map((item) => {
          const savedValue = insights?.[item.key] ?? "";
          const displayValue = isEditing
            ? (editedValues[item.key] ?? savedValue)
            : savedValue.trim();
          const isFilled = Boolean(savedValue.trim());
          return (
            <div
              key={item.key}
              className={cx(
                "p-3 rounded-md",
                isFilled
                  ? cx(opsTheme.panelSoft)
                  : "border border-dashed border-beige900/20 bg-white/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className={opsTheme.eyebrow}>{item.label}</div>
                </div>
              </div>
              {isEditing ? (
                <textarea
                  value={displayValue}
                  onChange={(event) =>
                    handleEditChange(item.key, event.target.value)
                  }
                  rows={2}
                  className={cx(
                    opsTheme.input,
                    "mt-1 w-full text-sm font-geist resize-y min-h-10"
                  )}
                  placeholder="값을 입력하세요..."
                />
              ) : isFilled ? (
                <div className="mt-1 whitespace-pre-wrap font-geist text-sm text-beige900/80">
                  {displayValue}
                </div>
              ) : (
                <div className="mt-1 font-geist text-sm text-beige900/30 italic">
                  미입력
                </div>
              )}
            </div>
          );
        })}
        {mergedChecklist.length === 0 ? (
          <div className="rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
            추출된 인사이트가 없습니다.
          </div>
        ) : null}
      </div>
    </div>
  );
});

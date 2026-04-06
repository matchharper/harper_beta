import { RefreshCcw, Save } from "lucide-react";
import { useMemo } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  CareerField,
  CareerPrimaryButton,
  CareerSecondaryButton,
  CareerSectionHeader,
  CareerTextarea,
} from "./ui/CareerPrimitives";

const formatInsightLabel = (key: string) =>
  key
    .split("_")
    .filter(Boolean)
    .map((segment, index) =>
      index === 0
        ? segment.charAt(0).toUpperCase() + segment.slice(1)
        : segment
    )
    .join(" ");

const CareerHarperInsightsSection = () => {
  const {
    talentInsights,
    talentInsightsSavePending,
    talentInsightsSaveError,
    talentInsightsSaveInfo,
    hasUnsavedTalentInsightsChanges,
    onTalentInsightsChange,
    onSaveTalentInsights,
    onResetTalentInsights,
  } = useCareerSidebarContext();

  const insightEntries = useMemo(
    () =>
      Object.entries(talentInsights ?? {}).sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    [talentInsights]
  );

  if (!talentInsights) {
    return (
      <div>
        <CareerSectionHeader title="Harper's insight" />
      </div>
    );
  }

  return (
    <div>
      <div>
        {insightEntries.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-beige900/15 bg-white/30 px-4 py-3 text-sm text-beige900/45">
            아직 저장된 Harper insight key가 없습니다.
          </div>
        ) : (
          insightEntries.map(([key, value]) => (
            <CareerField
              key={key}
              label={formatInsightLabel(key)}
              hint={key}
            >
              <CareerTextarea
                rows={Math.max(4, Math.min(8, Math.ceil((value.length || 1) / 120)))}
                value={value}
                onChange={(event) =>
                  onTalentInsightsChange((current) => ({
                    ...(current ?? {}),
                    [key]: event.target.value,
                  }))
                }
                placeholder={`${key} 값을 편집합니다.`}
              />
            </CareerField>
          ))
        )}
      </div>

      {talentInsightsSaveError ? (
        <div className="mt-5 border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
          {talentInsightsSaveError}
        </div>
      ) : null}

      {talentInsightsSaveInfo ? (
        <div className="mt-5 border border-beige900/10 bg-white/40 px-4 py-3 text-sm text-beige900/50">
          {talentInsightsSaveInfo}
        </div>
      ) : null}

      {hasUnsavedTalentInsightsChanges ? (
        <div className="mt-6 flex justify-end gap-2">
          <CareerSecondaryButton
            onClick={onResetTalentInsights}
            disabled={talentInsightsSavePending}
            className="gap-2 px-4"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </CareerSecondaryButton>
          <CareerPrimaryButton
            onClick={() => void onSaveTalentInsights()}
            disabled={talentInsightsSavePending}
            className="gap-2 px-5"
          >
            <Save className="h-4 w-4" />
            {talentInsightsSavePending ? "저장 중..." : "Insight 저장"}
          </CareerPrimaryButton>
        </div>
      ) : null}
    </div>
  );
};

export default CareerHarperInsightsSection;

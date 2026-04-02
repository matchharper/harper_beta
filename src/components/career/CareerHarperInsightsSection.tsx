import { Save } from "lucide-react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  CareerField,
  CareerPrimaryButton,
  CareerSectionHeader,
  CareerSurface,
  CareerTextarea,
} from "./ui/CareerPrimitives";

const CareerHarperInsightsSection = () => {
  const {
    talentPreferences,
    talentPreferencesSavePending,
    talentPreferencesSaveError,
    talentPreferencesSaveInfo,
    onTalentPreferencesChange,
    onSaveTalentPreferences,
  } = useCareerSidebarContext();

  if (!talentPreferences) {
    return (
      <CareerSurface>
        <CareerSectionHeader title="Harper's insight" />
      </CareerSurface>
    );
  }

  return (
    <CareerSurface>
      <CareerSectionHeader title="Harper's insight" />

      <div className="mt-5">
        <CareerField label="기술적 장점">
          <CareerTextarea
            rows={5}
            value={talentPreferences.technicalStrengths ?? ""}
            onChange={(event) =>
              onTalentPreferencesChange((current) =>
                current
                  ? {
                      ...current,
                      technicalStrengths: event.target.value,
                    }
                  : current
              )
            }
            placeholder="기술적 강점을 정리합니다."
          />
        </CareerField>

        <CareerField label="원하는 팀">
          <CareerTextarea
            rows={4}
            value={talentPreferences.desiredTeams ?? ""}
            onChange={(event) =>
              onTalentPreferencesChange((current) =>
                current
                  ? {
                      ...current,
                      desiredTeams: event.target.value,
                    }
                  : current
              )
            }
            placeholder="관심 있는 회사, 팀, 혹은 선호 방향을 정리합니다."
          />
        </CareerField>
      </div>

      {talentPreferencesSaveError ? (
        <div className="mt-5 border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
          {talentPreferencesSaveError}
        </div>
      ) : null}

      {talentPreferencesSaveInfo ? (
        <div className="mt-5 border border-beige900/10 bg-white/40 px-4 py-3 text-sm text-beige900/50">
          {talentPreferencesSaveInfo}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <CareerPrimaryButton
          onClick={() => void onSaveTalentPreferences()}
          disabled={talentPreferencesSavePending}
          className="gap-2 px-5"
        >
          <Save className="h-4 w-4" />
          {talentPreferencesSavePending ? "저장 중..." : "Insight 저장"}
        </CareerPrimaryButton>
      </div>
    </CareerSurface>
  );
};

export default CareerHarperInsightsSection;

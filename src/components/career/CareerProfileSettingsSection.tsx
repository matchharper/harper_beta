import { Save } from "lucide-react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  TALENT_NETWORK_CAREER_MOVE_INTENT_OPTIONS,
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  TALENT_NETWORK_LOCATION_OPTIONS,
  TALENT_NETWORK_PROFILE_INPUT_OPTIONS,
} from "@/lib/talentNetworkApplication";
import {
  CareerField,
  CareerPrimaryButton,
  CareerTextInput,
  CareerToggleButton,
  careerCx,
} from "./ui/CareerPrimitives";

const CareerProfileSettingsSection = () => {
  const {
    networkApplication,
    talentPreferences,
    networkApplicationSavePending,
    networkApplicationSaveError,
    networkApplicationSaveInfo,
    talentPreferencesSavePending,
    talentPreferencesSaveError,
    talentPreferencesSaveInfo,
    onNetworkApplicationChange,
    onTalentPreferencesChange,
    onSaveNetworkApplication,
    onSaveTalentPreferences,
  } = useCareerSidebarContext();

  if (!networkApplication && !talentPreferences) {
    return null;
  }

  const isSavePending =
    networkApplicationSavePending || talentPreferencesSavePending;
  const saveError = networkApplicationSaveError || talentPreferencesSaveError;
  const saveInfo = networkApplicationSaveInfo || talentPreferencesSaveInfo;

  const handleSave = async () => {
    const tasks: Array<Promise<boolean>> = [];

    if (networkApplication) {
      tasks.push(Promise.resolve(onSaveNetworkApplication()));
    }
    if (talentPreferences) {
      tasks.push(Promise.resolve(onSaveTalentPreferences()));
    }

    if (tasks.length === 0) return;
    await Promise.all(tasks);
  };

  return (
    <div className="font-geist">
      <div className="mt-5">
        {networkApplication && (
          <CareerField label="원하는 역할">
            <CareerTextInput
              value={networkApplication.selectedRole ?? ""}
              onChange={(event) =>
                onNetworkApplicationChange((current) =>
                  current
                    ? {
                        ...current,
                        selectedRole: event.target.value,
                      }
                    : current
                )
              }
              placeholder="예: Applied AI Engineer"
            />
          </CareerField>
        )}

        {networkApplication && (
          <CareerField label="프로필 자료">
            <div className="flex flex-wrap gap-2">
              {TALENT_NETWORK_PROFILE_INPUT_OPTIONS.map((option) => {
                const active = networkApplication.profileInputTypes.includes(
                  option.id
                );

                return (
                  <CareerToggleButton
                    key={option.id}
                    active={active}
                    onClick={() =>
                      onNetworkApplicationChange((current) =>
                        current
                          ? {
                              ...current,
                              profileInputTypes: active
                                ? current.profileInputTypes.filter(
                                    (item) => item !== option.id
                                  )
                                : [...current.profileInputTypes, option.id],
                            }
                          : current
                      )
                    }
                  >
                    {option.label}
                  </CareerToggleButton>
                );
              })}
            </div>
          </CareerField>
        )}

        {talentPreferences && (
          <CareerField label="선호하는 형태">
            <div className="flex flex-wrap gap-2">
              {TALENT_NETWORK_ENGAGEMENT_OPTIONS.map((option) => {
                const active = talentPreferences.engagementTypes.includes(
                  option.id
                );

                return (
                  <CareerToggleButton
                    key={option.id}
                    active={active}
                    onClick={() =>
                      onTalentPreferencesChange((current) =>
                        current
                          ? {
                              ...current,
                              engagementTypes: active
                                ? current.engagementTypes.filter(
                                    (item) => item !== option.id
                                  )
                                : [...current.engagementTypes, option.id],
                            }
                          : current
                      )
                    }
                  >
                    {option.label}
                  </CareerToggleButton>
                );
              })}
            </div>
          </CareerField>
        )}

        {talentPreferences && (
          <CareerField label="선호 지역">
            <div className="flex flex-wrap gap-2">
              {TALENT_NETWORK_LOCATION_OPTIONS.map((option) => {
                const active = talentPreferences.preferredLocations.includes(
                  option.id
                );

                return (
                  <CareerToggleButton
                    key={option.id}
                    active={active}
                    onClick={() =>
                      onTalentPreferencesChange((current) =>
                        current
                          ? {
                              ...current,
                              preferredLocations: active
                                ? current.preferredLocations.filter(
                                    (item) => item !== option.id
                                  )
                                : [...current.preferredLocations, option.id],
                            }
                          : current
                      )
                    }
                  >
                    {option.label}
                  </CareerToggleButton>
                );
              })}
            </div>
          </CareerField>
        )}

        {talentPreferences && (
          <CareerField label="이직 의향">
            <div className="space-y-2">
              {TALENT_NETWORK_CAREER_MOVE_INTENT_OPTIONS.map((option) => {
                const active = talentPreferences.careerMoveIntent === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      onTalentPreferencesChange((current) =>
                        current
                          ? {
                              ...current,
                              careerMoveIntent: option.id,
                              careerMoveIntentLabel: option.label,
                            }
                          : current
                      )
                    }
                    className={careerCx(
                      "w-full rounded-[8px] border px-4 py-3 text-left text-[14px] leading-6 transition-colors",
                      active
                        ? "border-beige900 bg-beige900 text-[#f5ecdd]"
                        : "border-beige900/10 bg-white/45 text-beige900/70 hover:border-beige900/30 hover:text-beige900"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </CareerField>
        )}
      </div>

      {saveError && (
        <div className="mt-5 border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
          {saveError}
        </div>
      )}

      {saveInfo && (
        <div className="mt-5 border border-beige900/10 bg-white/40 px-4 py-3 text-sm text-beige900/50">
          {saveInfo}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <CareerPrimaryButton
          onClick={() => void handleSave()}
          disabled={isSavePending}
          className="gap-2 px-5"
        >
          <Save className="h-4 w-4" />
          {isSavePending ? "저장 중..." : "설정 저장"}
        </CareerPrimaryButton>
      </div>
    </div>
  );
};

export default CareerProfileSettingsSection;

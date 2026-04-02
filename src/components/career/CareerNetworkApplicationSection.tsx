import { ExternalLink, Save } from "lucide-react";
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
  CareerSectionHeader,
  CareerSurface,
  CareerTextInput,
  CareerTextarea,
  CareerToggleButton,
  careerCx,
} from "./ui/CareerPrimitives";
import CareerLinkInputRow from "./ui/CareerLinkInputRow";

const LINK_FIELDS = [
  {
    key: "linkedinProfileUrl" as const,
    inputType: "linkedin" as const,
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/username",
  },
  {
    key: "githubProfileUrl" as const,
    inputType: "github" as const,
    label: "GitHub / Hugging Face",
    placeholder: "https://github.com/username",
  },
  {
    key: "scholarProfileUrl" as const,
    inputType: "scholar" as const,
    label: "Google Scholar",
    placeholder: "https://scholar.google.com/citations?user=",
  },
  {
    key: "personalWebsiteUrl" as const,
    inputType: "website" as const,
    label: "Personal Homepage",
    placeholder: "https://yourname.com",
  },
];

const CareerNetworkApplicationSection = () => {
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
    return (
      <CareerSurface>
        <CareerSectionHeader title="프로필 설정" />
      </CareerSurface>
    );
  }

  const isSavePending =
    networkApplicationSavePending || talentPreferencesSavePending;
  const saveError = talentPreferencesSaveError || networkApplicationSaveError;
  const saveInfo = talentPreferencesSaveInfo || networkApplicationSaveInfo;

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
    <CareerSurface>
      <CareerSectionHeader title="프로필 설정" />

      <div className="mt-5">
        {networkApplication ? (
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
        ) : null}

        {networkApplication ? (
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
        ) : null}

        {networkApplication ? (
          <CareerField label="링크">
            <div className="space-y-3">
              {LINK_FIELDS.filter((field) =>
                networkApplication.profileInputTypes.includes(field.inputType)
              ).map((field) => (
                <CareerLinkInputRow
                  key={field.key}
                  label={field.label}
                  value={networkApplication[field.key] ?? ""}
                  onChange={(event) =>
                    onNetworkApplicationChange((current) =>
                      current
                        ? {
                            ...current,
                            [field.key]: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder={field.placeholder}
                  trailing={
                    networkApplication[field.key] ? (
                      <a
                        href={networkApplication[field.key] ?? ""}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[8px] border border-beige900/15 bg-white/45 text-beige900/70 transition-colors hover:border-beige900/30 hover:text-beige900"
                        aria-label={`${field.label} 열기`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null
                  }
                />
              ))}
            </div>
          </CareerField>
        ) : null}

        {talentPreferences ? (
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
              placeholder="본인의 기술적 강점과 강하게 드러내고 싶은 내용을 적어주세요."
            />
          </CareerField>
        ) : null}

        {talentPreferences ? (
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
        ) : null}

        {talentPreferences ? (
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
        ) : null}

        {talentPreferences ? (
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
                      "w-full border px-4 py-3 text-left text-[15px] leading-7 transition-colors",
                      active
                        ? "border-beige900 bg-beige900 text-[#f5ecdd]"
                        : "border-beige900/10 bg-white/30 text-beige900/70 hover:border-beige900/30 hover:text-beige900"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </CareerField>
        ) : null}

        {talentPreferences ? (
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
              placeholder="관심 있는 회사, 팀, 또는 선호하는 방향을 적어주세요."
            />
          </CareerField>
        ) : null}
      </div>

      {saveError ? (
        <div className="mt-5 border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
          {saveError}
        </div>
      ) : null}

      {saveInfo ? (
        <div className="mt-5 border border-beige900/10 bg-white/40 px-4 py-3 text-sm text-beige900/50">
          {saveInfo}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <CareerPrimaryButton
          onClick={() => void handleSave()}
          disabled={isSavePending}
          className="gap-2 px-5"
        >
          <Save className="h-4 w-4" />
          {isSavePending ? "저장 중..." : "프로필 설정 저장"}
        </CareerPrimaryButton>
      </div>
    </CareerSurface>
  );
};

export default CareerNetworkApplicationSection;

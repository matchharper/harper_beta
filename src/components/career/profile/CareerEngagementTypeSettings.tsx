import { useState } from "react";
import { Loader2 } from "lucide-react";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import type { CareerEngagementType } from "@/hooks/career/useCareerTalentSettings";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerProfileContext } from "../CareerSidebarContext";

export default function CareerEngagementTypeSettings() {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const {
    engagementTypes,
    settingsLoading,
    settingsSaving,
    onEngagementTypesChange,
  } = useCareerProfileContext();
  const [savePending, setSavePending] = useState(false);
  const disabled = settingsLoading || settingsSaving || savePending;
  const options = [
    {
      value: "full_time",
      label: t("career.profile.engagement.full_time", "풀타임"),
    },
    {
      value: "fractional",
      label: t("career.profile.engagement.fractional", "파트타임·프로젝트"),
    },
    {
      value: "advisor",
      label: t("career.profile.engagement.advisor", "어드바이저"),
    },
  ] satisfies { value: CareerEngagementType; label: string }[];

  const handleChange = async (values: CareerEngagementType[]) => {
    if (disabled) return;
    const changed = options.find(
      ({ value }) => values.includes(value) !== engagementTypes.includes(value)
    );
    if (changed)
      logCareerEvent(`click_profile_settings_engagement_type_${changed.value}`);
    setSavePending(true);
    try {
      await onEngagementTypesChange(values);
    } finally {
      setSavePending(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2" aria-busy={savePending}>
      <TabBoxes<CareerEngagementType>
        aria-label={t(
          "career.profile.career_profile_settings_section.engagement_types_label",
          "근무 형태"
        )}
        className="overflow-visible"
        listClassName="min-w-0 flex-wrap"
        selectionMode="multiple"
        activeValues={engagementTypes}
        items={options.map((option) => ({ ...option, disabled }))}
        onValueChange={(values) => void handleChange(values)}
        variant="neutral"
        size="sm"
      />
      {savePending ? (
        <Loader2
          aria-hidden
          className="size-3.5 shrink-0 animate-spin text-neutral-muted"
        />
      ) : null}
    </div>
  );
}

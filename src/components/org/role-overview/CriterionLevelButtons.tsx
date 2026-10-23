import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  criterionLevel,
  criterionLevelFields,
  ORG_ROLE_CRITERION_LEVELS,
  type OrgRoleCriterion,
} from "@/lib/org/roleCriteria";
import { RoleToggleButton } from "./RoleOverviewShared";

/** 있으면 좋음 · 중요 · 필수 for one criterion; onChange gets the stored fields. */
export function CriterionLevelButtons({
  criterion,
  disabled,
  onChange,
}: {
  criterion: Pick<OrgRoleCriterion, "importance" | "requirement">;
  disabled?: boolean;
  onChange: (fields: Pick<OrgRoleCriterion, "importance" | "requirement">) => void;
}) {
  const { c } = useOrgLocale();
  const current = criterionLevel(criterion);
  return (
    <>
      {ORG_ROLE_CRITERION_LEVELS.map(({ level, ko, en }) => (
        <RoleToggleButton
          active={current === level}
          disabled={disabled}
          key={level}
          onClick={() => onChange(criterionLevelFields(level))}
        >
          {c(ko, en)}
        </RoleToggleButton>
      ))}
    </>
  );
}

import { useOrgSourceT, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { StatusDot, type StatusDotProps } from "@/components/ui/status-dot";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";

type OrgRoleStatusDotProps = Omit<StatusDotProps, "label" | "tone"> & {
  decorative?: boolean;
  status: unknown;
};

export function OrgRoleStatusDot({
  decorative = false,
  status,
  ...props
}: OrgRoleStatusDotProps) {
  const t = useOrgT();
  const sourceT = useOrgSourceT();
  const presentation = getOrgRoleStatusPresentation(status);

  return (
    <StatusDot
      label={
        decorative
          ? undefined
          : t("OrgRoleStatusDot.7dc173ba", "역할 상태: {p0}", {
              p0: sourceT(presentation.label),
            })
      }
      tone={presentation.tone}
      {...props}
    />
  );
}

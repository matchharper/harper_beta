import { useOrgSourceT, useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
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
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const presentation = getOrgRoleStatusPresentation(status);

  return (
    <StatusDot
      label={
        decorative
          ? undefined
          : c("역할 상태: {p0}", "Role status: {p0}", {
              p0: sourceT(presentation.label),
            })
      }
      tone={presentation.tone}
      {...props}
    />
  );
}

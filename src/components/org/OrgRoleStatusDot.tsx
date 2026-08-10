import {
  StatusDot,
  type StatusDotProps,
} from "@/components/ui/status-dot";
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
  const presentation = getOrgRoleStatusPresentation(status);

  return (
    <StatusDot
      label={decorative ? undefined : `역할 상태: ${presentation.label}`}
      tone={presentation.tone}
      {...props}
    />
  );
}

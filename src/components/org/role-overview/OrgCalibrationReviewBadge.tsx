import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { Badge } from "@/components/ui/badge";
import type { CompanyRoleCalibrationReviewStatus } from "@/lib/org/roleCalibration";

export function OrgCalibrationReviewBadge({
  status,
}: {
  status: CompanyRoleCalibrationReviewStatus;
}) {
  const t = useOrgT();
  return (
    <Badge
      radius="full"
      size="sm"
      tone={
        status === "good"
          ? "positive"
          : status === "bad"
            ? "critical"
            : "neutral"
      }
      variant="faded"
    >
      {status === "good"
        ? "Good"
        : status === "bad"
          ? "Bad"
          : t("role.overview.OrgCalibrationReviewBadge.75a7bf62", "미평가")}
    </Badge>
  );
}

import { Badge } from "@/components/ui/badge";
import type { CompanyRoleCalibrationReviewStatus } from "@/lib/org/roleCalibration";

export function OrgCalibrationReviewBadge({
  status,
}: {
  status: CompanyRoleCalibrationReviewStatus;
}) {
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
      {status === "good" ? "Good" : status === "bad" ? "Bad" : "미평가"}
    </Badge>
  );
}

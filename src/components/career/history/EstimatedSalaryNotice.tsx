import type { CareerHistoryOpportunity } from "../types";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatEstimatedAnnualSalary } from "@/lib/career/estimatedSalary";
import { cn } from "@/lib/utils";

export default function EstimatedSalaryNotice({
  item,
  className,
}: {
  item: CareerHistoryOpportunity;
  className?: string;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  if (!item.estimatedAnnualSalary) return null;

  return (
    <div className={cn("space-y-1 text-[13px] leading-6", className)}>
      <p className="font-medium text-neutral-primary">
        {t("career.history.estimated_salary.heading", "추정 연봉")}{" "}
        {formatEstimatedAnnualSalary(item.estimatedAnnualSalary, locale)}
      </p>
      <p className="text-neutral-muted">
        {t(
          "career.history.estimated_salary.disclaimer",
          "Harper가 추정한 연봉으로, 정확하지 않을 수 있으며 회사가 제시하는 실제 연봉과 다를 수 있습니다."
        )}
      </p>
    </div>
  );
}

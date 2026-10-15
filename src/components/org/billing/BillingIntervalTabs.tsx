import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { BillingInterval } from "@/lib/org/billing/types";

export function BillingIntervalTabs({
  value,
  onChange,
  disabled = false,
  annualDiscountLabel,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  disabled?: boolean;
  annualDiscountLabel?: string;
}) {
  const { c } = useOrgLocale();
  return (
    <Tabs
      aria-label={c("결제 주기", "Billing period")}
      variant="pills"
      size="small"
      className="w-fit rounded-md"
      activeValue={value}
      onValueChange={(next) => onChange(next as BillingInterval)}
      items={[
        {
          value: "month",
          label: c("월간 결제", "Monthly"),
          disabled,
        },
        {
          value: "year",
          label: (
            <span className="inline-flex items-center gap-1.5">
              {c("연간 결제", "Yearly")}
              {annualDiscountLabel && (
                <Badge size="sm" tone="neutral">
                  {annualDiscountLabel}
                </Badge>
              )}
            </span>
          ),
          disabled,
        },
      ]}
    />
  );
}

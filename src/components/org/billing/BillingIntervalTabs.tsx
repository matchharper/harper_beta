import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { BillingInterval } from "@/lib/org/billing/types";

export function BillingIntervalTabs({
  locale,
  value,
  onChange,
  disabled = false,
  annualDiscountLabel,
}: {
  locale: "ko" | "en";
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  disabled?: boolean;
  annualDiscountLabel?: string;
}) {
  return (
    <Tabs
      aria-label={locale === "ko" ? "결제 주기" : "Billing period"}
      variant="pills"
      size="small"
      className="w-fit rounded-md"
      activeValue={value}
      onValueChange={(next) => onChange(next as BillingInterval)}
      items={[
        {
          value: "month",
          label: locale === "ko" ? "월간 결제" : "Monthly",
          disabled,
        },
        {
          value: "year",
          label: (
            <span className="inline-flex items-center gap-1.5">
              {locale === "ko" ? "연간 결제" : "Yearly"}
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

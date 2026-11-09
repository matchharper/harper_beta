import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { cn } from "@/lib/utils";

/**
 * 「Harper가 확인 중 N명」: people Harper is still checking for this Role.
 * Only the number reaches the company; hidden at 0.
 */
export function OrgReviewingLine({
  className,
  count,
}: {
  className?: string;
  count?: number | null;
}) {
  const { c } = useOrgLocale();
  if (!count) return null;
  return (
    <p className={cn("text-[13px] leading-5 text-neutral-muted", className)}>
      {c(
        "{p0} {n}명",
        count === 1 ? "{p0} {n} candidate" : "{p0} {n} candidates",
        { p0: ct(c, COMPANY_TERMS.stage.accepted), n: count }
      )}
    </p>
  );
}

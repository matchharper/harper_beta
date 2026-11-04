import type { HTMLAttributes } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/utils";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { CompanyLogo } from "../watchlist/CompanyLogo";

type Props = HTMLAttributes<HTMLDivElement> & {
  companyName: string | null;
  companyLogoUrl?: string | null;
  title: string;
  location?: string | null;
  postedAt?: string | null;
  statusLabel?: string;
  active?: boolean;
};

export default function OpportunityResultRow({
  companyName,
  companyLogoUrl,
  title,
  location,
  postedAt,
  statusLabel,
  active = false,
  className,
  onClick,
  ...props
}: Props) {
  const t = useCareerT();
  const { locale } = useMessages();
  const postedAgo = formatRelativeTime(postedAt, locale);
  return (
    <div
      {...props}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-3",
        onClick && "cursor-pointer hover:bg-bg-weak",
        active && "bg-bg-weak",
        className
      )}
    >
      <CompanyLogo logoUrl={companyLogoUrl ?? null} name={companyName ?? ""} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] text-neutral-muted">{companyName}</div>
        <div className="truncate text-[14px] font-medium text-neutral-primary">{title}</div>
        {statusLabel || location || postedAgo ? (
          <div className="mt-1 flex gap-2 text-[11px] text-neutral-soft">
            {statusLabel ? <span className="shrink-0">{statusLabel}</span> : null}
            {location ? <span className="truncate">{statusLabel ? "· " : ""}{location}</span> : null}
            {postedAt && postedAgo ? (
              <time
                dateTime={postedAt}
                title={new Date(postedAt).toLocaleDateString(locale)}
                className="shrink-0"
              >
                {statusLabel || location ? "· " : ""}
                {t("career.history.posting.posted_ago", "{postedAgo}에 게시됨", {
                  values: { postedAgo },
                })}
              </time>
            ) : null}
          </div>
        ) : null}
      </div>
      {onClick ? (
        <ArrowUpRight
          aria-hidden
          className={cn("size-4 shrink-0 text-neutral-muted", !active && "opacity-0 group-hover:opacity-100")}
        />
      ) : null}
    </div>
  );
}

import { UserRound } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { cn } from "@/lib/utils";

export function OrgTalentReferenceBadge({
  label,
  talentId,
  href,
  onClick,
  className,
}: {
  className?: string;
  label?: string | null;
  talentId: string;
  href: string;
  onClick: () => void;
}) {
  const { c } = useOrgLocale();
  const name = label && label !== talentId ? label : c("후보자", "Candidate");
  return (
    <a
      href={href}
      title={c("{p0} 프로필 열기", "Open {p0}'s profile", { p0: name })}
      data-talent-reference={talentId}
      className={cn(
        badgeVariants({ variant: "outline", size: "lg", radius: "full" }),
        "bg-neutral-200 font-normal mb-0.5 py-1 border-none mx-0.5 align-middle hover:bg-bg-weak",
        className
      )}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        onClick();
      }}
    >
      <UserRound aria-hidden />
      <span>{name}</span>
    </a>
  );
}

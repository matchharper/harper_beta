import { BookmarkCheck, Check, Loader2, Plus } from "lucide-react";
import type { MouseEvent } from "react";
import { ActionButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

export const FollowButton = ({
  disabled,
  following,
  onClick,
}: {
  disabled: boolean;
  following: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) => {
  const t = useCareerT();

  return (
    <ActionButton
      actionVariant="secondary"
      active={following}
      buttonRadius="rounded"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 shrink-0 px-2 text-[12px]",
        following
          ? "bg-bg-weak text-neutral-muted border-none"
          : "bg-black text-neutral-00"
      )}
    >
      {disabled ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : following ? (
        <Check className="h-3 w-3" />
      ) : (
        <Plus className="h-3 w-3" />
      )}
      <span>
        {following
          ? t("career.company.follow_button.19dhowc", "팔로잉")
          : t("career.company.follow_button.1p6sttz", "팔로우")}
      </span>
    </ActionButton>
  );
};

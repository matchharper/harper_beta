import { BookmarkCheck, Check, Loader2, Plus } from "lucide-react";
import type { MouseEvent } from "react";
import { CareerActionButton } from "@/components/career/ui/CareerActionButton";
import { cn } from "@/lib/utils";

export const FollowButton = ({
  disabled,
  following,
  onClick,
}: {
  disabled: boolean;
  following: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) => (
  <CareerActionButton
    actionVariant="secondary"
    active={following}
    buttonRadius="rounded"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "h-7 shrink-0 px-2 text-[12px]",
      following
        ? "bg-beige200 text-beige700 border-none"
        : "bg-beige900 text-beige50"
    )}
  >
    {disabled ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : following ? (
      <Check className="h-3 w-3" />
    ) : (
      <Plus className="h-3 w-3" />
    )}
    <span>{following ? "팔로잉" : "팔로우"}</span>
  </CareerActionButton>
);

import { CardButton, type CardButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OrgHomeListItemProps = Omit<CardButtonProps, "aria-current">;

/** Shared selection surface for Home inbox queues and feed role filters. */
export function OrgHomeListItem({
  selected = false,
  className,
  ...props
}: OrgHomeListItemProps) {
  return (
    <CardButton
      {...props}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "mb-1 flex w-full items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2 py-2 text-left text-[13px] font-normal text-neutral-800 shadow-none transition hover:bg-black/6",
        selected && "bg-black/4 ring-2 ring-black/8",
        className
      )}
    />
  );
}

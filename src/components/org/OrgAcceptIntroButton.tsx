import { type ComponentProps } from "react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { cn } from "@/lib/utils";

/** The existing candidate card's Connect action, shared with inline review. */
export function OrgAcceptIntroButton({
  className,
  shortcut = false,
  ...props
}: Omit<ComponentProps<typeof MuteButton>, "children" | "variant"> & {
  shortcut?: boolean;
}) {
  const { c } = useOrgLocale();
  return (
    <MuteButton
      {...props}
      variant="dark"
      aria-keyshortcuts={shortcut ? "r" : undefined}
      className={cn(
        "bg-positive-strong text-on-inverse border-positive-strong hover:bg-positive-strong",
        className
      )}
    >
      {ct(c, COMPANY_TERMS.action.connect)}
      {shortcut && (
        <kbd
          aria-hidden
          className="ml-2 hidden text-xs opacity-50 @min-[500px]/review:inline"
        >
          R
        </kbd>
      )}
    </MuteButton>
  );
}

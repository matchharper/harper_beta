import {
  ArrowDownWideNarrow,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgCandidateSort } from "@/lib/org/candidateBoardSort";

/**
 * The candidate lists' toolbar menus: each button names the current choice,
 * e.g. [⇅ 최신순 ▾] [⊞ 그리드 ▾], so a lone button still says what it does.
 */

export function OrgCandidateSortMenu({
  onChange,
  value,
}: {
  onChange: (value: OrgCandidateSort) => void;
  value: OrgCandidateSort;
}) {
  const { c } = useOrgLocale();
  const options = [
    { value: "latest", label: c("최신순", "Newest first") },
    { value: "recommended", label: c("추천순", "Recommended") },
  ] as const;
  const label =
    options.find((option) => option.value === value)?.label ?? options[0].label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MuteButton
          aria-label={c("정렬: {p0}", "Sort: {p0}", { p0: label })}
          className="org-toolbar-button"
          size="sm"
          variant="transparent"
        >
          <ArrowDownWideNarrow aria-hidden className="size-4" strokeWidth={1.4} />
          <span>{label}</span>
          <ChevronDown aria-hidden className="org-toolbar-chevron" strokeWidth={1.6} />
        </MuteButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" sideOffset={2}>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (next === "latest" || next === "recommended") onChange(next);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type OrgCandidateViewOption<T extends string> = {
  icon: LucideIcon;
  label: string;
  value: T;
};

/** 보기 방식: only the views the list on screen has. */
export function OrgCandidateViewMenu<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly OrgCandidateViewOption<T>[];
  value: T;
}) {
  const { c } = useOrgLocale();
  const current = options.find((option) => option.value === value) ?? options[0];
  if (!current) return null;
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MuteButton
          aria-label={c("보기 방식: {p0}", "View: {p0}", { p0: current.label })}
          className="org-toolbar-button"
          size="sm"
          variant="transparent"
        >
          <Icon aria-hidden className="size-4" strokeWidth={1.4} />
          <span>{current.label}</span>
          <ChevronDown aria-hidden className="org-toolbar-chevron" strokeWidth={1.6} />
        </MuteButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" sideOffset={2}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            selected={option.value === current.value}
            variant="sm"
          >
            <option.icon strokeWidth={1.4} />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

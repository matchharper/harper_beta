import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section-header";

export function OrgPageHeader({
  actions,
  className,
  description,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-4 pb-2 sm:flex-row sm:items-start sm:justify-between", className)}>
      <SectionHeader className="gap-1.5">
        <SectionTitle as="h1" className="text-[20px]" type="head2">
          {title}
        </SectionTitle>
        {description && (
          <SectionDescription
            className="text-[14px] font-normal leading-5"
            type="subtle"
          >
            {description}
          </SectionDescription>
        )}
      </SectionHeader>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

import type { ReactNode } from "react";
import {
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section-header";

export function OrgPageHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
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

import type { ReactNode } from "react";

/** Shared presentation for internal-role calls and private mock interviews. */
export default function CareerCallProposalCard({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 w-[94%] max-w-[440px] rounded-md border border-neutral-200 bg-bg-floating px-2 py-2 text-neutral-primary">
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="min-h-20 min-w-0 w-full flex flex-col items-start justify-center [overflow-wrap:anywhere]">
          <div className="text-sm font-normal leading-snug">{title}</div>
          <div className="mt-1 text-[14px] md:text-[13px] text-left leading-5 text-neutral-muted">
            {description}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 w-full">{children}</div>
      </div>
    </div>
  );
}

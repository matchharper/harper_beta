import { MessageSquare, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Text } from "@/components/ui/text";

// Guide-step design lives here: change the header icon and className values directly.
export function OrgOnboardingGuideHeader({ title }: { title: ReactNode }) {
  return (
    <header className="flex flex-col items-center gap-4 pb-1 pt-2 text-center">
      <MessageSquare aria-hidden className="size-8 text-neutral-primary" />
      <Text
        as="h1"
        className="text-[20px] font-normal leading-[1.5] text-neutral-primary md:text-[24px]"
      >
        {title}
      </Text>
    </header>
  );
}

export function OrgOnboardingGuideBody({
  items,
}: {
  items: Array<{
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
  }>;
}) {
  return (
    <ul className="space-y-6">
      {items.map(({ id, icon: Icon, title, description }) => (
        <li key={id} className="flex items-start gap-3">
          <Icon
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-neutral-muted"
          />
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium leading-6 text-neutral-primary">
              {title}
            </h2>
            <p className="mt-1 text-[13px] leading-6 text-neutral-muted">
              {description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

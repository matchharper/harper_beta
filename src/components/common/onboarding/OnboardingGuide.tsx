import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Text } from "@/components/ui/text";

// Org passes lucide icons; Career passes Hugeicons data from @hugeicons/core-free-icons.
type OnboardingGuideIcon = LucideIcon | IconSvgElement;

const isHugeicon = (icon: OnboardingGuideIcon): icon is IconSvgElement =>
  Array.isArray(icon);

// Guide-step design lives here: change the header icon and className values directly.
export function OnboardingGuideHeader({ title }: { title: ReactNode }) {
  return (
    <header className="flex flex-col items-center gap-4 pb-1 pt-2 text-center">
      <Image
        src="/images/greencheck2.png"
        unoptimized
        alt=""
        width={40}
        height={40}
        className="size-10 object-contain"
      />
      <Text
        as="h1"
        className="text-[20px] font-normal leading-[1.5] text-neutral-primary md:text-[24px]"
      >
        {title}
      </Text>
    </header>
  );
}

export function OnboardingGuideBody({
  items,
}: {
  items: Array<{
    id: string;
    icon: OnboardingGuideIcon;
    title: string;
    description: string;
  }>;
}) {
  const iconClassName = "mt-0.5 size-5 shrink-0 text-neutral-muted";
  return (
    <ul className="space-y-6">
      {items.map(({ id, icon: Icon, title, description }) => (
        <li key={id} className="flex items-start gap-3">
          {isHugeicon(Icon) ? (
            <HugeiconsIcon icon={Icon} aria-hidden className={iconClassName} />
          ) : (
            <Icon aria-hidden className={iconClassName} />
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium leading-6 text-neutral-primary">
              {title}
            </h2>
            <p className="mt-1 text-[14px] leading-5 text-neutral-muted">
              {description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

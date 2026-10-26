import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import IntegrationConversationCarousel, {
  type IntegrationConversationExample,
} from "./IntegrationConversationCarousel";

export type IntegrationOverviewContent = {
  name: string;
  provider: string;
  icon: ReactNode;
  description: string;
  examples: readonly IntegrationConversationExample[];
  features: readonly {
    id: string;
    icon: ReactNode;
    title: string;
    description: string;
  }[];
  continueLabel: string;
  pendingLabel: string;
};

/** Content and connection behavior belong to each integration, not this layout. */
export default function IntegrationOverview({
  content,
  open,
  pending,
  onClose,
  onContinue,
}: {
  content: IntegrationOverviewContent;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  return (
    <TalentCareerModal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      closeOnBackdrop={!pending}
      showCloseButton={!pending}
      mobileBottomSheet
      title={
        <span className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center [&_img]:h-8 [&_img]:w-8"
            aria-hidden="true"
          >
            {content.icon}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-lg font-medium tracking-normal">
              {content.name}
            </span>
            <span className="text-xs font-normal tracking-normal text-neutral-muted">
              {content.provider}
            </span>
          </span>
        </span>
      }
      ariaLabel={content.name}
      panelClassName="max-w-[560px]"
      headerClassName="px-5 pb-0 pt-5 sm:px-6 sm:pt-6"
      bodyClassName="px-5 pb-1 sm:px-6"
      footerClassName="px-5 pb-5 pt-4 sm:px-6 sm:pb-6"
      footer={
        <MuteButton
          type="button"
          variant="dark"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={onContinue}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : null}
          {pending ? content.pendingLabel : content.continueLabel}
        </MuteButton>
      }
    >
      <p className="mb-4 mt-3 break-keep text-sm font-normal leading-6 text-neutral-primary">
        {content.description}
      </p>
      <IntegrationConversationCarousel examples={content.examples} />

      <ul className="mb-1 mt-6 space-y-4">
        {content.features.map((feature) => (
          <li key={feature.id} className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-primary [&_svg]:h-4 [&_svg]:w-4"
            >
              {feature.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-medium leading-5 text-neutral-primary">
                {feature.title}
              </h3>
              <p className="mt-0.5 break-keep text-[13px] font-normal leading-5 text-neutral-muted">
                {feature.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </TalentCareerModal>
  );
}

import { useRef, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { CompanyLogo } from "@/components/career/watchlist/CompanyLogo";
import { useCareerT } from "@/i18n/useCareerT";
import { getDisplayableCompanyLogoUrl } from "@/lib/imageUrl";
import type { CareerHistoryOpportunity } from "../types";
import ApplyWithHarperButton from "./ApplyWithHarperButton";

export default function ExternalOpportunityApplyModal({
  item,
  pending,
  error,
  onClose,
  onSave,
  onApplied,
  onOpenLink,
  onOpenChat,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (
    stage: "saved" | "applied"
  ) => boolean | void | Promise<boolean | void>;
  onApplied: () => void;
  onOpenLink: (url: string) => void;
  onOpenChat: () => void;
}) {
  const t = useCareerT();
  const applyingRef = useRef(false);
  const [applying, setApplying] = useState(false);
  const busy = pending || applying;

  const apply = async (
    action: () => boolean | void | Promise<boolean | void>
  ) => {
    if (busy || applyingRef.current) return false;
    applyingRef.current = true;
    setApplying(true);
    try {
      return (await action()) === true;
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  return (
    <TalentCareerModal
      open
      mobileBottomSheet
      panelClassName="max-w-[440px]"
      onClose={() => {
        if (!busy) onClose();
      }}
      closeOnBackdrop={!busy}
      showCloseButton={!busy}
      title={t("career.history.external_application.apply", "지원하기")}
      description={t(
        "career.history.external_application.description",
        "Harper와 이 포지션의 지원을 같이 준비할 수 있습니다. 직접 지원하거나 Harper와 함께 시작해 보세요."
      )}
      bodyClassName="px-4 sm:px-5"
      footer={
        <div className="flex w-full flex-col gap-2">
          <MuteButton
            className="w-full"
            size="lg"
            disabled={busy}
            aria-busy={applying}
            onClick={() =>
              void apply(async () => {
                const url = item.externalJdUrl ?? item.href;
                if (url) onOpenLink(url);
                if ((await onSave("applied")) !== true) return false;
                onClose();
                onApplied();
                return true;
              })
            }
          >
            <div className="min-w-40">
              {t(
                "career.history.external_application.direct",
                "사이트에서 직접 지원하기"
              )}
            </div>
            <ArrowUpRight className="size-4" aria-hidden />
          </MuteButton>
          <ApplyWithHarperButton
            item={item}
            className="w-full"
            size="lg"
            pending={busy}
            onBeforeStart={() => apply(() => onSave("saved"))}
            onOpenChat={() => {
              onClose();
              onOpenChat();
            }}
          >
            <div className="min-w-40">
              {t(
                "career.history.external_application.with_harper",
                "Harper와 지원하기"
              )}
            </div>
          </ApplyWithHarperButton>
        </div>
      }
    >
      <div className="flex items-center gap-2 text-sm flex-col bg-neutral-50 p-4 rounded-xs">
        <CompanyLogo
          logoUrl={getDisplayableCompanyLogoUrl(item.companyLogoUrl)}
          name={item.companyName}
          size="xl"
        />
        <p className="min-w-0 break-words text-base mt-1">{item.companyName}</p>
        <p className="min-w-0 break-words">{item.title}</p>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      ) : null}
    </TalentCareerModal>
  );
}

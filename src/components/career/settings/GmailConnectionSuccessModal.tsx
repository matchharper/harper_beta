import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import {
  GmailConnectionAnimation,
  type GmailAnimationVariant,
} from "./GmailConnectionAnimation";

export default function GmailConnectionSuccessModal({
  open,
  pending,
  onClose,
  onImport,
  animationVariant = "delivery",
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onImport: () => void;
  animationVariant?: GmailAnimationVariant;
}) {
  const t = useCareerT();

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!pending}
      showCloseButton={!pending}
      mobileBottomSheet
      eyebrow={
        <div className="mb-5">
          <GmailConnectionAnimation variant={animationVariant} />
        </div>
      }
      title={t(
        "career.profile.career_profile_links_settings_section.0erv6uz",
        "Gmail 연결이 완료되었어요"
      )}
      description={t(
        "career.profile.career_profile_links_settings_section.12rthh0",
        "읽어오기를 누르면 Harper가 최근 커리어 관련 이메일을 정리합니다."
      )}
      panelClassName="flex max-h-[calc(100dvh-48px)] max-w-[480px] flex-col bg-bg-floating"
      headerClassName="shrink-0 border-b-0 px-6 pb-2 pt-6 text-center sm:px-7"
      descriptionClassName="mx-auto"
      bodyClassName="min-h-0 overflow-y-auto px-5 pt-2 sm:px-7"
      footerClassName="shrink-0 pb-6 pt-4 sm:px-7"
      footer={
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2">
          <MuteButton
            type="button"
            variant="default"
            size="lg"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={onClose}
          >
            {t(
              "career.profile.resume_links.gmail_connection_modal_close",
              "닫기"
            )}
          </MuteButton>
          <MuteButton
            type="button"
            variant="dark"
            size="lg"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={onImport}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending
              ? t(
                  "career.profile.resume_links.gmail_analysis_running",
                  "읽어오는 중"
                )
              : t(
                  "career.profile.career_profile_links_settings_section.0z48n2w",
                  "읽어오기"
                )}
          </MuteButton>
        </div>
      }
    >
      <div className="mx-auto flex flex-col justify-center items-center max-w-[700px] gap-4 pb-1 pt-5">
        <p className="text-[14px] leading-6 text-neutral-primary">
          {t(
            "career.profile.career_profile_links_settings_section.0q4dh49",
            "최근 2년의 채용 관련 이메일에서 지원한 회사와 역할, 확인되는 주요 진행 과정을 정리합니다. 이를 커리어 이력과 관심사를 이해하고, 이미 지원한 기회를 다시 추천하지 않는 데 참고합니다."
          )}
        </p>
        <div className="rounded-lg bg-bg-weak px-4 py-3.5">
          <p className="text-[13px] leading-[1.65] text-neutral-muted">
            {t(
              "career.profile.career_profile_links_settings_section.0rr9dvp",
              "읽어온 정보는 내 문서에 비공개로 저장되며 회사에 공개되지 않습니다. 지원 근거가 불분명한 이메일은 커리어 이력으로 저장하지 않습니다."
            )}
          </p>
        </div>
      </div>
    </TalentCareerModal>
  );
}

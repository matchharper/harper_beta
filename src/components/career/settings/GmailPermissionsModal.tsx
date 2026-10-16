import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

export default function GmailPermissionsModal({
  open,
  busy,
  onClose,
  onContinue,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const t = useCareerT();
  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy}
      showCloseButton={!busy}
      mobileBottomSheet
      title={t(
        "career.profile.resume_links.gmail_permissions_title",
        "Gmail 접근 권한이 필요해요"
      )}
      description={t(
        "career.profile.resume_links.gmail_permissions_description",
        "채용 관련 이메일을 가져오려면 Gmail 접근을 허용해 주세요."
      )}
      panelClassName="max-w-[440px]"
      bodyClassName="px-4 pb-1 sm:px-5"
      footer={
        <div className="flex w-full justify-end gap-2">
          <MuteButton size="lg" disabled={busy} onClick={onClose}>
            {t("career.profile.resume_links.gmail_permissions_later", "나중에")}
          </MuteButton>
          <MuteButton
            size="lg"
            variant="dark"
            disabled={busy}
            onClick={onContinue}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t(
              "career.profile.resume_links.gmail_permissions_continue",
              "권한 허용하고 가져오기"
            )}
          </MuteButton>
        </div>
      }
    >
      <p className="break-keep text-sm leading-6 text-neutral-muted">
        {t(
          "career.profile.resume_links.gmail_permissions_hint",
          "다음 Google 화면에서 Gmail 접근 항목을 선택해 주세요. 권한을 허용하고 돌아오면 이메일 가져오기가 시작됩니다."
        )}
      </p>
    </TalentCareerModal>
  );
}

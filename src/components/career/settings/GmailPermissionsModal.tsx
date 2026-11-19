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
              "권한 허용하기"
            )}
          </MuteButton>
        </div>
      }
    >
      <p className="break-keep text-sm leading-6 text-neutral-muted">
        {t("career.profile.resume_links.gmail_permissions_description", "Google에서 Gmail 읽기 권한을 허용하면 Harper가 커리어에 필요한 메일을 확인할 수 있어요.")}
      </p>
    </TalentCareerModal>
  );
}

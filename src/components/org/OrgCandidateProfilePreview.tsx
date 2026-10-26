import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgCandidateProfilePreview as ProfilePreview } from "@/lib/org/candidatePreview";
import { OrgCandidateReviewContent } from "./OrgCandidateReviewContent";

export function OrgCandidateProfilePreview({
  preview,
  onClose,
  inline = false,
}: {
  preview: ProfilePreview;
  onClose: () => void;
  inline?: boolean;
}) {
  const { c } = useOrgLocale();
  const profile = <OrgCandidateReviewContent detail={preview} onResumeClick={() => {}} />;
  if (inline) return (
    <div className="min-w-0 space-y-5">
      <MuteButton onClick={onClose} variant="transparent">{c("닫기", "Close")}</MuteButton>
      {profile}
    </div>
  );
  return (
    <TalentCareerModal
      open
      modal={false}
      closeOnBackdrop={false}
      onClose={onClose}
      title={c("후보자 프로필", "Candidate profile")}
      description={preview.role.name}
      overlayClassName="items-stretch justify-end p-0 sm:px-0"
      panelClassName="h-dvh max-h-none w-full max-w-[680px] rounded-none border-0 shadow-none"
      bodyClassName="px-6 pb-8"
    >
      {profile}
    </TalentCareerModal>
  );
}

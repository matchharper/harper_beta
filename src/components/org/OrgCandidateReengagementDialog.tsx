import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { LoaderCircle } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";

export function OrgCandidateReengagementDialog({
  candidateName,
  onCancel,
  onConfirmCompanyChecked,
  onRequestCandidateCheck,
  open,
  pending,
  roleName,
}: {
  candidateName: string;
  onCancel: () => void;
  onConfirmCompanyChecked: () => void | Promise<void>;
  onRequestCandidateCheck: () => void | Promise<void>;
  open: boolean;
  pending: boolean;
  roleName: string;
}) {
  const { c } = useOrgLocale();
  return (
    <TalentCareerModal
      bodyClassName="bg-bg-floating px-5 pb-2 sm:px-6"
      closeOnBackdrop={!pending}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <MuteButton disabled={pending} onClick={onCancel} size="lg">
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            onClick={() => void onConfirmCompanyChecked()}
            size="lg"
            variant="default"
          >
            {c("회사에서 이미 확인했어요", "Interest confirmed")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            onClick={() => void onRequestCandidateCheck()}
            size="lg"
            variant="primary"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {c("Harper가 먼저 물어보기", "Have Harper ask")}
          </MuteButton>
        </div>
      }
      mobileBottomSheet
      onClose={() => {
        if (!pending) onCancel();
      }}
      open={open}
      panelClassName="max-w-lg border-neutral-1000-a05 bg-bg-floating"
      showCloseButton={!pending}
      title={c(
        "후보자에게 종료 안내가 전달됐어요",
        "The candidate was told the process had ended"
      )}
    >
      <div className="space-y-3 text-[13px] leading-5 text-neutral-muted">
        <p>
          {c(
            "{candidateName}님께 {roleName} 역할의 진행이 끝났다고 이미 안내했습니다. 다시 진행하려면 후보자의 새로운 의사를 확인하는 편이 안전해요.",
            "{candidateName} was already told that the hiring process for {roleName} had ended. Confirm their interest before restarting.",
            { candidateName, roleName }
          )}
        </p>
        <p>
          {c(
            "Harper가 회사 대신 다시 진행할 생각이 있는지 물어보고, 긍정 답변이 오면 자동으로 상태를 복구할 수 있어요. 회사에서 이미 직접 확인했다면 하려던 단계를 이어서 진행할 수 있어요.",
            "Harper can ask whether the candidate is still interested and reopen the process if they say yes. If you've already confirmed their interest directly, you can continue now."
          )}
        </p>
      </div>
    </TalentCareerModal>
  );
}

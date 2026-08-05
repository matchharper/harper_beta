import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import React from "react";

export type ProfileSourceApplyConfirmMode =
  | "saved_sources"
  | "linkedin_refresh";

type ProfileSourceApplyConfirmModalProps = {
  mode: ProfileSourceApplyConfirmMode | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

const ProfileSourceApplyConfirmModal = ({
  mode,
  pending,
  onCancel,
  onConfirm,
}: ProfileSourceApplyConfirmModalProps) => {
  const t = useCareerT();
  const cancelLabel =
    mode === "saved_sources"
      ? t("career.profile.source_apply.materials_only", "자료만 업로드")
      : t("career.common.cancel", "취소");

  return (
    <TalentCareerModal
      open={mode !== null}
      onClose={() => {
        if (!pending) onCancel();
      }}
      closeOnBackdrop={!pending}
      showCloseButton={!pending}
      title={t(
        "career.profile.source_apply.title",
        "새로운 내용을 프로필에 반영할까요?"
      )}
      panelClassName="max-w-[520px] rounded-[16px] border-neutral-1000-a05 bg-bg-floating"
      headerClassName="px-5 py-5 pr-14 sm:px-6"
      bodyClassName="px-5 py-5 sm:px-6"
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </MuteButton>
          <MuteButton
            variant="dark"
            onClick={() => void onConfirm()}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("career.profile.source_apply.confirm", "반영하기")}
          </MuteButton>
        </div>
      }
    >
      <p className="text-sm leading-6 text-neutral-muted">
        {t(
          "career.profile.source_apply.description",
          "새로운 내용을 현재 프로필 정보에 반영하시겠습니까?"
        )}{" "}
        <br />
        {t(
          "career.profile.source_apply.help",
          "반영하면 새 자료를 바탕으로 경력, 학력 및 추가 프로필 정보를 업데이트합니다."
        )}
      </p>
    </TalentCareerModal>
  );
};

export default React.memo(ProfileSourceApplyConfirmModal);

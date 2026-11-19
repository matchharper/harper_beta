import React from "react";
import BottomSheetModal from "@/components/common/BottomSheetModal";
import ModalShell, {
  MODAL_HEADER_BUTTON_CLASS_NAME,
  MODAL_SURFACE_CLASS_NAME,
  type ModalShellLayout,
  type ModalShellProps,
} from "@/components/common/ModalShell";
import { useIsMobile } from "@/hooks/useMediaQuery";

type TalentCareerModalProps = ModalShellProps & {
  /** 모바일 화면(768px 미만)에서는 BottomSheetModal로 표시한다. */
  mobileBottomSheet?: boolean;
};

const DIALOG_LAYOUT: ModalShellLayout = {
  positioner:
    "fixed inset-0 z-80 flex items-center justify-center px-4 py-6 pointer-events-none sm:px-6",
  panel: `${MODAL_SURFACE_CLASS_NAME} max-h-[calc(100dvh-3rem)] rounded-modal data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`,
  headerButton: `${MODAL_HEADER_BUTTON_CLASS_NAME} rounded-md hover:bg-surface-tint`,
  headerIcon: "h-4 w-4",
};

/**
 * 최대한 Component를 사용하는 단계에서 className을 설정하지 않는 것이 좋다.
 */
const TalentCareerModal = ({
  mobileBottomSheet = false,
  ...props
}: TalentCareerModalProps) => {
  const isMobile = useIsMobile();

  if (mobileBottomSheet && isMobile) {
    return <BottomSheetModal {...props} />;
  }

  return <ModalShell {...props} layout={DIALOG_LAYOUT} />;
};

export default TalentCareerModal;

import React from "react";
import ModalShell, {
  MODAL_HEADER_BUTTON_CLASS_NAME,
  MODAL_SURFACE_CLASS_NAME,
  type ModalShellLayout,
  type ModalShellProps,
} from "@/components/common/ModalShell";

export type BottomSheetModalProps = ModalShellProps;

const BOTTOM_SHEET_LAYOUT: ModalShellLayout = {
  positioner:
    "fixed inset-0 z-80 flex items-end justify-center pt-6 pointer-events-none",
  panel: `${MODAL_SURFACE_CLASS_NAME} data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom`,
  panelOverride:
    "max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] rounded-b-none rounded-t-sheet border-b-0 pb-[env(safe-area-inset-bottom)]",
  headerButton: `${MODAL_HEADER_BUTTON_CLASS_NAME} rounded-full border-0 bg-neutral-50 text-neutral-primary shadow-none hover:bg-bg-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-1000-a10`,
  headerIcon: "h-[18px] w-[18px]",
  headerWithCloseButton: "pr-16 sm:pr-16",
  footer: "pt-1 sm:pt-5",
};

/**
 * 화면 하단에 붙어 위로 올라오는 모달.
 * 헤더·본문·푸터 props는 TalentCareerModal과 같다.
 */
const BottomSheetModal = (props: BottomSheetModalProps) => (
  <ModalShell {...props} layout={BOTTOM_SHEET_LAYOUT} />
);

export default BottomSheetModal;

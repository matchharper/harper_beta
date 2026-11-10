import { cn } from "@/lib/utils";

/**
 * The full-profile sheet every candidate opens in (TalentCareerModal): from the
 * right on a wide screen, the profile with a 480px side column (the activity
 * and the decision); from the bottom on a phone. People inside Harper
 * (TalentDetailSimpleView) and outside it (외부 후보) share it, so 전체 프로필
 * looks and moves the same from every list.
 *
 * Adjust only --candidate-profile-width to resize the desktop profile pane.
 * The side column stays 480px; the panel is capped at the available viewport width.
 */
export const ORG_CANDIDATE_SHEET_PROPS = {
  overlayClassName:
    "z-[70] items-stretch justify-end overflow-hidden p-0 sm:px-0 [--candidate-profile-width:calc(80vw-480px)] [--candidate-feed-width:480px]",
  backdropClassName: "z-[70] bg-surface-inverse/35 backdrop-blur-none",
  panelClassName: cn(
    "h-dvh max-h-none max-w-full min-w-0 rounded-none border-0 pb-[env(safe-area-inset-bottom)] sm:w-[92vw] md:w-[calc(var(--candidate-profile-width)+var(--candidate-feed-width))] md:pb-0",
    "duration-150 ease-out data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
    "max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom",
    "md:data-[state=open]:slide-in-from-right md:data-[state=closed]:slide-out-to-right",
    "motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none"
  ),
  bodyClassName: "flex min-h-0 flex-1 flex-col overflow-hidden",
} as const;

/** The sheet's body: the profile, and the side column from 768px. */
export const ORG_CANDIDATE_SHEET_GRID =
  "grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_var(--candidate-feed-width)]";

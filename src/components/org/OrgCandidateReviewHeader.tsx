"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { TalentDetailPager } from "./TalentDetailPager";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { cn } from "@/lib/utils";
import type { OrgTalentDetailResponse } from "@/lib/org/server";
import type {
  OrgTalentDetailNavigationState,
  OrgTalentDetailNavigationTarget,
} from "@/lib/org/detailNavigation";
import { OrgPassPopover } from "./OrgPassPopover";
import { OrgAcceptIntroButton } from "./OrgAcceptIntroButton";

export type OrgCandidateReviewHeaderProps = {
  detail?: Pick<
    OrgTalentDetailResponse,
    "companyIntro" | "recommendation" | "capabilities"
  >;
  navigation: OrgTalentDetailNavigationState<OrgTalentDetailNavigationTarget> | null;
  onNavigate: (target: OrgTalentDetailNavigationTarget | null) => void;
  onNextPage?: () => void;
  nextPagePending?: boolean;
  onBack?: () => void;
  backLabel?: string;
  navigationTitle?: string;
  roleMoveButton: ReactNode;
  onAccept: () => void;
  onReject: () => void;
  onPass: (reason: string) => Promise<void>;
  onSave: () => Promise<void>;
  saved: boolean;
  pending: boolean;
  canManage: boolean;
};

/** Review navigation, decisions and their keyboard shortcuts. */
export function OrgCandidateReviewHeader(props: OrgCandidateReviewHeaderProps) {
  const { c } = useOrgLocale();
  const { detail, navigation, pending, canManage } = props;
  const [passOpen, setPassOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionable = Boolean(
    detail &&
    (detail.companyIntro
      ? detail.companyIntro.status === "ready" &&
        detail.capabilities.requestIntro
      : detail.recommendation.stage === "pending_connection" &&
        detail.capabilities.moveStage)
  );
  const save = async () => {
    setActionError("");
    try {
      await props.onSave();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : c("저장하지 못했습니다.", "Could not save candidate.")
      );
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        pending ||
        passOpen
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog],[role=menu],[role=tablist]"
        )
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === "arrowleft" && navigation?.previous) {
        event.preventDefault();
        props.onNavigate(navigation.previous);
      }
      if (key === "arrowright" && (navigation?.next || props.onNextPage)) {
        event.preventDefault();
        if (navigation?.next) props.onNavigate(navigation.next);
        else if (!props.nextPagePending) props.onNextPage?.();
      }
      if (!actionable || !canManage) return;
      if (key === "s") {
        event.preventDefault();
        void save();
      }
      if (key === "p") {
        event.preventDefault();
        if (detail?.companyIntro) setPassOpen(true);
        else props.onReject();
      }
      if (key === "r") {
        event.preventDefault();
        props.onAccept();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-20 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] shrink-0 items-center md:flex md:flex-wrap md:justify-between",
          props.navigationTitle
            ? "gap-1 bg-linear-to-b from-white to-white/0 px-1 py-1"
            : "gap-2 px-2 pt-3 md:gap-3 md:px-4 @min-[700px]/review:px-6"
        )}
      >
        {props.navigationTitle && (
          <div className="col-span-2 flex min-w-0 items-center gap-1 md:w-full">
            {props.onBack && (
              <MuteButton
                aria-label={props.backLabel ?? c("리스트로 돌아가기", "Back to list")}
                disabled={pending}
                data-org-review-back
                onClick={props.onBack}
                variant="transparent"
                size="sm"
              >
                <ArrowLeft className="size-4" />
                {c("목록", "List")}
              </MuteButton>
            )}
            <h1 title={props.navigationTitle} className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {props.navigationTitle}
            </h1>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1">
          {props.onBack && !props.navigationTitle && (
            <MuteButton
              aria-label={props.backLabel ?? c("리스트로 돌아가기", "Back to list")}
              disabled={pending}
              data-org-review-back
              onClick={props.onBack}
              variant="transparent"
              size="sm"
            >
              <ArrowLeft className="size-4" />
            </MuteButton>
          )}
          {navigation && (
            <TalentDetailPager
              compact={Boolean(props.navigationTitle)}
              navigation={navigation}
              onNavigate={props.onNavigate}
              onNextPage={props.onNextPage}
              nextPagePending={props.nextPagePending}
              disabled={pending}
            />
          )}
        </div>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-1 md:order-2 md:ml-0 md:gap-2 max-md:[&_button]:whitespace-nowrap max-md:[&_button]:px-2 max-md:[&_button]:text-[13px] max-[360px]:[&_button]:px-1!">
          {actionable && canManage && (
            <>
              <MuteButton
                className="px-3 py-1.5 border-none text-[15px]"
                onClick={() => void save()}
                disabled={pending}
                aria-keyshortcuts="s"
                variant="neutral"
              >
                {props.saved ? c("저장 해제", "Unsave") : "Save"}
              </MuteButton>
              {detail?.companyIntro ? (
                <>
                  <OrgPassPopover
                    key={detail.recommendation.recommendationId}
                    open={passOpen}
                    onOpenChange={setPassOpen}
                    onSubmit={props.onPass}
                    pending={pending}
                    shortcut={false}
                  />
                  <MuteButton
                    className="px-3 py-1.5 border-none text-[15px]"
                    variant="dark"
                    disabled={pending}
                    onClick={props.onAccept}
                    aria-keyshortcuts="r"
                  >
                    {c("Intro 보내기", "Send intro")}
                  </MuteButton>
                </>
              ) : (
                <>
                  <MuteButton
                    className="px-3 py-1.5 border-none text-[15px]"
                    variant="neutral"
                    disabled={pending}
                    onClick={props.onReject}
                    aria-keyshortcuts="p"
                  >
                    Reject
                  </MuteButton>
                  <OrgAcceptIntroButton
                    className="px-3 py-1.5 border-none text-[15px] font-normal"
                    disabled={pending}
                    onClick={props.onAccept}
                    shortcut={false}
                  />
                </>
              )}
            </>
          )}
        </div>
        {props.roleMoveButton && (
          <div className="col-span-2 flex min-w-0 items-center md:order-1 md:ml-auto">
            {props.roleMoveButton}
          </div>
        )}
      </header>
      {actionError && (
        <p role="alert" className="px-6 pt-3 text-xs text-critical">
          {actionError}
        </p>
      )}
    </>
  );
}

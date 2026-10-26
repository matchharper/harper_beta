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
      if (key === "arrowright" && navigation?.next) {
        event.preventDefault();
        props.onNavigate(navigation.next);
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
          "sticky top-0 z-20 flex shrink-0 flex-wrap items-center justify-between",
          props.navigationTitle
            ? "gap-1 bg-linear-to-b from-white to-white/0 px-1 py-1"
            : "gap-3 px-4 pt-3 @min-[700px]/review:px-6"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-1",
            props.navigationTitle && "w-full"
          )}
        >
          {props.onBack && (
            <MuteButton
              aria-label={
                props.backLabel ?? c("리스트로 돌아가기", "Back to list")
              }
              title={props.backLabel ?? c("리스트로 돌아가기", "Back to list")}
              disabled={pending}
              data-org-review-back
              onClick={props.onBack}
              variant="transparent"
              size="sm"
            >
              <ArrowLeft className="size-4" />
              {props.navigationTitle && c("목록", "List")}
            </MuteButton>
          )}
          {props.navigationTitle && (
            <h1
              title={props.navigationTitle}
              className="min-w-0 flex-1 truncate text-[13px] font-medium"
            >
              {props.navigationTitle}
            </h1>
          )}
          {navigation && (
            <TalentDetailPager
              compact={Boolean(props.navigationTitle)}
              navigation={navigation}
              onNavigate={props.onNavigate}
              disabled={pending}
            />
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {props.roleMoveButton}
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
      </header>
      {actionError && (
        <p role="alert" className="px-6 pt-3 text-xs text-critical">
          {actionError}
        </p>
      )}
    </>
  );
}

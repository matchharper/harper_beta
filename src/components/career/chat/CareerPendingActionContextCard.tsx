"use client";

import {
  ChevronDown,
  CircleHelp,
  CornerDownRight,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useId } from "react";
import { CompanyLogo } from "@/components/career/watchlist/CompanyLogo";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import type { CareerHighlightedAction } from "@/lib/career/actionItems";
import { useCareerT } from "@/i18n/useCareerT";
import { getDisplayableCompanyLogoUrl } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";
import type {
  CareerPendingCompanyRequestAction,
  CareerPendingFitQuestionAction,
} from "@/lib/career/pendingActions";

type PendingQuestionAction =
  | CareerHighlightedAction
  | CareerPendingCompanyRequestAction
  | CareerPendingFitQuestionAction;

export function CareerPendingActionContextCard({
  action,
  expanded,
  onDismiss,
  onUploadResume,
  onToggleExpanded,
  resumeUploadPending = false,
}: {
  action: PendingQuestionAction;
  expanded: boolean;
  onDismiss: () => void;
  onUploadResume?: () => void;
  onToggleExpanded: () => void;
  resumeUploadPending?: boolean;
}) {
  const t = useCareerT();
  const titleId = useId();
  const promptId = useId();
  if (action.kind === "action_item") {
    return (
      <section
        className="career-reply-card career-glass career-work-surface"
        aria-labelledby={titleId}
      >
        <CornerDownRight className="career-reply-marker" aria-hidden="true" />
        <Typography id={titleId} variant="body" className="career-reply-title">
          {action.title}
        </Typography>
        <Typography variant="description" className="career-reply-description">
          {action.description}
        </Typography>
        <MuteButton
          aria-label={t(
            "career.chat.pending_action_context.dismiss_aria",
            "선택한 항목 닫기"
          )}
          className="career-reply-dismiss"
          size="sm"
          variant="transparent"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </MuteButton>
      </section>
    );
  }
  const canUploadResume =
    action.kind === "company_request" && action.requestMode === "resume";
  const isCompanyRequest =
    action.kind === "company_request" && action.requestMode === "question";
  const eyebrow =
    action.kind === "internal_fit_question"
      ? t(
          "career.chat.pending_action_context.fit_question_label",
          "정보가 필요합니다"
        )
      : action.requestMode === "resume"
        ? t(
            "career.chat.pending_action_context.resume_request_label",
            "회사 요청 · 이력서"
          )
        : t(
            "career.chat.pending_action_context.company_request_label",
            "회사에서 온 요청"
          );
  const Icon = action.kind === "internal_fit_question" ? CircleHelp : FileText;

  return (
    <section
      className="career-reply-card career-glass career-work-surface career-reply-request"
      aria-labelledby={titleId}
    >
      <CardButton
        aria-expanded={expanded}
        aria-controls={promptId}
        aria-label={
          expanded
            ? t(
                "career.chat.pending_action_context.collapse_aria",
                "요청 내용 접기"
              )
            : t(
                "career.chat.pending_action_context.expand_aria",
                "요청 내용 더 보기"
              )
        }
        onClick={onToggleExpanded}
        className={cn(
          "career-reply-toggle group min-h-0 border-none bg-transparent p-0 pr-7 shadow-none"
        )}
      >
        <span className="flex min-w-0 flex-1 items-start gap-3">
          {isCompanyRequest ? (
            <CompanyLogo
              logoUrl={getDisplayableCompanyLogoUrl(action.companyLogoUrl)}
              name={action.companyName}
              size="sm"
            />
          ) : (
            <span className="career-reply-icon">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="mb-1 flex min-w-0 items-center gap-2">
              <span
                id={titleId}
                className="text-xs font-normal text-neutral-muted"
              >
                {eyebrow}
              </span>
            </span>
            {action.kind === "company_request" ? (
              <span className="career-reply-role">
                {action.companyName} · {action.roleTitle}
              </span>
            ) : null}
            <span
              id={promptId}
              className={cn(
                "career-reply-description block",
                expanded
                  ? "max-h-[min(240px,28dvh)] overflow-y-auto overscroll-contain pr-1"
                  : "line-clamp-3"
              )}
            >
              {action.prompt}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn("career-reply-chevron", expanded && "rotate-180")}
          />
        </span>
      </CardButton>
      {canUploadResume && onUploadResume ? (
        <MuteButton
          className="ml-12 mt-3"
          disabled={resumeUploadPending}
          onClick={onUploadResume}
          size="sm"
          type="button"
          variant="default"
        >
          {resumeUploadPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {t(
            "career.chat.pending_action_context.upload_resume",
            "이력서 업로드"
          )}
        </MuteButton>
      ) : null}
      <MuteButton
        aria-label={t(
          "career.chat.pending_action_context.dismiss_aria",
          "선택한 항목 닫기"
        )}
        className="career-reply-dismiss"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        size="sm"
        type="button"
        variant="transparent"
      >
        <X className="h-3.5 w-3.5" />
      </MuteButton>
    </section>
  );
}

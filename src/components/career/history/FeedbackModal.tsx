import React, { useEffect, useMemo } from "react";
import { CornerDownLeft, Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import type { CareerHistoryOpportunity } from "../types";
import {
  getCareerDefaultFeedbackButtonClassName,
  getCareerNegativeFeedbackOptions,
  getCareerNegativeFeedbackModalCopy,
  getCareerPositiveFeedbackModalCopy,
  getCareerPositiveFeedbackSubmitButtonClassName,
  EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON,
} from "../opportunityTypeMeta";
import {
  PrimaryButton,
  SecondaryButton,
  BareButton,
} from "@/components/ui/button";
import {
  textareaSurfaceClassName,
  Textarea as UiTextarea,
} from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCareerT } from "@/i18n/useCareerT";

const NEGATIVE_FEEDBACK_REASON_SEPARATOR = " | ";

const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(target.closest("[contenteditable='true']"))
  );
};

const EnterShortcutHint = () => (
  <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-bg-default/10 px-1.5 py-0.5 text-[12px] font-normal text-current">
    <span>Enter</span>
    <CornerDownLeft className="h-3 w-3" strokeWidth={2} />
  </span>
);

export type NegativeFeedbackSelectionState = {
  customReason: string;
  selectedOptions: string[];
};

export const parseNegativeFeedbackReason = (
  item: CareerHistoryOpportunity
): NegativeFeedbackSelectionState => {
  const options = getCareerNegativeFeedbackOptions(item.opportunityType);
  const feedbackReason = item.feedbackReason;

  if (!feedbackReason) {
    return {
      customReason: "",
      selectedOptions: [],
    };
  }

  try {
    const parsed = JSON.parse(feedbackReason) as {
      customReason?: unknown;
      selectedOptions?: unknown;
    };
    const selectedSet = new Set(
      Array.isArray(parsed.selectedOptions)
        ? parsed.selectedOptions.map((value) => String(value)).filter(Boolean)
        : []
    );

    return {
      customReason:
        typeof parsed.customReason === "string" ? parsed.customReason : "",
      selectedOptions: options
        .filter((option) => selectedSet.has(option.value))
        .map((option) => option.value),
    };
  } catch {
    const segments = feedbackReason
      .split(NEGATIVE_FEEDBACK_REASON_SEPARATOR)
      .map((value) => value.trim())
      .filter(Boolean);
    const normalizedSegments =
      segments.length > 0 ? segments : [feedbackReason.trim()].filter(Boolean);
    const otherOption = options.find((option) => option.requiresTextInput);
    const selectedSet = new Set<string>();
    const customSegments: string[] = [];

    normalizedSegments.forEach((segment) => {
      const matchingOption = options.find(
        (option) => option.value === segment || option.label === segment
      );

      if (matchingOption) {
        selectedSet.add(matchingOption.value);
        return;
      }

      if (otherOption) {
        selectedSet.add(otherOption.value);
        customSegments.push(segment);
      }
    });

    return {
      customReason: customSegments.join(NEGATIVE_FEEDBACK_REASON_SEPARATOR),
      selectedOptions: options
        .filter((option) => selectedSet.has(option.value))
        .map((option) => option.value),
    };
  }
};

export const requiresNegativeFeedbackTextInput = (
  item: CareerHistoryOpportunity,
  selectedOptions: string[]
) =>
  getCareerNegativeFeedbackOptions(item.opportunityType).some(
    (option) =>
      option.requiresTextInput && selectedOptions.includes(option.value)
  );

export const serializeNegativeFeedbackReason = ({
  customReason,
  item,
  selectedOptions,
}: {
  customReason: string;
  item: CareerHistoryOpportunity;
  selectedOptions: string[];
}) =>
  JSON.stringify({
    customReason: customReason.trim() || null,
    selectedOptions: getCareerNegativeFeedbackOptions(item.opportunityType)
      .filter((option) => selectedOptions.includes(option.value))
      .map((option) => option.value),
  });

export const hasExternalAlreadyAppliedFeedbackReason = (
  selectedOptions: string[]
) => selectedOptions.includes(EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON);

export const HistoryPositiveFeedbackModal = ({
  draft,
  item,
  pending,
  onChangeDraft,
  onClose,
  onSubmit,
}: {
  draft: string;
  item: CareerHistoryOpportunity | null;
  pending: boolean;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const t = useCareerT();

  if (!item) return null;

  const positiveFeedbackModalCopy = getCareerPositiveFeedbackModalCopy(
    item.opportunityType,
    t
  );

  return (
    <TalentCareerModal
      open={Boolean(item)}
      onClose={onClose}
      title={positiveFeedbackModalCopy.title}
      description={positiveFeedbackModalCopy.description}
      panelClassName="max-w-[520px] border border-neutral-1000-a05 bg-bg-floating"
      bodyClassName="bg-bg-floating px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={pending}>
            {t("career.settings.career_settings_modal.0jiry9t", "취소")}
          </SecondaryButton>
          <PrimaryButton
            onClick={onSubmit}
            disabled={pending}
            className={getCareerPositiveFeedbackSubmitButtonClassName(
              item.opportunityType
            )}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("career.common.career_support_inquiry_modal.1ii5ibp", "제출")}
            <EnterShortcutHint />
          </PrimaryButton>
        </div>
      }
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary"
    >
      <div className="space-y-3">
        <UiTextarea
          unstyled
          autoFocus
          value={draft}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key !== "Enter" || event.shiftKey) return;

            event.preventDefault();
            if (!pending) {
              onSubmit();
            }
          }}
          placeholder={positiveFeedbackModalCopy.placeholder}
          className={cn(textareaSurfaceClassName, "min-h-[148px]")}
        />
      </div>
    </TalentCareerModal>
  );
};

export const HistoryNegativeFeedbackModal = ({
  customReason,
  item,
  pending,
  selectedOptions,
  onChangeCustomReason,
  onToggleOption,
  onClose,
  onSubmit,
}: {
  customReason: string;
  item: CareerHistoryOpportunity | null;
  pending: boolean;
  selectedOptions: string[];
  onChangeCustomReason: (value: string) => void;
  onToggleOption: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const t = useCareerT();

  const options = useMemo(
    () =>
      item ? getCareerNegativeFeedbackOptions(item.opportunityType, t) : [],
    [item, t]
  );

  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.isComposing) return;

      if (event.key === "Enter" && !event.shiftKey) {
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        if (!pending) {
          onSubmit();
        }
        return;
      }

      if (isInteractiveTarget(event.target)) return;

      const numeric = Number.parseInt(event.key, 10);
      if (
        !Number.isFinite(numeric) ||
        numeric < 1 ||
        numeric > options.length
      ) {
        return;
      }

      event.preventDefault();
      onToggleOption(options[numeric - 1].value);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, onSubmit, onToggleOption, options, pending]);

  if (!item) return null;

  const negativeFeedbackModalCopy = getCareerNegativeFeedbackModalCopy(
    item.opportunityType,
    t
  );
  const requiresTextInput = requiresNegativeFeedbackTextInput(
    item,
    selectedOptions
  );

  return (
    <TalentCareerModal
      open={Boolean(item)}
      onClose={onClose}
      title={negativeFeedbackModalCopy.title}
      description={negativeFeedbackModalCopy.description}
      panelClassName="max-w-[620px] border border-neutral-1000-a05 bg-bg-floating"
      bodyClassName="bg-bg-floating px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={pending}>
            {t("career.settings.career_settings_modal.0jiry9t", "취소")}
          </SecondaryButton>
          <PrimaryButton onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("career.common.career_support_inquiry_modal.1ii5ibp", "제출")}
            <EnterShortcutHint />
          </PrimaryButton>
        </div>
      }
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary"
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option, index) => {
            const active = selectedOptions.includes(option.value);
            return (
              <BareButton
                key={option.value}
                type="button"
                onClick={() => onToggleOption(option.value)}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-3 text-left text-sm leading-5 transition-colors",
                  getCareerDefaultFeedbackButtonClassName(active)
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border px-1 text-[11px] font-medium leading-none",
                    active
                      ? "border-current bg-bg-floating text-inherit"
                      : "border-neutral-1000-a10 bg-bg-floating text-neutral-primary"
                  )}
                >
                  {index + 1}
                </span>
                <span>{option.label}</span>
              </BareButton>
            );
          })}
        </div>

        {requiresTextInput && (
          <UiTextarea
            unstyled
            autoFocus
            value={customReason}
            onChange={(event) => onChangeCustomReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key !== "Enter" || event.shiftKey) return;

              event.preventDefault();
              if (!pending) {
                onSubmit();
              }
            }}
            placeholder={negativeFeedbackModalCopy.placeholder}
            className={cn(textareaSurfaceClassName, "min-h-[120px]")}
          />
        )}
      </div>
    </TalentCareerModal>
  );
};

export const HistoryMemoModal = ({
  draft,
  item,
  pending,
  onChangeDraft,
  onClose,
  onSubmit,
}: {
  draft: string;
  item: CareerHistoryOpportunity | null;
  pending: boolean;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const t = useCareerT();

  if (!item) return null;

  return (
    <TalentCareerModal
      open={Boolean(item)}
      onClose={onClose}
      title={
        item.talentMemo?.trim()
          ? t("career.history.feedback_modal.109eupo", "메모 수정")
          : t("career.history.feedback_modal.08qkm91", "메모 작성")
      }
      description={t(
        "career.history.feedback_modal.1m0q35j",
        "해당 포지션을 다시 볼 때 참고할 내용을 적어둘 수 있습니다."
      )}
      panelClassName="max-w-[520px] border border-neutral-1000-a05 bg-bg-floating"
      bodyClassName="bg-bg-floating px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={pending}>
            {t("career.settings.career_settings_modal.0jiry9t", "취소")}
          </SecondaryButton>
          <PrimaryButton onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("career.history.feedback_modal.1xp6hfy", "저장")}
          </PrimaryButton>
        </div>
      }
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary"
    >
      <UiTextarea
        unstyled
        autoFocus
        value={draft}
        onChange={(event) => onChangeDraft(event.target.value)}
        placeholder={t(
          "career.history.feedback_modal.12volkp",
          "이 포지션에 대해 기억해둘 내용이나 확인할 점을 적어주세요."
        )}
        className={cn(textareaSurfaceClassName, "min-h-[160px]")}
      />
    </TalentCareerModal>
  );
};

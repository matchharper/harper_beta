import React, { useRef } from "react";
import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import type { CareerHistoryOpportunity } from "../types";
import {
  getCareerDefaultFeedbackButtonClassName,
  getCareerNegativeFeedbackOptions,
  getCareerNegativeFeedbackModalCopy,
  getCareerPositiveFeedbackModalCopy,
  getCareerPositiveFeedbackSubmitButtonClassName,
} from "../opportunityTypeMeta";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
  careerCx,
  careerTextareaClassName,
} from "../ui/CareerPrimitives";

const NEGATIVE_FEEDBACK_REASON_SEPARATOR = " | ";

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  if (!item) return null;

  const positiveFeedbackModalCopy = getCareerPositiveFeedbackModalCopy(
    item.opportunityType
  );

  return (
    <TalentCareerModal
      open={Boolean(item)}
      onClose={onClose}
      title={positiveFeedbackModalCopy.title}
      description={positiveFeedbackModalCopy.description}
      panelClassName="max-w-[520px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <CareerSecondaryButton onClick={onClose} disabled={pending}>
            취소
          </CareerSecondaryButton>
          <CareerPrimaryButton
            onClick={onSubmit}
            disabled={pending || !draft.trim()}
            className={getCareerPositiveFeedbackSubmitButtonClassName(
              item.opportunityType
            )}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            제출
          </CareerPrimaryButton>
        </div>
      }
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
      initialFocusRef={textareaRef}
    >
      <div className="space-y-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onChangeDraft(event.target.value)}
          placeholder={positiveFeedbackModalCopy.placeholder}
          className={careerCx(careerTextareaClassName, "min-h-[148px]")}
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
  if (!item) return null;

  const negativeFeedbackModalCopy = getCareerNegativeFeedbackModalCopy(
    item.opportunityType
  );
  const options = getCareerNegativeFeedbackOptions(item.opportunityType);
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
      panelClassName="max-w-[560px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <CareerSecondaryButton onClick={onClose} disabled={pending}>
            취소
          </CareerSecondaryButton>
          <CareerPrimaryButton onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            제출
          </CareerPrimaryButton>
        </div>
      }
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option, index) => {
            const active = selectedOptions.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggleOption(option.value)}
                className={careerCx(
                  "flex items-start gap-3 rounded-md border px-3 py-3 text-left text-sm leading-5 transition-colors",
                  getCareerDefaultFeedbackButtonClassName(active)
                )}
              >
                <span
                  className={careerCx(
                    "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border px-1 text-[11px] font-medium leading-none",
                    active
                      ? "border-current bg-white/70 text-inherit"
                      : "border-beige900/20 bg-white/70 text-beige900/55"
                  )}
                >
                  {index + 1}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        {requiresTextInput && (
          <textarea
            autoFocus
            value={customReason}
            onChange={(event) => onChangeCustomReason(event.target.value)}
            placeholder={negativeFeedbackModalCopy.placeholder}
            className={careerCx(careerTextareaClassName, "min-h-[120px]")}
          />
        )}
      </div>
    </TalentCareerModal>
  );
};

export const HistoryQuestionModal = ({
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
  onSubmit: () => void | Promise<void>;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  if (!item) return null;

  return (
    <TalentCareerModal
      open={Boolean(item)}
      onClose={onClose}
      title="결정하시기전에 궁금한게 있으신가요?"
      description="질문하신 내용은 Harper가 대신해서 익명으로 회사에 물어보고 알려드리겠습니다.<br/>민감한 질문이라도 궁금하신게 있다면 얼마든지 요청해주세요."
      panelClassName="max-w-[520px] border border-beige900/10 bg-beige50"
      bodyClassName="bg-beige50 px-5 py-5"
      footer={
        <div className="flex items-center justify-end gap-2">
          <CareerSecondaryButton onClick={onClose} disabled={pending}>
            취소
          </CareerSecondaryButton>
          <CareerPrimaryButton
            onClick={() => void onSubmit()}
            disabled={pending || !draft.trim()}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            보내기
          </CareerPrimaryButton>
        </div>
      }
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
      initialFocusRef={textareaRef}
    >
      <div className="space-y-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key !== "Enter" || event.shiftKey) return;

            event.preventDefault();
            if (pending || !draft.trim()) return;
            void onSubmit();
          }}
          placeholder="궁금한 점을 남겨주세요."
          className={careerCx(careerTextareaClassName, "min-h-[148px]")}
        />
      </div>
    </TalentCareerModal>
  );
};

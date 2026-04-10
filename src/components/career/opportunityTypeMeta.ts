import {
  ExternalLink,
  Handshake,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { OpportunityType } from "@/lib/opportunityType";
import type { CareerOpportunitySavedStage } from "./types";

type CareerOpportunityModalCopy = {
  description: string;
  placeholder: string;
  title: string;
};

export type CareerFeedbackOption = {
  label: string;
  requiresTextInput?: boolean;
  value: string;
};

export type CareerOpportunityInfoTagMeta = {
  icon: LucideIcon;
  interactive: boolean;
  showHelpIcon: boolean;
};

type CareerOpportunityFeedbackMeta = {
  modal: CareerOpportunityModalCopy;
  options?: CareerFeedbackOption[];
  requiresComment: boolean;
};

type CareerOpportunityTypeMeta = {
  companySectionTitle: string;
  defaultSavedStage: CareerOpportunitySavedStage;
  info: {
    description: string;
    title: string;
  };
  infoTag: CareerOpportunityInfoTagMeta;
  label: string;
  negativeActionLabel: string;
  negativeFeedback: CareerOpportunityFeedbackMeta;
  panelToneClassName: string;
  positiveActionLabel: string;
  positiveFeedbackSubmitButtonClassName?: string;
  positiveFeedback: CareerOpportunityFeedbackMeta;
  savedStageLabels: {
    applied: string;
  };
  shortLabel: string;
  sortPriority: number;
};

export const CAREER_OPPORTUNITY_TYPE_META: Record<
  OpportunityType,
  CareerOpportunityTypeMeta
> = {
  [OpportunityType.ExternalJd]: {
    companySectionTitle: "회사 / 출처",
    defaultSavedStage: "saved",
    info: {
      description:
        "Harper가 외부에 공개된 JD를 선별해 추천한 기회입니다. Positive를 선택하면 저장함으로 이동하고, 지원은 후보자가 직접 진행합니다.",
      title: "하퍼가 발견한 기회",
    },
    infoTag: {
      icon: ExternalLink,
      interactive: true,
      showHelpIcon: false,
    },
    label: "하퍼가 발견한 기회",
    negativeActionLabel: "선호하지 않음",
    negativeFeedback: {
      modal: {
        description:
          "이 메모는 Harper가 다음 추천 방향을 조정할 때 참고합니다.",
        placeholder:
          "부담스럽거나 지금 방향과 맞지 않는 이유를 간단히 적어주세요.",
        title: "다음에는 더 좋은 기회를 제공해드리겠습니다.",
      },
      options: [
        { label: "역할 범위가 맞지 않아요", value: "역할 범위가 맞지 않아요" },
        { label: "도메인이 끌리지 않아요", value: "도메인이 끌리지 않아요" },
        {
          label: "레벨이나 기대치가 달라요",
          value: "레벨이나 기대치가 달라요",
        },
        { label: "근무 조건이 맞지 않아요", value: "근무 조건이 맞지 않아요" },
        {
          label: "기타 직접 입력",
          requiresTextInput: true,
          value: "other",
        },
      ],
      requiresComment: false,
    },
    panelToneClassName: "bg-beige200/80",
    positiveActionLabel: "저장하기",
    positiveFeedback: {
      modal: {
        description:
          "이 메모는 Harper가 다음 추천과 대화 맥락을 정리할 때 참고합니다.",
        placeholder:
          "어떤 점이 괜찮게 느껴졌는지, Harper가 다음 단계에서 참고할 포인트를 적어주세요.",
        title: "저장하기 전에 한 줄만 남겨주세요",
      },
      requiresComment: false,
    },
    savedStageLabels: {
      applied: "지원함",
    },
    shortLabel: "외부 JD",
    sortPriority: 2,
  },
  [OpportunityType.InternalRecommendation]: {
    companySectionTitle: "회사 정보",
    defaultSavedStage: "applied",
    info: {
      description:
        "Harper의 추천입니다. 회원님의 관심과 프로필 공개 가능 여부를 먼저 확인한 뒤 다음 단계를 진행합니다.",
      title: "Harper 추천 기회",
    },
    infoTag: {
      icon: Sparkles,
      interactive: true,
      showHelpIcon: true,
    },
    label: "Harper의 연결 제안",
    negativeActionLabel: "선호하지 않음",
    negativeFeedback: {
      modal: {
        description:
          "이 메모는 Harper가 다음 추천과 고객사 매칭 판단을 조정할 때 참고합니다.",
        placeholder:
          "어떤 점이 맞지 않았는지, 다음 추천에서 피하고 싶은 조건을 적어주세요.",
        title: "다음에는 더 좋은 기회를 제공해드리겠습니다.",
      },
      options: [
        { label: "역할 범위가 맞지 않아요", value: "역할 범위가 맞지 않아요" },
        {
          label: "회사나 도메인이 안 맞아요",
          value: "회사나 도메인이 안 맞아요",
        },
        {
          label: "지금 이직 타이밍이 아니에요",
          value: "지금 이직 타이밍이 아니에요",
        },
        {
          label: "프로필 공유는 아직 원치 않아요",
          value: "프로필 공유는 아직 원치 않아요",
        },
        {
          label: "기타 직접 입력",
          requiresTextInput: true,
          value: "other",
        },
      ],
      requiresComment: false,
    },
    panelToneClassName: "bg-[#edf4ef]",
    positiveActionLabel: "관심 표시",
    positiveFeedbackSubmitButtonClassName:
      "border-[#2f5d47] bg-[#2f5d47] text-[#f3f8f4]",
    positiveFeedback: {
      modal: {
        description:
          "이 메모는 Harper가 프로필 전달 전 다음 단계를 준비할 때 참고합니다.",
        placeholder:
          "어떤 점이 괜찮게 느껴졌는지, Harper가 다음 단계에서 참고할 포인트를 적어주세요.",
        title: "관심 표시 전에 한 줄만 남겨주세요",
      },
      requiresComment: true,
    },
    savedStageLabels: {
      applied: "관심 표시함",
    },
    shortLabel: "회사 추천",
    sortPriority: 1,
  },
  [OpportunityType.IntroRequest]: {
    companySectionTitle: "회사 정보",
    defaultSavedStage: "connected",
    info: {
      description:
        "채용담당자가 Harper를 통해 프로필을 확인했고 직접 연결을 요청했습니다. 연결을 수락하신다면 바로 Harper가 양쪽 일정을 조율하고 다음 대화를 이어가실 수 있게합니다.",
      title: "직접 연결 요청",
    },
    infoTag: {
      icon: Handshake,
      interactive: true,
      showHelpIcon: true,
    },
    label: "직접 연결 요청",
    negativeActionLabel: "거절하기",
    negativeFeedback: {
      modal: {
        description:
          "저희가 부담되시지 않게 회사 측에 잘 전달할게요. 혹시 가능하시다면, 어떤 이유로 거절하시는지 저희에게 알려주세요. 다음번에 더 좋은 기회를 받으실 수 있게 반영하겠습니다.",
        placeholder:
          "거절하거나 보류하고 싶은 이유가 있다면 간단히 적어주세요.",
        title: "연결 요청을 거절하시겠어요?",
      },
      options: [
        {
          label: "지금은 연결 타이밍이 아니에요",
          value: "지금은 연결 타이밍이 아니에요",
        },
        { label: "역할 범위가 맞지 않아요", value: "역할 범위가 맞지 않아요" },
        {
          label: "회사나 도메인이 안 맞아요",
          value: "회사나 도메인이 안 맞아요",
        },
        {
          label: "조건을 더 확인하고 싶어요",
          value: "조건을 더 확인하고 싶어요",
        },
        {
          label: "기타 직접 입력",
          requiresTextInput: true,
          value: "other",
        },
      ],
      requiresComment: false,
    },
    panelToneClassName: "bg-orange-300",
    positiveActionLabel: "연결 수락",
    positiveFeedbackSubmitButtonClassName:
      "border-xprimary bg-xprimary text-beige50",
    positiveFeedback: {
      modal: {
        description:
          "연결을 수락하는 이유 혹은 기대되는 점, 먼저 확인하고 싶은 조건 등을 간단히 적어주세요.",
        placeholder: "",
        title: "채용 담당자와 연결됩니다.",
      },
      requiresComment: true,
    },
    savedStageLabels: {
      applied: "관심 표시함",
    },
    shortLabel: "Intro 요청",
    sortPriority: 0,
  },
};

export const getCareerOpportunityTypeMeta = (
  opportunityType: OpportunityType
) => CAREER_OPPORTUNITY_TYPE_META[opportunityType];

export const getCareerDefaultSavedStage = (opportunityType: OpportunityType) =>
  getCareerOpportunityTypeMeta(opportunityType).defaultSavedStage;

export const getCareerOpportunitySortPriority = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).sortPriority;

export const getCareerOpportunityTypeLabel = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).label;

export const getCareerOpportunityTypeShortLabel = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).shortLabel;

export const getCareerOpportunityInfoCopy = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).info;

export const getCareerPositiveActionLabel = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).positiveActionLabel;

export const getCareerNegativeActionLabel = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).negativeActionLabel;

export const getCareerPositiveFeedbackModalCopy = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).positiveFeedback.modal;

export const getCareerNegativeFeedbackModalCopy = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).negativeFeedback.modal;

export const getCareerNegativeFeedbackOptions = (
  opportunityType: OpportunityType
) =>
  getCareerOpportunityTypeMeta(opportunityType).negativeFeedback.options ?? [];

export const getCareerOpportunityInfoTagMeta = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).infoTag;

export const getCareerAppliedSavedStageLabel = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).savedStageLabels.applied;

export const shouldCollectCareerPositiveFeedbackReason = (
  opportunityType: OpportunityType
) =>
  getCareerOpportunityTypeMeta(opportunityType).positiveFeedback
    .requiresComment;

export const shouldCollectCareerNegativeFeedbackReason = (
  opportunityType: OpportunityType
) =>
  getCareerOpportunityTypeMeta(opportunityType).negativeFeedback
    .requiresComment;

const getDefaultFeedbackButtonClassName = (active: boolean) =>
  active
    ? "border-beige900 bg-beige200 text-beige900 outline outline-[0.5px] outline-beige900"
    : "border-beige900/15 bg-white/45 text-beige900/70 hover:border-beige900/30 hover:text-beige900";

const getIntroFeedbackButtonClassName = (active: boolean) =>
  active
    ? "border-xprimary/95 bg-xprimary/85 text-beige50 outline outline-[0.5px] outline-xprimary"
    : "border-xprimary/95 bg-xprimary/85 text-white hover:opacity-90";

const getInternalFeedbackButtonClassName = (active: boolean) =>
  active
    ? "border-[#bdc4bf] bg-[#edf4ef] text-beige900 outline outline-[0.5px] outline-beige900"
    : "border-[#edf4ef] bg-[#edf4ef] text-beige900 hover:opacity-90";

export const getCareerFeedbackButtonClassName = (
  opportunityType: OpportunityType,
  active: boolean
) => {
  if (opportunityType === OpportunityType.IntroRequest) {
    return getIntroFeedbackButtonClassName(active);
  }
  if (opportunityType === OpportunityType.InternalRecommendation) {
    return getInternalFeedbackButtonClassName(active);
  }
  return getDefaultFeedbackButtonClassName(active);
};

export const getCareerDefaultFeedbackButtonClassName = (active: boolean) =>
  getDefaultFeedbackButtonClassName(active);

export const getCareerPositiveFeedbackSubmitButtonClassName = (
  opportunityType: OpportunityType
) =>
  getCareerOpportunityTypeMeta(opportunityType)
    .positiveFeedbackSubmitButtonClassName;

export const getCareerOpportunityPanelToneClassName = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).panelToneClassName;

export const getCareerCompanySectionTitle = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).companySectionTitle;

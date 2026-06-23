import {
  ExternalLink,
  Handshake,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { OpportunityType } from "@/lib/opportunityType";
import type { CareerOpportunitySavedStage } from "./types";

type CareerTValues = Record<string, string | number | null | undefined>;
export type CareerTranslationFn = (
  key: string,
  koSource: string,
  options?: { values?: CareerTValues }
) => string;

const interpolate = (value: string, params: CareerTValues | undefined) => {
  if (!params) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    const nextValue = params[name];
    return nextValue === null || nextValue === undefined
      ? ""
      : String(nextValue);
  });
};

const fallbackT: CareerTranslationFn = (_key, koSource, options) =>
  interpolate(koSource, options?.values);

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
  label: string;
  negativeActionLabel: string;
  negativeFeedback: CareerOpportunityFeedbackMeta;
  panelToneClassName: string;
  positiveActionIcon: LucideIcon;
  positiveActionLabel: string;
  positiveFeedback: CareerOpportunityFeedbackMeta;
  savedStageLabels: {
    applied: string;
  };
  shortLabel: string;
  sortPriority: number;
};

const buildCareerOpportunityTypeMeta = (
  t: CareerTranslationFn
): Record<OpportunityType, CareerOpportunityTypeMeta> => ({
  [OpportunityType.ExternalJd]: {
    companySectionTitle: t(
      "career.common.opportunity_type_meta.1woxqfo",
      "회사 / 출처"
    ),
    defaultSavedStage: "saved",
    info: {
      description: t(
        "career.common.opportunity_type_meta.19l43m1",
        "하퍼가 공개 채용 페이지와 JD를 탐색해 회원님의 경력, 선호 조건, 다음 커리어 방향과 맞춰 본 포지션입니다. 지원은 외부 JD에서 직접 진행하고, 저장한 항목은 추천 기준 개선과 가능한 연결 탐색에 활용됩니다."
      ),
      title: t(
        "career.common.opportunity_type_meta.01zzlpt",
        "하퍼가 발견한 기회"
      ),
    },
    label: t("career.common.opportunity_type_meta.1yj6p99", "오픈 포지션"),
    negativeActionLabel: t(
      "career.common.career_history_panel.0paqqgp",
      "제외됨"
    ),
    negativeFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.03vuko5",
          "이 메모는 Harper가 다음 추천 방향을 조정할 때 참고합니다. 선택하지 않고 바로 제출하실 수 있습니다. 키보드로 선택 가능합니다."
        ),
        placeholder: t(
          "career.common.opportunity_type_meta.1be34hr",
          "부담스럽거나 지금 방향과 맞지 않는 이유를 간단히 적어주세요."
        ),
        title: t(
          "career.common.opportunity_type_meta.1c01yxx",
          "다음에는 더 좋은 기회를 찾아오겠습니다."
        ),
      },
      options: [
        {
          label: t(
            "career.common.opportunity_type_meta.1tsaf8t",
            "역할이나 직무가 맞지 않아요"
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "역할이나 직무가 맞지 않아요",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.1i6mw5l",
            "회사 혹은 조건이 기준을 충족하지 못해요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "회사 혹은 조건이 기준을 충족하지 못해요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.external_already_applied",
            "이미 지원했던 회사/역할입니다."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "이미 지원했던 회사/역할입니다.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.external_expired_posting",
            "만료된 공고에요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "만료된 공고에요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.0066ceh",
            "근무 조건이 맞지않아요(리모트, 위치 등)"
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "근무 조건이 맞지않아요(리모트, 위치 등)",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.06j4qod",
            "기타 직접 입력"
          ),
          requiresTextInput: true,
          value: "other",
        },
      ],
      requiresComment: false,
    },
    panelToneClassName: "bg-bg-floating",
    positiveActionIcon: ThumbsUp,
    positiveActionLabel: t(
      "career.common.career_history_panel.06mgpci",
      "저장함"
    ),
    positiveFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.09zmhwn",
          "이 메모는 Harper가 다음 추천과 대화 맥락을 정리할 때 참고합니다."
        ),
        placeholder: t(
          "career.common.opportunity_type_meta.0ms0wrm",
          "어떤 점이 괜찮게 느껴졌는지, Harper가 다음 단계에서 참고할 포인트를 적어주세요."
        ),
        title: t(
          "career.common.opportunity_type_meta.1ebvtk6",
          "저장하기 전에 한 줄만 남겨주세요"
        ),
      },
      requiresComment: false,
    },
    savedStageLabels: {
      applied: t(
        "career.common.opportunity_type_meta.0ume46n",
        "지원함/진행중"
      ),
    },
    shortLabel: t("career.common.opportunity_type_meta.16ujfch", "외부 JD"),
    sortPriority: 2,
  },
  [OpportunityType.InternalRecommendation]: {
    companySectionTitle: t("career.common.career.0ol21b2", "회사 정보"),
    defaultSavedStage: "saved",
    info: {
      description: t(
        "career.common.opportunity_type_meta.1t09h2g",
        "하퍼가 회사의 채용 니즈를 확인하고 회원님에게 먼저 연결 의사를 묻는 추천입니다. 수락 전에는 프로필을 회사에 전달하지 않고, 수락 후 하퍼가 소개와 후속 조율을 진행합니다."
      ),
      title: t(
        "career.common.opportunity_type_meta.08t1dhj",
        "하퍼의 연결 제안"
      ),
    },
    label: t("career.common.opportunity_type_meta.08t1dhj", "하퍼의 연결 제안"),
    negativeActionLabel: t(
      "career.common.career_history_panel.0paqqgp",
      "제외됨"
    ),
    negativeFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.1q9hdqb",
          "이 메모는 Harper가 다음 추천과 고객사 매칭 판단을 조정할 때 참고합니다."
        ),
        placeholder: t(
          "career.common.opportunity_type_meta.1225b7g",
          "어떤 점이 맞지 않았는지, 다음 추천에서 피하고 싶은 조건을 적어주세요."
        ),
        title: t(
          "career.common.opportunity_type_meta.0w9kcow",
          "다음에는 더 좋은 기회를 제공해드리겠습니다."
        ),
      },
      options: [
        {
          label: t(
            "career.common.opportunity_type_meta.1tsaf8t",
            "역할이나 직무가 맞지 않아요"
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "역할이나 직무가 맞지 않아요",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.1i6mw5l",
            "회사 혹은 조건이 기준을 충족하지 못해요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "회사 혹은 조건이 기준을 충족하지 못해요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.1llzatw",
            "선호하는 유형의 도메인/회사/서비스가 아니에요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "선호하는 유형의 도메인/회사/서비스가 아니에요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.0066ceh",
            "근무 조건이 맞지않아요(리모트, 위치 등)"
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "근무 조건이 맞지않아요(리모트, 위치 등)",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.1ggf9hs",
            "아직 회사를 직접 만나고 싶은 생각은 없어요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "아직 회사를 직접 만나고 싶은 생각은 없어요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.06j4qod",
            "기타 직접 입력"
          ),
          requiresTextInput: true,
          value: "other",
        },
      ],
      requiresComment: false,
    },
    panelToneClassName: "bg-bg-floating",
    positiveActionIcon: Handshake,
    positiveActionLabel: t(
      "career.common.opportunity_type_meta.1n5sz4w",
      "연결 수락"
    ),
    positiveFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.0hc5boq",
          "이 메모는 Harper가 연결 수락 후 다음 단계를 준비할 때 참고합니다. 바로 제출하셔도 됩니다."
        ),
        placeholder: t(
          "career.common.opportunity_type_meta.1yy34n1",
          "(Optional) 어떤 점이 괜찮게 느껴졌는지, Harper가 다음 단계에서 참고할 포인트를 적어주세요."
        ),
        title: t(
          "career.common.opportunity_type_meta.1yobmng",
          "연결 수락 후 다음 단계로 진행합니다."
        ),
      },
      requiresComment: true,
    },
    savedStageLabels: {
      applied: t("career.common.career_history_panel.0y27adb", "연결됨"),
    },
    shortLabel: t("career.common.opportunity_type_meta.1gbs2on", "회사 추천"),
    sortPriority: 1,
  },
  [OpportunityType.IntroRequest]: {
    companySectionTitle: t("career.common.career.0ol21b2", "회사 정보"),
    defaultSavedStage: "saved",
    info: {
      description: t(
        "career.common.opportunity_type_meta.0aqqdks",
        "회사 측이 하퍼를 통해 회원님에게 직접 연결을 요청한 케이스입니다. 수락 여부를 확인한 뒤에만 연락처 공유와 후속 조율을 진행합니다."
      ),
      title: t("career.common.opportunity_type_meta.1qbevng", "직접 연결 요청"),
    },
    label: t("career.common.opportunity_type_meta.1qbevng", "직접 연결 요청"),
    negativeActionLabel: t(
      "career.common.opportunity_type_meta.12xbtqt",
      "거절하기"
    ),
    negativeFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.1q2m2s8",
          "저희가 부담되시지 않게 회사 측에 잘 전달할게요. 혹시 가능하시다면, 어떤 이유로 거절하시는지 저희에게 알려주세요. 다음번에 더 좋은 기회를 받으실 수 있게 반영하겠습니다."
        ),
        placeholder: t(
          "career.common.opportunity_type_meta.1b7fcpk",
          "거절하거나 보류하고 싶은 이유가 있다면 간단히 적어주세요."
        ),
        title: t(
          "career.common.opportunity_type_meta.0fr7lmx",
          "연결 요청을 거절하시겠어요?"
        ),
      },
      options: [
        {
          label: t(
            "career.common.opportunity_type_meta.1tsaf8t",
            "역할이나 직무가 맞지 않아요"
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "역할이나 직무가 맞지 않아요",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.1i6mw5l",
            "회사 혹은 조건이 기준을 충족하지 못해요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "회사 혹은 조건이 기준을 충족하지 못해요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.1llzatw",
            "선호하는 유형의 도메인/회사/서비스가 아니에요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "선호하는 유형의 도메인/회사/서비스가 아니에요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.0066ceh",
            "근무 조건이 맞지않아요(리모트, 위치 등)"
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "근무 조건이 맞지않아요(리모트, 위치 등)",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.1ggf9hs",
            "아직 회사를 직접 만나고 싶은 생각은 없어요."
          ),
          value:
            // career-i18n-skip-next-line stable feedback storage value
            "아직 회사를 직접 만나고 싶은 생각은 없어요.",
        },
        {
          label: t(
            "career.common.opportunity_type_meta.06j4qod",
            "기타 직접 입력"
          ),
          requiresTextInput: true,
          value: "other",
        },
      ],
      requiresComment: false,
    },
    panelToneClassName: "bg-bg-floating",
    positiveActionIcon: Handshake,
    positiveActionLabel: t(
      "career.common.opportunity_type_meta.1n5sz4w",
      "연결 수락"
    ),
    positiveFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.1d0ajqw",
          "연결을 수락하는 이유나 먼저 확인하고 싶은 조건이 있다면 간단히 남겨주세요. 바로 제출하셔도 됩니다."
        ),
        placeholder: t(
          "career.common.opportunity_type_meta.1l3r1qb",
          "(Optional) 전달하고 싶은 메모가 있으면 적어주세요."
        ),
        title: t(
          "career.common.opportunity_type_meta.1rq4mqk",
          "채용 담당자와 연결됩니다."
        ),
      },
      requiresComment: true,
    },
    savedStageLabels: {
      applied: t("career.common.career_history_panel.0y27adb", "연결됨"),
    },
    shortLabel: t("career.common.opportunity_type_meta.0woigko", "Intro 요청"),
    sortPriority: 0,
  },
});

let defaultCareerOpportunityTypeMeta:
  | Record<OpportunityType, CareerOpportunityTypeMeta>
  | undefined;
const careerOpportunityTypeMetaCache = new WeakMap<
  CareerTranslationFn,
  Record<OpportunityType, CareerOpportunityTypeMeta>
>();

export const getCareerOpportunityTypeMetaMap = (t?: CareerTranslationFn) => {
  if (!t) {
    defaultCareerOpportunityTypeMeta ??=
      buildCareerOpportunityTypeMeta(fallbackT);
    return defaultCareerOpportunityTypeMeta;
  }

  const cachedMeta = careerOpportunityTypeMetaCache.get(t);
  if (cachedMeta) return cachedMeta;

  const nextMeta = buildCareerOpportunityTypeMeta(t);
  careerOpportunityTypeMetaCache.set(t, nextMeta);
  return nextMeta;
};

export const getCareerOpportunityTypeMeta = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMetaMap(t)[opportunityType];

export const getCareerDefaultSavedStage = (opportunityType: OpportunityType) =>
  getCareerOpportunityTypeMeta(opportunityType).defaultSavedStage;

export const getCareerOpportunitySortPriority = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).sortPriority;

export const getCareerOpportunityTypeLabel = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).label;

export const getCareerOpportunityTypeShortLabel = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).shortLabel;

export const getCareerOpportunityInfoCopy = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).info;

export const getCareerPositiveActionLabel = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).positiveActionLabel;

export const getCareerPositiveActionIcon = (opportunityType: OpportunityType) =>
  getCareerOpportunityTypeMeta(opportunityType).positiveActionIcon;

export const getCareerNegativeActionLabel = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).negativeActionLabel;

export const getCareerPositiveFeedbackModalCopy = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).positiveFeedback.modal;

export const getCareerNegativeFeedbackModalCopy = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).negativeFeedback.modal;

export const getCareerNegativeFeedbackOptions = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) =>
  getCareerOpportunityTypeMeta(opportunityType, t).negativeFeedback.options ??
  [];

export const getCareerAppliedSavedStageLabel = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).savedStageLabels.applied;

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
    ? "border-neutral-800 bg-bg-weak text-neutral-primary outline outline-[0.5px] outline-neutral-800"
    : "border-neutral-1000-a10 bg-bg-floating text-neutral-primary hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary";

const getConnectionFeedbackButtonClassName = (active: boolean) =>
  active
    ? "border-primary bg-primary text-neutral-00 outline outline-[0.5px] outline-primary hover:opacity-90"
    : "border-primary bg-primary text-neutral-00 hover:opacity-90";

const isConnectionOpportunityType = (opportunityType: OpportunityType) =>
  opportunityType === OpportunityType.InternalRecommendation ||
  opportunityType === OpportunityType.IntroRequest;

export const getCareerFeedbackButtonClassName = (
  opportunityType: OpportunityType,
  active: boolean
) =>
  isConnectionOpportunityType(opportunityType)
    ? getConnectionFeedbackButtonClassName(active)
    : getDefaultFeedbackButtonClassName(active);

export const getCareerDefaultFeedbackButtonClassName = (active: boolean) =>
  getDefaultFeedbackButtonClassName(active);

export const getCareerPositiveFeedbackSubmitButtonClassName = (
  opportunityType: OpportunityType
) =>
  isConnectionOpportunityType(opportunityType)
    ? "border-primary bg-primary text-neutral-00"
    : undefined;

export const getCareerOpportunityPanelToneClassName = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).panelToneClassName;

export const getCareerCompanySectionTitle = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).companySectionTitle;

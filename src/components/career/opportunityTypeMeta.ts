import {
  ExternalLink,
  Handshake,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import {
  getOpportunityTypeSortPriority,
  OpportunityType,
} from "@/lib/opportunityType";
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

export const EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON =
  "이미 지원했던 회사/역할입니다.";

export type CareerOpportunityInfoTagMeta = {
  icon: LucideIcon;
  interactive: boolean;
  showHelpIcon: boolean;
};

type CareerOpportunityNegativeFeedbackMeta = {
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
  negativeFeedback: CareerOpportunityNegativeFeedbackMeta;
  panelToneClassName: string;
  positiveActionIcon: LucideIcon | null;
  positiveActionLabel: string;
  savedStageLabels: {
    applied: string;
  };
  shortLabel: string;
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
        "공개 채용 페이지에서 찾은 기회예요. 채용 페이지에서 직접 지원하거나 Harper에게 지원 준비와 제출을 요청할 수 있어요."
      ),
      title: t(
        "career.common.opportunity_type_meta.01zzlpt",
        "직접 지원"
      ),
    },
    label: t("career.common.opportunity_type_meta.1yj6p99", "직접 지원"),
    negativeActionLabel: t(
      "career.common.opportunity_type_meta.external_negative_action",
      "이번엔 넘길게요"
    ),
    negativeFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.03vuko5",
          "이 메모는 Harper가 다음 추천 방향을 조정할 때 참고합니다. 선택하지 않고 바로 제출하실 수 있습니다."
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
            EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON
          ),
          // career-i18n-skip-next-line stable feedback storage value
          value: EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON,
        },
        {
          label: t(
            "career.common.opportunity_type_meta.external_expired_posting",
            "만료된 포지션이에요."
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
      "career.common.opportunity_type_meta.external_positive_action",
      "관심 있어요"
    ),
    savedStageLabels: {
      applied: t("career.common.opportunity_type_meta.0ume46n", "지원함"),
    },
    shortLabel: t("career.common.opportunity_type_meta.16ujfch", "직접 지원"),
  },
  [OpportunityType.InternalRecommendation]: {
    companySectionTitle: t("career.common.career.0ol21b2", "회사 정보"),
    defaultSavedStage: "connected",
    info: {
      description: t(
        "career.common.opportunity_type_meta.1t09h2g",
        "Harper가 회사에 직접 소개할 수 있는 기회예요. 연결을 요청하면 회사에 소개하고 이후 대화를 도와드려요."
      ),
      title: t(
        "career.common.opportunity_type_meta.08t1dhj",
        "Harper 연결"
      ),
    },
    label: t("career.common.opportunity_type_meta.08t1dhj", "Harper 연결"),
    negativeActionLabel: t(
      "career.common.opportunity_type_meta.internal_negative_action",
      "이번엔 넘길게요"
    ),
    negativeFeedback: {
      modal: {
        description: t(
          "career.common.opportunity_type_meta.1q9hdqb",
          "이 기회는 Harper가 회사에 직접 연결할 수 있어요. 넘기는 이유를 알려주시면 다음 기회를 찾을 때 참고해요."
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
    positiveActionIcon: null,
    positiveActionLabel: t(
      "career.common.opportunity_type_meta.1n5sz4w",
      "연결 요청"
    ),
    savedStageLabels: {
      applied: t(
        "career.common.opportunity_type_meta.connected_stage_label",
        "연결됨"
      ),
    },
    shortLabel: t("career.common.opportunity_type_meta.1gbs2on", "Harper 연결"),
  },
  [OpportunityType.IntroRequest]: {
    companySectionTitle: t("career.common.career.0ol21b2", "회사 정보"),
    defaultSavedStage: "connected",
    info: {
      description: t(
        "career.common.opportunity_type_meta.0aqqdks",
        "회사가 프로필을 보고 먼저 관심을 보낸 기회예요. 만나기로 하면 회사 담당자와 연결해드려요."
      ),
      title: t("career.common.opportunity_type_meta.1qbevng", "먼저 온 관심"),
    },
    label: t("career.common.opportunity_type_meta.1qbevng", "먼저 온 관심"),
    negativeActionLabel: t(
      "career.common.opportunity_type_meta.12xbtqt",
      "이번엔 넘길게요"
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
          "이번 기회는 넘길까요?"
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
      "career.common.internal_connection_acceptance_modal.intro_submit",
      "만나볼게요"
    ),
    savedStageLabels: {
      applied: t(
        "career.common.opportunity_type_meta.connected_stage_label",
        "연결됨"
      ),
    },
    shortLabel: t("career.common.opportunity_type_meta.0woigko", "먼저 온 관심"),
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

export const getCareerDefaultSavedStageForOpportunity = (item: {
  isInternal: boolean;
  opportunityType: OpportunityType;
  sourceType: "internal" | "external";
}) =>
  item.isInternal || item.sourceType === "internal"
    ? "connected"
    : getCareerDefaultSavedStage(item.opportunityType);

export const getCareerOpportunitySortPriority = (
  opportunityType: OpportunityType
) => getOpportunityTypeSortPriority(opportunityType);

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

export const getCareerOpportunityPanelToneClassName = (
  opportunityType: OpportunityType
) => getCareerOpportunityTypeMeta(opportunityType).panelToneClassName;

export const getCareerCompanySectionTitle = (
  opportunityType: OpportunityType,
  t?: CareerTranslationFn
) => getCareerOpportunityTypeMeta(opportunityType, t).companySectionTitle;

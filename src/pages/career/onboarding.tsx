import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  BriefcaseBusiness,
  Clock3,
  FileText,
  Globe2,
  Handshake,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { showToast } from "@/components/toast/toast";
import { Badge } from "@/components/ui/badge";
import { AnimatedButton, BareButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import Face from "@/components/common/Face";
import ResumeDropzone, {
  type ResumeFileSelectSource,
} from "@/components/career/ResumeDropzone";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import {
  isDocxResumeFile,
  isLinkedinLink,
  isLinkedinProfileLink,
  readDocxResumeText,
} from "@/hooks/career/careerHelpers";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { talentOnboardingStatusQueryKey } from "@/hooks/career/useTalentOnboardingStatus";
import { useHtmlClass } from "@/hooks/useHtmlClass";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  getTalentNetworkProfileInputOptions,
  type TalentNetworkEngagementOptionId,
  type TalentNetworkProfileInputType,
} from "@/lib/talentNetworkOptions";
import { cn } from "@/lib/cn";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { getCareerSignupAttributionPayload } from "@/lib/career/signupAttribution";
import { trackSignUp } from "@/lib/ga";
import {
  OFFICIAL_JOBS_ONBOARDING_JOB_PARAM,
  OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM,
  OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH,
} from "@/lib/officialJobs";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import OnboardingLoadingState from "../../components/career/OnboardingLoadingState";
import { useCareerT } from "@/i18n/useCareerT";
import {
  getInitialClientLocalePreference,
  useMessages,
  type Locale,
} from "@/i18n/useMessage";

type CareerT = ReturnType<typeof useCareerT>;

const SLIDE_VARIANTS = {
  enter: (isNext: boolean) => ({
    opacity: 0,
    y: isNext ? 36 : -36,
  }),
  center: {
    opacity: 1,
    y: 0,
  },
  exit: (isNext: boolean) => ({
    opacity: 0,
    y: isNext ? -36 : 36,
  }),
};

const SLIDE_TRANSITION = { duration: 0.22, ease: "easeOut" } as const;

const ONBOARDING_BACKGROUND_CLASS = "bg-bg-basement";

type OnboardingStepDefinition = {
  label: string;
  title: string[];
  description: string[];
  headerClassName: string;
  titleClassName: string;
  descriptionClassName: string;
  bodyClassName: string;
  secondaryBodyClassName?: string;
  footnoteClassName?: string;
};

const headerClassName =
  "flex h-full flex-col justify-start pt-2 text-left pb-1";

const titleClassName =
  "text-[20px] md:text-[24px] font-normal leading-[1.5] text-neutral-primary";
const descriptionClassName =
  "mt-2 text-[13px] md:text-[15px] text-neutral-soft";

const getBasicInfoDescription = (
  t: CareerT,
  officialJobTitle?: string | null
): string[] => {
  const normalizedOfficialJobTitle = officialJobTitle?.trim() || "";
  const description = [
    t(
      "career.onboarding.onboarding.1o4hblb",
      "시작은 이름과 이메일만 있으면 충분해요."
    ),
  ];

  if (normalizedOfficialJobTitle) {
    description.push(
      t(
        "career.onboarding.onboarding.official_job_progress_help",
        "{job} 진행 도와드릴게요.",
        { values: { job: normalizedOfficialJobTitle } }
      )
    );
  }

  return description;
};

const getOnboardingSteps = (
  t: CareerT,
  officialJobTitle?: string | null,
  name?: string | null
): OnboardingStepDefinition[] => {
  const normalizedOfficialJobTitle = officialJobTitle?.trim() || "";
  const candidateName =
    name?.trim() ||
    t("career.onboarding.onboarding.default_candidate_name", "회원");
  const engagementDescription = normalizedOfficialJobTitle
    ? [
        t(
          "career.onboarding.onboarding.official_job_engagement_description",
          "Harper는 확인하신 {jobs} 이외에도 좋은 기회가 보이면 먼저 추천도 드려요. 현재 열려있는 기회를 선택해주세요.",
          { values: { jobs: normalizedOfficialJobTitle } }
        ),
      ]
    : [
        t(
          "career.onboarding.onboarding.0ghhb4f",
          "Harper가 맞춰서 제안할게요."
        ),
      ];
  const visibilityDescription = normalizedOfficialJobTitle
    ? [
        t(
          "career.onboarding.onboarding.official_job_visibility_description",
          "{job} 이외의 기회에 대해서도, {name}님을 추천할 수 있어요. 회사에 먼저 소개해도 괜찮다면 먼저 제안을 받아보실 수 있어요.",
          {
            values: {
              job: normalizedOfficialJobTitle,
              name: candidateName,
            },
          }
        ),
      ]
    : [
        t(
          "career.onboarding.onboarding.1n6ukfv",
          "프로필은 선택한 방식대로만 공유돼요."
        ),
        t(
          "career.onboarding.onboarding.183d95f",
          "대화 내용은 회사에 공개되지 않아요."
        ),
      ];

  return [
    {
      label: t("career.onboarding.onboarding.0yf8432", "기본 정보"),
      title: [
        t(
          "career.onboarding.onboarding.0czo5rp",
          "커리어에도<br />에이전트가 필요합니다."
        ),
      ],
      description: getBasicInfoDescription(t, officialJobTitle),
      headerClassName,
      titleClassName,
      descriptionClassName,
      bodyClassName: "grid w-full gap-5 text-left",
    },
    {
      label: t("career.onboarding.onboarding.1x0fjwc", "기회 유형"),
      title: [
        t(
          "career.onboarding.onboarding.1t9c061",
          "어떤 기회를<br />알아보고 있나요?"
        ),
      ],
      description: engagementDescription,
      headerClassName,
      titleClassName,
      descriptionClassName,
      bodyClassName: "flex flex-col gap-2 w-full",
    },
    {
      label: t("career.onboarding.onboarding.0zapw5l", "프로필 연결"),
      title: [
        t("career.onboarding.onboarding.0j4a2qn", "Harper가 먼저 이해할게요."),
      ],
      description: [
        t(
          "career.onboarding.onboarding.17aqzmx",
          "LinkedIn 또는 이력서 하나면 충분해요."
        ),
        t(
          "career.onboarding.onboarding.0sc411b",
          "추가 정보는 회원님을 더 이해하는 데 도움이 돼요."
        ),
      ],
      headerClassName,
      titleClassName,
      descriptionClassName,
      bodyClassName: "grid w-full grid-cols-3 gap-2",
      secondaryBodyClassName: "mt-5 flex w-full flex-col gap-4 text-left",
    },
    {
      label: t("career.onboarding.onboarding.0zg5btj", "공개 설정"),
      title: [
        t(
          "career.onboarding.onboarding.0t0s7bt",
          "회사에 프로필을 언제 공유할까요?"
        ),
      ],
      description: visibilityDescription,
      headerClassName,
      titleClassName,
      descriptionClassName,
      bodyClassName: "grid w-full gap-3 text-left",
      footnoteClassName: "mt-3 text-[13px] leading-5 text-neutral-muted",
    },
  ];
};

const getDoneStepDefinition = (t: CareerT): OnboardingStepDefinition => ({
  label: t("career.onboarding.onboarding.1jkvik4", "대화 시작"),
  title: [t("career.onboarding.onboarding.1sjsl9m", "정보를 확인했습니다")],
  description: [
    t(
      "career.onboarding.onboarding.0zc98l7",
      "이제 Harper와 몇 가지 기준만 정하면 돼요."
    ),
  ],
  headerClassName,
  titleClassName,
  descriptionClassName,
  bodyClassName: "",
});

const TOTAL_STEPS = 4;

const normalizeLink = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
};

const getSingleQueryParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const normalizeOnboardingJobTitle = (value: string | string[] | undefined) => {
  const trimmed = (getSingleQueryParam(value) ?? "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH);
};

const careerOnboardingSessionKey = (
  userId: string | null,
  locale?: string | null,
  inviteToken?: string | null,
  mail?: string | null,
  emailOnboardingToken?: string | null
) =>
  [
    "career-onboarding-session",
    userId,
    locale?.trim() || null,
    inviteToken?.trim() || null,
    mail?.trim() || null,
    emailOnboardingToken?.trim() || null,
  ] as const;

type OnboardingSessionPayload = {
  conversation?: {
    id?: string | number | null;
    stage?: string | null;
  } | null;
  error?: string;
  hasFirstSubmission?: boolean;
  needsOnboarding?: boolean;
};

type OnboardingStartMessagePayload = {
  content?: string | null;
};

type OnboardingStartPayload = {
  assistantMessages?: OnboardingStartMessagePayload[];
  error?: string;
  kickoff?: {
    acknowledgement?: string | null;
    insight?: string | null;
  } | null;
  profileSubmitMessage?: string | null;
  userMessage?: OnboardingStartMessagePayload | null;
};

const getDefaultDoneUserMessage = (t: CareerT) =>
  t(
    "career.onboarding.onboarding_done.default_user_message_short",
    "제 프로필을 보내드렸어요."
  );

const getDefaultDoneKickoffText = (t: CareerT) =>
  [
    t(
      "career.onboarding.onboarding_done.default_kickoff_thanks",
      "안녕하세요, 정보를 공유해 주셔서 감사합니다."
    ),
    t(
      "career.onboarding.onboarding_done.default_kickoff_profile",
      "이제 제가 맞을 만한 기회들을 찾아보고, 인재 연결을 요청한 회사 중 괜찮은 곳이 있으면 소개 및 연결까지 해드릴게요."
    ),
  ].join("\n\n");

const getDoneAgentIntroBase = (t: CareerT) =>
  t(
    "career.onboarding.onboarding_done.default_agent_intro",
    "더 좋은 연결을 도와드리기 위해 지금 어떤 상황이신지, 어떤 기회를 원하시는지 몇 가지만 더 여쭤보고 싶어요. 보통 5분 정도면 충분합니다."
  );

const getDoneEngagementCopy = (
  id: TalentNetworkEngagementOptionId,
  t: CareerT
) => {
  if (id === "advisor") {
    return t(
      "career.onboarding.onboarding.1gsa1bx",
      "부담 없이 이야기 나눠볼 수 있는 어드바이저 기회"
    );
  }
  if (id === "fractional") {
    return t(
      "career.onboarding.onboarding.1das976",
      "지금 하시는 일과 병행하기 좋은 파트타임/프로젝트 기회"
    );
  }
  if (id === "full_time") {
    return t(
      "career.onboarding.onboarding.13259px",
      "바로 검토해볼 만한 풀타임 포지션"
    );
  }
  return "";
};

const getOnboardingEngagementCopy = (
  t: CareerT
): Record<
  TalentNetworkEngagementOptionId,
  { label: string; description: string }
> => ({
  advisor: {
    label: t("career.onboarding.onboarding.1bulcyv", "어드바이저"),
    description: t(
      "career.onboarding.onboarding.1a74y8o",
      "초기 팀을 돕거나 전략적으로 기여하고 싶어요"
    ),
  },
  fractional: {
    label: t("career.onboarding.onboarding.1k0o8vf", "파트타임·프로젝트"),
    description: t(
      "career.onboarding.onboarding.06ilxsj",
      "지금 자리는 유지하면서, 병행할 수 있는 일을 찾아요"
    ),
  },
  full_time: {
    label: t("career.onboarding.onboarding.166o9pn", "풀타임"),
    description: t(
      "career.onboarding.onboarding.15izros",
      "제대로 된 기회라면 이직도 열어두고 있어요"
    ),
  },
});

const buildDoneAgentIntro = (
  selectedEngagements: TalentNetworkEngagementOptionId[],
  t: CareerT
) => {
  const selectedCopies = selectedEngagements
    .map((id) => getDoneEngagementCopy(id, t))
    .filter(Boolean);
  if (selectedCopies.length === 0) return getDoneAgentIntroBase(t);

  return t(
    "career.onboarding.onboarding_done.selected_agent_intro",
    "대화가 끝나면 {targetCopy}부터 찾아보고, 소개와 연결도 도와드릴게요.",
    {
      values: {
        targetCopy: selectedCopies.join(", "),
      },
    }
  );
};

const getOfficialJobDoneAgentIntro = (
  officialJobTitle: string,
  locale: Locale
) => {
  if (locale === "en") {
    return `I'm your career agent, so I can keep looking across a range of opportunities that may fit you over time. Since you came in through ${officialJobTitle}, I'll start with this role first, and guide the next step. A quick five-minute conversation is enough.`;
  }

  return `저는 한 가지 공고만 처리하는 지원 폼이 아니라, 회원님에게 맞을 수 있는 다양한 기회를 함께 찾아보는 커리어 에이전트예요. 이번에는 ${officialJobTitle}로 들어오셨으니 5분 커리어 커피챗 이후 우선적으로 검토되실 수 있게 하겠습니다.`;
};

const getOfficialJobDoneReadyCopy = (
  officialJobTitle: string,
  locale: Locale
) => {
  if (locale === "en") {
    return {
      description: `Since you came in through ${officialJobTitle}, I'll start with that role and next steps.\nFive minutes is enough.`,
    };
  }

  return {
    description: `${officialJobTitle}로 들어오셨으니 가벼운 대화 이후 핏이 맞다고 판단되면 연결 제안을 드릴 예정이에요. 5분 정도면 충분해요.`,
  };
};

const getOnboardingKickoffText = (
  payload: OnboardingStartPayload,
  t: CareerT
) => {
  const acknowledgement = payload.kickoff?.acknowledgement?.trim();
  const insight = payload.kickoff?.insight?.trim();
  const structuredText = [acknowledgement, insight]
    .filter(Boolean)
    .join("\n\n");

  if (structuredText) return structuredText;

  const assistantText = payload.assistantMessages
    ?.map((message) => message.content?.trim())
    .find(Boolean);

  return assistantText || getDefaultDoneKickoffText(t);
};

const useStreamingText = (text: string) => {
  const [streamedText, setStreamedText] = useState("");

  useEffect(() => {
    setStreamedText("");
    if (!text) return;

    let index = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const increment = index < 40 ? 1 : 2;
      index = Math.min(text.length, index + increment);
      setStreamedText(text.slice(0, index));

      if (index < text.length) {
        timeoutId = setTimeout(tick, index < 40 ? 26 : 14);
      }
    };

    timeoutId = setTimeout(tick, 420);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [text]);

  return streamedText;
};

const ProgressBar = ({
  step,
  totalSteps = TOTAL_STEPS,
}: {
  step: number;
  totalSteps?: number;
}) => {
  const currentStep = Math.min(Math.max(step, 0), totalSteps);

  return (
    <div
      aria-hidden="true"
      className="grid h-[3px] w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: totalSteps }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-full rounded-full transition-colors duration-300",
            index < currentStep
              ? "bg-neutral-1000"
              : index === currentStep
                ? "bg-neutral-1000"
                : "bg-neutral-1000-a10"
          )}
        />
      ))}
    </div>
  );
};

const OnboardingTopBar = ({
  showProgress = true,
  step,
}: {
  showProgress?: boolean;
  step: number;
}) => (
  <div
    className={cn(
      "flex shrink-0 flex-col justify-center",
      showProgress ? "h-16 gap-4" : "h-8"
    )}
  >
    <div className="font-hedvig font-bold text-[21px] leading-none text-neutral-primary">
      Harper
    </div>
    {showProgress ? <ProgressBar step={step} /> : null}
  </div>
);

const OnboardingFrame = ({
  aside,
  children,
  footer,
  progressStep,
  showProgress = true,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  progressStep: number;
  showProgress?: boolean;
  title: ReactNode;
}) => {
  const topBar = (
    <OnboardingTopBar showProgress={showProgress} step={progressStep} />
  );
  const titleSlot = title ? (
    <div className="h-[120px] shrink-0">{title}</div>
  ) : null;

  if (aside) {
    return (
      <div className="mx-auto flex min-h-svh w-full justify-center px-4 pb-8 pt-16 md:py-16">
        <div className="relative grid w-full max-w-[900px] gap-6 lg:block lg:h-[calc(100svh-8rem)] lg:min-h-[520px]">
          <div className="order-1 lg:w-[400px]">{topBar}</div>
          <div className="order-2 mx-auto flex min-h-[360px] w-full max-w-[390px] md:max-w-[640px] lg:absolute lg:left-[480px] lg:top-0 lg:h-full lg:min-h-0 lg:w-[440px] lg:max-w-none xl:left-[560px] xl:w-[520px]">
            {aside}
          </div>
          <div
            className={cn(
              "order-3 flex min-h-[460px] w-full flex-col lg:absolute lg:bottom-0 lg:left-0 lg:min-h-0 lg:w-[400px]",
              showProgress ? "lg:top-16" : "lg:top-8"
            )}
          >
            {titleSlot}
            <section className="min-h-0 flex-1 overflow-visible py-6 pr-1 lg:overflow-y-auto lg:overscroll-contain lg:scrollbar-thin lg:scrollbar-track-transparent lg:scrollbar-thumb-neutral-1000-a10 lg:hover:scrollbar-thumb-neutral-1000-a50">
              {children}
            </section>
            <footer className="shrink-0 pt-4">{footer}</footer>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-svh w-full justify-center px-4 pb-4 pt-16 md:py-16">
      <div className="grid w-full max-w-[400px] gap-8">
        <div className="flex h-[calc(100svh-5rem)] min-h-[520px] w-full flex-col md:h-[calc(100svh-8rem)]">
          {topBar}
          {titleSlot}
          <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-8 pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 hover:scrollbar-thumb-neutral-1000-a50">
            {children}
          </section>
          <footer className="shrink-0 pt-4">{footer}</footer>
        </div>
      </div>
    </div>
  );
};

const OnboardingStepHeader = ({
  stepDefinition,
}: {
  stepDefinition: OnboardingStepDefinition;
}) => (
  <header className={stepDefinition.headerClassName}>
    <Text
      as="h1"
      variant="head1"
      tone="primary"
      className={stepDefinition.titleClassName}
    >
      {stepDefinition.title.map((line, index) => (
        <span
          key={`${index}-${line}`}
          className="block text-balance break-keep"
          dangerouslySetInnerHTML={{ __html: line }}
        />
      ))}
    </Text>
    <Text as="p" variant="body" tone="subtle" className="mt-2 ">
      {stepDefinition.description.map((line, index) => (
        <span
          key={`${index}-${line}`}
          className="block text-balance break-keep"
        >
          {line}
        </span>
      ))}
    </Text>
  </header>
);

const OnboardingFieldLabel = ({ children }: { children: ReactNode }) => (
  <Text
    as="label"
    variant="label"
    tone="neutral"
    className="text-sm font-normal"
  >
    {children}
  </Text>
);

const LinkInput = ({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="flex w-full flex-col gap-2 md:flex-row md:items-center">
    <Text
      as="div"
      variant="body"
      tone="neutral"
      className="w-full text-[14px] font-normal md:w-1/4"
    >
      {label}
    </Text>
    <Input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="font-light"
    />
  </div>
);

const ProfileInputToggle = ({
  active,
  id,
  label,
  onClick,
  requiredBadge,
}: {
  active: boolean;
  id: TalentNetworkProfileInputType;
  label: string;
  onClick: () => void;
  requiredBadge?: string;
}) => (
  <BareButton
    type="button"
    onClick={onClick}
    className={cn(
      "flex relative h-[104px] w-full shrink-0 flex-col items-center justify-center gap-2 rounded-[8px] border px-3 py-3 text-center text-[13px] font-medium leading-4 transition",
      active
        ? "border-neutral-800 bg-bg-weak"
        : "border-neutral-1000-a05 bg-bg-floating text-neutral-primary hover:border-neutral-800 hover:bg-bg-weak"
    )}
  >
    <div className="absolute top-1.5 right-1.5">
      <Checkbox checked={active} />
    </div>
    <span
      className={cn(
        "flex h-12 w-12 items-center justify-center text-neutral-muted"
      )}
    >
      <ProfileInputIcon id={id} />
    </span>
    <span className="flex flex-row gap-0.5">
      <span className="line-clamp-2">{label}</span>
      {requiredBadge && <span className="text-critical">{requiredBadge}</span>}
    </span>
  </BareButton>
);

const ProfileInputIcon = ({ id }: { id: TalentNetworkProfileInputType }) => {
  if (id === "linkedin") {
    return (
      <ProfileIconMask src="/images/logos/linkedin.svg" sizeClass="h-7 w-7" />
    );
  }

  if (id === "github") {
    return (
      <span className="flex items-center gap-0.5">
        <ProfileIconMask src="/svgs/github.svg" sizeClass="h-6 w-6" />
      </span>
    );
  }

  if (id === "scholar") {
    return (
      <ProfileIconMask src="/svgs/scholar.svg" sizeClass="h-[24px] w-[24px]" />
    );
  }

  if (id === "website") {
    return <Globe2 className="h-6 w-6" />;
  }

  return <FileText className="h-6 w-6" />;
};

const ProfileIconMask = ({
  sizeClass,
  src,
}: {
  sizeClass: string;
  src: string;
}) => (
  <span
    aria-hidden="true"
    className={cn("block bg-neutral-1000/80", sizeClass)}
    style={{
      WebkitMaskImage: `url(${src})`,
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      maskImage: `url(${src})`,
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
    }}
  />
);

const EngagementOptionIcon = ({
  id,
}: {
  id: TalentNetworkEngagementOptionId;
}) => {
  const className = cn("h-6 w-6 transition-colors text-neutral-primary");

  if (id === "full_time") {
    return <BriefcaseBusiness className={className} strokeWidth={1.5} />;
  }

  if (id === "fractional") {
    return <Clock3 className={className} strokeWidth={1.5} />;
  }

  return <Handshake className={className} strokeWidth={1.5} />;
};

const EngagementCardButton = ({
  active,
  description,
  Icon,
  id,
  label,
  onClick,
}: {
  active: boolean;
  description?: string;
  Icon?: LucideIcon;
  id?: TalentNetworkEngagementOptionId;
  label: string;
  onClick: () => void;
}) => (
  <BareButton
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full flex-row gap-4 text-neutral-primary items-center justify-center rounded-[8px] border px-4 py-5 text-center transition duration-300",
      active
        ? "border-neutral-800 bg-bg-weak"
        : "border-neutral-1000-a05 bg-bg-floating text-neutral-primary hover:border-neutral-800 hover:bg-bg-weak"
    )}
  >
    <div className="flex w-full items-center gap-3">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-bg-weak"
        )}
        aria-hidden="true"
      >
        {Icon ? (
          <Icon className="h-6 w-6 text-neutral-primary" strokeWidth={1.5} />
        ) : id ? (
          <EngagementOptionIcon id={id} />
        ) : null}
      </span>

      <div className="min-w-0 flex-1 flex flex-col items-start justify-start gap-1">
        <span className="text-[15px] leading-6">{label}</span>
        {description && (
          <span
            className="text-[13px] leading-5 text-neutral-muted text-left"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}
      </div>

      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        <Checkbox checked={active} />
      </div>
    </div>
  </BareButton>
);

type OnboardingProfileVisibility = "open_to_matches" | "exceptional_only";

const DEFAULT_ONBOARDING_PROFILE_VISIBILITY: OnboardingProfileVisibility =
  "open_to_matches";

const getOnboardingProfileVisibilityOptions = (
  t: CareerT
): Array<{
  id: OnboardingProfileVisibility;
  label: string;
  description: string;
  sub: string;
  Icon: LucideIcon;
}> => [
  {
    id: "open_to_matches",
    label: t("career.onboarding.onboarding.0lliiks", "Harper가 먼저 공유해요"),
    description: t(
      "career.onboarding.onboarding.1at9nca",
      "잘 맞는 기회라고 판단되면 Harper가 먼저 회사에 프로필을 공유해요. 관심이 오면 바로 알려드려요."
    ),
    sub: t(
      "career.onboarding.onboarding.03b3ba6",
      "매칭에 필요한 프로필 정보만 공유돼요. 공개하지 않을 회사를 설정할 수 있어요."
    ),
    Icon: ShieldCheck,
  },
  {
    id: "exceptional_only",
    label: t("career.onboarding.onboarding.0wcgte0", "내가 먼저 확인해요"),
    description: t(
      "career.onboarding.onboarding.0nzlxqj",
      "Harper가 먼저 기회를 가져오고, 내가 확인한 뒤에만 프로필이 공유돼요."
    ),
    sub: t(
      "career.onboarding.onboarding.03b3ba6",
      "매칭에 필요한 프로필 정보만 공유돼요. 공개하지 않을 회사를 설정할 수 있어요."
    ),
    Icon: ShieldAlert,
  },
];

const ResumeUploadInput = ({
  fileName,
  onFileSelect,
}: {
  fileName: string;
  onFileSelect: (file: File | null, source: ResumeFileSelectSource) => void;
}) => {
  const t = useCareerT();

  return (
    <ResumeDropzone
      inputId="career-onboarding-resume-upload"
      accept=".pdf,.docx,.txt,.md"
      fileName={fileName}
      onFileSelect={onFileSelect}
      onFileReject={() => {
        showToast({
          message: t(
            "career.resume_dropzone.unsupported_file",
            "지원하는 이력서 파일 형식만 업로드해 주세요."
          ),
          variant: "white",
        });
      }}
      title={t("career.onboarding.onboarding.13vjc2d", "이력서/CV 업로드")}
      description={t(
        "career.onboarding.onboarding.1xpgwgk",
        "PDF, DOCX, 텍스트 파일을 올려주세요. 최대 10MB까지 권장합니다."
      )}
      dragTitle={t(
        "career.resume_dropzone.drag_title",
        "여기에 놓으면 업로드됩니다"
      )}
      dragDescription={t(
        "career.resume_dropzone.drag_description",
        "파일을 놓아 이력서를 선택하세요."
      )}
      selectedDescription={t(
        "career.resume_dropzone.selected_description",
        "다른 파일로 바꾸려면 클릭하거나 다시 드롭하세요."
      )}
    />
  );
};

const OnboardingFooterControls = ({
  onNext,
  onPrev,
  step,
}: {
  onNext: () => void;
  onPrev: () => void;
  step: number;
}) => {
  const t = useCareerT();

  return (
    <div className="min-h-[80px] bg-gradient-to-b from-transparent to-bg-basement">
      <div className={cn("flex w-full gap-3 flex-row")}>
        {step > 0 && (
          <AnimatedButton
            type="button"
            variant="secondary"
            size="lg"
            onClick={onPrev}
            className="min-w-[110px] font-normal"
          >
            {t("career.onboarding.onboarding.0wrohr9", "이전")}
          </AnimatedButton>
        )}
        <AnimatedButton
          type="button"
          variant="primary"
          size="lg"
          onClick={onNext}
          className="w-full px-4 font-normal bg-neutral-950"
        >
          {step === TOTAL_STEPS - 1
            ? t("career.onboarding.onboarding.0cvpvmv", "기회 탐색 시작하기")
            : step === 0
              ? t("career.onboarding.onboarding.1gr43li", "Harper 시작하기")
              : t("career.onboarding.onboarding.0wbopf1", "다음")}
        </AnimatedButton>
      </div>
      <div
        className={`mt-2 flex min-h-5 items-center ${step === 0 ? "justify-center" : "justify-end"} text-[12px] leading-5 text-neutral-soft`}
      >
        {step === TOTAL_STEPS - 1 ? (
          <span>
            {t(
              "career.onboarding.onboarding.0am0h8h",
              "분석까지 약 2분 걸려요"
            )}
          </span>
        ) : (
          <span>
            press <Badge>Enter</Badge>
          </span>
        )}
      </div>
    </div>
  );
};

const DoneState = ({
  kickoffText,
  name,
  officialJobTitle,
  onStartCall,
  onStartChat,
  selectedEngagements,
  userMessage,
}: {
  kickoffText: string;
  name: string;
  officialJobTitle?: string | null;
  onStartCall: () => void;
  onStartChat: () => void;
  selectedEngagements: TalentNetworkEngagementOptionId[];
  userMessage: string;
}) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const normalizedOfficialJobTitle = officialJobTitle?.trim() || "";

  const doneAgentIntro = useMemo(
    () =>
      normalizedOfficialJobTitle
        ? getOfficialJobDoneAgentIntro(normalizedOfficialJobTitle, locale)
        : buildDoneAgentIntro(selectedEngagements, t),
    [locale, normalizedOfficialJobTitle, selectedEngagements, t]
  );
  const fullHarperText = useMemo(
    () => [kickoffText.trim(), doneAgentIntro].filter(Boolean).join("\n\n"),
    [doneAgentIntro, kickoffText]
  );
  const displayName =
    name.trim() || t("career.onboarding.onboarding_done.default_name", "회원");

  return (
    <OnboardingFrame
      aside={
        <DoneConversationPreview
          assistantText={fullHarperText}
          userMessage={userMessage}
        />
      }
      progressStep={TOTAL_STEPS}
      showProgress={false}
      title={null}
      footer={
        <div className="min-h-[112px] bg-gradient-to-b from-transparent to-bg-basement">
          <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
            <AnimatedButton
              type="button"
              size="lg"
              variant="secondary"
              onClick={onStartChat}
              className="w-full px-3 font-normal"
            >
              {t("career.onboarding.onboarding_done.chat_cta", "채팅으로 하기")}
            </AnimatedButton>
            <AnimatedButton
              type="button"
              size="lg"
              variant="primary"
              onClick={onStartCall}
              className="w-full px-3 font-normal bg-neutral-950"
            >
              {t("career.onboarding.onboarding_done.call_cta", "5분 통화하기")}
            </AnimatedButton>
          </div>
          <div className="mt-4 flex items-start justify-between gap-3 text-[12px] leading-5 text-neutral-soft">
            <Text as="p" variant="caption" tone="subtle" className="min-w-0">
              {t(
                "career.onboarding.onboarding_done.privacy_note",
                "대화 내용은 안전하게 보호되며, 오직 {name}님의 더 나은 커리어 기회를 찾는 데에만 활용돼요.",
                { values: { name: displayName } }
              )}
            </Text>
            <Badge
              variant="solid"
              size="lg"
              radius="md"
              className="h-8 shrink-0 px-3 text-[13px] hidden md:flex items-center"
            >
              Enter
            </Badge>
          </div>
        </div>
      }
    >
      <DoneReadyBody officialJobTitle={normalizedOfficialJobTitle} />
    </OnboardingFrame>
  );
};

const DoneReadyBody = ({
  officialJobTitle,
}: {
  officialJobTitle?: string | null;
}) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const normalizedOfficialJobTitle = officialJobTitle?.trim() || "";
  const officialJobCopy = useMemo(
    () =>
      normalizedOfficialJobTitle
        ? getOfficialJobDoneReadyCopy(normalizedOfficialJobTitle, locale)
        : null,
    [locale, normalizedOfficialJobTitle]
  );
  const title = t(
    "career.onboarding.onboarding_done.title",
    "잠깐 커피챗 가능할까요?"
  );
  const description =
    officialJobCopy?.description ??
    t(
      "career.onboarding.onboarding_done.description",
      "더 좋은 매칭을 위해 현재 상황과 희망하시는 기회에 대해 몇 가지 여쭤보고 싶어요. 솔직하게 답변을 주면 더 좋은 매칭을 해드릴 수 있어요.\n5분 정도면 충분해요."
    );

  return (
    <div className="flex min-h-full flex-col items-center justify-start pt-8 text-center">
      <div className="relative">
        <Face status="idle" size={160} aria-label="Harper" priority />
        <span className="absolute -right-2 top-4 flex h-10 min-w-14 items-center justify-center rounded-[18px] bg-bg-floating px-4 shadow-[0_10px_28px_rgba(31,28,26,0.10)]">
          <span className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
          </span>
        </span>
        <span className="absolute -left-4 bottom-7 flex h-10 min-w-14 items-center justify-center rounded-[18px] bg-bg-floating px-4 shadow-[0_10px_28px_rgba(31,28,26,0.10)]">
          <span className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
          </span>
        </span>
      </div>

      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-neutral-1000-a05 bg-bg-floating px-3 py-1.5 text-[13px] font-normal leading-none text-neutral-muted shadow-sm">
        <span className="h-2 w-2 rounded-full bg-positive" />
        {t("career.onboarding.onboarding_done.ready_badge", "대화 준비 완료")}
      </div>

      <Text
        as="h1"
        variant="head2"
        tone="primary"
        className="mt-10 text-[18px] md:text-[22px] font-medium leading-8 tracking-normal"
      >
        {title}
      </Text>
      <Text
        as="p"
        variant="body"
        tone="subtle"
        className="mt-3 max-w-[390px] text-[14px] md:text-[14px] font-light leading-5"
      >
        {description.split("\n").map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Text>
    </div>
  );
};

const DoneConversationPreview = ({
  assistantText,
  userMessage,
}: {
  assistantText: string;
  userMessage: string;
}) => {
  const t = useCareerT();
  const streamedText = useStreamingText(assistantText);
  const isStreamComplete =
    assistantText.length > 0 && streamedText.length >= assistantText.length;
  const paragraphs = streamedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const userBubbleText =
    userMessage?.trim() ||
    t(
      "career.onboarding.onboarding_done.default_user_message",
      "제 프로필을 보내드렸어요."
    );

  return (
    <aside className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="relative flex min-h-full items-start md:items-center justify-center">
        <div className="w-full max-w-[380px]">
          <div className="flex justify-end">
            <div className="max-w-[84%] rounded-[15px] bg-neutral-1000 px-3.5 py-2.5 text-[14px] md:text-[14px] font-normal leading-5 text-neutral-00 shadow-sm">
              {userBubbleText}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-floating font-hedvig text-[18px] font-bold text-neutral-primary shadow-sm">
              h.
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              {paragraphs.map((paragraph, index) => (
                <div
                  key={`${index}-${paragraph.slice(0, 14)}`}
                  className="w-fit max-w-full rounded-[15px] bg-bg-floating px-3.5 py-2.5 text-[14px] md:text-[14px] font-normal leading-6 text-neutral-primary shadow-sm"
                >
                  {paragraph}
                  {index === paragraphs.length - 1 && !isStreamComplete ? (
                    <span className="ml-1 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-neutral-1000-a50" />
                  ) : null}
                </div>
              ))}
              <div className="flex w-fit items-center gap-1.5 rounded-[15px] bg-bg-floating px-3.5 py-2.5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-1000-a10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

const OnboardingLoadingBody = () => {
  const t = useCareerT();

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-full flex-col items-center justify-center text-center"
    >
      <Face
        status="closing"
        size={160}
        flipped
        expressionOffset={{ x: -4, y: 3 }}
        aria-label="Harper"
        priority
      />

      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-neutral-1000-a05 bg-bg-floating px-3 py-1.5 text-[13px] font-medium leading-none text-neutral-muted shadow-sm">
        <span className="h-2 w-2 rounded-full bg-primary" />
        {t(
          "career.onboarding.onboarding_loading_state.analyzing_badge",
          "Harper가 분석 중이에요"
        )}
      </div>

      <Text
        as="h1"
        variant="head2"
        tone="primary"
        className="mt-6 md:mt-14 text-[18px] md:text-[22px] font-medium leading-8 tracking-normal"
      >
        {t(
          "career.onboarding.onboarding_loading_state.19pgngy",
          "프로필을 읽고 있어요"
        )}
      </Text>
      <Text
        as="p"
        variant="body"
        tone="subtle"
        className="mt-2 text-[13px] md:text-[15px] leading-6"
      >
        {t(
          "career.onboarding.onboarding_loading_state.0ouyje6",
          "LinkedIn과 이력서에서 배경과 경험을 확인하고 있습니다."
        )}
      </Text>
    </div>
  );
};

const OnboardingLoadingFooter = () => {
  const t = useCareerT();

  return (
    <div className="min-h-[112px] bg-gradient-to-b from-transparent to-bg-basement">
      <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
        <AnimatedButton
          type="button"
          variant="secondary"
          size="lg"
          disabled
          className="w-full font-normal disabled:opacity-100"
        >
          {t("career.onboarding.onboarding.0wrohr9", "이전")}
        </AnimatedButton>
        <AnimatedButton
          type="button"
          variant="primary"
          size="lg"
          aria-label={"Harper가 분석 중이에요"}
          className="w-full font-normal bg-neutral-950"
        >
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        </AnimatedButton>
      </div>
      <Text
        as="p"
        variant="caption"
        tone="subtle"
        className="mt-3 text-[12px] leading-5"
      >
        {t(
          "career.onboarding.onboarding_loading_state.footer_note",
          "분석까지 약 1분 걸려요. 하퍼가 좋은 추천을 할 수 있도록 조금만 기다려주세요."
        )}
      </Text>
    </div>
  );
};

const CareerNetworkOnboardingContent = () => {
  const t = useCareerT();
  const { locale } = useMessages();

  useHtmlClass("noneoverscroll");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, authLoading } = useCareerAuth();
  const email = String(user?.email ?? "")
    .trim()
    .toLowerCase();
  const { fetchWithAuth } = useCareerApi();
  const logCareerEvent = useCareerLogEvent();
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [conversationId, setConversationId] = useState("");
  const [name, setName] = useState("");
  const [selectedProfileInputs, setSelectedProfileInputs] = useState<
    TalentNetworkProfileInputType[]
  >(["linkedin"]);
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [scholar, setScholar] = useState("");
  const [website, setWebsite] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [selectedEngagements, setSelectedEngagements] = useState<
    TalentNetworkEngagementOptionId[]
  >([]);
  const [profileVisibility, setProfileVisibility] =
    useState<OnboardingProfileVisibility>(
      DEFAULT_ONBOARDING_PROFILE_VISIBILITY
    );
  const [submitState, setSubmitState] = useState<"form" | "loading" | "done">(
    "form"
  );
  const defaultDoneUserMessage = useMemo(
    () => getDefaultDoneUserMessage(t),
    [t]
  );
  const defaultDoneKickoffText = useMemo(
    () => getDefaultDoneKickoffText(t),
    [t]
  );
  const officialJobTitleParam =
    router.query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM];
  const officialJobTitle = useMemo(
    () => normalizeOnboardingJobTitle(officialJobTitleParam),
    [officialJobTitleParam]
  );
  const officialJobSlugParam =
    router.query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM];
  const officialJobSlug = useMemo(
    () => getSingleQueryParam(officialJobSlugParam)?.trim() || "",
    [officialJobSlugParam]
  );
  const onboardingSteps = useMemo(
    () => getOnboardingSteps(t, officialJobTitle, name),
    [officialJobTitle, name, t]
  );
  const doneStepDefinition = useMemo(() => getDoneStepDefinition(t), [t]);
  const onboardingEngagementCopy = useMemo(
    () => getOnboardingEngagementCopy(t),
    [t]
  );
  const profileInputOptions = useMemo(
    () => getTalentNetworkProfileInputOptions(locale),
    [locale]
  );
  const profileVisibilityOptions = useMemo(
    () => getOnboardingProfileVisibilityOptions(t),
    [t]
  );
  const [doneUserMessage, setDoneUserMessage] = useState(
    defaultDoneUserMessage
  );
  const [doneKickoffText, setDoneKickoffText] = useState(
    defaultDoneKickoffText
  );
  const userId = user?.id ?? null;
  const inviteToken = getSingleQueryParam(router.query.invite)?.trim() || null;
  const mail = getSingleQueryParam(router.query.mail)?.trim() || null;
  const emailOnboardingToken =
    getSingleQueryParam(
      router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]
    )?.trim() || null;
  const previewSubmitState = useMemo(() => {
    if (process.env.NODE_ENV === "production" || !router.isReady) return null;

    const value = getSingleQueryParam(router.query.previewSubmitState);
    return value === "form" || value === "loading" || value === "done"
      ? value
      : null;
  }, [router.isReady, router.query.previewSubmitState]);
  const isPreviewSubmitState = previewSubmitState !== null;
  const effectiveSubmitState = previewSubmitState ?? submitState;
  const onboardingNextPath = router.asPath || "/career/onboarding";
  const requestLocale = useMemo(
    () =>
      typeof window === "undefined"
        ? locale
        : getInitialClientLocalePreference(),
    [locale]
  );
  const sessionQueryKey = useMemo(
    () =>
      careerOnboardingSessionKey(
        userId,
        requestLocale,
        inviteToken,
        mail,
        emailOnboardingToken
      ),
    [emailOnboardingToken, inviteToken, mail, requestLocale, userId]
  );
  const lastSavedBasicInfoRef = useRef("");

  const fetchOnboardingSession = useCallback(async () => {
    const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        ...getCareerSignupAttributionPayload(),
        emailOnboardingToken: emailOnboardingToken || undefined,
        inviteToken: inviteToken || undefined,
        locale: requestLocale,
        mail: mail || undefined,
      }),
    });
    if (!bootstrapRes.ok) {
      const payload = await bootstrapRes.json().catch(() => ({}));
      throw new Error(
        getErrorMessage(
          payload,
          t(
            "career.onboarding.onboarding.1sy0934",
            "로그인 정보를 초기화하지 못했습니다."
          )
        )
      );
    }
    const bootstrapPayload = await bootstrapRes.json().catch(() => ({}));
    if (bootstrapPayload?.created === true) {
      trackSignUp({
        flow: "career_onboarding",
        method: "email_or_existing_session",
      });
    }

    const sessionParams = new URLSearchParams({
      locale: requestLocale,
      statusOnly: "1",
    });
    const sessionRes = await fetchWithAuth(
      `/api/talent/session?${sessionParams.toString()}`
    );
    const payload = (await sessionRes
      .json()
      .catch(() => ({}))) as OnboardingSessionPayload;
    if (!sessionRes.ok) {
      throw new Error(
        getErrorMessage(
          payload,
          t(
            "career.onboarding.onboarding.1sh2r2c",
            "온보딩 세션을 불러오지 못했습니다."
          )
        )
      );
    }

    return payload;
  }, [
    emailOnboardingToken,
    fetchWithAuth,
    inviteToken,
    mail,
    requestLocale,
    t,
  ]);

  useEffect(() => {
    if (!user) return;
    const nextName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      (typeof user.email === "string" ? user.email.split("@")[0] : "");
    setName((current) => current || String(nextName ?? ""));
  }, [user]);

  useEffect(() => {
    if (!router.isReady) return;
    if (isPreviewSubmitState) return;
    if (authLoading) return;

    if (!userId) {
      void router.replace(
        `/career_login?next=${encodeURIComponent(onboardingNextPath)}&source=network`
      );
      return;
    }

    let cancelled = false;

    const loadSession = async () => {
      const cachedSession =
        queryClient.getQueryData<OnboardingSessionPayload>(sessionQueryKey);
      if (!cachedSession && !conversationId) {
        setBootstrapLoading(true);
      }

      try {
        const payload = await queryClient.ensureQueryData({
          queryKey: sessionQueryKey,
          queryFn: fetchOnboardingSession,
          gcTime: 30 * 60_000,
          staleTime: Infinity,
        });

        if (cancelled) return;

        if (
          payload?.conversation?.stage !== "profile" &&
          payload?.needsOnboarding !== true
        ) {
          const query: Record<string, string> = {};
          if (inviteToken) query.invite = inviteToken;
          if (mail) query.mail = mail;
          if (emailOnboardingToken) {
            query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] = emailOnboardingToken;
          }
          if (router.query.start === "call" || router.query.start === "chat") {
            query.start = router.query.start;
          }

          void router.replace({
            pathname: "/career",
            query: Object.keys(query).length > 0 ? query : undefined,
          });
          return;
        }

        setConversationId(String(payload?.conversation?.id ?? ""));
        setSubmitState(payload?.hasFirstSubmission ? "done" : "form");
      } catch (error) {
        if (cancelled) return;
        showToast({
          message:
            error instanceof Error
              ? error.message
              : t(
                  "career.onboarding.onboarding.1sh2r2c",
                  "온보딩 세션을 불러오지 못했습니다."
                ),
          variant: "error",
          duration: 5000,
        });
      } finally {
        if (!cancelled) {
          setBootstrapLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    conversationId,
    fetchOnboardingSession,
    emailOnboardingToken,
    inviteToken,
    isPreviewSubmitState,
    mail,
    onboardingNextPath,
    queryClient,
    router,
    router.isReady,
    sessionQueryKey,
    t,
    userId,
  ]);

  const saveBasicInfo = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !isValidEmail(trimmedEmail)) return;

    const signature = `${trimmedName}\n${trimmedEmail}`;
    if (lastSavedBasicInfoRef.current === signature) return;

    const response = await fetchWithAuth("/api/talent/onboarding/basic-info", {
      method: "POST",
      body: JSON.stringify({
        locale,
        name: trimmedName,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          payload,
          t(
            "career.onboarding.onboarding.0eumq1b",
            "기본 정보를 저장하지 못했습니다."
          )
        )
      );
    }

    lastSavedBasicInfoRef.current = signature;
    queryClient.removeQueries({ queryKey: ["career-session"] });
  }, [email, fetchWithAuth, locale, name, queryClient, t]);

  const saveCurrentStep = useCallback(
    async (currentStep: number) => {
      if (currentStep !== 0) return;

      try {
        await saveBasicInfo();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t(
                "career.onboarding.onboarding.0eumq1b",
                "기본 정보를 저장하지 못했습니다."
              );
        showToast({ message, variant: "white" });
        throw error;
      }
    },
    [saveBasicInfo, t]
  );

  const handleProfileInputToggle = useCallback(
    (option: TalentNetworkProfileInputType) => {
      logCareerEvent(`click_onboarding_profile_input_${option}`);
      setSelectedProfileInputs((current) =>
        current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option]
      );
    },
    [logCareerEvent]
  );

  const handleEngagementToggle = useCallback(
    (option: TalentNetworkEngagementOptionId) => {
      logCareerEvent(`click_onboarding_engagement_${option}`);
      setSelectedEngagements((current) =>
        current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option]
      );
    },
    [logCareerEvent]
  );

  const links = useMemo(
    () =>
      [
        selectedProfileInputs.includes("linkedin")
          ? normalizeLink(linkedin)
          : "",
        selectedProfileInputs.includes("github") ? normalizeLink(github) : "",
        selectedProfileInputs.includes("scholar") ? normalizeLink(scholar) : "",
        selectedProfileInputs.includes("website") ? normalizeLink(website) : "",
      ].filter(Boolean),
    [github, linkedin, scholar, selectedProfileInputs, website]
  );

  const linkedinLink = selectedProfileInputs.includes("linkedin")
    ? normalizeLink(linkedin)
    : "";
  const hasLinkedinProfileSignal = isLinkedinProfileLink(linkedinLink);
  const hasRequiredProfileSignal =
    Boolean(resumeFile) || hasLinkedinProfileSignal;

  const validateStep = useCallback(
    (currentStep: number) => {
      if (currentStep === 0) {
        if (!name.trim()) {
          showToast({
            message: t(
              "career.onboarding.onboarding.0ehh5yz",
              "이름을 입력해주세요."
            ),
            variant: "white",
          });
          return false;
        }
        if (!isValidEmail(email.trim())) {
          showToast({
            message: t(
              "career.onboarding.onboarding.09uxsj9",
              "유효한 이메일을 입력해주세요."
            ),
            variant: "white",
          });
          return false;
        }
      }

      if (currentStep === 1) {
        if (selectedEngagements.length === 0) {
          showToast({
            message: t(
              "career.onboarding.onboarding.0w4wbae",
              "찾고 있는 업무 형태를 선택해주세요."
            ),
            variant: "white",
          });
          return false;
        }
      }

      if (currentStep === 2) {
        const hasInvalidLinkedinLink = links.some(
          (link) => isLinkedinLink(link) && !isLinkedinProfileLink(link)
        );
        if (hasInvalidLinkedinLink) {
          showToast({
            message: t(
              "career.onboarding.linkedin_url_invalid",
              "올바른 URL이 아닙니다."
            ),
            variant: "white",
          });
          return false;
        }

        if (!hasRequiredProfileSignal) {
          showToast({
            message: t(
              "career.onboarding.onboarding.0d18cht",
              "이력서나 LinkedIn 링크 중 하나는 꼭 입력해주세요."
            ),
            variant: "white",
          });
          return false;
        }
      }

      return true;
    },
    [email, hasRequiredProfileSignal, links, name, selectedEngagements, t]
  );

  const uploadResumeFile = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetchWithAuth("/api/talent/resume/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.onboarding.onboarding.0yuh7d0",
              "이력서 업로드에 실패했습니다."
            )
          )
        );
      }

      return {
        resumeFileName: String(payload?.resumeFileName ?? file.name),
        resumeStoragePath: String(payload?.resumeStoragePath ?? ""),
      };
    },
    [fetchWithAuth, t]
  );

  const parseResumeText = useCallback(
    async (file: File) => {
      if (isDocxResumeFile(file)) {
        return (await readDocxResumeText(file)).slice(0, 20000);
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetchWithAuth("/api/talent/resume/parse", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.onboarding.onboarding.010bz98",
              "이력서 내용을 읽지 못했습니다."
            )
          )
        );
      }

      return String(payload?.text ?? "")
        .trim()
        .slice(0, 20000);
    },
    [fetchWithAuth, t]
  );

  const submitOnboarding = useCallback(async () => {
    if (submitState === "loading") return;
    if (!conversationId) {
      showToast({
        message: t(
          "career.onboarding.onboarding.0pijbir",
          "온보딩 세션을 아직 준비하지 못했습니다."
        ),
        variant: "error",
        duration: 5000,
      });
      return;
    }

    logCareerEvent("click_onboarding_submit");
    setSubmitState("loading");

    try {
      let resumeFileName: string | undefined;
      let resumeStoragePath: string | undefined;
      let resumeText: string | undefined;

      if (resumeFile) {
        let parsedText = "";
        try {
          parsedText = await parseResumeText(resumeFile);
        } catch (error) {
          if (!hasLinkedinProfileSignal) {
            throw error;
          }
          console.warn(
            "[CareerOnboarding] resume parse failed; continuing with LinkedIn only",
            error
          );
        }

        if (parsedText) {
          const uploadResult = await uploadResumeFile(resumeFile);
          resumeFileName = uploadResult.resumeFileName;
          resumeStoragePath = uploadResult.resumeStoragePath;
          resumeText = parsedText;
        }
      }

      const preferencesRes = await fetchWithAuth("/api/talent/preferences", {
        method: "POST",
        body: JSON.stringify({
          engagementTypes: selectedEngagements,
        }),
      });
      const preferencesPayload = await preferencesRes.json().catch(() => ({}));
      if (!preferencesRes.ok) {
        throw new Error(
          getErrorMessage(
            preferencesPayload,
            t(
              "career.onboarding.onboarding.1kdng2n",
              "선호 정보를 저장하지 못했습니다."
            )
          )
        );
      }
      if (preferencesPayload?.opportunityDiscoveryQueued) {
        showToast({
          message: t(
            "career.onboarding.onboarding.0hobsv6",
            "기회 검색을 시작했습니다."
          ),
          variant: "white",
        });
      }

      const settingsRes = await fetchWithAuth("/api/talent/settings", {
        method: "POST",
        body: JSON.stringify({
          preferredLocale: locale,
          profileVisibility,
          profileVisibilitySource: "onboarding",
        }),
      });
      const settingsPayload = await settingsRes.json().catch(() => ({}));
      if (!settingsRes.ok) {
        throw new Error(
          getErrorMessage(
            settingsPayload,
            t(
              "career.onboarding.onboarding.01ywpeo",
              "프로필 공개 설정을 저장하지 못했습니다."
            )
          )
        );
      }

      const startRes = await fetchWithAuth("/api/talent/onboarding/start", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          links,
          locale,
          name: name.trim(),
          officialJobSlug: officialJobSlug || undefined,
          officialJobTitle: officialJobTitle || undefined,
          resumeFileName,
          resumeStoragePath,
          resumeText,
        }),
      });
      const payload = (await startRes
        .json()
        .catch(() => ({}))) as OnboardingStartPayload;
      if (!startRes.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.onboarding.onboarding.059do1c",
              "프로필 구조화를 시작하지 못했습니다."
            )
          )
        );
      }

      queryClient.removeQueries({ queryKey: ["career-session"] });
      queryClient.removeQueries({ queryKey: sessionQueryKey });
      queryClient.removeQueries({ queryKey: ["career-message-history"] });
      queryClient.removeQueries({ queryKey: ["career-history-opportunities"] });
      queryClient.setQueryData(talentOnboardingStatusQueryKey(userId), {
        needsOnboarding: false,
      });
      setDoneUserMessage(
        payload.profileSubmitMessage?.trim() ||
          payload.userMessage?.content?.trim() ||
          defaultDoneUserMessage
      );
      setDoneKickoffText(getOnboardingKickoffText(payload, t));
      setSubmitState("done");
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : t(
                "career.onboarding.onboarding.1p04ixt",
                "온보딩 제출 중 오류가 발생했습니다."
              ),
        variant: "error",
        duration: 5000,
      });
      setSubmitState("form");
    }
  }, [
    conversationId,
    defaultDoneUserMessage,
    fetchWithAuth,
    hasLinkedinProfileSignal,
    links,
    locale,
    name,
    parseResumeText,
    profileVisibility,
    queryClient,
    resumeFile,
    selectedEngagements,
    sessionQueryKey,
    submitState,
    logCareerEvent,
    officialJobSlug,
    officialJobTitle,
    t,
    uploadResumeFile,
    userId,
  ]);

  const { step, handleNext, handlePrev } = useOnboarding({
    save: saveCurrentStep,
    totalSteps: TOTAL_STEPS,
    beforeNext: validateStep,
    onComplete: submitOnboarding,
    enableWheelNavigation: false,
  });

  const handleLoggedNext = useCallback(() => {
    logCareerEvent(
      step === TOTAL_STEPS - 1
        ? "click_onboarding_submit_button"
        : `click_onboarding_next_step_${step + 1}`
    );
    handleNext();
  }, [handleNext, logCareerEvent, step]);

  const handleLoggedPrev = useCallback(() => {
    logCareerEvent(`click_onboarding_prev_step_${step + 1}`);
    handlePrev();
  }, [handlePrev, logCareerEvent, step]);

  const handleProfileVisibilitySelect = useCallback(
    (value: OnboardingProfileVisibility) => {
      logCareerEvent(`click_onboarding_profile_visibility_${value}`);
      setProfileVisibility(value);
    },
    [logCareerEvent]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if ((step !== 1 && step !== 3) || !/^[1-9]$/.test(event.key)) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const optionIndex = Number(event.key) - 1;
      if (step === 1) {
        const engagement = TALENT_NETWORK_ENGAGEMENT_OPTIONS[optionIndex];
        if (!engagement) return;

        event.preventDefault();
        handleEngagementToggle(engagement.id);
        return;
      }

      const visibility = profileVisibilityOptions[optionIndex];
      if (!visibility) return;

      event.preventDefault();
      handleProfileVisibilitySelect(visibility.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleEngagementToggle,
    handleProfileVisibilitySelect,
    profileVisibilityOptions,
    step,
  ]);

  const currentStepDefinition = onboardingSteps[step] ?? onboardingSteps[0];

  const selectedVisibilityOption =
    profileVisibilityOptions.find(
      (option) => option.id === profileVisibility
    ) ?? profileVisibilityOptions[0];

  const navigateToCareerStart = useCallback(
    (startMode: "call" | "chat") => {
      logCareerEvent(`click_onboarding_done_start_${startMode}`);
      queryClient.setQueryData(talentOnboardingStatusQueryKey(userId), {
        needsOnboarding: false,
      });
      const invite = getSingleQueryParam(router.query.invite);
      const mail = getSingleQueryParam(router.query.mail);
      const emailOnboarding = getSingleQueryParam(
        router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]
      );
      const query: Record<string, string> = { start: startMode };
      if (invite) query.invite = invite;
      if (mail) query.mail = mail;
      if (emailOnboarding) {
        query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] = emailOnboarding;
      }
      if (officialJobTitle || officialJobSlug) {
        query.source = OFFICIAL_JOBS_LANDING_SOURCE;
      }
      if (officialJobTitle) {
        query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM] = officialJobTitle;
      }
      if (officialJobSlug) {
        query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM] = officialJobSlug;
      }

      void router.push({
        pathname: "/career",
        query,
      });
    },
    [
      logCareerEvent,
      officialJobSlug,
      officialJobTitle,
      queryClient,
      router,
      userId,
    ]
  );

  if (!isPreviewSubmitState && (authLoading || bootstrapLoading)) {
    return (
      <main
        className={cn(
          "flex min-h-svh items-center justify-center text-neutral-primary",
          ONBOARDING_BACKGROUND_CLASS
        )}
      >
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-muted" />
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Harper Onboarding</title>
      </Head>
      <main
        className={cn(
          "font-sans text-neutral-primary",
          effectiveSubmitState === "form"
            ? "min-h-svh"
            : "h-svh overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 hover:scrollbar-thumb-neutral-1000-a50",
          ONBOARDING_BACKGROUND_CLASS
        )}
      >
        {effectiveSubmitState === "loading" && (
          <OnboardingFrame
            aside={<OnboardingLoadingState className="h-full" />}
            progressStep={TOTAL_STEPS}
            showProgress={false}
            title={null}
            footer={<OnboardingLoadingFooter />}
          >
            <OnboardingLoadingBody />
          </OnboardingFrame>
        )}

        {effectiveSubmitState === "done" && (
          <DoneState
            kickoffText={doneKickoffText}
            name={name}
            officialJobTitle={officialJobTitle}
            onStartCall={() => navigateToCareerStart("call")}
            onStartChat={() => navigateToCareerStart("chat")}
            selectedEngagements={selectedEngagements}
            userMessage={doneUserMessage}
          />
        )}

        {effectiveSubmitState === "form" && (
          <OnboardingFrame
            progressStep={step}
            title={
              <AnimatePresence mode="wait" custom={true}>
                <motion.div
                  key={`header-${step}`}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  variants={SLIDE_VARIANTS}
                  custom={true}
                  transition={SLIDE_TRANSITION}
                  className="h-full"
                >
                  <OnboardingStepHeader
                    stepDefinition={currentStepDefinition}
                  />
                </motion.div>
              </AnimatePresence>
            }
            footer={
              <OnboardingFooterControls
                step={step}
                onNext={handleLoggedNext}
                onPrev={handleLoggedPrev}
              />
            }
          >
            <AnimatePresence mode="wait" custom={true}>
              <motion.div
                key={`body-${step}`}
                initial="enter"
                animate="center"
                exit="exit"
                variants={SLIDE_VARIANTS}
                custom={true}
                transition={SLIDE_TRANSITION}
                className="flex min-h-full w-full flex-col items-stretch"
              >
                {step === 0 && (
                  <div className={currentStepDefinition.bodyClassName}>
                    <div>
                      <OnboardingFieldLabel>
                        {t(
                          "career.onboarding.onboarding.1njrwx4",
                          "이름 (한글 이름의 경우 한글로 적어주세요.)"
                        )}
                      </OnboardingFieldLabel>
                      <Input
                        autoFocus
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t(
                          "career.onboarding.onboarding.1wh5aat",
                          "이름"
                        )}
                        className="h-12 text-base mt-1"
                      />
                    </div>
                    <div>
                      <OnboardingFieldLabel>
                        {t("career.onboarding.onboarding.17sy1or", "이메일")}
                      </OnboardingFieldLabel>
                      <Input
                        type="email"
                        value={email}
                        readOnly
                        onClick={() =>
                          showToast({
                            message: t(
                              "career.onboarding.onboarding.email_change_requires_verification",
                              "가입 후 이메일 인증을 통해 변경할 수 있습니다."
                            ),
                            variant: "white",
                          })
                        }
                        placeholder="email@example.com"
                        className="h-12 cursor-pointer text-base mt-1"
                      />
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className={currentStepDefinition.bodyClassName}>
                    {TALENT_NETWORK_ENGAGEMENT_OPTIONS.map((option, index) => {
                      const copy = onboardingEngagementCopy[option.id];

                      return (
                        <EngagementCardButton
                          key={option.id}
                          id={option.id}
                          label={copy.label}
                          description={copy.description}
                          active={selectedEngagements.includes(option.id)}
                          onClick={() => handleEngagementToggle(option.id)}
                        />
                      );
                    })}
                  </div>
                )}

                {step === 2 && (
                  <>
                    <div className={currentStepDefinition.bodyClassName}>
                      {profileInputOptions.map((option) => (
                        <ProfileInputToggle
                          key={option.id}
                          id={option.id}
                          label={option.label}
                          active={selectedProfileInputs.includes(option.id)}
                          onClick={() => handleProfileInputToggle(option.id)}
                          requiredBadge={
                            option.id === "linkedin" || option.id === "cv"
                              ? "*"
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    <div
                      className={currentStepDefinition.secondaryBodyClassName}
                    >
                      {selectedProfileInputs.includes("linkedin") && (
                        <LinkInput
                          label="LinkedIn"
                          placeholder="https://linkedin.com/in/..."
                          value={linkedin}
                          onChange={(event) => setLinkedin(event.target.value)}
                        />
                      )}
                      {selectedProfileInputs.includes("github") && (
                        <LinkInput
                          label="GitHub"
                          placeholder="https://github.com/..."
                          value={github}
                          onChange={(event) => setGithub(event.target.value)}
                        />
                      )}
                      {selectedProfileInputs.includes("scholar") && (
                        <LinkInput
                          label="Google Scholar"
                          placeholder="https://scholar.google.com/..."
                          value={scholar}
                          onChange={(event) => setScholar(event.target.value)}
                        />
                      )}
                      {selectedProfileInputs.includes("website") && (
                        <LinkInput
                          label={t(
                            "career.onboarding.onboarding.0fcepf9",
                            "개인 페이지"
                          )}
                          placeholder="https://..."
                          value={website}
                          onChange={(event) => setWebsite(event.target.value)}
                        />
                      )}
                      {selectedProfileInputs.includes("cv") && (
                        <ResumeUploadInput
                          fileName={resumeFile?.name ?? ""}
                          onFileSelect={(file, source) => {
                            logCareerEvent(
                              source === "drop"
                                ? "drop_onboarding_resume_select"
                                : "click_onboarding_resume_select"
                            );
                            setResumeFile(file);
                          }}
                        />
                      )}
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className={currentStepDefinition.bodyClassName}>
                      {profileVisibilityOptions.map((option) => (
                        <EngagementCardButton
                          key={option.id}
                          Icon={option.Icon}
                          label={option.label}
                          description={option.description.replace(
                            /\n/g,
                            "<br />"
                          )}
                          active={profileVisibility === option.id}
                          onClick={() =>
                            handleProfileVisibilitySelect(option.id)
                          }
                        />
                      ))}
                    </div>
                    <Text
                      as="p"
                      variant="caption"
                      tone="caption"
                      className={currentStepDefinition.footnoteClassName}
                    >
                      {selectedVisibilityOption.sub}
                    </Text>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </OnboardingFrame>
        )}
      </main>
    </>
  );
};

const CareerNetworkOnboardingPage = () => {
  return <CareerNetworkOnboardingContent />;
};

export default CareerNetworkOnboardingPage;

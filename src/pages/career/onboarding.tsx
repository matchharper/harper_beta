import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  FileText,
  Globe2,
  Handshake,
  LoaderCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Upload,
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
import { Input, Input as UiInput } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useHtmlClass } from "@/hooks/useHtmlClass";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  TALENT_NETWORK_PROFILE_INPUT_OPTIONS,
  type TalentNetworkEngagementOptionId,
  type TalentNetworkProfileInputType,
} from "@/lib/talentNetworkOptions";
import { cn } from "@/lib/cn";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { getCareerSignupAttributionPayload } from "@/lib/careerSignupAttribution";
import LoadingState from "../../components/career/OnboardingLoadingState";
import { useCareerT } from "@/i18n/useCareerT";
import { careerT } from "@/lib/career/translatedCareerMessage";

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

const headerClassName = "flex h-full flex-col justify-end pt-4 text-left pb-1";
const titleClassName =
  "text-[20px] md:text-[24px] font-normal leading-[1.5] text-neutral-primary";
const descriptionClassName =
  "mt-2 text-[13px] md:text-[15px] text-neutral-soft";

const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    label: careerT("ko", "career.onboarding.onboarding.0yf8432", "기본 정보"),
    title: [
      careerT(
        "ko",
        "career.onboarding.onboarding.0czo5rp",
        "커리어에도<br />에이전트가 필요합니다."
      ),
    ],
    description: [
      careerT(
        "ko",
        "career.onboarding.onboarding.1o4hblb",
        "시작은 이름과 이메일만 있으면 충분해요."
      ),
    ],
    headerClassName,
    titleClassName,
    descriptionClassName,
    bodyClassName: "grid w-full gap-5 text-left",
  },
  {
    label: careerT("ko", "career.onboarding.onboarding.1x0fjwc", "기회 유형"),
    title: [
      careerT(
        "ko",
        "career.onboarding.onboarding.1t9c061",
        "어떤 기회를<br />알아보고 있나요?"
      ),
    ],
    description: [
      careerT(
        "ko",
        "career.onboarding.onboarding.0ghhb4f",
        "Harper가 맞춰서 제안할게요."
      ),
    ],
    headerClassName,
    titleClassName,
    descriptionClassName,
    bodyClassName: "flex flex-col gap-2 w-full",
  },
  {
    label: careerT("ko", "career.onboarding.onboarding.0zapw5l", "프로필 연결"),
    title: [
      careerT(
        "ko",
        "career.onboarding.onboarding.0j4a2qn",
        "Harper가 먼저 이해할게요."
      ),
    ],
    description: [
      careerT(
        "ko",
        "career.onboarding.onboarding.17aqzmx",
        "LinkedIn 또는 이력서 하나면 충분해요."
      ),
      careerT(
        "ko",
        "career.onboarding.onboarding.0sc411b",
        "추가 정보는 방향을 더 정확히 좁히는 데 도움이 돼요."
      ),
    ],
    headerClassName,
    titleClassName,
    descriptionClassName,
    bodyClassName: "grid w-full grid-cols-3 gap-2",
    secondaryBodyClassName: "mt-5 flex w-full flex-col gap-4 text-left",
  },
  {
    label: careerT("ko", "career.onboarding.onboarding.0zg5btj", "공개 설정"),
    title: [
      careerT(
        "ko",
        "career.onboarding.onboarding.0t0s7bt",
        "회사에 프로필을 언제 공유할까요?"
      ),
    ],
    description: [
      careerT(
        "ko",
        "career.onboarding.onboarding.1n6ukfv",
        "프로필은 선택한 방식대로만 공유돼요."
      ),
      careerT(
        "ko",
        "career.onboarding.onboarding.183d95f",
        "대화 내용은 회사에 공개되지 않아요."
      ),
    ],
    headerClassName,
    titleClassName,
    descriptionClassName,
    bodyClassName: "grid w-full gap-3 text-left",
    footnoteClassName: "mt-3 text-[13px] leading-5 text-neutral-muted",
  },
];

const DONE_STEP_DEFINITION: OnboardingStepDefinition = {
  label: careerT("ko", "career.onboarding.onboarding.1jkvik4", "대화 시작"),
  title: [
    careerT(
      "ko",
      "career.onboarding.onboarding.1sjsl9m",
      "정보를 확인했습니다"
    ),
  ],
  description: [
    careerT(
      "ko",
      "career.onboarding.onboarding.0zc98l7",
      "이제 Harper와 몇 가지 기준만 정하면 돼요."
    ),
  ],
  headerClassName,
  titleClassName,
  descriptionClassName,
  bodyClassName: "",
};

const TOTAL_STEPS = ONBOARDING_STEPS.length;

const normalizeLink = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isLinkedinLink = (value: string) => {
  const normalized = normalizeLink(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
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

const careerOnboardingSessionKey = (
  userId: string | null,
  inviteToken?: string | null,
  mail?: string | null,
  emailOnboardingToken?: string | null
) =>
  [
    "career-onboarding-session",
    userId,
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

const DEFAULT_DONE_USER_MESSAGE = careerT(
  "ko",
  "career.onboarding.onboarding.0o7dyhc",
  "프로필 자료를 제출했습니다."
);

const DEFAULT_DONE_KICKOFF_TEXT = [
  careerT(
    "ko",
    "career.onboarding.onboarding.1w9rc8x",
    "제출해주신 이력서/링크를 바탕으로 기회를 찾아 볼게요."
  ),
].join("\n\n");

const DONE_AGENT_INTRO_BASE = careerT(
  "ko",
  "career.onboarding.onboarding.1jh1j5u",
  "이제 제가 맞을 만한 기회들을 찾아보고, 인재 연결을 요청한 회사 중 괜찮은 곳이 있으면 소개 및 연결까지 해드릴게요. 더 좋은 연결을 도와드리기 위해 지금 어떤 상황이신지, 어떤 기회를 원하시는지 몇 가지만 더 여쭤보고 싶어요. 보통 5분 정도면 충분합니다."
);

type CareerT = ReturnType<typeof useCareerT>;

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

const ONBOARDING_ENGAGEMENT_COPY: Record<
  TalentNetworkEngagementOptionId,
  { label: string; description: string }
> = {
  advisor: {
    label: careerT("ko", "career.onboarding.onboarding.1bulcyv", "어드바이저"),
    description: careerT(
      "ko",
      "career.onboarding.onboarding.1a74y8o",
      "초기 팀을 돕거나 전략적으로 기여하고 싶어요"
    ),
  },
  fractional: {
    label: careerT(
      "ko",
      "career.onboarding.onboarding.1k0o8vf",
      "파트타임·프로젝트"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding.06ilxsj",
      "지금 자리는 유지하면서, 병행할 수 있는 일을 찾아요"
    ),
  },
  full_time: {
    label: careerT("ko", "career.onboarding.onboarding.166o9pn", "풀타임"),
    description: careerT(
      "ko",
      "career.onboarding.onboarding.15izros",
      "제대로 된 기회라면 이직도 열어두고 있어요"
    ),
  },
};

const buildDoneAgentIntro = (
  selectedEngagements: TalentNetworkEngagementOptionId[],
  t: CareerT
) => {
  const selectedCopies = selectedEngagements
    .map((id) => getDoneEngagementCopy(id, t))
    .filter(Boolean);
  const targetCopy =
    selectedCopies.length > 0
      ? selectedCopies.join(", ")
      : t("career.onboarding.onboarding.0dus5rt", "가장 좋아하실만한 기회들");

  return t(
    "career.onboarding.onboarding.done_agent_intro",
    "{intro} 대화가 끝나면 내용을 정리해서 {targetCopy}부터 찾아볼게요.",
    {
      values: {
        intro: t("career.onboarding.onboarding.1jh1j5u", DONE_AGENT_INTRO_BASE),
        targetCopy,
      },
    }
  );
};

const getOnboardingKickoffText = (payload: OnboardingStartPayload) => {
  const acknowledgement = payload.kickoff?.acknowledgement?.trim();
  const insight = payload.kickoff?.insight?.trim();
  const structuredText = [acknowledgement, insight]
    .filter(Boolean)
    .join("\n\n");

  if (structuredText) return structuredText;

  const assistantText = payload.assistantMessages
    ?.map((message) => message.content?.trim())
    .find(Boolean);

  return assistantText || DEFAULT_DONE_KICKOFF_TEXT;
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
              ? "bg-black"
              : index === currentStep
                ? "bg-black"
                : "bg-neutral-400"
          )}
        />
      ))}
    </div>
  );
};

const OnboardingTopBar = ({ step }: { step: number }) => (
  <div className="flex h-16 shrink-0 flex-col justify-center gap-5">
    <div className="font-hedvig font-bold text-[21px] leading-none text-neutral-primary">
      Harper
    </div>
    <ProgressBar step={step} />
  </div>
);

const OnboardingFrame = ({
  children,
  footer,
  progressStep,
  title,
}: {
  children: ReactNode;
  footer: ReactNode;
  progressStep: number;
  title: ReactNode;
}) => (
  <div className="mx-auto flex min-h-svh w-full justify-center px-4 py-4 md:py-16">
    <div className="flex h-[calc(100svh-2rem)] md:h-[calc(100svh-8rem)] min-h-[520px] w-full max-w-[400px] flex-col">
      <OnboardingTopBar step={progressStep} />
      <div className="h-[120px] shrink-0">{title}</div>
      <section className="min-h-0 flex-1 overflow-y-auto py-8 pr-1">
        {children}
      </section>
      <footer className="shrink-0 pt-4">{footer}</footer>
    </div>
  </div>
);

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
    <Text
      as="p"
      variant="body"
      tone="subtle"
      className={stepDefinition.descriptionClassName}
    >
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
        ? "border-neutral-1000 bg-bg-floating"
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
    className={cn("block bg-black/80", sizeClass)}
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
        ? "border-neutral-1000 bg-bg-basement"
        : "border-neutral-1000-a05 bg-bg-basement text-neutral-primary hover:border-neutral-800"
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

const ONBOARDING_PROFILE_VISIBILITY_OPTIONS: Array<{
  id: OnboardingProfileVisibility;
  label: string;
  description: string;
  sub: string;
  Icon: LucideIcon;
}> = [
  {
    id: "open_to_matches",
    label: careerT(
      "ko",
      "career.onboarding.onboarding.0lliiks",
      "Harper가 먼저 공유해요"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding.1at9nca",
      "잘 맞는 기회라고 판단되면 Harper가 먼저 회사에 프로필을 공유해요. 관심이 오면 바로 알려드려요."
    ),
    sub: careerT(
      "ko",
      "career.onboarding.onboarding.03b3ba6",
      "매칭에 필요한 프로필 정보만 공유돼요. 공개하지 않을 회사를 설정할 수 있어요."
    ),
    Icon: ShieldCheck,
  },
  {
    id: "exceptional_only",
    label: careerT(
      "ko",
      "career.onboarding.onboarding.0wcgte0",
      "내가 먼저 확인해요"
    ),
    description: careerT(
      "ko",
      "career.onboarding.onboarding.0nzlxqj",
      "Harper가 먼저 기회를 가져오고, 내가 확인한 뒤에만 프로필이 공유돼요."
    ),
    sub: careerT(
      "ko",
      "career.onboarding.onboarding.03b3ba6",
      "매칭에 필요한 프로필 정보만 공유돼요. 공개하지 않을 회사를 설정할 수 있어요."
    ),
    Icon: ShieldAlert,
  },
];

const ResumeUploadInput = ({
  fileName,
  onChange,
}: {
  fileName: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) => (
  <label
    className={cn(
      "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[6px] border px-4 py-10 transition",
      fileName
        ? "border-neutral-1000 bg-bg-basement hover:bg-bg-weak"
        : "border-dashed border-neutral-400 bg-bg-default hover:bg-bg-weak"
    )}
  >
    <span className="flex w-fit flex-wrap rounded-full border border-neutral-300 bg-bg-basement p-3">
      {fileName ? (
        <FileText size={20} strokeWidth={1.6} />
      ) : (
        <Upload size={20} strokeWidth={1.6} />
      )}
    </span>
    <span className="mt-1 text-sm font-normal">
      {fileName ||
        careerT(
          "ko",
          "career.onboarding.onboarding.13vjc2d",
          "이력서/CV 업로드"
        )}
    </span>
    <span className="text-center text-sm font-normal text-neutral-muted">
      {careerT(
        "ko",
        "career.onboarding.onboarding.1xpgwgk",
        "PDF나 텍스트 파일을 올려주세요. 최대 10MB까지 권장합니다."
      )}
    </span>
    <UiInput
      unstyled
      type="file"
      accept=".pdf,.txt,.md"
      className="hidden"
      onChange={onChange}
    />
  </label>
);

const OnboardingFooterControls = ({
  onNext,
  onPrev,
  step,
}: {
  onNext: () => void;
  onPrev: () => void;
  step: number;
}) => (
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
          {careerT("ko", "career.onboarding.onboarding.0wrohr9", "이전")}
        </AnimatedButton>
      )}
      <AnimatedButton
        type="button"
        variant="primary"
        size="lg"
        onClick={onNext}
        className="w-full px-4 font-normal"
      >
        {step === TOTAL_STEPS - 1
          ? careerT(
              "ko",
              "career.onboarding.onboarding.0cvpvmv",
              "기회 탐색 시작하기"
            )
          : step === 0
            ? careerT(
                "ko",
                "career.onboarding.onboarding.1gr43li",
                "Harper 시작하기"
              )
            : careerT("ko", "career.onboarding.onboarding.0wbopf1", "다음")}
      </AnimatedButton>
    </div>
    <div
      className={`mt-2 flex min-h-5 items-center ${step === 0 ? "justify-center" : "justify-end"} text-[12px] leading-5 text-neutral-soft`}
    >
      {step === TOTAL_STEPS - 1 ? (
        <span>
          {careerT(
            "ko",
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

const DoneState = ({
  kickoffText,
  onStartCall,
  onStartChat,
  selectedEngagements,
  userMessage,
}: {
  kickoffText: string;
  onStartCall: () => void;
  onStartChat: () => void;
  selectedEngagements: TalentNetworkEngagementOptionId[];
  userMessage: string;
}) => {
  const t = useCareerT();

  const doneAgentIntro = useMemo(
    () => buildDoneAgentIntro(selectedEngagements, t),
    [selectedEngagements, t]
  );
  const fullHarperText = useMemo(
    () => [kickoffText.trim(), doneAgentIntro].filter(Boolean).join("\n\n"),
    [doneAgentIntro, kickoffText]
  );
  const streamedText = useStreamingText(fullHarperText);
  const isStreamComplete =
    fullHarperText.length > 0 && streamedText.length >= fullHarperText.length;
  const streamedParagraphs = streamedText.split(/\n{2,}/);

  return (
    <OnboardingFrame
      progressStep={TOTAL_STEPS}
      title={<OnboardingStepHeader stepDefinition={DONE_STEP_DEFINITION} />}
      footer={
        <div className="min-h-[112px]">
          <AnimatePresence>
            {isStreamComplete && (
              <motion.div
                key="done-actions"
                initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="grid grid-cols-2 gap-2">
                  <AnimatedButton
                    type="button"
                    size="md"
                    variant="secondary"
                    onClick={onStartChat}
                    className="w-full px-3 text-[14px] font-normal"
                  >
                    {t("career.onboarding.onboarding.1onl53u", "채팅하기")}
                  </AnimatedButton>
                  <AnimatedButton
                    type="button"
                    size="md"
                    variant="primary"
                    onClick={onStartCall}
                    className="w-full px-3 text-[14px] font-normal"
                  >
                    {t(
                      "career.onboarding.onboarding.1qgquty",
                      "Harper와 통화하기"
                    )}
                  </AnimatedButton>
                </div>
                <Text
                  as="p"
                  variant="caption"
                  tone="subtle"
                  className="mt-3 text-[12px] leading-5"
                >
                  {t(
                    "career.onboarding.onboarding.08oczyl",
                    "통화가 어렵다면 채팅으로 이어가도 됩니다."
                  )}
                </Text>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      }
    >
      <div className="flex min-h-full flex-col">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.45, ease: "easeOut" }}
          className="flex justify-end"
        >
          <Text
            as="p"
            variant="caption"
            tone="primary"
            className="max-w-[320px] rounded-xl bg-bg-basement px-4 py-2 text-right text-[13px] leading-5"
          >
            {userMessage || DEFAULT_DONE_USER_MESSAGE}
          </Text>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.45, ease: "easeOut" }}
          className="flex justify-start"
        >
          <Text
            as="p"
            variant="caption"
            tone="inverted"
            className="mt-4 max-w-[320px] rounded-xl bg-black px-4 py-2 text-left font-sans text-[13px] font-light leading-5"
          >
            {t("career.onboarding.onboarding.08ain69", "소중한 정보 감사해요.")}
          </Text>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, duration: 0.45, ease: "easeOut" }}
          className="mt-8"
        >
          <div className="space-y-5 text-left text-[14px] leading-7 text-neutral-primary">
            {streamedParagraphs.map((paragraph, index) => {
              const isLast = index === streamedParagraphs.length - 1;
              return (
                <Text
                  as="p"
                  variant="body"
                  tone="primary"
                  key={`${index}-${paragraph.slice(0, 10)}`}
                >
                  {paragraph}
                  {isLast && !isStreamComplete && (
                    <span className="ml-1 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-black/55" />
                  )}
                </Text>
              );
            })}
          </div>
        </motion.div>
      </div>
    </OnboardingFrame>
  );
};

const CareerNetworkOnboardingContent = () => {
  const t = useCareerT();

  useHtmlClass("noneoverscroll");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, authLoading } = useCareerAuth();
  const { fetchWithAuth } = useCareerApi();
  const logCareerEvent = useCareerLogEvent();
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [conversationId, setConversationId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
  const [doneUserMessage, setDoneUserMessage] = useState(
    DEFAULT_DONE_USER_MESSAGE
  );
  const [doneKickoffText, setDoneKickoffText] = useState(
    DEFAULT_DONE_KICKOFF_TEXT
  );
  const userId = user?.id ?? null;
  const inviteToken = getSingleQueryParam(router.query.invite)?.trim() || null;
  const mail = getSingleQueryParam(router.query.mail)?.trim() || null;
  const emailOnboardingToken =
    getSingleQueryParam(
      router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]
    )?.trim() || null;
  const onboardingNextPath = router.asPath || "/career/onboarding";
  const sessionQueryKey = useMemo(
    () =>
      careerOnboardingSessionKey(
        userId,
        inviteToken,
        mail,
        emailOnboardingToken
      ),
    [emailOnboardingToken, inviteToken, mail, userId]
  );
  const lastSavedBasicInfoRef = useRef("");

  const fetchOnboardingSession = useCallback(async () => {
    const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        ...getCareerSignupAttributionPayload(),
        emailOnboardingToken: emailOnboardingToken || undefined,
        inviteToken: inviteToken || undefined,
        mail: mail || undefined,
      }),
    });
    if (!bootstrapRes.ok) {
      const payload = await bootstrapRes.json().catch(() => ({}));
      throw new Error(
        getErrorMessage(
          payload,
          careerT(
            "ko",
            "career.onboarding.onboarding.1sy0934",
            "로그인 정보를 초기화하지 못했습니다."
          )
        )
      );
    }

    const sessionRes = await fetchWithAuth("/api/talent/session?statusOnly=1");
    const payload = (await sessionRes
      .json()
      .catch(() => ({}))) as OnboardingSessionPayload;
    if (!sessionRes.ok) {
      throw new Error(
        getErrorMessage(
          payload,
          careerT(
            "ko",
            "career.onboarding.onboarding.1sh2r2c",
            "온보딩 세션을 불러오지 못했습니다."
          )
        )
      );
    }

    return payload;
  }, [emailOnboardingToken, fetchWithAuth, inviteToken, mail]);

  useEffect(() => {
    if (!user) return;
    const nextName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      (typeof user.email === "string" ? user.email.split("@")[0] : "");
    setName((current) => current || String(nextName ?? ""));
    setEmail((current) => current || user.email || "");
  }, [user]);

  useEffect(() => {
    if (authLoading || !router.isReady) return;

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
        // setSubmitState(payload?.hasFirstSubmission ? "done" : "form");
      } catch (error) {
        if (cancelled) return;
        showToast({
          message:
            error instanceof Error
              ? error.message
              : careerT(
                  "ko",
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
    mail,
    onboardingNextPath,
    queryClient,
    router,
    router.isReady,
    sessionQueryKey,
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
        email: trimmedEmail,
        name: trimmedName,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          payload,
          careerT(
            "ko",
            "career.onboarding.onboarding.0eumq1b",
            "기본 정보를 저장하지 못했습니다."
          )
        )
      );
    }

    lastSavedBasicInfoRef.current = signature;
    queryClient.removeQueries({ queryKey: ["career-session"] });
  }, [email, fetchWithAuth, name, queryClient]);

  const saveCurrentStep = useCallback(
    async (currentStep: number) => {
      if (currentStep !== 0) return;

      try {
        await saveBasicInfo();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : careerT(
                "ko",
                "career.onboarding.onboarding.0eumq1b",
                "기본 정보를 저장하지 못했습니다."
              );
        showToast({ message, variant: "white" });
        throw error;
      }
    },
    [saveBasicInfo]
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
  const hasRequiredProfileSignal =
    Boolean(resumeFile) || isLinkedinLink(linkedinLink);

  const validateStep = useCallback(
    (currentStep: number) => {
      if (currentStep === 0) {
        if (!name.trim()) {
          showToast({
            message: careerT(
              "ko",
              "career.onboarding.onboarding.0ehh5yz",
              "이름을 입력해주세요."
            ),
            variant: "white",
          });
          return false;
        }
        if (!isValidEmail(email.trim())) {
          showToast({
            message: careerT(
              "ko",
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
            message: careerT(
              "ko",
              "career.onboarding.onboarding.0w4wbae",
              "찾고 있는 업무 형태를 선택해주세요."
            ),
            variant: "white",
          });
          return false;
        }
      }

      if (currentStep === 2 && !hasRequiredProfileSignal) {
        showToast({
          message: careerT(
            "ko",
            "career.onboarding.onboarding.0d18cht",
            "이력서나 LinkedIn 링크 중 하나는 꼭 입력해주세요."
          ),
          variant: "white",
        });
        return false;
      }

      return true;
    },
    [email, hasRequiredProfileSignal, name, selectedEngagements]
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
            careerT(
              "ko",
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
    [fetchWithAuth]
  );

  const parseResumeText = useCallback(
    async (file: File) => {
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
            careerT(
              "ko",
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
    [fetchWithAuth]
  );

  const submitOnboarding = useCallback(async () => {
    if (submitState === "loading") return;
    if (!conversationId) {
      showToast({
        message: careerT(
          "ko",
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
        const [uploadResult, parsedText] = await Promise.all([
          uploadResumeFile(resumeFile),
          parseResumeText(resumeFile),
        ]);
        resumeFileName = uploadResult.resumeFileName;
        resumeStoragePath = uploadResult.resumeStoragePath;
        resumeText = parsedText;
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
            careerT(
              "ko",
              "career.onboarding.onboarding.1kdng2n",
              "선호 정보를 저장하지 못했습니다."
            )
          )
        );
      }
      if (preferencesPayload?.opportunityDiscoveryQueued) {
        showToast({
          message: careerT(
            "ko",
            "career.onboarding.onboarding.0hobsv6",
            "기회 검색을 시작했습니다."
          ),
          variant: "white",
        });
      }

      const settingsRes = await fetchWithAuth("/api/talent/settings", {
        method: "POST",
        body: JSON.stringify({
          profileVisibility,
        }),
      });
      const settingsPayload = await settingsRes.json().catch(() => ({}));
      if (!settingsRes.ok) {
        throw new Error(
          getErrorMessage(
            settingsPayload,
            careerT(
              "ko",
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
          email: email.trim().toLowerCase(),
          links,
          name: name.trim(),
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
            careerT(
              "ko",
              "career.onboarding.onboarding.059do1c",
              "프로필 구조화를 시작하지 못했습니다."
            )
          )
        );
      }

      queryClient.removeQueries({ queryKey: ["career-session"] });
      queryClient.removeQueries({ queryKey: ["career-message-history"] });
      queryClient.removeQueries({ queryKey: ["career-history-opportunities"] });
      setDoneUserMessage(
        payload.profileSubmitMessage?.trim() ||
          payload.userMessage?.content?.trim() ||
          DEFAULT_DONE_USER_MESSAGE
      );
      setDoneKickoffText(getOnboardingKickoffText(payload));
      setSubmitState("done");
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : careerT(
                "ko",
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
    email,
    fetchWithAuth,
    links,
    name,
    parseResumeText,
    profileVisibility,
    queryClient,
    resumeFile,
    selectedEngagements,
    submitState,
    logCareerEvent,
    uploadResumeFile,
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

      const visibility = ONBOARDING_PROFILE_VISIBILITY_OPTIONS[optionIndex];
      if (!visibility) return;

      event.preventDefault();
      handleProfileVisibilitySelect(visibility.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleEngagementToggle, handleProfileVisibilitySelect, step]);

  const currentStepDefinition = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0];

  const selectedVisibilityOption =
    ONBOARDING_PROFILE_VISIBILITY_OPTIONS.find(
      (option) => option.id === profileVisibility
    ) ?? ONBOARDING_PROFILE_VISIBILITY_OPTIONS[0];

  const navigateToCareerStart = useCallback(
    (startMode: "call" | "chat") => {
      logCareerEvent(`click_onboarding_done_start_${startMode}`);
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

      void router.push({
        pathname: "/career",
        query,
      });
    },
    [logCareerEvent, router]
  );

  if (authLoading || bootstrapLoading) {
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
          "min-h-svh font-sans text-neutral-primary",
          ONBOARDING_BACKGROUND_CLASS
        )}
      >
        {submitState === "loading" && <LoadingState />}

        {submitState === "done" && (
          <DoneState
            kickoffText={doneKickoffText}
            onStartCall={() => navigateToCareerStart("call")}
            onStartChat={() => navigateToCareerStart("chat")}
            selectedEngagements={selectedEngagements}
            userMessage={doneUserMessage}
          />
        )}

        {submitState === "form" && (
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
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="email@example.com"
                        className="h-12 text-base mt-1"
                      />
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className={currentStepDefinition.bodyClassName}>
                    {TALENT_NETWORK_ENGAGEMENT_OPTIONS.map((option, index) => {
                      const copy = ONBOARDING_ENGAGEMENT_COPY[option.id];

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
                      {TALENT_NETWORK_PROFILE_INPUT_OPTIONS.map((option) => (
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
                          onChange={(event) => {
                            logCareerEvent("click_onboarding_resume_select");
                            setResumeFile(event.target.files?.[0] ?? null);
                          }}
                        />
                      )}
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className={currentStepDefinition.bodyClassName}>
                      {ONBOARDING_PROFILE_VISIBILITY_OPTIONS.map((option) => (
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

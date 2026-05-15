import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import Head from "next/head";
import Image from "next/image";
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
import { BeigeButton, BeigeInput } from "@/components/ui/beige";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  TALENT_NETWORK_PROFILE_INPUT_OPTIONS,
  type TalentNetworkEngagementOptionId,
  type TalentNetworkProfileInputType,
} from "@/lib/talentNetworkOptions";
import { cn } from "@/lib/cn";
import LoadingState from "../../components/career/OnboardingLoadingState";

const ONBOARDING_BACKGROUND_CLASS =
  "bg-[#F8F1EA] bg-[linear-gradient(to_top,#F1E1D7_0%,#F8F1EA_58%,#FEFBF6_100%)]";

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

const descriptionClassName =
  "mt-4 text-sm leading-7 text-beige900/65 md:text-base";

const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    label: "기본 정보",
    title: [
      "모든 스포츠 스타에게 에이전트가 있듯이,",
      "커리어에도 에이전트가 필요합니다.",
    ],
    description: [
      "Harper가 에이전트/헤드헌터처럼 좋은 기회를 먼저 살펴보고 알려드릴 수 있도록,",
      "이름과 연락처만 먼저 확인할게요.",
    ],
    headerClassName: "mx-auto max-w-[720px]",
    titleClassName: "text-xl font-medium leading-[1.25] md:text-2xl",
    descriptionClassName,
    bodyClassName: "mx-auto mt-4 grid w-full max-w-[520px] gap-3 text-left",
  },
  {
    label: "찾는 역할",
    title: ["어떤 형태의 기회에 열려계신가요?"],
    description: [
      "풀타임 합류부터 현업과 병행하는 파트타임, 어드바이저 역할까지 관심 있는 것만 선택해주세요.",
      "Harper가 24/7 쉬지않고 찾아드릴게요.",
    ],
    headerClassName: "mx-auto max-w-[720px]",
    titleClassName: "text-xl font-medium leading-[1.25] md:text-2xl",
    descriptionClassName,
    bodyClassName:
      "mx-auto mt-5 grid w-full max-w-[860px] gap-3 md:grid-cols-3",
  },
  {
    label: "프로필 자료",
    title: ["본인을 가장 잘 보여주는 자료를 연결해주세요."],
    description: [
      "이력서(CV)/LinkedIn 중 1개 필수",
      "GitHub, Scholar, 개인 사이트는 더 정확한 판단을 위한 보조 자료로 추가할 수 있습니다.",
    ],
    headerClassName: "mx-auto max-w-[720px]",
    titleClassName: "text-xl font-medium leading-[1.25] md:text-2xl",
    descriptionClassName,
    bodyClassName:
      "mx-auto mt-3 flex max-w-[760px] flex-wrap justify-center gap-2",
    secondaryBodyClassName:
      "mx-auto mt-5 flex w-full max-w-[700px] flex-col gap-4 text-left",
  },
  {
    label: "공개 범위",
    title: ["회사에 프로필을 언제 공개할까요?"],
    description: [
      "공개 범위를 정해주세요. 대화 내용과 선택한 옵션은 회사에 공개되지 않습니다.",
    ],
    headerClassName: "mx-auto max-w-[720px]",
    titleClassName: "text-xl font-medium leading-[1.25] md:text-2xl",
    descriptionClassName,
    bodyClassName:
      "mx-auto mt-5 grid w-full max-w-[760px] gap-3 text-left md:grid-cols-2",
    footnoteClassName:
      "mx-auto mt-2 max-w-[680px] text-[13px] leading-5 text-beige900/70",
  },
];

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
  mail?: string | null
) =>
  [
    "career-onboarding-session",
    userId,
    inviteToken?.trim() || null,
    mail?.trim() || null,
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

const DEFAULT_DONE_USER_MESSAGE = "프로필 자료를 제출했습니다.";

const DEFAULT_DONE_KICKOFF_TEXT = [
  "제출해주신 이력서/링크를 바탕으로 기회를 찾아 볼게요.",
].join("\n\n");

const DONE_AGENT_INTRO_BASE =
  "이제 제가 맞을 만한 기회들을 찾아보고, 인재 연결을 요청한 회사 중 괜찮은 곳이 있으면 소개 및 연결까지 해드릴게요. 더 좋은 연결을 도와드리기 위해 지금 어떤 상황이신지, 어떤 기회를 원하시는지 몇 가지만 더 여쭤보고 싶어요. 보통 5분 정도면 충분합니다.";

const DONE_ENGAGEMENT_COPY: Record<TalentNetworkEngagementOptionId, string> = {
  advisor: "부담 없이 이야기 나눠볼 수 있는 어드바이저 기회",
  fractional: "지금 하시는 일과 병행하기 좋은 파트타임/프로젝트 기회",
  full_time: "바로 검토해볼 만한 풀타임 포지션",
};

const ONBOARDING_ENGAGEMENT_COPY: Record<
  TalentNetworkEngagementOptionId,
  { label: string; description: string }
> = {
  advisor: {
    label: "어드바이저",
    description: "기술 자문, 초기 팀 멘토링, 전략 검토 중심",
  },
  fractional: {
    label: "파트타임 · 단기 프로젝트",
    description: "현업과 병행하며<br />부가적인 수입을 얻고싶다면",
  },
  full_time: {
    label: "풀타임 합류",
    description: "정말 좋은 기회인 경우,<br />이직/취직에도 열려있다면",
  },
};

const buildDoneAgentIntro = (
  selectedEngagements: TalentNetworkEngagementOptionId[]
) => {
  const selectedCopies = selectedEngagements
    .map((id) => DONE_ENGAGEMENT_COPY[id])
    .filter(Boolean);
  const targetCopy =
    selectedCopies.length > 0
      ? selectedCopies.join(", ")
      : "가장 좋아하실만한 기회들";

  return `${DONE_AGENT_INTRO_BASE} 대화가 끝나면 내용을 정리해서 ${targetCopy}부터 찾아볼게요.`;
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

const ProgressBar = ({ step }: { step: number }) => {
  const value = Math.min((step + 1) / TOTAL_STEPS, 1) * 100;

  return (
    <div className="fixed left-0 top-0 z-30 h-1 w-full bg-beige500">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="h-full bg-xprimary"
      />
    </div>
  );
};

const OnboardingStepHeader = ({
  stepDefinition,
}: {
  stepDefinition: OnboardingStepDefinition;
}) => (
  <header className={stepDefinition.headerClassName}>
    <h1 className={stepDefinition.titleClassName}>
      {stepDefinition.title.map((line, index) => (
        <span key={`${index}-${line}`} className="block">
          {line}
        </span>
      ))}
    </h1>
    <p className={stepDefinition.descriptionClassName}>
      {stepDefinition.description.map((line, index) => (
        <span key={`${index}-${line}`} className="block">
          {line}
        </span>
      ))}
    </p>
  </header>
);

const OnboardingFieldLabel = ({ children }: { children: ReactNode }) => (
  <label className="text-sm font-medium text-beige900/60">{children}</label>
);

const BeigeLinkInput = ({
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
    <div className="w-full text-[15px] font-medium text-beige900/60 md:w-1/4">
      {label}
    </div>
    <BeigeInput
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
}: {
  active: boolean;
  id: TalentNetworkProfileInputType;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex h-[104px] w-[108px] shrink-0 flex-col items-center justify-center gap-2 rounded-[8px] border px-3 py-3 text-center text-[13px] font-medium leading-4 transition sm:w-[136px]",
      active
        ? "border-beige900 bg-beige900 text-beige100"
        : "border-beige900/10 bg-beige500 text-beige900/70 hover:border-beige900/30 hover:bg-beige500/90"
    )}
  >
    <span className={cn("flex h-9 w-9 items-center justify-center")}>
      <ProfileInputIcon id={id} />
    </span>
    <span className="line-clamp-2 min-h-8">{label}</span>
  </button>
);

const ProfileInputIcon = ({ id }: { id: TalentNetworkProfileInputType }) => {
  if (id === "linkedin") {
    return (
      <ProfileIconMask
        src="/images/logos/linkedin.svg"
        sizeClass="h-[22px] w-[22px]"
      />
    );
  }

  if (id === "github") {
    return (
      <span className="flex items-center gap-0.5">
        <ProfileIconMask src="/svgs/github.svg" sizeClass="h-4 w-4" />
      </span>
    );
  }

  if (id === "scholar") {
    return (
      <ProfileIconMask src="/svgs/scholar.svg" sizeClass="h-[22px] w-[22px]" />
    );
  }

  if (id === "website") {
    return <Globe2 className="h-[22px] w-[22px] text-beige700" />;
  }

  return <FileText className="h-[22px] w-[22px] text-beige700" />;
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
    className={cn("block bg-beige700", sizeClass)}
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

const SelectionCardButton = ({
  active,
  description,
  Icon,
  label,
  optionNumber,
  onClick,
}: {
  active: boolean;
  description?: string;
  Icon?: LucideIcon;
  label: string;
  optionNumber: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex min-h-[74px] w-full flex-col items-start justify-start rounded-md border-2 px-3 py-4 text-left transition duration-300",
      active
        ? "border-xprimary bg-[#FFF3E8] text-beige900"
        : "border-beige900/10 bg-beige100 text-beige900 hover:border-xprimary/50 hover:bg-beige500/50"
    )}
  >
    <span className="flex w-full items-start gap-3">
      <span
        className={cn(
          "mt-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border text-xs font-medium md:inline-flex",
          active
            ? "border-xprimary bg-xprimary text-white"
            : "border-black/10 bg-white text-beige900"
        )}
      >
        {optionNumber}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-row items-center gap-2 text-[15px] font-medium">
          {Icon && (
            <span
              className={cn(
                "flex shrink-0 items-center justify-center transition-colors text-xprimary text-beige900/45"
              )}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" strokeWidth={1.7} />
            </span>
          )}
          {label}
        </span>
        {description && (
          <span className="mt-1 text-sm leading-5 text-beige900/60">
            {description}
          </span>
        )}
      </span>
    </span>
  </button>
);

const EngagementOptionIcon = ({
  active,
  id,
}: {
  active: boolean;
  id: TalentNetworkEngagementOptionId;
}) => {
  const className = cn("h-6 w-6 transition-colors text-xprimary");

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
  id,
  label,
  optionNumber,
  onClick,
}: {
  active: boolean;
  description?: string;
  id: TalentNetworkEngagementOptionId;
  label: string;
  optionNumber: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex min-h-[168px] w-full flex-col items-center justify-center rounded-[8px] border-2 px-5 py-5 text-center transition duration-300",
      active
        ? "border-xprimary bg-[#FFF3E8] text-beige900"
        : "border-beige900/10 bg-beige100/90 text-beige900 hover:border-xprimary/55"
    )}
  >
    <span className={cn("flex items-center justify-center")} aria-hidden="true">
      <EngagementOptionIcon active={active} id={id} />
    </span>
    <div className="mt-2 flex flex-row items-center gap-2">
      <span className="text-[15px] leading-6">{label}</span>
    </div>
    {description && (
      <span
        className="mt-2 min-h-10 text-[13px] leading-5 text-beige900/60"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    )}
  </button>
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
    label: "Open to matches",
    description:
      "Harper가 회원님이 선호하실만한 포지션이라고 판단하면 회사에 익명 프로필을 먼저 공유하고, 제안을 먼저 받으실 수 있게 합니다.",
    sub: "매칭에 필요한 프로필 정보만 공유됩니다. 공개하지 않을 회사를 설정할 수 있어요.",
    Icon: ShieldCheck,
  },
  {
    id: "exceptional_only",
    label: "Exceptional only",
    description:
      "Harper가 제안한 역할과 회사를 확인하고 허용한 경우에만 프로필이 공유됩니다.",
    sub: "기회를 먼저 확인한 뒤 직접 허용하는 방식입니다. 기본적으로 회사에는 프로필이 공유되지 않습니다.",
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
        ? "border-beige900 bg-white hover:bg-beige500/90"
        : "border-dashed border-beige900/50 bg-beige500/50 hover:bg-beige500/60"
    )}
  >
    <span className="flex w-fit flex-wrap rounded-full border border-xgray300 bg-white p-3">
      {fileName ? (
        <FileText size={20} strokeWidth={1.6} />
      ) : (
        <Upload size={20} strokeWidth={1.6} />
      )}
    </span>
    <span className="mt-1 text-base font-medium">
      {fileName || "Upload Resume/CV (Optional)"}
    </span>
    <span className="text-center text-sm font-normal text-beige900/70">
      PDF나 텍스트 파일을 올려주세요. 최대 10MB까지 권장합니다.
    </span>
    <input
      type="file"
      accept=".pdf,.txt,.md"
      className="hidden"
      onChange={onChange}
    />
  </label>
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
  const doneAgentIntro = useMemo(
    () => buildDoneAgentIntro(selectedEngagements),
    [selectedEngagements]
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
    <div className="mx-auto flex min-h-[calc(100svh-8px)] w-full max-w-[760px] flex-col px-5 py-10 md:justify-center md:py-14">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <Image
          src="/svgs/harper-h-mark.svg"
          alt="Harper"
          width={34}
          height={34}
          priority
          className="h-[34px] w-[34px]"
        />
        <p className="text-[18px] font-medium text-beige900/45">
          정보를 확인했습니다
        </p>
      </motion.div>

      <div className="mt-12 flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.45, ease: "easeOut" }}
          className="flex justify-end"
        >
          <p className="max-w-[520px] px-3 py-2 rounded-xl bg-beige50 text-right text-[13px] leading-5 text-beige900/42 md:text-[14px]">
            {userMessage || DEFAULT_DONE_USER_MESSAGE}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, duration: 0.45, ease: "easeOut" }}
          className="mt-10 max-w-[660px]"
        >
          <div className="space-y-5 text-left text-[13px] leading-5 text-beige900 md:text-[14px] md:leading-7">
            {streamedParagraphs.map((paragraph, index) => {
              const isLast = index === streamedParagraphs.length - 1;
              return (
                <p key={`${index}-${paragraph.slice(0, 10)}`}>
                  {paragraph}
                  {isLast && !isStreamComplete && (
                    <span className="ml-1 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-beige900/55" />
                  )}
                </p>
              );
            })}
          </div>
        </motion.div>

        <AnimatePresence>
          {isStreamComplete && (
            <motion.div
              key="done-actions"
              initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BeigeButton
                  type="button"
                  size="md"
                  variant="primary"
                  icon={<Phone className="h-3.5 w-3.5" />}
                  onClick={onStartCall}
                  animate
                  className="w-full text-sm font-normal sm:w-auto"
                >
                  Harper와 통화하기 (5분)
                </BeigeButton>
                <BeigeButton
                  type="button"
                  size="md"
                  variant="outline"
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                  onClick={onStartChat}
                  animate
                  className="w-full text-sm font-normal sm:w-auto"
                >
                  채팅으로 이어가기
                </BeigeButton>
              </div>
              <p className="mt-4 text-[13px] leading-6 text-beige900/45">
                통화가 어렵다면 채팅으로 이어가도 됩니다. 있는 그대로
                알려주실수록 연결이 더 정확해집니다.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const CareerNetworkOnboardingContent = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, authLoading } = useCareerAuth();
  const { fetchWithAuth } = useCareerApi();
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
  const [submitError, setSubmitError] = useState("");
  const [doneUserMessage, setDoneUserMessage] = useState(
    DEFAULT_DONE_USER_MESSAGE
  );
  const [doneKickoffText, setDoneKickoffText] = useState(
    DEFAULT_DONE_KICKOFF_TEXT
  );
  const userId = user?.id ?? null;
  const inviteToken = getSingleQueryParam(router.query.invite)?.trim() || null;
  const mail = getSingleQueryParam(router.query.mail)?.trim() || null;
  const onboardingNextPath = router.asPath || "/career/onboarding";
  const sessionQueryKey = useMemo(
    () => careerOnboardingSessionKey(userId, inviteToken, mail),
    [inviteToken, mail, userId]
  );
  const lastSavedBasicInfoRef = useRef("");

  const fetchOnboardingSession = useCallback(async () => {
    const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        inviteToken: inviteToken || undefined,
        mail: mail || undefined,
      }),
    });
    if (!bootstrapRes.ok) {
      const payload = await bootstrapRes.json().catch(() => ({}));
      throw new Error(
        getErrorMessage(payload, "로그인 정보를 초기화하지 못했습니다.")
      );
    }

    const sessionRes = await fetchWithAuth("/api/talent/session?statusOnly=1");
    const payload = (await sessionRes
      .json()
      .catch(() => ({}))) as OnboardingSessionPayload;
    if (!sessionRes.ok) {
      throw new Error(
        getErrorMessage(payload, "온보딩 세션을 불러오지 못했습니다.")
      );
    }

    return payload;
  }, [fetchWithAuth, inviteToken, mail]);

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
      setSubmitError("");

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
        setSubmitError(
          error instanceof Error
            ? error.message
            : "온보딩 세션을 불러오지 못했습니다."
        );
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
        getErrorMessage(payload, "기본 정보를 저장하지 못했습니다.")
      );
    }

    lastSavedBasicInfoRef.current = signature;
    queryClient.removeQueries({ queryKey: ["career-session"] });
  }, [email, fetchWithAuth, name, queryClient]);

  const saveCurrentStep = useCallback(async (currentStep: number) => {
    if (currentStep !== 0) return;

    try {
      setSubmitError("");
      await saveBasicInfo();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "기본 정보를 저장하지 못했습니다.";
      setSubmitError(message);
      showToast({ message, variant: "white" });
      throw error;
    }
  }, [saveBasicInfo]);

  const handleProfileInputToggle = useCallback(
    (option: TalentNetworkProfileInputType) => {
      setSelectedProfileInputs((current) =>
        current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option]
      );
    },
    []
  );

  const handleEngagementToggle = useCallback(
    (option: TalentNetworkEngagementOptionId) => {
      setSelectedEngagements((current) =>
        current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option]
      );
    },
    []
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
          showToast({ message: "이름을 입력해주세요.", variant: "white" });
          return false;
        }
        if (!isValidEmail(email.trim())) {
          showToast({
            message: "유효한 이메일을 입력해주세요.",
            variant: "white",
          });
          return false;
        }
      }

      if (currentStep === 1) {
        if (selectedEngagements.length === 0) {
          showToast({
            message: "찾고 있는 업무 형태를 선택해주세요.",
            variant: "white",
          });
          return false;
        }
      }

      if (currentStep === 2 && !hasRequiredProfileSignal) {
        showToast({
          message: "이력서나 LinkedIn 링크 중 하나는 꼭 입력해주세요.",
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
          getErrorMessage(payload, "이력서 업로드에 실패했습니다.")
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
          getErrorMessage(payload, "이력서 내용을 읽지 못했습니다.")
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
      setSubmitError("온보딩 세션을 아직 준비하지 못했습니다.");
      return;
    }

    setSubmitState("loading");
    setSubmitError("");

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
            "선호 정보를 저장하지 못했습니다."
          )
        );
      }
      if (preferencesPayload?.opportunityDiscoveryQueued) {
        showToast({
          message: "기회 검색을 시작했습니다.",
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
            "프로필 공개 설정을 저장하지 못했습니다."
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
          getErrorMessage(payload, "프로필 구조화를 시작하지 못했습니다.")
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
      setSubmitError(
        error instanceof Error
          ? error.message
          : "온보딩 제출 중 오류가 발생했습니다."
      );
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
    uploadResumeFile,
  ]);

  const { step, handleNext, handlePrev, isNextRef } = useOnboarding({
    save: saveCurrentStep,
    totalSteps: TOTAL_STEPS,
    beforeNext: validateStep,
    onComplete: submitOnboarding,
    enableWheelNavigation: false,
  });

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
      setProfileVisibility(visibility.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleEngagementToggle, step]);

  const slideVariants = {
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

  const currentStepDefinition = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0];
  const stepLabel = `${step + 1} / ${TOTAL_STEPS}`;
  // const stepLabel = `Step ${step + 1} / ${TOTAL_STEPS} · ${currentStepDefinition.label}`;

  const selectedVisibilityOption =
    ONBOARDING_PROFILE_VISIBILITY_OPTIONS.find(
      (option) => option.id === profileVisibility
    ) ?? ONBOARDING_PROFILE_VISIBILITY_OPTIONS[0];

  const navigateToCareerStart = useCallback(
    (startMode: "call" | "chat") => {
      const invite = getSingleQueryParam(router.query.invite);
      const mail = getSingleQueryParam(router.query.mail);
      const query: Record<string, string> = { start: startMode };
      if (invite) query.invite = invite;
      if (mail) query.mail = mail;

      void router.push({
        pathname: "/career",
        query,
      });
    },
    [router]
  );

  if (authLoading || bootstrapLoading) {
    return (
      <main
        className={cn(
          "flex min-h-svh items-center justify-center font-geist text-beige900",
          ONBOARDING_BACKGROUND_CLASS
        )}
      >
        <LoaderCircle className="h-5 w-5 animate-spin text-beige900/40" />
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
          "min-h-svh pt-2 font-geist text-beige900",
          ONBOARDING_BACKGROUND_CLASS
        )}
      >
        <ProgressBar
          step={
            submitState === "done" || submitState === "loading"
              ? TOTAL_STEPS - 1
              : step
          }
        />

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
          <div className="mx-auto flex min-h-[calc(100svh-8px)] w-full max-w-[960px] flex-col items-center px-4 py-8 md:justify-center md:px-6 md:py-12">
            <section className="flex w-full flex-col items-center text-center">
              <div className="mb-6 text-center text-[11px] font-medium text-xprimary/60">
                {stepLabel}
              </div>

              <AnimatePresence mode="wait" custom={isNextRef.current}>
                <motion.div
                  key={step}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  variants={slideVariants}
                  custom={isNextRef.current}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="flex w-full flex-col items-center gap-5"
                >
                  <OnboardingStepHeader
                    stepDefinition={currentStepDefinition}
                  />

                  {step === 0 && (
                    <div className={currentStepDefinition.bodyClassName}>
                      <div className="space-y-1">
                        <OnboardingFieldLabel>
                          이름 (한글 이름의 경우 한글로 적어주세요.)
                        </OnboardingFieldLabel>
                        <BeigeInput
                          autoFocus
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="이름"
                          className="h-12 text-base"
                        />
                      </div>
                      <div className="space-y-1">
                        <OnboardingFieldLabel>이메일</OnboardingFieldLabel>
                        <BeigeInput
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="email@example.com"
                          className="h-12 text-base"
                        />
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className={currentStepDefinition.bodyClassName}>
                      {TALENT_NETWORK_ENGAGEMENT_OPTIONS.map(
                        (option, index) => {
                          const copy = ONBOARDING_ENGAGEMENT_COPY[option.id];

                          return (
                            <EngagementCardButton
                              key={option.id}
                              id={option.id}
                              optionNumber={index + 1}
                              label={copy.label}
                              description={copy.description}
                              active={selectedEngagements.includes(option.id)}
                              onClick={() => handleEngagementToggle(option.id)}
                            />
                          );
                        }
                      )}
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
                          />
                        ))}
                      </div>
                      <div
                        className={currentStepDefinition.secondaryBodyClassName}
                      >
                        {selectedProfileInputs.includes("linkedin") && (
                          <BeigeLinkInput
                            label="LinkedIn"
                            placeholder="https://linkedin.com/in/..."
                            value={linkedin}
                            onChange={(event) =>
                              setLinkedin(event.target.value)
                            }
                          />
                        )}
                        {selectedProfileInputs.includes("github") && (
                          <BeigeLinkInput
                            label="GitHub / Hugging Face"
                            placeholder="https://github.com/..."
                            value={github}
                            onChange={(event) => setGithub(event.target.value)}
                          />
                        )}
                        {selectedProfileInputs.includes("scholar") && (
                          <BeigeLinkInput
                            label="Google Scholar"
                            placeholder="https://scholar.google.com/..."
                            value={scholar}
                            onChange={(event) => setScholar(event.target.value)}
                          />
                        )}
                        {selectedProfileInputs.includes("website") && (
                          <BeigeLinkInput
                            label="개인 페이지"
                            placeholder="https://..."
                            value={website}
                            onChange={(event) => setWebsite(event.target.value)}
                          />
                        )}
                        {selectedProfileInputs.includes("cv") && (
                          <ResumeUploadInput
                            fileName={resumeFile?.name ?? ""}
                            onChange={(event) =>
                              setResumeFile(event.target.files?.[0] ?? null)
                            }
                          />
                        )}
                      </div>
                    </>
                  )}

                  {step === 3 && (
                    <>
                      <div className={currentStepDefinition.bodyClassName}>
                        {ONBOARDING_PROFILE_VISIBILITY_OPTIONS.map(
                          (option, index) => (
                            <SelectionCardButton
                              key={option.id}
                              optionNumber={index + 1}
                              Icon={option.Icon}
                              label={option.label}
                              description={option.description}
                              active={profileVisibility === option.id}
                              onClick={() => setProfileVisibility(option.id)}
                            />
                          )
                        )}
                      </div>
                      <p className={currentStepDefinition.footnoteClassName}>
                        {selectedVisibilityOption.sub}
                      </p>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              {submitError && (
                <p className="mx-auto mt-5 w-full max-w-[680px] border border-xprimary/30 bg-white/45 px-3 py-2 text-left text-sm leading-6 text-xprimary">
                  {submitError}
                </p>
              )}

              <div className="mt-8 flex w-full flex-col-reverse items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
                {step > 0 && (
                  <BeigeButton
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handlePrev}
                    className="font-normal w-full sm:w-auto"
                  >
                    이전
                  </BeigeButton>
                )}
                <BeigeButton
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={handleNext}
                  className="font-normal min-w-[76px] w-full sm:w-auto"
                >
                  {step === TOTAL_STEPS - 1 ? (
                    <>
                      <span>정보 제출하기</span>
                      <span className="text-beige100/70">
                        {" "}
                        - 2분 정도 소요됩니다.
                      </span>
                    </>
                  ) : (
                    "다음"
                  )}
                </BeigeButton>
                <div className="hidden text-sm text-beige900/45 md:block">
                  press <span className="font-medium text-beige900">Enter</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
};

const CareerNetworkOnboardingPage = () => {
  return <CareerNetworkOnboardingContent />;
};

export default CareerNetworkOnboardingPage;

import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  ArrowRight,
  FileText,
  Globe2,
  LoaderCircle,
  MessageSquareText,
  Phone,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { showToast } from "@/components/toast/toast";
import CareerMobileViewportGate from "@/components/career/CareerMobileViewportGate";
import { BeigeButton, BeigeInput } from "@/components/ui/beige";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { resolveCareerMobileEntryReason } from "@/lib/career/mobileBlocker";
import {
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  TALENT_NETWORK_PROFILE_INPUT_OPTIONS,
  type TalentNetworkEngagementOptionId,
  type TalentNetworkProfileInputType,
} from "@/lib/talentNetworkOptions";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/useAuthStore";
import { LoadingState } from "./OnboardingLoadingState";

const TOTAL_STEPS = 3;

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

const ProgressBar = ({ step }: { step: number }) => {
  const value = Math.min((step + 1) / TOTAL_STEPS, 1) * 100;

  return (
    <div className="fixed left-0 top-0 z-30 h-2 w-full bg-beige500">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="h-full bg-xprimary"
      />
    </div>
  );
};

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
  label,
  optionNumber,
  onClick,
}: {
  active: boolean;
  description?: string;
  label: string;
  optionNumber: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex min-h-[74px] w-full flex-col items-start justify-start rounded-md border-2 px-3 py-2.5 text-left transition duration-300",
      active
        ? "border-beige900/80 bg-beige500 text-beige900"
        : "border-beige900/10 bg-beige100 text-beige900 hover:border-beige900/60 hover:bg-beige500/50"
    )}
  >
    <span className="flex w-full items-start gap-3">
      <span
        className={cn(
          "mt-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border text-xs font-medium md:inline-flex",
          active
            ? "border-beige900 bg-beige900 text-beige100"
            : "border-black/10 bg-white text-beige900"
        )}
      >
        {optionNumber}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-base font-normal">{label}</span>
        {description ? (
          <span className="mt-1 text-sm leading-5 text-beige900/60">
            {description}
          </span>
        ) : null}
      </span>
    </span>
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
}> = [
  {
    id: "open_to_matches",
    label: "Open to matches",
    description:
      "강하게 맞는 포지션으로 판단되면 회사에 먼저 프로필을 공유하고, 구체적인 제안을 받으신 뒤 판단하실 수 있도록 합니다.",
    sub: "강하게 맞는 포지션으로 판단되면 회사에 먼저 프로필을 공유하고, 구체적인 제안을 받으신 뒤 판단하실 수 있도록 합니다.",
  },
  {
    id: "exceptional_only",
    label: "Exceptional only",
    description:
      "매칭된 기회/회사를 확인한 뒤 허용한 경우에만 프로필이 공유됩니다.",
    sub: "매칭된 기회/회사를 확인한 뒤 허용한 경우에만 프로필이 회사 측에 공유됩니다. 이 경우에도 대화 내용 및 선택하신 옵션이 공개되진 않고, 매칭에 필요한 정보만 공유됩니다.",
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

// const LoadingState = () => (
//   <div className="mx-auto flex min-h-[calc(100dvh-8px)] w-full max-w-[760px] flex-col items-center justify-center px-4 text-center">
//     <div className="relative flex h-14 w-14 items-center justify-center">
//       <motion.div
//         animate={{ rotate: 360 }}
//         transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
//         className="absolute h-14 w-14 rounded-full border-2 border-beige900/10 border-t-xprimary"
//       />
//       <LoaderCircle className="h-5 w-5 text-beige900/55" />
//     </div>
//     <p className="mt-8 max-w-[640px] text-xl font-medium leading-8 tracking-[-0.03em] text-beige900 md:text-2xl md:leading-10">
//       감사합니다. 이력을 확인하고, 바로 구조화하고 있습니다…
//       <br />
//       최대 2분 정도 소요됩니다. 확인이 끝나면 Harper와 잠깐 대화하면서 현재 어떤
//       상황인지, 어떤 기회를 선호하시는지 더 자세하게 알려주세요.
//     </p>
//   </div>
// );

const DoneState = ({
  onStartCall,
  onStartChat,
}: {
  onStartCall: () => void;
  onStartChat: () => void;
}) => (
  <div className="mx-auto flex min-h-[calc(100dvh-8px)] w-full max-w-[680px] flex-col items-center justify-center px-4 text-center">
    <h1 className="text-2xl font-medium tracking-[-0.04em] md:text-3xl">
      확인이 끝났습니다.
    </h1>
    <p className="mt-3 text-base leading-7 text-beige900/60 md:text-lg">
      이제 Harper와 잠깐 대화하면서 현재 상황과 선호하는 기회를 알려주세요.
    </p>
    <div className="mt-8 grid w-full max-w-[520px] gap-3 md:grid-cols-2">
      <BeigeButton
        type="button"
        size="lg"
        variant="primary"
        icon={<Phone className="h-4 w-4" />}
        onClick={onStartCall}
        className="w-full"
      >
        전화로 얘기하기
      </BeigeButton>
      <BeigeButton
        type="button"
        size="lg"
        variant="outline"
        icon={<MessageSquareText className="h-4 w-4" />}
        onClick={onStartChat}
        className="w-full"
      >
        채팅으로 얘기하기
      </BeigeButton>
    </div>
  </div>
);

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

    if (!user) {
      const next = router.asPath || "/career/onboarding";
      void router.replace(
        `/career_login?next=${encodeURIComponent(next)}&source=network`
      );
      return;
    }

    let cancelled = false;

    const loadSession = async () => {
      setBootstrapLoading(true);
      setSubmitError("");

      try {
        const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (!bootstrapRes.ok) {
          const payload = await bootstrapRes.json().catch(() => ({}));
          throw new Error(
            getErrorMessage(payload, "로그인 정보를 초기화하지 못했습니다.")
          );
        }

        const sessionRes = await fetchWithAuth("/api/talent/session");
        const payload = await sessionRes.json().catch(() => ({}));
        if (!sessionRes.ok) {
          throw new Error(
            getErrorMessage(payload, "온보딩 세션을 불러오지 못했습니다.")
          );
        }

        if (cancelled) return;

        if (payload?.conversation?.stage !== "profile") {
          const invite = getSingleQueryParam(router.query.invite);
          const mail = getSingleQueryParam(router.query.mail);
          const query: Record<string, string> = {};
          if (invite) query.invite = invite;
          if (mail) query.mail = mail;

          void router.replace({
            pathname: "/career",
            query: Object.keys(query).length > 0 ? query : undefined,
          });
          return;
        }

        setConversationId(String(payload?.conversation?.id ?? ""));
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
  }, [authLoading, fetchWithAuth, router, router.asPath, router.isReady, user]);

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

  const hasProfileSignal = links.length > 0 || Boolean(resumeFile);

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

      if (currentStep === 1 && !hasProfileSignal) {
        showToast({
          message: "대표 프로필 링크나 이력서 중 하나를 입력해주세요.",
          variant: "white",
        });
        return false;
      }

      if (currentStep === 2) {
        if (selectedEngagements.length === 0) {
          showToast({
            message: "찾고 있는 업무 형태를 선택해주세요.",
            variant: "white",
          });
          return false;
        }
      }

      return true;
    },
    [email, hasProfileSignal, name, selectedEngagements]
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
      const payload = await startRes.json().catch(() => ({}));
      if (!startRes.ok) {
        throw new Error(
          getErrorMessage(payload, "프로필 구조화를 시작하지 못했습니다.")
        );
      }

      queryClient.removeQueries({ queryKey: ["career-session"] });
      queryClient.removeQueries({ queryKey: ["career-message-history"] });
      queryClient.removeQueries({ queryKey: ["career-history-opportunities"] });
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
    save: () => undefined,
    totalSteps: TOTAL_STEPS,
    beforeNext: validateStep,
    onComplete: () => void submitOnboarding(),
    enableWheelNavigation: false,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (step !== 2 || !/^[1-9]$/.test(event.key)) return;

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
      const engagement = TALENT_NETWORK_ENGAGEMENT_OPTIONS[optionIndex];
      if (engagement) {
        event.preventDefault();
        handleEngagementToggle(engagement.id);
        return;
      }

      const visibility =
        ONBOARDING_PROFILE_VISIBILITY_OPTIONS[
          optionIndex - TALENT_NETWORK_ENGAGEMENT_OPTIONS.length
        ];
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

  const stepLabel = `${step + 1}/${TOTAL_STEPS}`;
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
      <main className="flex min-h-screen items-center justify-center bg-beige100 font-geist text-beige900">
        <LoaderCircle className="h-5 w-5 animate-spin text-beige900/40" />
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Harper Onboarding</title>
      </Head>
      <main className="min-h-[100dvh] bg-beige100 pt-2 font-geist text-beige900">
        <ProgressBar step={step} />

        {submitState === "loading" ? (
          <LoadingState />
        ) : submitState === "done" ? (
          <DoneState
            onStartCall={() => navigateToCareerStart("call")}
            onStartChat={() => navigateToCareerStart("chat")}
          />
        ) : (
          <div className="mx-auto flex min-h-[calc(100dvh-8px)] w-full max-w-[1040px] flex-col px-4 py-6 md:flex-row md:gap-10 md:py-10">
            <aside className="hidden w-[210px] shrink-0 md:block">
              <div className="sticky top-10 border-r border-beige900/10 pr-6">
                <button
                  type="button"
                  onClick={() => void router.push("/network")}
                  className="font-halant text-[32px] leading-none tracking-[-0.06em]"
                >
                  Harper
                </button>
                <div className="mt-8 space-y-3 text-sm text-beige900/55">
                  {["회원 정보", "대표 프로필", "찾고 있는 기회"].map(
                    (label, index) => (
                      <div
                        key={label}
                        className={cn(
                          "flex items-center gap-2",
                          index === step && "font-medium text-beige900"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full bg-beige900/20",
                            index === step && "bg-xprimary"
                          )}
                        />
                        {label}
                      </div>
                    )
                  )}
                </div>
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col justify-start pt-8 md:pt-[6vh]">
              <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-xprimary md:text-base">
                {stepLabel}
                <ArrowRight className="h-4 w-4" />
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
                  className="flex w-full flex-col gap-5"
                >
                  {step === 0 ? (
                    <>
                      <header>
                        <h1 className="max-w-[720px] text-2xl font-medium leading-[1.3] tracking-[-0.04em] md:text-3xl">
                          Harper는 원하던 곳에서 만족하며 일하시게 되는 날까지
                          모든 과정을 돕습니다.
                        </h1>
                        <p className="mt-4 text-xl font-normal tracking-[-0.03em] text-beige900/70 md:text-2xl">
                          회원님에 대해서 알려주세요.
                        </p>
                      </header>
                      <div className="mt-4 grid gap-5">
                        <div className="space-y-2">
                          <OnboardingFieldLabel>이름</OnboardingFieldLabel>
                          <BeigeInput
                            autoFocus
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="이름"
                            className="h-12 text-base"
                          />
                        </div>
                        <div className="space-y-2">
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
                    </>
                  ) : null}

                  {step === 1 ? (
                    <>
                      <header>
                        <h1 className="text-2xl font-medium tracking-[-0.04em] md:text-3xl">
                          대표 프로필을 알려주세요.
                        </h1>
                        <p className="mt-3 text-base leading-7 text-beige900/60 md:text-lg">
                          링크드인이 없다면 다른 정보를 주셔도 괜찮습니다.
                        </p>
                      </header>
                      <div className="mt-1 flex flex-wrap gap-2">
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
                      <div className="mt-3 flex flex-col gap-4">
                        {selectedProfileInputs.includes("linkedin") ? (
                          <BeigeLinkInput
                            label="LinkedIn"
                            placeholder="https://linkedin.com/in/..."
                            value={linkedin}
                            onChange={(event) =>
                              setLinkedin(event.target.value)
                            }
                          />
                        ) : null}
                        {selectedProfileInputs.includes("github") ? (
                          <BeigeLinkInput
                            label="GitHub / Hugging Face"
                            placeholder="https://github.com/..."
                            value={github}
                            onChange={(event) => setGithub(event.target.value)}
                          />
                        ) : null}
                        {selectedProfileInputs.includes("scholar") ? (
                          <BeigeLinkInput
                            label="Google Scholar"
                            placeholder="https://scholar.google.com/..."
                            value={scholar}
                            onChange={(event) => setScholar(event.target.value)}
                          />
                        ) : null}
                        {selectedProfileInputs.includes("website") ? (
                          <BeigeLinkInput
                            label="개인 페이지"
                            placeholder="https://..."
                            value={website}
                            onChange={(event) => setWebsite(event.target.value)}
                          />
                        ) : null}
                        {selectedProfileInputs.includes("cv") ? (
                          <ResumeUploadInput
                            fileName={resumeFile?.name ?? ""}
                            onChange={(event) =>
                              setResumeFile(event.target.files?.[0] ?? null)
                            }
                          />
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {step === 2 ? (
                    <>
                      <header>
                        <h1 className="text-2xl font-medium tracking-[-0.04em] md:text-3xl">
                          어떤 기회를 찾고 계신가요?
                        </h1>
                      </header>
                      <div className="mt-2 space-y-6">
                        <div>
                          <div className="mb-3 text-base font-medium">
                            찾고 있는 업무 형태
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            {TALENT_NETWORK_ENGAGEMENT_OPTIONS.map(
                              (option, index) => (
                                <SelectionCardButton
                                  key={option.id}
                                  optionNumber={index + 1}
                                  label={option.label}
                                  description={option.description}
                                  active={selectedEngagements.includes(
                                    option.id
                                  )}
                                  onClick={() =>
                                    handleEngagementToggle(option.id)
                                  }
                                />
                              )
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="mb-3 text-base font-medium">
                            프로필 공개
                          </div>
                          <p className="mb-3 text-sm leading-6 text-beige900/55">
                            어떤 수준의 매칭에서 회사가 프로필을 볼 수 있는지
                            정합니다.
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            {ONBOARDING_PROFILE_VISIBILITY_OPTIONS.map(
                              (option, index) => (
                                <SelectionCardButton
                                  key={option.id}
                                  optionNumber={
                                    TALENT_NETWORK_ENGAGEMENT_OPTIONS.length +
                                    index +
                                    1
                                  }
                                  label={option.label}
                                  description={option.description}
                                  active={profileVisibility === option.id}
                                  onClick={() =>
                                    setProfileVisibility(option.id)
                                  }
                                />
                              )
                            )}
                          </div>
                          <p className="mt-3 text-[13px] leading-5 text-beige900/80">
                            {selectedVisibilityOption.sub}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </motion.div>
              </AnimatePresence>

              {submitError ? (
                <p className="mt-5 border border-xprimary/30 bg-white/45 px-3 py-2 text-sm leading-6 text-xprimary">
                  {submitError}
                </p>
              ) : null}

              <div className="mt-8 flex flex-col-reverse gap-3 md:flex-row md:items-center">
                {step > 0 ? (
                  <BeigeButton
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handlePrev}
                  >
                    이전
                  </BeigeButton>
                ) : null}
                <BeigeButton
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={handleNext}
                  className="w-full md:w-fit"
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
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const entryReason = resolveCareerMobileEntryReason(router.query);

  return (
    <CareerMobileViewportGate
      desktopFallback={<LoadingState />}
      entryReason={entryReason}
      user={user}
    >
      <CareerNetworkOnboardingContent />
    </CareerMobileViewportGate>
  );
};

export default CareerNetworkOnboardingPage;

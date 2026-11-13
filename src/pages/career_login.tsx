import { getCurrentOfficialJobsAbtestType } from "@/lib/officialJobs/experiment";
import { useGtmInvitePosting } from "@/hooks/career/useGtmInviteClaim";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ParsedUrlQuery } from "querystring";
import {
  Copy,
  EllipsisVertical,
  ExternalLink,
  Loader2,
  MailCheck,
  MoreHorizontal,
} from "lucide-react";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  normalizeCareerUtmSource,
  readActiveCareerExplicitUtmSourceFromStorage,
  readCareerUtmParamsFromSearch,
} from "@/lib/career/utm";
import { useCountryLang } from "@/hooks/useCountryLang";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import ConfirmModal from "@/components/Modal/ConfirmModal";
import { isOverseasCountryLang } from "@/i18n/localeResolution";
import { useMessages, type Locale } from "@/i18n/useMessage";
import {
  OFFICIAL_JOBS_ONBOARDING_JOB_PARAM,
  OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM,
  OFFICIAL_JOBS_ONBOARDING_ROLE_ID_PARAM,
  OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH,
} from "@/lib/officialJobs";
import {
  OFFICIAL_JOBS_LANDING_SOURCE,
} from "@/lib/officialJobs/landingLogs";
import {
  postOfficialJobsLoginStep,
  type OfficialJobEventMetadata,
  type OfficialJobsLoginStep,
} from "@/lib/officialJobs/events";
import {
  buildSafariOpenUrl,
  describeBrowserForLog,
  detectInAppBrowserApp,
  detectMobileOs,
  readOfficialJobsLandingIdFromSearch,
  watchForPageLeave,
  type MobileOs,
} from "@/lib/career/inAppBrowser";
import { supabase } from "@/lib/supabase";
import {
  captureTalentNetworkReferralFromCurrentLocation,
  TALENT_NETWORK_REFERRAL_QUERY_KEY,
  TALENT_NETWORK_REFERRAL_SOURCE_CAREER_LOGIN,
} from "@/lib/talentNetworkReferral";
import { buildPrivacyPolicyAcknowledgement } from "@/lib/legal/legalDocumentAcceptance";

type PartnerLogo = {
  src: string;
  name: string;
  width: number;
  height?: number;
};

const partnerLogos: PartnerLogo[] = [
  { src: "/images/logos/sn.png", name: "snu", width: 78 },
  { src: "/images/logos/kai.png", name: "kaist", width: 82 },
  { src: "/images/logos/stan.png", name: "stanford", width: 52, height: 40 },
  { src: "/svgs/cohere.svg", name: "cohere", width: 98, height: 32 },
  { src: "/svgs/yc.svg", name: "ycombinator", width: 100 },
  { src: "/images/logos/amazon.svg", name: "amazon", width: 68, height: 23 },
  { src: "/images/logos/naver.svg", name: "naver", width: 64 },
  { src: "/images/logos/moloco.png", name: "moloco", width: 78 },
];

const overseasPartnerLogos: PartnerLogo[] = [
  { src: "/images/logos/stan.png", name: "stanford", width: 52, height: 40 },
  { src: "/images/logos/harvard.svg", name: "harvard", width: 108, height: 32 },
  { src: "/svgs/cohere.svg", name: "cohere", width: 98, height: 32 },
  { src: "/svgs/yc.svg", name: "ycombinator", width: 100 },
  { src: "/images/logos/nvidia.svg", name: "nvidia", width: 92 },
  {
    src: "/images/logos/microsoft.svg",
    name: "microsoft",
    width: 88,
    height: 24,
  },
  { src: "/images/logos/amazon.svg", name: "amazon", width: 68, height: 23 },
  { src: "/images/logos/bcg.svg", name: "bcg", width: 58, height: 23 },
];

const CAREER_LOGIN_COPY: Record<
  Locale,
  {
    loadingLabel: string;
    passwordMismatch: string;
    heroLineOne: string;
    heroLineTwo: string;
    heroLineThree: string;
    heroDescription: string;
    officialJobProgressHelp: (job: string) => string;
    gtmInviteHelp: (posting: string | null) => string;
    confirmationTitle: string;
    confirmationEmailPrefix: (email: string) => string;
    confirmationDescription: string;
    confirmationHelp: string;
    pending: string;
    continueWithGoogle: string;
    divider: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    passwordConfirmPlaceholder: string;
    continueWithEmail: string;
    signIn: string;
    signUp: string;
    switchToSignUp: string;
    switchToSignIn: string;
    resetPassword: string;
    resetPasswordNeedsEmail: string;
    resetPasswordInvalidEmail: string;
    resetPasswordConfirmTitle: string;
    resetPasswordConfirm: (email: string) => string;
    resetPasswordSent: (email: string) => string;
    resetPasswordFailed: string;
    cancel: string;
    inAppBrowserTitle: string;
    inAppBrowserDescription: string;
    openInBrowser: string;
    copyBrowserLink: string;
    copyBrowserLinkDone: string;
    copyBrowserLinkFailed: string;
    browserFallbackMenuBefore: string;
    browserFallbackMenuAfter: string;
    browserFallbackOpen: string;
    browserFallbackCopied: string;
    privacyNoticePrefix: string;
    privacyNoticeSuffix: string;
    privacyPolicyLabel: string;
    trustedBy: string;
  }
> = {
  ko: {
    loadingLabel: "커리어 로그인 페이지 로딩 중",
    passwordMismatch: "비밀번호가 일치하지 않습니다.",
    heroLineOne: "당신만을 위한",
    heroLineTwo: "커리어 에이전트",
    heroLineThree: "Harper",
    heroDescription:
      "하나의 프로필에서 대화, 선호, 추천까지. 인재를 위한 커리어 에이전트 Harper와 함께 시작하세요.",
    officialJobProgressHelp: (job) => `${job}로 진행 도와드릴게요.`,
    gtmInviteHelp: (posting) =>
      posting
        ? `가입하거나 로그인하면 메일로 받은 ${posting} 공고가 내 기회에 담겨요.`
        : "가입하거나 로그인하면 메일로 받은 공고가 내 기회에 담겨요.",
    confirmationTitle: "인증 메일을 보냈습니다",
    confirmationEmailPrefix: (email) => `${email}로 `,
    confirmationDescription:
      "보낸 메일의 인증 링크를 열어 회원가입을 완료해 주세요. 인증이 끝나면 다시 이 페이지로 돌아와 이메일 로그인으로 계속할 수 있습니다.",
    confirmationHelp:
      "메일이 보이지 않으면 스팸함이나 프로모션함도 확인해 주세요.",
    pending: "처리 중...",
    continueWithGoogle: "Google 계정으로 계속하기",
    divider: "또는",
    emailPlaceholder: "이메일 입력",
    passwordPlaceholder: "비밀번호 입력",
    passwordConfirmPlaceholder: "비밀번호 확인",
    continueWithEmail: "이메일로 계속하기",
    signIn: "로그인",
    signUp: "회원가입",
    switchToSignUp: "처음이라면 회원가입",
    switchToSignIn: "이미 계정이 있다면 로그인",
    resetPassword: "비밀번호 재설정",
    resetPasswordNeedsEmail:
      "비밀번호 재설정 링크를 받을 이메일을 먼저 입력해 주세요.",
    resetPasswordInvalidEmail: "이메일 형식을 확인해 주세요.",
    resetPasswordConfirmTitle: "비밀번호를 재설정할까요?",
    resetPasswordConfirm: (email) =>
      `${email}로 비밀번호 재설정 링크를 보냅니다.\n현재 비밀번호는 바로 바뀌지 않고, 메일 링크에서 새 비밀번호를 설정하게 됩니다.`,
    resetPasswordSent: (email) =>
      `${email}로 비밀번호 재설정 링크를 보냈습니다. 메일의 링크를 열어 새 비밀번호를 설정해 주세요.`,
    resetPasswordFailed:
      "비밀번호 재설정 메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    cancel: "취소",
    inAppBrowserTitle: "외부 브라우저에서 접속해주세요",
    inAppBrowserDescription:
      "카카오톡, 인스타그램 같은 앱 안에서는 구글 로그인이 차단될 수 있습니다. 구글 로그인은 아래 버튼을 통해 이어갈 수 있습니다.",
    openInBrowser: "브라우저에서 열기",
    copyBrowserLink: "로그인 링크 복사",
    copyBrowserLinkDone:
      "링크를 복사했습니다. Safari나 Chrome 주소창에 붙여넣어 주세요.",
    copyBrowserLinkFailed:
      "링크 복사에 실패했습니다. 주소창의 URL을 Safari나 Chrome에서 직접 열어 주세요.",
    browserFallbackMenuBefore: "화면 위나 아래의",
    browserFallbackMenuAfter: "메뉴를 눌러 주세요.",
    browserFallbackOpen:
      "'브라우저에서 열기' 또는 'Safari로 열기'를 선택해 주세요.",
    browserFallbackCopied:
      "로그인 링크도 복사했습니다. Safari나 Chrome 주소창에 붙여넣어도 됩니다.",
    privacyNoticePrefix: "계속 진행한다면 Harper의 ",
    privacyNoticeSuffix: "에 동의하게 됩니다.",
    privacyPolicyLabel: "개인정보 처리방침",
    trustedBy: "이곳의 인재들이 신뢰합니다.",
  },
  en: {
    loadingLabel: "Loading Harper Career login",
    passwordMismatch: "Passwords do not match.",
    heroLineOne: "Your personal",
    heroLineTwo: "career agent",
    heroLineThree: "Harper",
    heroDescription:
      "Start with Harper, the career agent that keeps your profile, conversations, preferences, and recommendations in one place.",
    officialJobProgressHelp: (job) => `I'll help you move forward with ${job}.`,
    gtmInviteHelp: (posting) =>
      posting
        ? `Sign up or log in, and ${posting} from your email will be waiting in your opportunities.`
        : "Sign up or log in, and the role from your email will be waiting in your opportunities.",
    confirmationTitle: "Verification email sent",
    confirmationEmailPrefix: (email) => `We sent it to ${email}. `,
    confirmationDescription:
      "Open the verification link in your email to finish signing up. Once verified, return to this page and continue with email login.",
    confirmationHelp:
      "If you do not see the email, check your spam or promotions folder.",
    pending: "Processing...",
    continueWithGoogle: "Continue with Google",
    divider: "or",
    emailPlaceholder: "Enter your email",
    passwordPlaceholder: "Enter your password",
    passwordConfirmPlaceholder: "Confirm your password",
    continueWithEmail: "Continue with email",
    signIn: "Log in",
    signUp: "Sign up",
    switchToSignUp: "New here? Sign up",
    switchToSignIn: "Already have an account? Log in",
    resetPassword: "Reset password",
    resetPasswordNeedsEmail:
      "Enter your email first to receive a password reset link.",
    resetPasswordInvalidEmail: "Please check the email format.",
    resetPasswordConfirmTitle: "Reset your password?",
    resetPasswordConfirm: (email) =>
      `We'll send a password reset link to ${email}.\nYour password will not change until you open the email link and set a new one.`,
    resetPasswordSent: (email) =>
      `We sent a password reset link to ${email}. Open the email link to set a new password.`,
    resetPasswordFailed:
      "We couldn't send the password reset email. Please try again shortly.",
    cancel: "Cancel",
    inAppBrowserTitle: "Open this page in a browser",
    inAppBrowserDescription:
      "Google sign-in can be blocked inside in-app browsers such as KakaoTalk or Instagram. Open this link in Safari or Chrome to continue.",
    openInBrowser: "Open in browser",
    copyBrowserLink: "Copy login link",
    copyBrowserLinkDone:
      "Link copied. Paste it into Safari or Chrome to continue.",
    copyBrowserLinkFailed:
      "We couldn't copy the link. Open the current URL directly in Safari or Chrome.",
    browserFallbackMenuBefore: "Tap the",
    browserFallbackMenuAfter: "menu at the top or bottom of the screen.",
    browserFallbackOpen: 'Choose "Open in browser" or "Open in Safari".',
    browserFallbackCopied:
      "We also copied the login link. You can paste it into Safari or Chrome.",
    privacyNoticePrefix: "By continuing, you agree to Harper's ",
    privacyNoticeSuffix: ".",
    privacyPolicyLabel: "Privacy Policy",
    trustedBy: "Trusted by talent from these communities.",
  },
};

const AUTH_BROWSER_QUERY_PARAM = "auth_browser";
const IN_APP_BROWSER_QUERY_VALUE = "in_app";
const IN_APP_BROWSER_QUERY_VALUES = new Set([
  IN_APP_BROWSER_QUERY_VALUE,
  "in-app",
  "webview",
  "1",
  "true",
]);

const resolveSafeNextPath = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
};

const officialJobsRoleTitleFromNextPath = (nextPath: string) => {
  try {
    const nextUrl = new URL(nextPath, "https://matchharper.com");
    const source = normalizeCareerUtmSource(nextUrl.searchParams.get("source"));
    if (source !== OFFICIAL_JOBS_LANDING_SOURCE) return "";

    return (
      nextUrl.searchParams
        .get(OFFICIAL_JOBS_ONBOARDING_JOB_PARAM)
        ?.trim()
        .slice(0, OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH) ?? ""
    );
  } catch {
    return "";
  }
};

const officialJobsSlugFromNextPath = (nextPath: string) => {
  try {
    const nextUrl = new URL(nextPath, "https://matchharper.com");
    const source = normalizeCareerUtmSource(nextUrl.searchParams.get("source"));
    if (source !== OFFICIAL_JOBS_LANDING_SOURCE) return "";

    return (
      nextUrl.searchParams
        .get(OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM)
        ?.trim() ?? ""
    );
  } catch {
    return "";
  }
};

const getSingleQueryValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

const shouldForceInAppBrowserNotice = (
  value: string | string[] | undefined
) => {
  return IN_APP_BROWSER_QUERY_VALUES.has(
    getSingleQueryValue(value).trim().toLowerCase()
  );
};

const isLikelyInAppBrowser = (userAgent: string) => {
  return /kakaotalk|instagram|threads|barcelona|fbav|fban|fb_iab|line\/|naver\(inapp|naver\(apps|daumapps|kakaostory|linkedinapp|twitter|;\s*wv\)|\bwv\b/i.test(
    userAgent
  );
};

// The phone brings an outside browser up well within this. A prompt from the
// app or the OS can keep the page showing longer, so a later leave still counts.
const BROWSER_STAYED_AFTER_MS = 1500;
const BROWSER_LEAVE_WATCH_MS = 60000;

// Login-step log facts: the browser kind and the /jobs visitor ID in the URL.
const readJobsLoginLogFacts = () => {
  const userAgent = window.navigator.userAgent;
  return {
    ...describeBrowserForLog(userAgent, isLikelyInAppBrowser(userAgent)),
    lid: readOfficialJobsLandingIdFromSearch(
      window.location.search,
      window.location.origin
    ),
  };
};

const officialJobsRoleTitleFromLoginQuery = (query: ParsedUrlQuery) => {
  const source = normalizeCareerUtmSource(getSingleQueryValue(query.source));
  if (source !== OFFICIAL_JOBS_LANDING_SOURCE) return "";

  return getSingleQueryValue(query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM])
    .trim()
    .slice(0, OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH);
};

const CareerLoginLoadingState = () => (
  <main className="relative flex min-h-svh w-full items-center justify-center bg-bg-basement text-neutral-primary">
    <Loader2 className="h-5 w-5 animate-spin text-neutral-muted" />
    <CareerLoginLoadingLabel />
  </main>
);

const CareerLoginLoadingLabel = () => {
  const { locale } = useMessages();
  const copy = CAREER_LOGIN_COPY[locale];
  return <span className="sr-only">{copy.loadingLabel}</span>;
};

const CareerLoginContent = () => {
  const router = useRouter();
  const countryLang = useCountryLang();
  const { locale } = useMessages();
  const copy = CAREER_LOGIN_COPY[locale];
  const [hasResolvedLogoRegion, setHasResolvedLogoRegion] = useState(false);
  const trustedLogos =
    hasResolvedLogoRegion && isOverseasCountryLang(countryLang)
      ? overseasPartnerLogos
      : partnerLogos;
  const {
    user,
    authLoading,
    authPending,
    authError,
    authInfo,
    handleGoogleLogin,
    handleEmailAuth,
  } = useCareerAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");
  const [formError, setFormError] = useState("");
  const [resetInfo, setResetInfo] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [resetConfirmEmail, setResetConfirmEmail] = useState("");
  const [detectedInAppBrowser, setDetectedInAppBrowser] = useState(false);
  const [browserLinkStatus, setBrowserLinkStatus] = useState("");
  const [browserFallback, setBrowserFallback] = useState<{
    copied: boolean;
    os: MobileOs;
  } | null>(null);
  const loggedJobsLoginViewRef = useRef(false);
  const stopLeaveWatchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasResolvedLogoRegion(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const nextPath = useMemo(
    () => resolveSafeNextPath(router.query.next) ?? "/career",
    [router.query.next]
  );
  const sourceParam = normalizeCareerUtmSource(
    getSingleQueryValue(router.query.source)
  );
  const officialJobTitleParam = getSingleQueryValue(
    router.query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM]
  )
    .trim()
    .slice(0, OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH);
  const officialJobSlugParam = getSingleQueryValue(
    router.query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM]
  ).trim();
  const officialJobRoleIdParam = getSingleQueryValue(
    router.query[OFFICIAL_JOBS_ONBOARDING_ROLE_ID_PARAM]
  ).trim();
  const officialJobSlugFromNext = useMemo(
    () => officialJobsSlugFromNextPath(nextPath),
    [nextPath]
  );
  const officialJobsRoleTitle = useMemo(
    () =>
      officialJobsRoleTitleFromNextPath(nextPath) ||
      officialJobsRoleTitleFromLoginQuery(router.query),
    [nextPath, router.query]
  );
  // Opened from a Harper GTM mail's button (next=/career?gtm=…): its posting goes into the inbox after sign-up.
  const fromGtmMail = /[?&]gtm=[0-9a-f-]{36}(?:&|$)/i.test(nextPath);
  const gtmPosting = useGtmInvitePosting();
  const gtmPostingLabel = gtmPosting
    ? [gtmPosting.companyName, gtmPosting.title].filter(Boolean).join(" · ")
    : null;
  const heroDescriptionLines = officialJobsRoleTitle
    ? [copy.officialJobProgressHelp(officialJobsRoleTitle)]
    : fromGtmMail
      ? [copy.gtmInviteHelp(gtmPostingLabel)]
      : [copy.heroDescription];
  const emailOnboardingTokenParam =
    typeof router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] === "string"
      ? router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]
      : "";
  const inviteParam = getSingleQueryValue(router.query.invite).trim();
  const referralParam = getSingleQueryValue(
    router.query[TALENT_NETWORK_REFERRAL_QUERY_KEY]
  ).trim();
  const localIdParam = getSingleQueryValue(router.query.lid).trim();
  const abtestTypeParam =
    sourceParam === OFFICIAL_JOBS_LANDING_SOURCE
      ? getCurrentOfficialJobsAbtestType()
      : getSingleQueryValue(router.query.ab).trim();
  const buildResolvedNextPath = useCallback(() => {
    const origin =
      typeof window === "undefined"
        ? "https://matchharper.com"
        : window.location.origin;
    const nextUrl = new URL(nextPath, origin);
    if (inviteParam) nextUrl.searchParams.set("invite", inviteParam);
    if (referralParam) {
      nextUrl.searchParams.set(
        TALENT_NETWORK_REFERRAL_QUERY_KEY,
        referralParam
      );
    }
    if (sourceParam) nextUrl.searchParams.set("source", sourceParam);
    if (localIdParam) nextUrl.searchParams.set("lid", localIdParam);
    if (abtestTypeParam) nextUrl.searchParams.set("ab", abtestTypeParam);
    if (
      sourceParam === OFFICIAL_JOBS_LANDING_SOURCE &&
      officialJobTitleParam &&
      !nextUrl.searchParams.get(OFFICIAL_JOBS_ONBOARDING_JOB_PARAM)
    ) {
      nextUrl.searchParams.set(
        OFFICIAL_JOBS_ONBOARDING_JOB_PARAM,
        officialJobTitleParam
      );
    }
    if (
      sourceParam === OFFICIAL_JOBS_LANDING_SOURCE &&
      officialJobSlugParam &&
      !nextUrl.searchParams.get(OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM)
    ) {
      nextUrl.searchParams.set(
        OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM,
        officialJobSlugParam
      );
    }
    if (emailOnboardingTokenParam) {
      nextUrl.searchParams.delete("mail");
      nextUrl.searchParams.set(
        CAREER_EMAIL_ONBOARDING_TOKEN_PARAM,
        emailOnboardingTokenParam
      );
    }
    if (
      sourceParam === OFFICIAL_JOBS_LANDING_SOURCE &&
      officialJobRoleIdParam &&
      !nextUrl.searchParams.get(OFFICIAL_JOBS_ONBOARDING_ROLE_ID_PARAM)
    ) {
      nextUrl.searchParams.set(
        OFFICIAL_JOBS_ONBOARDING_ROLE_ID_PARAM,
        officialJobRoleIdParam
      );
    }
    return `${nextUrl.pathname}${nextUrl.search}`;
  }, [
    abtestTypeParam,
    emailOnboardingTokenParam,
    inviteParam,
    referralParam,
    localIdParam,
    nextPath,
    officialJobRoleIdParam,
    officialJobSlugParam,
    officialJobTitleParam,
    sourceParam,
  ]);
  const emailConfirmationSent = Boolean(authInfo);
  const submittedEmail = email.trim();
  const authActionPending = authPending || resetPending;
  const forceInAppBrowserNotice = shouldForceInAppBrowserNotice(
    router.query[AUTH_BROWSER_QUERY_PARAM]
  );
  const showInAppBrowserNotice =
    forceInAppBrowserNotice || detectedInAppBrowser;
  const isOfficialJobsLogin = sourceParam === OFFICIAL_JOBS_LANDING_SOURCE;
  const privacyPolicyAcknowledgement = useMemo(
    () => buildPrivacyPolicyAcknowledgement(locale),
    [locale]
  );

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;

    const timeoutId = window.setTimeout(() => {
      setDetectedInAppBrowser(isLikelyInAppBrowser(window.navigator.userAgent));
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [router.isReady]);

  // A login from /jobs: log the view once. A view outside the in-app browser
  // whose `lid` matches an in-app click is how a successful move shows up.
  useEffect(() => {
    if (!router.isReady || authLoading || user || !isOfficialJobsLogin) return;
    if (loggedJobsLoginViewRef.current) return;
    loggedJobsLoginViewRef.current = true;

    void postOfficialJobsLoginStep("view", {
      ...readJobsLoginLogFacts(),
      noticeForced: forceInAppBrowserNotice,
    });
  }, [
    authLoading,
    forceInAppBrowserNotice,
    isOfficialJobsLogin,
    router.isReady,
    user,
  ]);

  useEffect(() => {
    return () => {
      stopLeaveWatchRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;

    const explicitUtmSource = readCareerUtmParamsFromSearch(
      window.location.search
    )?.utm_source;
    const routedSource =
      typeof router.query.source === "string"
        ? normalizeCareerUtmSource(router.query.source)
        : null;
    const activeExplicitUtmSource =
      explicitUtmSource ?? readActiveCareerExplicitUtmSourceFromStorage();
    const source = activeExplicitUtmSource ?? routedSource;
    const routedLocalId =
      typeof router.query.lid === "string" ? router.query.lid : "";
    const localId = activeExplicitUtmSource
      ? localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY) ||
        routedLocalId
      : routedLocalId;

    if (source) {
      localStorage.setItem(CAREER_UTM_SOURCE_STORAGE_KEY, source);
    }
    if (localId) {
      localStorage.setItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY, localId);
    }
  }, [router.asPath, router.isReady, router.query.lid, router.query.source]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    void captureTalentNetworkReferralFromCurrentLocation({
      source: TALENT_NETWORK_REFERRAL_SOURCE_CAREER_LOGIN,
    }).catch((error) => {
      console.warn("[career_login] referral capture failed:", error);
    });
  }, [router.isReady, router.asPath]);

  useEffect(() => {
    if (authLoading || !user || !router.isReady) return;

    void router.replace(buildResolvedNextPath());
  }, [authLoading, buildResolvedNextPath, router, router.isReady, user]);

  const buildBrowserLoginUrl = useCallback(() => {
    if (typeof window === "undefined") return "";

    const browserUrl = new URL(window.location.href);
    browserUrl.searchParams.delete(AUTH_BROWSER_QUERY_PARAM);
    return browserUrl.toString();
  }, []);

  const logJobsLoginStep = useCallback(
    (step: OfficialJobsLoginStep, metadata?: OfficialJobEventMetadata) => {
      if (!isOfficialJobsLogin || typeof window === "undefined") return;
      void postOfficialJobsLoginStep(step, {
        ...readJobsLoginLogFacts(),
        ...metadata,
      });
    },
    [isOfficialJobsLogin]
  );

  // Call within the tap: iOS refuses clipboard writes outside a user gesture.
  const writeBrowserLoginUrlToClipboard = useCallback(async () => {
    const browserUrl = buildBrowserLoginUrl();
    if (!browserUrl) return false;

    try {
      await window.navigator.clipboard.writeText(browserUrl);
      return true;
    } catch {
      return false;
    }
  }, [buildBrowserLoginUrl]);

  const copyBrowserLoginUrl = useCallback(async () => {
    const copied = await writeBrowserLoginUrlToClipboard();
    setBrowserLinkStatus(
      copied ? copy.copyBrowserLinkDone : copy.copyBrowserLinkFailed
    );
    return copied;
  }, [copy, writeBrowserLoginUrlToClipboard]);

  const handleCopyBrowserLink = useCallback(async () => {
    const copied = await copyBrowserLoginUrl();
    logJobsLoginStep("copy_link", { ok: copied });
  }, [copyBrowserLoginUrl, logJobsLoginStep]);

  const openBrowserLoginUrl = useCallback(() => {
    if (typeof window === "undefined") return;

    const browserUrl = buildBrowserLoginUrl();
    if (!browserUrl) return;

    setBrowserLinkStatus("");
    setBrowserFallback(null);

    // LinkedIn's in-app browser (almost all in-app /jobs traffic) often keeps
    // the user inside: on iPhone a new window reopens in the app, and on some
    // Android phones the Chrome intent never leaves. There, show the app-menu
    // way out right away, and log whether the page was left.
    const userAgent = window.navigator.userAgent;
    const os = detectMobileOs(userAgent);
    const guideLinkedInExit =
      detectInAppBrowserApp(userAgent) === "linkedin" && os !== "other";
    const showGuideAndWatch = (method: string) => {
      // Copy now, within the tap: phones refuse clipboard writes later.
      void writeBrowserLoginUrlToClipboard().then((copied) => {
        if (copied) setBrowserFallback({ copied, os });
      });
      setBrowserFallback({ copied: false, os });
      stopLeaveWatchRef.current?.();
      stopLeaveWatchRef.current = watchForPageLeave({
        doc: document,
        win: window,
        stayedAfterMs: BROWSER_STAYED_AFTER_MS,
        watchMs: BROWSER_LEAVE_WATCH_MS,
        onLeft: () => logJobsLoginStep("open_browser_left", { method }),
        onReplaced: () => logJobsLoginStep("open_browser_replaced", { method }),
        onStayed: () => logJobsLoginStep("open_browser_stayed", { method }),
      });
    };

    const browserUrlObject = new URL(browserUrl);
    if (/android/i.test(window.navigator.userAgent)) {
      logJobsLoginStep("open_browser_click", { method: "android_intent" });
      if (guideLinkedInExit) showGuideAndWatch("android_intent");
      window.location.href = `intent://${browserUrlObject.host}${browserUrlObject.pathname}${browserUrlObject.search}${browserUrlObject.hash}#Intent;scheme=${browserUrlObject.protocol.replace(
        ":",
        ""
      )};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
        browserUrl
      )};end`;
      return;
    }

    // iPhone LinkedIn: ask iOS to open Safari instead of a new window.
    const safariUrl = guideLinkedInExit ? buildSafariOpenUrl(browserUrl) : null;
    if (safariUrl) {
      logJobsLoginStep("open_browser_click", { method: "x_safari" });
      showGuideAndWatch("x_safari");
      window.location.href = safariUrl;
      return;
    }

    logJobsLoginStep("open_browser_click", { method: "window_open" });
    const opened = window.open(browserUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      void copyBrowserLoginUrl();
    }
  }, [
    buildBrowserLoginUrl,
    copyBrowserLoginUrl,
    logJobsLoginStep,
    writeBrowserLoginUrlToClipboard,
  ]);

  const handleSubmitEmailAuth = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    setResetInfo("");

    if (!showEmailForm) {
      setShowEmailForm(true);
      return;
    }

    if (emailMode === "signup" && password !== passwordConfirm) {
      setFormError(copy.passwordMismatch);
      return;
    }
    logJobsLoginStep("email_submit", { mode: emailMode });
    const ok = await handleEmailAuth({
      mode: emailMode,
      email,
      legalAcceptance:
        emailMode === "signup" ? privacyPolicyAcknowledgement : undefined,
      password,
    });
    if (ok) {
      void router.replace(buildResolvedNextPath());
    }
  };

  const handleGoogleAuth = () => {
    setFormError("");
    setResetInfo("");
    void handleGoogleLogin(privacyPolicyAcknowledgement);
  };

  const sendPasswordResetEmail = useCallback(
    async (normalizedEmail: string) => {
      if (authPending || resetPending) return;

      let redirectTo: string | undefined;
      if (typeof window !== "undefined") {
        const resetUrl = new URL(
          "/auths/reset-password",
          window.location.origin
        );
        const loginReturnPath = `${window.location.pathname}${window.location.search}`;
        resetUrl.searchParams.set(
          "next",
          loginReturnPath.startsWith("/career_login")
            ? loginReturnPath
            : "/career_login"
        );
        redirectTo = resetUrl.toString();
      }

      setResetPending(true);
      setFormError("");
      setResetInfo("");
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          { redirectTo }
        );
        if (error) {
          setResetConfirmEmail("");
          setFormError(copy.resetPasswordFailed);
          return;
        }
        setResetConfirmEmail("");
        setResetInfo(copy.resetPasswordSent(normalizedEmail));
      } catch {
        setResetConfirmEmail("");
        setFormError(copy.resetPasswordFailed);
      } finally {
        setResetPending(false);
      }
    },
    [authPending, copy, resetPending]
  );

  const handleResetPassword = useCallback(() => {
    if (authPending || resetPending) return;

    const normalizedEmail = email.trim();
    setFormError("");
    setResetInfo("");

    if (!normalizedEmail) {
      setShowEmailForm(true);
      setFormError(copy.resetPasswordNeedsEmail);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFormError(copy.resetPasswordInvalidEmail);
      return;
    }

    setResetConfirmEmail(normalizedEmail);
  }, [authPending, copy, email, resetPending]);

  if (authLoading || user || !router.isReady) {
    return <CareerLoginLoadingState />;
  }

  return (
    <>
      <Head>
        <title>Harper Career Login</title>
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <ConfirmModal
        open={Boolean(resetConfirmEmail)}
        title={copy.resetPasswordConfirmTitle}
        description={
          resetConfirmEmail
            ? copy.resetPasswordConfirm(resetConfirmEmail)
            : undefined
        }
        confirmLabel={copy.resetPassword}
        cancelLabel={copy.cancel}
        isLoading={resetPending}
        onClose={() => setResetConfirmEmail("")}
        onConfirm={() => {
          if (!resetConfirmEmail) return;
          void sendPasswordResetEmail(resetConfirmEmail);
        }}
      />
      <main className="relative flex min-h-svh w-full flex-col overflow-hidden bg-bg-basement text-neutral-primary">
        {/* <div
          className="pointer-events-none absolute inset-x-0 top-[60px] h-[62svh] min-h-[420px] opacity-70"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in srgb, var(--color-neutral-1000) 18%, transparent) 1.2px, transparent 1.2px)",
            backgroundSize: "16px 16px",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 78%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 78%, transparent 100%)",
          }}
        /> */}

        <header className="relative z-10 flex h-16 w-full items-center px-5 sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-[1760px] items-center">
            <div
              className="flex items-center gap-2 text-neutral-primary"
              onClick={() => void router.push("/")}
            >
              <Image
                src="/svgs/harper-h-mark.svg"
                alt=""
                width={20}
                height={20}
                aria-hidden="true"
                className="h-5 w-5"
              />
            </div>
          </div>
        </header>

        <section className="relative z-10 mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center px-4 pt-8 text-center sm:pt-8 md:pt-8">
          <Text
            as="h1"
            variant="display"
            tone="primary"
            className="text-balance text-[26px] font-medium leading-[1.24] tracking-[-0.035em] sm:text-[34px] md:text-[38px]"
          >
            <span className="block sm:inline">{copy.heroLineOne}</span>
            <br className="hidden sm:block" />
            <span className="inline">{copy.heroLineTwo}</span>{" "}
            <span className="inline">{copy.heroLineThree}</span>
          </Text>
          <Text
            as="p"
            variant="body"
            tone="muted"
            className="mt-4 max-w-[480px] text-sm font-normal leading-5 sm:text-base"
          >
            {heroDescriptionLines.map((line) => (
              <span key={line} className="block text-balance break-keep">
                {line}
              </span>
            ))}
          </Text>
          <div className="mt-7 w-full max-w-[420px] rounded-3xl border border-neutral-1000-a05 bg-bg-floating/90 p-4 shadow-(--shadow-lg) backdrop-blur-sm sm:p-6">
            {emailConfirmationSent ? (
              <div
                className="px-1 py-2 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-neutral-1000-a05 bg-bg-floating text-neutral-primary">
                  <MailCheck className="h-4 w-4" />
                </div>
                <Text
                  as="h2"
                  variant="head2"
                  tone="primary"
                  className="mt-4 text-[20px] font-medium tracking-[-0.04em]"
                >
                  {copy.confirmationTitle}
                </Text>
                <Text
                  as="p"
                  variant="caption"
                  tone="muted"
                  className="mx-auto mt-3 max-w-[320px] text-[12px] leading-5"
                >
                  {submittedEmail
                    ? copy.confirmationEmailPrefix(submittedEmail)
                    : ""}
                  {copy.confirmationDescription}
                </Text>
                <Text
                  as="p"
                  variant="caption"
                  tone="subtle"
                  className="mt-2 text-[11px] leading-5"
                >
                  {copy.confirmationHelp}
                </Text>
              </div>
            ) : (
              <>
                {showInAppBrowserNotice ? (
                  <div className="text-left" role="status" aria-live="polite">
                    <Text
                      as="h2"
                      variant="label"
                      tone="primary"
                      className="text-[15px] font-normal leading-5"
                    >
                      {copy.inAppBrowserTitle}
                    </Text>
                    <Text
                      as="p"
                      variant="caption"
                      tone="muted"
                      className="mt-1.5 text-[14px] leading-5 font-normal"
                    >
                      {copy.inAppBrowserDescription}
                    </Text>
                    <div className="mt-4 mb-2 grid gap-2 sm:grid-cols-2">
                      <BareButton
                        type="button"
                        onClick={() => void openBrowserLoginUrl()}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-surface-inverse px-3 text-[13px] font-normal text-neutral-00 outline-none transition hover:bg-neutral-primary focus-visible:ring-2 focus-visible:ring-neutral-800"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>{copy.openInBrowser}</span>
                      </BareButton>
                      <BareButton
                        type="button"
                        onClick={() => void handleCopyBrowserLink()}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-[13px] font-normal text-neutral-primary outline-none transition hover:border-neutral-400 hover:bg-bg-basement focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                      >
                        <Copy className="h-4 w-4" />
                        <span>{copy.copyBrowserLink}</span>
                      </BareButton>
                    </div>
                    {browserFallback ? (
                      <div className="mt-3 rounded-md border border-neutral-1000-a05 bg-bg-basement px-3 py-2.5">
                        <ol className="space-y-1 text-[13px] leading-5 text-neutral-primary">
                          <li className="flex flex-wrap items-center gap-x-1">
                            <span>1.</span>
                            <span>{copy.browserFallbackMenuBefore}</span>
                            {browserFallback.os === "android" ? (
                              <EllipsisVertical
                                className="h-4 w-4 text-neutral-primary"
                                aria-hidden="true"
                              />
                            ) : (
                              <MoreHorizontal
                                className="h-4 w-4 text-neutral-primary"
                                aria-hidden="true"
                              />
                            )}
                            <span className="sr-only">
                              {browserFallback.os === "android" ? "⋮" : "···"}
                            </span>
                            <span>{copy.browserFallbackMenuAfter}</span>
                          </li>
                          <li>2. {copy.browserFallbackOpen}</li>
                        </ol>
                        {browserFallback.copied ? (
                          <Text
                            as="p"
                            variant="caption"
                            tone="subtle"
                            className="mt-1.5 text-[11px] leading-5"
                          >
                            {copy.browserFallbackCopied}
                          </Text>
                        ) : null}
                      </div>
                    ) : null}
                    {browserLinkStatus ? (
                      <Text
                        as="p"
                        variant="caption"
                        tone="subtle"
                        className="mt-2 text-[11px] leading-5"
                      >
                        {browserLinkStatus}
                      </Text>
                    ) : null}
                  </div>
                ) : (
                  <BareButton
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={authActionPending}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-neutral-1000-a10 bg-bg-floating px-4 text-[14px] font-medium tracking-[-0.015em] text-neutral-primary outline-none transition hover:border-neutral-400 hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Image
                        src="/images/logos/google.png"
                        alt=""
                        width={16}
                        height={16}
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                    )}
                    <span>
                      {authPending ? copy.pending : copy.continueWithGoogle}
                    </span>
                  </BareButton>
                )}

                <div className="flex h-10 items-center justify-center text-[12px] font-medium text-neutral-soft">
                  {copy.divider}
                </div>

                <form
                  onSubmit={(event) => void handleSubmitEmailAuth(event)}
                  className="space-y-2.5 text-left"
                >
                  <UiInput
                    unstyled
                    type="email"
                    placeholder={copy.emailPlaceholder}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setFormError("");
                      setResetInfo("");
                    }}
                    autoComplete="email"
                    disabled={authActionPending}
                    className="h-11 w-full rounded-md border border-neutral-1000-a05 bg-bg-floating px-4 text-[13px] font-medium text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />

                  {showEmailForm ? (
                    <>
                      <UiInput
                        unstyled
                        type="password"
                        placeholder={copy.passwordPlaceholder}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setFormError("");
                        }}
                        autoComplete={
                          emailMode === "signin"
                            ? "current-password"
                            : "new-password"
                        }
                        disabled={authActionPending}
                        className="h-10 w-full rounded-md border border-neutral-1000-a05 bg-bg-floating px-4 text-[13px] font-medium text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:opacity-60"
                        required
                      />
                      {emailMode === "signup" ? (
                        <UiInput
                          unstyled
                          type="password"
                          placeholder={copy.passwordConfirmPlaceholder}
                          value={passwordConfirm}
                          onChange={(event) => {
                            setPasswordConfirm(event.target.value);
                            setFormError("");
                          }}
                          autoComplete="new-password"
                          disabled={authActionPending}
                          className="h-10 w-full rounded-md border border-neutral-1000-a05 bg-bg-floating px-4 text-[13px] font-medium text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:opacity-60"
                          required
                        />
                      ) : null}
                    </>
                  ) : null}

                  <BareButton
                    type="submit"
                    disabled={authActionPending}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-surface-inverse px-4 text-[14px] font-medium tracking-[-0.015em] text-neutral-00 outline-none transition hover:bg-neutral-primary focus-visible:ring-2 focus-visible:ring-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    <span>
                      {authPending
                        ? copy.pending
                        : !showEmailForm
                          ? copy.continueWithEmail
                          : emailMode === "signin"
                            ? copy.signIn
                            : copy.signUp}
                    </span>
                  </BareButton>

                  {showEmailForm && (
                    <div className="flex items-center justify-between gap-3 pt-0.5">
                      <BareButton
                        type="button"
                        onClick={() => {
                          setFormError("");
                          setResetInfo("");
                          setPasswordConfirm("");
                          setEmailMode((current) =>
                            current === "signin" ? "signup" : "signin"
                          );
                        }}
                        className="text-left text-[12px] font-medium text-neutral-muted underline underline-offset-4 transition hover:text-neutral-primary"
                      >
                        {emailMode === "signin"
                          ? copy.switchToSignUp
                          : copy.switchToSignIn}
                      </BareButton>
                      {emailMode === "signin" ? (
                        <BareButton
                          type="button"
                          onClick={() => void handleResetPassword()}
                          disabled={authActionPending}
                          className="shrink-0 text-right text-[12px] font-medium text-neutral-muted underline underline-offset-4 transition hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resetPending ? copy.pending : copy.resetPassword}
                        </BareButton>
                      ) : null}
                    </div>
                  )}
                </form>

                {formError || authError ? (
                  <Text
                    as="p"
                    variant="caption"
                    tone="primary"
                    className="mt-3 rounded-md border border-critical/30 bg-critical-faded px-3 py-2 text-left text-[12px] font-medium leading-5 text-critical"
                  >
                    {formError || authError}
                  </Text>
                ) : null}

                {resetInfo ? (
                  <Text
                    as="p"
                    variant="caption"
                    className="mt-3 rounded-md border border-positive/30 bg-positive-faded px-3 py-2 text-left text-[12px] font-medium leading-5 text-positive"
                    role="status"
                    aria-live="polite"
                  >
                    {resetInfo}
                  </Text>
                ) : null}
              </>
            )}
          </div>
          {!emailConfirmationSent ? (
            <Text
              as="p"
              variant="caption"
              tone="subtle"
              className="mt-4 max-w-[370px] break-keep text-center text-[12px] font-normal leading-5"
            >
              {copy.privacyNoticePrefix}
              <Link
                href={`/privacy?lang=${locale}`}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-primary underline underline-offset-2"
              >
                {copy.privacyPolicyLabel}
              </Link>
              {copy.privacyNoticeSuffix}
            </Text>
          ) : null}
        </section>

        {!emailConfirmationSent ? (
          <section className="relative z-10 mx-auto w-full max-w-[1280px] px-6 pb-7 pt-[20svh] text-center sm:pt-[12svh] md:pb-9">
            <Text
              as="h2"
              variant="label"
              tone="muted"
              className="font-sans text-[13px] font-medium tracking-[-0.02em] sm:text-[14px]"
            >
              {copy.trustedBy}
            </Text>
            <div className="mt-5 grid grid-cols-3 items-center justify-center gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-8">
              {trustedLogos.map((logo) => (
                <span
                  key={logo.name}
                  className="relative mx-auto block opacity-90 transition hover:opacity-100"
                  style={{ width: logo.width, height: logo.height ?? 28 }}
                >
                  <Image
                    src={logo.src}
                    alt={logo.name}
                    fill
                    sizes={`${logo.width}px`}
                    className="object-contain"
                  />
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
};

const CareerLogin = () => {
  return <CareerLoginContent />;
};

export default CareerLogin;

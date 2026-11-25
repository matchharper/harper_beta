import type { OfficialJobsLocale } from "@/lib/officialJobs/copy";

/**
 * Words on the job page's one screen. The in-app browser and privacy lines are
 * the login page's own (career_login CAREER_LOGIN_COPY), kept word for word.
 */
export type OneScreenCopy = {
  /** Box titles: the sign-up box is named like the posting's own button (Talk to Harper). */
  title: { role: string; bundle: string; closed: string };
  /** The line under the sign-up box's title: what it does. */
  sub: { role: string; bundle: string };
  backToPosting: string;
  progress: (done: number) => string;
  progressRows: readonly [string, string, string];
  /** The 추천받기 box's own "N개 중 M개": ① a well-formed email (no code), ② LinkedIn or a CV. */
  similarProgress: (done: number) => string;
  similarProgressRows: readonly [string, string];

  accountLabel: string;
  google: string;
  googlePending: string;
  googleInSafari: string;
  safariMissingHelp: string;
  copyLink: string;
  copyLinkDone: string;
  copyLinkFailed: string;
  googleInBrowserTitle: string;
  androidMenuStepBefore: string;
  androidMenuStepAfter: string;
  androidOpenInBrowserStep: string;
  androidContinueStep: string;
  androidFallbackBefore: string;
  androidFallbackAfter: string;
  openInBrowser: string;
  divider: string;
  emailLabel: string;
  emailPlaceholder: string;
  sendCode: string;
  sendingCode: string;
  codeSentTo: (email: string) => string;
  codeLabel: string;
  verify: string;
  verifying: string;
  resendIn: (seconds: number) => string;
  resend: string;
  otherEmail: string;
  emailInvalid: string;
  codeSendFailed: string;
  codeInvalid: string;
  accountRequired: string;
  codeRequired: string;
  signedInAs: string;
  privacyNoticePrefix: string;
  privacyPolicyLabel: string;
  privacyNoticeSuffix: string;

  nameLabel: string;
  nameFromGoogle: string;
  nameRequired: string;

  materialLabel: string;
  similarMaterialLabel: string;
  cvTile: string;
  linkedinTile: string;
  linkedinLabel: string;
  linkedinPlaceholder: string;
  linkedinInvalid: string;
  materialRequired: string;
  /**
   * A material could not be read; the advice depends on what was given. Reading the profile
   * failed with only a CV in it: that was the CV, so it reads as part "resume" (materialFailedPart).
   */
  materialFailed: (failed: {
    part: "resume" | "profile";
    linkedin: boolean;
    resume: boolean;
  }) => string;
  resumeAgain: string;
  removeFile: string;
  fileTooLarge: (limit: string) => string;
  fileType: string;

  noteLabel: string;
  notePlaceholder: string;
  /** Names the CV only when one is picked: without it only the profile goes (as the receipt and the company message). */
  consent: (company: string, hasResume: boolean) => string;
  consentRequired: string;

  submit: { role: string; bundle: string };
  stage: { account: string; materials: string; sending: string };
  bundleAskFirst: string;
  similarButton: string;
  member: string;
  unavailable: string;
  /** Under the member/unavailable title: nothing went to the company. */
  notSent: string;
  continueOnHarper: string;
  retry: string;
  otherJobs: string;

  similarSub: string;
  similarConsent: string;
  similarNote: string;
  similarSubmit: string;
  similarSending: string;
  similarDone: string;
  /** The done screen's line when the CV could not be read and the request went on with the LinkedIn only. */
  similarResumeIgnored: string;
  /** The done screen's line naming the address the mails go to. */
  similarSentTo: (email: string) => string;
  similarFailed: string;
  similarConsentRequired: string;
};

/**
 * Which part a failed material is about. Reading the profile failed with a CV
 * and no LinkedIn address: only the CV was there to read, so it is the CV.
 */
function materialFailedPart(failed: {
  part: "resume" | "profile";
  linkedin: boolean;
  resume: boolean;
}): "resume" | "profile" {
  return failed.part === "profile" && failed.resume && !failed.linkedin ? "resume" : failed.part;
}

const KO: OneScreenCopy = {
  title: {
    role: "Talk to Harper",
    bundle: "Talk to Harper",
    closed: "이 자리는 마감됐어요. 비슷한 공고를 보내드릴게요",
  },
  sub: {
    role: "Harper가 이 자리에 소개해 드려요.",
    bundle: "Harper가 맞는 회사에 소개해 드려요.",
  },
  backToPosting: "공고로 돌아가기",
  progress: (done) => `소개까지 3개 중 ${done}개 완료`,
  progressRows: ["계정 (이메일)", "이름", "이력서 또는 LinkedIn"],
  similarProgress: (done) => `추천까지 2개 중 ${done}개 완료`,
  similarProgressRows: ["이메일", "이력서 또는 LinkedIn"],

  accountLabel: "계정",
  google: "Google로 계속하기",
  googlePending: "처리 중...",
  googleInSafari: "Safari에서 Google로 계속하기",
  safariMissingHelp: "Safari가 안 열리면",
  copyLink: "링크 복사",
  copyLinkDone: "링크를 복사했습니다. Safari나 Chrome 주소창에 붙여넣어 주세요.",
  copyLinkFailed:
    "링크 복사에 실패했습니다. 주소창의 URL을 Safari나 Chrome에서 직접 열어 주세요.",
  googleInBrowserTitle: "Google 계정으로 계속하려면",
  androidMenuStepBefore: "LinkedIn 화면 오른쪽 위",
  androidMenuStepAfter: "누르기",
  androidOpenInBrowserStep: "메뉴에서 '브라우저에서 열기' 누르기",
  androidContinueStep: "열린 화면에서 Google로 계속하기 누르기",
  androidFallbackBefore: "위 방법이 안 되면",
  androidFallbackAfter: "후 Chrome에 붙여넣기",
  openInBrowser: "브라우저에서 열기",
  divider: "또는",
  emailLabel: "이메일",
  emailPlaceholder: "이메일 주소",
  sendCode: "코드 받기",
  sendingCode: "보내는 중",
  codeSentTo: (email) => `${email}로 코드를 보냈어요.`,
  codeLabel: "인증 코드",
  verify: "확인",
  verifying: "확인 중",
  resendIn: (seconds) => `${seconds}초 뒤 다시 받기`,
  resend: "코드 다시 받기",
  otherEmail: "다른 이메일로",
  emailInvalid: "이메일 주소를 확인해 주세요.",
  codeSendFailed: "코드를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  codeInvalid: "코드가 맞지 않아요. 메일의 코드를 다시 확인해 주세요.",
  accountRequired: "Google로 계속하거나 이메일로 코드를 받아 주세요.",
  codeRequired: "메일로 받은 코드를 넣어 주세요.",
  signedInAs: "로그인한 계정",
  privacyNoticePrefix: "계속 진행한다면 Harper의 ",
  privacyPolicyLabel: "개인정보 처리방침",
  privacyNoticeSuffix: "에 동의하게 됩니다.",

  nameLabel: "이름",
  nameFromGoogle: "이름 (Google에서 가져왔어요)",
  nameRequired: "이름을 적어 주세요.",

  materialLabel: "이력서 또는 LinkedIn (하나만 있어도 돼요)",
  similarMaterialLabel: "이력서 또는 LinkedIn (하나만 있어도 돼요)",
  cvTile: "이력서",
  linkedinTile: "LinkedIn",
  linkedinLabel: "LinkedIn",
  linkedinPlaceholder: "https://linkedin.com/in/...",
  linkedinInvalid: "linkedin.com/in/ 으로 시작하는 프로필 주소를 넣어 주세요.",
  materialRequired: "이력서나 LinkedIn 중 하나를 넣어 주세요.",
  materialFailed: (failed) =>
    materialFailedPart(failed) === "profile"
      ? failed.resume
        ? "자료를 읽지 못했어요. LinkedIn 주소를 확인하거나 다른 이력서 파일을 올려 주세요."
        : "LinkedIn 프로필을 읽지 못했어요. 주소를 확인하거나 이력서 파일을 올려 주세요."
      : failed.linkedin
        ? "이력서를 읽지 못했어요. 다른 이력서 파일을 올리거나, 이력서를 빼고 LinkedIn만 보내 주세요."
        : "이력서를 읽지 못했어요. 다른 이력서 파일을 올리거나 LinkedIn 주소를 넣어 주세요.",
  resumeAgain: "이력서를 다시 골라 주세요",
  removeFile: "빼기",
  fileTooLarge: (limit) => `이력서 파일은 ${limit}까지 올릴 수 있어요.`,
  fileType: "PDF, DOCX, TXT, MD 파일만 올릴 수 있어요.",

  noteLabel: "회사에 전할 한마디 (선택)",
  notePlaceholder: "예: 에이전트 제품을 고객사에 붙여 본 경험이 있어요",
  consent: (company, hasResume) =>
    `${company}에 내 ${hasResume ? "프로필과 이력서를" : "프로필을"} 보내는 데 동의해요`,
  consentRequired: "동의해야 소개를 보낼 수 있어요.",

  submit: {
    role: "가입하고 소개 보내기",
    bundle: "가입하고 맞는 회사 소개받기",
  },
  stage: {
    account: "계정 확인 중",
    materials: "자료 올리는 중",
    sending: "소개 보내는 중",
  },
  bundleAskFirst: "회사에 보내기 전에 꼭 물어봐요",
  similarButton: "비슷한 공고 추천받기",
  member: "이미 Harper 회원이에요",
  unavailable: "지금은 이 화면에서 소개를 받을 수 없어요",
  notSent: "소개는 보내지 않았어요.",
  continueOnHarper: "Harper에서 이어가기",
  retry: "보내지 못했어요. 잠시 뒤 다시 눌러 주세요.",
  otherJobs: "다른 공고 보기",

  similarSub: "맞는 공고를 골라 메일로 보내 드려요.",
  similarConsent:
    "[필수] 추천 메일을 위해 이메일, LinkedIn, 이력서 내용을 쓰는 데 동의해요",
  similarNote:
    "이력서 파일은 저장하지 않아요. 내용은 메일에서 수신 거부하면 지워요.",
  similarSubmit: "추천 받기",
  similarSending: "보내는 중",
  similarDone:
    "맞는 공고를 고르면 메일로 보내 드릴게요. 아직 없으면 새로 열릴 때 보내 드려요.",
  similarResumeIgnored: "이력서는 읽지 못해서 LinkedIn으로 추천해요.",
  similarSentTo: (email) => `받는 주소: ${email}`,
  similarFailed: "보내지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  similarConsentRequired: "동의해야 추천 메일을 보낼 수 있어요.",
};

const EN: OneScreenCopy = {
  title: {
    role: "Talk to Harper",
    bundle: "Talk to Harper",
    closed: "This role has closed. We'll send you similar ones",
  },
  sub: {
    role: "Harper introduces you for this role.",
    bundle: "Harper introduces you to companies that fit.",
  },
  backToPosting: "Back to the posting",
  progress: (done) => `${done} of 3 steps done`,
  progressRows: ["Account (email)", "Name", "CV or LinkedIn"],
  similarProgress: (done) => `${done} of 2 steps done`,
  similarProgressRows: ["Email", "CV or LinkedIn"],

  accountLabel: "Account",
  google: "Continue with Google",
  googlePending: "Processing...",
  googleInSafari: "Continue with Google in Safari",
  safariMissingHelp: "Safari didn't open?",
  copyLink: "Copy link",
  copyLinkDone: "Link copied. Paste it into Safari or Chrome to continue.",
  copyLinkFailed:
    "We couldn't copy the link. Open the current URL directly in Safari or Chrome.",
  googleInBrowserTitle: "To continue with Google",
  androidMenuStepBefore: "Tap",
  androidMenuStepAfter: "at the top right of LinkedIn",
  androidOpenInBrowserStep: 'Choose "Open in browser" in the menu',
  androidContinueStep: "On the page that opens, tap Continue with Google",
  androidFallbackBefore: "Didn't work?",
  androidFallbackAfter: "and paste it into Chrome",
  openInBrowser: "Open in browser",
  divider: "or",
  emailLabel: "Email",
  emailPlaceholder: "Email address",
  sendCode: "Get code",
  sendingCode: "Sending",
  codeSentTo: (email) => `We sent a code to ${email}.`,
  codeLabel: "Verification code",
  verify: "Confirm",
  verifying: "Checking",
  resendIn: (seconds) => `Resend in ${seconds}s`,
  resend: "Resend code",
  otherEmail: "Use another email",
  emailInvalid: "Check the email address.",
  codeSendFailed: "Couldn't send the code. Please try again shortly.",
  codeInvalid: "That code didn't match. Check the code in the email.",
  accountRequired: "Continue with Google, or get a code by email.",
  codeRequired: "Enter the code from the email.",
  signedInAs: "Signed in as",
  privacyNoticePrefix: "By continuing, you agree to Harper's ",
  privacyPolicyLabel: "Privacy Policy",
  privacyNoticeSuffix: ".",

  nameLabel: "Name",
  nameFromGoogle: "Name (from Google)",
  nameRequired: "Enter your name.",

  materialLabel: "CV or LinkedIn (one is enough)",
  similarMaterialLabel: "CV or LinkedIn (one is enough)",
  cvTile: "CV",
  linkedinTile: "LinkedIn",
  linkedinLabel: "LinkedIn",
  linkedinPlaceholder: "https://linkedin.com/in/...",
  linkedinInvalid: "Enter a profile URL that starts with linkedin.com/in/.",
  materialRequired: "Add your CV or your LinkedIn.",
  materialFailed: (failed) =>
    materialFailedPart(failed) === "profile"
      ? failed.resume
        ? "We couldn't read that. Check your LinkedIn URL or upload another CV file."
        : "We couldn't read your LinkedIn profile. Check the URL or upload a CV file."
      : failed.linkedin
        ? "We couldn't read your CV. Upload another CV file, or remove it and send your LinkedIn only."
        : "We couldn't read your CV. Upload another CV file or add your LinkedIn URL.",
  resumeAgain: "Please pick your CV again",
  removeFile: "Remove",
  fileTooLarge: (limit) => `The CV file can be up to ${limit}.`,
  fileType: "Only PDF, DOCX, TXT or MD files.",

  noteLabel: "A note for the company (optional)",
  notePlaceholder: "e.g. I've shipped agent products to customers",
  consent: (company, hasResume) =>
    `I agree to send ${hasResume ? "my profile and CV" : "my profile"} to ${company}`,
  consentRequired: "Check this to send the introduction.",

  submit: {
    role: "Sign up and send introduction",
    bundle: "Sign up and get introduced",
  },
  stage: {
    account: "Checking your account",
    materials: "Uploading",
    sending: "Sending introduction",
  },
  bundleAskFirst: "We always ask before sending you to a company",
  similarButton: "Get similar roles",
  member: "You're already on Harper",
  unavailable: "Introductions aren't available from this screen right now",
  notSent: "No introduction was sent.",
  continueOnHarper: "Continue on Harper",
  retry: "Couldn't send it. Please try again shortly.",
  otherJobs: "See other roles",

  similarSub: "We'll pick roles that fit and email them to you.",
  similarConsent:
    "[Required] I agree to Harper using my email, LinkedIn and CV text to send me recommendations",
  similarNote:
    "We don't keep the CV file. Its text is deleted when you unsubscribe from the emails.",
  similarSubmit: "Get recommendations",
  similarSending: "Sending",
  similarDone:
    "We'll email you once we've picked roles that fit. If none fit yet, we'll send them when they open.",
  similarResumeIgnored: "We couldn't read your CV, so we'll use your LinkedIn.",
  similarSentTo: (email) => `Sending to ${email}`,
  similarFailed: "Couldn't send it. Please try again shortly.",
  similarConsentRequired: "Check this to get the emails.",
};

export const ONE_SCREEN_COPY: Record<OfficialJobsLocale, OneScreenCopy> = {
  ko: KO,
  en: EN,
};

export function getOneScreenCopy(locale: OfficialJobsLocale) {
  return ONE_SCREEN_COPY[locale] ?? KO;
}

/** "4MB" for a byte count (whole megabytes). */
export function formatOneScreenMegabytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

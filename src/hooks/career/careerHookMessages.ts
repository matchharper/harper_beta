export type CareerHookMessage = {
  key: string;
  ko: string;
};

const t = (key: string, ko: string): CareerHookMessage => ({ key, ko });

export const CAREER_HOOK_MESSAGES = {
  authEmailAlreadyRegistered: t(
    "career.common.career_hook_messages.1qsjb9o",
    "이미 가입된 이메일입니다. 로그인으로 계속해 주세요."
  ),
  authEmailConfirmationSent: t(
    "career.common.career_hook_messages.1b9i4mv",
    "인증 메일을 보냈습니다. 메일의 링크를 열어 회원가입을 완료한 뒤 다시 로그인해 주세요."
  ),
  authEmailNotConfirmed: t(
    "career.common.career_hook_messages.1ojtglo",
    "아직 이메일 인증이 완료되지 않았습니다. 받은 메일의 인증 링크를 먼저 확인해 주세요."
  ),
  authEmailPasswordRequired: t(
    "career.common.career_hook_messages.1eco5r7",
    "이메일과 비밀번호를 입력해 주세요."
  ),
  authEmailSigninFailed: t(
    "career.common.career_hook_messages.1rktk41",
    "이메일 혹은 비밀번호가 올바르지 않습니다."
  ),
  authGenericFailed: t(
    "career.common.career_hook_messages.11ltltf",
    "인증 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
  ),
  authGoogleLoginFailed: t(
    "career.common.career_hook_messages.0wokf45",
    "Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."
  ),
  authPasswordMinLength: t(
    "career.common.career_hook_messages.0zitxiy",
    "비밀번호는 6자 이상 입력해 주세요."
  ),
  authRateLimited: t(
    "career.common.career_hook_messages.1u6tsv3",
    "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
  ),
  basicProfileSubmitFailed: t(
    "career.common.career_hook_messages.0mp3zyf",
    "기본 정보 제출 중 오류가 발생했습니다."
  ),
  callCompleted: t(
    "career.common.career_hook_messages.0gmwfn1",
    "이미 종료된 call입니다."
  ),
  callCompletionSpeech: t(
    "career.common.career_hook_messages.0jhqb6p",
    "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 잘 맞는 기회를 찾아볼게요. 오늘 대화는 여기까지 할게요."
  ),
  callGreeting: t(
    "career.common.career_hook_messages.0c68jwx",
    "안녕하세요, 직접 통화로 이야기하게 되어 좋네요. 제가 먼저 하나씩 여쭤볼게요. 편하게 답해주시면 더 잘 맞는 기회를 찾는 데 도움이 됩니다."
  ),
  callWrapupEmpty: t(
    "career.common.career_hook_messages.0kbrk6c",
    "Call Wrap-up 응답이 비어 있습니다."
  ),
  callWrapupMessageFailed: t(
    "career.common.career_hook_messages.0ljgbz5",
    "종료 메시지 생성에 실패했습니다."
  ),
  callWrapupRegenerateFailed: t(
    "career.common.career_hook_messages.1j9l810",
    "Call Wrap-up 재생성에 실패했습니다."
  ),
  callWrapupRegenerateUnexpected: t(
    "career.common.career_hook_messages.1sh0keg",
    "Call Wrap-up 재생성 중 오류가 발생했습니다."
  ),
  conversationMessagesLoadFailed: t(
    "career.common.career_hook_messages.0la0cjn",
    "대화 메시지를 불러오지 못했습니다."
  ),
  conversationStartPrepareFailed: t(
    "career.common.career_hook_messages.1ja09cr",
    "대화 시작 준비에 실패했습니다."
  ),
  conversationStartPrepareUnexpected: t(
    "career.common.career_hook_messages.0ptxnu1",
    "대화 시작 준비 중 오류가 발생했습니다."
  ),
  feedbackFollowUpCreateFailed: t(
    "career.common.career_hook_messages.1kdy4hj",
    "피드백 후속 메시지를 만들지 못했습니다."
  ),
  harperInsightSaved: t(
    "career.preview.career_workspace_preview.1ashy8n",
    "Harper insight를 저장했습니다."
  ),
  harperInsightSaveFailed: t(
    "career.common.career_hook_messages.0aw1w91",
    "Harper insight 저장에 실패했습니다."
  ),
  loginSessionMissing: t(
    "career.common.career_hook_messages.101suqx",
    "로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요."
  ),
  invalidLinkedinProfileUrl: t(
    "career.common.career_hook_messages.invalid_linkedin_profile_url",
    "올바른 URL이 아닙니다."
  ),
  memoSaveFailed: t(
    "career.common.career_hook_messages.1it3b7e",
    "메모를 저장하지 못했습니다."
  ),
  messageSendFailed: t(
    "career.common.career_hook_messages.1gxr7hd",
    "메시지 전송에 실패했습니다."
  ),
  messageSendUnexpected: t(
    "career.common.career_hook_messages.0tuztsz",
    "메시지 전송 중 오류가 발생했습니다."
  ),
  messageStreamEndedEarly: t(
    "career.common.career_hook_messages.1mnjdmp",
    "메시지 스트림이 완료되기 전에 종료되었습니다."
  ),
  onboardingDeferPrepareFailed: t(
    "career.common.career_hook_messages.1a26ni5",
    "나중에 이어하기 준비에 실패했습니다."
  ),
  onboardingDeferPrepareUnexpected: t(
    "career.common.career_hook_messages.1g1lzhz",
    "나중에 이어하기 준비 중 오류가 발생했습니다."
  ),
  onboardingInterestSaveFailed: t(
    "career.common.career_hook_messages.0ikqe9o",
    "선택 저장에 실패했습니다."
  ),
  onboardingInterestSaveUnexpected: t(
    "career.common.career_hook_messages.0gcst4g",
    "선택 저장 중 오류가 발생했습니다."
  ),
  onboardingStartFailed: t(
    "career.common.career_hook_messages.0q7hdea",
    "온보딩 시작에 실패했습니다."
  ),
  opportunityDiscoveryStarted: t(
    "career.onboarding.onboarding.0hobsv6",
    "기회 검색을 시작했습니다."
  ),
  opportunityListLoadFailed: t(
    "career.common.career_hook_messages.0r1cfx7",
    "기회 목록을 불러오지 못했습니다."
  ),
  opportunityListLoadMoreFailed: t(
    "career.common.career_hook_messages.1ntx9r3",
    "기회 목록을 더 불러오지 못했습니다."
  ),
  opportunityListRefreshFailed: t(
    "career.common.career_hook_messages.02tdf5b",
    "기회 목록을 새로고침하지 못했습니다."
  ),
  opportunityLoadFailed: t(
    "career.common.career_hook_messages.1uqz7wr",
    "기회를 불러오지 못했습니다."
  ),
  opportunityStatusUpdateFailed: t(
    "career.common.career_hook_messages.11yir7x",
    "기회 상태를 업데이트하지 못했습니다."
  ),
  partialProfileUpdate: t(
    "career.common.career_hook_messages.0srl5yk",
    "일부 정보를 가져오지 못했지만 가능한 범위에서 프로필을 업데이트했습니다."
  ),
  pdfTextReadFailed: t(
    "career.common.career_hook_messages.1bxad2p",
    "PDF에서 텍스트를 읽지 못했습니다."
  ),
  profileAndResumeLinksSaved: t(
    "career.common.career_hook_messages.06v3zcd",
    "프로필과 이력서/링크 정보를 저장했습니다."
  ),
  profileAutoIngestionFailed: t(
    "career.common.career_hook_messages.043pjii",
    "LinkedIn 또는 이력서 정보를 자동으로 가져오지 못했습니다."
  ),
  profileRefreshFailed: t(
    "career.common.career_hook_messages.082utew",
    "프로필 정보를 다시 가져오지 못했습니다."
  ),
  profileRefreshFailedWithReason: t(
    "career.common.career_hook_messages.0em3sq3",
    "프로필 정보를 다시 가져오지 못했습니다. ({reason})"
  ),
  profileSaved: t(
    "career.preview.career_workspace_preview.1truxm7",
    "프로필을 저장했습니다."
  ),
  profileSaveFailed: t(
    "career.common.career_hook_messages.12bbx7p",
    "프로필 저장에 실패했습니다."
  ),
  profileSourcesMissing: t(
    "career.common.career_hook_messages.1gaikb4",
    "다시 가져올 이력서나 LinkedIn 링크가 없습니다."
  ),
  profileSourcesRefreshed: t(
    "career.preview.career_workspace_preview.1bdgvh5",
    "저장된 이력서/링크에서 정보를 다시 가져왔습니다."
  ),
  profileUploadRequired: t(
    "career.common.career_hook_messages.1ady7dv",
    "이력서 혹은 주요 링크를 업로드해 주세요."
  ),
  referenceLink: t(
    "career.common.career_hook_messages.09wz9hs",
    "Reference link: {link}"
  ),
  resumeLinksIngestionCreateFailed: t(
    "career.common.career_hook_messages.09pr3ij",
    "이력서/링크는 저장했지만 자동 프로필 구성은 실패했습니다. ({reason})"
  ),
  resumeLinksIngestionUpdateFailed: t(
    "career.common.career_hook_messages.0nb9l75",
    "이력서/링크는 저장했지만 자동 프로필 업데이트는 실패했습니다. ({reason})"
  ),
  resumeLinksProfileUpdated: t(
    "career.common.career_hook_messages.0u89sn8",
    "이력서/링크를 저장하고 새 정보를 프로필에 반영했습니다."
  ),
  resumeLinksSaved: t(
    "career.common.career_hook_messages.0848zqr",
    "이력서/링크 정보를 저장했습니다."
  ),
  resumeTextReadFailed: t(
    "career.common.career_hook_messages.0em2gjm",
    "이력서 텍스트를 읽지 못했습니다. 다른 파일로 시도해 주세요."
  ),
  resumeUploadFailed: t(
    "career.common.career_hook_messages.0vgs7ig",
    "이력서 파일 업로드에 실패했습니다."
  ),
  settingsLoadFailed: t(
    "career.common.career_hook_messages.051j8yt",
    "설정 정보를 불러오지 못했습니다."
  ),
  settingsSaveFailed: t(
    "career.common.career_hook_messages.19kzumo",
    "설정 저장에 실패했습니다."
  ),
  sessionBootstrapFailed: t(
    "career.common.career_hook_messages.0598bor",
    "talent_users 초기화에 실패했습니다."
  ),
  sessionLoadFailed: t(
    "career.common.career_hook_messages.0gv3kjj",
    "세션을 불러오지 못했습니다."
  ),
  talentPreferencesSaved: t(
    "career.preview.career_workspace_preview.0o0xl6w",
    "프로필 설정을 저장했습니다."
  ),
  talentPreferencesSaveFailed: t(
    "career.common.career_hook_messages.0dp8x5s",
    "프로필 선호 정보 저장에 실패했습니다."
  ),
} as const;

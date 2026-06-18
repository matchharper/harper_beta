import {
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquareText,
  Phone,
} from "lucide-react";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCareerT } from "@/i18n/useCareerT";

const normalizeDisplayName = (
  value: string | null | undefined,
  fallback: string
) => {
  const trimmed = String(value ?? "")
    .trim()
    .replace(/\s*님$/, "");
  return trimmed || fallback;
};

const CareerWelcomeScreen = () => {
  const t = useCareerT();

  const {
    user,
    onboardingBeginPending,
    callStartPending = false,
    onUseChatOnly,
    onStartCallMode,
  } = useCareerChatPanelContext();
  const isStartingCall = onboardingBeginPending || callStartPending;

  const displayName = normalizeDisplayName(
    user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      (typeof user?.email === "string" ? user.email.split("@")[0] : null),
    t("career.chat.career_welcome_screen.0ce6b4x", "회원")
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-full flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col justify-between">
          <div className="max-w-[820px] mt-8 space-y-10 px-12">
            <div className="max-w-[560px] rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-neutral-muted">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-default px-2.5 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  {t(
                    "career.chat.career_welcome_screen.023rop8",
                    "프로필 확인됨"
                  )}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-default px-2.5 py-1">
                  <Clock3 className="h-3.5 w-3.5 text-neutral-muted" />
                  {t("career.chat.career_composer_section.02tj0kp", "약 5분")}
                </span>
              </div>
              <div className="mt-3 text-[15px] font-medium leading-6 text-neutral-primary">
                {t(
                  "career.chat.career_welcome_screen.1gexpus",
                  "첫 추천 기준을 짧게 정리할게요."
                )}
              </div>
              <p className="mt-2 text-[13px] leading-6 text-neutral-muted">
                {t(
                  "career.chat.career_welcome_screen.169zgsw",
                  "희망 역할, 근무 방식, 제외할 조건만 확인하면 실제 포지션 탐색으로 넘어갑니다."
                )}
              </p>
            </div>
            <div className="max-w-[560px] space-y-3 text-[13px] leading-8 text-neutral-muted sm:text-[15px]">
              <StaggerText
                text={t(
                  "career.chat.career_welcome_screen.greeting_with_name",
                  "안녕하세요 {displayName}님, 만나서 반갑습니다. 저는 하퍼입니다.",
                  { values: { displayName } }
                )}
                by="word"
                delay={0.04}
                stagger={0.08}
                blur={8}
              />

              <p>
                <StaggerText
                  text={t(
                    "career.common.career.051p9x0",
                    "하퍼는 숨겨진 스타트업 기회를 먼저 찾아 추천하고,"
                  )}
                  by="word"
                  delay={0.34}
                  stagger={0.06}
                  blur={8}
                />
              </p>
              <p>
                <StaggerText
                  text={t(
                    "career.common.career.1ceyibb",
                    "후보자 관점에서 커리어 기회와 조건 협상까지 함께 돕는 Career 매니저입니다."
                  )}
                  by="word"
                  delay={0.58}
                  stagger={0.055}
                  blur={8}
                />
              </p>
              <p className="pt-2 text-neutral-muted">
                <StaggerText
                  text={t(
                    "career.chat.career_welcome_screen.criteria_with_name",
                    "{displayName}님에게 맞는 기회 기준을 5분 정도만 맞춰볼게요.",
                    { values: { displayName } }
                  )}
                  by="word"
                  delay={0.82}
                  stagger={0.05}
                  blur={8}
                />
              </p>
            </div>
            <div className="grid max-w-[520px] gap-3 md:grid-cols-2">
              <PrimaryButton
                onClick={() => void onStartCallMode?.()}
                disabled={isStartingCall || !onStartCallMode}
                className={cn(
                  "h-12 justify-between rounded-[12px] px-4 text-[16px] font-medium sm:h-16 sm:px-6 sm:text-[17px]"
                )}
              >
                {isStartingCall ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t(
                      "career.common.career_chat_panel.1q1egw3",
                      "통화 연결 중..."
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-3">
                    <Phone className="h-4 w-4" />
                    {t("career.chat.career_message_bubble.0whsa78", "통화하기")}
                  </span>
                )}
              </PrimaryButton>

              <SecondaryButton
                onClick={() => void onUseChatOnly()}
                disabled={isStartingCall}
                className={cn(
                  "h-12 justify-between rounded-[12px] border-neutral-1000-a10 bg-bg-floating px-4 text-[16px] font-medium text-neutral-primary sm:h-16 sm:px-6 sm:text-[17px]"
                )}
              >
                {isStartingCall ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t(
                      "career.chat.career_welcome_screen.0g4sq42",
                      "대화 준비 중..."
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-3">
                    <MessageSquareText className="h-4 w-4" />
                    {t(
                      "career.common.internal_connection_onboarding_modal.1sbmfzi",
                      "채팅으로 하기"
                    )}
                  </span>
                )}
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CareerWelcomeScreen;

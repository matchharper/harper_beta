import { Loader2, MessageSquareText, Phone } from "lucide-react";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
  careerCx,
} from "../ui/CareerPrimitives";

const normalizeDisplayName = (value: string | null | undefined) => {
  const trimmed = String(value ?? "")
    .trim()
    .replace(/\s*님$/, "");
  return trimmed || "회원";
};

const CareerWelcomeScreen = () => {
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
      (typeof user?.email === "string" ? user.email.split("@")[0] : null)
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-full flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col justify-between">
          <div className="max-w-[820px] mt-8 space-y-12 px-12">
            <div className="max-w-[560px] space-y-3 text-[16px] leading-8 text-beige900/65 sm:text-[17px]">
              <StaggerText
                text={`안녕하세요 ${displayName}님, 만나서 반갑습니다. 저는 하퍼입니다.`}
                by="word"
                delay={0.04}
                stagger={0.08}
                blur={8}
              />

              <p>
                <StaggerText
                  text="하퍼는 숨겨진 스타트업 기회를 먼저 찾아 추천하고,"
                  by="word"
                  delay={0.34}
                  stagger={0.06}
                  blur={8}
                />
              </p>
              <p>
                <StaggerText
                  text="후보자 관점에서 커리어 기회와 조건 협상까지 함께 돕는 Career 매니저입니다."
                  by="word"
                  delay={0.58}
                  stagger={0.055}
                  blur={8}
                />
              </p>
              <p className="pt-2 text-beige900/75">
                <StaggerText
                  text={`${displayName}님에 대해서 더 자세히 알고, 어떤 기회를 찾고계신지 듣고싶어요.`}
                  by="word"
                  delay={0.82}
                  stagger={0.05}
                  blur={8}
                />
              </p>
            </div>
            <div className="grid max-w-[520px] gap-3 md:grid-cols-2">
              <CareerPrimaryButton
                onClick={() => void onStartCallMode?.()}
                disabled={isStartingCall || !onStartCallMode}
                className={careerCx(
                  "h-12 justify-between rounded-[12px] px-4 text-[16px] font-medium sm:h-16 sm:px-6 sm:text-[17px]"
                )}
              >
                {isStartingCall ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    통화 연결 중...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-3">
                    <Phone className="h-4 w-4" />
                    통화하기
                  </span>
                )}
              </CareerPrimaryButton>

              <CareerSecondaryButton
                onClick={() => void onUseChatOnly()}
                disabled={isStartingCall}
                className={careerCx(
                  "h-12 justify-between rounded-[12px] border-beige900/15 bg-white/70 px-4 text-[16px] font-medium text-beige900 sm:h-16 sm:px-6 sm:text-[17px]"
                )}
              >
                {isStartingCall ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    대화 준비 중...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-3">
                    <MessageSquareText className="h-4 w-4" />
                    채팅으로 하기
                  </span>
                )}
              </CareerSecondaryButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CareerWelcomeScreen;

import { Check, Minus, X } from "lucide-react";
import { useMemo } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  TALENT_INTERVIEW_FINAL_STEP,
  TALENT_ONBOARDING_QUESTION_MILESTONE,
} from "@/lib/talentOnboarding/progress";

const isLinkedinUrl = (value: string) =>
  value.trim().toLowerCase().includes("linkedin.com");

const checkboxClasses =
  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors";

const CareerOnboardingChecklist = () => {
  const {
    user,
    stage,
    userChatCount,
    resumeFile,
    savedResumeFileName,
    savedResumeStoragePath,
    profileLinks,
    savedProfileLinks,
  } = useCareerSidebarContext();

  const checklistState = useMemo(() => {
    const hasResume = Boolean(
      resumeFile || savedResumeFileName || savedResumeStoragePath
    );
    const hasLinkedin = [...profileLinks, ...savedProfileLinks].some((link) =>
      isLinkedinUrl(link)
    );
    const hasUploadedProfile = stage !== "profile" || hasResume || hasLinkedin;
    const normalizedConversationCount = Math.min(
      userChatCount,
      TALENT_INTERVIEW_FINAL_STEP
    );
    const isCompleted =
      stage === "completed" ||
      normalizedConversationCount >= TALENT_INTERVIEW_FINAL_STEP;

    return {
      hasUploadedProfile,
      questionStepCompleted:
        stage === "completed" ||
        userChatCount >= TALENT_ONBOARDING_QUESTION_MILESTONE,
      normalizedConversationCount,
      conversationCompleted: isCompleted,
      isCompleted,
    };
  }, [
    profileLinks,
    resumeFile,
    savedProfileLinks,
    savedResumeFileName,
    savedResumeStoragePath,
    stage,
    userChatCount,
  ]);

  if (!user) {
    return null;
  }

  if (checklistState.isCompleted) {
    return (
      <div className="pointer-events-none fixed bottom-24 right-4 z-50 w-[min(320px,calc(100vw-2rem))] lg:bottom-6">
        <section className="pointer-events-auto rounded-2xl border border-hblack200 bg-hblack000/95 px-5 py-4 shadow-[0_16px_40px_rgba(17,24,39,0.15)] backdrop-blur">
          <p className="text-sm font-medium text-hblack1000">완료!</p>
        </section>
      </div>
    );
  }

  const items = [
    {
      id: "login",
      label: "로그인",
      completed: true,
    },
    {
      id: "profile",
      label: "이력서/링크드인 중 하나 업로드",
      completed: checklistState.hasUploadedProfile,
    },
    {
      id: "questions",
      label: "질문 2개에 답변",
      completed: checklistState.questionStepCompleted,
    },
    {
      id: "conversation",
      label: "대화 진행",
      completed: checklistState.conversationCompleted,
    },
  ] as const;

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 w-[min(320px,calc(100vw-2rem))] lg:bottom-6">
      <section className="relative pointer-events-auto rounded-2xl border border-hblack200 bg-hblack000/95 px-4 py-4">
        <div className="absolute right-1 top-[-6px] p-2 rounded-md bg-hblack50 hover:bg-hblack100 cursor-pointer transition-colors">
          <Minus className="h-4 w-4" />
        </div>
        <div className="space-y-3.5">
          {items.map((item) => {
            const textClasses = item.completed
              ? "text-hblack400 line-through decoration-hblack300"
              : "text-hblack900";

            return (
              <div key={item.id} className="flex items-start gap-3">
                <span
                  className={[
                    checkboxClasses,
                    item.completed
                      ? "border-beige900 bg-beige900 text-hblack000"
                      : "border-hblack300 bg-hblack000 text-transparent",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <Check className="h-3.5 w-3.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={["text-sm transition-colors", textClasses].join(
                      " "
                    )}
                  >
                    {item.label}
                  </p>

                  {item.id === "conversation" ? (
                    <div className="mt-2.5">
                      <div className="h-2 overflow-hidden rounded-full bg-hblack100">
                        <div
                          className="h-full rounded-full bg-beige900 transition-[width] duration-300"
                          style={{
                            width: `${(checklistState.normalizedConversationCount / TALENT_INTERVIEW_FINAL_STEP) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-hblack500">
                        {checklistState.normalizedConversationCount}/
                        {TALENT_INTERVIEW_FINAL_STEP}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default CareerOnboardingChecklist;

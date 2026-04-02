import React, { useEffect } from "react";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useRouter } from "next/router";

const CareerLoginTopBar = () => (
  <div className="fixed z-40 flex h-12 w-full items-center justify-between border-b border-hblack100 bg-hblack000">
    <div className="w-1/3" />
    <div className="font-hedvig text-hblack700">Harper</div>
    <div className="w-1/3" />
  </div>
);

const CareerLoginLoadingState = () => (
  <main className="relative flex min-h-screen w-full items-center justify-center bg-hblack000 font-inter text-hblack900">
    <Loader2 className="h-5 w-5 animate-spin text-hblack400" />
    <span className="sr-only">커리어 로그인 페이지 로딩 중</span>
  </main>
);

const CareerLogin = () => {
  const router = useRouter();
  const {
    user,
    authLoading,
    authPending,
    authError,
    authInfo,
    handleGoogleLogin,
  } = useCareerAuth();

  useEffect(() => {
    if (authLoading || !user) return;
    const inviteToken =
      typeof router.query.invite === "string" ? router.query.invite : "";
    const nextUrl = inviteToken
      ? `/career?invite=${encodeURIComponent(inviteToken)}`
      : "/career";
    void router.replace(nextUrl);
  }, [authLoading, router, router.query.invite, user]);

  if (authLoading || user) {
    return <CareerLoginLoadingState />;
  }

  return (
    <main className="relative min-h-screen w-full bg-hblack000 font-inter text-hblack900">
      <CareerLoginTopBar />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-8 pt-20">
        <section className="w-full max-w-[560px] rounded-[24px] border border-hblack200 bg-hblack000 px-8 py-6">
          <header className="text-center">
            <h1 className="text-lg font-semibold">하퍼에서 기회를 발견하세요.</h1>
            <p className="mt-2 text-base">
              하퍼는 AI/ML/Engineering 인재를 위한 AI Recruiter입니다.
            </p>
          </header>

          <div className="mt-7 space-y-3">
            <article className="rounded-2xl bg-hblack50 px-4 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                  <MessageCircle className="h-5 w-5 text-xprimary" />
                </div>
                <div>
                  <p className="text-base font-semibold text-hblack1000">
                    대화를 통해 더 나은 매칭
                  </p>
                  <p className="mt-1 text-sm text-hblack600">
                    하퍼와 대화하세요. 더 많은 정보를 알려줄수록, 더 좋은 기회을
                    얻을 수 있습니다.
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl bg-hblack50 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                  <Send className="h-5 w-5 text-xprimary" />
                </div>
                <div>
                  <p className="text-base font-semibold text-hblack1000">
                    바로 채용 담당자에게 추천
                  </p>
                  <p className="mt-1 text-sm text-hblack600">
                    마음에 드는 회사라면, 하퍼가 바로 회사와 연결합니다.
                    <br />
                    자기소개서는 필요 없습니다.
                  </p>
                </div>
              </div>
            </article>
          </div>

          <div className="mt-10 flex flex-col items-center">
            <button
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={authLoading || authPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-xprimary bg-xprimary px-5 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authLoading || authPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {authLoading ? "로그인 확인 중..." : "처리 중..."}
                </>
              ) : (
                "Google 로그인"
              )}
            </button>
            <p className="mb-1 mt-3 text-sm text-hblack600">
              첫 가입시, 전체 과정은 5분도 걸리지 않습니다.
            </p>
          </div>

          {authError ? (
            <p className="mt-4 rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
              {authError}
            </p>
          ) : null}
          {authInfo ? (
            <p className="mt-3 rounded-lg border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
              {authInfo}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
};

export default CareerLogin;

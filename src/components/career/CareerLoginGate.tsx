import { Bell, Loader2, Settings2, UserRoundCog } from "lucide-react";
import type { CareerWorkspaceTab } from "./CareerWorkspaceNav";
import { careerCx } from "./ui/CareerPrimitives";
import Image from "next/image";

const GUEST_NAV_ITEMS: Array<{
  id: CareerWorkspaceTab;
  label: string;
}> = [
  { id: "home", label: "홈" },
  { id: "profile", label: "프로필" },
  { id: "history", label: "발견한 기회" },
];

const ContentSkeleton = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => (
  <div
    className={careerCx(
      "rounded-[22px] border border-beige900/10 bg-white/55",
      className
    )}
  >
    {children}
  </div>
);

const CareerLoginGate = ({
  activeTab,
  authPending,
  authError,
  onGoogleLogin,
}: {
  activeTab: CareerWorkspaceTab;
  authPending: boolean;
  authError: string;
  onGoogleLogin: () => void | Promise<void>;
}) => {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-beige50 lg:flex-row">
      <section className="flex min-h-[52vh] min-w-0 flex-col border-b border-beige900/10 bg-[#f4eadb] lg:min-h-screen lg:w-1/2 lg:flex-none lg:border-b-0 lg:border-r">
        <div className="border-b border-beige900/10 px-5 py-5 sm:px-6 lg:px-7">
          <div className="text-[11px] uppercase tracking-[0.24em] text-beige900/35">
            Always-On Chat
          </div>
          <div className="mt-3 font-hedvig text-[2.2rem] leading-none text-beige900">
            Harper
          </div>
        </div>
        <div className="min-h-0 flex-1 px-3 pb-3 pt-3 sm:px-4 lg:px-5 lg:pb-5">
          <ContentSkeleton className="h-full min-h-[320px] rounded-[30px]" />
        </div>
      </section>

      <section className="min-w-0 flex-1 bg-beige50/75">
        <div className="flex h-full min-h-[45vh] flex-col lg:h-screen">
          <header className="border-b border-beige900/10 bg-[rgba(250,243,231,0.9)] px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-hedvig text-[2rem] leading-none text-beige900">
                  Harper
                </div>
                <div className="mt-2 text-[12px] leading-5 text-beige900/50">
                  오른쪽에서 워크스페이스를 탐색하고 왼쪽 채팅을 이어갈 수
                  있습니다.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ContentSkeleton className="flex h-10 w-10 items-center justify-center rounded-full">
                  <Bell className="h-4 w-4 text-beige900/25" />
                </ContentSkeleton>
                <ContentSkeleton className="flex h-10 w-10 items-center justify-center rounded-full">
                  <Settings2 className="h-4 w-4 text-beige900/25" />
                </ContentSkeleton>
                <ContentSkeleton className="flex h-10 w-10 items-center justify-center rounded-full">
                  <UserRoundCog className="h-4 w-4 text-beige900/25" />
                </ContentSkeleton>
              </div>
            </div>

            <nav className="mt-4 flex items-center gap-2 overflow-x-auto">
              {GUEST_NAV_ITEMS.map((item) => {
                const active = item.id === activeTab;
                return (
                  <div
                    key={item.id}
                    className={careerCx(
                      "rounded-full border px-4 py-2 text-sm font-medium",
                      active
                        ? "border-beige900 bg-beige900 text-beige50"
                        : "border-beige900/10 bg-white/55 text-beige900/45"
                    )}
                  >
                    {item.label}
                  </div>
                );
              })}
            </nav>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pb-10">
            <div className="mx-auto w-full max-w-[920px]">
              <ContentSkeleton className="h-[520px]" />
            </div>
          </div>
        </div>
      </section>

      <div className="absolute inset-0 bg-beige900/15 backdrop-blur-[3px]" />

      <div className="absolute inset-0 flex h-screen items-center justify-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="career-login-gate-title"
          className="w-full max-w-[420px] rounded-xl border border-beige900/10 bg-[rgba(250,243,231,0.95)] p-6 text-beige900 shadow-[0_32px_90px_-32px_rgba(52,39,24,0.45)] backdrop-blur"
        >
          <div className="flex flex-col items-start gap-4 font-hedvig text-3xl leading-none">
            <Image
              src="/images/logos/harper_beige.png"
              alt="Harper"
              width={28}
              height={28}
            />
            Harper
          </div>
          <h1
            id="career-login-gate-title"
            className="mt-6 text-base font-medium leading-6"
          >
            계속하려면 등록하신 이메일로 로그인해 주세요
          </h1>

          <button
            type="button"
            onClick={() => void onGoogleLogin()}
            disabled={authPending}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-beige900/10 bg-white/85 px-4 text-sm font-medium text-beige900 transition-colors hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {authPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                로그인 중...
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/logos/google.png"
                  alt=""
                  aria-hidden="true"
                  className="h-4 w-4"
                />
                Google 로그인
              </>
            )}
          </button>

          {authError ? (
            <p className="mt-3 rounded-[12px] border border-[#c0725d]/20 bg-[#c0725d]/10 px-3 py-2 text-sm text-[#8a4d39]">
              {authError}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default CareerLoginGate;

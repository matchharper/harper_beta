import { Loader2 } from "lucide-react";
import type { CareerWorkspaceTab } from "./CareerWorkspaceNav";
import { careerCx } from "./ui/CareerPrimitives";
import Image from "next/image";

const GUEST_NAV_ITEMS: Array<{
  id: CareerWorkspaceTab;
  label: string;
}> = [
  { id: "home", label: "Home" },
  { id: "chat", label: "대화" },
  { id: "profile", label: "프로필" },
  { id: "history", label: "Opportunities" },
];

const ContentSkeleton = ({ className }: { className?: string }) => (
  <div
    className={careerCx(
      "rounded-[22px] border border-beige900/8 bg-white/55",
      className
    )}
  />
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
      <aside className="w-full border-r border-black/5 bg-beige50 text-beige900 lg:sticky lg:top-0 lg:h-screen lg:w-[264px] lg:shrink-0 lg:self-start lg:border-b-0 lg:border-r lg:border-r-black/5">
        <div className="flex h-full flex-col px-3 py-5">
          <div className="font-halant text-3xl leading-none">Harper</div>

          <nav className="mt-6 space-y-2">
            {GUEST_NAV_ITEMS.map((item) => {
              const active = item.id === activeTab;
              return (
                <div
                  key={item.id}
                  className={careerCx(
                    "flex items-center rounded-md px-3 py-2.5 text-[15px] leading-5",
                    active ? "bg-beige200 text-beige900" : "text-beige900/45"
                  )}
                >
                  {item.label}
                </div>
              );
            })}
          </nav>

          <div className="mt-6 flex-1" />

          <div className="space-y-3 border-t border-beige900/8 pt-4">
            <ContentSkeleton className="h-11" />
            <ContentSkeleton className="h-[76px]" />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto flex h-full w-full max-w-[1380px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <ContentSkeleton className="h-[360px]" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <ContentSkeleton className="h-[172px]" />
              <ContentSkeleton className="h-[172px]" />
            </div>
          </div>
          <ContentSkeleton className="h-[220px]" />
        </div>
      </div>

      <div className="absolute inset-0 bg-beige900/14 backdrop-blur-[3px]" />

      <div className="absolute inset-0 flex items-center justify-center p-4 h-screen">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="career-login-gate-title"
          className="w-full max-w-[420px] rounded-xl border border-beige900/10 bg-[rgba(250,243,231,0.96)] p-6 text-beige900 shadow-[0_32px_90px_-32px_rgba(52,39,24,0.45)] backdrop-blur"
        >
          <div className="font-halant text-3xl leading-none flex flex-col items-start gap-4">
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
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-beige900/12 bg-white/85 px-4 text-sm font-medium text-beige900 transition-colors hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-60"
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
            <p className="mt-3 rounded-[12px] border border-[#c0725d]/20 bg-[#c0725d]/8 px-3 py-2 text-sm text-[#8a4d39]">
              {authError}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default CareerLoginGate;

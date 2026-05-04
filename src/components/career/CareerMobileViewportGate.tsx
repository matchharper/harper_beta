import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CareerMobileEntryReason } from "@/lib/career/mobileBlocker";

const CAREER_DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

type CareerMobileViewportGateProps = {
  children: ReactNode;
  desktopFallback?: ReactNode;
  entryReason?: CareerMobileEntryReason | null;
  user?: User | null;
};

const readMetadataString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const resolveUserDisplayName = (user?: User | null) => {
  if (!user) return "";

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const metadataName =
    readMetadataString(metadata?.full_name) ||
    readMetadataString(metadata?.name);

  if (metadataName) return metadataName;

  if (typeof user.email === "string" && user.email.includes("@")) {
    return user.email.split("@")[0]?.trim() ?? "";
  }

  return "";
};

const useCareerDesktopViewport = () => {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(CAREER_DESKTOP_MEDIA_QUERY);
    const syncViewport = () => setIsDesktop(mediaQuery.matches);

    syncViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  return isDesktop;
};

export const CareerMobileBlocker = ({
  entryReason,
  user,
}: {
  entryReason?: CareerMobileEntryReason | null;
  user?: User | null;
}) => {
  const displayName = useMemo(() => resolveUserDisplayName(user), [user]);
  const headline = displayName
    ? `${displayName}, 데스크탑에서 만나요`
    : "데스크탑에서 만나요";
  const supplementalLine =
    entryReason === "magic_link"
      ? "받으신 링크를 데스크탑에서 다시 열어주세요."
      : entryReason === "post_signup"
        ? "같은 이메일로 데스크탑에서 다시 로그인하시면 됩니다."
        : "";

  return (
    <main className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-beige50 px-6 py-10 font-inter text-beige900">
      <div
        aria-hidden="true"
        className="absolute left-0 top-[30dvh] flex w-full -translate-y-1/2 justify-center"
      >
        <span
          className="block h-[82px] w-[82px] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/svgs/harper-h-mark.svg')" }}
        />
      </div>

      <section className="relative z-10 mt-[12dvh] w-full max-w-[540px] text-center">
        <h1 className="font-instrument text-[36px] font-normal leading-[1.08] text-beige900 sm:text-[42px]">
          {headline}
        </h1>

        <div className="mx-auto mt-8 max-w-[430px] space-y-5 text-[15px] leading-7 text-beige900/70 sm:text-base sm:leading-8">
          <p>
            Harper는 대화하면서 동시에 연결된 기회, 프로필을 같이 보여드려요. 한
            화면에 다 보여야 도움이 되는데, 지금 화면이 좀 좁아요.
          </p>
          <p>
            데스크탑이나 큰 화면에서 다시 들어오시면 정확히 이어서 진행돼요.
          </p>
          {supplementalLine ? <p>{supplementalLine}</p> : null}
          <p className="pt-1 text-beige900">— Harper</p>
        </div>
      </section>
    </main>
  );
};

const CareerMobileViewportGate = ({
  children,
  desktopFallback = null,
  entryReason,
  user,
}: CareerMobileViewportGateProps) => {
  const isDesktop = useCareerDesktopViewport();

  return (
    <>
      <div className="lg:hidden">
        <CareerMobileBlocker entryReason={entryReason} user={user} />
      </div>
      <div className="hidden lg:block">
        {isDesktop === true ? children : desktopFallback}
      </div>
    </>
  );
};

export default CareerMobileViewportGate;

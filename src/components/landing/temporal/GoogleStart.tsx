import Image from "next/image";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/useAuthStore";
import { useC } from "./primitives";
import { tw } from "./tw";

/** Google 시작 버튼 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useGoogleStartCopy() {
  const c = useC();
  return {
    google: c("Google로 시작하기", "Continue with Google"),
    continue: c("Harper 계속하기", "Continue to Harper"),
  };
}

/**
 * 랜딩의 시작 버튼. Google 모양이지만 기존 시작 경로를 그대로 쓴다.
 * 로그인 전에는 /career_login(개인정보 처리방침 확인·앱 안 브라우저 안내·Google 로그인)으로,
 * 로그인 뒤에는 온보딩이나 /career로 간다. 클릭 기록(click_start)은 `onStartClick`이 남긴다.
 * 메인 섹션과 마지막 섹션이 함께 쓴다.
 */
export function GoogleStartAction({
  startHref,
  onStartClick,
  note,
  className,
  buttonClassName,
}: {
  startHref: string;
  onStartClick?: MouseEventHandler<HTMLAnchorElement>;
  /** 버튼 아래 한 줄. 없으면 비워 둔다. */
  note?: ReactNode;
  className?: string;
  buttonClassName?: string;
}) {
  const copy = useGoogleStartCopy();
  const user = useAuthStore((state) => state.user);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <Link
        href={startHref}
        onClick={onStartClick}
        className={cn(
          tw.cta,
          "h-[52px] min-w-[300px] gap-3.5 font-normal",
          buttonClassName
        )}
      >
        {user ? (
          copy.continue
        ) : (
          <>
            <Image
              src="/images/logos/google.png"
              alt=""
              width={20}
              height={20}
              className="size-5 shrink-0"
            />
            {copy.google}
          </>
        )}
      </Link>
      {note ? (
        <p className="mt-4 text-[13px] text-(--tl-ink-2)">{note}</p>
      ) : null}
    </div>
  );
}

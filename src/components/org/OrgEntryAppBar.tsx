import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useAuthStore } from "@/store/useAuthStore";

export function OrgEntryAppBar({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const { c } = useOrgLocale();
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const [signOutPending, setSignOutPending] = useState(false);

  const handleSignOut = async () => {
    if (signOutPending) return;
    setSignOutPending(true);
    try {
      await signOut();
      router.replace("/company");
    } finally {
      setSignOutPending(false);
    }
  };

  return (
    <header className="h-[52px]">
      <div className="flex h-full items-center justify-between px-3 sm:px-8">
        <Link
          href="/org"
          aria-label={c(
            "Harper 회사 페이지로 이동",
            "Go to Harper company page"
          )}
          className="inline-flex items-center rounded-md px-1 py-1 outline-none transition-opacity hover:opacity-65 focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
        >
          <Image
            src="/svgs/logov2.svg"
            alt={c("Harper", "Harper")}
            width={68}
            height={31}
            priority
          />
        </Link>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <MuteButton
              aria-label={c("로그아웃", "Log out")}
              disabled={signOutPending}
              onClick={() => void handleSignOut()}
              variant="transparent"
            >
              {signOutPending
                ? c("로그아웃 중", "Logging out")
                : c("로그아웃", "Log out")}
            </MuteButton>
          )}
          <MuteButton
            onClick={() => router.push("/company")}
            size="md"
            variant="default"
          >
            {c("Company", "Company")}
          </MuteButton>
        </div>
      </div>
    </header>
  );
}

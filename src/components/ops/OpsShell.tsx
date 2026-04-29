import Link from "next/link";
import { useRouter } from "next/router";
import { cx, opsTheme } from "@/components/ops/theme";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { INTERNAL_EMAIL_DOMAIN, isInternalEmail } from "@/lib/internalAccess";
import {
  BriefcaseBusiness,
  FileText,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquareText,
  ShieldAlert,
  Users,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";

type OpsNavItem = {
  description: string;
  exact?: boolean;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  matchPrefix?: string;
};

export const OPS_NAV_ITEMS: OpsNavItem[] = [
  {
    description: "내부 도구 허브",
    exact: true,
    href: "/ops",
    icon: LayoutDashboard,
    label: "Overview",
  },
  {
    description: "network.tsx 제출 데이터",
    href: "/ops/network",
    icon: Users,
    label: "Network Leads",
    matchPrefix: "/ops/network",
  },
  {
    description: "career 온보딩 인사이트",
    href: "/ops/career",
    icon: MessageSquareText,
    label: "Career Talents",
    matchPrefix: "/ops/career",
  },
  {
    description: "회사·기회 관리와 수동 매칭",
    href: "/ops/opportunities",
    icon: BriefcaseBusiness,
    label: "Opportunities",
    matchPrefix: "/ops/opportunities",
  },
  {
    description: "access 요청 승인 및 리뷰",
    href: "/ops/request-access",
    icon: KeyRound,
    label: "Request Access",
    matchPrefix: "/ops/request-access",
  },
  {
    description: "프롬프트 관리 및 버전 이력",
    href: "/ops/prompt",
    icon: FileText,
    label: "Prompts",
    matchPrefix: "/ops/prompt",
  },
];

function isItemActive(item: OpsNavItem, path: string) {
  if (item.exact) {
    return path === item.href;
  }

  const prefix = item.matchPrefix ?? item.href;
  return path === prefix || path.startsWith(`${prefix}/`);
}

function LoginGate({
  authError,
  authPending,
  onGoogleLogin,
}: {
  authError: string;
  authPending: boolean;
  onGoogleLogin: () => void;
}) {
  return (
    <div className={opsTheme.page}>
      <div className={opsTheme.backgroundGlow} />
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg bg-beige100/90 p-8 shadow-[0_28px_80px_rgba(89,57,24,0.1)]">
          <div className="inline-flex rounded-md bg-beige500/70 p-3 text-beige900">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-hedvig text-[2.2rem] leading-[0.95] tracking-[-0.07em] text-beige900">
            Harper Ops
          </h1>
          <p className="mt-3 font-geist text-sm leading-6 text-beige900/65">
            내부 운영 화면입니다. 로그인한 이메일의 도메인이{" "}
            <span className="font-medium text-beige900">
              {INTERNAL_EMAIL_DOMAIN}
            </span>
            이어야 접근할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={authPending}
            className={cx(opsTheme.buttonPrimary, "mt-6 h-11 w-full")}
          >
            {authPending ? "로그인 중..." : "Google 로그인"}
          </button>
          {authError ? (
            <div className={cx(opsTheme.errorNotice, "mt-4")}>{authError}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ForbiddenGate({
  email,
  onSignOut,
}: {
  email: string | null | undefined;
  onSignOut: () => void;
}) {
  return (
    <div className={opsTheme.page}>
      <div className={opsTheme.backgroundGlow} />
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-lg bg-beige100/90 p-8 shadow-[0_28px_80px_rgba(89,57,24,0.1)]">
          <div className="inline-flex rounded-md bg-[#F7DBD3] p-3 text-[#8A2E1D]">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-hedvig text-[2.2rem] leading-[0.95] tracking-[-0.07em] text-beige900">
            접근 불가
          </h1>
          <p className="mt-3 font-geist text-sm leading-6 text-beige900/65">
            현재 로그인한 계정은 내부 운영 도메인이 아닙니다.
          </p>
          <div className={cx(opsTheme.panelSoft, "mt-5 px-4 py-3")}>
            <div className={opsTheme.eyebrow}>Signed In</div>
            <div className="mt-2 break-all font-geist text-sm font-medium text-beige900">
              {email ?? "-"}
            </div>
          </div>
          <div className={cx(opsTheme.panelSoft, "mt-3 px-4 py-3")}>
            <div className={opsTheme.eyebrow}>Allowed Domain</div>
            <div className="mt-2 font-geist text-sm font-medium text-beige900">
              {INTERNAL_EMAIL_DOMAIN}
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className={cx(opsTheme.buttonSoft, "mt-6 h-11")}
          >
            다른 계정으로 다시 로그인
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OpsShell({
  actions,
  children,
  compactHeader = false,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  compactHeader?: boolean;
  description?: React.ReactNode;
  title: string;
}) {
  const router = useRouter();
  const { loading: authLoading, signOut, user } = useAuthStore();
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");

  const isAllowedUser = isInternalEmail(user?.email);

  const handleGoogleLogin = useCallback(async () => {
    if (authPending) return;

    setAuthPending(true);
    setAuthError("");

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${router.asPath}`
          : undefined;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) throw error;
      if (data?.url && typeof window !== "undefined") {
        window.location.assign(data.url);
        return;
      }

      setAuthPending(false);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "로그인에 실패했습니다."
      );
      setAuthPending(false);
    }
  }, [authPending, router.asPath]);

  const activePath = useMemo(() => router.pathname, [router.pathname]);

  if (authLoading) {
    return (
      <div className={opsTheme.page}>
        <div className={opsTheme.backgroundGlow} />
        <div className="relative flex min-h-screen items-center justify-center font-geist text-sm text-beige900/60">
          세션 확인 중...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginGate
        authError={authError}
        authPending={authPending}
        onGoogleLogin={() => void handleGoogleLogin()}
      />
    );
  }

  if (!isAllowedUser) {
    return (
      <ForbiddenGate email={user.email} onSignOut={() => void signOut()} />
    );
  }

  return (
    <div className={opsTheme.page}>
      <div className={opsTheme.backgroundGlow} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent)]" />
      <div className="sticky top-0 z-30 border-b border-beige900/10 bg-beige100/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/ops"
              className="shrink-0 font-hedvig text-[1.55rem] leading-none tracking-[-0.06em] text-beige900"
            >
              Harper Ops
            </Link>
          </div>
          <nav className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              {OPS_NAV_ITEMS.map((item) => {
                const active = isItemActive(item, activePath);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      "rounded-full px-3 py-2 font-geist text-sm font-medium transition-colors",
                      active
                        ? "bg-beige900 text-beige100"
                        : "bg-white/55 text-beige900/65 hover:bg-white/80 hover:text-beige900"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
      <div className="relative mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <main className="min-w-0 space-y-6">
          <section className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1
                  className={cx(
                    compactHeader
                      ? "mt-1 font-geist text-[1.15rem] font-medium tracking-[-0.02em] text-beige900"
                      : opsTheme.title,
                    compactHeader ? "" : "mt-1"
                  )}
                >
                  {title}
                </h1>
              </div>

              {actions ? (
                <div className="flex flex-wrap items-center gap-2">
                  {actions}
                </div>
              ) : null}
            </div>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}

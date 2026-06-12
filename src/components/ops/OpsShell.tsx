import Link from "next/link";
import { useRouter } from "next/router";
import { cx, opsTheme } from "@/components/ops/theme";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useOpsInternalDataExclusionStore } from "@/store/useOpsInternalDataExclusionStore";
import { INTERNAL_EMAIL_DOMAIN, isInternalEmail } from "@/lib/internalAccess";
import {
  Building2,
  BriefcaseBusiness,
  ClipboardList,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  MessageSquareText,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { BareButton } from "@/components/ui/button";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

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
    description: "사람별 internal 추천 관리",
    href: "/ops/internal-recommendations",
    icon: ClipboardList,
    label: "Internal Recs",
    matchPrefix: "/ops/internal-recommendations",
  },
  {
    description: "회사·기회 관리와 수동 매칭",
    href: "/ops/opportunities",
    icon: BriefcaseBusiness,
    label: "Opportunities",
    matchPrefix: "/ops/opportunities",
  },
  {
    description: "company_workspace score와 quality label",
    href: "/ops/companies",
    icon: Building2,
    label: "Companies",
    matchPrefix: "/ops/companies",
  },
  {
    description: "공개 jobs 페이지 포지션 관리",
    href: "/ops/jobs",
    icon: ListChecks,
    label: "Official Jobs",
    matchPrefix: "/ops/jobs",
  },
  {
    description: "채팅 답변 예시 관리",
    href: "/ops/answer-examples",
    icon: MessageSquareText,
    label: "Answer Examples",
    matchPrefix: "/ops/answer-examples",
  },
  {
    description: "access 요청 승인 및 리뷰",
    href: "/ops/request-access",
    icon: KeyRound,
    label: "Request Access",
    matchPrefix: "/ops/request-access",
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
        <div className="w-full max-w-md rounded-lg bg-bg-default/90 p-8 shadow-[0_28px_80px_color-mix(in_srgb,var(--color-neutral-1000)_10%,transparent)]">
          <div className="inline-flex rounded-md bg-bg-weak p-3 text-neutral-primary">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-hedvig text-[2.2rem] leading-[0.95] tracking-[-0.07em] text-neutral-primary">
            Harper Ops
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-muted">
            내부 운영 화면입니다. 로그인한 이메일의 도메인이{" "}
            <span className="font-medium text-neutral-primary">
              {INTERNAL_EMAIL_DOMAIN}
            </span>
            이어야 접근할 수 있습니다.
          </p>
          <BareButton
            type="button"
            onClick={onGoogleLogin}
            disabled={authPending}
            className={cx(opsTheme.buttonPrimary, "mt-6 h-11 w-full")}
          >
            {authPending ? "로그인 중..." : "Google 로그인"}
          </BareButton>
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
        <div className="w-full max-w-lg rounded-lg bg-bg-default/90 p-8 shadow-[0_28px_80px_color-mix(in_srgb,var(--color-neutral-1000)_10%,transparent)]">
          <div className="inline-flex rounded-md bg-critical-faded p-3 text-critical">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-hedvig text-[2.2rem] leading-[0.95] tracking-[-0.07em] text-neutral-primary">
            접근 불가
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-muted">
            현재 로그인한 계정은 내부 운영 도메인이 아닙니다.
          </p>
          <div className={cx(opsTheme.panelSoft, "mt-5 px-4 py-3")}>
            <div className={opsTheme.eyebrow}>Signed In</div>
            <div className="mt-2 break-all text-sm font-medium text-neutral-primary">
              {email ?? "-"}
            </div>
          </div>
          <div className={cx(opsTheme.panelSoft, "mt-3 px-4 py-3")}>
            <div className={opsTheme.eyebrow}>Allowed Domain</div>
            <div className="mt-2 text-sm font-medium text-neutral-primary">
              {INTERNAL_EMAIL_DOMAIN}
            </div>
          </div>
          <BareButton
            type="button"
            onClick={onSignOut}
            className={cx(opsTheme.buttonSoft, "mt-6 h-11")}
          >
            다른 계정으로 다시 로그인
          </BareButton>
        </div>
      </div>
    </div>
  );
}

function OpsInternalDataExclusionModal({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const clearEmailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.clearEmailExclusionTerms
  );
  const removeEmailExclusionTerm = useOpsInternalDataExclusionStore(
    (state) => state.removeEmailExclusionTerm
  );
  const setEmailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.setEmailExclusionTerms
  );
  const [draft, setDraft] = useState("");

  const handleAdd = useCallback(() => {
    const additions = draft
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (additions.length === 0) return;
    setEmailExclusionTerms([...emailExclusionTerms, ...additions]);
    setDraft("");
  }, [draft, emailExclusionTerms, setEmailExclusionTerms]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-weak px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ops-internal-data-exclusion-title"
        className="w-full max-w-lg rounded-lg bg-bg-default p-5 shadow-[0_28px_90px_color-mix(in_srgb,var(--color-neutral-1000)_18%,transparent)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="ops-internal-data-exclusion-title"
              className="mt-1 text-lg font-medium text-neutral-primary"
            >
              내부 데이터 제외
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-muted">
              아래 문자열 중 하나라도 이메일에 포함된 유저는 Ops 화면에서
              숨깁니다.
            </p>
          </div>
          <BareButton
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </BareButton>
        </div>

        <div className="mt-5">
          <label
            htmlFor="ops-internal-data-exclusion-input"
            className={opsTheme.label}
          >
            제외할 이메일 포함 문자열
          </label>
          <div className="mt-2 flex gap-2">
            <UiTextarea
              unstyled
              id="ops-internal-data-exclusion-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="예: @matchharper.com, test, internal"
              className={cx(opsTheme.textarea, "min-h-[88px] flex-1 py-3")}
            />
            <BareButton
              type="button"
              onClick={handleAdd}
              disabled={!draft.trim()}
              className={cx(opsTheme.buttonPrimary, "h-10 self-start px-3")}
            >
              <Plus className="h-4 w-4" />
              추가
            </BareButton>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <div className={opsTheme.eyebrow}>
              Exclusion Strings · {emailExclusionTerms.length}
            </div>
            {emailExclusionTerms.length > 0 ? (
              <BareButton
                type="button"
                onClick={clearEmailExclusionTerms}
                className="text-xs font-medium text-neutral-muted transition hover:text-neutral-primary"
              >
                전체 삭제
              </BareButton>
            ) : null}
          </div>

          {emailExclusionTerms.length === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-5 text-center text-sm text-neutral-soft">
              저장된 제외 문자열이 없습니다.
            </div>
          ) : (
            <div className="mt-2 max-h-[220px] overflow-y-auto rounded-md border border-neutral-1000-a05 bg-bg-default/50">
              {emailExclusionTerms.map((term) => (
                <div
                  key={term}
                  className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-sm text-neutral-muted">
                    {term}
                  </span>
                  <BareButton
                    type="button"
                    onClick={() => removeEmailExclusionTerm(term)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-soft transition hover:bg-critical-faded hover:text-critical"
                    aria-label={`${term} 삭제`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </BareButton>
                </div>
              ))}
            </div>
          )}
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
  title?: string;
}) {
  const router = useRouter();
  const { loading: authLoading, signOut, user } = useAuthStore();
  const exclusionTermCount = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms.length
  );
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [exclusionModalOpen, setExclusionModalOpen] = useState(false);

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
        <div className="relative flex min-h-screen items-center justify-center text-sm text-neutral-muted">
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-neutral-00)_20%,transparent),transparent)]" />
      <div className="sticky top-0 z-30 border-b border-neutral-1000-a05 bg-bg-default/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/ops"
              className="shrink-0 font-hedvig text-[1.55rem] leading-none tracking-[-0.06em] text-neutral-primary"
            >
              Harper Ops
            </Link>
            <BareButton
              type="button"
              onClick={() => setExclusionModalOpen(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-bg-default/65 px-2.5 text-xs font-medium text-neutral-muted transition hover:bg-bg-default hover:text-neutral-primary"
            >
              <EyeOff className="h-3.5 w-3.5" />
              내부 데이터 제외
              {exclusionTermCount > 0 ? (
                <span className="rounded bg-black px-1.5 py-0.5 text-[10px] leading-none text-neutral-00">
                  {exclusionTermCount}
                </span>
              ) : null}
            </BareButton>
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
                      "rounded-full px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-black text-neutral-00"
                        : "bg-bg-default/55 text-neutral-muted hover:bg-bg-default/80 hover:text-neutral-primary"
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
        <main className="min-w-0 space-y-2">
          <section className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1>{title}</h1>
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
      <OpsInternalDataExclusionModal
        open={exclusionModalOpen}
        onClose={() => setExclusionModalOpen(false)}
      />
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { cx, opsTheme } from "@/components/ops/theme";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useOpsInternalDataExclusionStore } from "@/store/useOpsInternalDataExclusionStore";
import { canViewOpsUtm, isInternalEmail } from "@/lib/internalAccess";
import {
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import Face from "../common/Face";

type OpsNavItem = {
  align?: "start" | "end";
  description: string;
  exact?: boolean;
  href: string;
  label: string;
  matchPrefix?: string;
};

type OpsNavGroup = {
  id: "system" | "matching" | "debugging" | "company";
  label: string;
  items: OpsNavItem[];
};

const UTM_UUID_ERROR_MESSAGES: Record<string, string> = {
  invalid: "UUID를 확인해 주세요.",
  not_configured: "UUID 접근이 설정되지 않았습니다.",
  rate_limited: "입력 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

export const OPS_NAV_GROUPS: OpsNavGroup[] = [
  {
    id: "system",
    label: "시스템",
    items: [
      {
        description: "공개 jobs 페이지 포지션 관리",
        href: "/ops/jobs",
        label: "공식 채용공고",
        matchPrefix: "/ops/jobs",
      },
      {
        description: "채팅 답변 예시 관리",
        href: "/ops/answer-examples",
        label: "답변 예시",
        matchPrefix: "/ops/answer-examples",
      },
      {
        description: "career 번역 문구 관리",
        href: "/ops/translation",
        label: "번역",
        matchPrefix: "/ops/translation",
      },
      {
        description: "access 요청 승인 및 리뷰",
        href: "/ops/request-access",
        label: "접근 요청",
        matchPrefix: "/ops/request-access",
      },
      {
        description: "Crisp 문의 확인 및 답장",
        href: "/ops/feedback",
        label: "피드백",
        matchPrefix: "/ops/feedback",
      },
      {
        description: "레퍼럴 application과 보상 지급 현황 관리",
        href: "/ops/referrals",
        label: "레퍼럴",
        matchPrefix: "/ops/referrals",
      },
      {
        description: "periodic refresh 이메일 캠페인 관리",
        href: "/ops/crm",
        label: "CRM",
        matchPrefix: "/ops/crm",
      },
      {
        description: "UTM source와 전환 퍼널 확인",
        href: "/ops/utm",
        label: "UTM",
        matchPrefix: "/ops/utm",
      },
      {
        description: "talent 서비스의 연결·활동·유지·전환 지표 확인",
        href: "/ops/metrics",
        label: "Talent 지표",
        matchPrefix: "/ops/metrics",
      },
    ],
  },
  {
    id: "matching",
    label: "매칭 관리",
    items: [
      {
        description: "회사·role 단위 매칭 관리",
        href: "/ops/matching?tab=harper_review",
        label: "Main",
        matchPrefix: "/ops/matching",
      },
      {
        align: "end",
        description: "모든 internal role에서 수락한 후보자 확인",
        href: "/ops/accepted-talents",
        label: "Accepted Talents",
        matchPrefix: "/ops/accepted-talents",
      },
      {
        align: "end",
        description: "사람 단위 talent pool 관리",
        href: "/ops/talent-pool",
        label: "Talent Pool",
        matchPrefix: "/ops/talent-pool",
      },
      {
        align: "end",
        description: "career 온보딩 인사이트",
        href: "/ops/career",
        label: "Career Talents",
        matchPrefix: "/ops/career",
      },
    ],
  },
  {
    id: "debugging",
    label: "디버깅",
    items: [
      {
        description: "company_workspace score와 quality label",
        href: "/ops/companies",
        label: "회사 관리",
        matchPrefix: "/ops/companies",
      },
      {
        description: "internal 추천부터 회사 프로세스까지 전환 품질 확인",
        href: "/ops/debugging/matching",
        label: "매칭 지표",
        matchPrefix: "/ops/debugging/matching",
      },
      {
        description: "career 메일 발송·수신 본문 확인",
        href: "/ops/debugging/emails",
        label: "메일 로그",
        matchPrefix: "/ops/debugging/emails",
      },
      {
        description: "talent call transcript 확인",
        href: "/ops/debugging/calls",
        label: "콜 로그",
        matchPrefix: "/ops/debugging/calls",
      },
      {
        description: "opportunity discovery run 실행 결과 확인",
        href: "/ops/debugging/opportunity-runs",
        label: "기회 탐색 로그",
        matchPrefix: "/ops/debugging/opportunity-runs",
      },
      {
        description: "company-side LLM tool 원문 결과 확인",
        href: "/ops/debugging/org-agent-tools",
        label: "LLM Tool",
        matchPrefix: "/ops/debugging/org-agent-tools",
      },
      {
        description: "LLM API와 AWS EC2 비용 및 credit 확인",
        href: "/ops/cost",
        label: "비용",
        matchPrefix: "/ops/cost",
      },
    ],
  },
  {
    id: "company",
    label: "회사",
    items: [
      {
        description: "회사 workspace별 role, 멤버, 활동 관리",
        exact: true,
        href: "/ops/company",
        label: "Main",
      },
      {
        description: "회사 페이지에서 제출된 상담 신청 확인",
        href: "/ops/company/waiting",
        label: "대기",
        matchPrefix: "/ops/company/waiting",
      },
    ],
  },
];

function isItemActive(item: OpsNavItem, path: string) {
  if (item.exact) {
    return path === item.href;
  }

  const prefix = item.matchPrefix ?? item.href;
  return path === prefix || path.startsWith(`${prefix}/`);
}

function getActiveNavGroup(path: string) {
  return (
    OPS_NAV_GROUPS.find((group) =>
      group.items.some((item) => isItemActive(item, path))
    ) ?? OPS_NAV_GROUPS.find((group) => group.id === "matching")!
  );
}

function OpsAccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-default text-neutral-primary">
      <header className="h-[52px]">
        <div className="flex h-full items-center px-3 sm:px-8">
          <Link
            href="/ops"
            aria-label="Harper Ops로 이동"
            className="inline-flex items-center rounded-md px-1 py-1 outline-none transition-opacity hover:opacity-65 focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
          >
            <Image
              src="/svgs/logov2.svg"
              alt="Harper"
              width={68}
              height={31}
              priority
            />
          </Link>
        </div>
      </header>
      <main className="flex min-h-[calc(100vh-52px)] items-center justify-center px-4 pb-14">
        <section className="w-full max-w-[400px]">{children}</section>
      </main>
    </div>
  );
}

function GoogleLoginButton({
  authPending,
  onClick,
}: {
  authPending: boolean;
  onClick: () => void;
}) {
  return (
    <BareButton
      type="button"
      onClick={onClick}
      disabled={authPending}
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-neutral-1000-a05 bg-bg-floating px-4 py-3 text-[14px] font-medium text-neutral-700 shadow-sm transition duration-200 hover:border-neutral-200 hover:shadow-none active:shadow-inner disabled:cursor-not-allowed disabled:opacity-55"
    >
      {authPending ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Image
          src="/images/logos/google.png"
          alt="Google"
          width={18}
          height={18}
        />
      )}
      Google로 로그인
    </BareButton>
  );
}

function LoginGate({
  allowUtmUuid,
  authError,
  authPending,
  onGoogleLogin,
  utmUuidError,
}: {
  allowUtmUuid: boolean;
  authError: string;
  authPending: boolean;
  onGoogleLogin: () => void;
  utmUuidError: string;
}) {
  return (
    <OpsAccessLayout>
      <div className="text-center">
        <h1 className="text-[18px] font-normal leading-6 tracking-[-0.025em] text-neutral-primary">
          Harper Ops
        </h1>
        <p className="mt-3 text-[14px] font-light leading-5 text-neutral-muted">
          Harper 내부 운영팀을 위한 공간입니다.
          <br />
          아래에서 사내 계정으로 로그인해 주세요.
        </p>
        <div className="mt-6">
          <GoogleLoginButton
            authPending={authPending}
            onClick={onGoogleLogin}
          />
        </div>
        {authError ? (
          <p className="mt-3 text-[12px] font-normal leading-5 text-critical">
            {authError}
          </p>
        ) : null}
        {allowUtmUuid ? (
          <UtmUuidAccessForm
            className="mt-6 border-t border-neutral-1000-a05 pt-6 text-left"
            error={utmUuidError}
          />
        ) : null}
      </div>
    </OpsAccessLayout>
  );
}

function ForbiddenGate({
  allowUtmUuid,
  email,
  onSignOut,
  utmUuidError,
}: {
  allowUtmUuid: boolean;
  email: string | null | undefined;
  onSignOut: () => void;
  utmUuidError: string;
}) {
  return (
    <OpsAccessLayout>
      <div className="text-center">
        <h1 className="text-[18px] font-normal leading-6 tracking-[-0.025em] text-neutral-primary">
          접근 권한이 없습니다.
        </h1>
        <p className="mt-3 text-[14px] font-light leading-5 text-neutral-muted">
          {email ? <span className="block break-all">{email}</span> : null}
          Harper 내부 계정으로 다시 로그인해 주세요.
        </p>
        <MuteButton
          type="button"
          onClick={onSignOut}
          className="mt-6 w-full"
          size="lg"
          variant="dark"
        >
          다른 계정으로 로그인
        </MuteButton>
        {allowUtmUuid ? (
          <UtmUuidAccessForm
            className="mt-6 border-t border-neutral-1000-a05 pt-6 text-left"
            error={utmUuidError}
          />
        ) : null}
      </div>
    </OpsAccessLayout>
  );
}

function UtmUuidAccessForm({
  className,
  error,
}: {
  className?: string;
  error: string;
}) {
  return (
    <form
      action="/api/internal/ops/utm/access"
      className={className}
      method="post"
    >
      <div className="mt-1.5 flex gap-2">
        <Input
          autoCapitalize="none"
          autoComplete="off"
          className="min-w-0 flex-1 font-mono"
          id="ops-utm-access-uuid"
          name="uuid"
          placeholder="00000000-0000-0000-0000-000000000000"
          required
          spellCheck={false}
          type="password"
        />
        <MuteButton className="shrink-0" size="md" type="submit" variant="dark">
          Enter
        </MuteButton>
      </div>
      {error ? (
        <div className={cx(opsTheme.errorNotice, "mt-3")}>{error}</div>
      ) : null}
    </form>
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
  allowUtmViewer = false,
  children,
  compactHeader = false,
  title,
  navActions,
}: {
  actions?: React.ReactNode;
  allowUtmViewer?: boolean;
  children: React.ReactNode;
  compactHeader?: boolean;
  description?: React.ReactNode;
  title?: string;
  navActions?: React.ReactNode;
}) {
  const router = useRouter();
  const { loading: authLoading, signOut, user } = useAuthStore();
  const exclusionTermCount = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms.length
  );
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [exclusionModalOpen, setExclusionModalOpen] = useState(false);
  const [utmUuidAccess, setUtmUuidAccess] = useState<
    "checking" | "disabled" | "denied" | "granted"
  >("checking");
  const secondaryNavRef = useRef<HTMLElement>(null);

  const isAllowedUser = isInternalEmail(user?.email);
  const isUtmEmailViewer =
    allowUtmViewer && !isAllowedUser && canViewOpsUtm(user?.email);
  const isUtmOnlyViewer =
    allowUtmViewer &&
    !isAllowedUser &&
    (isUtmEmailViewer || utmUuidAccess === "granted");
  const utmUuidError =
    typeof router.query.utmAccessError === "string"
      ? (UTM_UUID_ERROR_MESSAGES[router.query.utmAccessError] ?? "")
      : "";

  useEffect(() => {
    if (authLoading || !allowUtmViewer || isAllowedUser || isUtmEmailViewer) {
      return;
    }

    const controller = new AbortController();
    setUtmUuidAccess("checking");
    void fetch("/api/internal/ops/utm/access", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          enabled?: boolean;
          granted?: boolean;
        };
        if (controller.signal.aborted) return;
        setUtmUuidAccess(
          payload.granted ? "granted" : payload.enabled ? "denied" : "disabled"
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setUtmUuidAccess("denied");
      });

    return () => controller.abort();
  }, [allowUtmViewer, authLoading, isAllowedUser, isUtmEmailViewer]);

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
  const activeNavGroup = useMemo(
    () => getActiveNavGroup(activePath),
    [activePath]
  );
  const activeNavStartItems = activeNavGroup.items.filter(
    (item) => item.align !== "end"
  );
  const activeNavEndItems = activeNavGroup.items.filter(
    (item) => item.align === "end"
  );

  useEffect(() => {
    const activeItem = secondaryNavRef.current?.querySelector(
      '[aria-current="page"]'
    );
    activeItem?.scrollIntoView({
      behavior: "instant",
      block: "nearest",
      inline: "nearest",
    });
  }, [activePath]);

  if (authLoading) {
    return (
      <div className={opsTheme.page}>
        <div className={opsTheme.backgroundGlow} />
        <div className="relative flex min-h-svh items-center justify-center text-sm text-neutral-muted">
          세션 확인 중...
        </div>
      </div>
    );
  }

  if (
    allowUtmViewer &&
    !isAllowedUser &&
    !isUtmEmailViewer &&
    utmUuidAccess === "checking"
  ) {
    return (
      <div className={opsTheme.page}>
        <div className={opsTheme.backgroundGlow} />
        <div className="relative flex min-h-svh items-center justify-center text-sm text-neutral-muted">
          UTM 접근 권한 확인 중...
        </div>
      </div>
    );
  }

  if (!user && !isUtmOnlyViewer) {
    return (
      <LoginGate
        allowUtmUuid={allowUtmViewer && utmUuidAccess !== "disabled"}
        authError={authError}
        authPending={authPending}
        onGoogleLogin={() => void handleGoogleLogin()}
        utmUuidError={utmUuidError}
      />
    );
  }

  if (!isAllowedUser && !isUtmOnlyViewer) {
    return (
      <ForbiddenGate
        allowUtmUuid={allowUtmViewer && utmUuidAccess !== "disabled"}
        email={user?.email}
        onSignOut={() => void signOut()}
        utmUuidError={utmUuidError}
      />
    );
  }

  if (isUtmOnlyViewer) {
    return (
      <div className="relative min-h-svh overflow-x-clip bg-bg-basement text-neutral-primary">
        <div className={opsTheme.backgroundGlow} />
        <main className="relative mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="relative h-svh overflow-x-clip overflow-y-auto bg-bg-basement text-neutral-primary">
      <div className={opsTheme.backgroundGlow} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-neutral-00)_20%,transparent),transparent)]" />
      <div className="z-30 border-b border-neutral-1000-a05 bg-bg-default/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Link
                href="/ops"
                className="shrink-0 font-hedvig text-lg text-neutral-primary"
              >
                Harper Ops
              </Link>
              <div className="flex flex-row gap-2 items-center">
                {OPS_NAV_GROUPS.map((group) => (
                  <Link
                    key={group.id}
                    href={group.items[0]?.href ?? "/ops"}
                    className={cx(
                      "inline-flex h-8 items-center rounded px-3 text-sm font-medium",
                      activeNavGroup.id === group.id
                        ? "text-primary"
                        : "text-neutral-muted hover:text-neutral-primary"
                    )}
                  >
                    {group.label}
                  </Link>
                ))}
              </div>
            </div>
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
          <nav ref={secondaryNavRef} className="overflow-x-auto">
            <div className="flex min-w-full items-center justify-between gap-6">
              <div className="flex min-w-max items-center gap-2">
                {activeNavStartItems.map((item) => {
                  const active = isItemActive(item, activePath);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "rounded-none border-b-0 border-neutral-500 px-2 py-2 text-sm font-medium",
                        active
                          ? "border-primary text-primary"
                          : "text-neutral-800 hover:border-primary hover:text-primary"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              {activeNavEndItems.length > 0 ? (
                <div className="ml-auto flex min-w-max items-center gap-2">
                  {activeNavEndItems.map((item) => {
                    const active = isItemActive(item, activePath);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "rounded-none border-b-0 border-neutral-500 px-2 py-2 text-sm font-medium",
                          active
                            ? "border-primary text-primary"
                            : "text-neutral-800 hover:border-primary hover:text-primary"
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      </div>
      {navActions ? (
        <div
          data-ops-shell-header
          className="sticky top-0 z-30 border-b border-neutral-1000-a05 bg-bg-default/90 backdrop-blur-xl"
        >
          <div className="mx-auto max-w-[1600px] overflow-x-auto px-4 pb-3 lg:px-6">
            <div className="flex min-w-max items-center gap-2">
              {navActions}
            </div>
          </div>
        </div>
      ) : null}
      <div className="relative mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
        <main className="min-w-0 space-y-2">
          {actions && (
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
          )}

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

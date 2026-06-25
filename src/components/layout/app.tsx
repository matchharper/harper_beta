"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  List,
  PanelLeft,
  PanelLeftOpen,
  User,
  LogOut,
  HelpCircle,
  MessageSquareMore,
  UserSearch,
  Menu,
} from "lucide-react";
import { useRouter } from "next/router";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useCredits } from "@/hooks/useCredit";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { NavItem } from "./HistoryItem";
import { Tooltips } from "../ui/tooltip";
import { useMessages } from "@/i18n/useMessage";
import HoverHistory from "./HoverHistory";
import { useLogEvent } from "@/hooks/useLog";
import FeedbackRewardModal from "@/components/Modal/FeedbackRewardModal";
import { useFeedbackModalStore } from "@/store/useFeedbackModalStore";
import Link from "next/link";
import Image from "next/image";
import { ActionDropdown, ActionDropdownItem } from "../ui/action-dropdown";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { useMatchWorkspace } from "@/hooks/match/useMatchWorkspace";
import MatchSidebarRoles from "@/components/match/MatchSidebarRoles";
import { BareButton } from "@/components/ui/button";

type AppLayoutProps = {
  children: React.ReactNode;
  initialCollapse?: boolean;
};

const AUTH_REDIRECT_PATH = "/search";

const AppLayout = ({ children, initialCollapse = true }: AppLayoutProps) => {
  const [collapsed, setCollapsed] = useState(initialCollapse);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useIsMobile();
  const { credits, isLoading: isLoadingCredits } = useCredits();
  const { m } = useMessages();
  const { companyUser, loading, initialized, loadedUserId, load, clear } =
    useCompanyUserStore();
  const { user, loading: authLoading, signOut } = useAuthStore();
  const logEvent = useLogEvent();
  const { open: openFeedbackModal } = useFeedbackModalStore();
  const lastFreeRefreshUserId = useRef<string | null>(null);

  const router = useRouter();
  const companyUserId = companyUser?.user_id ?? null;
  const pathname = useMemo(() => {
    const path = router.asPath ?? router.pathname ?? "";
    return path.split("?")[0] ?? "";
  }, [router.asPath, router.pathname]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      clear();
      router.replace(AUTH_REDIRECT_PATH);
      return;
    }

    if (loadedUserId && loadedUserId !== user.id) {
      clear();
      return;
    }

    if (companyUserId && companyUserId !== user.id) {
      clear();
      return;
    }

    if (!initialized && !loading) {
      void load(user.id).catch((error) => {
        console.error("[company persona] failed to load company user:", error);
      });
    }
  }, [
    authLoading,
    user,
    loadedUserId,
    companyUserId,
    initialized,
    loading,
    load,
    clear,
    router,
  ]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!initialized || loading) return;
    if (loadedUserId !== user.id) return;
    if (!companyUser || !companyUser.is_authenticated) {
      router.replace(AUTH_REDIRECT_PATH);
    }
  }, [
    authLoading,
    user,
    loadedUserId,
    loading,
    initialized,
    companyUser,
    router,
  ]);

  useEffect(() => {
    if (!companyUser?.user_id) return;
    if (loading) return;
    if (!companyUser.is_authenticated) return;
    if (lastFreeRefreshUserId.current === companyUser.user_id) return;

    lastFreeRefreshUserId.current = companyUser.user_id;

    const payload = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: companyUser.user_id }),
    };

    Promise.all([
      fetch("/api/credits/free-refresh", payload),
      fetch("/api/credits/annual-refresh", payload),
    ]).catch((err) => {
      console.error("Failed to refresh credits:", err);
    });
  }, [companyUser?.user_id, companyUser?.is_authenticated, loading]);

  const isHome = pathname === "/my";
  const isList = pathname === "/my/list";
  const isMatch = pathname?.startsWith("/my/match");
  const userId = companyUser?.user_id;
  const requestedWorkspaceId =
    typeof router.query.workspaceId === "string"
      ? router.query.workspaceId
      : null;
  const { data: matchWorkspaceData } = useMatchWorkspace(
    requestedWorkspaceId,
    Boolean(userId) && isMatch
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key.toLowerCase() !== "k") return;

      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      if (pathname !== "/my") {
        router.push("/my");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pathname, router]);

  const activeQueryId = useMemo(() => {
    const q = router.query.id;
    if (typeof q === "string" && q.length > 0) return q;
    if (Array.isArray(q) && q[0]) return q[0];

    const match = pathname?.match(/^\/my\/c\/([^/?#]+)/);
    return match?.[1] ?? null;
  }, [pathname, router.query.id]);

  const handleMobileNavigate = () => setMobileNavOpen(false);

  const navLinks = (
    <>
      <NavItem
        collapsed={collapsed}
        active={isHome}
        label="Search"
        icon={<Search size={16} />}
        href="/my"
        onNavigate={() => {
          logEvent("enter_search");
          handleMobileNavigate();
        }}
        shortcut="cmdK"
      />
      <NavItem
        collapsed={collapsed}
        active={isMatch}
        label="Scout"
        icon={<UserSearch size={16} />}
        href="/my/match"
        onNavigate={() => {
          logEvent("enter_match");
          handleMobileNavigate();
        }}
      />
      {isMatch ? (
        <MatchSidebarRoles
          collapsed={collapsed}
          roles={matchWorkspaceData?.roles ?? []}
          workspace={matchWorkspaceData?.workspace ?? null}
        />
      ) : null}
      <NavItem
        collapsed={collapsed}
        active={isList}
        label="Shortlist"
        icon={<List size={16} />}
        href="/my/list"
        onNavigate={() => {
          logEvent("enter_shortlist");
          handleMobileNavigate();
        }}
      />
    </>
  );

  const creditsBlock = collapsed ? (
    <Link
      href="/my/billing"
      className="cursor-pointer"
      onClick={() => {
        logEvent("enter_billing");
        handleMobileNavigate();
      }}
    >
      <div className="rounded-lg p-1 py-2 flex flex-col gap-2 transition-colors duration-300 ease-out hover:bg-bg-floating">
        <div className="w-full text-center text-[15px] text-xs text-neutral-primary">
          {credits?.remain_credit ?? 0}
        </div>
      </div>
    </Link>
  ) : (
    <Link
      href="/my/billing"
      className="cursor-pointer"
      onClick={() => {
        logEvent("enter_billing");
        handleMobileNavigate();
      }}
    >
      <div className="rounded-lg p-3 flex flex-col gap-2 border border-neutral-1000-a05 transition-colors duration-300 ease-out hover:bg-bg-floating">
        <div className="w-full flex flex-row items-center justify-between text-[15px]">
          <div className="w-[68%] text-xs text-neutral-muted">
            이번 달 남은 열람 횟수
          </div>
          <div className="w-[20%] text-right text-xs text-neutral-primary">
            {credits?.remain_credit ?? 0}
          </div>
        </div>
      </div>
    </Link>
  );

  const accountDropdown = (
    <ActionDropdown
      align="start"
      contentClassName="w-52"
      trigger={
        <BareButton
          className={[
            "w-full flex text-base font-extralight items-center gap-3 rounded-[6px] px-2.5 py-2",
            "transition duration-200 text-neutral-primary bg-transparent hover:bg-bg-floating",
          ].join(" ")}
        >
          <div className="shrink-0">
            {companyUser?.profile_picture ? (
              <Image
                src={companyUser?.profile_picture ?? ""}
                alt="profile"
                width={24}
                height={24}
                className="rounded-lg"
              />
            ) : (
              <User size={18} />
            )}
          </div>
          {!collapsed && (
            <div className="truncate text-sm font-normal">
              {companyUser?.name ?? "Settings"}
            </div>
          )}
        </BareButton>
      }
    >
      <ActionDropdownItem
        onSelect={(e) => {
          e.preventDefault();
          logEvent("enter_feedback");
          openFeedbackModal();
          handleMobileNavigate();
        }}
      >
        <MessageSquareMore size={18} />
        <div>피드백 남기기</div>
      </ActionDropdownItem>
      <ActionDropdownItem asChild className="mt-1 p-0">
        <Link
          href="/my/help"
          className="w-full flex flex-row gap-1 px-3 py-2"
          onClick={() => {
            logEvent("enter_help");
            handleMobileNavigate();
          }}
        >
          <HelpCircle size={18} />
          <div>도움말</div>
        </Link>
      </ActionDropdownItem>
      <ActionDropdownItem asChild className="mt-1 p-0">
        <Link
          href="/my/account"
          className="w-full flex flex-row gap-1 px-3 py-2"
          onClick={() => {
            logEvent("enter_account");
            handleMobileNavigate();
          }}
        >
          <User size={18} />
          <div>{m.system.account}</div>
        </Link>
      </ActionDropdownItem>
      <ActionDropdownItem
        className="mt-1 flex flex-row gap-1"
        onSelect={async (e) => {
          e.preventDefault();
          logEvent("logout");
          await signOut();
          clear();
          router.push(AUTH_REDIRECT_PATH);
        }}
      >
        <LogOut size={18} />
        <div>{m.system.logout}</div>
      </ActionDropdownItem>
    </ActionDropdown>
  );

  if (isMobile) {
    return (
      <div className="flex min-h-svh w-full flex-col bg-bg-basement font-sans text-neutral-primary">
        <header
          className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-neutral-1000-a05 bg-bg-basement/95 px-4 backdrop-blur-md"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <DrawerTrigger asChild>
              <BareButton
                type="button"
                aria-label="메뉴 열기"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-neutral-primary hover:bg-bg-floating"
              >
                <Menu size={20} />
              </BareButton>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85svh]">
              <div className="flex flex-col gap-1 px-3 pb-2 pt-2">
                {navLinks}
              </div>
              <div className="mt-2 flex flex-col gap-2 border-t border-neutral-1000-a05 p-3">
                {creditsBlock}
                {accountDropdown}
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {userId && activeQueryId && (
                  <HoverHistory
                    collapsed={false}
                    userId={userId}
                    activeQueryId={activeQueryId}
                  />
                )}
              </div>
            </DrawerContent>
          </Drawer>
          <Link
            href="/my"
            className="font-hedvig text-xl font-semibold"
            onClick={() => logEvent("enter_search")}
          >
            Harper
          </Link>
          <div className="inline-flex h-11 w-11 items-center justify-center">
            {companyUser?.profile_picture ? (
              <Image
                src={companyUser?.profile_picture ?? ""}
                alt="profile"
                width={28}
                height={28}
                className="rounded-lg"
              />
            ) : (
              <User size={20} />
            )}
          </div>
        </header>

        <main
          id="app-scroll"
          className="flex-1 overflow-y-auto bg-bg-basement text-neutral-primary scroll-smooth"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="font-sans mx-auto pb-24 min-h-full flex flex-col items-center">
            {!isLoadingCredits && userId && children}
          </div>
        </main>
        <FeedbackRewardModal />
      </div>
    );
  }

  return (
    <div className="flex h-svh font-sans w-full bg-bg-basement text-neutral-primary overflow-hidden">
      <aside
        className={[
          "relative bg-bg-basement text-neutral-primary",
          "border-r border-neutral-1000-a05 h-svh flex flex-col",
          collapsed ? "w-[66px]" : "w-[260px]",
          "transition-all duration-300 ease-out shrink-0",
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-3 pt-4 shrink-0">
          {!collapsed && (
            <Link
              href="/my"
              className="font-hedvig text-xl font-semibold truncate cursor-pointer"
              onClick={() => logEvent("enter_search")}
            >
              Harper
            </Link>
          )}
          <Tooltips
            text={collapsed ? "Open sidebar" : "Close sidebar"}
            side="right"
          >
            <BareButton
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="inline-flex items-center justify-center rounded-[6px] active:scale-[0.99] transition px-3 py-2 hover:bg-bg-floating"
            >
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeft size={18} />
              )}
            </BareButton>
          </Tooltips>
        </div>
        <div className="flex flex-col mt-4 px-3 gap-1 flex-1">
          {navLinks}
          {isMatch ? (
            <div className="flex h-2" />
          ) : (
            <div className="flex h-16" />
          )}
          <HoverHistory
            collapsed={collapsed}
            userId={userId ?? ""}
            activeQueryId={activeQueryId ?? ""}
          />
        </div>

        <div className="p-3 gap-2 flex flex-col shrink-0 border-t border-neutral-1000-a05 bg-bg-basement absolute bottom-0 left-0 min-w-full">
          {creditsBlock}
          {accountDropdown}
        </div>
      </aside>

      <main
        id="app-scroll"
        className="flex-1 h-svh overflow-y-auto bg-bg-basement text-neutral-primary scroll-smooth"
      >
        <div className="font-sans mx-auto pb-24 min-h-full flex flex-col items-center h-full">
          {!isLoadingCredits && userId && children}
        </div>
      </main>
      <FeedbackRewardModal />
    </div>
  );
};
export default React.memo(AppLayout);

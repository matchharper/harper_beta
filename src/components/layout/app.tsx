"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  List,
  Sparkles,
  PanelLeft,
  PanelLeftOpen,
  User,
  LogOut,
  HelpCircle,
  MessageSquareMore,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useCredits } from "@/hooks/useCredit";
import { NavItem } from "./HistoryItem";
import { Tooltips } from "../ui/tooltip";
import { useMessages } from "@/i18n/useMessage";
import HoverHistory from "./HoverHistory";
import { useLogEvent } from "@/hooks/useLog";
import FeedbackRewardModal from "@/components/Modal/FeedbackRewardModal";
import { useFeedbackModalStore } from "@/store/useFeedbackModalStore";
import Link from "next/link";
import Script from "next/script";
import { ActionDropdown, ActionDropdownItem } from "../ui/action-dropdown";

const AppLayout = ({
  children,
  initialCollapse = true,
}: {
  children: React.ReactNode;
  initialCollapse?: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(initialCollapse);
  const { credits, isLoading: isLoadingCredits } = useCredits();
  const { m } = useMessages();
  const { companyUser, loading, initialized, clear } = useCompanyUserStore();
  const { user, loading: authLoading, signOut } = useAuthStore();
  const logEvent = useLogEvent();
  const { open: openFeedbackModal } = useFeedbackModalStore();

  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!initialized || loading) return;
    if (!companyUser || !companyUser.is_authenticated) {
      router.replace("/");
    }
  }, [authLoading, user, loading, initialized, companyUser, router]);

  const pathname = usePathname();
  const isHome = pathname === "/my";
  const isList = pathname === "/my/list";
  const isAutomation = pathname?.startsWith("/my/scout");

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

  const userId = companyUser?.user_id;

  // ✅ /my/c/[queryId] 라면 queryId 읽기 (쿼리스트링 유무 무관)
  const activeQueryId = useMemo(() => {
    const q = params?.queryId;
    if (typeof q === "string" && q.length > 0) return q;
    if (Array.isArray(q) && q[0]) return q[0];

    const m = pathname?.match(/^\/my\/c\/([^/?#]+)/);
    return m?.[1] ?? null;
  }, [params, pathname]);
  const crispWebsiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
  const crispScript = crispWebsiteId
    ? `
        window.$crisp = window.$crisp || [];
        window.CRISP_WEBSITE_ID = ${JSON.stringify(crispWebsiteId)};
        (function() {
          if (document.getElementById("crisp-loader")) return;
          const d = document;
          const s = d.createElement("script");
          s.id = "crisp-loader";
          s.src = "https://client.crisp.chat/l.js";
          s.async = 1;
          d.getElementsByTagName("head")[0].appendChild(s);
        })();
      `
    : null;

  return (
    <div className="flex h-screen font-sans w-full bg-hgray200 text-neutral-900 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={[
          "relative bg-bgDark900 text-white",
          "shadow-sm h-screen flex flex-col", // flex-col 추가
          collapsed ? "w-[66px]" : "w-[260px]",
          "transition-all duration-300 ease-out flex-shrink-0", // flex-shrink-0 추가
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-3 pt-4 flex-shrink-0">
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
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="inline-flex items-center justify-center rounded-[6px] active:scale-[0.99] transition px-3 py-2 hover:bg-bgDark500"
            >
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeft size={18} />
              )}
            </button>
          </Tooltips>
        </div>
        <div className="flex flex-col mt-4 px-3 gap-1 flex-1">
          <NavItem
            collapsed={collapsed}
            active={isHome}
            label="Search"
            icon={<Search size={16} />}
            href="/my"
            onNavigate={() => logEvent("enter_search")}
            shortcut="cmdK"
          />
          <NavItem
            collapsed={collapsed}
            active={isAutomation}
            label="Harper Scout"
            icon={<Sparkles size={16} />}
            href="/my/scout"
            onNavigate={() => logEvent("enter_scout")}
          />
          <NavItem
            collapsed={collapsed}
            active={isList}
            label="Shortlist"
            icon={<List size={16} />}
            href="/my/list"
            onNavigate={() => logEvent("enter_shortlist")}
          />
          <div className="flex h-16"></div>
          <HoverHistory
            collapsed={collapsed}
            userId={userId}
            activeQueryId={activeQueryId ?? ""}
          />
        </div>

        {/* 3. Bottom Section: 고정 */}
        <div className="p-3 gap-2 flex flex-col flex-shrink-0 border-t border-white/5 bg-hgray100 absolute bottom-0 left-0 min-w-full">
          {!collapsed && (
            <>
              <Link
                href="/my/billing"
                className="cursor-pointer"
                onClick={() => logEvent("enter_billing")}
              >
                <div className="rounded-lg p-3 flex flex-col gap-2 border border-white/5 transition-color duration-300 ease-out hover:bg-[#FFFFFF12]">
                  <div className="w-full flex flex-row items-center justify-between text-[15px]">
                    {/* <Zap fill="#fff" size={14} /> */}
                    <div className="w-[68%] text-xs text-hgray700">
                      이번 달 남은 열람 횟수
                    </div>
                    <div className="w-[20%] text-right text-xs text-accenta1/80">
                      {credits?.remain_credit ?? 0}
                    </div>
                  </div>
                </div>
              </Link>
            </>
          )}
          {collapsed && (
            <Link
              href="/my/billing"
              className="cursor-pointer"
              onClick={() => logEvent("enter_billing")}
            >
              <div className="rounded-lg p-1 py-2 flex flex-col gap-2 transition-color duration-300 ease-out hover:bg-[#FFFFFF12]">
                <div className="w-full text-center text-[15px] text-xs text-hgray700">
                  {credits?.remain_credit ?? 0}
                </div>
              </div>
            </Link>
          )}
          <ActionDropdown
            align="start"
            contentClassName="w-52"
            trigger={
              <button
                className={[
                  "w-full flex text-base font-extralight items-center gap-3 rounded-[6px] px-2.5 py-2",
                  "transition duration-200 text-white bg-transparent hover:bg-white/10",
                ].join(" ")}
              >
                <div className="shrink-0">
                  {companyUser?.profile_picture ? (
                    <img
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
              </button>
            }
          >
            <ActionDropdownItem
              onSelect={(e) => {
                e.preventDefault();
                logEvent("enter_feedback");
                openFeedbackModal();
              }}
            >
              <MessageSquareMore size={18} />
              <div>피드백 남기기</div>
            </ActionDropdownItem>
            <ActionDropdownItem asChild className="mt-1 p-0">
              <Link
                href="/my/help"
                className="w-full flex flex-row gap-1 px-3 py-2"
                onClick={() => logEvent("enter_help")}
              >
                <HelpCircle size={18} />
                <div>도움말</div>
              </Link>
            </ActionDropdownItem>
            <ActionDropdownItem asChild className="mt-1 p-0">
              <Link
                href="/my/account"
                className="w-full flex flex-row gap-1 px-3 py-2"
                onClick={() => logEvent("enter_account")}
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
                router.push("/");
              }}
            >
              <LogOut size={18} />
              <div>{m.system.logout}</div>
            </ActionDropdownItem>
          </ActionDropdown>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        id="app-scroll"
        className="flex-1 h-screen overflow-y-auto bg-hgray200 text-white scroll-smooth"
      >
        {/* overflow-scroll 대신 overflow-y-auto 사용 (필요할 때만 스크롤바 생성) */}
        <div className="font-sans mx-auto pb-24 min-h-full flex flex-col items-center h-full">
          {!isLoadingCredits && userId && children}
        </div>
      </main>
      {crispScript && (
        <Script id="crisp-chat" strategy="afterInteractive">
          {crispScript}
        </Script>
      )}
      <FeedbackRewardModal />
    </div>
  );
};
export default React.memo(AppLayout);

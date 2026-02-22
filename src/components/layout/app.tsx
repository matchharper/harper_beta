"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  List,
  Sparkles,
  PanelLeft,
  PanelLeftOpen,
  Database,
  User,
  LogOut,
  HelpCircle,
  Zap,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useCredits } from "@/hooks/useCredit";
import { NavItem } from "./HistoryItem";
import { Tooltips } from "../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useMessages } from "@/i18n/useMessage";
import HoverHistory from "./HoverHistory";
import { useLogEvent } from "@/hooks/useLog";

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

  return (
    <div className="flex h-screen font-sans w-full bg-white text-neutral-900 overflow-hidden">
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
            <div
              className="font-hedvig text-xl font-semibold truncate cursor-pointer"
              onClick={() => router.push("/my")}
            >
              Harper
            </div>
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
            onClick={() => router.push("/my")}
            shortcut="cmdK"
          />
          <NavItem
            collapsed={collapsed}
            active={isAutomation}
            label="Harper Scout"
            icon={<Sparkles size={16} />}
            onClick={() => {
              logEvent("enter_scout");
              router.push("/my/scout");
            }}
          />
          <NavItem
            collapsed={collapsed}
            active={isList}
            label="Shortlist"
            icon={<List size={16} />}
            onClick={() => {
              logEvent("enter_shortlist");
              router.push("/my/list");
            }}
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
              <div
                className="cursor-pointer"
                onClick={() => {
                  logEvent("enter_billing");
                  router.push("/my/billing");
                }}
              >
                <div className="rounded-lg p-3.5 pt-2.5 flex flex-col gap-2 border border-white/5 transition-color duration-300 ease-out hover:bg-[#FFFFFF12]">
                  <div className="w-full flex flex-row items-center justify-between text-[15px]">
                    <Zap fill="#fff" size={14} />
                    <div className="w-[68%]">Credits</div>
                    <div className="w-[20%] text-right text-xs text-accenta1/80">
                      {credits?.remain_credit ?? 0}
                    </div>
                  </div>
                  <div className="w-full flex relative rounded-full h-1 bg-white/10">
                    <div
                      className="absolute left-0 top-0 rounded-full h-1 bg-accenta1 transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.min(
                          ((credits?.remain_credit ?? 0) /
                            (credits?.charged_credit ?? 1)) *
                            100,
                          100
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
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

                {/* <NavItem
                  collapsed={collapsed}
                  label={companyUser?.name ?? "Settings"}
                  icon={<Settings size={18} />}
                  onClick={() => {}}
                /> */}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-52 bg-white/5 backdrop-blur-md border-none text-white p-2"
              align="start"
            >
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="flex flex-row gap-1 cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    logEvent("enter_help");
                    router.push("/my/help");
                  }}
                >
                  <HelpCircle size={18} />
                  <div>Help</div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex flex-row gap-1 cursor-pointer mt-1"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    logEvent("enter_account");
                    router.push("/my/account");
                  }}
                >
                  <User size={18} />
                  <div>{m.system.account}</div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex flex-row gap-1 mt-1 cursor-pointer"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    logEvent("logout");
                    await signOut();
                    clear();
                    router.push("/");
                  }}
                >
                  <LogOut size={18} />
                  <div>{m.system.logout}</div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
    </div>
  );
};
export default React.memo(AppLayout);

import {
  ArrowLeft,
  ChevronRight,
  FileText,
  LogOut,
  Settings2,
  UserCircle2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerProfileSettingsSection from "./CareerProfileSettingsSection";
import CareerResumeLinksSettingsSection from "./settings/CareerResumeLinksSettingsSection";

type CareerSettingsTab = "profile" | "resume" | "account";
type MobileSettingsView = "menu" | CareerSettingsTab;

const SETTINGS_TABS: Array<{
  key: CareerSettingsTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "profile", label: "프로필 설정", Icon: Settings2 },
  { key: "resume", label: "내 이력서/링크", Icon: FileText },
  { key: "account", label: "계정 관리", Icon: UserCircle2 },
];

const MENU_SNAP = "340px";
const FULL_SNAP = 0.95;
const SETTINGS_SNAP_POINTS: Array<number | string> = [MENU_SNAP, FULL_SNAP];

const AccountSection = ({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => void | Promise<void>;
}) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold text-hblack1000">계정 관리</h2>
      <p className="mt-1 text-sm text-hblack600">계정 세션을 종료합니다.</p>
    </div>

    <p className="font-geist text-sm text-hblack700">{email}</p>
    <button
      type="button"
      onClick={() => void onLogout()}
      className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-beige500 px-4 text-sm text-hblack700 transition-colors hover:border-beige900 hover:bg-beige200 hover:text-beige900"
    >
      <LogOut className="h-4 w-4" />
      로그아웃
    </button>
  </div>
);

const renderSection = (
  tab: CareerSettingsTab,
  email: string,
  onLogout: () => void | Promise<void>
) => {
  if (tab === "profile") return <CareerProfileSettingsSection />;
  if (tab === "resume") return <CareerResumeLinksSettingsSection />;
  return <AccountSection email={email} onLogout={onLogout} />;
};

const CareerSettingsModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { onLogout, user } = useCareerSidebarContext();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<CareerSettingsTab>("profile");
  const [mobileView, setMobileView] = useState<MobileSettingsView>("menu");
  const [snap, setSnap] = useState<number | string | null>(MENU_SNAP);

  const resetMobileSettings = useCallback(() => {
    setMobileView("menu");
    setSnap(MENU_SNAP);
    setActiveTab("profile");
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    resetMobileSettings();
  }, [onClose, resetMobileSettings]);

  useEffect(() => {
    if (!open) return;
    if (user) return;
    onClose();
    const timer = window.setTimeout(resetMobileSettings, 0);
    return () => window.clearTimeout(timer);
  }, [onClose, open, resetMobileSettings, user]);

  const email = user?.email ?? "로그인 중";

  if (isMobile) {
    const handleOpenChange = (nextOpen: boolean) => {
      if (!nextOpen) handleClose();
    };

    const handleSelectTab = (tab: CareerSettingsTab) => {
      setActiveTab(tab);
      setMobileView(tab);
      setSnap(FULL_SNAP);
    };

    const handleBackToMenu = () => {
      setMobileView("menu");
      setSnap(MENU_SNAP);
    };

    return (
      <DrawerPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        snapPoints={SETTINGS_SNAP_POINTS}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        fadeFromIndex={0}
        shouldScaleBackground={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <DrawerPrimitive.Content
            className="fixed inset-x-0 bottom-0 z-50 flex h-full max-h-[97svh] flex-col rounded-t-[20px] border-t border-beige900/10 bg-beige50 text-beige900 outline-none"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <DrawerPrimitive.Title className="sr-only">
              커리어 설정
            </DrawerPrimitive.Title>
            <DrawerPrimitive.Description className="sr-only">
              아래로 드래그하면 메뉴 크기로 축소되고, 위로 드래그하면 전체화면으로 확장됩니다.
            </DrawerPrimitive.Description>

            <div className="flex shrink-0 justify-center pt-3 pb-2">
              <div className="h-1.5 w-12 rounded-full bg-beige900/20" />
            </div>

            {mobileView === "menu" ? (
              <>
                <header className="flex shrink-0 items-center justify-between px-5 pb-2">
                  <h2 className="font-instrument text-[22px] leading-none text-beige900">
                    설정
                  </h2>
                  <DrawerPrimitive.Close
                    aria-label="설정 닫기"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-hblack600 transition-colors hover:bg-beige200 hover:text-beige900"
                  >
                    <X className="h-4 w-4" />
                  </DrawerPrimitive.Close>
                </header>
                <nav className="flex flex-col gap-1 overflow-y-auto px-3 pb-6 pt-2">
                  {SETTINGS_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleSelectTab(tab.key)}
                      className="flex w-full min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-hblack900 transition-colors hover:bg-beige200 active:bg-beige200"
                    >
                      <span className="flex items-center gap-3">
                        <tab.Icon className="h-5 w-5 text-hblack600" />
                        {tab.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-hblack400" />
                    </button>
                  ))}
                </nav>
              </>
            ) : (
              <>
                <header className="flex shrink-0 items-center justify-between border-b border-beige500/40 px-3 pb-2">
                  <button
                    type="button"
                    onClick={handleBackToMenu}
                    className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-lg px-2 text-sm text-hblack700 transition-colors hover:text-hblack900"
                    aria-label="설정 메뉴로 돌아가기"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    설정
                  </button>
                  <h2 className="text-[15px] font-semibold text-beige900">
                    {SETTINGS_TABS.find((t) => t.key === mobileView)?.label}
                  </h2>
                  <DrawerPrimitive.Close
                    aria-label="설정 닫기"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-hblack600 transition-colors hover:bg-beige200 hover:text-beige900"
                  >
                    <X className="h-4 w-4" />
                  </DrawerPrimitive.Close>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
                  {renderSection(mobileView, email, onLogout)}
                </div>
              </>
            )}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    );
  }

  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={handleClose}
      ariaLabel="커리어 설정"
      overlayClassName="items-start pt-14"
      panelClassName="max-w-none h-[80svh] max-h-[860px] px-0 w-[min(1040px,90vw)]"
      bodyClassName="h-full p-0"
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack100 bg-beige50 text-hblack600 transition-colors hover:border-beige900 hover:text-beige900"
    >
      <section className="h-full">
        <div className="grid h-full grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-beige500 bg-beige200 p-2">
            <nav className="mt-2 space-y-1">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-0 inline-flex items-center gap-1 text-sm text-hblack400 transition-colors hover:text-hblack900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              {SETTINGS_TABS.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={[
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-beige500 text-hblack900"
                        : "text-hblack700 hover:bg-beige200",
                    ].join(" ")}
                  >
                    <tab.Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="bg-beige50 h-full overflow-y-auto px-8 py-7">
            {renderSection(activeTab, email, onLogout)}
          </div>
        </div>
      </section>
    </TalentCareerModal>
  );
};

export default CareerSettingsModal;

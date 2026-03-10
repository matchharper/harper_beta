import {
  ArrowLeft,
  FileText,
  LogOut,
  Shield,
  UserCircle2,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerResumeLinksSettingsSection from "./settings/CareerResumeLinksSettingsSection";
import CareerVisibilitySettingsSection from "./settings/CareerVisibilitySettingsSection";

type CareerSettingsTab = "resume" | "visibility" | "account";

const SETTINGS_TABS: Array<{
  key: CareerSettingsTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "resume", label: "내 이력서/링크", Icon: FileText },
  { key: "visibility", label: "공개 여부", Icon: Shield },
  { key: "account", label: "계정 관리", Icon: UserCircle2 },
];

const CareerSettingsModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { onLogout, user } = useCareerSidebarContext();
  const [activeTab, setActiveTab] = useState<CareerSettingsTab>("resume");

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    if (user) return;
    onClose();
  }, [onClose, open, user]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <section className="relative mx-auto mt-14 h-[80%] w-[min(1040px,90vw)] overflow-hidden rounded-2xl bg-hblack000 border border-hblack200 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
        <div className="grid h-full grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-hblack200 bg-hblack100/50 p-2">
            <nav className="mt-2 space-y-1">
              <button
                type="button"
                onClick={onClose}
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
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-hblack200 text-hblack900"
                        : "text-hblack700 hover:bg-hblack100",
                    ].join(" ")}
                  >
                    <tab.Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="relative h-full overflow-y-auto px-8 py-7 bg-hblack000">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack100 bg-hblack50 text-hblack600 transition-colors hover:border-xprimary hover:text-xprimary"
              aria-label="설정 닫기"
            >
              <X className="h-4 w-4" />
            </button>

            {activeTab === "resume" ? (
              <CareerResumeLinksSettingsSection />
            ) : null}

            {activeTab === "visibility" ? (
              <CareerVisibilitySettingsSection />
            ) : null}

            {activeTab === "account" ? (
              <div className="space-y-4">
                <div className="">
                  <h2 className="text-lg font-semibold text-hblack1000">
                    계정 관리
                  </h2>
                  <p className="mt-1 text-sm text-hblack600">
                    계정 세션을 종료합니다.
                  </p>
                </div>

                <div className="rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
                  <p className="text-sm text-hblack700">
                    {user?.email ?? "로그인 중"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-hblack300 px-4 text-sm text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};

export default CareerSettingsModal;

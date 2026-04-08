import {
  ArrowLeft,
  FileText,
  LogOut,
  Settings2,
  UserCircle2,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerProfileSettingsSection from "./CareerProfileSettingsSection";
import CareerResumeLinksSettingsSection from "./settings/CareerResumeLinksSettingsSection";

type CareerSettingsTab = "profile" | "resume" | "account";

const SETTINGS_TABS: Array<{
  key: CareerSettingsTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "profile", label: "프로필 설정", Icon: Settings2 },
  { key: "resume", label: "내 이력서/링크", Icon: FileText },
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
  const [activeTab, setActiveTab] = useState<CareerSettingsTab>("profile");

  useEffect(() => {
    if (!open) return;
    if (user) return;
    onClose();
  }, [onClose, open, user]);

  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel="커리어 설정"
      overlayClassName="items-start pt-14"
      panelClassName="max-w-none h-[80vh] max-h-[860px] px-0 w-[min(1040px,90vw)]"
      bodyClassName="h-full p-0"
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack100 bg-beige50 text-hblack600 transition-colors hover:border-beige900 hover:text-beige900"
    >
      <section className="h-full">
        <div className="grid h-full grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-beige500 bg-beige200 p-2">
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

          <div className="bg-beige100 h-full overflow-y-auto px-8 py-7">
            {activeTab === "profile" ? <CareerProfileSettingsSection /> : null}
            {activeTab === "resume" ? (
              <CareerResumeLinksSettingsSection />
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

                <p className="font-geist text-sm text-hblack700">
                  {user?.email ?? "로그인 중"}
                </p>
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-beige500 hover:bg-beige200 px-4 text-sm text-hblack700 transition-colors hover:border-beige900 hover:text-beige900"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </TalentCareerModal>
  );
};

export default CareerSettingsModal;

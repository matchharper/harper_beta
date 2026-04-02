import { Loader2, SettingsIcon } from "lucide-react";
import { useState } from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import CareerHistoryPanel from "@/components/career/CareerHistoryPanel";
import CareerProfileWorkspace from "@/components/career/CareerProfileWorkspace";
import CareerWorkspaceNav, {
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { careerCx } from "@/components/career/ui/CareerPrimitives";

const CareerTopBar = ({ onOpenSettings }: { onOpenSettings: () => void }) => (
  <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between border-b border-hblack100 bg-hblack000">
    <div className="w-1/3" />
    <div className="font-halant text-hblack700">Harper</div>
    <div className="flex w-1/3 items-center justify-end px-4">
      <button
        type="button"
        onClick={onOpenSettings}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-hblack100 text-hblack400 transition-colors hover:border-hblack300 hover:text-hblack700"
        aria-label="커리어 설정 열기"
      >
        <SettingsIcon className="h-4 w-4" />
      </button>
    </div>
  </div>
);

const CareerCanvas = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <section className={careerCx("min-w-0", className)}>{children}</section>;

const CareerWorkspaceHeader = ({ title }: { title: string }) => (
  <div className="px-5 py-3">
    <h1 className="font-halant text-[28px] leading-[1] text-beige900">
      {title}
    </h1>
  </div>
);

const CareerWorkspaceContent = ({
  activeTab,
}: {
  activeTab: CareerWorkspaceTab;
}) => {
  if (activeTab === "history") {
    return (
      <CareerCanvas className="flex-1">
        <CareerWorkspaceHeader title="History" />
        <div className="px-5 py-5">
          <CareerHistoryPanel />
        </div>
      </CareerCanvas>
    );
  }

  if (activeTab === "chat") {
    return (
      <CareerCanvas className="flex min-h-[calc(100vh-86px)] flex-1 flex-col overflow-hidden">
        <CareerWorkspaceHeader title="대화" />
        <div className="min-h-0 flex-1">
          <CareerChatPanel />
        </div>
      </CareerCanvas>
    );
  }

  return (
    <CareerCanvas className="flex-1">
      <CareerWorkspaceHeader title="프로필" />
      <CareerProfileWorkspace />
    </CareerCanvas>
  );
};

export const CareerWorkspace = () => {
  const [activeTab, setActiveTab] = useState<CareerWorkspaceTab>("profile");

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 pb-8 pt-16 lg:flex-row lg:items-start">
      <CareerWorkspaceNav activeTab={activeTab} onChange={setActiveTab} />
      <div className="min-w-0 flex-1">
        <CareerWorkspaceContent activeTab={activeTab} />
      </div>
    </div>
  );
};

export const CareerLoadingState = () => (
  <main className="relative flex min-h-screen w-full items-center justify-center bg-hblack000 font-geist text-hblack900">
    <Loader2 className="h-5 w-5 animate-spin text-hblack400" />
    <span className="sr-only">커리어 페이지 로딩 중</span>
  </main>
);

const CareerWorkspaceScreen = ({
  children,
  onOpenSettings,
}: {
  children?: React.ReactNode;
  onOpenSettings: () => void;
}) => (
  <main className="relative min-h-screen w-full bg-beige100 font-geist text-beige900">
    <CareerTopBar onOpenSettings={onOpenSettings} />
    {children ?? <CareerWorkspace />}
  </main>
);

export default CareerWorkspaceScreen;

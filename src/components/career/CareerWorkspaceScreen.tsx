import { Loader2 } from "lucide-react";
import { useState } from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import CareerHistoryPanel from "@/components/career/CareerHistoryPanel";
import CareerHomePanel from "@/components/career/CareerHomePanel";
import CareerProfileWorkspace from "@/components/career/CareerProfileWorkspace";
import CareerWorkspaceNav, {
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { careerCx } from "@/components/career/ui/CareerPrimitives";

const CareerCanvas = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={careerCx("min-w-0 rounded-lg px-6", className)}>
    {children}
  </section>
);

const CareerWorkspaceHeader = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => (
  <div className="py-5">
    <h1 className="font-halant text-[28px] leading-[1] text-beige900">
      {title}
    </h1>
    {description && (
      <p className="mt-2 text-[14px] leading-6 text-beige900/50">
        {description}
      </p>
    )}
  </div>
);

const CareerWorkspaceContent = ({
  activeTab,
  onChangeTab,
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (tab: CareerWorkspaceTab) => void;
}) => {
  if (activeTab === "home") {
    return (
      <CareerCanvas>
        <CareerHomePanel
          onOpenChat={() => onChangeTab("chat")}
          onOpenProfile={() => onChangeTab("profile")}
        />
      </CareerCanvas>
    );
  }

  if (activeTab === "history") {
    return (
      <CareerCanvas>
        <CareerWorkspaceHeader
          title="History"
          description="이전 대화와 저장된 흐름을 한곳에서 확인합니다."
        />
        <div className="px-6 py-6">
          <CareerHistoryPanel />
        </div>
      </CareerCanvas>
    );
  }

  if (activeTab === "chat") {
    return (
      <CareerCanvas>
        <CareerWorkspaceHeader title="대화" />
        <div className="min-h-0 flex-1">
          <CareerChatPanel />
        </div>
      </CareerCanvas>
    );
  }

  return (
    <CareerCanvas>
      <CareerWorkspaceHeader
        title="프로필"
        description="기본 정보, 인사이트, 링크를 한 화면에서 관리합니다."
      />
      <CareerProfileWorkspace />
    </CareerCanvas>
  );
};

export const CareerWorkspace = () => {
  const [activeTab, setActiveTab] = useState<CareerWorkspaceTab>("home");

  return (
    <div className="flex min-h-screen w-full flex-col bg-beige50 lg:flex-row">
      <CareerWorkspaceNav activeTab={activeTab} onChange={setActiveTab} />
      <div className="min-w-0 flex-1">
        <div className="overflow-y-auto h-[100vh] mx-auto w-full max-w-[1380px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <CareerWorkspaceContent
            activeTab={activeTab}
            onChangeTab={setActiveTab}
          />
        </div>
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
}: {
  children?: React.ReactNode;
}) => (
  <main className="relative min-h-screen w-full bg-beige50 font-geist text-beige900">
    {children ?? <CareerWorkspace />}
  </main>
);

export default CareerWorkspaceScreen;

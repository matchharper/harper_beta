import { Loader2, Phone, PhoneOff } from "lucide-react";
import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import { CareerPrimaryButton } from "./ui/CareerPrimitives";
import HarperCircle from "@/components/call/HarperCircle";
import Timer from "@/components/call/Timer";

const VapiCallScreen = () => {
  const {
    vapiCallStatus,
    vapiCallDuration,
    vapiCallError,
    onEndVapiCall,
    onDismissVapiCall,
  } = useCareerChatPanelContext();

  if (vapiCallStatus === "connecting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <HarperCircle micLevel={0} />
        <div className="flex items-center gap-2 text-sm text-beige900/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          연결 중입니다...
        </div>
        <button
          type="button"
          onClick={onEndVapiCall}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-5 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-100"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          취소
        </button>
      </div>
    );
  }

  if (vapiCallStatus === "active" || vapiCallStatus === "ending") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <HarperCircle micLevel={0.5} />
        <Timer />
        <p className="text-sm text-beige900/50">Harper와 통화 중</p>
        <button
          type="button"
          onClick={onEndVapiCall}
          disabled={vapiCallStatus === "ending"}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          <PhoneOff className="h-4 w-4" />
          {vapiCallStatus === "ending" ? "종료 중..." : "통화 종료"}
        </button>
      </div>
    );
  }

  if (vapiCallStatus === "ended") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-beige900/10">
          <Phone className="h-6 w-6 text-beige900/60" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-beige900">
            통화가 종료되었습니다
          </p>
          <p className="mt-1 text-sm text-beige900/50">
            {Math.floor(vapiCallDuration / 60)}분 {vapiCallDuration % 60}초
          </p>
          {vapiCallError && (
            <p className="mt-2 text-sm text-red-600">{vapiCallError}</p>
          )}
          <p className="mt-3 text-xs text-beige900/40">
            통화 내용을 분석하여 인사이트를 추출하고 있습니다...
          </p>
        </div>
        <CareerPrimaryButton onClick={onDismissVapiCall} className="gap-2 px-6">
          채팅으로 돌아가기
        </CareerPrimaryButton>
      </div>
    );
  }

  return null;
};

const CareerChatPanel = () => {
  const { vapiCallStatus } = useCareerChatPanelContext();
  const isVapiCallActive = vapiCallStatus !== "idle";

  return (
    <section className="flex min-h-0 flex-1 flex-col lg:h-full">
      {isVapiCallActive ? (
        <VapiCallScreen />
      ) : (
        <>
          <CareerTimelineSection />
          <CareerComposerSection />
        </>
      )}
    </section>
  );
};

export default CareerChatPanel;

import AppLayout from "@/components/layout/app";
import { useRouter } from "next/router";
import CandidateProfileDetailPage from "./CandidateProfile";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import ChatPanel, { ChatScope } from "@/components/chat/ChatPanel";
import { useMemo, useState } from "react";
import { useCandidateDetail } from "@/hooks/useCandidateDetail";
import CandidChatPanel from "@/components/chat/CandidChatPanel";
import AddCustomModal from "@/components/Modal/AddCustomModal";
import { Loading } from "@/components/ui/loading";

export default function ProfileDetailPage() {
  const [isAddCustomModalOpen, setIsAddCustomModalOpen] = useState(false);

  const router = useRouter();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;

  const candidId =
    typeof router.query.id === "string" ? router.query.id : undefined;

  const scope = useMemo(
    () => ({ type: "candid", candidId: candidId ?? "" } as ChatScope),
    [candidId]
  );
  const { data, isLoading, error } = useCandidateDetail(userId, candidId);

  return (
    <AppLayout>
      <div className="w-full flex flex-row min-h-screen items-start justify-between">
        {
          isAddCustomModalOpen &&
          <AddCustomModal
            open={isAddCustomModalOpen}
            candidId={candidId ?? ""}
            onClose={() => setIsAddCustomModalOpen(false)}
            onConfirm={() => { }}
          />
        }
        {
          ["111fe5c4-8f66-4392-9a27-e81fb8dfa7dd", "5219cf7f-90fa-4b71-907a-6f7ad03bb837"].includes(companyUser?.user_id) && (
            <div className="absolute bottom-16 right-3 z-40">
              <button onClick={() => setIsAddCustomModalOpen(true)} className="w-12 h-12 rounded-full bg-accenta1 text-black font-medium text-sm cursor-pointer">Add</button>
            </div>)
        }
        {candidId && data && (
          <div className={`flex-shrink-0 border-r w-[30%] min-w-[390px] border-white/10`}>
            <CandidChatPanel
              title={`${data?.name ?? ""}님`}
              scope={scope}
              userId={userId}
              candidDoc={data}
              disabled={false}
            />
          </div>
        )}
        {candidId && data && (
          <CandidateProfileDetailPage
            candidId={candidId}
            data={data}
            isLoading={isLoading}
            error={error}
          />
        )}
        {(!candidId || isLoading) && (
          <Loading label="로딩중입니다" className="text-hgray600" isFullScreen={true} />
        )}
      </div>
    </AppLayout>
  );
}

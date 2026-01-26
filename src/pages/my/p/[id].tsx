import AppLayout from "@/components/layout/app";
import { useRouter } from "next/router";
import CandidateProfileDetailPage from "./CandidateProfile";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import ChatPanel, { ChatScope } from "@/components/chat/ChatPanel";
import { useCallback, useMemo } from "react";
import { useCandidateDetail } from "@/hooks/useCandidateDetail";

export default function ProfileDetailPage() {
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

  const noFunc = useCallback(async () => { }, []);

  return (
    <AppLayout>
      <div className="w-full flex flex-row min-h-screen items-start justify-between">
        {candidId && data && (
          <div className={`flex-shrink-0 border-r w-[30%] min-w-[390px] border-white/10`}>
            <ChatPanel
              title={`${data?.name ?? ""}님`}
              scope={scope}
              userId={userId}
              onSearchFromConversation={noFunc}
              candidDoc={data}
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
        {(!candidId || isLoading) && <div>로딩중입니다</div>}
      </div>
    </AppLayout>
  );
}

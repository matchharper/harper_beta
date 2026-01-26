import CandidateCard from "@/components/CandidatesList";
import React, { useMemo } from "react";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useConnectedCandidates } from "@/hooks/useBookMarkCandidates";
import PrevNextButtons from "./components/PrevNextButtons";

const ConnectedPage = () => {
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);

  const { data, isLoading, error } = useConnectedCandidates(userId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error</div>;

  return (
    <div>
      <div className="w-full space-y-2 text-white">
        {data?.items && (
          <div className="space-y-3">
            {data.items.map((c) => (
              <CandidateCard key={c.id} c={c} userId={userId} criterias={[]} />
            ))}
          </div>
        )}
        {!isLoading && data?.items?.length === 0 && (
          <div className="text-center text-hgray600">No data</div>
        )}
      </div>
      <PrevNextButtons />
    </div>
  );
};

export default ConnectedPage;

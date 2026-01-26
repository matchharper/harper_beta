import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useBookmarkedCandidates } from "@/hooks/useBookMarkCandidates";
import CandidateCard from "@/components/CandidatesList";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import PrevNextButtons from "./components/PrevNextButtons";
import CandidateTable from "@/components/CandidatesListTable";
import CandidateViews from "@/components/CandidateViews";

export default function BookmarksPage() {
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);

  const { data, isLoading, error } = useBookmarkedCandidates(userId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error</div>;

  return (
    <CandidateViews
      items={data?.items ?? []}
      userId={userId}
      queryItem={null}
      isMyList={true}
    />
  );
}

import { useQueriesHistory } from "@/hooks/useSearchHistory";
import { supabase } from "@/lib/supabase";
import React from "react";
import HistoryItem from "./HistoryItem";
import { useMessages } from "@/i18n/useMessage";

const QueryHistories = ({
  collapsed,
  userId,
  activeQueryId,
  isHoverModal = false,
}: {
  collapsed: boolean;
  userId: string;
  activeQueryId: string | null;
  isHoverModal?: boolean;
}) => {
  const { m } = useMessages();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useQueriesHistory(userId);

  const queryItems = data?.pages.flatMap((page) => page) ?? [];

  const deleteQueryItem = async (queryId: string) => {
    const { error } = await supabase
      .from("queries")
      .update({ is_deleted: true })
      .eq("query_id", queryId);

    if (error) {
      console.error("Failed to delete queryItem", error);
      return;
    }
    refetch(); // 삭제 후 리프레시
  };

  return (
    <div
      className={`flex-col gap-2 ${collapsed ? "hidden" : "flex"} ${
        isHoverModal ? "max-h-64" : "h-full"
      }`}
    >
      {queryItems.map((queryItem: any) => (
        <HistoryItem
          key={queryItem.query_id}
          queryItem={queryItem}
          onDelete={deleteQueryItem}
          collapsed={collapsed || isHoverModal}
          isActive={activeQueryId === queryItem.query_id}
        />
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="text-xs text-gray-500 py-2 hover:text-white transition-all duration-200"
        >
          {isFetchingNextPage ? "Loading..." : m.system.loadmore}
        </button>
      )}
    </div>
  );
};

export default React.memo(QueryHistories);

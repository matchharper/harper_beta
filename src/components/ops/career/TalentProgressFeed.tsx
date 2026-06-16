import { memo } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  useDeleteOpsMatchingProgress,
  useOpsMatchingProgress,
} from "@/hooks/useOpsMatching";
import { formatKst } from "./utils";

type TalentProgressFeedProps = {
  emptyLabel?: string;
  enabled?: boolean;
  roleId?: string | null;
  showRoleContext?: boolean;
  talentId: string;
};

export const TalentProgressFeed = memo(function TalentProgressFeed({
  emptyLabel = "아직 Progress가 없습니다.",
  enabled = true,
  roleId,
  showRoleContext = false,
  talentId,
}: TalentProgressFeedProps) {
  const progressQuery = useOpsMatchingProgress({
    enabled,
    roleId,
    talentId,
  });
  const deleteProgress = useDeleteOpsMatchingProgress();
  const pendingDeleteId = deleteProgress.variables?.progressId ?? null;

  if (progressQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }

  if (progressQuery.error) {
    return (
      <div className={opsTheme.errorNotice}>
        {progressQuery.error instanceof Error
          ? progressQuery.error.message
          : "Progress를 불러오지 못했습니다."}
      </div>
    );
  }

  const items = progressQuery.data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const roleContext = [item.companyName, item.roleName]
          .filter(Boolean)
          .join(" · ");
        const isDeleting =
          deleteProgress.isPending && pendingDeleteId === item.id;
        return (
          <article
            key={item.id}
            className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-3.5 py-3 text-sm text-neutral-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {showRoleContext && roleContext ? (
                  <div className="truncate text-xs font-medium text-neutral-primary">
                    {roleContext}
                  </div>
                ) : null}
                <div
                  className={cx(
                    "text-[11px] text-neutral-soft",
                    showRoleContext && roleContext && "mt-1"
                  )}
                >
                  {formatKst(item.createdAt)}
                </div>
              </div>
              <BareButton
                type="button"
                onClick={() => {
                  if (deleteProgress.isPending) return;
                  if (!window.confirm("이 Progress를 삭제할까요?")) return;
                  deleteProgress.mutate({
                    progressId: item.id,
                    roleId: item.roleId,
                    talentId: item.talentId,
                  });
                }}
                disabled={deleteProgress.isPending}
                aria-label="Progress 삭제"
                title="Progress 삭제"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-soft transition hover:bg-critical-faded hover:text-critical disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </BareButton>
            </div>
            <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-primary">
              {item.text}
            </div>
          </article>
        );
      })}
      {deleteProgress.error ? (
        <div className={opsTheme.errorNotice}>
          {deleteProgress.error instanceof Error
            ? deleteProgress.error.message
            : "Progress 삭제에 실패했습니다."}
        </div>
      ) : null}
    </div>
  );
});
